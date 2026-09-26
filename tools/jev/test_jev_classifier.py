"""Tests for tools/jev/jev_classifier.py -- no network, a fake Jev client answers from a fixed
per-question script."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import jev_classifier as C  # noqa: E402


class FakeJevClient:
    """Answers each question by id from a fixed dict; missing ids default to 0.1 (a confident 'no')."""

    def __init__(self, answers_by_id: dict[str, float]):
        self.answers_by_id = answers_by_id
        self.last_call = None

    def ask(self, state, questions: list) -> dict:
        self.last_call = (state, questions)
        answers = {q.id: {"noul": self.answers_by_id.get(q.id, 0.1)} for q in questions}
        return {"model": "fake", "answers": answers, "usage": {"input_tokens": 42, "output_tokens": 0}}


class ClausesForPilotTests(unittest.TestCase):
    def test_drops_boilerplate_keeps_everything_else(self):
        text = (
            "You are a bearbot.\n\n"
            "If hp is low, recall.\n\n"
            "You will be handed an OBSERVATION as JSON: reply with exactly one JSON action object.\n\n"
            '{"kind": "move"}\n\n'
            "No commentary, no explanation, no markdown -- just the object."
        )
        clauses = C.clauses_for_pilot(text)
        joined = " ".join(t for _, t in clauses)
        self.assertIn("If hp is low, recall.", joined)
        self.assertNotIn("OBSERVATION", joined)
        self.assertNotIn('"kind"', joined)


class ClassifyPilotTests(unittest.TestCase):
    def test_picks_argmax_class_above_half(self):
        pilot_text = "You only take fights you can win.\n\nUse the ability when off cooldown."
        clauses = C.clauses_for_pilot(pilot_text)
        self.assertEqual(len(clauses), 2)
        idx0, idx1 = clauses[0][0], clauses[1][0]
        answers = {
            C._clause_question_id(idx0, "guard"): 0.9,
            C._clause_question_id(idx0, "default"): 0.1,
            C._clause_question_id(idx0, "rule"): 0.2,
            C._clause_question_id(idx1, "guard"): 0.05,
            C._clause_question_id(idx1, "default"): 0.1,
            C._clause_question_id(idx1, "rule"): 0.88,
        }
        client = FakeJevClient(answers)
        report = C.classify_pilot(client, "test", pilot_text)
        rows = {r["clause_index"]: r for r in report["rows"]}
        self.assertEqual(rows[idx0]["predicted_class"], "guard")
        self.assertAlmostEqual(rows[idx0]["confidence"], 0.9)
        self.assertEqual(rows[idx1]["predicted_class"], "rule")
        state, _questions = client.last_call
        self.assertEqual(state, pilot_text)

    def test_all_low_confidence_reports_none(self):
        pilot_text = "You are a bearbot on the drums."
        client = FakeJevClient({})  # every question defaults to 0.1
        report = C.classify_pilot(client, "test", pilot_text)
        self.assertEqual(report["rows"][0]["predicted_class"], None)
        self.assertEqual(report["rows"][0]["confidence"], None)

    def test_ties_at_exactly_half_are_not_classified(self):
        pilot_text = "Ambiguous clause here."
        idx = C.clauses_for_pilot(pilot_text)[0][0]
        answers = {
            C._clause_question_id(idx, "guard"): 0.5,
            C._clause_question_id(idx, "default"): 0.5,
            C._clause_question_id(idx, "rule"): 0.5,
        }
        client = FakeJevClient(answers)
        report = C.classify_pilot(client, "test", pilot_text)
        self.assertIsNone(report["rows"][0]["predicted_class"])


class FormatHintsTests(unittest.TestCase):
    def test_omits_unclassified_clauses(self):
        report = {
            "rows": [
                {"clause_index": 0, "text": "a guard sentence", "predicted_class": "guard", "confidence": 0.81},
                {"clause_index": 1, "text": "an unclassified one", "predicted_class": None, "confidence": None},
            ]
        }
        hints = C.format_hints(report)
        self.assertIn("clause 0", hints)
        self.assertIn("guard, p=0.81", hints)
        self.assertNotIn("clause 1", hints)

    def test_empty_when_nothing_classified(self):
        report = {"rows": [{"clause_index": 0, "text": "x", "predicted_class": None, "confidence": None}]}
        self.assertEqual(C.format_hints(report), "")

    def test_truncates_long_clause_text(self):
        long_text = "x" * 200
        report = {"rows": [{"clause_index": 0, "text": long_text, "predicted_class": "rule", "confidence": 0.7}]}
        hints = C.format_hints(report, max_chars=20)
        self.assertIn("…", hints)
        self.assertLess(len(hints.splitlines()[1]), 60)


class ScoreAgainstHandKeyTests(unittest.TestCase):
    def test_none_prediction_matches_voice_label(self):
        classifier_report = {
            "pilot": "drums",
            "rows": [
                {"clause_index": 0, "text": "flavor", "per_class": {}, "predicted_class": None, "confidence": None},
                {"clause_index": 1, "text": "a rule", "per_class": {}, "predicted_class": "rule", "confidence": 0.9},
                {"clause_index": 2, "text": "a guard mistaken for a rule", "per_class": {}, "predicted_class": "rule", "confidence": 0.6},
            ],
        }
        hand_key = {
            "drums": [
                {"clause_index": 0, "hand_class": "voice"},
                {"clause_index": 1, "hand_class": "rule"},
                {"clause_index": 2, "hand_class": "guard"},
            ]
        }
        scored = C.score_against_hand_key(classifier_report, hand_key)
        self.assertEqual(scored["n_clauses"], 3)
        self.assertEqual(scored["n_correct"], 2)
        self.assertAlmostEqual(scored["accuracy"], 2 / 3)
        self.assertTrue(scored["rows"][0]["correct"])
        self.assertTrue(scored["rows"][1]["correct"])
        self.assertFalse(scored["rows"][2]["correct"])


if __name__ == "__main__":
    unittest.main()
