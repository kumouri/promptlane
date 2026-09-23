"""Tests for tools/jev/transparency.py's provenance matching and rendering (no Ollama/Jev call --
uses hand-built TranslatedSchema fixtures, the same pattern test_translator.py uses)."""
from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import transparency as X  # noqa: E402
from translator import TranslatedRule, TranslatedSchema  # noqa: E402


def _rule(id, condition, kind="attack", ability=None, selector="nearest_enemy", ct="true", cf="false"):
    return TranslatedRule(
        id=id, condition=condition, criteria_true=ct, criteria_false=cf,
        action_kind=kind, action_ability=ability, action_target_selector=selector,
    )


class BuildReportKeytarTests(unittest.TestCase):
    """Exercises build_report against the real keytar.md segments (expressibility.FILES), with a
    hand-built schema standing in for a live translation -- deterministic, no model call."""

    def setUp(self):
        self.schema = TranslatedSchema(
            pilot_file="keytar.md",
            instrument="keytar",
            rules=[
                _rule("recall_low_hp", "is hp below a quarter of max?", kind="recall", selector="none"),
                _rule("panic_dash", "is a visible enemy inside melee range?", kind="ability", ability="glissando", selector=None),
                # deliberately omits "chord"/"cluster" wording -- this is the keytar-shaped bug the
                # task names: a trigger that dropped "enemies or minions you can see" and kept only
                # the cooldown check, so it no longer shares enough vocabulary with the Chord
                # sentence in the prose to be traced back to it.
                _rule("aoe_no_visibility_check", "is the primary ability off cooldown?", kind="ability",
                      ability=None, selector="densest_cluster_enemy", ct="the ability is ready", cf="the ability is on cooldown"),
            ],
            default_kind="move", default_ability=None, default_target_selector="push_lane",
            raw_model_output="{}",
            validation_notes=("priority guard: promoted rule(s) recall_low_hp to the top of the cascade -- "
                               "the prose uses unconditional-override language for them (no exceptions) but "
                               "the translator placed them lower, where an earlier rule could pre-empt them.",),
        )
        self.report = X.build_report(self.schema, "keytar.md")

    def test_recall_rule_traces_to_its_source_sentence(self):
        rp = self.report.rules[0]
        self.assertEqual(rp.rule.id, "recall_low_hp")
        self.assertTrue(any("no exceptions" in s for s in rp.source_segments))

    def test_promoted_rule_records_why_in_order_field(self):
        rp = self.report.rules[0]
        self.assertIn("priority guard", rp.order_why)

    def test_unpromoted_rule_explains_plain_position(self):
        rp = self.report.rules[1]
        self.assertIn("position 2 of 3", rp.order_why)
        self.assertNotIn("priority guard", rp.order_why)

    def test_rule_missing_the_visibility_clause_has_no_strong_source_match(self):
        # this is the keytar-shaped bug the task is about: a Chord rule whose condition dropped
        # "enemies or minions you can see" (it only asks about cooldown) doesn't share enough
        # wording with the Chord sentence in the prose to be traced back to it confidently -- the
        # transparency view should say so rather than force a low-confidence match.
        rp = self.report.rules[2]
        self.assertEqual(rp.rule.id, "aoe_no_visibility_check")
        self.assertEqual(rp.source_segments, ())
        self.assertIn("no strong match", rp.source_note)

    def test_voice_and_open_strategy_are_reported_as_dropped(self):
        labels = {d.label for d in self.report.dropped}
        self.assertIn("voice", labels)
        self.assertIn("open_strategy", labels)

    def test_boilerplate_is_not_reported_as_dropped(self):
        boilerplate_texts = [t for _l, t in X.PILOT_SEGMENTS["keytar.md"] if _l == "boilerplate"]
        dropped_texts = {d.text for d in self.report.dropped}
        for t in boilerplate_texts:
            self.assertNotIn(t, dropped_texts)

    def test_unclaimed_rule_content_is_flagged_distinctly_from_voice(self):
        # "Poke minion waves ... " is a real rule-shaped sentence in keytar.md that this fixture's
        # 3-rule schema (missing a poke_lane rule on purpose) can't trace anything to.
        unclaimed = [d for d in self.report.dropped if d.label == "unclaimed_rule"]
        self.assertTrue(any("Poke minion waves" in d.text for d in unclaimed))


class RenderReportMarkdownTests(unittest.TestCase):
    def test_render_includes_provenance_and_dropped_sections(self):
        schema = TranslatedSchema(
            pilot_file="drums.md",
            instrument="drums",
            rules=[_rule("retreat", "is hp below a quarter of max?", kind="recall", selector="none")],
            default_kind="move", default_ability=None, default_target_selector="push_lane",
            raw_model_output="{}",
        )
        report = X.build_report(schema, "drums.md")
        rendered = X.render_report_markdown(report)
        self.assertIn("## Rule detail", rendered)
        self.assertIn("## Dropped", rendered)
        self.assertIn("What Jev is asked", rendered)
        self.assertIn("From your prose", rendered)

    def test_render_has_no_jev_wire_format_or_code(self):
        schema = TranslatedSchema(
            pilot_file="violin.md",
            instrument="violin",
            rules=[_rule("engage", "is an enemy isolated?", kind="ability", ability="staccato", selector="isolated_enemy")],
            default_kind="move", default_ability=None, default_target_selector="push_lane",
            raw_model_output="{}",
        )
        rendered = X.render_report_markdown(X.build_report(schema, "violin.md"))
        for token in ("noul(", "systemone", "{\"questions\"", "def ", "import "):
            self.assertNotIn(token, rendered)


class UnknownPilotFileTests(unittest.TestCase):
    def test_build_report_raises_for_a_pilot_with_no_hand_labeled_segments(self):
        schema = TranslatedSchema(
            pilot_file="house-violet.md",
            instrument="violet",
            rules=[_rule("r1", "cond?")],
            default_kind="move", default_ability=None, default_target_selector="push_lane",
            raw_model_output="{}",
        )
        with self.assertRaises(KeyError):
            X.build_report(schema, "house-violet.md")


if __name__ == "__main__":
    unittest.main()
