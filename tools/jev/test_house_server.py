"""Tests for tools/jev/house_server.py's JevHouseBackend -- no network, a fake client stands in for
SystemOneClient/WorkersAIClient exactly like StubSystemOneClient does in test_harness.py."""
from __future__ import annotations

import io
import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stderr

sys.path.insert(0, os.path.dirname(__file__))
from client import SystemOneError  # noqa: E402
from house_server import BudgetExceeded, JevHouseBackend, serve  # noqa: E402
from rules import ground_truth_answers, Worksheet  # noqa: E402


class FakeClient:
    """Answers every question exactly per ground truth -- a hypothetical perfect Jev -- and reports
    a fixed, known token count so cost/budget math is exact in tests, not estimated."""

    model = "fake-jev"

    def __init__(self, input_tokens: int = 1000):
        self.input_tokens = input_tokens
        self.calls = 0

    def ask(self, state, questions):
        self.calls += 1
        ws_answers = self._ground_truth
        answers = {q.id: {"noul": 0.95 if ws_answers[q.id] else 0.05} for q in questions}
        return {"model": self.model, "answers": answers, "usage": {"input_tokens": self.input_tokens, "output_tokens": 0}}

    def set_ground_truth(self, ws: Worksheet) -> None:
        self._ground_truth = ground_truth_answers(ws)


def body(**overrides):
    base = dict(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clockSec=0.05)
    base.update(overrides)
    return base


class DecideTests(unittest.TestCase):
    def test_recall_rule_wins(self):
        client = FakeClient()
        b = JevHouseBackend(client, budget_usd=None)
        req = body(hp=50)
        client.set_ground_truth(Worksheet(hp=50, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05))
        result = b.decide(req)
        self.assertEqual(result["bucket"], "recall")
        self.assertEqual(result["rule"], 1)
        self.assertIn("q1_low_hp_recall", result["answers"])

    def test_falls_through_to_go_home(self):
        client = FakeClient()
        b = JevHouseBackend(client, budget_usd=None)
        ws = Worksheet(hp=200, wave=0, tower=None, foe=None, cd=5.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
        client.set_ground_truth(ws)
        result = b.decide(body(hp=200, wave=0, tower=None, foe=None, cd=5.0))
        self.assertEqual(result["rule"], 7)
        self.assertEqual(result["bucket"], "go_home")

    def test_live_foe_detail_makes_rule3_exact(self):
        # A violin with cd 0 facing a 140-hp bearbot: the real rule 3 says attack, not ability.
        client = FakeClient()
        b = JevHouseBackend(client, budget_usd=None)
        live = dict(hp=200, wave=1, tower=None, foe="bb-4", cd=0.0, instrument="violin", team="violet", tick=1, clock_sec=0.05)
        client.set_ground_truth(Worksheet(**live, foe_detail=True, foe_kind="bearbot", foe_hp=140))
        result = b.decide(body(instrument="violin", foe="bb-4", foeKind="bearbot", foeHp=140))
        self.assertEqual(result["bucket"], "attack_foe")

    def test_approx_q3_ignores_foe_detail(self):
        client = FakeClient()
        b = JevHouseBackend(client, budget_usd=None, approx_q3=True)
        live = dict(hp=200, wave=1, tower=None, foe="bb-4", cd=0.0, instrument="violin", team="violet", tick=1, clock_sec=0.05)
        client.set_ground_truth(Worksheet(**live))  # the approximation: any foe + cd 0 -> ability
        result = b.decide(body(instrument="violin", foe="bb-4", foeKind="bearbot", foeHp=140))
        self.assertEqual(result["bucket"], "ability")

    def test_missing_field_raises_value_error(self):
        client = FakeClient()
        b = JevHouseBackend(client, budget_usd=None)
        with self.assertRaises(ValueError):
            b.decide({"hp": 100})

    def test_tracks_usage_and_cost(self):
        client = FakeClient(input_tokens=1_000_000)
        b = JevHouseBackend(client, budget_usd=None)
        client.set_ground_truth(Worksheet(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05))
        b.decide(body())
        snap = b.snapshot()
        self.assertEqual(snap["requests"], 1)
        self.assertEqual(snap["tokens_in"], 1_000_000)
        self.assertAlmostEqual(snap["cost_usd"], 0.042, places=4)

    def test_budget_cap_refuses_jev_and_falls_back_to_rules(self):
        client = FakeClient(input_tokens=100_000_000)  # one call blows way past a tiny budget
        b = JevHouseBackend(client, budget_usd=0.01)
        client.set_ground_truth(Worksheet(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05))
        b.decide(body())  # first call is allowed even though it will exceed the cap
        result = b.decide(body())
        self.assertEqual(client.calls, 1, "no Jev call past the cap")
        self.assertEqual(result["fallback"], "rules-in-code")
        self.assertIn(BudgetExceeded.__name__, result["error"])
        self.assertEqual(result["bucket"], "ride_wave")


class FailingClient:
    model = "failing-jev"

    def __init__(self, fail_times: int):
        self.fail_times = fail_times
        self.calls = 0

    def ask(self, state, questions):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise SystemOneError("workers-ai 401: Authentication error", status=401)
        return {"answers": {q.id: {"noul": 0.9 if q.ground_truth_value else 0.1} for q in questions}, "usage": {"input_tokens": 10}}


class FallbackTests(unittest.TestCase):
    def test_unreachable_jev_decides_by_exact_rules(self):
        # violin, cd 0, foe a 60-hp bearbot -> exact rule 3 -> ability (even in --approx-q3 mode)
        b = JevHouseBackend(FailingClient(fail_times=99), budget_usd=None, approx_q3=True)
        with redirect_stderr(io.StringIO()) as err:
            result = b.decide(body(instrument="violin", foe="bb-2", foeKind="bearbot", foeHp=60))
        self.assertEqual((result["bucket"], result["rule"], result["fallback"]), ("ability", 3, "rules-in-code"))
        self.assertIn("!!! FALLBACK #1", err.getvalue())
        snap = b.snapshot()
        self.assertEqual((snap["fallbacks"], snap["errors"]), (1, 1))
        self.assertIn("401", snap["last_fallback_error"])

    def test_recovery_is_logged_and_jev_resumes(self):
        client = FailingClient(fail_times=1)
        b = JevHouseBackend(client, budget_usd=None)
        with redirect_stderr(io.StringIO()) as err:
            first = b.decide(body(hp=50))
            second = b.decide(body(hp=50))
        self.assertEqual(first["fallback"], "rules-in-code")
        self.assertNotIn("fallback", second)
        self.assertEqual(second["bucket"], "recall")
        self.assertIn("RECOVERED", err.getvalue())

    def test_health_reports_token_status_when_client_has_one(self):
        class Tokens:
            def status(self):
                return {"token_source": "wrangler-oauth", "token_expires_in_sec": 1234}

        client = FakeClient()
        client.tokens = Tokens()
        snap = JevHouseBackend(client, budget_usd=None).snapshot()
        self.assertEqual(snap["token_expires_in_sec"], 1234)


class HttpFallbackTests(unittest.TestCase):
    """End to end over HTTP: the server answers 200 with a playable bucket even when Jev is down."""

    def test_post_returns_200_fallback(self):
        server = serve(JevHouseBackend(FailingClient(fail_times=99), budget_usd=None), "failing-jev", "127.0.0.1", 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_address[1]}/"
            req = urllib.request.Request(url, data=json.dumps(body(hp=40)).encode(), headers={"Content-Type": "application/json"})
            with redirect_stderr(io.StringIO()):
                with urllib.request.urlopen(req, timeout=5) as resp:
                    self.assertEqual(resp.status, 200)
                    data = json.loads(resp.read())
            self.assertEqual((data["bucket"], data["fallback"]), ("recall", "rules-in-code"))
            bad = urllib.request.Request(url, data=b'{"hp": 1}', headers={"Content-Type": "application/json"})
            with redirect_stderr(io.StringIO()), self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(bad, timeout=5)
            self.assertEqual(ctx.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
