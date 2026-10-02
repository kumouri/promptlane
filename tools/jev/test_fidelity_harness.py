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


def _obs(objective=True, **stand):
    """An empty_lane_push observation (self at (300,500), violet), with a `bandstand` block at the
    top-side site (300,300) -- 200 units away -- unless `objective` is False."""
    from scenarios import SCENARIOS, build_observation

    obs = build_observation(SCENARIOS[0], "violet", "drums")
    if objective:
        obs["self"]["encoreSec"] = 0
        for a in obs["allies"]:
            a["encoreSec"] = 0
        block = {"site": "top-side", "pos": {"x": 300, "y": 300}, "radius": 60, "status": "open",
                 "opensInSec": None, "progress": 0, "contested": False, "alliesOn": 0, "selfOn": False}
        block.update(stand)
        obs["bandstand"] = block
    return obs


STAKES = "Taking it gives your whole team Encore (+15 % attack damage, +10 % move speed for 45 s)"


class DescribeObservationBandstandTests(unittest.TestCase):
    """The river objective's lines in `describe_observation` (docs/economy-spec.md §9.7) -- the
    prose Jev reads, live via schema_server.py."""

    def test_no_objective_adds_exactly_one_line_at_the_end(self):
        text = FH.describe_observation(_obs(objective=False))
        self.assertTrue(text.endswith(" No minions nearby. There is no Bandstand in this match."), text)
        self.assertEqual(text.count("Bandstand"), 1)
        self.assertNotIn("Encore", text)

    def test_every_original_scenario_gains_only_that_line(self):
        from scenarios import all_scenarios, build_observation

        for scenario in all_scenarios():
            text = FH.describe_observation(build_observation(scenario, "violet", "keytar"))
            self.assertTrue(text.endswith(". There is no Bandstand in this match."), scenario.name)
            self.assertEqual(text.count("Bandstand"), 1, scenario.name)

    def test_closed(self):
        text = FH.describe_observation(_obs(status="closed", site="bottom-side", pos={"x": 700, "y": 700}, opensInSec=55))
        self.assertIn("The Bandstand is closed; the next one opens at the bottom-side river in 55 s.", text)
        self.assertNotIn("Taking it", text)
        self.assertNotIn("no Bandstand", text)

    def test_upcoming(self):
        text = FH.describe_observation(_obs(status="upcoming", opensInSec=12))
        self.assertIn("The Bandstand opens at the top-side river in 12 s, 200 units from you.", text)
        self.assertNotIn("Taking it", text)

    def test_done(self):
        text = FH.describe_observation(_obs(status="done", site="bottom-side", pos={"x": 700, "y": 700}))
        self.assertIn("The Bandstand is done for this match; it will not open again.", text)

    def test_open_enemy_taking_it_with_nobody_of_ours_on_it(self):
        text = FH.describe_observation(_obs(progress=-0.4))
        self.assertIn(
            "The Bandstand at the top-side river is open, 200 units from you. The enemy team is 40 % "
            "of the way to taking it and none of your team is on it. " + STAKES + ".", text)

    def test_open_ours_with_self_and_allies_on_it(self):
        self.assertIn("Your team is 65 % of the way to taking it and you are on it.",
                      FH.describe_observation(_obs(progress=0.65, alliesOn=1, selfOn=True)))
        self.assertIn("Your team is 65 % of the way to taking it and 2 of your team are on it, you included.",
                      FH.describe_observation(_obs(progress=0.65, alliesOn=2, selfOn=True)))
        self.assertIn("and 2 of your team are on it.", FH.describe_observation(_obs(progress=0.65, alliesOn=2)))
        self.assertIn("and 1 of your team is on it.", FH.describe_observation(_obs(progress=0.65, alliesOn=1)))

    def test_open_with_no_progress(self):
        self.assertIn("Nobody has made progress on it and none of your team is on it.",
                      FH.describe_observation(_obs()))

    def test_contested(self):
        text = FH.describe_observation(_obs(progress=0.2, contested=True, alliesOn=1))
        self.assertIn("Both teams are on it, so it is contested and nobody can take it until one side leaves.", text)
        self.assertNotIn("contested", FH.describe_observation(_obs(progress=0.2, alliesOn=1)))

    def test_stakes_mention_gold_only_when_the_economy_is_on(self):
        self.assertIn(STAKES + ".", FH.describe_observation(_obs()))
        self.assertNotIn("gold", FH.describe_observation(_obs()))
        obs = _obs()
        obs["self"]["gold"] = 120
        self.assertIn(STAKES + " and 40 gold each.", FH.describe_observation(obs))

    def test_stakes_numbers_come_from_river_1_json(self):
        from scenarios import river_rules

        r = river_rules()
        self.assertIn(f"for {r['encore']['durationSec']} s", FH.describe_observation(_obs()))
        self.assertIn(f"+{round(r['encore']['mods']['attackDamage'] * 100)} % attack damage", FH.describe_observation(_obs()))

    def test_encore_lines(self):
        obs = _obs(status="closed", opensInSec=70)
        obs["self"]["encoreSec"] = 21.0
        obs["allies"][0]["encoreSec"] = 20.3
        obs["visibleEnemies"] = [
            {"id": "bb-5", "kind": "bearbot", "pos": {"x": 400, "y": 400}, "hp": 100, "maxHp": 200, "encore": True},
            {"id": "bb-6", "kind": "bearbot", "pos": {"x": 420, "y": 400}, "hp": 100, "maxHp": 200, "encore": False},
        ]
        text = FH.describe_observation(obs)
        self.assertIn("You have Encore for 21 more seconds.", text)
        self.assertIn(f"Ally {obs['allies'][0]['id']} has Encore for 21 more seconds.", text)
        self.assertIn("Enemy bb-5 has Encore.", text)
        self.assertNotIn("bb-6 has Encore", text)
        self.assertEqual(text.count("Encore"), 3)  # closed: no stakes sentence

    def test_encore_omitted_when_nobody_has_it_and_singular_second(self):
        self.assertNotIn("has Encore", FH.describe_observation(_obs(status="done")))
        self.assertNotIn("have Encore", FH.describe_observation(_obs(status="done")))
        obs = _obs(status="done")
        obs["self"]["encoreSec"] = 0.4
        self.assertIn("You have Encore for 1 more second.", FH.describe_observation(obs))

    def test_objective_scenarios_describe_and_resolve(self):
        from scenarios import build_observation, objective_scenarios
        from target_resolve import resolve_target

        for scenario in objective_scenarios():
            obs = build_observation(scenario, "violet", "violin")
            text = FH.describe_observation(obs)
            self.assertNotIn("There is no Bandstand", text, scenario.name)
            target = resolve_target("bandstand", obs)
            if obs["bandstand"]["status"] in ("open", "upcoming"):
                self.assertEqual(target, obs["bandstand"]["pos"], scenario.name)
            else:
                self.assertEqual(target, resolve_target("push_lane", obs), scenario.name)


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
        # Before the economy, plus the river objective's one closing sentence (§9.7): an observation
        # without a `bandstand` block says so, so the with/without measurement (§9.8) stays clean.
        self.assertEqual(FH.describe_observation(_PLAIN_OBS), _PLAIN_TEXT + " There is no Bandstand in this match.")

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



def _late_obs(**self_over):
    """An eco-3-late observation (docs/late-game-economy-spec.md §7.3): items of any tier, `nextItem`
    and `shop` entries carrying `tier` (and `from` for a recipe or upgrade)."""
    obs = _economy_obs(**{"level": 7, "xpToNext": 110, "items": ["backline", "metronome"], "slotsFree": 1,
                          "nextItem": {"item": "wall-of-sound", "cost": 400, "tier": 3, "from": ["backline"]}, **self_over})
    obs["allies"][0].update(items=["click-track"])
    obs["visibleEnemies"][0].update(level=7, items=["arpeggiator", "amp"])
    obs["shop"] = [{"item": "amp", "cost": 350, "tier": 1},
                   {"item": "backline", "cost": 250, "tier": 2, "from": ["road-case", "bass-strings"]},
                   {"item": "wall-of-sound", "cost": 400, "tier": 3, "from": ["backline"]}]
    return obs


class DescribeObservationLateGameTests(unittest.TestCase):
    def test_own_items_name_their_tier_and_parts(self):
        text = FH.describe_observation(_late_obs())
        self.assertIn("Items: Backline (tier 2, made from Road Case and Bass Strings), Metronome (1 of 3 slots free).", text)
        text = FH.describe_observation(_late_obs(items=["wall-of-sound", "arpeggiator", "amp"], slotsFree=0))
        self.assertIn("Items: Wall of Sound (tier 3, upgraded from Backline), Arpeggiator (tier 3, upgraded from Click Track), "
                      "Amp (0 of 3 slots free).", text)

    def test_next_item_says_upgrade_or_combine(self):
        text = FH.describe_observation(_late_obs())
        self.assertIn("Next on its shopping list: Wall of Sound, an upgrade of its Backline, 400 gold -- it cannot afford it yet.", text)
        text = FH.describe_observation(_late_obs(gold=260, nextItem={"item": "backline", "cost": 250, "tier": 2, "from": ["road-case", "bass-strings"]}))
        self.assertIn("Next on its shopping list: Backline, combining its Road Case and Bass Strings, 250 gold -- it can afford it now.", text)

    def test_a_tier_1_next_item_reads_as_before(self):
        text = FH.describe_observation(_late_obs(nextItem={"item": "amp", "cost": 350, "tier": 1}))
        self.assertIn("Next on its shopping list: Amp, 350 gold -- it cannot afford it yet.", text)

    def test_allies_and_enemies_name_the_tier(self):
        text = FH.describe_observation(_late_obs())
        self.assertIn("Ally bb-2 (level 2, items: Click Track (tier 2)) carries 120 gold.", text)
        self.assertIn("Enemy bb-5 (level 7, items: Arpeggiator (tier 3), Amp) is worth 410 gold if killed.", text)

    def test_the_shop_says_what_a_recipe_or_upgrade_takes(self):
        text = FH.describe_observation(_late_obs())
        self.assertIn("The base shop sells: Amp (350 gold), Backline (250 gold to combine Road Case and Bass Strings), "
                      "Wall of Sound (400 gold to upgrade Backline).", text)

    def test_level_8_is_the_highest_level(self):
        text = FH.describe_observation(_late_obs(level=8, xp=1010, xpToNext=None))
        self.assertIn("This bearbot is level 8 (the highest level).", text)

    def test_a_tier_field_alone_changes_nothing(self):
        # eco-3-late's tier-1 entries carry "tier": 1; they must read exactly as an older ruleset's
        old = _economy_obs()
        new = json.loads(json.dumps(old))
        new["self"]["nextItem"]["tier"] = 1
        for entry in new["shop"]:
            entry["tier"] = 1
        self.assertEqual(FH.describe_observation(new), FH.describe_observation(old))

    def test_unknown_keys_never_raise(self):
        text = FH.describe_observation(_late_obs(items=["mystery-item"], slotsFree=2, nextItem={"item": "nope", "cost": 5, "tier": 2, "from": ["huh", "what"]}))
        self.assertIn("Items: mystery-item (2 of 3 slots free).", text)
        self.assertIn("Next on its shopping list: nope, combining its huh and what, 5 gold", text)

if __name__ == "__main__":
    unittest.main()
