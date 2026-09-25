"""Tests for tools/jev/team_rules.py: docs/jev-vs-qwen32b-intent.md's cascade, pure functions over
hand-built worksheets, no network."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import team_rules as R  # noqa: E402


def ws(**overrides):
    base = dict(
        hp=200, max_hp=200, wave=1, tower=None, foe=None, foe_is_bearbot=False, foe_hp=None,
        foe_max_hp=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05,
    )
    base.update(overrides)
    return R.Worksheet(**base)


class RulePredicateTests(unittest.TestCase):
    def test_recall_threshold_is_a_fraction_of_max_hp(self):
        self.assertTrue(R.rule1_recall_low_hp(ws(instrument="drums", hp=39, max_hp=200)))  # 19.5% < 20%
        self.assertFalse(R.rule1_recall_low_hp(ws(instrument="drums", hp=40, max_hp=200)))  # exactly 20%
        self.assertTrue(R.rule1_recall_low_hp(ws(instrument="keytar", hp=69, max_hp=200)))  # 34.5% < 35%
        self.assertFalse(R.rule1_recall_low_hp(ws(instrument="keytar", hp=70, max_hp=200)))

    def test_drums_and_keytar_ability_fires_on_any_foe(self):
        self.assertTrue(R.rule2a_engage_ability(ws(instrument="drums", foe="mn-1", cd=0.0, foe_is_bearbot=False)))
        self.assertTrue(R.rule2a_engage_ability(ws(instrument="keytar", foe="mn-1", cd=0.0, foe_is_bearbot=False)))

    def test_violin_ability_only_fires_on_a_weakened_bearbot(self):
        healthy_bearbot = ws(instrument="violin", foe="bb-1", cd=0.0, foe_is_bearbot=True, foe_hp=150, foe_max_hp=200)
        weak_bearbot = ws(instrument="violin", foe="bb-1", cd=0.0, foe_is_bearbot=True, foe_hp=90, foe_max_hp=200)
        minion = ws(instrument="violin", foe="mn-1", cd=0.0, foe_is_bearbot=False)
        self.assertFalse(R.rule2a_engage_ability(healthy_bearbot))
        self.assertTrue(R.rule2a_engage_ability(weak_bearbot))
        self.assertFalse(R.rule2a_engage_ability(minion))

    def test_engage_attack_ignores_ability_condition(self):
        self.assertTrue(R.rule2b_engage_attack(ws(foe="bb-1")))
        self.assertFalse(R.rule2b_engage_attack(ws(foe=None)))

    def test_push_tower_needs_wave(self):
        self.assertTrue(R.rule3_push_tower_with_wave(ws(foe=None, tower="tw-1", wave=1)))
        self.assertFalse(R.rule3_push_tower_with_wave(ws(foe=None, tower="tw-1", wave=0)))
        self.assertFalse(R.rule3_push_tower_with_wave(ws(foe="bb-1", tower="tw-1", wave=1)))

    def test_regroup_needs_no_wave(self):
        self.assertTrue(R.rule4_regroup_no_wave(ws(foe=None, tower="tw-1", wave=0)))
        self.assertFalse(R.rule4_regroup_no_wave(ws(foe=None, tower="tw-1", wave=1)))

    def test_ride_wave_needs_no_foe_no_tower(self):
        self.assertTrue(R.rule5_ride_wave(ws(foe=None, tower=None, wave=1)))
        self.assertFalse(R.rule5_ride_wave(ws(foe=None, tower=None, wave=0)))
        self.assertFalse(R.rule5_ride_wave(ws(foe="bb-1", tower=None, wave=1)))


class CascadeOrderTests(unittest.TestCase):
    def test_engage_precedes_positioning_rules(self):
        """The fix runs/jev-house-bot-2026-09-23.md's confound exists to make: a foe present and a
        healthy bearbot must reach the engage rule before any go-home/ride-wave rule, regardless of
        whether a tower or wave is also visible."""
        w = ws(hp=200, max_hp=200, wave=0, tower="tw-1", foe="bb-1", cd=1.0)
        answers = R.ground_truth_answers(w)
        self.assertTrue(answers["q2b_engage_attack"])
        self.assertEqual(R.ground_truth_bucket(w), "attack_foe")
        self.assertNotEqual(R.ground_truth_bucket(w), "go_home")

    def test_first_true_wins(self):
        self.assertEqual(R.first_match({"q1_recall_low_hp": True, "q2b_engage_attack": True}), 1)
        self.assertEqual(R.first_match({"q2b_engage_attack": True, "q3_push_tower_with_wave": True}), 3)

    def test_falls_through_to_seven(self):
        self.assertEqual(R.first_match({}), 7)

    def test_bucket_for_rule_covers_one_through_seven(self):
        for n in range(1, 8):
            self.assertIn(R.bucket_for_rule(n), ("recall", "go_home", "ability", "attack_foe", "attack_tower", "ride_wave"))
        self.assertEqual(R.bucket_for_rule(7), "go_home")


class BucketForActionTests(unittest.TestCase):
    def test_recall_and_ability(self):
        self.assertEqual(R.bucket_for_action("recall", None, None, None, "violet"), "recall")
        self.assertEqual(R.bucket_for_action("ability", "bb-1", "bb-1", None, "violet"), "ability")

    def test_attack_foe_vs_tower(self):
        self.assertEqual(R.bucket_for_action("attack", "bb-1", "bb-1", "tw-1", "violet"), "attack_foe")
        self.assertEqual(R.bucket_for_action("attack", "tw-1", None, "tw-1", "violet"), "attack_tower")

    def test_move_home_is_team_specific(self):
        self.assertEqual(R.bucket_for_action("move", dict(R.HOME_TARGET["violet"]), None, None, "violet"), "go_home")
        self.assertEqual(R.bucket_for_action("move", dict(R.HOME_TARGET["green"]), None, None, "green"), "go_home")
        self.assertEqual(R.bucket_for_action("move", dict(R.HOME_TARGET["violet"]), None, None, "green"), "ride_wave")
        self.assertEqual(R.bucket_for_action("move", {"x": 5, "y": 5}, None, None, "violet"), "ride_wave")

    def test_hold_is_unclassifiable(self):
        self.assertIsNone(R.bucket_for_action("hold", None, None, None, "violet"))


class BindQuestionsTests(unittest.TestCase):
    def test_six_questions_in_cascade_order(self):
        bound = R.bind_questions("drums", ws())
        self.assertEqual([q.rule_number for q in bound], [1, 2, 3, 4, 5, 6])

    def test_instrument_specific_wording(self):
        violin_q2a = next(q for q in R.bind_questions("violin", ws()) if q.id == "q2a_engage_ability")
        drums_q2a = next(q for q in R.bind_questions("drums", ws()) if q.id == "q2a_engage_ability")
        self.assertIn("below 50%", violin_q2a.instructions)
        self.assertNotIn("below 50%", drums_q2a.instructions)


if __name__ == "__main__":
    unittest.main()
