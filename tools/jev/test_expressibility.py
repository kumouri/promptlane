"""Tests for tools/jev/expressibility.py: reconstruction-verified character classification of the
three real entrant-shaped pilots. No network."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import expressibility as E  # noqa: E402


class ReconstructionTests(unittest.TestCase):
    def test_all_three_files_reconstruct_exactly(self):
        E.verify_reconstruction()  # raises AssertionError on any mismatch

    def test_every_segment_uses_a_known_label(self):
        for name, segments in E.FILES.items():
            for label, _text in segments:
                self.assertIn(label, E.LABELS, f"{name}: unknown label {label!r}")


class CountsTests(unittest.TestCase):
    def test_counts_partition_the_whole_file(self):
        for name in E.FILES:
            counts = E.counts_for(name)
            summed = sum(counts[f"{label}_chars"] for label in E.LABELS)
            self.assertEqual(summed, counts["total_chars"])

    def test_drums_boilerplate_matches_the_memo_cross_check(self):
        # docs/jev-decision-model-research.md measured drums.md's format tail at 26% by a
        # different (coarser) method; this is a cross-check, not the same computation.
        counts = E.counts_for("drums.md")
        self.assertAlmostEqual(counts["boilerplate_pct"], 26.3, delta=1.0)

    def test_rule_share_is_the_largest_non_boilerplate_bucket_for_every_file(self):
        for name in E.FILES:
            counts = E.counts_for(name)
            self.assertGreater(counts["rule_pct"], counts["voice_pct"])
            self.assertGreater(counts["rule_pct"], counts["open_strategy_pct"])


if __name__ == "__main__":
    unittest.main()
