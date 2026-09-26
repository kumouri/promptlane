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
            self.assertEqual(body["options"], {"temperature": 0.2, "num_predict": 1800})
            self.assertEqual((b.usage.prompt_tokens, b.usage.completion_tokens, b.usage.cost_usd), (900, 300, 0.0))
        finally:
            fake.close()

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


class BudgetTests(unittest.TestCase):
    def test_refuses_before_calling_and_counts_actual_usage(self):
        budget = L.TokenBudget(5000)
        b = L.ScriptedBackend(["x" * 400], budget=budget, max_tokens=1000)
        b.generate("p" * 400)  # worst case 100 + 1000 fits; actual 100 + 100
        self.assertEqual(budget.spent, 200)
        for _ in range(3):
            b.generate("p" * 400)
        self.assertEqual(budget.spent, 800)
        big = L.ScriptedBackend(["x"], budget=budget, max_tokens=4500)
        with self.assertRaises(L.BudgetExceeded):
            big.generate("p")
        self.assertEqual(big.usage.calls, 0)

    def test_uncapped(self):
        b = L.ScriptedBackend(["x"], budget=L.TokenBudget(None))
        for _ in range(5):
            b.generate("p" * 10_000)
        self.assertEqual(b.usage.calls, 5)


if __name__ == "__main__":
    unittest.main()
