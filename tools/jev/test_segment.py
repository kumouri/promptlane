"""Tests for tools/jev/segment.py -- automatic labels for prose nobody hand-labelled."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from expressibility import FILES  # noqa: E402
from segment import auto_segments, hand_segments_for, label_sentence  # noqa: E402


def _char_labels(text: str, segments) -> list[str]:
    labels = ["voice"] * len(text)
    pos = 0
    for label, seg in segments:
        i = text.find(seg, pos)
        labels[i : i + len(seg)] = [label] * len(seg)
        pos = i + len(seg)
    return labels


class LabelTests(unittest.TestCase):
    def test_condition_plus_action_is_a_rule(self):
        self.assertEqual(label_sentence("Recall the moment you're below a quarter health."), "rule")
        self.assertEqual(label_sentence("When an enemy gets close to an ally, that enemy is your problem."), "rule")

    def test_action_without_condition_is_advisory(self):
        self.assertEqual(label_sentence("Walk in front."), "open_strategy")
        self.assertEqual(label_sentence("Don't wait for a perfect moment."), "open_strategy")

    def test_flavour_is_voice(self):
        self.assertEqual(label_sentence("You are the beat everyone else plays over."), "voice")

    def test_boilerplate_is_exactly_the_reply_format_tail_and_sentences_keep_exact_text(self):
        whole = "".join(t for _, t in FILES["drums.md"])
        segs = auto_segments(whole)
        labels = [label for label, _ in segs]
        # the tail's three paragraphs (OBSERVATION..., the {"kind"...} line, "No commentary...")
        self.assertEqual(labels[-3:], ["boilerplate"] * 3)
        self.assertNotIn("boilerplate", labels[:-3])
        for _, seg in segs:
            self.assertIn(seg, whole)


class AgreementWithHandLabelsTests(unittest.TestCase):
    """The measured floor for the three reference pilots (docs/entrant-compile-preview.md): the
    labeller must find nearly all hand-labelled rule prose, since a rule sentence misfiled as voice
    is the error that would hide a dropped instruction."""

    def test_rule_recall_on_reference_pilots(self):
        for name, segs in FILES.items():
            text = "".join(t for _, t in segs)
            hand = _char_labels(text, segs)
            auto = _char_labels(text, auto_segments(text))
            rule_chars = [(h, a) for c, h, a in zip(text, hand, auto) if not c.isspace() and h == "rule"]
            recall = sum(a == "rule" for _, a in rule_chars) / len(rule_chars)
            self.assertGreaterEqual(recall, 0.85, name)

    def test_reference_pilots_are_recognised_exactly(self):
        for name, segs in FILES.items():
            text = "".join(t for _, t in segs)
            self.assertEqual(hand_segments_for(text)[0], name)
            self.assertEqual(hand_segments_for(text.replace("\n", "\r\n"))[0], name)
            self.assertIsNone(hand_segments_for(text + " "))


if __name__ == "__main__":
    unittest.main()
