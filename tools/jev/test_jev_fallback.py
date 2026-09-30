"""Tests for `client.FallbackJevClient`: typesafe first, Workers AI behind it (Ceryce's ruling
2026-09-30 08:34 CT). No network -- `urlopen` is mocked and answers by URL, so each test says what
TypeSafe and Workers AI each do, and asserts which one answered the decision."""
from __future__ import annotations

import io
import json
import os
import sys
import time
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import client as C  # noqa: E402
import house_server  # noqa: E402
import rules as R  # noqa: E402

SECRET = "sk-live-must-never-leak-fallback"
TYPESAFE_OK = {"model": "jev-1.13.0", "answers": {"q1_low_hp_recall": {"type": "noul", "noul": 0.9}}, "usage": {"input_tokens": 300, "output_tokens": 0}}
WORKERS_AI_ANSWER = {"model": "jev-1.13.0", "answers": {"q1_low_hp_recall": {"type": "noul", "noul": 0.1}}, "usage": {"input_tokens": 300, "output_tokens": 0}}
WORKERS_AI_OK = {"success": True, "errors": [], "result": {"result": WORKERS_AI_ANSWER}}


def questions():
    return R.bind_questions("keytar", R.Worksheet(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05))


def ok(payload):
    cm = mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(json.dumps(payload).encode("utf-8"))
    cm.__exit__.return_value = False
    return cm


def http_error(url, code, body=b"{}", headers=None):
    return urllib.error.HTTPError(url=url, code=code, msg="x", hdrs=headers or {}, fp=io.BytesIO(body))


class FakeNet:
    """`urlopen` stand-in: a queue of outcomes per host; each outcome is a payload (answered 200),
    an exception to raise, or a callable returning either. An empty queue repeats its last entry."""

    def __init__(self, typesafe, workers_ai=(WORKERS_AI_OK,)):
        self.queues = {"typesafe": list(typesafe), "workers-ai": list(workers_ai)}
        self.calls = {"typesafe": 0, "workers-ai": 0}
        self.timeouts = {"typesafe": [], "workers-ai": []}

    def __call__(self, req, timeout=None):
        host = "typesafe" if req.full_url == C.API_URL else "workers-ai"
        self.calls[host] += 1
        self.timeouts[host].append(timeout)
        q = self.queues[host]
        outcome = q.pop(0) if len(q) > 1 else q[0]
        if callable(outcome) and not isinstance(outcome, type):
            outcome = outcome()
        if isinstance(outcome, BaseException):
            raise outcome
        return ok(outcome)


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def make(net_clock=None, cooldown_sec=10.0, deadline_sec=30.0):
    clock = net_clock or Clock()
    client = C.FallbackJevClient(
        C.SystemOneClient(SECRET), C.WorkersAIClient(api_token="cf-token"),
        deadline_sec=deadline_sec, cooldown_sec=cooldown_sec, clock=clock,
    )
    return client, clock


class FailoverPerCallTests(unittest.TestCase):
    def setUp(self):
        self.err = io.StringIO()
        patcher = redirect_stderr(self.err)
        patcher.__enter__()
        self.addCleanup(patcher.__exit__, None, None, None)

    def ask(self, client, net):
        with mock.patch("client.urllib.request.urlopen", side_effect=net), mock.patch("client.time.sleep") as sleep:
            result = client.ask("s", questions())
        return result, sleep

    def test_429_that_decision_is_answered_by_workers_ai(self):
        client, _ = make()
        net = FakeNet([lambda: http_error(C.API_URL, 429)])
        result, sleep = self.ask(client, net)
        self.assertEqual(result, WORKERS_AI_ANSWER)  # Workers AI's answer, unwrapped
        self.assertEqual(net.calls, {"typesafe": 1, "workers-ai": 1})  # one TypeSafe attempt, no backoff
        sleep.assert_not_called()
        snap = client.status()
        self.assertEqual((snap["jev_fallback_failovers"], snap["jev_fallback_errors"]), (1, 0))
        self.assertGreater(snap["jev_fallback_cooldown_left_sec"], 0)
        self.assertIn("FAILOVER #1: typesafe 429", self.err.getvalue())

    def test_a_healthy_typesafe_never_touches_workers_ai(self):
        client, _ = make()
        net = FakeNet([TYPESAFE_OK])
        for _ in range(3):
            self.assertEqual(self.ask(client, net)[0], TYPESAFE_OK)
        self.assertEqual(net.calls, {"typesafe": 3, "workers-ai": 0})
        self.assertEqual(net.timeouts["typesafe"], [C.FALLBACK_PRIMARY_TIMEOUT_SEC] * 3)  # one short attempt, not the whole deadline
        self.assertEqual(client.status()["jev_fallback_failovers"], 0)

    def test_529_5xx_and_connection_failures_fail_over_too(self):
        for outcome in (lambda: http_error(C.API_URL, 529), lambda: http_error(C.API_URL, 503),
                        TimeoutError("timed out"), urllib.error.URLError("connection refused")):
            client, _ = make()
            net = FakeNet([outcome])
            self.assertEqual(self.ask(client, net)[0], WORKERS_AI_ANSWER)
            self.assertEqual(net.calls, {"typesafe": 1, "workers-ai": 1})

    def test_401_and_422_are_not_failed_over_and_never_carry_the_key(self):
        for code in (401, 422):
            client, _ = make()
            echoed = json.dumps({"error": f"bad key {SECRET}"}).encode()
            net = FakeNet([lambda: http_error(C.API_URL, code, echoed)])
            with self.assertRaises(C.SystemOneError) as ctx:
                self.ask(client, net)
            self.assertEqual(ctx.exception.status, code)
            self.assertEqual(net.calls["workers-ai"], 0)
            self.assertNotIn(SECRET, str(ctx.exception))
            self.assertEqual(client.status()["jev_fallback_cooldown_left_sec"], 0)
        self.assertNotIn(SECRET, self.err.getvalue())

    def test_workers_ai_failing_too_leaves_the_decision_unanswered_and_counts_it(self):
        client, _ = make()
        echoed = json.dumps({"error": f"slow down {SECRET}"}).encode()
        net = FakeNet([lambda: http_error(C.API_URL, 429, echoed)], [lambda: http_error(client.fallback.url, 500)])
        with self.assertRaises(C.SystemOneError) as ctx:
            self.ask(client, net)
        self.assertIn("workers-ai fallback failed", str(ctx.exception))
        snap = client.status()
        self.assertEqual((snap["jev_fallback_failovers"], snap["jev_fallback_errors"]), (1, 1))
        self.assertNotIn(SECRET, str(ctx.exception) + json.dumps(snap) + self.err.getvalue())

    def test_no_time_left_skips_the_fallback(self):
        client, _ = make(deadline_sec=0.3)  # under MIN_FALLBACK_SEC
        net = FakeNet([lambda: http_error(C.API_URL, 429)])
        with self.assertRaises(C.SystemOneError) as ctx:
            self.ask(client, net)
        self.assertIn("no time left", str(ctx.exception))
        self.assertEqual(net.calls["workers-ai"], 0)
        self.assertEqual(client.status()["jev_fallback_errors"], 1)

    def test_workers_ai_keeps_its_401_renewal_on_the_fallback_path(self):
        client, _ = make()
        tokens = mock.MagicMock()
        tokens.token.return_value = "old"
        tokens.force_refresh.return_value = "new"
        tokens.status.return_value = {"token_source": "wrangler-oauth", "token_expires_in_sec": 3000, "token_renewals": 1}
        client.fallback.tokens = tokens
        net = FakeNet([lambda: http_error(C.API_URL, 429)], [lambda: http_error(client.fallback.url, 401), WORKERS_AI_OK])
        self.assertEqual(self.ask(client, net)[0], WORKERS_AI_ANSWER)
        tokens.force_refresh.assert_called_once_with("old")
        snap = client.status()
        self.assertEqual((snap["jev_fallback_token_source"], snap["jev_fallback_token_renewals"]), ("wrangler-oauth", 1))
        self.assertEqual(snap["token_source"], "typesafe-api-key")  # the top-level token fields stay TypeSafe's


class CooldownTests(unittest.TestCase):
    def setUp(self):
        self.err = io.StringIO()
        patcher = redirect_stderr(self.err)
        patcher.__enter__()
        self.addCleanup(patcher.__exit__, None, None, None)

    def ask(self, client, net):
        with mock.patch("client.urllib.request.urlopen", side_effect=net), mock.patch("client.time.sleep"):
            return client.ask("s", questions())

    def test_cooldown_routes_new_calls_to_workers_ai_then_probes_typesafe(self):
        client, clock = make(cooldown_sec=10)
        net = FakeNet([lambda: http_error(C.API_URL, 429), TYPESAFE_OK])
        self.assertEqual(self.ask(client, net), WORKERS_AI_ANSWER)  # the failover
        for _ in range(3):
            clock.now += 3  # 3, 6, 9 s into a 10 s cool-down
            self.assertEqual(self.ask(client, net), WORKERS_AI_ANSWER)
        self.assertEqual(net.calls, {"typesafe": 1, "workers-ai": 4})  # TypeSafe not asked during the cool-down
        clock.now += 2  # 11 s: the next call is the probe
        self.assertEqual(self.ask(client, net), TYPESAFE_OK)
        self.assertEqual(net.calls["typesafe"], 2)
        self.assertIn("RECOVERED", self.err.getvalue())
        self.assertEqual(self.ask(client, net), TYPESAFE_OK)  # back on TypeSafe, no cool-down left
        snap = client.status()
        self.assertEqual((snap["jev_fallback_failovers"], snap["jev_fallback_cooldown_calls"], snap["jev_fallback_probes"]), (1, 3, 1))
        self.assertEqual(snap["jev_fallback_cooldown_left_sec"], 0)
        self.assertEqual(self.err.getvalue().count("FAILOVER"), 1)  # one loud line per episode, not per call

    def test_a_failed_probe_starts_another_cooldown(self):
        client, clock = make(cooldown_sec=10)
        net = FakeNet([lambda: http_error(C.API_URL, 429)])
        self.ask(client, net)
        clock.now += 11
        self.assertEqual(self.ask(client, net), WORKERS_AI_ANSWER)  # probe 429s -> this call fails over too
        self.assertIn("probe failed (429)", self.err.getvalue())
        clock.now += 5
        self.ask(client, net)
        self.assertEqual(net.calls["typesafe"], 2)  # still cooling: no third TypeSafe call
        snap = client.status()
        self.assertEqual((snap["jev_fallback_failovers"], snap["jev_fallback_probes"], snap["jev_fallback_cooldown_calls"]), (2, 1, 1))

    def test_only_one_probe_at_a_time(self):
        client, clock = make(cooldown_sec=10)
        self.ask(client, FakeNet([lambda: http_error(C.API_URL, 429)]))
        clock.now += 11
        self.assertEqual(client._route(), "probe")
        self.assertEqual(client._route(), "fallback")  # another call while the probe is in flight
        client._end_probe(recovered=True)
        self.assertEqual(client._route(), "primary")

    def test_retry_after_stretches_the_cooldown_up_to_the_cap(self):
        client, _ = make(cooldown_sec=10)
        self.ask(client, FakeNet([lambda: http_error(C.API_URL, 429, headers={"Retry-After": "25"})]))
        self.assertEqual(client.status()["jev_fallback_cooldown_left_sec"], 25.0)
        client, _ = make(cooldown_sec=10)
        self.ask(client, FakeNet([lambda: http_error(C.API_URL, 429, headers={"retry-after-ms": "900000"})]))
        self.assertEqual(client.status()["jev_fallback_cooldown_left_sec"], C.MAX_FALLBACK_COOLDOWN_SEC)


class NoWorkersAiCredentialTests(unittest.TestCase):
    def no_credential(self):
        return mock.patch("client.resolve_workers_ai_token_provider", side_effect=SystemExit("No Cloudflare API token found"))

    def test_fallback_is_off_with_one_warning_and_the_server_still_starts(self):
        err = io.StringIO()
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": SECRET}, clear=True), self.no_credential(), redirect_stderr(err):
            client = C.make_jev_client("typesafe")
        self.assertIsInstance(client, C.FallbackJevClient)
        self.assertIsNone(client.fallback)
        self.assertEqual(err.getvalue().count("WARNING"), 1)
        self.assertIn("Workers AI fallback is OFF", err.getvalue())
        self.assertNotIn(SECRET, err.getvalue())
        snap = client.status()
        self.assertEqual((snap["jev_fallback"], snap["jev_fallback_disabled"]), (None, "no Workers AI credential"))

    def test_without_a_fallback_typesafe_keeps_its_own_retries(self):
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": SECRET}, clear=True), self.no_credential(), \
                redirect_stderr(io.StringIO()):
            client = C.make_jev_client("typesafe")
        net = FakeNet([lambda: http_error(C.API_URL, 429), TYPESAFE_OK])
        with mock.patch("client.urllib.request.urlopen", side_effect=net), mock.patch("client.time.sleep") as sleep:
            self.assertEqual(client.ask("s", questions()), TYPESAFE_OK)
        self.assertEqual(net.calls, {"typesafe": 2, "workers-ai": 0})
        sleep.assert_called_once()
        self.assertEqual(client.status()["jev_fallback_failovers"], 0)

    def test_check_token_reports_the_fallback_is_off_without_failing(self):
        out = io.StringIO()
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": SECRET}, clear=True), \
                mock.patch("house_server.resolve_workers_ai_token_provider", side_effect=SystemExit("No Cloudflare API token found")), \
                redirect_stdout(out):
            code = house_server.main(["--check-token"])
        self.assertEqual(code, 0)
        self.assertIn("token OK: source=typesafe-api-key", out.getvalue())
        self.assertIn("fallback: OFF", out.getvalue())
        self.assertNotIn(SECRET, out.getvalue())

    def test_check_token_checks_the_fallback_token_when_there_is_one(self):
        out = io.StringIO()
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": SECRET}, clear=True), \
                mock.patch("house_server.resolve_workers_ai_token_provider", return_value=C.StaticToken("cf")), \
                redirect_stdout(out):
            code = house_server.main(["--check-token"])
        self.assertEqual(code, 0)
        self.assertIn("fallback workers-ai token OK: source=env", out.getvalue())


class DeadlineTests(unittest.TestCase):
    def test_a_passed_deadline_makes_no_call(self):
        req = mock.MagicMock()
        with mock.patch("client.urllib.request.urlopen") as urlopen, self.assertRaises(C.SystemOneError) as ctx:
            C._open_with_retry(req, 30, "workers-ai", deadline=time.monotonic() - 1)
        urlopen.assert_not_called()
        self.assertIn("deadline", str(ctx.exception))

    def test_no_retry_whose_backoff_would_outlast_the_deadline(self):
        req = mock.MagicMock()
        err = http_error("u", 429, headers={"Retry-After": "20"})
        with mock.patch("client.urllib.request.urlopen", side_effect=[err]) as urlopen, mock.patch("client.time.sleep") as sleep, \
                self.assertRaises(C.SystemOneError) as ctx:
            C._open_with_retry(req, 30, "workers-ai", deadline=time.monotonic() + 5)
        self.assertEqual(urlopen.call_count, 1)
        sleep.assert_not_called()
        self.assertEqual((ctx.exception.status, ctx.exception.retry_after), (429, 20.0))

    def test_the_socket_timeout_is_cut_to_what_is_left(self):
        with mock.patch("client.urllib.request.urlopen", return_value=ok({})) as urlopen:
            C._open_with_retry(mock.MagicMock(), 30, "workers-ai", deadline=time.monotonic() + 4)
        self.assertLessEqual(urlopen.call_args.kwargs["timeout"], 4)


if __name__ == "__main__":
    unittest.main()
