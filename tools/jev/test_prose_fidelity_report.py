"""Tests for tools/jev/prose_fidelity_report.py's pure scoring logic (no network, no files beyond
tempdir fixtures)."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import prose_fidelity_report as R  # noqa: E402


FIDELITY_ROWS = [
    {"scenario": "a", "predicted": {"kind": "recall"}, "ground_truth": {"kind": "move"}},
    {"scenario": "b", "predicted": {"kind": "attack"}, "ground_truth": {"kind": "attack"}},
    {"scenario": "c", "predicted": {"kind": "move"}, "ground_truth": {"kind": "move"}},
]

PROSE_LABELS = {
    "a": {"kind": "recall"},  # translator matches, qwen doesn't
    "b": {"kind": "attack"},  # both match
    "c": {"kind": "attack"},  # neither matches
}


class ScorePilotTests(unittest.TestCase):
    def test_computes_independent_agreement_rates(self):
        result = R.score_pilot(FIDELITY_ROWS, PROSE_LABELS)
        self.assertEqual(result["n_scenarios"], 3)
        self.assertAlmostEqual(result["translator_prose_fidelity_rate"], 2 / 3)
        self.assertAlmostEqual(result["qwen_prose_fidelity_rate"], 1 / 3)

    def test_raises_on_missing_scenario_label(self):
        incomplete_labels = {k: v for k, v in PROSE_LABELS.items() if k != "c"}
        with self.assertRaises(ValueError):
            R.score_pilot(FIDELITY_ROWS, incomplete_labels)

    def test_translator_can_beat_qwen_on_the_exact_scenario_that_motivated_this_script(self):
        # the recall-under-pressure shape: prose says recall, a fixed translator says recall,
        # qwen (asked live, think:false) answers something else entirely -- this is the case
        # `kind_agreement` alone can't distinguish from "the translator is still broken".
        result = R.score_pilot(FIDELITY_ROWS, PROSE_LABELS)
        row_a = next(r for r in result["rows"] if r["scenario"] == "a")
        self.assertTrue(row_a["translator_matches_prose"])
        self.assertFalse(row_a["qwen_matches_prose"])


if __name__ == "__main__":
    unittest.main()
