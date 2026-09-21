"""Tests for tools/model_server.py: the HTTP contract with a fake backend, plus request shapes.
No network beyond loopback, no Ollama, no `claude` binary."""
from __future__ import annotations

import http.client
import json
import os
import sys
import threading
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import model_server as ms  # noqa: E402


class FakeBackend(ms.Backend):
    kind = "fake"
    model = "fake-1"

    def __init__(self):
        self.prompts = []
        self.fail_with = None

    def complete(self, prompt):
        self.prompts.append(prompt)
        if self.fail_with:
            raise self.fail_with
        return 'sure!\n```json\n{"kind": "attack", "target": "mn-1"}\n```'


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = FakeBackend()
        cls.server = ms.serve(cls.backend, "127.0.0.1", 0)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.backend.fail_with = None
        self.backend.prompts.clear()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        data = None if body is None else body.encode("utf-8")
        conn.request(method, path, body=data, headers=headers or {"Content-Type": "application/json"})
        resp = conn.getresponse()
        raw = resp.read()
        conn.close()
        return resp, raw

    def test_post_returns_reply_from_backend(self):
        resp, raw = self.request("POST", "/", json.dumps({"prompt": "hello pilot"}))
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader("Content-Type"), "application/json")
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "*")
        payload = json.loads(raw)
        self.assertIn('{"kind": "attack"', payload["reply"])
        self.assertEqual(self.backend.prompts, ["hello pilot"])

    def test_post_any_path_is_accepted(self):
        resp, raw = self.request("POST", "/pilot", json.dumps({"prompt": "x"}))
        self.assertEqual(resp.status, 200)
        self.assertIn("reply", json.loads(raw))

    def test_malformed_json_is_400(self):
        resp, raw = self.request("POST", "/", "{not json")
        self.assertEqual(resp.status, 400)
        self.assertIn("bad request", json.loads(raw)["error"])
        self.assertEqual(self.backend.prompts, [])

    def test_missing_prompt_is_400(self):
        resp, _ = self.request("POST", "/", json.dumps({"nope": 1}))
        self.assertEqual(resp.status, 400)
        resp, _ = self.request("POST", "/", json.dumps({"prompt": 42}))
        self.assertEqual(resp.status, 400)

    def test_backend_failure_is_502_with_error_body(self):
        self.backend.fail_with = RuntimeError("model on fire")
        resp, raw = self.request("POST", "/", json.dumps({"prompt": "x"}))
        self.assertEqual(resp.status, 502)
        self.assertEqual(json.loads(raw)["error"], "model on fire")

    def test_health_reports_backend_and_counts(self):
        self.request("POST", "/", json.dumps({"prompt": "count me"}))
        resp, raw = self.request("GET", "/health")
        self.assertEqual(resp.status, 200)
        payload = json.loads(raw)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["backend"], "fake")
        self.assertEqual(payload["model"], "fake-1")
        self.assertGreaterEqual(payload["requests"], 1)
        self.assertIn("avg_seconds", payload)

    def test_options_preflight_has_cors_headers(self):
        resp, _ = self.request("OPTIONS", "/", headers={"Origin": "http://localhost:5173"})
        self.assertEqual(resp.status, 204)
        self.assertEqual(resp.getheader("Access-Control-Allow-Origin"), "*")
        self.assertIn("POST", resp.getheader("Access-Control-Allow-Methods"))

    def test_unknown_get_is_404(self):
        resp, _ = self.request("GET", "/nope")
        self.assertEqual(resp.status, 404)


class BackendShapeTests(unittest.TestCase):
    def test_ollama_request_shape(self):
        b = ms.OllamaBackend("http://127.0.0.1:11434", "qwen3.5:9b", temperature=0.1, max_tokens=99)
        body = b.build_request("p")
        self.assertEqual(body["model"], "qwen3.5:9b")
        self.assertEqual(body["prompt"], "p")
        self.assertFalse(body["stream"])
        self.assertFalse(body["think"])
        self.assertEqual(body["options"], {"temperature": 0.1, "num_predict": 99})
        self.assertNotIn("think", b.build_request("p", with_think=False))

    def test_ollama_url_resolution(self):
        self.assertEqual(ms.resolve_ollama_url("http://a:1/"), "http://a:1")
        self.assertEqual(ms.resolve_ollama_url(None, {"OLLAMA_HOST": "127.0.0.1:11999"}), "http://127.0.0.1:11999")
        self.assertEqual(ms.resolve_ollama_url(None, {"OLLAMA_HOST": "https://x.y"}), "https://x.y")
        self.assertEqual(ms.resolve_ollama_url(None, {}), ms.DEFAULT_OLLAMA_URL)

    def test_ollama_describe_records_model_and_url(self):
        info = ms.OllamaBackend("http://h:1", "m").describe()
        self.assertEqual(info["backend"], "ollama")
        self.assertEqual(info["model"], "m")
        self.assertEqual(info["url"], "http://h:1")

    def test_claude_command_uses_print_mode_and_model(self):
        cmd = ms.ClaudeBackend("claude-haiku-4-5-20251001", executable="claude").command()
        self.assertEqual(cmd, ["claude", "-p", "--model", "claude-haiku-4-5-20251001", "--output-format", "text"])
        self.assertNotIn("--api-key", " ".join(cmd))

    def test_echo_backend_holds(self):
        self.assertEqual(json.loads(ms.EchoBackend().complete("anything")), {"kind": "hold"})

    def test_cli_defaults(self):
        args = ms.parse_args([])
        self.assertEqual(args.backend, "ollama")
        self.assertEqual(args.port, ms.DEFAULT_PORT)
        self.assertIsNone(args.model)
        self.assertEqual(ms.make_backend(args).model, ms.DEFAULT_OLLAMA_MODEL)
        self.assertEqual(ms.make_backend(ms.parse_args(["--backend", "claude"])).model, ms.DEFAULT_CLAUDE_MODEL)
        self.assertIsInstance(ms.make_backend(ms.parse_args(["--backend", "echo"])), ms.EchoBackend)


if __name__ == "__main__":
    unittest.main()
