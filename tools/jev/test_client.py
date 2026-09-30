"""Tests for tools/jev/client.py: the systemone wire shape, the key-refusal posture (mirrors
tools/model_server.py::resolve_api_key), the Cloudflare Workers AI backend's request/unwrap shape
and token resolution, and the stub client's plumbing. No network calls -- urlopen is mocked."""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import client as C  # noqa: E402
import rules as R  # noqa: E402


def ws(**overrides):
    base = dict(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
    base.update(overrides)
    return R.Worksheet(**base)


class ResolveApiKeyTests(unittest.TestCase):
    def setUp(self):
        # Never read this host's real registry: Ceryce's key is a live User variable here.
        patcher = mock.patch("client._windows_user_env", return_value=None)
        self.user_env = patcher.start()
        self.addCleanup(patcher.stop)

    def test_refuses_clearly_when_unset(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit) as ctx:
                C.resolve_api_key("TYPESAFE_API_KEY")
        self.assertIn("TYPESAFE_API_KEY", str(ctx.exception))
        self.assertIn("dry-run", str(ctx.exception))

    def test_default_names_promptlanes_variable_first_then_the_sdks(self):
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": "ours", "TYPESAFE_API_KEY": "sdk"}, clear=True):
            self.assertEqual(C.resolve_api_key(), "ours")
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "sdk"}, clear=True):
            self.assertEqual(C.resolve_api_key(), "sdk")
        with mock.patch.dict(os.environ, {}, clear=True), self.assertRaises(SystemExit) as ctx:
            C.resolve_api_key()
        self.assertIn("PROMPTLANE_JEV_API_KEY", str(ctx.exception))

    def test_falls_back_to_the_windows_user_scope(self):
        self.user_env.side_effect = lambda name: "from-registry" if name == "PROMPTLANE_JEV_API_KEY" else None
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(C.resolve_api_key(), "from-registry")

    def test_process_env_beats_the_registry(self):
        self.user_env.return_value = "from-registry"
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": "from-env"}, clear=True):
            self.assertEqual(C.resolve_api_key(), "from-env")

    def test_never_echoes_the_key_value(self):
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "sk-super-secret-value"}, clear=True):
            key = C.resolve_api_key("TYPESAFE_API_KEY")
        self.assertEqual(key, "sk-super-secret-value")

    def test_reads_a_custom_env_var_name(self):
        with mock.patch.dict(os.environ, {"JEV_API_KEY": "abc"}, clear=True):
            self.assertEqual(C.resolve_api_key("JEV_API_KEY"), "abc")


class BuildRequestBodyTests(unittest.TestCase):
    def test_shape_matches_docs_typesafe_ai(self):
        bound = R.bind_questions("keytar", ws(hp=50))
        body = C.build_request_body("a state paragraph", bound, model="jev-test")
        self.assertEqual(body["state"], "a state paragraph")
        self.assertEqual(body["model"], "jev-test")
        self.assertEqual(set(body["questions"].keys()), {q.id for q in bound})
        for qid, q in body["questions"].items():
            self.assertEqual(q["type"], "noul")
            self.assertIn("instructions", q)
            self.assertIn("criteria", q)
        # no harness-only bookkeeping (rule_number, ground_truth_value) leaks into the wire body
        for q in body["questions"].values():
            self.assertEqual(set(q.keys()), {"type", "instructions", "criteria"})


class TokenAndCostTests(unittest.TestCase):
    def test_estimate_tokens_is_roughly_chars_over_four(self):
        self.assertEqual(C.estimate_tokens(400), 100)
        self.assertEqual(C.estimate_tokens(1), 1)  # never zero

    def test_estimate_request_tokens_counts_state_instructions_and_criteria(self):
        bound = R.bind_questions("keytar", ws())
        state = "x" * 400
        with_criteria = C.estimate_request_tokens(state, bound)
        instructions_chars = sum(len(q.instructions) for q in bound)
        # every question here carries non-empty criteria, so counting it must add tokens beyond
        # state + instructions alone
        without_criteria = C.estimate_tokens(len(state) + instructions_chars)
        self.assertGreater(with_criteria, without_criteria)

    def test_estimate_cost_uses_published_price(self):
        cost = C.estimate_cost_usd(1_000_000)
        self.assertAlmostEqual(cost, 0.042)

    def test_output_is_free(self):
        self.assertEqual(C.PRICE_OUT_PER_M, 0.0)


class StubSystemOneClientTests(unittest.TestCase):
    def test_answers_every_question_with_a_noul(self):
        bound = R.bind_questions("drums", ws(hp=50, tower="tw-1", wave=0))
        stub = C.StubSystemOneClient(error_rate=0.0, seed=1)
        response = stub.ask("state text", bound)
        self.assertEqual(set(response["answers"].keys()), {q.id for q in bound})
        for cell in response["answers"].values():
            self.assertIn("noul", cell)
            self.assertGreaterEqual(cell["noul"], 0.0)
            self.assertLessEqual(cell["noul"], 1.0)
        self.assertIn("input_tokens", response["usage"])
        self.assertEqual(response["usage"]["output_tokens"], 0)

    def test_zero_error_rate_always_agrees_with_ground_truth(self):
        bound = R.bind_questions("keytar", ws(hp=50, tower="tw-1", wave=0, foe="bb-1", cd=0.0))
        stub = C.StubSystemOneClient(error_rate=0.0, seed=1)
        response = stub.ask("state text", bound)
        for q in bound:
            answered = response["answers"][q.id]["noul"] > 0.5
            self.assertEqual(answered, q.ground_truth_value)

    def test_is_deterministic_for_a_fixed_seed(self):
        bound = R.bind_questions("violin", ws(hp=40))
        first = C.StubSystemOneClient(error_rate=0.3, seed=42).ask("s", bound)
        second = C.StubSystemOneClient(error_rate=0.3, seed=42).ask("s", bound)
        self.assertEqual(first["answers"], second["answers"])


# The exact envelope verified working 2026-09-23 12:27 CT against account
# fd8ba3abbeadc6dcca7774a1a4a9a8d0 (see client.py's module docstring) -- the canned response every
# unwrap/ask test below builds on.
CANNED_WORKERS_AI_RESPONSE = {
    "result": {
        "state": "Completed",
        "result": {
            "model": "jev-1.13.0",
            "answers": {"q1_low_hp_recall": {"noul": 0.05}},
            "usage": {"input_tokens": 123, "output_tokens": 0},
        },
        "gatewayMetadata": {},
    },
    "success": True,
    "errors": [],
    "messages": [],
}


class BuildWorkersAiBodyTests(unittest.TestCase):
    def test_shape_has_model_at_top_level_and_input_nested(self):
        bound = R.bind_questions("keytar", ws(hp=50))
        body = C.build_workers_ai_body("a state paragraph", bound, model="typesafe/jev")
        self.assertEqual(body["model"], "typesafe/jev")
        self.assertEqual(body["input"]["state"], "a state paragraph")
        self.assertEqual(set(body["input"]["questions"].keys()), {q.id for q in bound})
        self.assertNotIn("model", body["input"])
        for q in body["input"]["questions"].values():
            self.assertEqual(set(q.keys()), {"type", "instructions", "criteria"})

    def test_defaults_to_the_workers_ai_model_id(self):
        bound = R.bind_questions("keytar", ws())
        body = C.build_workers_ai_body("s", bound)
        self.assertEqual(body["model"], "typesafe/jev")

    def test_state_may_be_a_structured_object(self):
        bound = R.bind_questions("keytar", ws())
        body = C.build_workers_ai_body({"hp": 48, "wave": 1}, bound)
        self.assertEqual(body["input"]["state"], {"hp": 48, "wave": 1})


class UnwrapWorkersAiResponseTests(unittest.TestCase):
    def test_unwraps_result_result(self):
        unwrapped = C.unwrap_workers_ai_response(CANNED_WORKERS_AI_RESPONSE)
        self.assertEqual(unwrapped["model"], "jev-1.13.0")
        self.assertEqual(unwrapped["answers"]["q1_low_hp_recall"]["noul"], 0.05)
        self.assertEqual(unwrapped["usage"]["input_tokens"], 123)

    def test_raises_on_success_false(self):
        payload = {"success": False, "errors": [{"code": 2021, "message": "no balance"}], "result": None}
        with self.assertRaises(C.SystemOneError) as ctx:
            C.unwrap_workers_ai_response(payload)
        self.assertIn("2021", str(ctx.exception))

    def test_raises_when_result_result_is_missing(self):
        payload = {"success": True, "result": {"state": "Completed"}}
        with self.assertRaises(C.SystemOneError):
            C.unwrap_workers_ai_response(payload)


class WorkersAiClientAskTests(unittest.TestCase):
    def _mock_response(self, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        cm = mock.MagicMock()
        cm.__enter__.return_value = io.BytesIO(body)
        cm.__exit__.return_value = False
        return cm

    def test_ask_sends_bearer_auth_and_returns_the_unwrapped_body(self):
        bound = R.bind_questions("keytar", ws(hp=50))
        client = C.WorkersAIClient(api_token="cf-test-token", account_id="acct123", model="typesafe/jev")
        with mock.patch("client.urllib.request.urlopen", return_value=self._mock_response(CANNED_WORKERS_AI_RESPONSE)) as mock_open:
            result = client.ask("a state paragraph", bound)
        self.assertEqual(result["model"], "jev-1.13.0")
        sent_req = mock_open.call_args[0][0]
        self.assertEqual(sent_req.full_url, "https://api.cloudflare.com/client/v4/accounts/acct123/ai/run")
        self.assertEqual(sent_req.get_header("Authorization"), "Bearer cf-test-token")
        sent_body = json.loads(sent_req.data.decode("utf-8"))
        self.assertEqual(sent_body["model"], "typesafe/jev")
        self.assertEqual(sent_body["input"]["state"], "a state paragraph")

    def test_ask_raises_systemoneerror_on_http_error(self):
        bound = R.bind_questions("keytar", ws())
        client = C.WorkersAIClient(api_token="cf-test-token")
        err = urllib.error.HTTPError(
            url=client.url, code=402, msg="Payment Required",
            hdrs=None, fp=io.BytesIO(b'{"success":false,"errors":[{"code":2021}]}'),
        )
        self.addCleanup(err.close)
        with mock.patch("client.urllib.request.urlopen", side_effect=err):
            with self.assertRaises(C.SystemOneError) as ctx:
                client.ask("state", bound)
        self.assertIn("402", str(ctx.exception))

    def test_ask_retries_a_429_and_then_succeeds(self):
        bound = R.bind_questions("keytar", ws())
        client = C.WorkersAIClient(api_token="cf-test-token")
        rate_limited = urllib.error.HTTPError(
            url=client.url, code=429, msg="Too Many Requests", hdrs=None, fp=io.BytesIO(b"{}"),
        )
        self.addCleanup(rate_limited.close)
        with mock.patch(
            "client.urllib.request.urlopen",
            side_effect=[rate_limited, self._mock_response(CANNED_WORKERS_AI_RESPONSE)],
        ), mock.patch("client.time.sleep"):
            result = client.ask("state", bound)
        self.assertEqual(result["model"], "jev-1.13.0")

    def test_ask_retries_a_bare_timeouterror_and_then_succeeds(self):
        """A read timeout during getresponse() raises a bare TimeoutError, not URLError -- this is
        what actually happened live 2026-09-23 and killed an unguarded run; locking in that it's
        now retried instead of propagating."""
        bound = R.bind_questions("keytar", ws())
        client = C.WorkersAIClient(api_token="cf-test-token")
        with mock.patch(
            "client.urllib.request.urlopen",
            side_effect=[TimeoutError("The read operation timed out"), self._mock_response(CANNED_WORKERS_AI_RESPONSE)],
        ), mock.patch("client.time.sleep"):
            result = client.ask("state", bound)
        self.assertEqual(result["model"], "jev-1.13.0")

    def test_ask_gives_up_after_max_retries(self):
        bound = R.bind_questions("keytar", ws())
        client = C.WorkersAIClient(api_token="cf-test-token")
        with mock.patch(
            "client.urllib.request.urlopen", side_effect=TimeoutError("still timing out"),
        ), mock.patch("client.time.sleep"):
            with self.assertRaises(C.SystemOneError) as ctx:
                client.ask("state", bound)
        self.assertIn("workers-ai request failed", str(ctx.exception))


# What TypeSafe's own endpoint answered live, 2026-09-30 (runs/jev-backend-parity-2026-09-30.md).
CANNED_TYPESAFE_RESPONSE = {
    "model": "jev-1.13.0",
    "answers": {"q1_low_hp_recall": {"type": "noul", "noul": 0.98}},
    "usage": {"input_tokens": 322, "output_tokens": 21},
}
SECRET = "sk-live-must-never-leak-0123456789"


class SystemOneClientTests(unittest.TestCase):
    """`--jev-backend typesafe`: TypeSafe's own `/v1/systemone`. Network mocked."""

    def _ok(self, payload: dict = CANNED_TYPESAFE_RESPONSE):
        cm = mock.MagicMock()
        cm.__enter__.return_value = io.BytesIO(json.dumps(payload).encode("utf-8"))
        cm.__exit__.return_value = False
        return cm

    def _http_error(self, code: int, body: bytes = b"{}", headers: dict | None = None):
        err = urllib.error.HTTPError(url=C.API_URL, code=code, msg="x", hdrs=headers or {}, fp=io.BytesIO(body))
        self.addCleanup(err.close)
        return err

    def test_ask_posts_the_documented_shape_with_bearer_auth(self):
        bound = R.bind_questions("keytar", ws(hp=50))
        client = C.SystemOneClient(SECRET)
        with mock.patch("client.urllib.request.urlopen", return_value=self._ok()) as mock_open:
            result = client.ask("a state paragraph", bound)
        self.assertEqual(result, CANNED_TYPESAFE_RESPONSE)  # no envelope: the same shape Workers AI unwraps to
        req = mock_open.call_args[0][0]
        self.assertEqual(req.full_url, "https://api.typesafe.ai/v1/systemone")
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(req.get_header("Authorization"), f"Bearer {SECRET}")
        sent = json.loads(req.data.decode("utf-8"))
        self.assertEqual(sent, C.build_request_body("a state paragraph", bound, "jev-latest"))

    def test_529_overloaded_and_5xx_are_retried_like_typesafes_sdk(self):
        client = C.SystemOneClient(SECRET)
        side = [self._http_error(529), self._http_error(503), self._ok()]
        with mock.patch("client.urllib.request.urlopen", side_effect=side), mock.patch("client.time.sleep") as sleep:
            self.assertEqual(client.ask("s", R.bind_questions("keytar", ws()))["model"], "jev-1.13.0")
        self.assertEqual(sleep.call_count, 2)

    def test_retry_after_ms_is_honored(self):
        client = C.SystemOneClient(SECRET)
        side = [self._http_error(429, headers={"retry-after-ms": "250"}), self._ok()]
        with mock.patch("client.urllib.request.urlopen", side_effect=side), mock.patch("client.time.sleep") as sleep:
            client.ask("s", R.bind_questions("keytar", ws()))
        sleep.assert_called_once_with(0.25)

    def test_401_is_not_retried_and_never_carries_the_key(self):
        client = C.SystemOneClient(SECRET)
        echoed = json.dumps({"error": f"invalid key {SECRET}"}).encode()
        with mock.patch("client.urllib.request.urlopen", side_effect=[self._http_error(401, echoed)]) as mock_open, \
                mock.patch("client.time.sleep"):
            with self.assertRaises(C.SystemOneError) as ctx:
                client.ask("s", R.bind_questions("keytar", ws()))
        self.assertEqual(mock_open.call_count, 1)
        self.assertEqual(ctx.exception.status, 401)
        self.assertNotIn(SECRET, str(ctx.exception))
        self.assertIn("[REDACTED]", str(ctx.exception))
        self.assertIsNone(ctx.exception.__cause__)
        self.assertTrue(ctx.exception.__suppress_context__)

    def test_repr_and_status_leave_the_key_out(self):
        client = C.SystemOneClient(SECRET)
        self.assertNotIn(SECRET, repr(client))
        self.assertNotIn(SECRET, json.dumps(client.status()))
        self.assertEqual(client.status()["jev_backend"], "typesafe")

    def test_workers_ai_still_does_not_retry_a_500(self):
        """The retry widening is typesafe-only: Workers AI's behavior is unchanged."""
        client = C.WorkersAIClient(api_token="cf-test-token")
        err = urllib.error.HTTPError(url=client.url, code=500, msg="x", hdrs=None, fp=io.BytesIO(b"{}"))
        self.addCleanup(err.close)
        with mock.patch("client.urllib.request.urlopen", side_effect=[err]) as mock_open, mock.patch("client.time.sleep"):
            with self.assertRaises(C.SystemOneError):
                client.ask("s", R.bind_questions("keytar", ws()))
        self.assertEqual(mock_open.call_count, 1)


class JevBackendSelectionTests(unittest.TestCase):
    def _parse(self, argv):
        import argparse
        p = argparse.ArgumentParser()
        C.add_jev_backend_args(p)
        return p.parse_args(argv)

    def test_default_is_typesafe_with_the_fallback_on(self):
        """Ceryce's ruling 2026-09-30 08:34 CT: typesafe by default, auto-fallback to Workers AI."""
        self.assertEqual(C.DEFAULT_JEV_BACKEND, "typesafe")
        args = self._parse([])
        self.assertEqual((args.jev_backend, args.jev_fallback), ("typesafe", True))
        self.assertEqual(C.jev_client_options(args), {"fallback": True, "fallback_cooldown_sec": C.DEFAULT_FALLBACK_COOLDOWN_SEC})
        self.assertEqual(C.jev_client_options(self._parse(["--no-jev-fallback", "--jev-fallback-cooldown-sec", "4"])),
                         {"fallback": False, "fallback_cooldown_sec": 4.0})

    def test_backend_is_an_alias(self):
        self.assertEqual(self._parse(["--backend", "typesafe"]).jev_backend, "typesafe")
        self.assertEqual(self._parse(["--jev-backend", "typesafe"]).jev_backend, "typesafe")

    def test_typesafe_without_the_fallback_needs_no_token_provider(self):
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": SECRET}, clear=True), \
                mock.patch("client.resolve_workers_ai_token_provider") as provider:
            client = C.make_jev_client("typesafe", timeout=7, model="jev-preview", fallback=False)
        provider.assert_not_called()
        self.assertIsInstance(client, C.SystemOneClient)
        self.assertEqual((client.model, client.timeout), ("jev-preview", 7))

    def test_typesafe_gets_workers_ai_behind_it_on_workers_ais_own_model_id(self):
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": SECRET}, clear=True), \
                mock.patch("client.resolve_workers_ai_token_provider", return_value=C.StaticToken("t")) as provider:
            client = C.make_jev_client("typesafe", timeout=7, model="jev-preview", refresh_margin_sec=600, fallback_cooldown_sec=3)
        provider.assert_called_once_with(margin_sec=600)
        self.assertIsInstance(client, C.FallbackJevClient)
        self.assertEqual((client.model, client.timeout, client.deadline_sec, client.cooldown_sec), ("jev-preview", 7, 7, 3))
        self.assertEqual((client.fallback.model, client.fallback.timeout), (C.WORKERS_AI_MODEL, 7))
        self.assertEqual(client.status()["jev_backend"], "typesafe")
        self.assertNotIn(SECRET, repr(client) + json.dumps(client.status()))

    def test_workers_ai_gets_the_renewing_provider(self):
        with mock.patch("client.resolve_workers_ai_token_provider", return_value=C.StaticToken("t")) as provider:
            client = C.make_jev_client("workers-ai", refresh_margin_sec=600)
        provider.assert_called_once_with(margin_sec=600)
        self.assertIsInstance(client, C.WorkersAIClient)
        self.assertEqual(client.status()["jev_backend"], "workers-ai")

    def test_unknown_backend_raises(self):
        with self.assertRaises(ValueError):
            C.make_jev_client("ollama")


class ResolveWorkersAiTokenTests(unittest.TestCase):
    def test_prefers_the_env_var(self):
        with mock.patch.dict(os.environ, {"CLOUDFLARE_API_TOKEN": "cf-env-token"}, clear=True):
            self.assertEqual(C.resolve_workers_ai_token("CLOUDFLARE_API_TOKEN"), "cf-env-token")

    def test_falls_back_to_wranglers_oauth_token_on_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "default.toml"
            config_path.write_text(
                'oauth_token = "cfoat_from_disk"\nexpiration_time = "2026-09-23T18:23:28.209Z"\n',
                encoding="utf-8",
            )
            with mock.patch.dict(os.environ, {}, clear=True), mock.patch(
                "client._wrangler_config_paths", return_value=[config_path]
            ):
                self.assertEqual(C.resolve_workers_ai_token("CLOUDFLARE_API_TOKEN"), "cfoat_from_disk")

    def test_refuses_clearly_when_neither_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "does-not-exist.toml"
            with mock.patch.dict(os.environ, {}, clear=True), mock.patch(
                "client._wrangler_config_paths", return_value=[missing]
            ):
                with self.assertRaises(SystemExit) as ctx:
                    C.resolve_workers_ai_token("CLOUDFLARE_API_TOKEN")
        self.assertIn("CLOUDFLARE_API_TOKEN", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
