"""Tests for tools/jev/number_normalize.py -- the trace-overlap-only number-word normalizer."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from number_normalize import normalize_numbers_for_trace  # noqa: E402


class QuantityWordsAreNormalizedTests(unittest.TestCase):
    def test_quarter_becomes_25(self):
        self.assertIn("25", normalize_numbers_for_trace("below a quarter health").split())

    def test_half_becomes_50(self):
        self.assertIn("50", normalize_numbers_for_trace("at half health").split())

    def test_the_real_keytar_quarter_sentence_shares_a_token_with_a_numeric_rule_condition(self):
        """The exact case this module exists for: violin/keytar/drums all phrase the recall rule as
        "a quarter health" in prose; a translated condition worded numerically ("below 25% of max")
        must now share a token with it, where plain word overlap previously shared none."""
        prose_tokens = set(normalize_numbers_for_trace("Recall the moment you're below a quarter health").split())
        rule_tokens = set(normalize_numbers_for_trace("is hp below 25% of max?").split())
        self.assertTrue(prose_tokens & rule_tokens, "expected a shared token between 'quarter' and '25%'")

    def test_small_counts_are_normalized(self):
        text = normalize_numbers_for_trace("more than one enemy, at least two allies")
        self.assertIn("1", text.split())
        self.assertIn("2", text.split())


class NonQuantityExclusionsTests(unittest.TestCase):
    def test_one_phrase_is_not_normalized(self):
        """violin.md: 'win in one phrase' means a single exchange, not a countable quantity."""
        result = normalize_numbers_for_trace("you only take fights you can win in one phrase")
        self.assertIn("one phrase", result)
        self.assertNotIn("1 phrase", result)

    def test_ordinals_are_never_touched(self):
        """keytar.md's own wording -- sequence, not quantity."""
        result = normalize_numbers_for_trace("Chord first, basic-attack second, never melee")
        self.assertIn("first", result)
        self.assertIn("second", result)

    def test_drums_ordinal_sequence_is_never_touched(self):
        result = normalize_numbers_for_trace(
            "Attack whatever's nearest and threatening an ally first, the nearest enemy bearbot "
            "second, minions last."
        )
        self.assertIn("first", result)
        self.assertIn("second", result)
        self.assertIn("last", result)


class IdempotenceAndCaseTests(unittest.TestCase):
    def test_idempotent(self):
        once = normalize_numbers_for_trace("below a quarter health")
        twice = normalize_numbers_for_trace(once)
        self.assertEqual(once, twice)

    def test_case_insensitive(self):
        self.assertIn("25", normalize_numbers_for_trace("Below A QUARTER Health").split())

    def test_unrelated_text_is_unchanged_besides_case(self):
        text = "is an enemy bearbot within melee range?"
        self.assertEqual(normalize_numbers_for_trace(text), text.lower())


if __name__ == "__main__":
    unittest.main()
