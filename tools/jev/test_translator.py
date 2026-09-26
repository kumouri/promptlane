"""Tests for tools/jev/translator.py's pure parsing/validation logic (no Ollama call)."""
from __future__ import annotations

import json
import os
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


if __name__ == "__main__":
    unittest.main()
