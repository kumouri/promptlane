"""Tests for tools/model_server.py: the HTTP contract with a fake backend, plus request shapes.
No network beyond loopback, no Ollama, no `claude` binary, no real OpenRouter/OpenAI call."""
from __future__ import annotations

import http.client
import io
import json
import os
import sys
import threading
import unittest
import urllib.error
from unittest import mock

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


class OpenAIBackendTests(unittest.TestCase):
    def make(self, kind="openrouter", **kw):
        return ms.OpenAIBackend(kind, "https://openrouter.ai/api/v1", "qwen/qwen3-32b", "sk-test", **kw)

    def test_build_body_openrouter_pins_provider_and_disables_reasoning(self):
        body = self.make(provider_order=["DeepInfra"]).build_body("hi")
        self.assertEqual(body["model"], "qwen/qwen3-32b")
        self.assertEqual(body["messages"], [{"role": "user", "content": "hi"}])
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertEqual(body["provider"], {"order": ["DeepInfra"], "allow_fallbacks": False})
        self.assertEqual(body["reasoning"], {"enabled": False})

    def test_build_body_think_true_omits_reasoning_override(self):
        self.assertNotIn("reasoning", self.make(think=True).build_body("hi"))

    def test_build_body_without_provider_omits_provider_key(self):
        self.assertNotIn("provider", self.make().build_body("hi"))

    def test_build_body_openai_kind_never_sends_openrouter_only_fields(self):
        b = ms.OpenAIBackend("openai", "https://api.example.com/v1", "some-model", "sk-test", provider_order=["X"])
        body = b.build_body("hi")
        self.assertNotIn("provider", body)
        self.assertNotIn("reasoning", body)

    def test_complete_returns_message_content_and_records_usage(self):
        b = self.make()
        b._post = lambda body: {
            "choices": [{"message": {"content": '{"kind": "hold"}'}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.001},
        }
        self.assertEqual(b.complete("hi"), '{"kind": "hold"}')
        info = b.describe()
        self.assertEqual(info["tokens_in"], 10)
        self.assertEqual(info["tokens_out"], 5)
        self.assertEqual(info["cost_usd"], 0.001)

    def test_complete_falls_back_to_price_table_when_usage_has_no_cost(self):
        b = self.make(price_in_per_m=1.0, price_out_per_m=2.0)
        b._post = lambda body: {
            "choices": [{"message": {"content": "x"}}],
            "usage": {"prompt_tokens": 1_000_000, "completion_tokens": 500_000},
        }
        b.complete("hi")
        self.assertAlmostEqual(b.cost_usd, 2.0)

    def test_complete_no_choices_raises(self):
        b = self.make()
        b._post = lambda body: {"choices": []}
        with self.assertRaises(RuntimeError):
            b.complete("hi")

    def test_daily_budget_refuses_once_reached(self):
        b = self.make(daily_budget_usd=0.0005)
        b._post = lambda body: {
            "choices": [{"message": {"content": "x"}}],
            "usage": {"prompt_tokens": 100, "completion_tokens": 0, "cost": 0.001},
        }
        b.complete("hi")  # pushes cumulative cost past the budget
        with self.assertRaises(RuntimeError):
            b.complete("hi")

    def test_complete_retries_on_429_then_succeeds(self):
        b = self.make(retries=2)
        calls = {"n": 0}

        def fake_post(body):
            calls["n"] += 1
            if calls["n"] < 2:
                raise urllib.error.HTTPError("url", 429, "rate limited", {}, io.BytesIO(b"slow down"))
            return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

        b._post = fake_post
        with mock.patch("model_server.time.sleep"):
            self.assertEqual(b.complete("hi"), "ok")
        self.assertEqual(calls["n"], 2)

    def test_complete_raises_after_exhausting_retries(self):
        b = self.make(retries=1)
        b._post = lambda body: (_ for _ in ()).throw(
            urllib.error.HTTPError("url", 500, "server error", {}, io.BytesIO(b"boom"))
        )
        with mock.patch("model_server.time.sleep"):
            with self.assertRaises(RuntimeError):
                b.complete("hi")

    def test_complete_does_not_retry_non_retryable_status(self):
        b = self.make(retries=3)
        calls = {"n": 0}

        def fake_post(body):
            calls["n"] += 1
            raise urllib.error.HTTPError("url", 401, "bad key", {}, io.BytesIO(b"nope"))

        b._post = fake_post
        with self.assertRaises(RuntimeError):
            b.complete("hi")
        self.assertEqual(calls["n"], 1)

    def test_describe_never_includes_the_api_key(self):
        info = self.make().describe()
        self.assertNotIn("api_key", info)
        self.assertNotIn("sk-test", json.dumps(info))
        self.assertEqual(info["base_url"], "https://openrouter.ai/api/v1")


class MakeBackendOpenRouterTests(unittest.TestCase):
    def test_missing_key_refuses_to_start_not_falls_back(self):
        env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(SystemExit) as cm:
                ms.make_backend(ms.parse_args(["--backend", "openrouter"]))
        self.assertIn("OPENROUTER_API_KEY", str(cm.exception))

    def test_openrouter_preset_defaults(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}):
            b = ms.make_backend(ms.parse_args(["--backend", "openrouter"]))
        self.assertEqual(b.model, ms.DEFAULT_OPENROUTER_MODEL)
        self.assertEqual(b.base_url, ms.DEFAULT_OPENROUTER_BASE_URL)
        self.assertEqual(b.kind, "openrouter")

    def test_openai_backend_requires_explicit_model(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            with self.assertRaises(SystemExit):
                ms.make_backend(ms.parse_args(["--backend", "openai"]))

    def test_openai_backend_uses_its_own_default_base_url_and_key_env(self):
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            b = ms.make_backend(ms.parse_args(["--backend", "openai", "--model", "gpt-x"]))
        self.assertEqual(b.base_url, ms.DEFAULT_OPENAI_BASE_URL)
        self.assertEqual(b.kind, "openai")

    def test_provider_flag_is_split_and_trimmed(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}):
            b = ms.make_backend(ms.parse_args(["--backend", "openrouter", "--provider", "DeepInfra, SiliconFlow"]))
        self.assertEqual(b.provider_order, ["DeepInfra", "SiliconFlow"])

    def test_api_key_env_flag_names_a_different_variable(self):
        with mock.patch.dict(os.environ, {"MY_KEY": "sk-test"}):
            b = ms.make_backend(ms.parse_args(["--backend", "openrouter", "--api-key-env", "MY_KEY"]))
        self.assertEqual(b.api_key, "sk-test")

    def test_concurrency_must_be_positive(self):
        with mock.patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}):
            with self.assertRaises(SystemExit):
                ms.make_backend(ms.parse_args(["--backend", "openrouter", "--concurrency", "0"]))


if __name__ == "__main__":
    unittest.main()
