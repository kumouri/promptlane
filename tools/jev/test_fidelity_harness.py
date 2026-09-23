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


class ParseArgsReferenceSchemasTests(unittest.TestCase):
    def test_reference_schemas_dir_defaults_to_none(self):
        args = FH.parse_args([])
        self.assertIsNone(args.reference_schemas_dir)

    def test_reference_schemas_dir_accepts_a_path(self):
        args = FH.parse_args(["--reference-schemas-dir", "runs/reference-schemas"])
        self.assertEqual(args.reference_schemas_dir, "runs/reference-schemas")


if __name__ == "__main__":
    unittest.main()
