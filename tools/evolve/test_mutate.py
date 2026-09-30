"""Tests for tools/evolve/mutate.py -- the single-change mutation operator. No network: the model is
`llm_backends.ScriptedBackend`, which replays canned replies. Pinned: the reply format is parsed,
"one change" is checked by sentence diff rather than trusted, a rejected attempt is retried with
the reason, and the CLI speaks one JSON line."""
from __future__ import annotations

import io
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "jev"))
import mutate  # noqa: E402
from llm_backends import ScriptedBackend  # noqa: E402

PARENT = "You are the drums. Walk in front. Kick the nearest enemy bearbot. Recall below a quarter health.\n"


def reply(change: str, prose: str) -> str:
    return f"CHANGE: {change}\n<<<PROSE\n{prose}\nPROSE>>>"


class SentenceDiffTests(unittest.TestCase):
    def test_counts_added_removed_and_reworded(self):
        self.assertEqual(mutate.sentence_changes(PARENT, PARENT), 0)
        self.assertEqual(mutate.sentence_changes(PARENT, PARENT.strip() + " Push the lane."), 1)
        self.assertEqual(mutate.sentence_changes(PARENT, PARENT.replace("a quarter", "half")), 2)
        self.assertEqual(mutate.sentence_changes(PARENT, "Something else entirely."), 5)

    def test_split_matches_the_js_side(self):
        self.assertEqual(mutate.sentences("One. Two!\n\nThree?  Four"), ["One.", "Two!", "Three?", "Four"])


class MutateTests(unittest.TestCase):
    def test_accepts_a_single_change(self):
        child = PARENT.replace("a quarter", "half")
        b = ScriptedBackend([reply("recall earlier", child)])
        out = mutate.mutate(b, PARENT, "change one numeric threshold")
        self.assertTrue(out["ok"])
        self.assertEqual(out["prose"], child)
        self.assertEqual(out["change"], "recall earlier")
        self.assertEqual(out["sentence_changes"], 2)
        self.assertEqual(out["attempts"], 1)

    def test_retries_until_valid_and_says_why(self):
        prompts = []
        good = PARENT.strip() + " Push the lane.\n"
        b = ScriptedBackend(["no format at all", reply("same", PARENT), reply("rewrite", "Totally new. Every. Sentence. Changed. Now."), reply("add", good)])
        real_generate = b.generate
        b.generate = lambda p: (prompts.append(p), real_generate(p))[1]
        out = mutate.mutate(b, PARENT, "add one rule", attempts=4, max_sentence_changes=3)
        self.assertTrue(out["ok"], out)
        self.assertEqual(out["attempts"], 4)
        self.assertIn("did not have the CHANGE line", prompts[1])
        self.assertIn("came back unchanged", prompts[2])
        self.assertIn("one change touches at most 3", prompts[3])

    def test_gives_up_after_attempts(self):
        b = ScriptedBackend([reply("same", PARENT)])
        out = mutate.mutate(b, PARENT, "x", attempts=2)
        self.assertFalse(out["ok"])
        self.assertIn("after 2 attempt(s)", out["error"])

    def test_prompt_carries_focus_diagnostics_and_siblings(self):
        p = mutate.build_prompt(PARENT, "swap two rules", "drums: r1 fired 0x", ["made recall earlier"])
        self.assertIn("swap two rules", p)
        self.assertIn("r1 fired 0x", p)
        self.assertIn("made recall earlier", p)
        self.assertIn(PARENT.strip(), p)


class CliTests(unittest.TestCase):
    def test_one_json_line_out(self):
        child = PARENT.strip() + " Push the lane.\n"
        with mock.patch.object(mutate, "make_backend", lambda *a, **k: ScriptedBackend([reply("push", child)])):
            stdout = io.StringIO()
            code = mutate.main(["--backend", "ollama"], stdin=io.StringIO(json.dumps({"parent": PARENT, "focus": "add"})), stdout=stdout)
        self.assertEqual(code, 0)
        out = json.loads(stdout.getvalue())
        self.assertTrue(out["ok"])
        self.assertEqual(out["backend"], "scripted:scripted")
        self.assertEqual(out["usage"]["calls"], 1)


if __name__ == "__main__":
    unittest.main()
