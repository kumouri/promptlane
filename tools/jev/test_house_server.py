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
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import house_server  # noqa: E402
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


class RecordingClient(FakeClient):
    """A perfect Jev that also keeps what it was asked, so a test can see the questions and state."""

    def ask(self, state, questions):
        self.state, self.question_ids = state, [q.id for q in questions]
        return super().ask(state, questions)


class BandstandTests(unittest.TestCase):
    """house-violet.md's rule 2 on the live path: asked only when the worksheet carries `stand`."""

    LIVE = dict(hp=120, wave=1, tower=None, foe=None, cd=2.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05,
                foe_detail=True, foe_kind=None, foe_hp=None)

    def test_without_stand_the_six_questions_and_the_pre_bandstand_decision(self):
        client = RecordingClient()
        client.set_ground_truth(Worksheet(**self.LIVE))
        result = JevHouseBackend(client, budget_usd=None).decide(body(hp=120, cd=2.0, foeKind=None, foeHp=None))
        self.assertEqual(len(client.question_ids), 6)
        self.assertNotIn("q1b_bandstand_open", result["answers"])
        self.assertNotIn("Bandstand", client.state)
        self.assertEqual((result["bucket"], result["rule"]), ("ride_wave", 6))

    def test_open_stand_moves_to_the_bandstand_as_rule_8(self):
        client = RecordingClient()
        client.set_ground_truth(Worksheet(**self.LIVE, stand="open", max_hp=140))
        result = JevHouseBackend(client, budget_usd=None).decide(body(hp=120, cd=2.0, foeKind=None, foeHp=None, stand="open", maxHp=140))
        self.assertEqual(client.question_ids[:2], ["q1_low_hp_recall", "q1b_bandstand_open"])
        self.assertIn("The Bandstand is open.", client.state)
        self.assertEqual((result["bucket"], result["rule"]), ("bandstand", 8))

    def test_a_visible_bearbot_keeps_it_off_the_stand(self):
        client = RecordingClient()
        live = dict(self.LIVE, foe="bb-5", foe_kind="bearbot", foe_hp=130)
        client.set_ground_truth(Worksheet(**live, stand="open", max_hp=140))
        result = JevHouseBackend(client, budget_usd=None).decide(
            body(hp=120, cd=2.0, foe="bb-5", foeKind="bearbot", foeHp=130, stand="open", maxHp=140))
        self.assertEqual(result["bucket"], "attack_foe")

    def test_fallback_plays_the_bandstand_rule_too(self):
        b = JevHouseBackend(FailingClient(fail_times=99), budget_usd=None)
        with redirect_stderr(io.StringIO()):
            result = b.decide(body(hp=120, cd=2.0, foeKind=None, foeHp=None, stand="open", maxHp=140))
            closed = b.decide(body(hp=120, cd=2.0, foeKind=None, foeHp=None, stand="closed", maxHp=140))
        self.assertEqual((result["bucket"], result["rule"], result["fallback"]), ("bandstand", 8, "rules-in-code"))
        self.assertEqual(result["answers"]["q1b_bandstand_open"], 1.0)
        self.assertEqual(closed["bucket"], "ride_wave")

    def test_stand_without_max_hp_is_a_bad_worksheet(self):
        with self.assertRaisesRegex(ValueError, "maxHp"):
            JevHouseBackend(FakeClient(), budget_usd=None).decide(body(stand="open"))


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


class JevBackendTests(unittest.TestCase):
    SECRET = "sk-live-must-never-leak-house"

    def test_old_backend_flag_still_selects(self):
        self.assertEqual(house_server.parse_args([]).jev_backend, "typesafe")
        self.assertEqual(house_server.parse_args(["--backend", "workers-ai"]).jev_backend, "workers-ai")
        self.assertEqual(house_server.parse_args(["--backend", "typesafe"]).jev_backend, "typesafe")

    def test_check_token_on_typesafe_needs_no_renewal_and_never_prints_the_key(self):
        out = io.StringIO()
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": self.SECRET}, clear=True), \
                mock.patch("client.resolve_workers_ai_token_provider") as provider, redirect_stdout(out):
            code = house_server.main(["--jev-backend", "typesafe", "--no-jev-fallback", "--check-token"])
        self.assertEqual(code, 0)
        provider.assert_not_called()
        self.assertIn("typesafe-api-key", out.getvalue())
        self.assertNotIn(self.SECRET, out.getvalue())

    def test_health_names_the_typesafe_backend(self):
        from client import SystemOneClient
        snap = JevHouseBackend(SystemOneClient(self.SECRET), budget_usd=None).snapshot()
        self.assertEqual((snap["jev_backend"], snap["token_renewals"]), ("typesafe", 0))
        self.assertNotIn(self.SECRET, json.dumps(snap))


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
