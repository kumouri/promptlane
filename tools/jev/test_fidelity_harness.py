"""Tests for tools/jev/fidelity_harness.py's pure helpers (no Ollama/Jev network calls)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import fidelity_harness as FH  # noqa: E402


REFERENCE_SCHEMA = {
    "_provenance": "Hand-authored by a Claude subagent from the pilot prose alone, blind to any translator output, 2026-09-23.",
    "rules": [
        {
            "id": "recall_low_hp",
            "condition": "is hp below a quarter of max?",
            "criteria": {"true": "hp < 25%", "false": "hp >= 25%"},
            "action": {"kind": "recall", "ability": None, "target_selector": "home"},
        }
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
}


class LoadReferenceSchemaTests(unittest.TestCase):
    def test_loads_and_parses_a_reference_schema_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "reference-schema-keytar.json"
            path.write_text(json.dumps(REFERENCE_SCHEMA), encoding="utf-8")
            schema = FH.load_reference_schema(path, "prompts/pilots/keytar.md", "keytar")
        self.assertEqual(len(schema.rules), 1)
        self.assertEqual(schema.rules[0].id, "recall_low_hp")
        self.assertEqual(schema.default_kind, "move")

    def test_provenance_field_is_ignored_not_treated_as_a_rule(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "reference-schema-drums.json"
            path.write_text(json.dumps(REFERENCE_SCHEMA), encoding="utf-8")
            schema = FH.load_reference_schema(path, "prompts/pilots/drums.md", "drums")
        self.assertEqual(schema.instrument, "drums")
        self.assertNotIn("_provenance", [r.id for r in schema.rules])


class ScriptedClient:
    """Deterministic stub for `run_prediction` tests: answers exactly the noul values given, keyed
    by question id, no seeded randomness -- unlike `DumbStubJevClient`, this is for asserting a
    SPECIFIC tree-walk outcome, not exercising plumbing."""

    def __init__(self, nouls: dict[str, float]):
        self.nouls = nouls

    def ask(self, state, questions):
        answers = {q.id: {"noul": self.nouls[q.id]} for q in questions}
        return {"model": "stub", "answers": answers, "usage": {"input_tokens": 10}}


class RunPredictionGuardTests(unittest.TestCase):
    """`run_prediction` must batch EVERY node's condition (root + both guard branches) into one call
    and walk the resulting tree, not just `schema.rules` (spec §2.2) -- this is the harness-level
    counterpart to `translator.py`'s own EvaluateCascadeTests."""

    def setUp(self):
        import translator as T

        opener = T.TranslatedRule("opener", "opener ready?", "true", "false", "ability", "staccato", "isolated_enemy")
        guard = T.GuardNode(
            id="can_win_fight", condition="can win?", criteria_true="yes", criteria_false="no",
            then=T.Cascade(nodes=(opener,), default=T.Action("move", None, "isolated_enemy")),
            else_=T.Cascade(nodes=(), default=T.Action("move", None, "isolated_enemy")),
        )
        recall = T.TranslatedRule("recall", "hp low?", "true", "false", "recall", None, "none")
        self.schema = T.TranslatedSchema(
            pilot_file="violin.md", instrument="violin", raw_model_output="{}",
            # root's own default is deliberately a different kind ("hold") from the else branch's
            # own default ("move") so a test can tell "used root.default" from "used the branch's
            # own default" apart by kind alone, without needing a resolvable target.
            root=T.Cascade(nodes=(recall, guard), default=T.Action("hold", None, None)),
        )
        from scenarios import SCENARIOS, build_observation

        self.obs = build_observation(SCENARIOS[0], "violet", "violin")  # empty_lane_push: no enemies visible

    def test_guard_yes_and_nested_rule_fires_through_the_tree(self):
        client = ScriptedClient({"recall": 0.1, "can_win_fight": 0.9, "opener": 0.9})
        pred = FH.run_prediction(client, self.schema, self.obs)
        self.assertEqual(pred["action"]["kind"], "ability")
        self.assertEqual(pred["fired_rule"], "opener")
        self.assertEqual(pred["guard_answers"], [{"guard_id": "can_win_fight", "answer": True}])

    def test_guard_no_commits_to_its_own_else_default_not_root_default(self):
        # if this fell through to root.default it would be "push_lane"; the else branch's own
        # default is "isolated_enemy" -- both resolve to `None` target with no enemies visible, so
        # the fired_rule/guard_answers fields are what distinguish the two, not the target itself.
        client = ScriptedClient({"recall": 0.1, "can_win_fight": 0.1, "opener": 0.9})
        pred = FH.run_prediction(client, self.schema, self.obs)
        self.assertEqual(pred["action"]["kind"], "move")
        self.assertIsNone(pred["fired_rule"])
        self.assertEqual(pred["guard_answers"], [{"guard_id": "can_win_fight", "answer": False}])


class ParseArgsReferenceSchemasTests(unittest.TestCase):
    def test_reference_schemas_dir_defaults_to_none(self):
        args = FH.parse_args([])
        self.assertIsNone(args.reference_schemas_dir)

    def test_reference_schemas_dir_accepts_a_path(self):
        args = FH.parse_args(["--reference-schemas-dir", "runs/reference-schemas"])
        self.assertEqual(args.reference_schemas_dir, "runs/reference-schemas")


_PLAIN_OBS = {
    "clockSec": 42.0,
    "self": {"id": "bb-1", "team": "violet", "instrument": "keytar", "pos": {"x": 300, "y": 300}, "hp": 100, "maxHp": 140,
             "cooldowns": {"chord": 0, "arpeggio": 3.5}},
    "allies": [{"id": "bb-2", "pos": {"x": 310, "y": 300}, "hp": 90, "maxHp": 220}],
    "visibleEnemies": [{"id": "bb-5", "kind": "bearbot", "pos": {"x": 400, "y": 300}, "hp": 150, "maxHp": 150}],
    "nearbyMinions": [],
}
_PLAIN_TEXT = (
    "This is a violet-team bearbot playing keytar, 42.0 sim-seconds into the match, at position (300,300). "
    "Its own hp is 100 out of 140 (71%). Cooldowns: chord cooldown 0.0s (ready), arpeggio cooldown 3.5s (not ready). "
    "Allies visible: bb-2 at (310,300) with 90/220 hp. Visible enemies: bb-5 (bearbot) at (400,300) with 150/150 hp. "
    "No minions nearby."
)


def _economy_obs(**self_over):
    obs = json.loads(json.dumps(_PLAIN_OBS))
    obs["self"].update(gold=340, goldAtRisk=340, deathLoss=170, deathPayout=170, bounty=470, level=3, xp=230, xpToNext=130,
                       items=["amp"], slotsFree=2, nextItem={"item": "bass-strings", "cost": 350}, atShop=False)
    obs["self"].update(self_over)
    obs["allies"][0].update(level=2, gold=120, items=["road-case"])
    obs["visibleEnemies"][0].update(level=3, bounty=410, items=["metronome"])
    obs["respawning"] = [{"id": "bb-3", "team": "violet", "inSec": 7}, {"id": "bb-6", "team": "green", "inSec": 4.5}]
    obs["shop"] = [{"item": "amp", "cost": 350}, {"item": "road-case", "cost": 300}]
    return obs


class DescribeObservationEconomyTests(unittest.TestCase):
    def test_an_observation_without_economy_fields_is_byte_identical_to_before(self):
        self.assertEqual(FH.describe_observation(_PLAIN_OBS), _PLAIN_TEXT)

    def test_the_scenario_observations_are_unchanged_too(self):
        from scenarios import SCENARIOS, build_observation
        for sc in SCENARIOS:
            text = FH.describe_observation(build_observation(sc, "violet", "violin"))
            for word in ("gold", "level", "Items:", "respawns", "shop"):
                self.assertNotIn(word, text)

    def test_the_example_observation(self):
        text = FH.describe_observation(_economy_obs())
        for sentence in (
            "This bearbot is level 3 (130 XP to level 4).",
            "It carries 340 unspent gold; if it dies, 170 of it goes to the bots that kill it, and killing it is worth 470 gold to the enemy team.",
            "Items: Amp (2 of 3 slots free).",
            "Next on its shopping list: Bass Strings, 350 gold -- it cannot afford it yet.",
            "It is not at its base.",
            "Ally bb-2 (level 2, items: Road Case) carries 120 gold.",
            "Enemy bb-5 (level 3, items: Metronome) is worth 410 gold if killed.",
            "Ally bb-3 respawns in 7 s.",
            "Enemy bb-6 respawns in 4.5 s.",
            "The base shop sells: Amp (350 gold), Road Case (300 gold).",
        ):
            self.assertIn(sentence, text)

    def test_death_sentence_all_goes_to_the_killers(self):
        self.assertIn("if it dies, 170 of it goes to the bots that kill it", FH.describe_observation(_economy_obs()))

    def test_death_sentence_part_goes_to_the_killers(self):
        text = FH.describe_observation(_economy_obs(deathLoss=170, deathPayout=85, bounty=385))
        self.assertIn("if it dies, it loses 170 of it: 85 goes to the killers and the rest is lost", text)
        self.assertIn("worth 385 gold", text)

    def test_death_sentence_all_of_it_is_lost(self):
        text = FH.describe_observation(_economy_obs(deathLoss=170, deathPayout=0, bounty=300))
        self.assertIn("if it dies, 170 of it is lost", text)
        self.assertNotIn("goes to", text.split("It carries")[1].split(".")[0])

    def test_death_sentence_nothing_at_stake(self):
        text = FH.describe_observation(_economy_obs(deathLoss=0, deathPayout=0, bounty=300))
        self.assertIn("It carries 340 unspent gold; its gold is safe if it dies, and killing it is worth 300 gold to the enemy team.", text)

    def test_can_afford_and_at_shop(self):
        text = FH.describe_observation(_economy_obs(gold=400, atShop=True))
        self.assertIn("350 gold -- it can afford it now.", text)
        self.assertIn("It is at its base, where it can shop.", text)

    def test_max_level_empty_build_and_finished_list(self):
        text = FH.describe_observation(_economy_obs(level=5, xpToNext=None, items=[], slotsFree=3, nextItem=None))
        self.assertIn("This bearbot is level 5 (the highest level).", text)
        self.assertIn("Items: none (3 of 3 slots free).", text)
        self.assertIn("Nothing is left on its shopping list to buy.", text)


if __name__ == "__main__":
    unittest.main()
