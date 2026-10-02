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


class BuildReportGuardTests(unittest.TestCase):
    """Exercises build_report against a violin-shaped schema WITH a guard node, using violin.md's
    real segments -- the guard's condition should trace back to "you only take fights you can win in
    one phrase" (an open_strategy segment in expressibility.py, since the flat translator can't take
    it -- the whole reason class 1 needs a guard, spec §2.1)."""

    def setUp(self):
        from translator import Cascade, GuardNode

        opener = _rule("staccato_opener", "is staccato off cooldown and a target in range?", kind="ability", ability="staccato", selector="isolated_enemy")
        guard = GuardNode(
            id="can_win_fight",
            condition="can this bearbot win the fight it is in or about to enter, by itself, right now?",
            criteria_true="yes, a winnable fight is present",
            criteria_false="no, nothing winnable is present",
            then=Cascade(nodes=(opener,), default=X.Action("move", None, "isolated_enemy")),
            else_=Cascade(nodes=(), default=X.Action("move", None, "isolated_enemy")),
        )
        recall = _rule("recall_low_hp", "is hp below a quarter of max?", kind="recall", selector="none")
        self.schema = TranslatedSchema(
            pilot_file="violin.md",
            instrument="violin",
            rules=(recall, guard),  # a mixed root: constructing directly still works via root=None
            default_kind="move", default_ability=None, default_target_selector="push_lane",
            raw_model_output="{}",
        )
        self.report = X.build_report(self.schema, "violin.md")

    def test_guard_traces_to_the_class_one_sentence(self):
        self.assertEqual(len(self.report.guards), 1)
        gp = self.report.guards[0]
        self.assertEqual(gp.label, "2")
        self.assertTrue(any("one\nphrase" in s or "one phrase" in s for s in gp.source_segments))

    def test_nested_rule_gets_a_lettered_position_and_branch_context(self):
        nested = next(rp for rp in self.report.rules if rp.rule.id == "staccato_opener")
        self.assertEqual(nested.position, "2a")
        self.assertIn("if guard 2 = yes", nested.order_why)

    def test_root_rule_position_is_unaffected_by_the_guard(self):
        root_rule = next(rp for rp in self.report.rules if rp.rule.id == "recall_low_hp")
        self.assertEqual(root_rule.position, "1")

    def test_render_includes_guard_subsection_with_if_yes_if_no(self):
        rendered = X.render_report_markdown(self.report)
        self.assertIn("can_win_fight", rendered)
        self.assertIn("If yes →", rendered)
        self.assertIn("If no →", rendered)
        self.assertIn("| # | Branch | Condition | Then |", rendered)


class BandstandRenderingTests(unittest.TestCase):
    def test_move_bandstand_renders_as_move_to_the_bandstand(self):
        schema = TranslatedSchema(
            pilot_file="drums.md",
            instrument="drums",
            rules=[_rule("take_stand", "is the Bandstand open?", kind="move", selector="bandstand")],
            default_kind="move", default_ability=None, default_target_selector="bandstand",
            raw_model_output="{}",
        )
        rendered = X.render_report_markdown(X.build_report(schema, "drums.md"))
        self.assertIn("| 1 | — | is the Bandstand open? | **move to the Bandstand**", rendered)  # quick view
        self.assertIn("- **Then:** **move to the Bandstand**", rendered)  # rule detail
        self.assertIn("root default)* | **move to the Bandstand**", rendered)
        self.assertIn("up the lane instead", rendered)  # the push_lane fallback is visible to the entrant


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


class ShoppingListLineTests(unittest.TestCase):
    def _schema(self, instrument, build=None, notes=()):
        return TranslatedSchema(
            pilot_file="pilot.md", instrument=instrument, raw_model_output="{}",
            rules=[_rule("engage", "is an enemy near?")],
            default_kind="move", default_ability=None, default_target_selector="push_lane",
            validation_notes=notes, build=build,
        )

    def _render(self, schema):
        return X.render_report_markdown(X.build_report(schema, "pilot.md", segments=[("rule", "Engage.")], labels="auto"))

    def test_line_from_the_prose(self):
        self.assertEqual(X.shopping_list_line(self._schema("violin", ("amp", "bass-strings", "road-case"))),
                         "Shopping list: Amp → Bass Strings → Road Case (from your prose)")

    def test_line_for_the_default(self):
        self.assertEqual(X.shopping_list_line(self._schema("keytar")),
                         "Shopping list: Metronome → Amp → Road Case (default for keytar — your prose names no items)")

    def test_line_is_in_the_report_before_rule_detail(self):
        text = self._render(self._schema("drums", ("road-case",)))
        self.assertIn("\nShopping list: Road Case (from your prose)\n", text)
        self.assertLess(text.index("Shopping list:"), text.index("## Rule detail"))

    def test_build_notes_get_their_own_section(self):
        note = "build: dropped 'Tip Jar' from the shopping list -- it is not an item in this game (Amp)."
        text = self._render(self._schema("keytar", ("amp",), (note,)))
        self.assertIn("## Shopping list — what was changed", text)
        self.assertIn(f"- {note}", text)
        self.assertNotIn("Automatic priority fixes", text)

    def test_negation_notes_get_their_own_section(self):
        note = 'negation: removed rule shop_no_enemy ("is there any enemy in sight?") -- your prose says "no enemy is in sight".'
        text = self._render(self._schema("keytar", ("amp",), (note,)))
        self.assertIn("## Negations — what was removed", text)
        self.assertIn(f"- {note}", text)
        self.assertNotIn("Automatic priority fixes", text)

    def test_identity_notes_get_their_own_section(self):
        note = ("identity: removed rule shop_order_violin (\"is this bot's instrument 'Violin'?\") -- it asks only about this "
                "bearbot's own instrument, which never changes during a match.")
        text = self._render(self._schema("violin", ("amp",), (note,)))
        self.assertIn("## Rules about which bearbot this is — what was removed", text)
        self.assertIn(f"- {note}", text)
        self.assertNotIn("Automatic priority fixes", text)

    def test_unfinished_guard_notes_get_their_own_section(self):
        note = ('unfinished guard: removed guard_shop_priority ("can this bot afford its next item right now?") and the 2 node(s) '
                "in its branches -- it had \"then\" and \"else\" branches but no \"type\": \"guard\" and no action.")
        text = self._render(self._schema("keytar", ("amp",), (note,)))
        self.assertIn("## Unfinished guards — what was removed", text)
        self.assertIn(f"- {note}", text)
        self.assertNotIn("Automatic priority fixes", text)

    def test_guard_scope_notes_get_their_own_section(self):
        note = ('guard scope: removed the guard guard_shop_or_fight ("can this bot afford its next item?"). A guard sends every '
                "decision into one of its two branches, and here the 8 node(s) after it (recall) were never checked.")
        text = self._render(self._schema("keytar", ("amp",), (note,)))
        self.assertIn("## Guards over rules your prose does not put under them — what was removed", text)
        self.assertIn(f"- {note}", text)
        self.assertNotIn("Automatic priority fixes", text)


class RecipeShoppingListLineTests(unittest.TestCase):
    """Under a ruleset with recipes the line is the plan the match will buy, parts filled in, with
    tier-2/3 items in bold (docs/late-game-economy-spec.md §7.4)."""

    def _schema(self, instrument, build=None, economy="eco-3-late"):
        return TranslatedSchema(
            pilot_file="pilot.md", instrument=instrument, raw_model_output="",
            rules=(_rule("r1", "is an enemy near?"),), default_kind="move", default_ability=None, default_target_selector="push_lane",
            build=build, economy=economy,
        )

    def test_a_target_shows_the_expanded_plan(self):
        self.assertEqual(
            X.shopping_list_line(self._schema("drums", ("wall-of-sound", "arpeggiator"))),
            "Shopping list: Road Case → Bass Strings → **Backline** → **Wall of Sound** → Metronome → Amp → **Click Track** → "
            "**Arpeggiator** (from your prose; parts filled in)",
        )

    def test_explicit_steps_need_no_filling_in(self):
        self.assertEqual(
            X.shopping_list_line(self._schema("violin", ("amp", "bass-strings", "road-case", "fuzz-pedal"))),
            "Shopping list: Amp → Bass Strings → Road Case → **Fuzz Pedal** (from your prose)",
        )

    def test_the_default_ladder(self):
        self.assertEqual(
            X.shopping_list_line(self._schema("drums")),
            "Shopping list: Road Case → Bass Strings → Metronome → **Backline** → Amp → **Wall of Sound** → **Click Track** → "
            "**Arpeggiator** (default for drums — your prose names no items)",
        )

    def test_rulesets_without_recipes_are_unchanged(self):
        for build in (None, ("amp", "bass-strings")):
            for inst in ("drums", "violin"):
                self.assertEqual(X.shopping_list_line(self._schema(inst, build, "eco-2")), X.shopping_list_line(self._schema(inst, build, None)))
        self.assertEqual(X.shopping_list_line(self._schema("violin", ("amp", "bass-strings"), None)),
                         "Shopping list: Amp → Bass Strings (from your prose)")

    def test_the_report_carries_the_line(self):
        md = X.render_report_markdown(X.build_report(self._schema("drums", ("backline",)), "pilot.md",
                                                     segments=[("rule", "Engage.")], labels="auto"))
        self.assertIn("Shopping list: Road Case → Bass Strings → **Backline** (from your prose; parts filled in)", md)

if __name__ == "__main__":
    unittest.main()
