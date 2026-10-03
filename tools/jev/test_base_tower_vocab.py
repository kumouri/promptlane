#!/usr/bin/env python3
"""A map with base towers on the Python side (runs/bots-push-to-base-2026-10-02.md): vocab-2's
description of both base towers (from the observation's `baseTowers`, which `src/baseTower.ts` fills
from the sim's own rule), the `enemy_base_tower` target, and the translator's offer of both to a
compile told such a map. Every other map and vocab-1 are checked unchanged alongside."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import translator as T  # noqa: E402
from compile import schema_from_dict, schema_to_dict  # noqa: E402
from fidelity_harness import describe_observation  # noqa: E402
from scenarios import ABILITIES  # noqa: E402
from target_resolve import resolve_target  # noqa: E402
from vocab import (FACTS_BASE, FACTS_PVP2, FACTS_V2, VOCAB_1, VOCAB_2, facts_for, map_has_base_tower,  # noqa: E402
                   map_has_teleport, map_spec)

MAP = "pvp-1-hp300-base700"
MAP2 = "pvp-2-hp400-base950"


def P(x, y):
    return {"x": x, "y": y}


def base_block(enemy_open=False, own_open=False, enemy_hp=700, enemy_alive=True):
    return {
        "own": {"id": "tw-12", "pos": P(170.7, 829.3), "hp": 700, "maxHp": 700, "alive": True, "canBeHit": own_open},
        "enemy": {"id": "tw-13", "pos": P(829.3, 170.7), "hp": enemy_hp, "maxHp": 700, "alive": enemy_alive,
                  "canBeHit": enemy_open and enemy_alive},
    }


def obs(pos=(700, 300), team="violet", instrument="violin", lane="mid", **extra):
    max_hp = {"drums": 220, "keytar": 140, "violin": 150}[instrument]
    o = {
        "clockSec": 400,
        "self": {"id": "bb-3", "team": team, "lane": lane, "instrument": instrument, "pos": P(*pos), "hp": max_hp, "maxHp": max_hp,
                 "moveSpeed": 60, "cooldowns": {a: 0 for a in ABILITIES[instrument]}},
        "allies": [], "visibleEnemies": [], "nearbyMinions": [], "nearbyTowers": [],
    }
    o.update(extra)
    return o


class Description(unittest.TestCase):
    def test_both_base_towers_are_stated_only_when_the_observation_has_them(self):
        plain = describe_observation(obs(), VOCAB_2, MAP)
        self.assertNotIn("base tower", plain)
        shut = describe_observation(obs(baseTowers=base_block()), VOCAB_2, MAP)
        self.assertTrue(shut.startswith(plain + " "), "the lines are appended; every other sentence is unchanged")
        self.assertIn("Out of sight, map-wide: the enemy base tower tw-13 can't be hit yet: it takes no damage until one of their inner "
                      "towers is down.", shut)
        self.assertIn("Your base tower tw-12 can't be hit yet.", shut)
        self.assertNotIn("can be hit now", shut)

    def test_open_states_hp_and_the_win_but_no_position(self):
        # §1.4: with a position and a distance, Jev read the far base tower as "an enemy tower in sight"
        far = describe_observation(obs(pos=(300, 700), baseTowers=base_block(enemy_open=True, enemy_hp=412.5)), VOCAB_2, MAP)
        self.assertIn("Out of sight, map-wide: the enemy base tower tw-13 can be hit now (one of their inner towers is down; 412/700 hp), "
                      "and destroying it wins the match.", far)
        self.assertNotIn("(829,171)", far)
        self.assertNotIn("units away, and destroying", far)
        listed = {"id": "tw-13", "team": "green", "lane": "mid", "pos": P(829.3, 170.7), "hp": 412.5, "maxHp": 700, "alive": True}
        near = describe_observation(obs(nearbyTowers=[listed], baseTowers=base_block(enemy_open=True, enemy_hp=412.5)), VOCAB_2, MAP)
        self.assertIn("The enemy base tower is tw-13, listed above: it can be hit now (one of their inner towers is down; 412/700 hp), "
                      "and destroying it wins the match.", near)
        own = describe_observation(obs(baseTowers=base_block(own_open=True)), VOCAB_2, MAP)
        self.assertIn("Your base tower tw-12 can be hit now: one of your inner towers is down, and if it falls your team loses.", own)

    def test_destroyed(self):
        text = describe_observation(obs(baseTowers=base_block(enemy_open=True, enemy_alive=False, enemy_hp=0)), VOCAB_2, MAP)
        self.assertIn("The enemy base tower tw-13 is destroyed.", text)

    def test_the_tower_line_names_a_base_tower(self):
        tower = {"id": "tw-13", "team": "green", "lane": "mid", "pos": P(829.3, 170.7), "hp": 700, "maxHp": 700, "alive": True}
        lane_tower = {"id": "tw-9", "team": "green", "lane": "mid", "pos": P(772, 228), "hp": 500, "maxHp": 500, "alive": True}
        o = obs(nearbyTowers=[tower, lane_tower], baseTowers=base_block())
        text = describe_observation(o, VOCAB_2, MAP)
        self.assertIn("Enemy tower tw-13 (mid, base tower, 700/700 hp)", text)
        self.assertIn("Enemy tower tw-9 (mid, 500/500 hp)", text)
        without = describe_observation(obs(nearbyTowers=[tower, lane_tower]), VOCAB_2, MAP)
        self.assertIn("Enemy tower tw-13 (mid, 700/700 hp)", without, "no baseTowers: the line is as before")

    def test_vocab1_never_states_them(self):
        self.assertEqual(describe_observation(obs(baseTowers=base_block(enemy_open=True)), VOCAB_1),
                         describe_observation(obs(), VOCAB_1))

    def test_the_fact_lead_is_in_the_description_and_the_facts_list_needs_the_map(self):
        text = describe_observation(obs(baseTowers=base_block()), VOCAB_2, MAP)
        for fact in FACTS_BASE:
            self.assertIn(fact.lead, text, fact.key)
        self.assertEqual(facts_for(VOCAB_2, MAP), FACTS_V2 + FACTS_BASE)
        self.assertEqual(facts_for(VOCAB_2, MAP2), FACTS_V2 + FACTS_PVP2 + FACTS_BASE)
        self.assertEqual(facts_for(VOCAB_2, "pvp-1-hp400"), FACTS_V2)
        self.assertEqual(facts_for(VOCAB_2, "pvp-2"), FACTS_V2 + FACTS_PVP2)
        self.assertEqual(facts_for(VOCAB_1, MAP), ())

    def test_maps(self):
        self.assertTrue(map_has_base_tower(MAP) and map_has_base_tower(MAP2))
        self.assertTrue(map_has_teleport(MAP2) and not map_has_teleport(MAP))
        self.assertFalse(map_has_base_tower("pvp-1") or map_has_base_tower("pvp-2") or map_has_base_tower(None))
        self.assertTrue(map_has_base_tower({"name": "x", "baseTower": {"hp": 1}}))
        self.assertEqual(map_spec(MAP2).scale, 1.33)
        self.assertEqual(map_spec(MAP2).fractions("mid"), (0.16, 0.375))


class Target(unittest.TestCase):
    def test_enemy_base_tower_is_its_id_wherever_it_is(self):
        o = obs(baseTowers=base_block(enemy_open=True))
        self.assertEqual(resolve_target("enemy_base_tower", o, "own-lane-1", VOCAB_2, MAP), "tw-13")
        self.assertEqual(resolve_target("enemy_base_tower", obs(baseTowers=base_block()), "own-lane-1", VOCAB_2, MAP), "tw-13",
                         "the rule's condition says whether to go; the target is the tower")

    def test_none_without_one(self):
        self.assertIsNone(resolve_target("enemy_base_tower", obs(), "own-lane-1", VOCAB_2, "pvp-1"))
        self.assertIsNone(resolve_target("enemy_base_tower", obs(baseTowers=base_block(enemy_alive=False, enemy_hp=0)), "own-lane-1", VOCAB_2, MAP))
        with self.assertRaises(ValueError):
            resolve_target("enemy_base_tower", obs(baseTowers=base_block()), "own-lane-1", VOCAB_1, MAP)

    def test_nearest_tower_with_none_listed_is_the_open_enemy_base_tower(self):
        # §1.5: with the base tower open, "is an enemy tower in sight?" read yes with none listed; the rule gets that tower
        self.assertEqual(resolve_target("nearest_tower", obs(baseTowers=base_block(enemy_open=True)), "own-lane-1", VOCAB_2, MAP), "tw-13")
        self.assertIsNone(resolve_target("nearest_tower", obs(baseTowers=base_block()), "own-lane-1", VOCAB_2, MAP), "shut: nothing, as before")
        self.assertIsNone(resolve_target("nearest_tower", obs(), "own-lane-1", VOCAB_2, "pvp-1"), "no base towers: nothing, as before")
        lane_tower = {"id": "tw-9", "team": "green", "lane": "mid", "pos": P(772, 228), "hp": 500, "maxHp": 500, "alive": True}
        self.assertEqual(resolve_target("nearest_tower", obs(nearbyTowers=[lane_tower], baseTowers=base_block(enemy_open=True)), "own-lane-1",
                                        VOCAB_2, MAP), "tw-9", "a listed tower still wins")
        self.assertIsNone(resolve_target("nearest_tower", obs(baseTowers=base_block(enemy_open=True)), "own-lane-1", VOCAB_1, MAP),
                          "vocab-1 reads visibleEnemies only, as it always has")

    def test_tp_lane_tower_never_picks_a_base_tower(self):
        towers = [{"id": "tw-12", "lane": "mid", "tier": 3, "hp": 950, "maxHp": 950, "enemyBearbots": 0},
                  {"id": "tw-5", "lane": "mid", "tier": 1, "hp": 700, "maxHp": 700, "enemyBearbots": 0}]
        o = obs(teleport={"ready": True, "cooldownSec": 0, "channel": None, "towers": towers})
        self.assertEqual(resolve_target("tp_lane_tower", o, "own-lane-1", VOCAB_2, MAP2), "tw-5")


class Translator(unittest.TestCase):
    def test_other_maps_and_vocab1_prompts_are_unchanged(self):
        base = T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", VOCAB_2)
        self.assertEqual(T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", VOCAB_2, map_="pvp-1-hp400"), base)
        self.assertNotIn("enemy_base_tower", base)
        v1 = T._translation_prompt("Hold at my tower.", "drums", "kick", "fill")
        self.assertEqual(T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", map_=MAP), v1, "vocab-1 is never offered it")

    def test_a_base_tower_map_offers_the_target_and_the_fact(self):
        prompt = T._translation_prompt("Push to their base.", "drums", "kick", "fill", VOCAB_2, map_=MAP)
        self.assertIn(f'  "enemy_base_tower" -- {T.BASE_SELECTORS["enemy_base_tower"]}', prompt)
        for fact in FACTS_BASE:
            self.assertIn(fact.says, prompt)
        self.assertNotIn("teleport", prompt)
        both = T._translation_prompt("Push to their base.", "drums", "kick", "fill", VOCAB_2, map_=MAP2)
        self.assertIn('"teleport"', both)
        self.assertIn("enemy_base_tower", both)

    def _raw(self, selector):
        return {"rules": [{"id": "push", "condition": "can the enemy base tower be hit now?", "criteria": {"true": "yes", "false": "no"},
                           "action": {"kind": "attack", "ability": None, "target_selector": selector}}],
                "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}, "build": None}

    def test_the_target_parses_only_on_a_base_tower_map_and_the_schema_records_it(self):
        schema = T.parse_schema(self._raw("enemy_base_tower"), "p.md", "drums", "", VOCAB_2, map_=MAP)
        self.assertEqual(schema.map, MAP)
        d = schema_to_dict(schema)
        self.assertEqual(d["map"], MAP)
        self.assertEqual(schema_from_dict(json.loads(json.dumps(d))).map, MAP)
        with self.assertRaises(ValueError):
            T.parse_schema(self._raw("enemy_base_tower"), "p.md", "drums", "", VOCAB_2)
        with self.assertRaises(ValueError):
            T.parse_schema(self._raw("enemy_base_tower"), "p.md", "drums", "", VOCAB_2, map_="pvp-2")


if __name__ == "__main__":
    unittest.main()
