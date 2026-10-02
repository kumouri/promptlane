#!/usr/bin/env python3
"""pvp-2 on the Python side (runs/pvp-2-2026-10-02.md): the map's geometry in `vocab.MapSpec`, the
target resolver on the scaled world and the teleport's two targets, vocab-2's description of the
speed boost and the teleport, and the translator's offer of the teleport to a compile told the map.
Every pvp-1 path is checked unchanged alongside."""
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
from target_resolve import PVP2_SELECTORS, lane_start, resolve_target, tower_spot  # noqa: E402
from vocab import FACTS_PVP2, FACTS_V2, VOCAB_1, VOCAB_2, facts_for, map_has_teleport, map_spec  # noqa: E402

S = 1.33
# What a pvp-2 match log records as its `map` (the TS variant object, rule layers included).
PVP2_LOGGED = {"name": "pvp-2", "towerRange": 160, "towerFractions": [0.16, 0.35], "laneTowerFractions": {"mid": [0.16, 0.375]},
               "scale": 1.33, "homeguard": {"name": "homeguard-1"}, "teleport": {"name": "teleport-1"}}


def P(x, y):
    return {"x": x, "y": y}


def obs(pos=(300, 1000), team="violet", instrument="keytar", lane="mid", **extra):
    max_hp = {"drums": 220, "keytar": 140, "violin": 150}[instrument]
    o = {
        "clockSec": 61,
        "self": {"id": "bb-2", "team": team, "lane": lane, "instrument": instrument, "pos": P(*pos), "hp": max_hp, "maxHp": max_hp,
                 "moveSpeed": 60, "cooldowns": {a: 0 for a in ABILITIES[instrument]}},
        "allies": [], "visibleEnemies": [], "nearbyMinions": [], "nearbyTowers": [],
    }
    o.update(extra)
    return o


def tp_block(ready=True, cooldown=0.0, channel=None, towers=None):
    towers = towers if towers is not None else [
        {"id": "tw-3", "lane": "top", "tier": 2, "hp": 900, "maxHp": 900, "enemyBearbots": 0},
        {"id": "tw-5", "lane": "mid", "tier": 1, "hp": 900, "maxHp": 900, "enemyBearbots": 0},
        {"id": "tw-7", "lane": "mid", "tier": 2, "hp": 410, "maxHp": 900, "enemyBearbots": 1},
        {"id": "tw-11", "lane": "bottom", "tier": 2, "hp": 900, "maxHp": 900, "enemyBearbots": 2},
    ]
    return {"ready": ready, "cooldownSec": cooldown, "channel": channel, "towers": towers}


class MapGeometry(unittest.TestCase):
    def test_spec_from_name_and_from_a_logged_variant(self):
        for m in ("pvp-2", PVP2_LOGGED):
            spec = map_spec(m)
            self.assertEqual(spec.scale, S)
            self.assertEqual(spec.fractions("mid"), (0.16, 0.375))
            self.assertEqual(spec.fractions("top"), (0.16, 0.35))
            self.assertEqual(spec.home("violet"), P(133.0, 1197.0))
        self.assertTrue(map_has_teleport("pvp-2") and map_has_teleport(PVP2_LOGGED))
        self.assertFalse(map_has_teleport("pvp-1") or map_has_teleport(None))

    def test_pvp1_is_the_specimen_world(self):
        spec = map_spec("pvp-1")
        self.assertEqual((spec.scale, spec.lane_fractions), (1.0, ()))
        self.assertEqual(spec.home("green"), P(900, 100))
        self.assertEqual(tower_spot(spec, "top", "violet", 2), P(100, 420.0))

    def test_tower_spots_match_the_typescript(self):
        # src/mapVariant.ts towerPos on pvp-2 (tools/match/test_pvp2.mjs checks the same numbers)
        spec = map_spec("pvp-2")
        mid = tower_spot(spec, "mid", "violet", 2)
        self.assertAlmostEqual(mid["x"], (100 + 0.375 * 800) * S)
        self.assertAlmostEqual(mid["y"], (900 - 0.375 * 800) * S)
        top = tower_spot(spec, "top", "violet", 2)
        self.assertAlmostEqual(top["x"], 133.0)
        self.assertAlmostEqual(top["y"], 1197 - 0.35 * 1600 * S)


class Targets(unittest.TestCase):
    def test_home_and_push_lane_follow_the_scaled_bases_in_every_vocabulary(self):
        o = obs()
        for vocab in (VOCAB_1, VOCAB_2):
            self.assertEqual(resolve_target("home", o, vocab=vocab, map_="pvp-2"), P(133.0, 1197.0))
            self.assertEqual(resolve_target("push_lane", o, vocab=vocab, map_="pvp-2"), P(1197.0, 133.0))
            self.assertEqual(resolve_target("home", o, vocab=vocab, map_="pvp-1"), P(100, 900))

    def test_a_bot_at_its_scaled_fountain_rides_its_own_lane(self):
        o = obs(pos=(133, 1197), nearbyMinions=[{"id": "mn-1", "team": "violet", "pos": P(200, 1100), "hp": 60, "maxHp": 60}])
        got = resolve_target("nearby_minion", o, "own-lane-1", VOCAB_2, "pvp-2")
        self.assertEqual(got, lane_start("mid", "violet", map_spec("pvp-2")))

    def test_teleport_targets(self):
        o = obs(teleport=tp_block())
        self.assertEqual(resolve_target("tp_lane_tower", o, vocab=VOCAB_2, map_="pvp-2"), "tw-7")  # mid outer
        self.assertEqual(resolve_target("tp_threatened_tower", o, vocab=VOCAB_2, map_="pvp-2"), "tw-11")  # two enemies
        calm = obs(teleport=tp_block(towers=[{"id": "tw-3", "lane": "top", "tier": 2, "hp": 900, "maxHp": 900, "enemyBearbots": 0}]))
        self.assertIsNone(resolve_target("tp_threatened_tower", calm, vocab=VOCAB_2, map_="pvp-2"))
        self.assertIsNone(resolve_target("tp_lane_tower", calm, vocab=VOCAB_2, map_="pvp-2"), "no mid tower stands")
        self.assertIsNone(resolve_target("tp_lane_tower", obs(), vocab=VOCAB_2, map_="pvp-1"), "a match without the teleport")
        # ties: own lane first
        tie = obs(teleport=tp_block(towers=[
            {"id": "tw-3", "lane": "top", "tier": 2, "hp": 900, "maxHp": 900, "enemyBearbots": 1},
            {"id": "tw-7", "lane": "mid", "tier": 2, "hp": 900, "maxHp": 900, "enemyBearbots": 1},
        ]))
        self.assertEqual(resolve_target("tp_threatened_tower", tie, vocab=VOCAB_2, map_="pvp-2"), "tw-7")
        self.assertEqual(set(PVP2_SELECTORS), set(T.PVP2_SELECTORS))


class Description(unittest.TestCase):
    def test_pvp2_lines_are_stated_only_when_the_observation_has_them(self):
        plain = obs()
        before = describe_observation(plain, VOCAB_2, "pvp-1")
        self.assertNotIn("teleport", before)
        self.assertNotIn("speed boost", before)
        o = obs(teleport=tp_block(), teleports=[{"id": "bb-9", "team": "green", "tower": "tw-12", "lane": "top", "leftSec": 2.5}])
        o["self"]["speedBoost"] = True
        text = describe_observation(o, VOCAB_2, "pvp-2")
        self.assertIn("Its out-of-base speed boost is on", text)
        self.assertIn("Its teleport is ready", text)
        self.assertIn("tw-11 (bottom outer, 900/900 hp, 2 enemy bearbots within 260 units of it)", text)
        self.assertIn("Enemy bb-9 is teleporting to their top tower tw-12, landing in 2.5 s.", text)
        o2 = obs(teleport=tp_block(ready=False, cooldown=41.5))
        o2["self"]["speedBoost"] = False
        text2 = describe_observation(o2, VOCAB_2, "pvp-2")
        self.assertIn("Its teleport is on cooldown for 41.5 more s.", text2)
        self.assertIn("speed boost is off", text2)
        o3 = obs(teleport=tp_block(channel={"tower": "tw-7", "leftSec": 3}))
        self.assertIn("Its teleport is ready and in use: it is channelling to its tower tw-7, landing in 3 s, and choosing any "
                      "other action cancels it.", describe_observation(o3, VOCAB_2, "pvp-2"))

    def test_vocab1_never_states_them(self):
        o = obs(teleport=tp_block())
        o["self"]["speedBoost"] = True
        self.assertEqual(describe_observation(o, VOCAB_1), describe_observation(obs(), VOCAB_1))

    def test_every_pvp2_fact_lead_is_in_a_pvp2_description(self):
        o = obs(teleport=tp_block(), teleports=[{"id": "bb-9", "team": "green", "tower": "tw-12", "lane": "top", "leftSec": 2.5}])
        o["self"]["speedBoost"] = True
        text = describe_observation(o, VOCAB_2, "pvp-2")
        for fact in FACTS_PVP2:
            self.assertIn(fact.lead, text, fact.key)
        self.assertEqual(facts_for(VOCAB_2, "pvp-2"), FACTS_V2 + FACTS_PVP2)
        self.assertEqual(facts_for(VOCAB_2, "pvp-1"), FACTS_V2)
        self.assertEqual(facts_for(VOCAB_1, "pvp-2"), ())


class Translator(unittest.TestCase):
    def test_pvp1_and_no_map_prompts_are_unchanged(self):
        base = T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", VOCAB_2)
        self.assertEqual(T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", VOCAB_2, map_="pvp-1"), base)
        self.assertNotIn("teleport", base)
        v1 = T._translation_prompt("Hold at my tower.", "drums", "kick", "fill")
        self.assertEqual(T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", map_="pvp-2"), v1, "vocab-1 is never offered it")

    def test_pvp2_prompt_offers_the_teleport_its_targets_and_facts(self):
        prompt = T._translation_prompt("Teleport to defend.", "drums", "kick", "fill", VOCAB_2, map_="pvp-2")
        self.assertIn('"ability": one of ["kick", "fill", "teleport", null]', prompt)
        for sel, meaning in T.PVP2_SELECTORS.items():
            self.assertIn(f'  "{sel}" -- {meaning}', prompt)
        for fact in FACTS_PVP2:
            self.assertIn(fact.says, prompt)

    def _raw(self, selector):
        return {"rules": [{"id": "tp", "condition": "is an enemy bearbot at one of my towers?", "criteria": {"true": "yes", "false": "no"},
                           "action": {"kind": "ability", "ability": "teleport", "target_selector": selector}}],
                "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}, "build": None}

    def test_teleport_targets_parse_only_on_a_teleport_map(self):
        schema = T.parse_schema(self._raw("tp_threatened_tower"), "p.md", "drums", "", VOCAB_2, map_="pvp-2")
        self.assertEqual(schema.map, "pvp-2")
        with self.assertRaises(ValueError):
            T.parse_schema(self._raw("tp_threatened_tower"), "p.md", "drums", "", VOCAB_2)

    def test_instrument_scope_keeps_a_teleport_rule_only_on_a_teleport_map(self):
        schema = T.parse_schema(self._raw("tp_lane_tower"), "p.md", "drums", "", VOCAB_2, map_="pvp-2")
        kept = T.enforce_instrument_scope(schema, "drums", "kick", "fill", teleport=True)
        self.assertEqual([n.id for n in kept.root.nodes], ["tp"])
        with self.assertRaises(ValueError):  # nothing left at the root once the teleport rule goes
            T.enforce_instrument_scope(schema, "drums", "kick", "fill")

    def test_the_schema_records_its_map(self):
        schema = T.parse_schema(self._raw("tp_lane_tower"), "p.md", "drums", "", VOCAB_2, map_="pvp-2")
        d = schema_to_dict(schema)
        self.assertEqual(d["map"], "pvp-2")
        self.assertEqual(schema_from_dict(json.loads(json.dumps(d))).map, "pvp-2")
        plain = T.parse_schema(self._raw("own_tower") | {"rules": [{"id": "r", "condition": "x?", "action": {"kind": "move", "target_selector": "own_tower"}}]},
                               "p.md", "drums", "", VOCAB_2)
        self.assertNotIn("map", schema_to_dict(plain))


class SampleEntrant(unittest.TestCase):
    def test_the_pvp2_entrant_is_the_siege_entrant_plus_one_teleport_rule(self):
        pilots = HERE.parents[1] / "prompts" / "pilots"
        siege = json.loads((pilots / "sample-entrant-siege.schemas.json").read_text(encoding="utf-8"))
        pvp2 = json.loads((pilots / "sample-entrant-pvp2.schemas.json").read_text(encoding="utf-8"))
        for inst in ("drums", "keytar", "violin"):
            mine, base = pvp2[inst], siege[inst]
            self.assertEqual(mine["map"], "pvp-2")
            tp = [r for r in mine["rules"] if r.get("action_ability") == "teleport"]
            self.assertEqual(len(tp), 1, inst)
            self.assertEqual(tp[0]["action_target_selector"], "tp_threatened_tower")
            self.assertEqual([r for r in mine["rules"] if r is not tp[0]], base["rules"], inst)
            at = mine["rules"].index(tp[0])
            self.assertIn("will an enemy tower shoot", mine["rules"][at - 1]["condition"])
            self.assertEqual(schema_from_dict(mine).map, "pvp-2")


if __name__ == "__main__":
    unittest.main()
