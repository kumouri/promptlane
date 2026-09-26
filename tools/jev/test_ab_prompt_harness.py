"""Tests for tools/jev/ab_prompt_harness.py's 2026-09-26 additions (translator-backend selection,
Jev-classifier hints) -- no network, no Ollama, no claude CLI. `translate_pilot_arm`/
`make_translator_generate` are pure functions of a `generate` callable, so a scripted fake stands in
for both."""
from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import ab_prompt_harness as H  # noqa: E402

VALID_SCHEMA_JSON = json.dumps(
    {
        "rules": [{"id": "r1", "condition": "is hp low?", "criteria": {"true": "yes", "false": "no"},
                    "action": {"kind": "recall", "ability": None, "target_selector": None}}],
        "default_action": {"kind": "hold", "ability": None, "target_selector": None},
    }
)


class ScriptedGenerate:
    """Replays canned replies in order; records every prompt it was called with."""

    def __init__(self, replies: list[str]):
        self.replies = list(replies)
        self.prompts: list[str] = []

    def __call__(self, prompt: str) -> str:
        self.prompts.append(prompt)
        return self.replies[len(self.prompts) - 1]


class TranslatePilotArmHintsTests(unittest.TestCase):
    def test_hints_appended_after_prompt_identically_both_arms(self):
        hints = 'clause 5 ("you only take fights you can win") reads as a guard, p=0.81'
        for arm in ("a", "b"):
            gen = ScriptedGenerate([VALID_SCHEMA_JSON])
            H.translate_pilot_arm("prose here", "pilots/x.md", "violin", "staccato", "solo", arm, gen, hints=hints)
            self.assertIn(hints, gen.prompts[0])
            base_prompt = H.ARM_PROMPTS[arm]("prose here", "violin", "staccato", "solo")
            self.assertTrue(gen.prompts[0].startswith(base_prompt))

    def test_no_hints_leaves_prompt_unchanged(self):
        gen = ScriptedGenerate([VALID_SCHEMA_JSON])
        H.translate_pilot_arm("prose here", "pilots/x.md", "violin", "staccato", "solo", "b", gen, hints=None)
        expected = H.ARM_PROMPTS["b"]("prose here", "violin", "staccato", "solo")
        self.assertEqual(gen.prompts[0], expected)

    def test_hints_persist_across_a_retry(self):
        hints = "clause 2 reads as a rule, p=0.9"
        gen = ScriptedGenerate(["not json at all", VALID_SCHEMA_JSON])
        H.translate_pilot_arm("prose here", "pilots/x.md", "violin", "staccato", "solo", "b", gen, hints=hints)
        self.assertEqual(len(gen.prompts), 2)
        self.assertIn(hints, gen.prompts[0])
        self.assertIn(hints, gen.prompts[1])


class MakeTranslatorGenerateTests(unittest.TestCase):
    def test_qwen_backend_calls_ollama_generate_with_expected_args(self):
        captured = {}

        def fake_ollama_generate(url, model, prompt, timeout, max_tokens):
            captured.update(url=url, model=model, prompt=prompt, timeout=timeout, max_tokens=max_tokens)
            return VALID_SCHEMA_JSON

        original = H._ollama_generate
        H._ollama_generate = fake_ollama_generate
        try:
            generate = H.make_translator_generate("qwen", "qwen3.5:9b", "http://127.0.0.1:11434", None)
            reply = generate("hello prompt")
        finally:
            H._ollama_generate = original
        self.assertEqual(reply, VALID_SCHEMA_JSON)
        self.assertEqual(captured["url"], "http://127.0.0.1:11434")
        self.assertEqual(captured["model"], "qwen3.5:9b")
        self.assertEqual(captured["timeout"], 90.0)
        self.assertEqual(captured["max_tokens"], 1800)

    def test_claude_backends_require_a_backend_instance(self):
        with self.assertRaises(ValueError):
            H.make_translator_generate("haiku", "qwen3.5:9b", None, None)

    def test_claude_backend_uses_its_own_generate(self):
        class FakeBackend:
            def generate(self, prompt):
                return "claude said: " + prompt

        backend = FakeBackend()
        generate = H.make_translator_generate("haiku", "qwen3.5:9b", None, backend)
        self.assertEqual(generate("hi"), "claude said: hi")


if __name__ == "__main__":
    unittest.main()
