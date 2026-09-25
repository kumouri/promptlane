"""Tests for tools/jev/rules.py: the house-violet.md rule -> question mapping, pure functions
over hand-built worksheets, no network, no checked-in run data."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import rules as R  # noqa: E402


def ws(**overrides):
    base = dict(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
    base.update(overrides)
    return R.Worksheet(**base)


class RulePredicateTests(unittest.TestCase):
    def test_rule1_low_hp(self):
        self.assertTrue(R.rule1_low_hp(ws(hp=74.9)))
        self.assertFalse(R.rule1_low_hp(ws(hp=75)))

    def test_rule2_tower_no_wave(self):
        self.assertTrue(R.rule2_tower_no_wave(ws(tower="tw-1", wave=0)))
        self.assertFalse(R.rule2_tower_no_wave(ws(tower="tw-1", wave=1)))
        self.assertFalse(R.rule2_tower_no_wave(ws(tower=None, wave=0)))

    def test_rule3_ability_ready_reduced(self):
        self.assertTrue(R.rule3_ability_ready(ws(cd=0.0, foe="bb-1")))
        self.assertFalse(R.rule3_ability_ready(ws(cd=0.5, foe="bb-1")))
        self.assertFalse(R.rule3_ability_ready(ws(cd=0.0, foe=None)))

    def test_rule4_foe_present(self):
        self.assertTrue(R.rule4_foe_present(ws(foe="bb-1")))
        self.assertFalse(R.rule4_foe_present(ws(foe=None)))

    def test_rule5_tower_present(self):
        self.assertTrue(R.rule5_tower_present(ws(tower="tw-1")))
        self.assertFalse(R.rule5_tower_present(ws(tower=None)))

    def test_rule6_wave_present(self):
        self.assertTrue(R.rule6_wave_present(ws(foe=None, tower=None, wave=1)))
        self.assertFalse(R.rule6_wave_present(ws(foe=None, tower=None, wave=0)))
        self.assertFalse(R.rule6_wave_present(ws(foe="bb-1", tower=None, wave=1)))


class FirstMatchTests(unittest.TestCase):
    def test_first_true_wins(self):
        self.assertEqual(R.first_match({"q1_low_hp_recall": True, "q4_foe_present_attack": True}), 1)
        self.assertEqual(R.first_match({"q4_foe_present_attack": True, "q5_tower_present_attack": True}), 4)

    def test_falls_through_to_seven(self):
        self.assertEqual(R.first_match({}), 7)
        self.assertEqual(
            R.first_match(
                {
                    "q1_low_hp_recall": False,
                    "q2_tower_no_wave_go_home": False,
                    "q3_ability_ready": False,
                    "q4_foe_present_attack": False,
                    "q5_tower_present_attack": False,
                    "q6_wave_present_ride": False,
                }
            ),
            7,
        )

    def test_bucket_for_rule_covers_all_seven(self):
        for n in range(1, 8):
            self.assertIn(R.bucket_for_rule(n), ("recall", "go_home", "ability", "attack_foe", "attack_tower", "ride_wave"))
        self.assertEqual(R.bucket_for_rule(2), R.bucket_for_rule(7))  # both "go_home", same action


class BucketForActionTests(unittest.TestCase):
    def test_recall(self):
        self.assertEqual(R.bucket_for_action("recall", None, None, None), "recall")

    def test_ability(self):
        self.assertEqual(R.bucket_for_action("ability", "bb-1", "bb-1", None), "ability")

    def test_attack_foe_vs_tower(self):
        self.assertEqual(R.bucket_for_action("attack", "bb-1", "bb-1", "tw-1"), "attack_foe")
        self.assertEqual(R.bucket_for_action("attack", "tw-1", None, "tw-1"), "attack_tower")

    def test_attack_neither_is_unclassifiable(self):
        self.assertIsNone(R.bucket_for_action("attack", "mn-9", "bb-1", "tw-1"))

    def test_move_home_vs_ride(self):
        self.assertEqual(R.bucket_for_action("move", dict(R.HOME_TARGET), None, None), "go_home")
        self.assertEqual(R.bucket_for_action("move", {"x": 5, "y": 5}, None, None), "ride_wave")

    def test_hold_is_unclassifiable(self):
        self.assertIsNone(R.bucket_for_action("hold", None, None, None))


class BindQuestionsTests(unittest.TestCase):
    def test_six_questions_in_rule_order(self):
        bound = R.bind_questions("drums", ws(hp=200, wave=1, tower=None, foe=None, cd=0.0))
        self.assertEqual([q.rule_number for q in bound], [1, 2, 3, 4, 5, 6])
        self.assertEqual(
            [q.id for q in bound],
            [
                "q1_low_hp_recall",
                "q2_tower_no_wave_go_home",
                "q3_ability_ready",
                "q4_foe_present_attack",
                "q5_tower_present_attack",
                "q6_wave_present_ride",
            ],
        )

    def test_ground_truth_value_matches_predicate(self):
        w = ws(hp=50, wave=0, tower="tw-1", foe=None, cd=0.0)
        bound = R.bind_questions("keytar", w)
        by_id = {q.id: q for q in bound}
        self.assertTrue(by_id["q1_low_hp_recall"].ground_truth_value)
        self.assertTrue(by_id["q2_tower_no_wave_go_home"].ground_truth_value)
        self.assertFalse(by_id["q4_foe_present_attack"].ground_truth_value)

    def test_non_keytar_q3_flags_the_missing_foe_data(self):
        bound = R.bind_questions("violin", ws())
        q3 = next(q for q in bound if q.id == "q3_ability_ready")
        self.assertIn("not available in this dataset", q3.instructions)
        keytar_bound = R.bind_questions("keytar", ws())
        keytar_q3 = next(q for q in keytar_bound if q.id == "q3_ability_ready")
        self.assertNotIn("not available in this dataset", keytar_q3.instructions)


class LiveRule3Tests(unittest.TestCase):
    """The live path (`foe_detail=True`) evaluates house-violet.md's real rule 3."""

    def live(self, **overrides):
        return ws(foe_detail=True, **overrides)

    def test_violin_drums_need_a_bearbot_under_100(self):
        for inst in ("violin", "drums"):
            self.assertTrue(R.rule3_ability_ready(self.live(instrument=inst, foe="bb-1", foe_kind="bearbot", foe_hp=99)))
            self.assertFalse(R.rule3_ability_ready(self.live(instrument=inst, foe="bb-1", foe_kind="bearbot", foe_hp=100)))
            self.assertFalse(R.rule3_ability_ready(self.live(instrument=inst, foe="mn-1", foe_kind="minion", foe_hp=10)))
            self.assertFalse(R.rule3_ability_ready(self.live(instrument=inst, cd=1.0, foe="bb-1", foe_kind="bearbot", foe_hp=10)))

    def test_keytar_fires_on_any_foe(self):
        self.assertTrue(R.rule3_ability_ready(self.live(instrument="keytar", foe="mn-1", foe_kind="minion", foe_hp=300)))
        self.assertFalse(R.rule3_ability_ready(self.live(instrument="keytar", foe=None)))

    def test_offline_worksheet_keeps_the_approximation(self):
        self.assertTrue(R.rule3_ability_ready(ws(instrument="violin", foe="mn-1")))

    def test_live_q3_asks_the_real_condition(self):
        q3 = next(q for q in R.bind_questions("drums", self.live(foe="bb-1", foe_kind="bearbot", foe_hp=80)) if q.id == "q3_ability_ready")
        self.assertIn("less than 100 hp", q3.instructions)
        self.assertNotIn("not available in this dataset", q3.instructions)
        self.assertTrue(q3.ground_truth_value)
        keytar_q3 = next(q for q in R.bind_questions("keytar", self.live()) if q.id == "q3_ability_ready")
        self.assertNotIn("100 hp", keytar_q3.instructions)

    def test_ground_truth_cascade_skips_ability_for_a_healthy_bearbot(self):
        answers = R.ground_truth_answers(self.live(instrument="violin", foe="bb-1", foe_kind="bearbot", foe_hp=140))
        self.assertEqual(R.bucket_for_rule(R.first_match(answers)), "attack_foe")


if __name__ == "__main__":
    unittest.main()
