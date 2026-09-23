"""Tests for tools/jev/team_server.py's JevTeamBackend -- no network, a fake client stands in for
SystemOneClient/WorkersAIClient, same pattern as test_house_server.py."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from team_rules import Worksheet, ground_truth_answers  # noqa: E402
from team_server import BudgetExceeded, JevTeamBackend  # noqa: E402


class FakeClient:
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
    base = dict(
        hp=200, maxHp=200, wave=1, tower=None, foe=None, foeIsBearbot=False, foeHp=None, foeMaxHp=None,
        cd=0.0, instrument="keytar", team="violet", tick=1, clockSec=0.05,
    )
    base.update(overrides)
    return base


def worksheet(**overrides):
    base = dict(
        hp=200, max_hp=200, wave=1, tower=None, foe=None, foe_is_bearbot=False, foe_hp=None,
        foe_max_hp=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05,
    )
    base.update(overrides)
    return Worksheet(**base)


class DecideTests(unittest.TestCase):
    def test_recall_rule_wins(self):
        client = FakeClient()
        b = JevTeamBackend(client, budget_usd=None)
        client.set_ground_truth(worksheet(hp=30, max_hp=200))  # 15% < keytar's 35%
        result = b.decide(body(hp=30, maxHp=200))
        self.assertEqual(result["bucket"], "recall")
        self.assertEqual(result["rule"], 1)
        self.assertIn("q1_recall_low_hp", result["answers"])

    def test_engage_beats_positioning_when_a_foe_is_present(self):
        """The live analog of test_team_rules.py's cascade-order test: with a foe present, a tower
        visible, and no wave, the backend must still answer 'attack', not 'go home'."""
        client = FakeClient()
        b = JevTeamBackend(client, budget_usd=None)
        client.set_ground_truth(worksheet(hp=200, max_hp=200, wave=0, tower="tw-1", foe="bb-1", cd=1.0))
        result = b.decide(body(hp=200, maxHp=200, wave=0, tower="tw-1", foe="bb-1", cd=1.0))
        self.assertEqual(result["bucket"], "attack_foe")

    def test_falls_through_to_go_home(self):
        client = FakeClient()
        b = JevTeamBackend(client, budget_usd=None)
        client.set_ground_truth(worksheet(hp=200, wave=0, tower=None, foe=None, cd=5.0))
        result = b.decide(body(hp=200, wave=0, tower=None, foe=None, cd=5.0))
        self.assertEqual(result["rule"], 7)
        self.assertEqual(result["bucket"], "go_home")

    def test_missing_field_raises_value_error(self):
        client = FakeClient()
        b = JevTeamBackend(client, budget_usd=None)
        with self.assertRaises(ValueError):
            b.decide({"hp": 100})

    def test_tracks_usage_and_cost(self):
        client = FakeClient(input_tokens=1_000_000)
        b = JevTeamBackend(client, budget_usd=None)
        client.set_ground_truth(worksheet())
        b.decide(body())
        snap = b.snapshot()
        self.assertEqual(snap["requests"], 1)
        self.assertEqual(snap["tokens_in"], 1_000_000)
        self.assertAlmostEqual(snap["cost_usd"], 0.042, places=4)

    def test_budget_cap_refuses_once_exceeded(self):
        client = FakeClient(input_tokens=100_000_000)
        b = JevTeamBackend(client, budget_usd=0.01)
        client.set_ground_truth(worksheet())
        b.decide(body())
        with self.assertRaises(BudgetExceeded):
            b.decide(body())
        self.assertEqual(client.calls, 1)


if __name__ == "__main__":
    unittest.main()
