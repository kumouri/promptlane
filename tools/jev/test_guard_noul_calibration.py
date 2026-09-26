"""Tests for tools/jev/guard_noul_calibration.py's pure helpers (no Jev/Ollama network calls)."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import guard_noul_calibration as G  # noqa: E402


class LoadExpectedLabelsTests(unittest.TestCase):
    def test_ability_scenarios_expect_yes(self):
        expected = G.load_expected_labels()
        self.assertTrue(expected["melee_range_enemy_ability_ready"])
        self.assertTrue(expected["isolated_vs_grouped_enemy"])

    def test_hold_scenarios_expect_no(self):
        expected = G.load_expected_labels()
        self.assertFalse(expected["clustered_enemies"])
        self.assertFalse(expected["enemy_tower_only"])

    def test_move_and_recall_scenarios_are_not_scored(self):
        expected = G.load_expected_labels()
        self.assertIsNone(expected["empty_lane_push"])
        self.assertIsNone(expected["low_hp_recall_under_pressure"])
        self.assertIsNone(expected["ranged_enemy_far"])

    def test_every_scenario_has_an_entry(self):
        from scenarios import all_scenarios

        expected = G.load_expected_labels()
        for scenario in all_scenarios():
            self.assertIn(scenario.name, expected)


class RunCalibrationWithStubTests(unittest.TestCase):
    """The stub has no ground-truth concept (seeded pseudo-random noul values, like
    `fidelity_harness.DumbStubJevClient`) -- these tests check the scoring/aggregation plumbing
    runs end to end and produces a well-formed report, not that any number is "right"."""

    def test_report_has_the_expected_shape(self):
        report = G.run_calibration(G.StubGuardClient())
        self.assertEqual(report["n_scenarios"], 12)
        self.assertEqual(report["n_scored"], 4)
        self.assertEqual(
            set(report["scored_scenarios"]),
            {
                "melee_range_enemy_ability_ready",
                "isolated_vs_grouped_enemy",
                "clustered_enemies",
                "enemy_tower_only",
            },
        )
        self.assertEqual(len(report["rows"]), 12)
        for row in report["rows"]:
            self.assertIn("guard_can_win", row["per_wording"])
            self.assertIn("guard_commit_now", row["per_wording"])
            self.assertIn("guard_favorable_target", row["per_wording"])

    def test_deterministic_given_a_seeded_stub(self):
        """`latency_sec` is wall-clock and never reproducible; every other field must be, since the
        stub's answers come from a seeded `random.Random`, not real timing or network variance."""
        report_a = G.run_calibration(G.StubGuardClient(seed=1))
        report_b = G.run_calibration(G.StubGuardClient(seed=1))
        strip_latency = lambda rows: [{k: v for k, v in row.items() if k != "latency_sec"} for row in rows]  # noqa: E731
        self.assertEqual(strip_latency(report_a["rows"]), strip_latency(report_b["rows"]))

    def test_render_markdown_does_not_raise_and_includes_headline(self):
        report = G.run_calibration(G.StubGuardClient())
        md = G.render_markdown(report, "dry-run (stub, no network, no fidelity signal)")
        self.assertIn("Guard-noul calibration", md)
        self.assertIn("guard_can_win", md)


if __name__ == "__main__":
    unittest.main()
