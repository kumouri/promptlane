"""Tests for tools/jev/serializer.py: the Worksheet -> state paragraph encoding."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import rules as R  # noqa: E402
import serializer as S  # noqa: E402


def ws(**overrides):
    base = dict(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
    base.update(overrides)
    return R.Worksheet(**base)


class StateParagraphTests(unittest.TestCase):
    def test_mentions_team_instrument_and_tick(self):
        text = S.state_paragraph(ws(instrument="violin", team="green", tick=1234, clock_sec=61.7))
        self.assertIn("green-team", text)
        self.assertIn("violin", text)
        self.assertIn("1234", text)
        self.assertIn("61.7", text)

    def test_low_hp_names_the_threshold(self):
        text = S.state_paragraph(ws(hp=48))
        self.assertIn("48", text)
        self.assertIn("below the 75-hp recall threshold", text)

    def test_high_hp_says_at_or_above(self):
        text = S.state_paragraph(ws(hp=200))
        self.assertIn("at or above the 75-hp recall threshold", text)

    def test_zero_wave_is_explicit_not_just_absent(self):
        text = S.state_paragraph(ws(wave=0))
        self.assertIn("no allied minions", text.lower())

    def test_tower_and_foe_ids_appear_when_present(self):
        text = S.state_paragraph(ws(tower="tw-7", foe="bb-3"))
        self.assertIn("tw-7", text)
        self.assertIn("bb-3", text)

    def test_tower_and_foe_absence_is_explicit(self):
        text = S.state_paragraph(ws(tower=None, foe=None))
        self.assertIn("No enemy tower", text)
        self.assertIn("No enemy bearbot or minion", text)

    def test_cooldown_zero_reads_as_ready(self):
        text = S.state_paragraph(ws(cd=0.0))
        self.assertIn("off cooldown and ready to use", text)

    def test_cooldown_nonzero_reads_as_not_ready(self):
        text = S.state_paragraph(ws(cd=2.5))
        self.assertIn("2.5", text)
        self.assertIn("still cooling down and not ready", text)

    def test_is_one_dense_paragraph_not_json(self):
        text = S.state_paragraph(ws())
        self.assertNotIn("{", text)
        self.assertNotIn("}", text)
        self.assertLess(len(text), 700)  # short and dense, not a wall of text


if __name__ == "__main__":
    unittest.main()
