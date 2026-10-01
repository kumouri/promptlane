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


class HighestBountySelectorTests(unittest.TestCase):
    """docs/economy-spec.md §4.3: the enemy bearbot worth the most, else `nearest_enemy`."""

    def _bounty(self, id_, x, y, bounty, kind="bearbot"):
        e = entity(id_, x, y, kind=kind)
        e["bounty"] = bounty
        return e

    def test_picks_the_largest_bounty_not_the_nearest(self):
        obs = make_obs(enemies=[self._bounty("near-cheap", 10, 0, 600), self._bounty("far-rich", 500, 0, 850)])
        self.assertEqual(resolve_target("highest_bounty_enemy", obs), "far-rich")

    def test_ties_go_to_the_nearer_bearbot(self):
        obs = make_obs(enemies=[self._bounty("far", 500, 0, 600), self._bounty("near", 50, 0, 600)])
        self.assertEqual(resolve_target("highest_bounty_enemy", obs), "near")

    def test_minions_and_towers_are_never_the_target_while_a_bearbot_is_visible(self):
        obs = make_obs(enemies=[entity("mn", 1, 0, kind="minion"), self._bounty("bb", 300, 0, 600)])
        self.assertEqual(resolve_target("highest_bounty_enemy", obs), "bb")

    def test_without_a_bounty_it_falls_back_to_nearest_enemy(self):
        # no economy: bearbots carry no bounty field
        obs = make_obs(enemies=[entity("far-bb", 400, 0), entity("near-mn", 20, 0, kind="minion")])
        self.assertEqual(resolve_target("highest_bounty_enemy", obs), "near-mn")
        self.assertIsNone(resolve_target("highest_bounty_enemy", make_obs()))

    def test_it_is_in_the_translator_vocabulary(self):
        from translator import TARGET_SELECTORS

        self.assertIn("highest_bounty_enemy", TARGET_SELECTORS)


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


def with_stand(obs, status, pos=(300, 300)):
    obs["bandstand"] = {
        "site": "top-side", "pos": {"x": pos[0], "y": pos[1]}, "radius": 60, "status": status,
        "opensInSec": None, "progress": 0, "contested": False, "alliesOn": 0, "selfOn": False,
    }
    return obs


class BandstandSelectorTests(unittest.TestCase):
    """`bandstand` (docs/economy-spec.md §9.7): the stage while upcoming/open, else exactly push_lane."""

    def test_open_and_upcoming_resolve_to_the_stage_position(self):
        for status in ("open", "upcoming"):
            obs = with_stand(make_obs(team="violet"), status, pos=(700, 700))
            self.assertEqual(resolve_target("bandstand", obs), {"x": 700, "y": 700}, status)

    def test_closed_and_done_fall_back_to_exactly_push_lane(self):
        for team in ("violet", "green"):
            for status in ("closed", "done"):
                obs = with_stand(make_obs(team=team), status)
                self.assertEqual(resolve_target("bandstand", obs), resolve_target("push_lane", obs), (team, status))

    def test_no_bandstand_block_falls_back_to_exactly_push_lane(self):
        for team in ("violet", "green"):
            obs = make_obs(team=team)
            self.assertEqual(resolve_target("bandstand", obs), HOME_POS["green" if team == "violet" else "violet"])

    def test_returns_a_copy_not_the_observations_own_dict(self):
        obs = with_stand(make_obs(), "open")
        target = resolve_target("bandstand", obs)
        target["x"] = -1
        self.assertEqual(obs["bandstand"]["pos"]["x"], 300)


class InvalidSelectorTests(unittest.TestCase):
    def test_unknown_selector_raises(self):
        with self.assertRaises(ValueError):
            resolve_target("not-a-real-selector", make_obs())


if __name__ == "__main__":
    unittest.main()
