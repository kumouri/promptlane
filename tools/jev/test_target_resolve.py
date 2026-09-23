"""Tests for tools/jev/target_resolve.py: deterministic selector -> concrete target. No network."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from scenarios import HOME_POS  # noqa: E402
from target_resolve import resolve_target  # noqa: E402


def make_obs(team="violet", pos=(0, 0), allies=(), enemies=(), minions=()):
    return {
        "self": {"team": team, "pos": {"x": pos[0], "y": pos[1]}},
        "allies": list(allies),
        "visibleEnemies": list(enemies),
        "nearbyMinions": list(minions),
    }


def entity(id_, x, y, hp=100, max_hp=100, kind="bearbot"):
    return {"id": id_, "pos": {"x": x, "y": y}, "hp": hp, "maxHp": max_hp, "kind": kind}


class NoneAndFixedSelectorsTests(unittest.TestCase):
    def test_none_selector_returns_none(self):
        self.assertIsNone(resolve_target(None, make_obs()))
        self.assertIsNone(resolve_target("none", make_obs()))

    def test_home_and_push_lane_are_team_relative(self):
        obs = make_obs(team="violet")
        self.assertEqual(resolve_target("home", obs), HOME_POS["violet"])
        self.assertEqual(resolve_target("push_lane", obs), HOME_POS["green"])
        obs_green = make_obs(team="green")
        self.assertEqual(resolve_target("home", obs_green), HOME_POS["green"])
        self.assertEqual(resolve_target("push_lane", obs_green), HOME_POS["violet"])


class EnemySelectorTests(unittest.TestCase):
    def test_nearest_enemy(self):
        obs = make_obs(pos=(0, 0), enemies=[entity("far", 500, 500), entity("near", 10, 10)])
        self.assertEqual(resolve_target("nearest_enemy", obs), "near")

    def test_nearest_enemy_empty_pool_is_none(self):
        self.assertIsNone(resolve_target("nearest_enemy", make_obs()))

    def test_lowest_hp_enemy_prefers_bearbots_over_other_kinds(self):
        obs = make_obs(enemies=[entity("weak-minion", 0, 0, hp=1, kind="minion"), entity("bb-mid", 0, 0, hp=50, kind="bearbot")])
        self.assertEqual(resolve_target("lowest_hp_enemy", obs), "bb-mid")

    def test_lowest_hp_enemy_falls_back_when_no_bearbot(self):
        obs = make_obs(enemies=[entity("m1", 0, 0, hp=30, kind="minion"), entity("m2", 0, 0, hp=10, kind="minion")])
        self.assertEqual(resolve_target("lowest_hp_enemy", obs), "m2")

    def test_densest_cluster_enemy_picks_the_crowded_one(self):
        obs = make_obs(
            enemies=[
                entity("alone", 1000, 1000),
                entity("cluster-a", 100, 100),
                entity("cluster-b", 110, 105),
                entity("cluster-c", 90, 95),
            ]
        )
        self.assertIn(resolve_target("densest_cluster_enemy", obs), ("cluster-a", "cluster-b", "cluster-c"))

    def test_isolated_enemy_picks_the_farthest_from_others(self):
        obs = make_obs(
            enemies=[
                entity("isolated", 900, 900),
                entity("cluster-a", 100, 100),
                entity("cluster-b", 110, 105),
            ]
        )
        self.assertEqual(resolve_target("isolated_enemy", obs), "isolated")

    def test_nearest_tower_ignores_bearbots(self):
        obs = make_obs(pos=(0, 0), enemies=[entity("bb-1", 5, 5), entity("tw-1", 50, 50, kind="tower")])
        self.assertEqual(resolve_target("nearest_tower", obs), "tw-1")

    def test_nearest_tower_none_when_no_tower_visible(self):
        obs = make_obs(enemies=[entity("bb-1", 5, 5)])
        self.assertIsNone(resolve_target("nearest_tower", obs))


class AllyAndMinionSelectorTests(unittest.TestCase):
    def test_threatened_ally_enemy_targets_the_enemy_nearest_the_weakest_ally(self):
        obs = make_obs(
            allies=[
                {"id": "ally-safe", "pos": {"x": 0, "y": 0}, "hp": 200, "maxHp": 200},
                {"id": "ally-hurt", "pos": {"x": 500, "y": 500}, "hp": 20, "maxHp": 200},
            ],
            enemies=[entity("near-hurt-ally", 505, 505), entity("near-safe-ally", 1, 1)],
        )
        self.assertEqual(resolve_target("threatened_ally_enemy", obs), "near-hurt-ally")

    def test_threatened_ally_enemy_none_without_allies_or_enemies(self):
        self.assertIsNone(resolve_target("threatened_ally_enemy", make_obs()))

    def test_nearby_minion_returns_a_position_not_an_id(self):
        obs = make_obs(team="violet", pos=(0, 0), minions=[{"id": "m-1", "team": "violet", "pos": {"x": 20, "y": 20}}])
        target = resolve_target("nearby_minion", obs)
        self.assertEqual(target, {"x": 20, "y": 20})

    def test_nearby_minion_ignores_enemy_team_minions(self):
        obs = make_obs(team="violet", minions=[{"id": "m-enemy", "team": "green", "pos": {"x": 1, "y": 1}}])
        self.assertIsNone(resolve_target("nearby_minion", obs))


class InvalidSelectorTests(unittest.TestCase):
    def test_unknown_selector_raises(self):
        with self.assertRaises(ValueError):
            resolve_target("not-a-real-selector", make_obs())


if __name__ == "__main__":
    unittest.main()
