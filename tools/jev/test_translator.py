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


if __name__ == "__main__":
    unittest.main()
