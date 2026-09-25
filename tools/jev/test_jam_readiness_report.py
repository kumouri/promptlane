"""Tests for tools/jev/jam_readiness_report.py: truth is the exact rule 3, and scoring counts
over-triggers against it. Pure functions, no network."""
from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import jam_readiness_report as J  # noqa: E402


def w(**overrides):
    base = dict(hp=200, wave=2, tower=None, foe="bb-1", foeKind="bearbot", foeHp=140, cd=0, instrument="violin", team="violet", tick=10, clockSec=0.5)
    base.update(overrides)
    return base


class TruthTests(unittest.TestCase):
    def test_truth_uses_the_exact_rule3(self):
        self.assertEqual(J.truth_bucket(w()), "attack_foe")
        self.assertEqual(J.truth_bucket(w(foeHp=60)), "ability")
        self.assertEqual(J.truth_bucket(w(foe="mn-1", foeKind="minion", foeHp=20)), "attack_foe")
        self.assertEqual(J.truth_bucket(w(instrument="keytar", foe="mn-1", foeKind="minion")), "ability")

    def test_contested_is_violin_drums_with_rule3_deciding(self):
        self.assertTrue(J.is_contested(w()))
        self.assertFalse(J.is_contested(w(instrument="keytar")))
        self.assertFalse(J.is_contested(w(hp=50)))
        self.assertFalse(J.is_contested(w(cd=1.5)))


class ScoreTests(unittest.TestCase):
    def test_counts_over_triggers_and_misses_on_the_contested_subset(self):
        rows = [
            {"pred": "ability", "truth": "attack_foe", "contested": True},
            {"pred": "attack_foe", "truth": "attack_foe", "contested": True},
            {"pred": "attack_foe", "truth": "ability", "contested": True},
            {"pred": "ride_wave", "truth": "ride_wave", "contested": False},
        ]
        s = J.score(rows, "pred")
        self.assertEqual(s["bucket_agreement"], 0.5)
        self.assertEqual(s["ability_over_trigger"], "1/2")
        self.assertEqual(s["ability_missed"], "1/1")


class BenchParsingTests(unittest.TestCase):
    def test_reads_jev_side_worksheets_including_fallbacks(self):
        ok = json.dumps({**w(), "bucket": "ability", "rule": 3})
        fb = "[jev-fallback: down] " + json.dumps({**w(), "bucket": "attack_foe", "rule": 4, "fallback": "rules-in-code"})
        bench = {"matches": [{"decisions": [
            {"bot": 0, "reply": ok},
            {"bot": 1, "reply": fb},
            {"bot": 2, "cached": True},
            {"bot": 4, "reply": ok},  # green side: not Jev
            {"bot": 0, "reply": "[pilot error: x]"},
        ]}]}
        got = J.jev_decisions(bench)
        self.assertEqual([d["bucket"] for d in got], ["ability", "attack_foe"])
        self.assertEqual(got[1]["fallback"], "rules-in-code")


if __name__ == "__main__":
    unittest.main()
