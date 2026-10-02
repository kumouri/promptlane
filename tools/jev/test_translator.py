"""Tests for tools/jev/translator.py's pure parsing/validation logic (no Ollama call)."""
from __future__ import annotations

import dataclasses
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import translator as T  # noqa: E402


VALID_SCHEMA = {
    "rules": [
        {
            "id": "recall_low_hp",
            "condition": "is hp below a quarter of max?",
            "criteria": {"true": "hp < 25%", "false": "hp >= 25%"},
            "action": {"kind": "recall", "ability": None, "target_selector": "home"},
        },
        {
            "id": "engage",
            "condition": "is an enemy bearbot visible?",
            "action": {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"},
        },
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
}


class ExtractJsonObjectTests(unittest.TestCase):
    def test_extracts_bare_json(self):
        obj = T._extract_json_object(json.dumps(VALID_SCHEMA))
        self.assertEqual(obj["default_action"]["kind"], "move")

    def test_extracts_json_wrapped_in_prose_and_fences(self):
        wrapped = f"Sure, here's the schema:\n```json\n{json.dumps(VALID_SCHEMA)}\n```\nHope that helps!"
        obj = T._extract_json_object(wrapped)
        self.assertEqual(len(obj["rules"]), 2)

    def test_nested_braces_do_not_truncate_early(self):
        # the JSON's own criteria dicts contain braces -- a greedy regex would stop at the first
        # close-brace, not the real end of the object.
        obj = T._extract_json_object(json.dumps(VALID_SCHEMA) + "\n\ntrailing text {not json}")
        self.assertEqual(obj["rules"][0]["id"], "recall_low_hp")

    def test_no_json_object_raises(self):
        with self.assertRaises(ValueError):
            T._extract_json_object("no braces here at all")

    def test_unbalanced_json_raises(self):
        with self.assertRaises(ValueError):
            T._extract_json_object('{"rules": [{"id": "x"')


class ParseSchemaTests(unittest.TestCase):
    def test_parses_a_valid_schema(self):
        schema = T.parse_schema(VALID_SCHEMA, "prompts/pilots/drums.md", "drums", "raw")
        self.assertEqual(len(schema.rules), 2)
        self.assertEqual(schema.rules[0].action_kind, "recall")
        self.assertEqual(schema.rules[0].action_target_selector, "home")
        self.assertEqual(schema.default_kind, "move")

    def test_missing_criteria_falls_back_to_defaults(self):
        schema = T.parse_schema(VALID_SCHEMA, "prompts/pilots/drums.md", "drums", "raw")
        engage = next(r for r in schema.rules if r.id == "engage")
        self.assertEqual(engage.criteria_true, "the condition holds")

    def test_invalid_action_kind_raises(self):
        bad = json.loads(json.dumps(VALID_SCHEMA))
        bad["rules"][0]["action"]["kind"] = "teleport"
        with self.assertRaises(ValueError):
            T.parse_schema(bad, "x", "drums", "raw")

    def test_unknown_target_selector_raises(self):
        bad = json.loads(json.dumps(VALID_SCHEMA))
        bad["rules"][0]["action"]["target_selector"] = "the_scariest_one"
        with self.assertRaises(ValueError):
            T.parse_schema(bad, "x", "drums", "raw")

    def test_zero_rules_raises(self):
        with self.assertRaises(ValueError):
            T.parse_schema({"rules": [], "default_action": VALID_SCHEMA["default_action"]}, "x", "drums", "raw")

    def test_missing_condition_raises(self):
        bad = json.loads(json.dumps(VALID_SCHEMA))
        del bad["rules"][0]["condition"]
        with self.assertRaises(ValueError):
            T.parse_schema(bad, "x", "drums", "raw")


def _schema_from_rule_specs(rule_specs: list[dict], default_action: dict | None = None) -> T.TranslatedSchema:
    raw = {
        "rules": rule_specs,
        "default_action": default_action or {"kind": "move", "ability": None, "target_selector": "push_lane"},
    }
    return T.parse_schema(raw, "prompts/pilots/keytar.md", "keytar", "raw")


# The exact 6-rule shape reproduced live (host Ollama qwen3.5:9b, temperature 0.2) from
# `prompts/pilots/keytar.md`, 3/3 runs: the recall rule ("no exceptions" in the prose) translated
# correctly in isolation but placed last, behind an unrelated ability-cooldown rule with no
# enemy-presence check -- see docs/prose-to-schema-translator.md §4.2 for the live fidelity impact.
KEYTAR_REPRO_RULES = [
    {
        "id": "panic_dash_out",
        "condition": "is a visible enemy inside melee range of this bot?",
        "criteria": {"true": "an enemy is within melee distance, risking immediate death", "false": "no enemy is within immediate melee threat"},
        "action": {"kind": "ability", "ability": "glissando", "target_selector": "none"},
    },
    {
        "id": "engage_dense_cluster",
        "condition": "is there a dense cluster of enemies visible?",
        "criteria": {"true": "multiple enemies are grouped together nearby", "false": "no dense group of enemies is present"},
        "action": {"kind": "ability", "ability": "chord", "target_selector": "densest_cluster_enemy"},
    },
    {
        "id": "poke_minions",
        "condition": "are there nearby allied minions in the wave?",
        "criteria": {"true": "minions are present and safe to attack", "false": "no minions are nearby or safe"},
        "action": {"kind": "attack", "ability": None, "target_selector": "nearby_minion"},
    },
    {
        "id": "advance_lane",
        "condition": "is the bot currently at or near its home base?",
        "criteria": {"true": "the bot is stationary or retreating to base", "false": "the bot is not at home and can advance"},
        "action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
    },
    {
        "id": "recall_low_hp",
        "condition": "is this bot's current health below a quarter of its max health?",
        "criteria": {"true": "health is critically low (below 25%)", "false": "health is above the critical threshold"},
        "action": {"kind": "recall", "ability": None, "target_selector": "none"},
    },
]

KEYTAR_PILOT_TEXT = """You are a bearbot on the keytar. Loud, flashy, and made of paper.

Never be the closest thing to an enemy. If a visible enemy is inside your attack range, that is too
close.

Chord (AoE burst, long range) is your headline move -- throw it at the densest cluster of enemies or
minions you can see the instant it's off cooldown, don't wait for a "perfect" moment.

Poke minion waves with your basic attack while nothing else demands attention.

Recall the moment you're below a quarter health, no exceptions -- you have no way to survive a
follow-up hit and a dead mage is a silent one.
"""


class EnforceAbsolutePriorityTests(unittest.TestCase):
    def test_promotes_the_override_rule_reproduced_from_keytar(self):
        schema = _schema_from_rule_specs(KEYTAR_REPRO_RULES)
        self.assertEqual(schema.rules[0].id, "panic_dash_out")  # sanity: bug reproduced before the fix
        fixed = T.enforce_absolute_priority(schema, KEYTAR_PILOT_TEXT)
        self.assertEqual(fixed.rules[0].id, "recall_low_hp")
        self.assertEqual({r.id for r in fixed.rules}, {r.id for r in schema.rules})  # no rule lost
        self.assertEqual(len(fixed.validation_notes), 1)
        self.assertIn("recall_low_hp", fixed.validation_notes[0])

    def test_relative_order_preserved_among_non_override_rules(self):
        schema = _schema_from_rule_specs(KEYTAR_REPRO_RULES)
        fixed = T.enforce_absolute_priority(schema, KEYTAR_PILOT_TEXT)
        remaining_ids = [r.id for r in fixed.rules if r.id != "recall_low_hp"]
        self.assertEqual(remaining_ids, ["panic_dash_out", "engage_dense_cluster", "poke_minions", "advance_lane"])

    def test_noop_when_override_rule_already_first(self):
        already_first = [KEYTAR_REPRO_RULES[-1]] + KEYTAR_REPRO_RULES[:-1]
        schema = _schema_from_rule_specs(already_first)
        fixed = T.enforce_absolute_priority(schema, KEYTAR_PILOT_TEXT)
        self.assertEqual([r.id for r in fixed.rules], [r.id for r in schema.rules])
        self.assertEqual(fixed.validation_notes, ())

    def test_noop_when_prose_has_no_override_language(self):
        schema = _schema_from_rule_specs(KEYTAR_REPRO_RULES)
        prose_without_override = KEYTAR_PILOT_TEXT.replace(", no exceptions", "")
        fixed = T.enforce_absolute_priority(schema, prose_without_override)
        self.assertEqual([r.id for r in fixed.rules], [r.id for r in schema.rules])
        self.assertEqual(fixed.validation_notes, ())

    def test_raises_when_override_paragraph_has_no_matching_rule(self):
        rules_missing_recall = [r for r in KEYTAR_REPRO_RULES if r["id"] != "recall_low_hp"]
        schema = _schema_from_rule_specs(rules_missing_recall)
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_absolute_priority(schema, KEYTAR_PILOT_TEXT)

    def test_always_and_never_are_not_treated_as_override_markers(self):
        # drums.md's real wording for Kick ("on cooldown, always, no hesitation") -- if "always" were
        # an override marker, this would wrongly promote the ability rule above an unrelated recall
        # rule that has no "always"/"never" in its own paragraph at all.
        prose = (
            "Use Kick the instant an enemy bearbot is close enough to touch -- on cooldown, always, "
            "no hesitation, no overthinking.\n\n"
            "Retreat only when you're really hurt, below a quarter health."
        )
        rules = [
            {
                "id": "close_enemy_kick",
                "condition": "is an enemy bearbot within melee range?",
                "action": {"kind": "ability", "ability": "kick", "target_selector": "nearest_enemy"},
            },
            {
                "id": "low_health_retreat",
                "condition": "is this bot's hp below a quarter of its max?",
                "action": {"kind": "recall", "ability": None, "target_selector": "home"},
            },
        ]
        schema = _schema_from_rule_specs(rules)
        fixed = T.enforce_absolute_priority(schema, prose)
        self.assertEqual([r.id for r in fixed.rules], ["close_enemy_kick", "low_health_retreat"])
        self.assertEqual(fixed.validation_notes, ())


# PR #84's variant 3: "..., I back off home instead of tanking the tower alone, no matter what else is
# going on." Its exact prose and four of its compiled schemas (testdata/override_lookalike.json).
LOOKALIKE = json.loads(open(os.path.join(os.path.dirname(__file__), "testdata", "override_lookalike.json"), encoding="utf-8").read())


def _lookalike(index: int, vocab: str = "vocab-2") -> tuple[T.TranslatedSchema, str]:
    case = LOOKALIKE["schemas"][index]
    schema = T.parse_schema(case["reply"], "prompts/pilots/sample-entrant-eco.prose.md", case["instrument"], "raw", vocab, economy="eco-3-late")
    return schema, T.scope_to_instrument(LOOKALIKE["prose"], case["instrument"]).text


class VocabTwoPriorityGuardTests(unittest.TestCase):
    def test_a_lookalike_of_a_dropped_rule_is_never_promoted(self):
        for i in (0, 1, 2):  # keytar s4, violin s4, violin s3: back off dropped
            case = LOOKALIKE["schemas"][i]
            schema, prose = _lookalike(i)
            self.assertIn(case["old_guard_promoted"], [r.id for r in schema.rules])
            with self.subTest(case["sample"] + " " + case["instrument"]), self.assertRaises(T.SchemaValidationError) as err:
                T.enforce_absolute_priority(schema, prose)
            self.assertIn("back off home instead of tanking the tower alone", str(err.exception))

    def test_the_rule_the_phrase_modifies_is_promoted(self):
        schema, prose = _lookalike(3)  # drums s1: back off compiled, last
        self.assertEqual(schema.rules[-1].id, "avoid_tower_alone")
        fixed = T.enforce_absolute_priority(schema, prose)
        self.assertEqual(fixed.rules[0].id, "avoid_tower_alone")
        self.assertEqual([r.id for r in fixed.rules[1:]], [r.id for r in schema.rules[:-1]])
        self.assertIn("promoted rule(s) avoid_tower_alone", fixed.validation_notes[-1])

    def test_vocab1_keeps_its_guard_exactly(self):
        # Including its misfires: the three look-alikes, and on drums s1 a tie between back off and the
        # attack-tower rule that goes to whichever the translator wrote first (here, the attack rule).
        want = [c["old_guard_promoted"] for c in LOOKALIKE["schemas"][:3]] + ["attack_tower_wave"]
        for i, case in enumerate(LOOKALIKE["schemas"]):
            schema, prose = _lookalike(i)
            fixed = T.enforce_absolute_priority(dataclasses.replace(schema, vocab="vocab-1"), prose)
            self.assertEqual(fixed.rules[0].id, want[i], case["sample"])

    def test_translate_pilot_retries_and_the_retry_names_the_sentence(self):
        dropped = LOOKALIKE["schemas"][0]["reply"]
        back_off = {"id": "back_off_tower", "condition": "is an enemy tower visible and are none of this bot's minions near it?",
                    "criteria": {"true": "an enemy tower is visible and no allied minion is near", "false": "no enemy tower or a minion is near"},
                    "action": {"kind": "move", "ability": None, "target_selector": "home"}}
        fixed_reply = {**dropped, "rules": dropped["rules"] + [back_off]}
        replies, prompts = [json.dumps(dropped), json.dumps(fixed_reply)], []

        def generate(prompt):
            prompts.append(prompt)
            return replies[len(prompts) - 1]

        schema = T.translate_pilot(LOOKALIKE["prose"], "prompts/pilots/sample-entrant-eco.prose.md", "keytar", "chord", "glissando",
                                   generate=generate, vocab="vocab-2", economy="eco-3-late")
        self.assertEqual(len(prompts), 2)
        self.assertIn("on a rule the schema does not have", prompts[1])
        self.assertEqual(schema.rules[0].id, "back_off_tower")

    def test_keytar_repro_still_promotes_recall(self):
        schema = dataclasses.replace(_schema_from_rule_specs(KEYTAR_REPRO_RULES), vocab="vocab-2")
        fixed = T.enforce_absolute_priority(schema, KEYTAR_PILOT_TEXT)
        self.assertEqual(fixed.rules[0].id, "recall_low_hp")
        self.assertEqual({r.id for r in fixed.rules}, {r.id for r in schema.rules})

    def test_always_and_never_are_still_not_override_markers(self):
        # "never" gates a rule; promoting the recall it's on would put it above back off (#84's variant 5).
        prose = ("If I can see an enemy tower and none of my minions are near me, I back off home.\n\n"
                 "I recall home to heal when my hp is below a third, but never inside an enemy tower's range.\n\n"
                 "Use kick on cooldown, always, no hesitation.")
        rules = [
            {"id": "back_off", "condition": "is an enemy tower visible and none of this bot's minions near?",
             "action": {"kind": "move", "ability": None, "target_selector": "home"}},
            {"id": "recall_low", "condition": "is this bot's hp below a third of its max?",
             "action": {"kind": "recall", "ability": None, "target_selector": "none"}},
            {"id": "kick", "condition": "is kick ready and an enemy bearbot in range?",
             "action": {"kind": "ability", "ability": "kick", "target_selector": "nearest_enemy_bearbot"}},
        ]
        schema = T.parse_schema({"rules": rules, "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}},
                                "p.md", "drums", "raw", "vocab-2")
        self.assertIs(T.enforce_absolute_priority(schema, prose), schema)

    def test_no_override_language_is_a_noop(self):
        schema, prose = _lookalike(3)
        fixed = T.enforce_absolute_priority(schema, prose.replace(", no matter what else is going on", ""))
        self.assertIs(fixed, schema)


class NodeCountPromptTests(unittest.TestCase):
    def test_vocab2_has_no_upper_bound(self):
        prompt = T._translation_prompt("Push the lane.", "drums", "kick", "fill", "vocab-2")
        self.assertNotIn("between 3 and 8", prompt)
        self.assertIn("one top-level node for every rule the prose states, as many as it has (at least one)", prompt)

    def test_vocab1_keeps_3_to_8(self):
        self.assertIn("Use between 3 and 8 top-level nodes.", T._translation_prompt("Push the lane.", "drums", "kick", "fill"))


SHOPPING = json.loads(open(os.path.join(os.path.dirname(__file__), "testdata", "shopping_rules.json"), encoding="utf-8").read())


def _shopping_reply(index: int, **changes) -> dict:
    """A saved schema of `shopping_rules.json` as the translator reply it was parsed from."""
    saved = {**SHOPPING["schemas"][index]["schema"], **changes}
    rules = [{"id": r["id"], "condition": r["condition"], "criteria": {"true": r["criteria_true"], "false": r["criteria_false"]},
              "action": {"kind": r["action_kind"], "ability": r["action_ability"], "target_selector": r["action_target_selector"]}}
             for r in saved["rules"]]
    reply = {"rules": rules, "default_action": saved["default_action"]}
    if saved.get("build") is not None:
        reply["build"] = saved["build"]
    return reply


def _shopping(index: int, **changes) -> tuple[T.TranslatedSchema, str]:
    case = SHOPPING["schemas"][index]
    schema = T.parse_schema(_shopping_reply(index, **changes), "pilot.md", case["instrument"], "raw", "vocab-2", economy="eco-3-late")
    return schema, T.scope_to_instrument(SHOPPING["prose"], case["instrument"]).text


class ShoppingListIsNotARuleTests(unittest.TestCase):
    """vocab-2: a shopping-list line is `build` only (#84's and #85's "at its base -> go home" rules)."""

    def test_the_rules_that_restate_the_shopping_list_are_dropped(self):
        for i, case in enumerate(SHOPPING["schemas"]):
            if case["drops"] == "raise" or not case["drops"]:
                continue
            schema, prose = _shopping(i)
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                fixed = T.enforce_shopping_list(schema, prose)
                self.assertEqual([r.id for r in fixed.rules], [r.id for r in schema.rules if r.id not in case["drops"]])
                self.assertEqual(fixed.build, schema.build)
                notes = fixed.validation_notes[len(schema.validation_notes):]
                self.assertEqual([n.split()[3] for n in notes], case["drops"])
                self.assertTrue(all(n.startswith("build: removed rule ") for n in notes))

    def test_no_parking_rule_survives(self):
        for i, case in enumerate(SHOPPING["schemas"]):
            if case["drops"] == "raise":
                continue
            fixed = T.enforce_shopping_list(*_shopping(i))
            self.assertFalse([r.id for r in fixed.rules if r.condition == "is this bot at its base?"], case["sample"])

    def test_real_go_home_rules_survive(self):
        for i, case in enumerate(SHOPPING["schemas"]):
            if case["drops"] == "raise":
                continue
            schema, prose = _shopping(i)
            kept = {r.id for r in T.enforce_shopping_list(schema, prose).rules}
            home = [r for r in schema.rules if r.action_target_selector == "home" and r.id not in case["drops"]]
            self.assertTrue(home, case["sample"])  # back off, spend gold, no minions, ...
            for r in home:
                self.assertIn(r.id, kept, f"{case['sample']}: {r.condition}")

    def test_afford_my_next_item_is_a_rule_even_when_it_lists_the_items(self):
        schema, prose = _shopping(5)  # #84 s4 keytar
        self.assertIn("(Metronome, then Amp, then Road Case)", schema.rules[0].condition)
        self.assertIs(T.enforce_shopping_list(schema, prose), schema)

    def test_a_clean_compile_is_unchanged(self):
        schema, prose = _shopping(6)  # #85 s1 drums
        self.assertIs(T.enforce_shopping_list(schema, prose), schema)

    def test_no_build_list_raises_and_quotes_the_line(self):
        schema, prose = _shopping(3)  # #85 s2 violin
        self.assertIsNone(schema.build)
        with self.assertRaises(T.SchemaValidationError) as err:
            T.enforce_shopping_list(schema, prose)
        self.assertIn("Violin: Amp, then Bass Strings, then Road Case.", str(err.exception))
        self.assertIn('"build"', str(err.exception))

    def test_translate_pilot_retries_when_the_list_became_rules_only(self):
        fixed_reply = _shopping_reply(3)
        fixed_reply = {**fixed_reply, "build": ["amp", "bass-strings", "road-case"],
                       "rules": [r for r in fixed_reply["rules"] if r["id"] != "shop_order" and not r["id"].startswith("shop_")]}
        replies, prompts = [json.dumps(_shopping_reply(3)), json.dumps(fixed_reply)], []

        def generate(prompt):
            prompts.append(prompt)
            return replies[len(prompts) - 1]

        schema = T.translate_pilot(SHOPPING["prose"], "pilot.md", "violin", "staccato", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 2)
        self.assertIn("Violin: Amp, then Bass Strings, then Road Case.", prompts[1].split("Your previous attempt was invalid:")[1])
        self.assertEqual(schema.build, ("amp", "bass-strings", "road-case"))

    def test_translate_pilot_drops_them_without_a_retry_when_build_is_there(self):
        prompts = []

        def generate(prompt):
            prompts.append(prompt)
            return json.dumps(_shopping_reply(0))  # #85 s4 drums

        schema = T.translate_pilot(SHOPPING["prose"], "pilot.md", "drums", "kick", "fill", generate=generate, vocab="vocab-2", economy="eco-3-late")
        self.assertEqual(len(prompts), 1)
        self.assertFalse({"buy_road_case", "buy_bass_strings", "buy_metronome"} & {r.id for r in schema.rules})
        self.assertEqual(schema.build, ("road-case", "bass-strings", "metronome"))
        md = T.render_markdown(schema)
        self.assertIn("**Shopping list -- what was changed:**", md)
        self.assertIn("removed rule buy_road_case", md)

    def test_vocab1_is_unchanged(self):
        schema, prose = _shopping(0)
        schema = dataclasses.replace(schema, vocab="vocab-1")
        self.assertIs(T.enforce_shopping_list(schema, prose), schema)

    def test_what_is_a_shopping_sentence(self):
        pats = T._item_patterns("eco-3-late")
        for s in ("buy an amp first, then a road case", "Drums: Road Case, then Bass Strings, then Metronome.",
                  "Our shopping lists, in order:\nViolin: Amp, then Bass Strings, then Road Case.", "Rush a Wall of Sound."):
            self.assertTrue(T._is_shopping_sentence(s, pats), s)
        for s in ("I buy an Amp when I can afford it.", "When I can afford my next item and no enemy is in sight, I head home to shop.",
                  "When my hp drops below a third of my max, I go home.", "Once I own a Road Case, I dive their tower."):
            self.assertFalse(T._is_shopping_sentence(s, pats), s)

    def test_a_rule_about_an_item_another_sentence_names_is_kept(self):
        prose = "Buy a Road Case first, then an Amp.\n\nOnce I have a Road Case, I attack the nearest enemy tower."
        rules = [{"id": "dive_with_case", "condition": "does this bot have a Road Case?", "action": {"kind": "attack", "ability": None, "target_selector": "nearest_tower"}},
                 {"id": "buy_amp", "condition": "does this bot have an Amp?", "action": {"kind": "move", "ability": None, "target_selector": "home"}}]
        schema = T.parse_schema({"rules": rules, "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
                                 "build": ["road-case", "amp"]}, "p.md", "drums", "raw", "vocab-2")
        self.assertEqual([r.id for r in T.enforce_shopping_list(schema, prose).rules], ["dive_with_case"])

    def test_an_at_base_rule_the_prose_states_is_kept(self):
        prose = "Buy an Amp first, then a Road Case.\n\nIf I'm at my base, I wait there for the next wave."
        rules = [{"id": "shop_wait", "condition": "is this bot at its base?", "action": {"kind": "hold", "ability": None, "target_selector": None}}]
        schema = T.parse_schema({"rules": rules, "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
                                 "build": ["amp", "road-case"]}, "p.md", "drums", "raw", "vocab-2")
        self.assertIs(T.enforce_shopping_list(schema, prose), schema)

    def test_the_prompt_does_not_name_the_parking_rule(self):
        # A vocab-2 prompt line forbidding "is this bot at its base?" rules doubled how often the translator
        # wrote them (runs/vocab2-shopping-not-rules-2026-10-02.md §2); the guard alone does the job.
        for vocab in ("vocab-1", "vocab-2"):
            self.assertNotIn("at its base?", T._translation_prompt("Buy the amp.", "drums", "kick", "fill", vocab, economy="eco-3-late"))

    def test_a_build_action_says_where_the_list_goes(self):
        reply = _shopping_reply(0)
        reply["rules"][1]["action"]["kind"] = "build"  # #85's variant-3 s1 violin failed on this
        with self.assertRaises(ValueError) as err:
            T.parse_schema(reply, "p.md", "drums", "raw", "vocab-2", economy="eco-3-late")
        self.assertIn('top-level "build" list', str(err.exception))
        with self.assertRaises(ValueError) as err:
            T.parse_schema(reply, "p.md", "drums", "raw", "vocab-1", economy="eco-3-late")
        self.assertEqual(str(err.exception), "rule buy_road_case: invalid action kind 'build'")


class RenderMarkdownTests(unittest.TestCase):
    def test_render_is_plain_prose_with_no_jev_wire_terms(self):
        schema = T.parse_schema(VALID_SCHEMA, "prompts/pilots/drums.md", "drums", "raw")
        md = T.render_markdown(schema)
        self.assertIn("recall_low_hp", "".join(r.id for r in schema.rules))  # sanity on fixture
        self.assertIn("recall", md)
        self.assertIn("home", md)
        for wire_term in ("noul", "systemone", "criteria", '"true"'):
            self.assertNotIn(wire_term, md)

    def test_render_includes_every_rule_and_the_default(self):
        schema = T.parse_schema(VALID_SCHEMA, "prompts/pilots/drums.md", "drums", "raw")
        md = T.render_markdown(schema)
        for r in schema.rules:
            self.assertIn(r.condition, md)
        self.assertIn("none of the above", md)


GUARD_SCHEMA = {
    "rules": [
        {
            "id": "low_hp_recall",
            "condition": "is hp below a quarter of max?",
            "action": {"kind": "recall", "ability": None, "target_selector": "home"},
        },
        {
            "type": "guard",
            "id": "can_win_fight",
            "condition": "can this bot win the fight it is in?",
            "criteria": {"true": "yes, winnable", "false": "no, not winnable"},
            "then": {
                "nodes": [
                    {
                        "id": "opener_ready",
                        "condition": "is staccato off cooldown and a target in range?",
                        "action": {"kind": "ability", "ability": "staccato", "target_selector": "isolated_enemy"},
                    }
                ],
                "default_action": {"kind": "move", "ability": None, "target_selector": "isolated_enemy"},
            },
            "else": {
                "nodes": [],
                "default_action": {"kind": "move", "ability": None, "target_selector": "isolated_enemy"},
            },
        },
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
}


class GuardTreeParseTests(unittest.TestCase):
    def test_parses_a_guard_node_with_two_branches(self):
        schema = T.parse_schema(GUARD_SCHEMA, "prompts/pilots/violin.md", "violin", "raw")
        self.assertEqual(len(schema.root.nodes), 2)
        guard = schema.root.nodes[1]
        self.assertIsInstance(guard, T.GuardNode)
        self.assertEqual(guard.id, "can_win_fight")
        self.assertEqual(len(guard.then.nodes), 1)
        self.assertEqual(guard.then.default.kind, "move")
        self.assertEqual(guard.else_.nodes, ())
        self.assertEqual(guard.else_.default.target_selector, "isolated_enemy")

    def test_flat_view_excludes_guard_and_nested_rules(self):
        # backward compatibility: `schema.rules` is the ROOT cascade's own plain rule nodes only.
        schema = T.parse_schema(GUARD_SCHEMA, "prompts/pilots/violin.md", "violin", "raw")
        self.assertEqual([r.id for r in schema.rules], ["low_hp_recall"])

    def test_a_flat_schema_is_a_cascade_with_zero_guards(self):
        schema = T.parse_schema(VALID_SCHEMA, "prompts/pilots/drums.md", "drums", "raw")
        self.assertEqual(len(schema.root.nodes), 2)
        self.assertTrue(all(isinstance(n, T.TranslatedRule) for n in schema.root.nodes))
        self.assertEqual([r.id for r in schema.rules], [n.id for n in schema.root.nodes])

    def test_nested_guard_needs_both_then_and_else_as_cascade_objects(self):
        bad = json.loads(json.dumps(GUARD_SCHEMA))
        del bad["rules"][1]["else"]
        with self.assertRaises(ValueError):
            T.parse_schema(bad, "x", "violin", "raw")


class CollectNodesTests(unittest.TestCase):
    def test_collects_root_and_both_branches_depth_first(self):
        schema = T.parse_schema(GUARD_SCHEMA, "prompts/pilots/violin.md", "violin", "raw")
        ids = [n.id for n in T.collect_nodes(schema.root)]
        self.assertEqual(ids, ["low_hp_recall", "can_win_fight", "opener_ready"])


class EvaluateCascadeTests(unittest.TestCase):
    def setUp(self):
        self.schema = T.parse_schema(GUARD_SCHEMA, "prompts/pilots/violin.md", "violin", "raw")

    def test_a_root_rule_firing_wins_before_the_guard_is_even_consulted(self):
        answers = {"low_hp_recall": True, "can_win_fight": True, "opener_ready": True}
        action = T.evaluate_schema(self.schema, answers)
        self.assertEqual(action.kind, "recall")

    def test_guard_yes_with_a_nested_rule_firing(self):
        answers = {"low_hp_recall": False, "can_win_fight": True, "opener_ready": True}
        action = T.evaluate_schema(self.schema, answers)
        self.assertEqual((action.kind, action.ability), ("ability", "staccato"))

    def test_guard_yes_with_no_nested_rule_firing_uses_the_thens_own_default_not_root_default(self):
        answers = {"low_hp_recall": False, "can_win_fight": True, "opener_ready": False}
        action = T.evaluate_schema(self.schema, answers)
        self.assertEqual((action.kind, action.target_selector), ("move", "isolated_enemy"))

    def test_guard_no_commits_to_the_else_branch_not_the_root_default(self):
        # else has zero rules -- its own default should fire, NOT root's push_lane default. This is
        # the case the spec's own pseudocode omits (it never evaluates `else` at all); see
        # `evaluate_cascade`'s docstring for why the completed semantics must be symmetric.
        answers = {"low_hp_recall": False, "can_win_fight": False}
        action = T.evaluate_schema(self.schema, answers)
        self.assertEqual(action.target_selector, "isolated_enemy")
        self.assertNotEqual(action.target_selector, "push_lane")

    def test_guard_branch_with_no_default_escalates_to_the_nearest_enclosing_default(self):
        no_default_else = json.loads(json.dumps(GUARD_SCHEMA))
        no_default_else["rules"][1]["else"]["default_action"] = None
        schema = T.parse_schema(no_default_else, "x", "violin", "raw")
        answers = {"low_hp_recall": False, "can_win_fight": False}
        action = T.evaluate_schema(schema, answers)
        self.assertEqual(action.target_selector, "push_lane")  # root.default, the outermost fallback


class DisplayRowsTests(unittest.TestCase):
    def test_root_rows_are_plain_digits_and_guard_branches_letter_off_the_guards_label(self):
        schema = T.parse_schema(GUARD_SCHEMA, "prompts/pilots/violin.md", "violin", "raw")
        rows = T.display_rows(schema.root)
        labels = [r["label"] for r in rows]
        self.assertEqual(labels, ["1", "2", "2a", "2b", "2c"])
        self.assertEqual(rows[0]["branch"], None)
        self.assertEqual(rows[2]["branch"], "if guard 2 = yes")
        self.assertEqual(rows[3]["branch"], "if guard 2 = yes, none of 2a matched")
        self.assertEqual(rows[4]["branch"], "if guard 2 = no")

    def test_render_markdown_includes_branch_column_and_guard_row(self):
        schema = T.parse_schema(GUARD_SCHEMA, "prompts/pilots/violin.md", "violin", "raw")
        md = T.render_markdown(schema)
        self.assertIn("| # | Branch | Condition | Then |", md)
        self.assertIn("*(guard)* can this bot win the fight it is in?", md)
        self.assertIn("2a", md)


class DefaultTieTests(unittest.TestCase):
    """§3.3 -- not observed in any of the three reference pilots, so this exercises the spec's own
    illustrative (not real) example: "When nothing else is going on, poke the wave" vs., elsewhere,
    "If nothing else is happening, advance down the lane.\""""

    def test_earlier_sentence_in_prose_order_wins(self):
        poke = T.Action("attack", None, "nearby_minion")
        advance = T.Action("move", None, "push_lane")
        tie = T.resolve_default_tie(
            [
                ("When nothing else is going on, poke the wave", poke),
                ("If nothing else is happening, advance down the lane", advance),
            ]
        )
        self.assertEqual(tie.winner, poke)
        self.assertEqual(tie.alternatives, ("If nothing else is happening, advance down the lane",))
        self.assertIn("advance down the lane", tie.note)

    def test_single_candidate_raises(self):
        with self.assertRaises(ValueError):
            T.resolve_default_tie([("only one", T.Action("hold", None, None))])


def _reply_with(**extra) -> str:
    return json.dumps({**VALID_SCHEMA, **extra})


class BuildTests(unittest.TestCase):
    def test_no_build_key_is_none_with_no_notes(self):
        schema = T.parse_schema(VALID_SCHEMA, "pilot.md", "keytar", "raw")
        self.assertIsNone(schema.build)
        self.assertEqual(schema.validation_notes, ())

    def test_build_is_parsed_in_prose_order_from_names(self):
        raw = dict(VALID_SCHEMA, build=["Amp", "bass strings", "The Road Case"])
        schema = T.parse_schema(raw, "pilot.md", "keytar", "raw")
        self.assertEqual(schema.build, ("amp", "bass-strings", "road-case"))
        self.assertEqual(schema.validation_notes, ())

    def test_bad_entries_become_validation_notes(self):
        raw = dict(VALID_SCHEMA, build=["amp", "Tip Jar", "amp", "road-case", "metronome", "bass-strings"])
        schema = T.parse_schema(raw, "pilot.md", "keytar", "raw")
        self.assertEqual(schema.build, ("amp", "road-case", "metronome"))
        self.assertEqual(len(schema.validation_notes), 3)  # unknown, duplicate, truncated
        self.assertTrue(all(n.startswith("build:") for n in schema.validation_notes))

    def test_translate_pilot_carries_build_through(self):
        schema = T.translate_pilot("Buy the Amp first, then Bass Strings.", "pilot.md", "violin", "staccato", "double_stop",
                                   generate=lambda p: _reply_with(build=["amp", "bass-strings"]))
        self.assertEqual(schema.build, ("amp", "bass-strings"))

    def test_build_survives_the_priority_guard(self):
        prose = "Recall when hp is below a quarter, no exceptions. Engage enemy bearbots. Buy the Amp."
        reply = json.dumps({**VALID_SCHEMA, "rules": list(reversed(VALID_SCHEMA["rules"])), "build": ["amp"]})
        schema = T.translate_pilot(prose, "pilot.md", "keytar", "chord", "arpeggio", generate=lambda p: reply)
        self.assertEqual(schema.rules[0].id, "recall_low_hp")  # promoted: the guard rebuilt the schema
        self.assertEqual(schema.build, ("amp",))

    def test_prompt_has_an_items_block_generated_from_the_constants(self):
        import economy_rules as E
        prompt = T._translation_prompt("some prose", "keytar", "chord", "arpeggio")
        for key, it in E.items().items():
            for part in (key, it["name"], str(it["cost"]), it["gives"], it["givesUp"]):
                self.assertIn(part, prompt)
        self.assertIn('If the prose names items or a shopping order, emit "build" in that order; otherwise omit it.', prompt)
        self.assertLess(prompt.index("ITEMS a bearbot"), prompt.index("PROSE PILOT:"))

    def test_p2_adds_exactly_the_bounty_selector(self):
        # docs/economy-spec.md §4.2: the economy adds ONE selector and no action kind; the other new
        # one is the river objective's `bandstand` (§9.7, BandstandSelectorTests below).
        self.assertEqual(len(T.TARGET_SELECTORS), 12)
        self.assertIn("highest_bounty_enemy", T.TARGET_SELECTORS)
        prompt = T._translation_prompt("some prose", "keytar", "chord", "arpeggio")
        self.assertIn('"highest_bounty_enemy" -- ', prompt)

    def test_a_schema_using_the_bounty_selector_parses(self):
        raw = json.loads(json.dumps(VALID_SCHEMA))
        raw["rules"][0]["action"] = {"kind": "attack", "ability": None, "target_selector": "highest_bounty_enemy"}
        schema = T.parse_schema(raw, "p.md", "keytar", "raw")
        self.assertEqual(schema.rules[0].action_target_selector, "highest_bounty_enemy")

    def test_render_markdown_files_build_notes_apart_from_priority_fixes(self):
        raw = dict(VALID_SCHEMA, build=["amp", "Tip Jar"])
        text = T.render_markdown(T.parse_schema(raw, "pilot.md", "keytar", "raw"))
        self.assertIn("Shopping list -- what was changed", text)
        self.assertNotIn("Automatic priority fixes", text)


def _move(selector):
    return {"kind": "move", "ability": None, "target_selector": selector}


def _rule_spec(rid, condition, action):
    return {"id": rid, "condition": condition, "criteria": {"true": "yes", "false": "no"}, "action": action}


# The five entrant sentences docs/economy-spec.md §9.7 says must compile, each as the schema shape
# the translator is expected to emit for it (offline fixtures: no model call). Each entry is
# (prose, rules, default_action, rule id Jev answers yes to, the action that should then run).
BANDSTAND_PROSE_FIXTURES = [
    (
        "When the Bandstand opens, go take it.",
        [_rule_spec("bandstand_open", "is the Bandstand open?", _move("bandstand"))],
        _move("push_lane"), "bandstand_open", ("move", "bandstand"),
    ),
    (
        "If the enemy is taking the Bandstand, go stop them.",
        [_rule_spec("enemy_taking_bandstand", "is the enemy team making progress on the Bandstand?", _move("bandstand"))],
        _move("push_lane"), "enemy_taking_bandstand", ("move", "bandstand"),
    ),
    (
        "If the Bandstand is contested and a teammate is on it, join the fight.",
        [_rule_spec("join_contest", "is the Bandstand contested and an ally on it?", _move("bandstand"))],
        _move("push_lane"), "join_contest", ("move", "bandstand"),
    ),
    (
        "While we have Encore, go after their weakest bot.",
        [_rule_spec("encore_hunt", "does your team have Encore and is an enemy bearbot visible?",
                    {"kind": "attack", "ability": None, "target_selector": "lowest_hp_enemy"})],
        _move("push_lane"), "encore_hunt", ("attack", "lowest_hp_enemy"),
    ),
    (
        "Leave the Bandstand alone unless I'm above half health.",
        [
            _rule_spec("hp_below_half", "is this bot's hp below half of its max?", _move("push_lane")),
            _rule_spec("bandstand_open", "is the Bandstand open?", _move("bandstand")),
        ],
        _move("push_lane"), "hp_below_half", ("move", "push_lane"),
    ),
]


class BandstandSelectorTests(unittest.TestCase):
    """The river objective's move selector (docs/economy-spec.md §9.7): one more value of the
    existing target_selector, no new schema field."""

    def test_selector_is_in_the_vocabulary_and_listed_in_the_prompt(self):
        self.assertIn("bandstand", T.TARGET_SELECTORS)
        prompt = T._translation_prompt("Push the lane.", "drums", "kick", "fill")
        self.assertIn('"bandstand" -- ' + T.TARGET_SELECTORS["bandstand"], prompt)
        self.assertIn("'bandstand'", prompt)  # in the action shape's "one of [...]" list
        self.assertIn("push_lane", T.TARGET_SELECTORS["bandstand"])  # the fallback is named

    def test_validation_accepts_it_like_home_and_push_lane(self):
        # home/push_lane are not restricted by action kind, so neither is bandstand.
        for kind in ("move", "attack", "ability"):
            self.assertEqual(T._validate_action({"kind": kind, "target_selector": "bandstand"}, "t")[2], "bandstand")
        raw = {"rules": [_rule_spec("go", "is the Bandstand open?", _move("bandstand"))], "default_action": _move("bandstand")}
        schema = T.parse_schema(raw, "pilot.md", "drums", "raw")
        self.assertEqual(schema.rules[0].action_target_selector, "bandstand")
        self.assertEqual(schema.default_target_selector, "bandstand")

    def test_the_entrant_sentences_compile_to_the_expected_shapes(self):
        for prose, rules, default, fires, (kind, selector) in BANDSTAND_PROSE_FIXTURES:
            with self.subTest(prose=prose):
                schema = T.parse_schema({"rules": rules, "default_action": default}, "pilot.md", "drums", "raw")
                answers = {r.id: r.id == fires for r in schema.rules}
                action = T.evaluate_schema(schema, answers)
                self.assertEqual((action.kind, action.target_selector), (kind, selector))

    def test_leave_it_alone_rule_sits_before_the_bandstand_rule(self):
        prose, rules, default, _fires, _expect = BANDSTAND_PROSE_FIXTURES[-1]
        schema = T.parse_schema({"rules": rules, "default_action": default}, "pilot.md", "drums", "raw")
        ids = [r.id for r in schema.rules]
        self.assertLess(ids.index("hp_below_half"), ids.index("bandstand_open"), prose)
        # above half health, the Bandstand rule is reached
        action = T.evaluate_schema(schema, {"hp_below_half": False, "bandstand_open": True})
        self.assertEqual(action.target_selector, "bandstand")

    def test_render_says_move_to_the_bandstand(self):
        raw = {"rules": [_rule_spec("go", "is the Bandstand open?", _move("bandstand"))], "default_action": _move("push_lane")}
        md = T.render_markdown(T.parse_schema(raw, "pilot.md", "drums", "raw"))
        self.assertIn("move to the Bandstand", md)
        self.assertNotIn("targeting: move to the Bandstand", md)


LATE = "eco-3-late"


class EconomyPromptTests(unittest.TestCase):
    """`economy` threads through the prompt and the validator; the default prompt is the pre-recipe one."""

    def test_the_default_prompt_is_the_pre_recipe_prompt(self):
        import economy_rules as E
        for inst, (p, u) in (("drums", ("kick", "fill")), ("keytar", ("chord", "arpeggio"))):
            default = T._translation_prompt("Buy the amp.", inst, p, u)
            self.assertEqual(default, T._translation_prompt("Buy the amp.", inst, p, u, economy=None))
            self.assertEqual(default, T._translation_prompt("Buy the amp.", inst, p, u, economy="eco-3"))
            self.assertEqual(default, T._translation_prompt("Buy the amp.", inst, p, u, economy="eco-2"))
            old_block = (
                "ITEMS a bearbot can buy at its base (at most 3 per bearbot, bought in order):\n"
                + "\n".join(E.item_lines("eco-2"))
                + '\nIf the prose names items or a shopping order, emit "build" in that order; otherwise omit it. "build" is\n'
                'a top-level key next to "rules", a list of item keys from the list above, e.g. "build": ["amp", "road-case"].\n\nPROSE PILOT:\n'
            )
            self.assertIn(old_block, default)
            for word in ("Tier", "recipe", "Backline", "parts are filled in"):
                self.assertNotIn(word, default)

    def test_a_recipe_ruleset_changes_only_the_items_block(self):
        import economy_rules as E
        default = T._translation_prompt("Buy the amp.", "drums", "kick", "fill")
        late = T._translation_prompt("Buy the amp.", "drums", "kick", "fill", economy=LATE)
        self.assertEqual(default.replace(E.items_prompt_block(), "<ITEMS>"), late.replace(E.items_prompt_block(LATE), "<ITEMS>"))
        self.assertIn("3 slots; combining two items into a recipe frees a slot", late)
        self.assertIn('emit "build" as the items in the order the prose wants them,\nany tier; parts are filled in for you', late)
        for key in E.items(LATE):
            self.assertIn(f'"{key}" -- ', late)

    def test_translate_pilot_sends_the_rulesets_prompt_and_validates_against_it(self):
        seen = []

        def generate(prompt):
            seen.append(prompt)
            return _reply_with(build=["Backline", "Wall of Sound"])

        schema = T.translate_pilot("Build a Backline, then Wall of Sound.", "pilot.md", "drums", "kick", "fill", generate=generate, economy=LATE)
        self.assertIn("parts are filled in for you", seen[0])
        self.assertEqual(schema.build, ("backline", "wall-of-sound"))
        self.assertEqual(schema.economy, LATE)
        self.assertEqual(schema.validation_notes,
                         ("build: Backline needs Road Case and Bass Strings: added them to the shopping list.",))
        # the same reply under the default ruleset: recipe names are not items there
        schema = T.translate_pilot("Build a Backline.", "pilot.md", "drums", "kick", "fill", generate=generate)
        self.assertIsNone(schema.build)
        self.assertIsNone(schema.economy)
        self.assertNotIn("parts are filled in", seen[-1])

    def test_the_economy_survives_both_guards(self):
        prose = "Recall when hp is below a quarter, no exceptions. Engage enemy bearbots. Buy the Backline."
        reply = json.dumps({**VALID_SCHEMA, "rules": list(reversed(VALID_SCHEMA["rules"])) + [
            {"id": "chord_it", "condition": "is chord ready?", "action": {"kind": "ability", "ability": "chord", "target_selector": None}}],
            "build": ["backline"]})
        schema = T.translate_pilot(prose, "pilot.md", "drums", "kick", "fill", generate=lambda p: reply, economy=LATE)
        self.assertEqual(schema.rules[0].id, "recall_low_hp")  # the priority guard rebuilt the schema
        self.assertTrue(any(n.startswith("instrument scope: removed rule chord_it") for n in schema.validation_notes))
        self.assertEqual((schema.build, schema.economy), (("backline",), LATE))


def _late_reply(rules, build=None, default=None):
    out = {"rules": rules, "default_action": default or {"kind": "move", "ability": None, "target_selector": "push_lane"}}
    if build is not None:
        out["build"] = build
    return json.dumps(out)


class LateGameProseTests(unittest.TestCase):
    """docs/late-game-economy-spec.md §7.3's prose -> schema table, with an offline scripted backend
    (llm_backends.ScriptedBackend: the reply the translator is expected to give). These test the
    parse / validate / describe path, not a model."""

    def translate(self, prose, reply, instrument="drums"):
        from llm_backends import ScriptedBackend
        from scenarios import ABILITIES
        backend = ScriptedBackend([reply])
        primary, ultimate = ABILITIES[instrument]
        return T.translate_pilot(prose, "pilot.md", instrument, primary, ultimate, generate=backend.generate, economy=LATE)

    def test_build_toward_a_target_then_another(self):
        import economy_rules as E
        reply = _late_reply([_rule_spec("engage", "is an enemy bearbot visible?",
                                        {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"})],
                            build=["Wall of Sound", "Arpeggiator"])
        schema = self.translate("Build toward Wall of Sound first, then Arpeggiator.", reply)
        self.assertEqual(schema.build, ("wall-of-sound", "arpeggiator"))
        plan, _ = E.expand_build(schema.build, "drums", LATE)
        self.assertEqual(plan, ("road-case", "bass-strings", "backline", "wall-of-sound", "metronome", "amp", "click-track", "arpeggiator"))

    def test_explicit_steps_are_kept_as_written(self):
        reply = _late_reply([_rule_spec("engage", "is an enemy bearbot visible?",
                                        {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"})],
                            build=["amp", "bass-strings", "road-case", "fuzz-pedal"])
        schema = self.translate("Buy Amp, Bass Strings, Road Case, then combine into Fuzz Pedal.", reply, "violin")
        self.assertEqual(schema.build, ("amp", "bass-strings", "road-case", "fuzz-pedal"))
        self.assertFalse([n for n in schema.validation_notes if n.startswith("build:")])

    def test_afford_the_next_upgrade_and_no_enemy_is_answerable_and_recalls(self):
        import fidelity_harness as FH
        rule = _rule_spec("buy_upgrade", "can it afford the next item on its list, and no enemy bearbot is visible?",
                          {"kind": "recall", "ability": None, "target_selector": "none"})
        schema = self.translate("When I can afford my next upgrade and no enemy is near, go home and buy it.", _late_reply([rule]))
        self.assertEqual(T.evaluate_schema(schema, {"buy_upgrade": True}).kind, "recall")
        text = FH.describe_observation(_late_obs(gold=450, nextItem={"item": "wall-of-sound", "cost": 400, "tier": 3, "from": ["backline"]}))
        self.assertIn("Next on its shopping list: Wall of Sound, an upgrade of its Backline, 400 gold -- it can afford it now.", text)
        self.assertIn("No enemies visible.", text)

    def test_owning_a_tier_3_item_is_answerable_and_pushes_towers(self):
        import fidelity_harness as FH
        rule = _rule_spec("tier3_push", "does it own a tier-3 item and are allied minions near?",
                          {"kind": "attack", "ability": None, "target_selector": "nearest_tower"})
        schema = self.translate("Once I have a tier-3 item, push towers with the wave.", _late_reply([rule]))
        action = T.evaluate_schema(schema, {"tier3_push": True})
        self.assertEqual((action.kind, action.target_selector), ("attack", "nearest_tower"))
        text = FH.describe_observation(_late_obs(items=["wall-of-sound", "metronome"], slotsFree=1))
        self.assertIn("Items: Wall of Sound (tier 3, upgraded from Backline), Metronome (1 of 3 slots free).", text)


def _late_obs(**self_over):
    obs = {
        "clockSec": 412.0,
        "self": {"id": "bb-1", "team": "violet", "lane": "top", "instrument": "drums", "pos": {"x": 300, "y": 300},
                 "hp": 200, "maxHp": 220, "moveSpeed": 55, "cooldowns": {"kick": 0, "fill": 3.5},
                 "gold": 120, "level": 7, "xp": 900, "xpToNext": 110, "items": ["backline", "metronome"], "slotsFree": 1,
                 "nextItem": {"item": "amp", "cost": 350, "tier": 1}, "atShop": False},
        "allies": [], "visibleEnemies": [], "nearbyMinions": [], "nearbyTowers": [],
    }
    obs["self"].update(self_over)
    return obs


NEGATION = json.loads(open(os.path.join(os.path.dirname(__file__), "testdata", "negation_rules.json"), encoding="utf-8").read())


def _negation_reply(index: int) -> dict:
    """A saved schema of `negation_rules.json` as the translator reply it was parsed from."""
    saved = NEGATION["schemas"][index]["schema"]
    rules = [{"id": r["id"], "condition": r["condition"], "criteria": {"true": r["criteria_true"], "false": r["criteria_false"]},
              "action": {"kind": r["action_kind"], "ability": r["action_ability"], "target_selector": r["action_target_selector"]}}
             for r in saved["rules"]]
    reply = {"rules": rules, "default_action": saved["default_action"]}
    if saved.get("build") is not None:
        reply["build"] = saved["build"]
    return reply


def _negation(index: int) -> tuple[T.TranslatedSchema, str]:
    case = NEGATION["schemas"][index]
    schema = T.parse_schema(_negation_reply(index), "pilot.md", case["instrument"], "raw", "vocab-2", economy="eco-3-late")
    return schema, T.scope_to_instrument(NEGATION["prose"], case["instrument"]).text


AFFORD_SENTENCE = "When I can afford my next item and no enemy is in sight, I head home to shop."


def _one_rule(rid: str, condition: str, action: dict, true: str = "yes", false: str = "no") -> T.TranslatedSchema:
    return T.parse_schema({"rules": [{"id": rid, "condition": condition, "criteria": {"true": true, "false": false}, "action": action}],
                           "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}}, "p.md", "drums", "raw", "vocab-2")


class NegatedClauseKeepsItsNoTests(unittest.TestCase):
    """vocab-2: "no enemy is in sight" never compiles as "is there any enemy within 260 units?" (#85's and #86's
    sample-entrant compiles, runs/vocab2-negation-polarity-2026-10-02.md)."""

    def test_the_inverted_rules_are_rejected_and_the_sentence_quoted(self):
        for i, case in enumerate(NEGATION["schemas"]):
            if not case["rejects"]:
                continue
            schema, prose = _negation(i)
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                with self.assertRaises(T.SchemaValidationError) as err:
                    T.enforce_negation(schema, prose)
                msg = str(err.exception)
                self.assertTrue(msg.startswith(f'rule {case["rejects"]} lost a "no" the prose states: the prose says "no enemy is in sight"'), msg)
                self.assertIn(AFFORD_SENTENCE, msg)
                # never the wrong question: the 9B copied it back when the first message quoted it
                wrong = next(r.condition for r in schema.rules if r.id == case["rejects"])
                self.assertNotIn(wrong, msg)

    def test_on_the_last_attempt_the_rule_is_dropped_with_a_note(self):
        for i, case in enumerate(NEGATION["schemas"]):
            if not case["rejects"]:
                continue
            schema, prose = _negation(i)
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                fixed = T.enforce_negation(schema, prose, drop=True)
                self.assertEqual([r.id for r in fixed.rules], [r.id for r in schema.rules if r.id != case["rejects"]])
                notes = fixed.validation_notes[len(schema.validation_notes):]
                self.assertEqual(len(notes), 1)
                self.assertTrue(notes[0].startswith(f"negation: removed rule {case['rejects']} "), notes[0])
                self.assertIn('your prose says "no enemy is in sight"', notes[0])
                self.assertEqual(fixed.build, schema.build)
                self.assertEqual(fixed.root.default, schema.root.default)

    def test_drop_still_raises_when_nothing_would_be_left(self):
        schema = _one_rule("shop_no_enemy", "is there any enemy within 260 units?", {"kind": "move", "ability": None, "target_selector": "home"})
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_negation(schema, AFFORD_SENTENCE, drop=True)

    def test_every_other_compile_is_returned_untouched(self):
        for i, case in enumerate(NEGATION["schemas"]):
            if case["rejects"]:
                continue
            schema, prose = _negation(i)
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                self.assertIs(T.enforce_negation(schema, prose), schema)

    def test_correctly_negated_questions_are_never_touched(self):
        for condition in ("is no enemy bearbot in sight?", "are there no enemies within 260 units?", "is there no enemy bearbot in sight?",
                          "are all enemies out of sight?", "is the count of visible enemies zero?", "can this bot not see any enemy?"):
            schema = _one_rule("shop_no_enemy", condition, {"kind": "move", "ability": None, "target_selector": "home"})
            self.assertIs(T.enforce_negation(schema, AFFORD_SENTENCE), schema, condition)

    def test_a_split_recall_that_lost_its_not_is_rejected(self):
        # No id help: the rule's own sentence is the only one it shares words with, and that sentence says "not inside".
        prose = ("If I can see an enemy tower and none of my minions are near me, I back off home.\n\n"
                 "When my hp drops below a third of my max and I'm not inside an enemy tower's range, I recall home to heal.")
        schema = _one_rule("recall_heal", "is this bot inside an enemy tower's range?", {"kind": "recall", "ability": None, "target_selector": None})
        with self.assertRaises(T.SchemaValidationError) as err:
            T.enforce_negation(schema, prose)
        self.assertIn("the prose says \"I'm not inside an enemy tower's range\"", str(err.exception))
        kept = _one_rule("recall_heal", "is this bot's hp below a third and is it not inside an enemy tower's range?",
                         {"kind": "recall", "ability": None, "target_selector": None})
        self.assertIs(T.enforce_negation(kept, prose), kept)

    def test_none_of_my_minions_keeps_its_none(self):
        prose = "If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone."
        lost = _one_rule("tower_no_minions", "is an enemy tower visible and are my minions near this bot?", {"kind": "move", "ability": None, "target_selector": "home"})
        with self.assertRaises(T.SchemaValidationError) as err:
            T.enforce_negation(lost, prose)
        self.assertIn('the prose says "none of my minions are near me"', str(err.exception))
        kept = _one_rule("tower_no_minions", "is an enemy tower visible and are none of this bot's minions near it?",
                         {"kind": "move", "ability": None, "target_selector": "home"})
        self.assertIs(T.enforce_negation(kept, prose), kept)

    def test_a_sentence_naming_the_thing_both_ways_decides_nothing(self):
        prose = "Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave."
        schema = _one_rule("walk_with_minion", "is an allied minion near this bot?", {"kind": "move", "ability": None, "target_selector": "nearby_minion"})
        self.assertIs(T.enforce_negation(schema, prose), schema)

    def test_an_id_saying_no_needs_a_prose_sentence_saying_no(self):
        schema = _one_rule("go_no_enemy", "is an enemy bearbot in sight?", {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"})
        self.assertIs(T.enforce_negation(schema, "If an enemy bearbot is in sight, I attack the nearest enemy."), schema)

    def test_translate_pilot_retries_with_the_sentence_and_keeps_the_fixed_reply(self):
        bad = _negation_reply(0)  # #85 s1 violin
        good = json.loads(json.dumps(bad))
        for r in good["rules"]:
            if r["id"] == "shop_no_enemy":
                r["condition"] = "is no enemy within 260 units?"
                r["criteria"] = {"true": "no enemy is visible", "false": "an enemy is visible"}
        replies, prompts = [json.dumps(bad), json.dumps(good)], []

        def generate(prompt):
            prompts.append(prompt)
            return replies[len(prompts) - 1]

        schema = T.translate_pilot(NEGATION["prose"], "pilot.md", "violin", "staccato", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 2)
        retry = prompts[1].split("Your previous attempt was invalid:")[1]
        self.assertIn(AFFORD_SENTENCE, retry)
        self.assertNotIn("is there any enemy within 260 units?", retry)
        self.assertIn("is no enemy within 260 units?", [r.condition for r in schema.rules])
        self.assertFalse([n for n in schema.validation_notes if n.startswith("negation:")])

    def test_translate_pilot_drops_the_rule_on_its_last_attempt_instead_of_failing(self):
        prompts = []

        def generate(prompt):
            prompts.append(prompt)
            return json.dumps(_negation_reply(0))  # #85 s1 violin, every time

        schema = T.translate_pilot(NEGATION["prose"], "pilot.md", "violin", "staccato", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 3)
        self.assertNotIn("shop_no_enemy", [r.id for r in schema.rules])
        self.assertIn("shop_first", [r.id for r in schema.rules])
        md = T.render_markdown(schema)
        self.assertIn("**Negations -- what was removed:**", md)
        self.assertIn("removed rule shop_no_enemy", md)
        self.assertNotIn("Automatic priority fixes", md)

    def test_vocab1_is_unchanged(self):
        schema, prose = _negation(0)
        schema = dataclasses.replace(schema, vocab="vocab-1")
        self.assertIs(T.enforce_negation(schema, prose), schema)

    def test_what_a_text_says_is_there_or_not(self):
        cases = {
            "no enemy is in sight": {"enemy": {True}},
            "is there any enemy within 260 units?": {"enemy": {False}},
            "none of my minions are near me": {"minion": {True}},
            "I'm not inside an enemy tower's range": {"enemy tower": {True}},
            "is it under its own tower?": {"own tower": {False}},
            "an allied minion and a teammate": {"minion": {False}, "ally": {False}},
            "if an enemy minion is in sight": {"enemy minion": {False}},
            "walk with my nearest minion, and if I have no minions near me": {"minion": {False, True}},
            "an enemy bearbot is in sight, I don't start the fight": {"enemy": {False}},
        }
        for text, want in cases.items():
            self.assertEqual(T._polarities(text), want, text)
        self.assertEqual(T._polarities("push_wave_dead_enemy", after=False), {"minion": {False}, "enemy": {False}})
        self.assertEqual(T._polarities("shop_no_enemy", after=False), {"enemy": {True}})



IDENTITY = json.loads(open(os.path.join(os.path.dirname(__file__), "testdata", "identity_rules.json"), encoding="utf-8").read())
VIOLIN_LINE = "Our shopping lists, in order: Violin: Amp, then Bass Strings, then Road Case."


def _identity_reply(index: int) -> dict:
    """A saved schema of `identity_rules.json` as the translator reply it was parsed from."""
    saved = IDENTITY["schemas"][index]["schema"]
    rules = [{"id": r["id"], "condition": r["condition"], "criteria": {"true": r["criteria_true"], "false": r["criteria_false"]},
              "action": {"kind": r["action_kind"], "ability": r["action_ability"], "target_selector": r["action_target_selector"]}}
             for r in saved["rules"]]
    reply = {"rules": rules, "default_action": saved["default_action"]}
    if saved.get("build") is not None:
        reply["build"] = saved["build"]
    return reply


def _identity(index: int) -> tuple[T.TranslatedSchema, str]:
    case = IDENTITY["schemas"][index]
    schema = T.parse_schema(_identity_reply(index), "pilot.md", case["instrument"], "raw", "vocab-2", economy="eco-3-late")
    return schema, T.scope_to_instrument(IDENTITY["prose"], case["instrument"]).text


def _rule_on(condition: str, rid: str = "r1", vocab: str = "vocab-2") -> T.TranslatedSchema:
    rules = [{"id": rid, "condition": condition, "criteria": {"true": "yes", "false": "no"}, "action": {"kind": "hold", "ability": None, "target_selector": None}},
             {"id": "fight", "condition": "is an enemy bearbot in sight?", "action": {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"}}]
    return T.parse_schema({"rules": rules, "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}}, "p.md", "violin", "raw", vocab)


class IdentityRuleTests(unittest.TestCase):
    """vocab-2: "is this bot's instrument 'Violin'? -> hold" is never a rule (#87's s1, s4 and s12 violin compiles,
    runs/vocab2-identity-rules-2026-10-02.md)."""

    def test_the_identity_rules_are_rejected_and_the_line_quoted(self):
        for i, case in enumerate(IDENTITY["schemas"]):
            if not case["rejects"]:
                continue
            schema, prose = _identity(i)
            with self.subTest(case["sample"] + " " + case["instrument"]):
                with self.assertRaises(T.SchemaValidationError) as err:
                    T.enforce_identity_rules(schema, prose)
                msg = str(err.exception)
                self.assertTrue(msg.startswith(f"rule {case['rejects']} asks only about this bearbot's own instrument"), msg)
                self.assertIn(VIOLIN_LINE, msg)
                self.assertIn('top-level "build" list', msg)
                # never the wrong question: #87 found the 9B copies a quoted question back
                wrong = next(r.condition for r in schema.rules if r.id == case["rejects"])
                self.assertNotIn(wrong, msg)
                self.assertNotIn("'Violin'?", msg)

    def test_on_the_last_attempt_the_rule_is_dropped_with_a_note(self):
        for i, case in enumerate(IDENTITY["schemas"]):
            if not case["rejects"]:
                continue
            schema, prose = _identity(i)
            with self.subTest(case["sample"] + " " + case["instrument"]):
                fixed = T.enforce_identity_rules(schema, prose, drop=True)
                self.assertEqual([r.id for r in fixed.rules], [r.id for r in schema.rules if r.id != case["rejects"]])
                notes = fixed.validation_notes[len(schema.validation_notes):]
                self.assertEqual(len(notes), 1)
                self.assertTrue(notes[0].startswith(f"identity: removed rule {case['rejects']} "), notes[0])
                self.assertIn(VIOLIN_LINE, notes[0])
                self.assertEqual(fixed.build, schema.build)
                self.assertEqual(fixed.root.default, schema.root.default)

    def test_every_other_compile_is_returned_untouched(self):
        for i, case in enumerate(IDENTITY["schemas"]):
            if case["rejects"]:
                continue
            schema, prose = _identity(i)
            with self.subTest(case["sample"] + " " + case["instrument"]):
                self.assertIs(T.enforce_identity_rules(schema, prose), schema)
                self.assertIs(T.enforce_identity_rules(schema, prose, drop=True), schema)

    def test_questions_about_identity_alone(self):
        for condition, what in (("is this bot's instrument 'Violin'?", "instrument"), ("is this bot the drums?", "instrument"),
                                ("what instrument does this bot play?", "instrument"), ("is this bearbot on the violet team?", "team"),
                                ("is this bot a violin on the green team?", "instrument and team")):
            self.assertEqual(T._identity_only(condition), what, condition)

    def test_a_question_that_asks_anything_else_is_a_real_rule(self):
        for condition in ("is an enemy violin in sight?", "is this bot's instrument 'Violin' and can it afford an Amp?",
                          "is this bot's side stronger in the fight near it?", "is this bot on its team's side?", "is the keytar ready?",
                          "is a teammate near this bot?", "is this bot at its base?", "is my violin ally below half hp?"):
            self.assertIsNone(T._identity_only(condition), condition)
            schema = _rule_on(condition)
            self.assertIs(T.enforce_identity_rules(schema, "Violin: Amp, then Road Case."), schema, condition)

    def test_a_rule_nested_in_a_guard_branch_is_caught(self):
        guard = {"type": "guard", "id": "can_win", "condition": "can this bot win the fight it is in?",
                 "then": {"nodes": [{"id": "whoami", "condition": "is this bot the violin?", "action": {"kind": "hold", "ability": None, "target_selector": None}}],
                          "default_action": None},
                 "else": {"nodes": [], "default_action": {"kind": "move", "ability": None, "target_selector": "home"}}}
        schema = T.parse_schema({"rules": [guard], "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}},
                                "p.md", "violin", "raw", "vocab-2")
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_identity_rules(schema, "I only take fights I can win.")
        fixed = T.enforce_identity_rules(schema, "I only take fights I can win.", drop=True)
        self.assertEqual(fixed.root.nodes[0].then.nodes, ())

    def test_drop_still_raises_when_nothing_would_be_left(self):
        schema = T.parse_schema({"rules": [{"id": "me", "condition": "is this bot the violin?", "action": {"kind": "hold", "ability": None, "target_selector": None}}],
                                 "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}}, "p.md", "violin", "raw", "vocab-2")
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_identity_rules(schema, "Violin: Amp.", drop=True)

    def test_vocab_1_is_untouched(self):
        schema = _rule_on("is this bot's instrument 'Violin'?", vocab="vocab-1")
        self.assertIs(T.enforce_identity_rules(schema, VIOLIN_LINE), schema)

    def test_translate_pilot_retries_and_keeps_the_fixed_reply(self):
        bad = _identity_reply(0)  # #87 s1 violin
        fixed = {**bad, "rules": [r for r in bad["rules"] if r["id"] != "shop_order_violin"]}
        replies, prompts = [json.dumps(bad), json.dumps(fixed)], []

        def generate(prompt):
            prompts.append(prompt)
            return replies[len(prompts) - 1]

        schema = T.translate_pilot(IDENTITY["prose"], "pilot.md", "violin", "staccato", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 2)
        retry = prompts[1].split("Your previous attempt was invalid:")[1]
        self.assertIn(VIOLIN_LINE, retry)
        self.assertNotIn("instrument 'Violin'?", retry)
        self.assertEqual([r.id for r in schema.rules], [r["id"] for r in fixed["rules"]])
        self.assertFalse([n for n in schema.validation_notes if n.startswith("identity:")])

    def test_three_bad_replies_end_in_a_drop_not_a_failure(self):
        prompts = []

        def generate(prompt):
            prompts.append(prompt)
            return json.dumps(_identity_reply(1))  # #87 s4 violin, every time

        schema = T.translate_pilot(IDENTITY["prose"], "pilot.md", "violin", "staccato", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 3)
        self.assertNotIn("shop_order_violin", [r.id for r in schema.rules])
        md = T.render_markdown(schema)
        self.assertIn("**Rules about which bearbot this is -- what was removed:**", md)
        self.assertIn("identity: removed rule shop_order_violin", md)
        self.assertNotIn("**Automatic priority fixes applied to this schema:**", md)


class UnfinishedGuardTests(unittest.TestCase):
    """vocab-2: a node with both branches, no "type" and no action is rejected, never completed (#87's s1 drums failed all
    three replies on `rule guard_spend_gold: invalid action kind None`; completed, such guards cut off every rule below
    them; runs/vocab2-identity-rules-2026-10-02.md §2)."""

    def _reply(self, index: int) -> dict:
        return T._extract_json_object(IDENTITY["replies"][index]["reply"])

    def test_develops_error_is_the_one_87_saw(self):
        for i, case in enumerate(IDENTITY["replies"]):
            with self.subTest(case["run"] + " " + str(case["reply_index"])):
                with self.assertRaises(ValueError) as err:
                    T.parse_schema(self._reply(i), "p.md", case["instrument"], "raw", "vocab-2", economy="eco-3-late")
                self.assertRegex(str(err.exception), r"^rule guard_\w+: invalid action kind None$")

    def test_the_reply_is_rejected_asking_for_plain_rules(self):
        for i, case in enumerate(IDENTITY["replies"]):
            raw = self._reply(i)
            with self.subTest(case["run"] + " " + str(case["reply_index"])):
                with self.assertRaises(T.UnfinishedGuardError) as err:
                    T.enforce_finished_guards(raw, "vocab-2")
                msg = str(err.exception)
                self.assertTrue(msg.startswith(f'node {raw["rules"][0]["id"]} has "then" and "else" branches but no "action"'), msg)
                self.assertIn("write plain rules instead", msg)
                self.assertNotIn(raw["rules"][0]["condition"], msg)  # never the model's own words back

    def test_on_the_last_attempt_the_node_is_dropped_with_a_note(self):
        raw = self._reply(2)  # verify-v1 s2 keytar: the guard is rule 1, eight plain rules follow it
        fixed, notes = T.enforce_finished_guards(raw, "vocab-2", drop=True)
        self.assertEqual([n["id"] for n in fixed["rules"]], [n["id"] for n in raw["rules"][1:]])
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0].startswith('unfinished guard: removed guard_shop_priority ("can this bot afford its next item right now?") '
                                            "and the 2 node(s) in its branches"), notes[0])
        schema = T.parse_schema(fixed, "p.md", "keytar", "raw", "vocab-2", economy="eco-3-late")
        self.assertIn("rule_low_hp_recall", [r.id for r in schema.rules])

    def test_nested_ones_are_dropped_and_their_count_includes_their_own_branches(self):
        raw = self._reply(0)  # repro s6: the outer guard holds two more in its else-branch
        fixed, notes = T.enforce_finished_guards(raw, "vocab-2", drop=True)
        self.assertEqual([n["id"] for n in fixed["rules"]], ["build_tier1"])
        self.assertEqual(len(notes), 1)
        # then: 1 rule; else: two guards (1 + 1 + 1, 1 + 2 + 1) and 1 rule
        self.assertIn("and the 9 node(s) in its branches", notes[0])

    def test_one_inside_a_typed_guard_is_found_too(self):
        inner = self._reply(1)["rules"][0]
        guard = {"type": "guard", "id": "can_win", "condition": "can this bot win the fight it is in?",
                 "then": {"nodes": [inner], "default_action": None},
                 "else": {"nodes": [], "default_action": {"kind": "move", "ability": None, "target_selector": "home"}}}
        raw = {"rules": [guard], "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}}
        with self.assertRaises(T.UnfinishedGuardError):
            T.enforce_finished_guards(raw, "vocab-2")
        fixed, notes = T.enforce_finished_guards(raw, "vocab-2", drop=True)
        self.assertEqual(fixed["rules"][0]["then"]["nodes"], [])
        self.assertEqual(len(notes), 1)

    def test_drop_still_raises_when_nothing_would_be_left(self):
        with self.assertRaises(T.UnfinishedGuardError):
            T.enforce_finished_guards(self._reply(1), "vocab-2", drop=True)  # repro s6 retry: the guard is the only node

    def test_only_that_shape_is_touched(self):
        branch = {"nodes": [], "default_action": {"kind": "move", "ability": None, "target_selector": "home"}}
        action = {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"}
        for node, why in (({"id": "guard_x", "condition": "c?", "then": branch}, "one branch"),
                          ({"id": "guard_x", "condition": "c?", "then": branch, "else": branch, "type": "guard"}, "a typed guard"),
                          ({"id": "guard_x", "condition": "c?", "then": branch, "else": branch, "type": "rule"}, "a type of its own"),
                          ({"id": "guard_x", "condition": "c?", "then": branch, "else": branch, "action": action}, "an action kind"),
                          ({"id": "guard_x", "condition": "c?", "action": {"kind": None}}, "no branches")):
            raw = {"rules": [node], "default_action": action}
            with self.subTest(why):
                self.assertEqual(T.enforce_finished_guards(raw, "vocab-2"), (raw, ()))
                self.assertEqual(T.enforce_finished_guards(raw, "vocab-2", drop=True), (raw, ()))

    def test_vocab_1_is_untouched(self):
        raw = self._reply(2)
        self.assertEqual(T.enforce_finished_guards(raw, "vocab-1", drop=True), (raw, ()))

    def test_translate_pilot_retries_without_the_finish_the_guard_line(self):
        fixed = self._reply(2)
        fixed["rules"] = fixed["rules"][1:]
        replies, prompts = [IDENTITY["replies"][2]["reply"], json.dumps(fixed)], []

        def generate(prompt):
            prompts.append(prompt)
            return replies[len(prompts) - 1]

        schema = T.translate_pilot(IDENTITY["prose"], "pilot.md", "keytar", "chord", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 2)
        retry = prompts[1].split("Your previous attempt was invalid:")[1]
        self.assertIn("write plain rules instead", retry)
        self.assertNotIn("finish the guard shape", retry)
        self.assertNotIn("invalid action kind", retry)
        self.assertEqual([r.id for r in schema.rules], [n["id"] for n in fixed["rules"]])
        self.assertFalse([n for n in schema.validation_notes if n.startswith("unfinished guard:")])

    def test_three_bad_replies_end_in_a_drop_not_a_failure(self):
        prompts = []

        def generate(prompt):
            prompts.append(prompt)
            return IDENTITY["replies"][2]["reply"]

        schema = T.translate_pilot(IDENTITY["prose"], "pilot.md", "keytar", "chord", "glissando", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 3)
        self.assertFalse([n for n in schema.root.nodes if isinstance(n, T.GuardNode)])
        self.assertIn("rule_low_hp_recall", [r.id for r in schema.rules])
        md = T.render_markdown(schema)
        self.assertIn("**Unfinished guards -- what was removed:**", md)
        self.assertIn("unfinished guard: removed guard_shop_priority", md)
        self.assertNotIn("**Automatic priority fixes applied to this schema:**", md)


GUARD_SCOPE = json.loads(open(os.path.join(os.path.dirname(__file__), "testdata", "guard_scope.json"), encoding="utf-8").read())
PUSH_LANE = {"kind": "move", "ability": None, "target_selector": "push_lane"}
STRONGER = "is this bot's side stronger in the fight near it?"


def _saved_guard(index: int) -> tuple[T.TranslatedSchema, str]:
    from compile import schema_from_dict

    case = GUARD_SCOPE["schemas"][index]
    return schema_from_dict(case["schema"]), T.scope_to_instrument(GUARD_SCOPE["prose"], case["instrument"]).text


def _node(rid, condition, kind="attack", ability=None, target="lowest_hp_enemy"):
    return {"id": rid, "condition": condition, "criteria": {"true": "yes", "false": "no"},
            "action": {"kind": kind, "ability": ability, "target_selector": target}}


def _guard(rid, condition, then, else_, then_default=None, else_default=None):
    return {"type": "guard", "id": rid, "condition": condition, "criteria": {"true": "yes", "false": "no"},
            "then": {"nodes": then, "default_action": then_default}, "else": {"nodes": else_, "default_action": else_default}}


def _tree(*nodes) -> T.TranslatedSchema:
    return T.parse_schema({"rules": list(nodes), "default_action": PUSH_LANE}, "p.md", "violin", "raw", "vocab-2")


RECALL_RULE = _node("recall_low", "is this bot's hp below a quarter of its max?", "recall", target=None)
STACCATO_RULE = _node("staccato_lowest", "is staccato ready and is an enemy bearbot in sight?", "ability", "staccato")
FALL_BACK_RULE = _node("fall_back_own_tower", "is an enemy bearbot in sight?", "move", target="own_tower")
ATTACK_LOWEST = {"kind": "attack", "ability": None, "target_selector": "lowest_hp_enemy"}
TO_OWN_TOWER = {"kind": "move", "ability": None, "target_selector": "own_tower"}
RECALL_LINE = "Recall the moment your hp drops below a quarter of your max, no matter what."
VERDICT_PARAGRAPH = ("You only take fights you can win. When your side is stronger in the fight near you, play staccato on the enemy "
                     "with the lowest hp when it is ready, and otherwise attack the enemy with the lowest hp. When your side is "
                     "weaker, fall back to your own tower.")


class GuardScopeTests(unittest.TestCase):
    """vocab-2: a guard may only sit above rules the prose places under its verdict (Ceryce, 2026-10-02 16:20 CT;
    runs/vocab2-guard-scope-2026-10-02.md). Fixtures: every typed guard in the #84-#89 data prereleases, verbatim."""

    def test_every_saved_guard_is_rejected_quoting_only_prose(self):
        prose_sentences = set(T._prose_sentences(GUARD_SCOPE["prose"]))
        for i, case in enumerate(GUARD_SCOPE["schemas"]):
            schema, prose = _saved_guard(i)
            guard = next(n for n in T.collect_nodes(schema.root) if isinstance(n, T.GuardNode))
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                with self.assertRaises(T.GuardScopeError) as err:
                    T.enforce_guard_scope(schema, prose)
                msg = str(err.exception)
                self.assertTrue(msg.startswith("a guard sends every decision into one of its two branches"), msg)
                self.assertTrue(msg.endswith('Write plain rules instead, each with its own "action", in the order the prose gives them'))
                # never the model's own output: not the guard's question, not its id (#87, #89: the 9B copies it back)
                self.assertNotIn(guard.condition, msg)
                self.assertNotIn(guard.id, msg)
                quoted = re.findall(r'"([^"]+)"', msg.split("under that question: ")[1].split(". Write plain rules")[0])
                self.assertTrue(quoted)
                for q in quoted:
                    self.assertIn(q, {" ".join(s.split()) for s in prose_sentences})

    def test_the_typed_guard_from_89s_retry_ab_is_rejected(self):
        case = GUARD_SCOPE["replies"][0]
        schema = T.parse_schema(T._extract_json_object(case["reply"]), "p.md", case["instrument"], "raw", "vocab-2", economy="eco-3-late")
        self.assertIsInstance(schema.root.nodes[0], T.GuardNode)
        with self.assertRaises(T.GuardScopeError):
            T.enforce_guard_scope(schema, T.scope_to_instrument(GUARD_SCOPE["prose"], case["instrument"]).text)

    def test_on_the_last_attempt_the_guard_is_flattened_with_a_note(self):
        for i, case in enumerate(GUARD_SCOPE["schemas"]):
            schema, prose = _saved_guard(i)
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                fixed = T.enforce_guard_scope(schema, prose, drop=True)
                self.assertFalse([n for n in T.collect_nodes(fixed.root) if isinstance(n, T.GuardNode)])
                notes = fixed.validation_notes[len(schema.validation_notes):]
                self.assertEqual(len(notes), 1)
                self.assertTrue(notes[0].startswith("guard scope: removed the guard "), notes[0])
                self.assertEqual(fixed.root.default, schema.root.default)
                self.assertEqual(fixed.build, schema.build)
                # the dead rules after the guard come back, in their order
                index = next(k for k, n in enumerate(schema.root.nodes) if isinstance(n, T.GuardNode))
                after = [n.id for n in schema.root.nodes[index + 1:]]
                ids = [n.id for n in fixed.root.nodes]
                self.assertEqual(ids[len(ids) - len(after):] if after else [], after)

    def test_flattening_keeps_the_rules_of_other_sentences_and_drops_the_verdicts_own(self):
        schema, prose = _saved_guard(0)  # #84 variant2 s1 keytar: one guard, every rule in its branches
        fixed = T.enforce_guard_scope(schema, prose, drop=True)
        self.assertEqual([n.id for n in fixed.root.nodes],
                         ["recall_if_low_hp", "push_or_attack_tower", "attack_tower_if_one_minion", "chord_ready_lowest_hp",
                          "attack_highest_bounty", "push_if_one_dead", "attack_enemy_minion", "walk_with_minion"])
        note = fixed.validation_notes[-1]
        self.assertIn("Removed with it: go_home_shop", note)  # "enemy tower in sight? -> home" applied only under the guard
        md = T.render_markdown(fixed)
        self.assertIn("**Guards over rules your prose does not put under them -- what was removed:**", md)
        self.assertNotIn("Automatic priority fixes", md)

    def test_drop_still_raises_when_nothing_would_be_left(self):
        # recall is stated nowhere in this prose, so it is unclear and goes with the guard, and so does staccato
        schema = _tree(_guard("can_win", STRONGER, [STACCATO_RULE, RECALL_RULE], []))
        with self.assertRaises(T.GuardScopeError):
            T.enforce_guard_scope(schema, VERDICT_PARAGRAPH, drop=True)

    def test_guards_the_prose_does_scope_are_returned_untouched(self):
        cases = {
            "the verdict's own paragraph": (f"{RECALL_LINE}\n\n{VERDICT_PARAGRAPH}",
                                            _tree(RECALL_RULE, _guard("can_win", STRONGER, [STACCATO_RULE], [], ATTACK_LOWEST, TO_OWN_TOWER))),
            "paragraphs that restate the verdict": (
                f"{RECALL_LINE}\n\nYou only take fights you can win.\n\n"
                "When your side is stronger in the fight near you, play staccato on the enemy with the lowest hp when it is ready.\n\n"
                "When your side is weaker in the fight near you and an enemy bearbot is in sight, fall back to your own tower.",
                _tree(RECALL_RULE, _guard("can_win", STRONGER, [STACCATO_RULE], [FALL_BACK_RULE]))),
            "a heading's section, with its otherwise": (
                f"{RECALL_LINE}\n\n## Fights: only when my side is stronger\nPlay staccato on the enemy with the lowest hp when it is "
                "ready.\n\nOtherwise attack the enemy with the lowest hp.\n\n## Shopping\nBuy an Amp first.",
                _tree(RECALL_RULE, _guard("can_win", STRONGER, [STACCATO_RULE], [], ATTACK_LOWEST, TO_OWN_TOWER))),
            "a lead-in and its list": (
                f"{RECALL_LINE}\n\nWhen my side is stronger in the fight near me:\n\n"
                "- play staccato on the enemy with the lowest hp when it is ready\n\n- attack the enemy with the lowest hp",
                _tree(RECALL_RULE, _guard("can_win", STRONGER, [STACCATO_RULE], [], ATTACK_LOWEST, TO_OWN_TOWER))),
            "no rules under it at all": (VERDICT_PARAGRAPH, _tree(RECALL_RULE, _guard("can_win", STRONGER, [], [], ATTACK_LOWEST, TO_OWN_TOWER))),
        }
        for name, (prose, schema) in cases.items():
            with self.subTest(name):
                self.assertIs(T.enforce_guard_scope(schema, prose), schema)
                self.assertIs(T.enforce_guard_scope(schema, prose, drop=True), schema)

    def test_violin_md_does_not_place_its_opener_under_its_verdict(self):
        # Known strictness, flagged for a ruling (docs/vocabulary-spec.md §8.10): the guards spec's own worked tree
        # (§3.2) puts Staccato under "you only take fights you can win", which ends its paragraph; the Staccato
        # paragraph after it never restates the verdict, so under vocab-2 the guard is rejected.
        prose = T.scope_to_instrument(open(os.path.join(os.path.dirname(__file__), "..", "..", "prompts", "pilots", "violin.md"),
                                           encoding="utf-8").read(), "violin").text
        opener = _node("staccato_opener", "is staccato off cooldown and is the target in its range?", "ability", "staccato", "isolated_enemy")
        schema = _tree(RECALL_RULE, _guard("can_win_fight", "can this bot win the fight it is in or about to enter, by itself, right now?",
                                           [opener], [], {"kind": "move", "ability": None, "target_selector": "isolated_enemy"}))
        self.assertEqual(T._verdict_scope(schema.root.nodes[1], T._prose_paragraphs(prose)), {1})
        with self.assertRaises(T.GuardScopeError) as err:
            T.enforce_guard_scope(schema, prose)
        self.assertIn('"Staccato (quick high-damage stab', str(err.exception))

    def test_a_rule_from_other_prose_inside_a_branch_is_rejected(self):
        schema = _tree(_guard("can_win", STRONGER, [STACCATO_RULE], [RECALL_RULE]))
        with self.assertRaises(T.GuardScopeError) as err:
            T.enforce_guard_scope(schema, f"{RECALL_LINE}\n\n{VERDICT_PARAGRAPH}")
        self.assertIn(f'under that question: "{RECALL_LINE}"', str(err.exception))
        fixed = T.enforce_guard_scope(schema, f"{RECALL_LINE}\n\n{VERDICT_PARAGRAPH}", drop=True)
        self.assertEqual([n.id for n in fixed.root.nodes], ["recall_low"])
        self.assertIn("Removed with it: staccato_lowest", fixed.validation_notes[-1])

    def test_any_node_after_a_guard_is_rejected_even_when_its_branches_are_right(self):
        schema = _tree(_guard("can_win", STRONGER, [STACCATO_RULE], [], ATTACK_LOWEST, TO_OWN_TOWER), RECALL_RULE)
        prose = f"{VERDICT_PARAGRAPH}\n\n{RECALL_LINE}"
        with self.assertRaises(T.GuardScopeError):
            T.enforce_guard_scope(schema, prose)
        fixed = T.enforce_guard_scope(schema, prose, drop=True)
        self.assertEqual([n.id for n in fixed.root.nodes], ["recall_low"])
        self.assertIn("the 1 node(s) after it (recall_low) were never checked", fixed.validation_notes[-1])

    def test_one_shared_word_is_not_the_verdict(self):
        # "the next wave" shares "next" with "afford its next item": it does not put the walk under that question
        prose = "When I can afford my next item and no enemy is in sight, I head home to shop.\n\n" \
                "Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave."
        walk = _node("walk_with_minion", "is there a minion near me?", "move", target="nearby_minion")
        schema = _tree(_guard("afford", "can this bot afford its next item?", [], [walk], {"kind": "move", "ability": None, "target_selector": "home"}))
        with self.assertRaises(T.GuardScopeError):
            T.enforce_guard_scope(schema, prose.replace("Otherwise I", "Then I"))
        self.assertEqual(T._verdict_scope(schema.root.nodes[0], T._prose_paragraphs(prose.replace("Otherwise I", "Then I"))), {0})

    def test_a_nested_guard_is_held_to_the_same_rule_and_flattened_in_turn(self):
        inner = _guard("inner", "can this bot afford its next item?", [RECALL_RULE], [])
        schema = _tree(_guard("can_win", STRONGER, [inner, STACCATO_RULE], []))
        prose = f"{RECALL_LINE}\n\n{VERDICT_PARAGRAPH}\n\nWhen I can afford my next item, I head home to shop."
        with self.assertRaises(T.GuardScopeError):
            T.enforce_guard_scope(schema, prose)
        fixed = T.enforce_guard_scope(schema, prose, drop=True)
        self.assertFalse([n for n in T.collect_nodes(fixed.root) if isinstance(n, T.GuardNode)])
        self.assertIn("recall_low", [n.id for n in fixed.root.nodes])
        self.assertEqual(len([n for n in fixed.validation_notes if n.startswith("guard scope:")]), 2)

    def test_flat_schemas_are_never_touched(self):
        for i, case in enumerate(NEGATION["schemas"]):
            schema, prose = _negation(i)
            with self.subTest(case["pr"] + " " + case["sample"] + " " + case["instrument"]):
                self.assertIs(T.enforce_guard_scope(schema, prose), schema)
                self.assertIs(T.enforce_guard_scope(schema, prose, drop=True), schema)

    def test_vocab1_is_unchanged(self):
        schema, prose = _saved_guard(0)
        schema = dataclasses.replace(schema, vocab="vocab-1")
        self.assertIs(T.enforce_guard_scope(schema, prose), schema)
        self.assertIs(T.enforce_guard_scope(schema, prose, drop=True), schema)

    def test_translate_pilot_retries_without_the_generic_guard_line_and_keeps_the_flat_reply(self):
        bad = GUARD_SCOPE["replies"][0]["reply"]  # #89's A/B: a typed guard holding every rule
        flat = json.loads(json.dumps(_negation_reply(0)))  # a flat reply that passes every check after its fix
        for r in flat["rules"]:
            if r["id"] == "shop_no_enemy":
                r["condition"] = "is no enemy within 260 units?"
        replies, prompts = [bad, json.dumps(flat)], []

        def generate(prompt):
            prompts.append(prompt)
            return replies[len(prompts) - 1]

        schema = T.translate_pilot(GUARD_SCOPE["prose"], "pilot.md", "violin", "staccato", "glissando", generate=generate,
                                   vocab="vocab-2", economy="eco-3-late")
        self.assertEqual(len(prompts), 2)
        retry = prompts[1].split("Your previous attempt was invalid:")[1]
        self.assertIn("a guard sends every decision into one of its two branches", retry)
        self.assertNotIn("finish the guard shape", retry)
        self.assertNotIn("can this bot afford its next item AND is there an enemy bearbot in sight?", retry)
        self.assertNotIn("guard_shop_or_fight", retry)
        self.assertFalse([n for n in T.collect_nodes(schema.root) if isinstance(n, T.GuardNode)])
        self.assertFalse([n for n in schema.validation_notes if n.startswith("guard scope:")])

    def test_translate_pilot_flattens_on_its_last_attempt_instead_of_failing(self):
        prompts = []

        def generate(prompt):
            prompts.append(prompt)
            return GUARD_SCOPE["replies"][0]["reply"]

        schema = T.translate_pilot(GUARD_SCOPE["prose"], "pilot.md", "drums", "kick", "fill", generate=generate, vocab="vocab-2",
                                   economy="eco-3-late")
        self.assertEqual(len(prompts), 3)
        self.assertFalse([n for n in T.collect_nodes(schema.root) if isinstance(n, T.GuardNode)])
        self.assertIn("recall_if_hp_low_or_tower_threat", [n.id for n in schema.rules])
        self.assertTrue([n for n in schema.validation_notes if n.startswith("guard scope: removed the guard guard_shop_or_fight")])


if __name__ == "__main__":
    unittest.main()
