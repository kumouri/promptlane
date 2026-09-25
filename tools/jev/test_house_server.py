"""Tests for tools/jev/house_server.py's JevHouseBackend -- no network, a fake client stands in for
SystemOneClient/WorkersAIClient exactly like StubSystemOneClient does in test_harness.py."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from house_server import BudgetExceeded, JevHouseBackend  # noqa: E402
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

    def test_budget_cap_refuses_once_exceeded(self):
        client = FakeClient(input_tokens=100_000_000)  # one call blows way past a tiny budget
        b = JevHouseBackend(client, budget_usd=0.01)
        client.set_ground_truth(Worksheet(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05))
        b.decide(body())  # first call is allowed even though it will exceed the cap
        with self.assertRaises(BudgetExceeded):
            b.decide(body())
        self.assertEqual(client.calls, 1)


if __name__ == "__main__":
    unittest.main()
