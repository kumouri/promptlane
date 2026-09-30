"""Tests for tools/jev/backend_parity.py -- fake clients, no network, no spend."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import backend_parity as P  # noqa: E402


class FixedClient:
    """Answers every question with `value`, reports `tokens` input tokens, optionally fails."""

    def __init__(self, value: float, tokens: int = 1000, fail: bool = False, model: str = "jev-1.13.0"):
        self.value, self.tokens, self.fail, self.model = value, tokens, fail, model
        self.calls = 0

    def ask(self, state, questions):
        self.calls += 1
        if self.fail:
            raise RuntimeError("down")
        return {"model": self.model, "answers": {q.id: {"noul": self.value} for q in questions},
                "usage": {"input_tokens": self.tokens, "output_tokens": 0}}


def house(n=4):
    return P.house_items(P.DEFAULT_WORKSHEETS, n // 2, n - n // 2)


class ParityTests(unittest.TestCase):
    def summarize(self, clients, items, **kw):
        rows = P.run(items, clients, **kw)
        return P.summarize(rows, list(clients), {it["family"]: it["yes"] for it in items})

    def test_identical_backends_agree_everywhere(self):
        items = house(4)
        s = self.summarize({"workers-ai": FixedClient(0.9), "typesafe": FixedClient(0.9)}, items, workers=1)
        self.assertEqual(s["per_family"]["house"]["cross"], 1.0)
        self.assertEqual(s["per_family"]["house"]["mean_abs_dnoul"], 0.0)
        self.assertEqual(s["decision_agreement"]["all"]["cross"], 1.0)
        self.assertEqual(s["per_backend"]["typesafe"]["calls"], 8)  # 4 states x 2 repeats

    def test_opposite_backends_disagree_but_each_agrees_with_itself(self):
        items = house(4)
        s = self.summarize({"workers-ai": FixedClient(0.9), "typesafe": FixedClient(0.1)}, items, workers=1)
        fam = s["per_family"]["house"]
        self.assertEqual((fam["cross"], fam["self_workers-ai"], fam["self_typesafe"]), (0.0, 1.0, 1.0))
        self.assertAlmostEqual(fam["mean_abs_dnoul"], 0.8)

    def test_cost_per_1000_decisions_uses_real_usage(self):
        s = self.summarize({"workers-ai": FixedClient(0.9, tokens=1000), "typesafe": FixedClient(0.9, tokens=500)}, house(2), workers=1)
        self.assertAlmostEqual(s["per_backend"]["workers-ai"]["cost_per_1000_decisions_usd"], 0.042)
        self.assertAlmostEqual(s["per_backend"]["typesafe"]["cost_per_1000_decisions_usd"], 0.021)

    def test_errors_are_counted_not_raised(self):
        s = self.summarize({"workers-ai": FixedClient(0.9), "typesafe": FixedClient(0.9, fail=True)}, house(2), workers=1)
        self.assertEqual(s["per_backend"]["typesafe"]["errors"], 4)
        self.assertIsNone(s["per_family"]["house"]["cross"])

    def test_budget_skips_whole_states(self):
        # $0.042 per 1M tokens: a 10M-token call costs $0.42 > the $0.10 cap after the first state
        clients = {"workers-ai": FixedClient(0.9, tokens=10_000_000), "typesafe": FixedClient(0.9, tokens=10_000_000)}
        s = self.summarize(clients, house(4), workers=1, budget_usd=0.10)
        self.assertEqual((s["states_run"], s["states_skipped"]), (1, 3))

    def test_backend_order_alternates(self):
        seen = []

        class Recorder(FixedClient):
            def __init__(self, name):
                super().__init__(0.9)
                self.name = name

            def ask(self, state, questions):
                seen.append(self.name)
                return super().ask(state, questions)

        P.run(house(2), {"workers-ai": Recorder("wa"), "typesafe": Recorder("ts")}, repeats=2, workers=1)
        self.assertEqual(seen, ["wa", "ts", "ts", "wa", "ts", "wa", "wa", "ts"])

    def test_schema_items_cover_every_tier_instrument_and_team(self):
        items = P.schema_items(P.DEFAULT_TIERS)
        self.assertEqual({it["family"] for it in items}, {"schema:easy", "schema:medium", "schema:hard"})
        self.assertEqual(len(items), 3 * 3 * len(P.all_scenarios()) * 2)

    def test_markdown_renders(self):
        s = self.summarize({"workers-ai": FixedClient(0.9), "typesafe": FixedClient(0.9)}, house(2), workers=1)
        md = P.render_markdown(s)
        self.assertIn("| workers-ai |", md)
        self.assertIn("q1_low_hp_recall", md)


if __name__ == "__main__":
    unittest.main()
