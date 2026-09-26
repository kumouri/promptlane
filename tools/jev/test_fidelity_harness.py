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


if __name__ == "__main__":
    unittest.main()
