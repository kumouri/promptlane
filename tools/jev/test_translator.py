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

if __name__ == "__main__":
    unittest.main()
