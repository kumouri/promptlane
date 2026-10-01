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

    def test_offline_foe_clause_is_unchanged(self):
        text = S.state_paragraph(ws(foe="bb-3"))
        self.assertIn("An enemy is targeted as a foe, id bb-3.", text)

    def test_live_foe_clause_states_kind_and_hp_against_100(self):
        low = S.state_paragraph(ws(foe="bb-3", foe_detail=True, foe_kind="bearbot", foe_hp=62))
        self.assertIn("enemy bearbot", low)
        self.assertIn("62, which is below 100", low)
        high = S.state_paragraph(ws(foe="bb-3", foe_detail=True, foe_kind="bearbot", foe_hp=140))
        self.assertIn("140, which is at or above 100", high)
        minion = S.state_paragraph(ws(foe="mn-9", foe_detail=True, foe_kind="minion", foe_hp=20))
        self.assertIn("minion (not a bearbot)", minion)

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


class BandstandStateTests(unittest.TestCase):
    """The Bandstand clause appears only with the objective (`stand` set); without it the paragraph
    and the object are byte-for-byte the pre-Bandstand ones."""

    PRE_BANDSTAND = (
        "This is a violet-team bearbot playing keytar, 0.1 sim-seconds into the match (tick 1). Its own hp "
        "is 200, which is at or above the 75-hp recall threshold. 1 allied minion are nearby in its wave "
        "(wave count 1). No enemy tower or nexus is visible right now. No enemy bearbot or minion is "
        "currently targeted as a foe. Its instrument ability's cooldown is 0.0 seconds, meaning the ability "
        "is off cooldown and ready to use."
    )

    def test_no_objective_paragraph_is_the_pre_bandstand_text(self):
        self.assertEqual(S.state_paragraph(ws()), self.PRE_BANDSTAND)
        self.assertNotIn("Bandstand", S.state_paragraph(ws(foe_detail=True, foe="bb-3", foe_kind="bearbot", foe_hp=62)))

    def test_no_objective_object_has_the_pre_bandstand_keys(self):
        self.assertEqual(
            list(S.state_object(ws())),
            ["team", "instrument", "tick", "clock_sec", "hp", "hp_recall_threshold", "wave", "tower", "foe", "cd", "cd_ready_threshold"],
        )

    def test_open_states_hp_against_half_of_max(self):
        above = S.state_paragraph(ws(hp=120, stand="open", max_hp=140))
        self.assertTrue(above.startswith(self.PRE_BANDSTAND.replace("is 200,", "is 120,")))
        self.assertTrue(above.endswith("The Bandstand is open. Its own hp of 120 is above 70, half of its 140 maxHp, the Bandstand threshold."))
        below = S.state_paragraph(ws(hp=75, stand="open", max_hp=150))
        self.assertIn("Its own hp of 75 is at or below 75, half of its 150 maxHp", below)

    def test_not_open_says_so(self):
        for status in ("closed", "upcoming", "done"):
            self.assertTrue(S.state_paragraph(ws(stand=status, max_hp=140)).endswith(f"The Bandstand is {status}, not open."))

    def test_object_carries_stand_and_its_threshold(self):
        obj = S.state_object(ws(hp=120, stand="open", max_hp=140))
        self.assertEqual((obj["stand"], obj["max_hp"], obj["hp_bandstand_threshold"]), ("open", 140, 70))


class StateObjectTests(unittest.TestCase):
    def test_is_a_plain_dict_not_prose(self):
        obj = S.state_object(ws(hp=48, tower="tw-7", foe="bb-3", cd=1.5, wave=2))
        self.assertIsInstance(obj, dict)

    def test_carries_the_raw_worksheet_fields(self):
        obj = S.state_object(ws(hp=48, wave=2, tower="tw-7", foe="bb-3", cd=1.5, instrument="drums", team="green", tick=99, clock_sec=12.3))
        self.assertEqual(obj["hp"], 48)
        self.assertEqual(obj["wave"], 2)
        self.assertEqual(obj["tower"], "tw-7")
        self.assertEqual(obj["foe"], "bb-3")
        self.assertEqual(obj["cd"], 1.5)
        self.assertEqual(obj["instrument"], "drums")
        self.assertEqual(obj["team"], "green")
        self.assertEqual(obj["tick"], 99)
        self.assertEqual(obj["clock_sec"], 12.3)

    def test_carries_no_interpretive_clauses(self):
        obj = S.state_object(ws(hp=48))
        for value in obj.values():
            if isinstance(value, str):
                self.assertNotIn("threshold", value)
                self.assertNotIn("below", value)

    def test_absence_is_none_not_a_sentinel_string(self):
        obj = S.state_object(ws(tower=None, foe=None))
        self.assertIsNone(obj["tower"])
        self.assertIsNone(obj["foe"])


if __name__ == "__main__":
    unittest.main()
