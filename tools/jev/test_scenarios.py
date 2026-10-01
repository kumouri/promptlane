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


STAND_KEYS = {"site", "pos", "radius", "status", "opensInSec", "progress", "contested", "alliesOn", "selfOn"}


class ObjectiveScenarioTests(unittest.TestCase):
    """Matches with the river objective carry the `bandstand` block and Encore fields (contract:
    docs/economy-spec.md §9.7); the original twelve stay exactly as they were."""

    def test_original_scenarios_are_untouched(self):
        self.assertEqual(len(S.all_scenarios()), 12)
        for scenario in S.all_scenarios():
            self.assertIsNone(scenario.bandstand, scenario.name)

    def test_objective_scenarios_carry_the_block_and_encore_fields(self):
        sites = {s["id"]: {"x": s["x"], "y": s["y"]} for s in S.river_rules()["sites"]}
        for scenario in S.objective_scenarios():
            for team in ("violet", "green"):
                obs = S.build_observation(scenario, team, "keytar")
                self.assertEqual(set(obs), REQUIRED_KEYS | {"bandstand"}, scenario.name)
                self.assertEqual(set(obs["self"]), SELF_KEYS | {"encoreSec"}, scenario.name)
                stand = obs["bandstand"]
                self.assertEqual(set(stand), STAND_KEYS, scenario.name)
                self.assertEqual(stand["pos"], sites[stand["site"]], scenario.name)
                self.assertEqual(stand["radius"], S.river_rules()["radius"])
                self.assertIn(stand["status"], ("closed", "upcoming", "open", "done"))
                self.assertEqual(stand["opensInSec"] is None, stand["status"] in ("open", "done"), scenario.name)
                for a in obs["allies"]:
                    self.assertIn("encoreSec", a)
                for e in obs["visibleEnemies"]:
                    self.assertEqual("encore" in e, e["kind"] == "bearbot")

    def test_encore_values_land_on_the_named_entities(self):
        scenario = next(s for s in S.objective_scenarios() if s.name == "encore_weak_enemy_visible")
        obs = S.build_observation(scenario, "violet", "drums")
        self.assertEqual(obs["self"]["encoreSec"], 21.0)
        self.assertEqual({a["id"]: a["encoreSec"] for a in obs["allies"]}, {"ally-encore": 21.0})
        self.assertEqual({e["id"]: e["encore"] for e in obs["visibleEnemies"]}, {"enemy-weak": False, "enemy-encore": True})

    def test_objective_scenario_names_are_unique_across_both_sets(self):
        names = [s.name for s in S.all_scenarios() + S.objective_scenarios()]
        self.assertEqual(len(names), len(set(names)))


if __name__ == "__main__":
    unittest.main()
