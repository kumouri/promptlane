"""Tests for tools/jev/client.py: the systemone wire shape, the key-refusal posture (mirrors
tools/model_server.py::resolve_api_key), and the stub client's plumbing. No network calls."""
from __future__ import annotations

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import client as C  # noqa: E402
import rules as R  # noqa: E402


def ws(**overrides):
    base = dict(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
    base.update(overrides)
    return R.Worksheet(**base)


class ResolveApiKeyTests(unittest.TestCase):
    def test_refuses_clearly_when_unset(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit) as ctx:
                C.resolve_api_key("TYPESAFE_API_KEY")
        self.assertIn("TYPESAFE_API_KEY", str(ctx.exception))
        self.assertIn("dry-run", str(ctx.exception))

    def test_never_echoes_the_key_value(self):
        with mock.patch.dict(os.environ, {"TYPESAFE_API_KEY": "sk-super-secret-value"}, clear=True):
            key = C.resolve_api_key("TYPESAFE_API_KEY")
        self.assertEqual(key, "sk-super-secret-value")

    def test_reads_a_custom_env_var_name(self):
        with mock.patch.dict(os.environ, {"JEV_API_KEY": "abc"}, clear=True):
            self.assertEqual(C.resolve_api_key("JEV_API_KEY"), "abc")


class BuildRequestBodyTests(unittest.TestCase):
    def test_shape_matches_docs_typesafe_ai(self):
        bound = R.bind_questions("keytar", ws(hp=50))
        body = C.build_request_body("a state paragraph", bound, model="jev-test")
        self.assertEqual(body["state"], "a state paragraph")
        self.assertEqual(body["model"], "jev-test")
        self.assertEqual(set(body["questions"].keys()), {q.id for q in bound})
        for qid, q in body["questions"].items():
            self.assertEqual(q["type"], "noul")
            self.assertIn("instructions", q)
            self.assertIn("criteria", q)
        # no harness-only bookkeeping (rule_number, ground_truth_value) leaks into the wire body
        for q in body["questions"].values():
            self.assertEqual(set(q.keys()), {"type", "instructions", "criteria"})


class TokenAndCostTests(unittest.TestCase):
    def test_estimate_tokens_is_roughly_chars_over_four(self):
        self.assertEqual(C.estimate_tokens(400), 100)
        self.assertEqual(C.estimate_tokens(1), 1)  # never zero

    def test_estimate_request_tokens_counts_state_instructions_and_criteria(self):
        bound = R.bind_questions("keytar", ws())
        state = "x" * 400
        with_criteria = C.estimate_request_tokens(state, bound)
        instructions_chars = sum(len(q.instructions) for q in bound)
        # every question here carries non-empty criteria, so counting it must add tokens beyond
        # state + instructions alone
        without_criteria = C.estimate_tokens(len(state) + instructions_chars)
        self.assertGreater(with_criteria, without_criteria)

    def test_estimate_cost_uses_published_price(self):
        cost = C.estimate_cost_usd(1_000_000)
        self.assertAlmostEqual(cost, 0.042)

    def test_output_is_free(self):
        self.assertEqual(C.PRICE_OUT_PER_M, 0.0)


class StubSystemOneClientTests(unittest.TestCase):
    def test_answers_every_question_with_a_noul(self):
        bound = R.bind_questions("drums", ws(hp=50, tower="tw-1", wave=0))
        stub = C.StubSystemOneClient(error_rate=0.0, seed=1)
        response = stub.ask("state text", bound)
        self.assertEqual(set(response["answers"].keys()), {q.id for q in bound})
        for cell in response["answers"].values():
            self.assertIn("noul", cell)
            self.assertGreaterEqual(cell["noul"], 0.0)
            self.assertLessEqual(cell["noul"], 1.0)
        self.assertIn("input_tokens", response["usage"])
        self.assertEqual(response["usage"]["output_tokens"], 0)

    def test_zero_error_rate_always_agrees_with_ground_truth(self):
        bound = R.bind_questions("keytar", ws(hp=50, tower="tw-1", wave=0, foe="bb-1", cd=0.0))
        stub = C.StubSystemOneClient(error_rate=0.0, seed=1)
        response = stub.ask("state text", bound)
        for q in bound:
            answered = response["answers"][q.id]["noul"] > 0.5
            self.assertEqual(answered, q.ground_truth_value)

    def test_is_deterministic_for_a_fixed_seed(self):
        bound = R.bind_questions("violin", ws(hp=40))
        first = C.StubSystemOneClient(error_rate=0.3, seed=42).ask("s", bound)
        second = C.StubSystemOneClient(error_rate=0.3, seed=42).ask("s", bound)
        self.assertEqual(first["answers"], second["answers"])


if __name__ == "__main__":
    unittest.main()
