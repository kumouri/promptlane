"""Tests for tools/jev/llm_backends.py against a local fake HTTP server -- no real model, no key."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import llm_backends as L  # noqa: E402


class _Fake:
    def __init__(self, reply: dict, status: int = 200):
        self.reply, self.status, self.requests = reply, status, []
        fake = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                fake.requests.append((self.path, dict(self.headers), body))
                data = json.dumps(fake.reply).encode()
                self.send_response(fake.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class OpenRouterTests(unittest.TestCase):
    def test_body_usage_and_cost(self):
        fake = _Fake({"choices": [{"message": {"content": "{\"rules\": []}"}}], "usage": {"prompt_tokens": 1000, "completion_tokens": 200, "cost": 0.00013}})
        try:
            b = L.OpenRouterBackend("sk-test", base_url=fake.url)
            self.assertEqual(b.generate("hello"), "{\"rules\": []}")
            path, headers, body = fake.requests[0]
            self.assertEqual(path, "/chat/completions")
            self.assertEqual(headers["Authorization"], "Bearer sk-test")
            self.assertEqual(body["model"], "qwen/qwen3.5-9b")
            self.assertEqual(body["reasoning"], {"enabled": False})
            self.assertEqual(body["temperature"], 0.2)
            self.assertNotIn("max_tokens", body)  # no reply cap: the provider stops at the context window
            self.assertEqual(b.usage.total_tokens, 1200)
            self.assertAlmostEqual(b.usage.cost_usd, 0.00013)
        finally:
            fake.close()

    def test_cost_falls_back_to_price_table(self):
        fake = _Fake({"choices": [{"message": {"content": "x"}}], "usage": {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}})
        try:
            b = L.OpenRouterBackend("k", base_url=fake.url)
            b.generate("p")
            self.assertAlmostEqual(b.usage.cost_usd, 0.25)
        finally:
            fake.close()

    def test_http_error_is_a_backend_error_without_the_key(self):
        fake = _Fake({"error": {"message": "bad key"}}, status=401)
        try:
            b = L.OpenRouterBackend("sk-secret-value", base_url=fake.url)
            with self.assertRaises(L.BackendError) as cm:
                b.generate("p")
            self.assertIn("401", str(cm.exception))
            self.assertNotIn("sk-secret-value", str(cm.exception))
        finally:
            fake.close()

    def test_missing_key_refused_up_front(self):
        with self.assertRaises(L.BackendError):
            L.OpenRouterBackend("")

    def test_vocab1_sends_no_cap_either(self):
        self.assertFalse(hasattr(L, "VOCAB1_MAX_COMPLETION_TOKENS"))
        fake = _Fake({"choices": [{"message": {"content": "x"}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}})
        try:
            L.OpenRouterBackend("k", base_url=fake.url).generate("p")  # what compile.py builds for a vocab-1 compile too
            self.assertNotIn("max_tokens", fake.requests[0][2])
        finally:
            fake.close()


class OllamaTests(unittest.TestCase):
    def test_body_and_token_counts(self):
        fake = _Fake({"response": "{}", "prompt_eval_count": 900, "eval_count": 300})
        try:
            b = L.OllamaBackend(url=fake.url)
            self.assertEqual(b.generate("hi"), "{}")
            path, _, body = fake.requests[0]
            self.assertEqual(path, "/api/generate")
            self.assertEqual(body["model"], "qwen3.5:9b")
            self.assertFalse(body["think"])
            self.assertEqual(body["options"], {"temperature": 0.2})
            self.assertNotIn("shift", body)  # a startup flag in Ollama 0.35: flipping it restarts the shared runner
            self.assertIs(body["truncate"], False)
            self.assertEqual((b.usage.prompt_tokens, b.usage.completion_tokens, b.usage.cost_usd), (900, 300, 0.0))
        finally:
            fake.close()

    def test_vocab1_body_is_the_recorded_one_less_its_cap(self):
        """The body vocab-1's recorded runs sent, byte for byte, with its one cap field gone: same keys, same
        order, no truncate, no num_predict (Ceryce, 2026-10-02 17:59: no token caps at all)."""
        fake = _Fake({"response": "{}", "prompt_eval_count": 1, "eval_count": 1})
        try:
            L.OllamaBackend(url=fake.url, vocab1=True).generate("hi")
            body = fake.requests[0][2]
            recorded = {"model": "qwen3.5:9b", "prompt": "hi", "stream": False, "keep_alive": "30m",
                        "options": {"temperature": 0.2, "num_predict": 1800}, "think": False}
            del recorded["options"]["num_predict"]  # the one field that changes
            self.assertEqual(json.dumps(body), json.dumps(recorded))
            self.assertEqual(json.dumps(L.ollama_body("qwen3.5:9b", "hi", None, vocab1=True)), json.dumps(recorded))
        finally:
            fake.close()

    def test_default_timeout_fills_the_window(self):
        self.assertEqual(L.OllamaBackend().timeout, L.CALL_TIMEOUT_SEC)
        self.assertGreaterEqual(L.CALL_TIMEOUT_SEC, 32_768 / 85)  # the host's whole window at its measured speed

    def test_host_without_scheme(self):
        self.assertEqual(L.resolve_ollama_url("127.0.0.1:11999"), "http://127.0.0.1:11999")


class ClaudeCliTests(unittest.TestCase):
    def _fake_run(self, stdout: str, returncode: int = 0, stderr: str = ""):
        return mock.patch.object(
            L.subprocess, "run",
            return_value=subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr),
        )

    def test_scrubs_anthropic_api_key_and_claude_code_vars(self):
        captured = {}

        def fake_run(cmd, input, capture_output, text, encoding, env, timeout, shell):  # noqa: A002
            captured["env"] = env
            captured["cmd"] = cmd
            return subprocess.CompletedProcess(args=cmd, returncode=0, stdout=json.dumps({"result": "{}", "usage": {"input_tokens": 10, "output_tokens": 5}, "total_cost_usd": 0.001}), stderr="")

        with mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "sk-should-never-be-seen", "CLAUDECODE": "1"}):
            with mock.patch.object(L.subprocess, "run", side_effect=fake_run):
                b = L.ClaudeCliBackend(model="claude-haiku-4-5-20251001", executable="claude")
                text = b.generate("translate this")
        self.assertEqual(text, "{}")
        self.assertNotIn("ANTHROPIC_API_KEY", captured["env"])
        self.assertNotIn("CLAUDECODE", captured["env"])
        self.assertIn("--model", captured["cmd"])
        self.assertIn("claude-haiku-4-5-20251001", captured["cmd"])
        self.assertIn("--tools", captured["cmd"])
        self.assertIn("--effort", captured["cmd"])
        self.assertIn("low", captured["cmd"])
        self.assertEqual((b.usage.prompt_tokens, b.usage.completion_tokens), (10, 5))
        self.assertAlmostEqual(b.usage.cost_usd, 0.001)

    def test_effort_none_omits_the_flag(self):
        with self._fake_run(stdout=json.dumps({"result": "{}"})) as patched:
            b = L.ClaudeCliBackend(executable="claude", effort=None)
            b.generate("p")
            cmd = patched.call_args.args[0]
        self.assertNotIn("--effort", cmd)

    def test_nonzero_exit_is_a_backend_error(self):
        with self._fake_run(stdout="", returncode=1, stderr="boom"):
            b = L.ClaudeCliBackend(executable="claude")
            with self.assertRaises(L.BackendError):
                b.generate("p")

    def test_is_error_payload_is_a_backend_error(self):
        with self._fake_run(stdout=json.dumps({"is_error": True, "result": "rate limited"})):
            b = L.ClaudeCliBackend(executable="claude")
            with self.assertRaises(L.BackendError):
                b.generate("p")

    def test_non_json_stdout_falls_back_to_raw_text(self):
        with self._fake_run(stdout="plain text reply, not json"):
            b = L.ClaudeCliBackend(executable="claude")
            self.assertEqual(b.generate("p"), "plain text reply, not json")

    def test_timeout_is_a_backend_error(self):
        with mock.patch.object(L.subprocess, "run", side_effect=subprocess.TimeoutExpired(cmd=["claude"], timeout=1)):
            b = L.ClaudeCliBackend(executable="claude", timeout=1)
            with self.assertRaises(L.BackendError):
                b.generate("p")


class NoCapTests(unittest.TestCase):
    def test_no_run_level_token_budget(self):
        self.assertFalse(hasattr(L, "TokenBudget"))
        self.assertFalse(hasattr(L, "BudgetExceeded"))
        b = L.ScriptedBackend(["x" * 400_000])
        for _ in range(5):
            b.generate("p" * 400_000)  # 1M tokens a call: nothing refuses it
        self.assertEqual(b.usage.calls, 5)
        self.assertEqual(b.usage.total_tokens, 5 * 200_000)

    def test_make_backend_sends_no_cap_under_any_vocabulary(self):
        self.assertIsNone(L.make_backend("ollama").max_tokens)
        vocab1 = L.make_backend("ollama", vocab1=True)
        self.assertIsNone(vocab1.max_tokens)
        self.assertTrue(vocab1.vocab1)


if __name__ == "__main__":
    unittest.main()
