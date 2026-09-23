"""Tests for tools/jev/scenarios.py: synthetic Observation snapshots are exactly contract-shaped.
No network."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import scenarios as S  # noqa: E402

REQUIRED_KEYS = {"clockSec", "self", "allies", "visibleEnemies", "nearbyMinions", "nearbyTowers"}
SELF_KEYS = {"id", "team", "lane", "instrument", "pos", "hp", "maxHp", "moveSpeed", "cooldowns"}


class BuildObservationTests(unittest.TestCase):
    def test_every_scenario_builds_a_contract_shaped_observation_for_every_instrument(self):
        for scenario in S.all_scenarios():
            for instrument in ("drums", "keytar", "violin"):
                obs = S.build_observation(scenario, "violet", instrument)
                self.assertEqual(set(obs), REQUIRED_KEYS, scenario.name)
                self.assertEqual(set(obs["self"]), SELF_KEYS, scenario.name)
                self.assertEqual(obs["self"]["instrument"], instrument)
                self.assertIn(obs["self"]["team"], ("violet", "green"))

    def test_hp_fraction_is_applied_against_the_instrument_max_hp(self):
        scenario = next(s for s in S.all_scenarios() if s.name == "low_hp_recall_under_pressure")
        obs = S.build_observation(scenario, "violet", "drums")
        self.assertAlmostEqual(obs["self"]["hp"], 0.20 * S.MAX_HP["drums"], places=1)

    def test_ability_ready_flags_drive_cooldowns(self):
        scenario = next(s for s in S.all_scenarios() if s.name == "ability_on_cooldown_enemy_present")
        obs = S.build_observation(scenario, "violet", "keytar")
        primary, ultimate = S.ABILITIES["keytar"]
        self.assertEqual(obs["self"]["cooldowns"][primary], 5.0)  # primary_ready=False
        self.assertEqual(obs["self"]["cooldowns"][ultimate], 0.0)  # ultimate_ready=True

    def test_scenario_names_are_unique(self):
        names = [s.name for s in S.all_scenarios()]
        self.assertEqual(len(names), len(set(names)))

    def test_enemy_and_minion_entities_carry_ids_and_positions(self):
        scenario = next(s for s in S.all_scenarios() if s.name == "clustered_enemies")
        obs = S.build_observation(scenario, "violet", "drums")
        self.assertGreaterEqual(len(obs["visibleEnemies"]), 2)
        for e in obs["visibleEnemies"]:
            self.assertIn("id", e)
            self.assertIn("pos", e)
            self.assertIn("kind", e)


if __name__ == "__main__":
    unittest.main()
