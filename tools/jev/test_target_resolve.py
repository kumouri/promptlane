"""Tests for tools/jev/target_resolve.py: deterministic selector -> concrete target. No network."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from scenarios import HOME_POS  # noqa: E402
from target_resolve import (  # noqa: E402
    FOUNTAIN_RADIUS,
    LANES,
    TARGETING_FIRST_MIN,
    TARGETING_OWN_LANE_1,
    TIE_TOLERANCE,
    lane_of,
    lane_start,
    resolve_target,
)


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


def mirror_pos(p):
    return {"x": p["y"], "y": p["x"]}


def mirror_obs(obs, noise=0.0):
    """`obs` as the other side sees the mirrored state: (x, y) -> (y, x), the teams swapped, and
    `noise` added to every coordinate, the size of the sim's own mirror error (#56: ~1e-11)."""
    swap = {"violet": "green", "green": "violet"}

    def pos(p):
        m = mirror_pos(p)
        return {"x": m["x"] + noise, "y": m["y"] - noise}

    out = {"self": {**obs["self"], "team": swap[obs["self"]["team"]], "pos": pos(obs["self"]["pos"])}}
    for key in ("allies", "visibleEnemies", "nearbyMinions"):
        out[key] = [{**e, "pos": pos(e["pos"]), **({"team": swap[e["team"]]} if "team" in e else {})} for e in obs.get(key, [])]
    return out


def mirror_target(t):
    return mirror_pos(t) if isinstance(t, dict) else t


def minion(id_, team, x, y):
    return {"id": id_, "team": team, "pos": {"x": x, "y": y}, "hp": 60, "maxHp": 60}


def wave_at_fountain(team, out=42.5):
    """Each lane's allied minion `out` units from `team`'s base -- the three-way tie Bandstand 4 traced
    (runs/bandstand-4-2026-10-01.md: all three 42.5 away)."""
    if team == "violet":
        return [minion("mn-1", team, 100, 900 - out), minion("mn-2", team, 100 + out / 2 ** 0.5, 900 - out / 2 ** 0.5), minion("mn-3", team, 100 + out, 900)]
    return [minion("mn-4", team, 900 - out, 100), minion("mn-5", team, 900 - out / 2 ** 0.5, 100 + out / 2 ** 0.5), minion("mn-6", team, 900, 100 + out)]


def bot(team, lane, pos):
    return {"self": {"team": team, "lane": lane, "pos": {"x": pos[0], "y": pos[1]}}, "allies": [], "visibleEnemies": [], "nearbyMinions": []}


class LaneStartTests(unittest.TestCase):
    def test_lane_starts_are_where_the_sim_spawns_each_bot_and_mirror_each_other(self):
        # src/sim/match.ts: pointAlongPath(LANE_PATHS[lane], violet ? 0.08 : 0.92)
        expected = {"top": (100, 772), "mid": (164, 836), "bottom": (228, 900)}
        for lane, (x, y) in expected.items():
            v = lane_start(lane, "violet")
            self.assertAlmostEqual(v["x"], x, places=9)
            self.assertAlmostEqual(v["y"], y, places=9)
            g = lane_start(lane, "green")
            self.assertAlmostEqual(g["x"], y, places=9, msg=lane)
            self.assertAlmostEqual(g["y"], x, places=9, msg=lane)
            self.assertEqual(lane_of(v), lane)

    def test_every_lane_start_is_outside_the_fountain(self):
        for team in ("violet", "green"):
            for lane in LANES:
                start = lane_start(lane, team)
                home = HOME_POS[team]
                self.assertGreater(((start["x"] - home["x"]) ** 2 + (start["y"] - home["y"]) ** 2) ** 0.5, FOUNTAIN_RADIUS + 30)


class FountainRuleTests(unittest.TestCase):
    """own-lane-1: at its fountain, `nearby_minion` is the start of the bot's own lane."""

    def test_at_the_fountain_every_bot_heads_down_its_own_lane(self):
        for team in ("violet", "green"):
            for lane in LANES:
                obs = bot(team, lane, (HOME_POS[team]["x"], HOME_POS[team]["y"]))
                obs["nearbyMinions"] = wave_at_fountain(team)
                self.assertEqual(resolve_target("nearby_minion", obs), lane_start(lane, team), (team, lane))

    def test_it_is_structural_not_a_tie_break(self):
        # one lane's minion clearly nearer: a bot at its fountain still takes its own lane
        obs = bot("violet", "bottom", (100, 900))
        obs["nearbyMinions"] = [minion("mn-1", "violet", 100, 880), minion("mn-3", "violet", 220, 900)]
        self.assertEqual(resolve_target("nearby_minion", obs), lane_start("bottom", "violet"))

    def test_the_fountain_is_the_nexus_radius(self):
        inside = bot("violet", "mid", (100 + FOUNTAIN_RADIUS - 0.5, 900))
        inside["nearbyMinions"] = wave_at_fountain("violet")
        self.assertEqual(resolve_target("nearby_minion", inside), lane_start("mid", "violet"))
        outside = bot("violet", "mid", (100 + FOUNTAIN_RADIUS + 0.5, 900))
        outside["nearbyMinions"] = wave_at_fountain("violet")
        self.assertEqual(resolve_target("nearby_minion", outside), {"x": 142.5, "y": 900}, "past the fountain: the nearest minion")

    def test_from_its_lane_start_a_bot_rides_the_nearest_minion_again(self):
        start = lane_start("top", "violet")
        obs = bot("violet", "top", (start["x"], start["y"]))
        obs["nearbyMinions"] = wave_at_fountain("violet", out=150)
        self.assertEqual(resolve_target("nearby_minion", obs), {"x": 100, "y": 750})

    def test_no_allied_minion_in_sight_is_still_no_target(self):
        obs = bot("green", "top", (900, 100))
        obs["nearbyMinions"] = [minion("mn-1", "violet", 880, 100)]
        self.assertIsNone(resolve_target("nearby_minion", obs))

    def test_first_min_keeps_the_old_answer_a_minion_picked_by_distance(self):
        obs = bot("violet", "bottom", (100, 900))
        obs["nearbyMinions"] = wave_at_fountain("violet")
        target = resolve_target("nearby_minion", obs, TARGETING_FIRST_MIN)
        self.assertIn(target, [m["pos"] for m in obs["nearbyMinions"]])

    def test_unknown_targeting_raises(self):
        with self.assertRaises(ValueError):
            resolve_target("nearby_minion", bot("violet", "top", (100, 900)), "nearest-ish")


class TieToleranceTests(unittest.TestCase):
    """own-lane-1: within TIE_TOLERANCE is a tie, broken side-symmetrically; float noise decides nothing."""

    NOISE = 1e-11

    def assert_mirrored(self, selector, obs):
        mine = resolve_target(selector, obs, TARGETING_OWN_LANE_1)
        theirs = resolve_target(selector, mirror_obs(obs, self.NOISE), TARGETING_OWN_LANE_1)
        self.assertIsNotNone(mine)
        if isinstance(mine, dict):
            self.assertAlmostEqual(theirs["x"], mirror_target(mine)["x"], places=6, msg=selector)
            self.assertAlmostEqual(theirs["y"], mirror_target(mine)["y"], places=6, msg=selector)
        else:
            self.assertEqual(theirs, mine, selector)
        return mine

    def test_nearby_minion_off_the_fountain(self):
        # a bot on the mirror axis, two allied minions equally far either side of it
        obs = bot("violet", "mid", (400, 600))
        obs["nearbyMinions"] = [minion("mn-1", "violet", 300, 600), minion("mn-2", "violet", 400, 500)]
        self.assert_mirrored("nearby_minion", obs)

    def test_enemy_selectors(self):
        obs = bot("violet", "mid", (500, 500))
        obs["visibleEnemies"] = [entity("bb-4", 450, 500), entity("bb-5", 500, 450), entity("tw-1", 600, 500, kind="tower"), entity("tw-2", 500, 600, kind="tower")]
        obs["allies"] = [{"id": "bb-2", "pos": {"x": 500, "y": 500}, "hp": 10, "maxHp": 200}]
        for selector in ("nearest_enemy", "nearest_tower", "threatened_ally_enemy", "isolated_enemy"):
            self.assert_mirrored(selector, obs)

    def test_highest_bounty_enemy_ties_on_bounty_then_distance(self):
        obs = bot("violet", "mid", (500, 500))
        obs["visibleEnemies"] = [{**entity("bb-4", 450, 500), "bounty": 300}, {**entity("bb-5", 500, 450), "bounty": 300}]
        self.assert_mirrored("highest_bounty_enemy", obs)

    def test_a_gap_wider_than_the_tolerance_is_not_a_tie(self):
        near, far = 10.0, 10.0 + 2 * TIE_TOLERANCE
        obs = make_obs(pos=(0, 0), enemies=[entity("far", far, 0), entity("near", 0, near)])
        self.assertEqual(resolve_target("nearest_enemy", obs), "near")

    def test_within_the_tolerance_the_bots_own_lane_wins(self):
        # a mid bot between mid and bottom: a bottom minion 100 away, a mid minion 100.3 away
        obs = bot("violet", "mid", (300, 800))
        t = (1000 - (1000 ** 2 - 8 * (300 ** 2 + 200 ** 2 - 100.3 ** 2)) ** 0.5) / 4  # (t, 1000 - t) on mid, 100.3 out
        obs["nearbyMinions"] = [minion("mn-3", "violet", 300, 900), minion("mn-2", "violet", t, 1000 - t)]
        self.assertEqual([lane_of(m["pos"]) for m in obs["nearbyMinions"]], ["bottom", "mid"])
        self.assertEqual(resolve_target("nearby_minion", obs), obs["nearbyMinions"][1]["pos"])
        self.assertEqual(resolve_target("nearby_minion", obs, TARGETING_FIRST_MIN), {"x": 300, "y": 900})


class InvalidSelectorTests(unittest.TestCase):
    def test_unknown_selector_raises(self):
        with self.assertRaises(ValueError):
            resolve_target("not-a-real-selector", make_obs())


if __name__ == "__main__":
    unittest.main()
