"""Tests for tools/jev/llm_backends.py against a local fake HTTP server -- no real model, no key."""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

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
