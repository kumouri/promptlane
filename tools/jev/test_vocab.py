"""Tests for the shared vocabulary (tools/jev/vocab.py, docs/vocabulary-spec.md): vocab-1 stays byte
for byte what it was (goldens made before vocab-2 existed), every vocab-2 fact and target does what
the spec says, a schema plays under its own vocabulary, and a model-free stand-in that reads only the
description text answers the new conditions. No model call anywhere."""
from __future__ import annotations

import copy
import json
import os
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "testdata"))

import make_vocab1_golden as G  # noqa: E402
import translator as T  # noqa: E402
from compile import compile_prompt, header_markdown, parse_args, schema_from_dict, schema_to_dict  # noqa: E402
from fidelity_harness import describe_observation, run_prediction  # noqa: E402
from schema_server import JevSchemaBackend  # noqa: E402
from scenarios import ABILITIES  # noqa: E402
from target_resolve import TARGETING_FIRST_MIN, TARGETING_OWN_LANE_1, TARGETING_RULES, VOCAB2_SELECTORS, resolve_target  # noqa: E402
from vocab import (  # noqa: E402
    DEFAULT_VOCAB, FACTS_V2, MAPS, VOCAB_1, VOCAB_2, VOCABS, FightSide, fight, fight_verdict, map_spec, resolve_vocab,
)

REPO = HERE.parents[1]
GOLDEN = json.loads((HERE / "testdata" / "vocab1_golden.json").read_text(encoding="utf-8"))
CORPUS = G.corpus()
LOGGED = json.loads((HERE / "testdata" / "vocab1_observations.json").read_text(encoding="utf-8"))

# pvp-1 tower spots (src/mapVariant.ts towerPos): violet top inner (100,644), outer (100,420);
# green top inner (644,100), outer (420,100).
V_INNER, V_OUTER = {"x": 100, "y": 644}, {"x": 100, "y": 420}
G_INNER, G_OUTER = {"x": 644, "y": 100}, {"x": 420, "y": 100}


def P(x, y):
    return {"x": x, "y": y}


def tower(id_, team, pos, alive=True, hp=900, lane="top"):
    return {"id": id_, "team": team, "lane": lane, "pos": pos, "hp": hp if alive else 0, "maxHp": 900, "alive": alive}


def bearbot(id_, pos, hp=140, max_hp=140):
    return {"id": id_, "pos": pos, "hp": hp, "maxHp": max_hp, "kind": "bearbot"}


def minion(id_, team, pos, hp=60):
    return {"id": id_, "team": team, "pos": pos, "hp": hp, "maxHp": 60}


def obs(pos=(100, 600), team="violet", instrument="keytar", hp=140, lane="top", allies=(), enemies=(), minions=(), towers=(), **extra):
    max_hp = {"drums": 220, "keytar": 140, "violin": 150}[instrument]
    o = {
        "clockSec": 61,
        "self": {"id": "bb-2", "team": team, "lane": lane, "instrument": instrument, "pos": P(*pos), "hp": hp, "maxHp": max_hp,
                 "moveSpeed": 60, "cooldowns": {a: 0 for a in ABILITIES[instrument]}},
        "allies": list(allies),
        "visibleEnemies": list(enemies),
        "nearbyMinions": list(minions),
        "nearbyTowers": list(towers),
    }
    if lane is None:
        del o["self"]["lane"]
    o.update(extra)
    return o


def mirror(o: dict) -> dict:
    """The same state seen from the other side: (x, y) -> (y, x), teams swapped."""
    o = copy.deepcopy(o)
    swap = {"violet": "green", "green": "violet"}

    def flip(d):
        if isinstance(d, dict):
            if set(d) == {"x", "y"}:
                d["x"], d["y"] = d["y"], d["x"]
                return
            for k, v in d.items():
                if k == "team" and v in swap:
                    d[k] = swap[v]
                else:
                    flip(v)
        elif isinstance(d, list):
            for v in d:
                flip(v)

    flip(o)
    return o


class Vocab1IsByteIdentical(unittest.TestCase):
    """Spec §5.2's proofs, against goldens recorded from develop at eaf1b45 (before vocab-2)."""

    def test_translator_prompt_is_unchanged(self):
        for inst, want in GOLDEN["prompts"].items():
            self.assertEqual(T._translation_prompt(G.PROSE, inst, *ABILITIES[inst]), want)
            self.assertEqual(T._translation_prompt(G.PROSE, inst, *ABILITIES[inst], VOCAB_1), want)
        self.assertEqual(list(T.TARGET_SELECTORS), GOLDEN["selectors"])

    def test_description_is_unchanged_on_the_corpus(self):
        self.assertEqual(len(CORPUS), len(GOLDEN["descriptions"]))
        for o, want in zip(CORPUS, GOLDEN["descriptions"]):
            self.assertEqual(G.sha(describe_observation(o)), want)
            self.assertEqual(G.sha(describe_observation(o, VOCAB_1, "pvp-1")), want)  # the map never reaches vocab-1

    def test_every_vocab1_selector_resolves_as_before_under_both_vocabularies(self):
        for o, want in zip(CORPUS, GOLDEN["resolutions"]):
            self.assertEqual(G.resolutions(o), want)
            for targeting in TARGETING_RULES:
                for sel in GOLDEN["selectors"]:
                    self.assertEqual(resolve_target(sel, o, targeting, VOCAB_2, "pvp-1"), want[f"{targeting}:{sel}"], sel)

    def test_every_checked_in_schema_is_vocab1_and_plays_the_vocab1_description(self):
        files = sorted(REPO.glob("prompts/pilots/*.schemas.json")) + sorted(REPO.glob("runs/*schema*.json"))
        seen = 0
        for f in files:
            data = json.loads(f.read_text(encoding="utf-8"))
            candidates = [data] if "rules" in data else [v for v in data.values() if isinstance(v, dict)]
            per_inst = [v for v in candidates if "rules" in v and "instrument" in v]
            for raw in per_inst:
                schema = schema_from_dict(raw)
                self.assertEqual(schema.vocab, VOCAB_1, f)
                self.assertNotIn("vocab", schema_to_dict(schema), f)
                for o, want in list(zip(CORPUS, GOLDEN["descriptions"]))[::9]:
                    client = RecordingClient()
                    run_prediction(client, schema, o, TARGETING_OWN_LANE_1, "pvp-1")
                    self.assertEqual(G.sha(client.states[-1]), want, f)
                seen += 1
        self.assertGreaterEqual(seen, 30)


class RecordingClient:
    """Answers every question no, and keeps the paragraph it was shown."""

    backend = "stub"

    def __init__(self):
        self.states = []

    def ask(self, state, questions):
        self.states.append(state)
        return {"answers": {q.id: {"noul": 0.1} for q in questions}, "usage": {"input_tokens": 1}}


class Names(unittest.TestCase):
    def test_vocabularies(self):
        self.assertEqual(VOCABS, ("vocab-1", "vocab-2"))
        self.assertEqual(DEFAULT_VOCAB, VOCAB_2)
        self.assertEqual(resolve_vocab(None), VOCAB_1)
        with self.assertRaises(ValueError):
            resolve_vocab("vocab-3")
        self.assertEqual(parse_args(["x.md"]).vocab, VOCAB_2, "entrant compiles default to vocab-2")
        self.assertEqual(parse_args(["x.md", "--vocab", "vocab-1"]).vocab, VOCAB_1)

    def test_maps(self):
        self.assertEqual(map_spec(None).name, "v1")
        self.assertEqual(map_spec("pvp-1r").tower_range, 120)
        custom = map_spec({"name": "x", "towerRange": 99, "towerFractions": [0.1, 0.2]})
        self.assertEqual((custom.tower_range, custom.tower_fractions), (99.0, (0.1, 0.2)))
        for bad in ("nope", {"name": "x"}):
            with self.assertRaises(ValueError):
                map_spec(bad)
        self.assertEqual(set(MAPS), {"v1", "pvp-1", "pvp-1r"})


class TowerFacts(unittest.TestCase):
    """Spec A1, plus the always-present summary lines (§3 rule 5: a definite no)."""

    def test_under_my_own_tower(self):
        text = describe_observation(obs(towers=[tower("tw-1", "violet", V_INNER)]), VOCAB_2, "pvp-1")
        self.assertIn("Your tower tw-1 (top, 900/900 hp) at (100,644) is 44 units away; you are inside its 160-unit range.", text)
        self.assertIn("You are under your own tower (tw-1).", text)
        self.assertIn("No enemy tower is within 390 units.", text)

    def test_enemy_tower_will_shoot_me_unless_my_minion_is_in_its_range(self):
        bare = obs(pos=(420, 250), towers=[tower("tw-9", "green", G_OUTER)])
        text = describe_observation(bare, VOCAB_2, "pvp-1")
        self.assertIn("Enemy tower tw-9 (top, 900/900 hp) at (420,100) is 150 units away; you are inside its 160-unit range, and it has no "
                      "minion of yours to shoot first, so it will shoot you.", text)
        self.assertIn("An enemy tower will shoot you (tw-9).", text)
        self.assertIn("You are not under your own tower.", text)
        self.assertIn("No tower of yours is within 390 units.", text)
        covered = obs(pos=(420, 250), towers=[tower("tw-9", "green", G_OUTER)], minions=[minion("mn-3", "violet", P(420, 200))])
        text = describe_observation(covered, VOCAB_2, "pvp-1")
        self.assertIn("but it has 1 of your minions in range to shoot first, so it will not shoot you yet.", text)
        self.assertIn("No enemy tower will shoot you.", text)
        # an enemy minion near the tower draws nothing
        theirs = obs(pos=(420, 250), towers=[tower("tw-9", "green", G_OUTER)], minions=[minion("mn-4", "green", P(420, 200))])
        self.assertIn("An enemy tower will shoot you (tw-9).", describe_observation(theirs, VOCAB_2, "pvp-1"))

    def test_outside_range_and_tower_range_comes_from_the_map(self):
        o = obs(pos=(420, 240), towers=[tower("tw-9", "green", G_OUTER)])
        self.assertIn("you are inside its 160-unit range", describe_observation(o, VOCAB_2, "pvp-1"))
        short = describe_observation(o, VOCAB_2, "pvp-1r")
        self.assertIn("is 140 units away; you are outside its 120-unit range.", short)
        self.assertIn("No enemy tower will shoot you.", short)

    def test_dead_towers_and_divers(self):
        o = obs(towers=[tower("tw-1", "violet", V_INNER), tower("tw-2", "violet", V_OUTER, alive=False)],
                enemies=[bearbot("bb-9", P(150, 700))])
        text = describe_observation(o, VOCAB_2, "pvp-1")
        self.assertIn("Dead towers within 390 units: tw-2 (yours).", text)
        self.assertIn("; enemy bearbot bb-9 is inside its range.", text)
        self.assertIn("Enemy bearbot under your tower: bb-9.", text)
        self.assertNotIn("tw-2 (top", text, "a dead tower gets no range sentence")
        self.assertIn("No enemy bearbot is under your tower.", describe_observation(obs(), VOCAB_2, "pvp-1"))


class DistancesAndRange(unittest.TestCase):
    """Spec A2."""

    def test_every_listed_entity_has_its_distance_and_minions_their_hp(self):
        o = obs(allies=[{"id": "bb-1", "pos": P(100, 900), "hp": 100, "maxHp": 220}],
                enemies=[bearbot("bb-9", P(150, 700), hp=90)], minions=[minion("mn-3", "violet", P(100, 650), hp=30), minion("mn-7", "green", P(160, 600))])
        text = describe_observation(o, VOCAB_2, "pvp-1")
        self.assertIn("This is a violet-team bearbot playing keytar in the top lane,", text)
        self.assertIn("Its attack range is 160 units.", text)
        self.assertIn("bb-1 at (100,900), 300 units away, with 100/220 hp", text)
        self.assertIn("bb-9 (bearbot) at (150,700), 112 units away, with 90/140 hp", text)
        self.assertIn("mn-3 (yours) at (100,650), 50 units away, with 30/60 hp", text)
        self.assertIn("mn-7 (enemy) at (160,600), 60 units away, with 60/60 hp", text)
        self.assertIn("Enemies in your attack range: bb-9.", text)
        self.assertIn("Allied bearbots (every living ally, anywhere on the map):", text)

    def test_attack_range_is_the_instruments(self):
        o = obs(instrument="drums", enemies=[bearbot("bb-9", P(150, 700))])
        text = describe_observation(o, VOCAB_2, "pvp-1")
        self.assertIn("Its attack range is 40 units.", text)
        self.assertIn("No enemy is in your attack range.", text)
        o = obs(instrument="violin", enemies=[bearbot("bb-9", P(100, 645))])
        self.assertIn("Enemies in your attack range: bb-9.", describe_observation(o, VOCAB_2, "pvp-1"))

    def test_absent_things_are_stated(self):
        text = describe_observation(obs(), VOCAB_2, "pvp-1")
        for line in ("Allied bearbots: none alive right now.", "Enemies within 260 units: none.", "Minions within 260 units: none.",
                     "Fight near you: none, no enemy bearbot is within 260 units.", "There is no Bandstand in this match."):
            self.assertIn(line, text)


class FightBalance(unittest.TestCase):
    """Spec A3, as calibrated (runs/vocab-fight-calibration-2026-10-02.md)."""

    def side(self, bb=1, hp=140, minions=0, towers=0):
        return FightSide(bb, hp, minions, towers)

    def test_verdict(self):
        s = self.side
        self.assertEqual(fight_verdict(s(), s(bb=0, hp=0)), "none")
        self.assertEqual(fight_verdict(s(hp=200), s(hp=150)), "stronger")  # 1.33x
        self.assertEqual(fight_verdict(s(hp=150), s(hp=200)), "weaker")
        self.assertEqual(fight_verdict(s(hp=160), s(hp=140)), "even")  # 1.14x
        # a tower over the fight on one side decides it, whatever the hp
        self.assertEqual(fight_verdict(s(hp=80, towers=1), s(bb=2, hp=280)), "stronger")
        self.assertEqual(fight_verdict(s(bb=3, hp=500), s(hp=60, towers=1)), "weaker")
        # towers on both sides: hp decides again
        self.assertEqual(fight_verdict(s(hp=300, towers=1), s(hp=140, towers=1)), "stronger")
        # the spec's starting rule and the veto are still selectable, for the calibration
        self.assertEqual(fight_verdict(s(hp=300), s(hp=100, towers=1), tower_rule="or"), "even")
        self.assertEqual(fight_verdict(s(hp=300), s(bb=3, hp=200), outnumbered_by=2), "even")
        self.assertEqual(fight_verdict(s(hp=300), s(bb=3, hp=200)), "stronger")

    def test_fight_counts_what_is_within_260_and_towers_over_me(self):
        o = obs(allies=[{"id": "bb-1", "pos": P(100, 700), "hp": 170, "maxHp": 220}, {"id": "bb-3", "pos": P(900, 900), "hp": 150, "maxHp": 150}],
                enemies=[bearbot("bb-9", P(150, 700), hp=140), {"id": "tw-9", "pos": P(300, 600), "hp": 900, "maxHp": 900, "kind": "tower"}],
                minions=[minion("mn-3", "violet", P(100, 650)), minion("mn-7", "green", P(160, 600))],
                towers=[tower("tw-1", "violet", V_INNER)])
        fb = fight(o, map_spec("pvp-1"))
        self.assertEqual(fb.mine, FightSide(2, 310, 1, 1))  # bb-3 is 800 away: not in this fight
        self.assertEqual(fb.theirs, FightSide(1, 140, 1, 0))
        self.assertEqual(fb.verdict, "stronger")
        text = describe_observation(o, VOCAB_2, "pvp-1")
        self.assertIn("Fight near you (within 260 units): your side 2 bearbots (310 hp), 1 minion, 1 tower in range; "
                      "their side 1 bearbot (140 hp), 1 minion, no towers in range. Your side is stronger here.", text)

    def test_their_tower_makes_my_side_weaker(self):
        o = obs(pos=(420, 250), hp=140, enemies=[bearbot("bb-9", P(420, 200), hp=40)], towers=[tower("tw-9", "green", G_OUTER)])
        self.assertIn("Your side is weaker here.", describe_observation(o, VOCAB_2, "pvp-1"))


class Calibration(unittest.TestCase):
    """tools/jev/calibrate_fight.py scores the verdict on recorded fights."""

    def test_exchange_and_tally(self):
        from calibrate_fight import calibrate, exchange
        o = obs(pos=(300, 300), hp=140, enemies=[bearbot("bb-9", P(350, 300), hp=40)],
                allies=[{"id": "bb-1", "pos": P(320, 300), "hp": 100, "maxHp": 220}, {"id": "bb-3", "pos": P(900, 900), "hp": 150, "maxHp": 150}])
        won = {"map": "pvp-1", "obs": o, "future": {"bb-2": 130, "bb-1": 100, "bb-9": 0}}
        self.assertEqual(exchange(won), 40 - 10, "bb-9 died (40 lost), bb-2 lost 10, bb-3 isn't in the fight")
        healed = {"map": "pvp-1", "obs": o, "future": {"bb-2": 140, "bb-1": 220, "bb-9": 40}}
        self.assertEqual(exchange(healed), 0, "a heal is no loss, not a gain")
        lost = {"map": "pvp-1", "obs": o, "future": {"bb-2": 0, "bb-1": 100, "bb-9": 40}}
        rows = {(r["ratio"], r["towers"], r["veto"]): r for r in calibrate([won, healed, lost], ratios=(1.25,))}
        shipped = rows[(1.25, "first", None)]
        self.assertEqual((shipped["stronger"], shipped["samples"]), (3, 3))
        self.assertEqual(shipped["stronger_won"], 0.5)  # one won, one lost, one where nothing changed hands


class FactsList(unittest.TestCase):
    """Spec A5: the prompt's facts list is the table whose lead phrases the description states."""

    def test_every_fact_is_in_a_vocab2_description(self):
        eco = dict(LOGGED[0]["obs"])  # recorded with the economy layer on
        self.assertIn("gold", eco["self"])
        stand = obs(bandstand={"site": "top-side", "pos": P(300, 300), "radius": 60, "status": "open", "opensInSec": 0,
                               "progress": 0.2, "contested": False, "alliesOn": 0, "selfOn": False})
        text = " ".join(describe_observation(o, VOCAB_2, "pvp-1") for o in (eco, stand, obs(towers=[tower("tw-9", "green", V_INNER)])))
        for fact in FACTS_V2:
            self.assertIn(fact.lead, text, fact.key)

    def test_vocab2_prompt_lists_every_fact_and_selector(self):
        prompt = T._translation_prompt("Hold at my tower.", "drums", "kick", "fill", VOCAB_2)
        for fact in FACTS_V2:
            self.assertIn(fact.says, prompt)
        for sel, meaning in T.selectors_for(VOCAB_2).items():
            self.assertIn(f'  "{sel}" -- {meaning}', prompt)
        self.assertIn("is this bot under its own tower?", " ".join(prompt.split()))
        self.assertNotIn("within melee range", prompt, "vocab-2 never asks for a distance it doesn't state")
        v1 = T._translation_prompt("Hold at my tower.", "drums", "kick", "fill")
        self.assertNotIn("FACTS THE GAME STATES", v1)
        self.assertNotIn("own_tower", v1)


class Selectors(unittest.TestCase):
    """Spec A4."""

    def r(self, sel, o, vocab=VOCAB_2, map_="pvp-1", targeting=TARGETING_OWN_LANE_1):
        return resolve_target(sel, o, targeting, vocab, map_)

    def test_vocab1_does_not_know_them(self):
        for sel in VOCAB2_SELECTORS:
            with self.assertRaisesRegex(ValueError, "unknown target_selector"):
                self.r(sel, obs(), vocab=VOCAB_1)
        self.assertEqual(set(VOCAB2_SELECTORS), set(T.VOCAB2_SELECTORS))

    def test_own_tower(self):
        o = obs(pos=(300, 500), towers=[tower("tw-1", "violet", V_INNER), tower("tw-2", "violet", V_OUTER)])
        self.assertEqual(self.r("own_tower", o), P(100, 460), "the nearer one, 40 units toward home")
        o = obs(pos=(300, 500), towers=[tower("tw-2", "violet", V_OUTER, alive=False), tower("tw-1", "violet", V_INNER)])
        self.assertEqual(self.r("own_tower", o), P(100, 684), "a dead tower is not mine to hold")
        # none listed: my lane's spots, inner first; one the observation shows dead is skipped
        self.assertEqual(self.r("own_tower", obs(pos=(700, 100))), P(100, 684))
        self.assertEqual(self.r("own_tower", obs(pos=(700, 100), towers=[tower("tw-1", "violet", V_INNER, alive=False)])), P(100, 460))
        self.assertEqual(self.r("own_tower", obs(pos=(700, 100), lane=None)), P(100, 900), "no lane: home")
        self.assertEqual(self.r("own_tower", obs(pos=(900, 300), team="green")), P(684, 100))

    def test_own_front_tower(self):
        self.assertEqual(self.r("own_front_tower", obs(pos=(700, 100))), P(100, 460))
        o = obs(towers=[tower("tw-2", "violet", V_OUTER, alive=False)])
        self.assertEqual(self.r("own_front_tower", o), P(100, 684), "the next one in")
        o = obs(towers=[tower("tw-2", "violet", V_OUTER, alive=False), tower("tw-1", "violet", V_INNER, alive=False)])
        self.assertEqual(self.r("own_front_tower", o), P(100, 900), "then home")
        mid = self.r("own_front_tower", obs(lane="mid", pos=(500, 500)))  # mid's outer spot (340,660), 40 toward (100,900)
        self.assertAlmostEqual(mid["x"], 340 - 40 / 2 ** 0.5, 6)
        self.assertAlmostEqual(mid["y"], 660 + 40 / 2 ** 0.5, 6)
        self.assertEqual(self.r("own_front_tower", obs(pos=(700, 100)), map_="v1"), P(100, 268), "the specimen's outer spot (100,228) is further out")

    def test_mirror_symmetric(self):
        o = obs(pos=(300, 500), towers=[tower("tw-1", "violet", V_INNER), tower("tw-2", "violet", V_OUTER)],
                enemies=[bearbot("bb-8", P(140, 560)), bearbot("bb-9", P(160, 540))])
        for sel in ("own_tower", "own_front_tower", "tower_diver", "nearest_enemy_bearbot"):
            a, b = self.r(sel, o), self.r(sel, mirror(o))
            if isinstance(a, dict):
                self.assertAlmostEqual(a["x"], b["y"], 6, sel)
                self.assertAlmostEqual(a["y"], b["x"], 6, sel)
            else:
                self.assertEqual(a, b, sel)

    def test_enemy_pickers(self):
        o = obs(enemies=[{"id": "mn-1", "pos": P(100, 590), "hp": 60, "maxHp": 60, "kind": "minion"}, bearbot("bb-9", P(150, 700)),
                         bearbot("bb-8", P(100, 450)), {"id": "tw-9", "pos": P(100, 580), "hp": 900, "maxHp": 900, "kind": "tower"}])
        self.assertEqual(self.r("nearest_enemy", o), "mn-1")
        self.assertEqual(self.r("nearest_enemy_bearbot", o), "bb-9")
        self.assertEqual(self.r("nearest_enemy_minion", o), "mn-1")
        self.assertIsNone(self.r("nearest_enemy_bearbot", obs()))
        self.assertIsNone(self.r("nearest_enemy_minion", obs(enemies=[bearbot("bb-9", P(150, 700))])))

    def test_tower_diver(self):
        towers = [tower("tw-1", "violet", V_INNER), tower("tw-2", "violet", V_OUTER, alive=False)]
        o = obs(towers=towers, enemies=[bearbot("bb-8", P(100, 430)), bearbot("bb-9", P(150, 700))])
        self.assertEqual(self.r("tower_diver", o), "bb-9", "bb-8 is nearer the dead tower only")
        self.assertIsNone(self.r("tower_diver", obs(towers=towers, enemies=[bearbot("bb-8", P(300, 600))])))
        self.assertIsNone(self.r("tower_diver", obs(enemies=[bearbot("bb-9", P(150, 700))])), "no tower of mine in sight")

    def test_nearest_ally(self):
        o = obs(allies=[{"id": "bb-1", "pos": P(100, 900), "hp": 1, "maxHp": 220}, {"id": "bb-3", "pos": P(500, 500), "hp": 1, "maxHp": 150}])
        self.assertEqual(self.r("nearest_ally", o), P(100, 900))
        o = obs(minions=[minion("mn-3", "violet", P(120, 560))])
        self.assertEqual(self.r("nearest_ally", o), P(120, 560), "no ally alive: ride the wave")
        self.assertEqual(self.r("nearest_ally", obs()), P(100, 900), "then home")


class SchemaVocabPlumbing(unittest.TestCase):
    REPLY = json.dumps({"rules": [{"id": "hold_tower", "condition": "is this bot under its own tower?",
                                   "criteria": {"true": "yes", "false": "no"},
                                   "action": {"kind": "move", "ability": None, "target_selector": "own_tower"}}],
                        "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}})

    def test_translation_records_its_vocab_and_validates_against_it(self):
        s = T.translate_pilot("Hold at my tower.", "pilot.md", "drums", "kick", "fill", generate=lambda p: self.REPLY, vocab=VOCAB_2)
        self.assertEqual(s.vocab, VOCAB_2)
        self.assertIn("own nearest standing tower", T.render_markdown(s))
        with self.assertRaisesRegex(RuntimeError, "unknown target_selector 'own_tower'"):
            T.translate_pilot("Hold at my tower.", "pilot.md", "drums", "kick", "fill", generate=lambda p: self.REPLY, max_attempts=1)

    def test_guards_keep_the_vocab(self):
        reply = json.loads(self.REPLY)
        reply["rules"].append({"id": "chord_it", "condition": "is chord ready?", "criteria": {},
                               "action": {"kind": "ability", "ability": "chord", "target_selector": "nearest_enemy_bearbot"}})
        s = T.enforce_instrument_scope(T.parse_schema(reply, "p.md", "drums", "", VOCAB_2), "drums", "kick", "fill")
        self.assertEqual(s.vocab, VOCAB_2)
        self.assertTrue(any("removed rule chord_it" in n for n in s.validation_notes))
        reply["rules"].insert(0, {"id": "push", "condition": "is the lane clear?", "action": {"kind": "move", "target_selector": "push_lane"}})
        s = T.enforce_absolute_priority(T.parse_schema(reply, "p.md", "drums", "", VOCAB_2),
                                        "Push.\n\nMove to your own tower whenever this bot is under its own tower, no exceptions.")
        self.assertEqual(s.root.nodes[0].id, "hold_tower")
        self.assertEqual(s.vocab, VOCAB_2)

    def test_json_round_trip(self):
        s = T.parse_schema(json.loads(self.REPLY), "p.md", "drums", "", VOCAB_2)
        d = schema_to_dict(s)
        self.assertEqual(list(d)[-1], "vocab")
        self.assertEqual(d["vocab"], VOCAB_2)
        self.assertEqual(schema_from_dict(d).vocab, VOCAB_2)
        v1 = schema_to_dict(T.parse_schema({"rules": json.loads(self.REPLY)["rules"][:0] + [
            {"id": "a", "condition": "c?", "action": {"kind": "hold"}}], "default_action": {"kind": "hold"}}, "p.md", "drums", ""))
        self.assertNotIn("vocab", v1)
        with self.assertRaisesRegex(ValueError, "unknown vocab 'vocab-9'"):
            schema_from_dict({**d, "vocab": "vocab-9"})

    def test_compile_preview_names_the_vocabulary(self):
        s = T.parse_schema(json.loads(self.REPLY), "p.md", "drums", "", VOCAB_2)
        result = compile_prompt("Hold at my tower.", "pilot.md", ["drums"], None, schemas={"drums": s})
        self.assertEqual(result["vocab"], VOCAB_2)
        self.assertEqual(result["instruments"]["drums"]["schema"]["vocab"], VOCAB_2)
        head = header_markdown(result, "saved", {"cost_usd": 0, "calls": 0, "total_tokens": 0, "seconds": 0}, None)
        self.assertIn("Vocabulary: `vocab-2`", head)

    def test_schema_server_plays_the_schemas_own_vocab(self):
        v2 = schema_to_dict(T.parse_schema(json.loads(self.REPLY), "p.md", "keytar", "", VOCAB_2))
        o = obs(towers=[tower("tw-1", "violet", V_INNER)])
        client = RecordingClient()
        backend = JevSchemaBackend(client, budget_usd=None)
        out = backend.decide({"schema": v2, "observation": o, "targeting": "own-lane-1", "map": "pvp-1"})
        self.assertEqual(out["vocab"], VOCAB_2)
        self.assertIn("You are under your own tower (tw-1).", client.states[-1])
        self.assertEqual(out["action"], {"kind": "move", "target": {"x": 900, "y": 100}})  # every answer no: push_lane
        v1 = {**v2, "rules": [{**v2["rules"][0], "action_target_selector": "home"}]}
        del v1["vocab"]
        out = backend.decide({"schema": v1, "observation": o, "map": {"name": "pvp-1", "towerRange": 160, "towerFractions": [0.16, 0.3]}})
        self.assertEqual(out["vocab"], VOCAB_1)
        self.assertEqual(client.states[-1], describe_observation(o))
        with self.assertRaisesRegex(ValueError, "compiled under 'vocab-2'"):
            backend.decide({"schema": v2, "observation": o, "vocab": "vocab-1"})
        with self.assertRaisesRegex(ValueError, "unknown map"):
            backend.decide({"schema": v2, "observation": o, "map": "atlantis"})
        self.assertEqual(backend.snapshot()["vocabs"], ["vocab-1", "vocab-2"])


class ReadingStandIn:
    """The model-free stand-in for Jev: it answers each condition by reading ONLY the paragraph it
    is shown, never the observation, so a yes proves the description states the fact in words a
    reader can find. Questions it has no pattern for answer no."""

    backend = "stand-in"
    READS = (
        (r"under its own tower", r"You are under your own tower \("),
        (r"enemy tower .*shoot", r"An enemy tower will shoot you \("),
        (r"enemy bearbot under", r"Enemy bearbot under your tower: "),
        (r"side stronger", r"Your side is stronger here\."),
        (r"side weaker", r"Your side is weaker here\."),
        (r"in this bot's attack range", r"Enemies in your attack range: "),
    )

    def ask(self, state, questions):
        answers = {}
        for q in questions:
            hit = next((bool(re.search(text, state)) for asked, text in self.READS if re.search(asked, q.instructions)), False)
            answers[q.id] = {"noul": 0.9 if hit else 0.1}
        return {"answers": answers, "usage": {"input_tokens": len(state) // 4}}


def _rule(id_, condition, kind, selector, ability=None):
    return {"id": id_, "condition": condition, "criteria_true": "yes", "criteria_false": "no",
            "action_kind": kind, "action_ability": ability, "action_target_selector": selector}


STAND_IN_SCHEMA = {
    "pilot_file": "entrants/test/pilot.md", "instrument": "keytar", "vocab": VOCAB_2,
    "rules": [
        _rule("shot", "will an enemy tower shoot this bot?", "move", "own_tower"),
        _rule("diver", "is an enemy bearbot under this bot's tower?", "attack", "tower_diver"),
        _rule("weaker", "is this bot's side weaker in the fight near it?", "move", "nearest_ally"),
        _rule("stronger", "is this bot's side stronger in the fight near it?", "attack", "nearest_enemy_bearbot"),
        _rule("farm", "is an enemy in this bot's attack range?", "attack", "nearest_enemy_minion"),
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "own_front_tower"},
}


class StandInPlaysTheNewConditions(unittest.TestCase):
    def decide(self, o, map_="pvp-1"):
        return JevSchemaBackend(ReadingStandIn(), budget_usd=None).decide({"schema": STAND_IN_SCHEMA, "observation": o, "targeting": "own-lane-1", "map": map_})

    def test_each_rule_on_a_state_built_for_it(self):
        dive = self.decide(obs(pos=(420, 250), towers=[tower("tw-9", "green", G_OUTER)]))
        self.assertEqual((dive["rule"], dive["action"]), ("shot", {"kind": "move", "target": P(100, 684)}))
        punish = self.decide(obs(towers=[tower("tw-1", "violet", V_INNER)], enemies=[bearbot("bb-9", P(150, 700))]))
        self.assertEqual((punish["rule"], punish["action"]), ("diver", {"kind": "attack", "target": "bb-9"}))
        losing = self.decide(obs(pos=(300, 300), hp=40, enemies=[bearbot("bb-9", P(350, 300))], allies=[{"id": "bb-1", "pos": P(100, 900), "hp": 200, "maxHp": 220}]))
        self.assertEqual((losing["rule"], losing["action"]), ("weaker", {"kind": "move", "target": P(100, 900)}))
        winning = self.decide(obs(pos=(300, 300), hp=140, enemies=[bearbot("bb-9", P(350, 300), hp=40)]))
        self.assertEqual((winning["rule"], winning["action"]), ("stronger", {"kind": "attack", "target": "bb-9"}))
        farm = self.decide(obs(pos=(300, 300), enemies=[{"id": "mn-5", "pos": P(400, 300), "hp": 60, "maxHp": 60, "kind": "minion"}]))
        self.assertEqual((farm["rule"], farm["action"]), ("farm", {"kind": "attack", "target": "mn-5"}))
        idle = self.decide(obs(pos=(700, 100)))
        self.assertEqual((idle["rule"], idle["action"]), (None, {"kind": "move", "target": P(100, 460)}))
        # the same state under vocab-1 words: the stand-in finds nothing to say yes to
        v1 = {**STAND_IN_SCHEMA, "rules": [{**r, "action_target_selector": "home"} for r in STAND_IN_SCHEMA["rules"]],
              "default_action": {"kind": "hold", "ability": None, "target_selector": None}}
        del v1["vocab"]
        out = JevSchemaBackend(ReadingStandIn(), budget_usd=None).decide({"schema": v1, "observation": obs(pos=(420, 250), towers=[tower("tw-9", "green", G_OUTER)])})
        self.assertIsNone(out["rule"])

    def test_on_recorded_observations(self):
        """The stand-in over observations the real sim handed real pilots: every new condition is
        answered yes somewhere, and every rule that fires resolves to a target (farming only when an
        enemy minion is in sight: what is in range may be a bearbot or a tower)."""
        fired = {}
        for item in LOGGED:
            o = dict(item["obs"])
            o["self"] = {**o["self"], "instrument": "keytar", "cooldowns": {"chord": 0, "glissando": 0}}
            out = self.decide(o, item["map"])
            fired[out["rule"]] = fired.get(out["rule"], 0) + 1
            if out["rule"] != "farm" or any(e["kind"] == "minion" for e in o["visibleEnemies"]):
                self.assertIn("target", out["action"], out)
        for rule in ("shot", "stronger", "farm", None):
            self.assertIn(rule, fired, fired)


if __name__ == "__main__":
    unittest.main()
