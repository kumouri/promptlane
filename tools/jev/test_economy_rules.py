"""Tests for tools/jev/economy_rules.py: the ruleset-file readers and `normalize_build`."""
from __future__ import annotations

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import economy_rules as E  # noqa: E402


class EconomyFileTests(unittest.TestCase):
    def test_eco_2_changes_only_gold(self):
        # The income tuning pass (docs/economy-spec.md §13.1) left everything but gold alone.
        eco1 = E.load_economy("eco-1")
        eco2 = E.load_economy("eco-2")
        self.assertEqual(eco2["name"], "eco-2")
        for key in set(eco1) | set(eco2):
            if key not in ("name", "gold"):
                self.assertEqual(eco1.get(key), eco2.get(key), key)
        self.assertEqual(eco1["gold"]["death"], eco2["gold"]["death"])
        self.assertEqual(eco1["gold"]["pools"], eco2["gold"]["pools"])

    def test_the_default_is_eco_3_with_eco_2s_items_slots_and_default_builds(self):
        # The stale-pointer fix (docs/late-game-economy-spec.md §7.4) moved the default from eco-2.json
        # to the shipped eco-3; every pre-recipe output stays the same because these blocks are equal.
        self.assertEqual(E.DEFAULT_ECONOMY, "eco-3")
        eco2, eco3 = E.load_economy("eco-2"), E.load_economy()
        self.assertEqual(eco3["name"], "eco-3")
        self.assertEqual(eco3["items"], eco2["items"])
        self.assertEqual(list(eco3["items"]), list(eco2["items"]))  # same order: the prompt lists them in it
        self.assertEqual(eco3["shop"], eco2["shop"])
        self.assertEqual(eco3["defaultBuilds"], eco2["defaultBuilds"])
        self.assertIs(E.load_economy(None), E.load_economy("eco-3"))

    def test_every_ruleset_file_is_known_and_an_unknown_name_says_which_exist(self):
        self.assertEqual(E.known_economies(), tuple(sorted(p.stem for p in E.ECONOMY_DIR.glob("*.json"))))
        for name in ("eco-1", "eco-2", "eco-3", "eco-3-late"):
            self.assertIn(name, E.known_economies())
            self.assertEqual(E.load_economy(name)["name"], name)
        with self.assertRaises(ValueError) as cm:
            E.load_economy("eco-99")
        self.assertIn("eco-99", str(cm.exception))
        self.assertIn("eco-3-late", str(cm.exception))
        with self.assertRaises(ValueError):
            E.load_economy("../eco-3")

    def test_reads_the_constants_file(self):
        self.assertEqual(set(E.items()), {"amp", "road-case", "bass-strings", "metronome"})
        self.assertEqual(E.slots(), 3)
        self.assertEqual(E.item_name("road-case"), "Road Case")
        self.assertEqual(E.item_name("mystery"), "mystery")

    def test_default_builds_are_valid_builds(self):
        for inst in ("drums", "keytar", "violin"):
            build = E.default_build(inst)
            self.assertLessEqual(len(build), E.slots())
            self.assertEqual(E.normalize_build(list(build), inst), (build, ()))
        self.assertEqual(E.default_build("keytar"), ("metronome", "amp", "road-case"))

    def test_item_lines_cover_every_item_from_the_json(self):
        lines = E.item_lines()
        self.assertEqual(len(lines), len(E.items()))
        for (key, it), line in zip(E.items().items(), lines):
            for part in (key, it["name"], str(it["cost"]), it["gives"], it["givesUp"]):
                self.assertIn(part, line)

    def test_format_build(self):
        self.assertEqual(E.format_build(("amp", "bass-strings")), "Amp → Bass Strings")


class NormalizeBuildTests(unittest.TestCase):
    def build(self, raw, inst="keytar"):
        return E.normalize_build(raw, inst)

    def test_none_means_the_prose_named_nothing(self):
        self.assertEqual(self.build(None), (None, ()))

    def test_keys_in_order(self):
        self.assertEqual(self.build(["amp", "bass-strings", "road-case"]), (("amp", "bass-strings", "road-case"), ()))

    def test_display_names_and_case_and_the(self):
        build, notes = self.build(["The AMP", "bass strings", "ROAD CASE"])
        self.assertEqual(build, ("amp", "bass-strings", "road-case"))
        self.assertEqual(notes, ())

    def test_punctuation_spacing_and_plurals(self):
        build, notes = self.build(["Amps!", " road_case ", "Bass-String"])
        self.assertEqual((build, notes), (("amp", "road-case", "bass-strings"), ()))
        self.assertEqual(self.build(["roadcase"])[0], ("road-case",))
        self.assertEqual(self.build(["metronomes"])[0], ("metronome",))

    def test_unknown_item_is_dropped_with_a_note(self):
        build, notes = self.build(["amp", "Tip Jar", "metronome"])
        self.assertEqual(build, ("amp", "metronome"))
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0].startswith(E.NOTE_PREFIX))
        self.assertIn("Tip Jar", notes[0])

    def test_duplicate_is_dropped_with_a_note(self):
        build, notes = self.build(["amp", "Amp", "road-case"])
        self.assertEqual(build, ("amp", "road-case"))
        self.assertEqual(len(notes), 1)
        self.assertIn("Amp", notes[0])

    def test_longer_than_the_slot_count_is_truncated_with_a_note(self):
        build, notes = self.build(["amp", "road-case", "bass-strings", "metronome"])
        self.assertEqual(build, ("amp", "road-case", "bass-strings"))
        self.assertEqual(len(notes), 1)
        self.assertIn("Metronome", notes[0])

    def test_duplicates_do_not_count_toward_the_slot_limit(self):
        build, notes = self.build(["amp", "amp", "road-case", "bass-strings"])
        self.assertEqual(build, ("amp", "road-case", "bass-strings"))
        self.assertEqual(len(notes), 1)

    def test_empty_after_cleaning_is_none(self):
        build, notes = self.build(["Tip Jar", "banana"], "drums")
        self.assertIsNone(build)
        self.assertEqual(len(notes), 3)  # two drops + "default build applies"
        self.assertIn("drums default", notes[-1])

    def test_empty_list_is_none_without_a_note(self):
        self.assertEqual(self.build([]), (None, ()))

    def test_a_separated_string_is_tolerated(self):
        self.assertEqual(self.build("Amp, then Bass Strings -> road case")[0], ("amp", "bass-strings", "road-case"))

    def test_non_string_entries_and_non_lists(self):
        build, notes = self.build(["amp", 7, None])
        self.assertEqual(build, ("amp",))
        self.assertEqual(len(notes), 2)
        build, notes = self.build({"amp": 1})
        self.assertIsNone(build)
        self.assertEqual(len(notes), 1)

    def test_follows_a_changed_constants_file(self):
        # the validator reads the JSON, not a copy: a patched economy changes what is accepted
        economy = json.loads(json.dumps(E.load_economy()))
        economy["shop"]["slots"] = 1
        with mock.patch.object(E, "load_economy", return_value=economy):
            build, notes = E.normalize_build(["amp", "road-case"], "keytar")
        self.assertEqual(build, ("amp",))
        self.assertEqual(len(notes), 1)


LATE = "eco-3-late"
CASES = json.loads((E.ECONOMY_DIR.parents[1] / "tools" / "match" / "build_expansion_cases.json").read_text(encoding="utf-8"))


class RecipeFactsTests(unittest.TestCase):
    def test_has_recipes_only_where_an_item_is_made_from_others(self):
        for name in ("eco-1", "eco-2", "eco-3", "respawn-1"):
            self.assertFalse(E.has_recipes(name), name)
        self.assertFalse(E.has_recipes())
        self.assertTrue(E.has_recipes(LATE))

    def test_tier_parts_and_total_cost(self):
        self.assertEqual((E.item_tier("amp", LATE), E.item_from("amp", LATE), E.total_cost("amp", LATE)), (1, (), 350))
        self.assertEqual((E.item_tier("backline", LATE), E.item_from("backline", LATE), E.total_cost("backline", LATE)),
                         (2, ("road-case", "bass-strings"), 900))
        self.assertEqual((E.item_tier("wall-of-sound", LATE), E.item_from("wall-of-sound", LATE), E.total_cost("wall-of-sound", LATE)),
                         (3, ("backline",), 1300))
        self.assertEqual(E.total_cost("arpeggiator", LATE), 1350)  # spec §2.2's table
        self.assertEqual(E.total_cost("headliner", LATE), 1300)
        self.assertEqual(E.max_plan_steps(LATE), 10)
        self.assertIsNone(E.max_plan_steps())

    def test_lookups_by_key_reach_any_ruleset_file_and_never_raise(self):
        # describe_observation names a held Backline even when no ruleset is selected
        self.assertEqual(E.item_name("backline"), "Backline")
        self.assertEqual(E.item_name("wall-of-sound"), "Wall of Sound")
        self.assertEqual(E.item_tier("arpeggiator"), 3)
        self.assertEqual(E.item_from("click-track"), ("metronome", "amp"))
        for bad in ("mystery", "", None, 7):
            self.assertEqual(E.item_tier(bad), 1)
            self.assertEqual(E.item_from(bad), ())
        self.assertEqual(E.item_name("mystery"), "mystery")
        self.assertEqual(E.item_name("amp", "no-such-economy"), "amp")
        with self.assertRaises(KeyError):
            E.total_cost("mystery")

    def test_item_lines_group_recipes_by_tier(self):
        lines = E.item_lines(LATE)
        text = "\n".join(lines)
        for key, it in E.items(LATE).items():
            self.assertIn(f'"{key}" -- {it["name"]}', text)
            self.assertIn(it["gives"], text)
        self.assertIn('  "backline" -- Backline, recipe: Road Case + Bass Strings + 250 gold (900 in all); gives: ', text)
        self.assertIn('  "wall-of-sound" -- Wall of Sound, upgrade of Backline + 400 gold (1300 in all); gives: ', text)
        self.assertIn('  "amp" -- Amp, 350 gold; gives: attack damage +35%; gives up: max hp -15%', lines)
        tiers = [i for i, line in enumerate(lines) if line.startswith("  Tier ")]
        self.assertEqual(len(tiers), 3)
        self.assertLess(text.index('"metronome"'), text.index("Tier 2"))
        self.assertLess(text.index('"tour-bus"'), text.index("Tier 3"))

    def test_rulesets_without_recipes_keep_the_pre_recipe_lines_and_block(self):
        self.assertEqual(E.item_lines(), E.item_lines("eco-2"))
        self.assertEqual(E.item_lines(), E.item_lines("eco-1"))
        block = E.items_prompt_block()
        self.assertEqual(block, E.items_prompt_block("eco-2"))
        expected = (
            "ITEMS a bearbot can buy at its base (at most 3 per bearbot, bought in order):\n"
            + "\n".join(E.item_lines())
            + '\nIf the prose names items or a shopping order, emit "build" in that order; otherwise omit it. "build" is\n'
            'a top-level key next to "rules", a list of item keys from the list above, e.g. "build": ["amp", "road-case"].'
        )
        self.assertEqual(block, expected)
        self.assertNotIn("Tier", block)

    def test_the_recipe_block_states_the_slot_rule_and_the_any_tier_instruction(self):
        block = E.items_prompt_block(LATE)
        self.assertIn("(3 slots; combining two items into a recipe frees a slot; bought in order)", block)
        self.assertIn('emit "build" as the items in the order the prose wants them,\nany tier; parts are filled in for you', block)
        self.assertIn('"build": ["wall-of-sound"] buys Road Case then Bass Strings then Backline then Wall of Sound', block)


class ExpansionFixtureTests(unittest.TestCase):
    """tools/match/build_expansion_cases.json: the SAME cases test_late_game.mjs runs against the TS
    `expandBuild`, so the two mirrors cannot drift."""

    def test_the_fixture_names_the_late_ruleset(self):
        self.assertEqual(CASES["ruleset"], LATE)
        self.assertGreaterEqual(len(CASES["cases"]), 10)

    def test_every_case(self):
        for case in CASES["cases"]:
            with self.subTest(case=case["name"]):
                plan, notes = E.expand_build(case["declared"], case["instrument"], CASES["ruleset"], case.get("planSteps"))
                self.assertEqual(list(plan), case["plan"])
                self.assertEqual([list(n) for n in notes], case["notes"])

    def test_the_compiled_build_re_expands_to_the_same_plan(self):
        # normalize_build keeps what was declared (less unknowns and skipped repeats); the match
        # expands it again at start, and must get the plan the validator described.
        for case in CASES["cases"]:
            if "planSteps" in case:
                continue
            with self.subTest(case=case["name"]):
                build, _notes = E.normalize_build(case["declared"], case["instrument"], LATE)
                again, _ = E.expand_build(build or (), case["instrument"], LATE)
                self.assertEqual(list(again), case["plan"])


class RecipeNormalizeBuildTests(unittest.TestCase):
    def build(self, raw, inst="drums"):
        return E.normalize_build(raw, inst, LATE)

    def test_names_of_any_tier_fold_to_keys(self):
        build, notes = self.build(["Wall of Sound", "the click track", "Fuzz Pedals", "Tour Bus", "Arpeggiators", "feedback"])
        self.assertEqual(build, ("wall-of-sound", "click-track", "fuzz-pedal", "tour-bus", "arpeggiator", "feedback"))
        for text, key in (("Bass Strings", "bass-strings"), ("wall-of-sound", "wall-of-sound"), ("Click-Tracks", "click-track"),
                          ("HEADLINER", "headliner"), ("backlines", "backline"), ("the Road Case", "road-case")):
            self.assertEqual(E.resolve_item(text, LATE), key, text)
        self.assertIsNone(E.resolve_item("Backline", "eco-3"), "no recipes in eco-3")

    def test_a_target_keeps_the_declared_list_and_says_what_was_added(self):
        build, notes = self.build(["wall-of-sound", "arpeggiator"])
        self.assertEqual(build, ("wall-of-sound", "arpeggiator"))
        self.assertEqual(notes, (
            "build: Wall of Sound needs Backline, made from Road Case and Bass Strings: added them to the shopping list.",
            "build: Arpeggiator needs Click Track, made from Metronome and Amp: added them to the shopping list.",
        ))

    def test_explicit_steps_are_kept_without_notes(self):
        self.assertEqual(self.build(["Amp", "Bass Strings", "Road Case", "Fuzz Pedal"], "violin"),
                         (("amp", "bass-strings", "road-case", "fuzz-pedal"), ()))

    def test_partly_filled_parts_name_what_was_added(self):
        build, notes = self.build(["amp", "fuzz-pedal"], "keytar")
        self.assertEqual(build, ("amp", "fuzz-pedal"))
        self.assertEqual(notes, ("build: Fuzz Pedal needs Amp and Bass Strings: added Bass Strings to the shopping list.",))

    def test_no_slot_and_parts_missing(self):
        build, notes = self.build(["amp", "road-case", "metronome", "bass-strings", "fuzz-pedal"], "violin")
        self.assertEqual(build, ("amp", "road-case", "metronome", "bass-strings", "fuzz-pedal"))
        self.assertEqual(notes, (
            "build: Bass Strings dropped: no free slot -- combine two items first.",
            "build: Fuzz Pedal dropped: its parts (Amp and Bass Strings) aren't all held at that point in the list.",
        ))
        _b, notes = self.build(["amp", "metronome", "road-case", "wall-of-sound"])
        self.assertIn("build: Wall of Sound dropped: its part (Backline) isn't held at that point in the list.", notes)

    def test_a_repeat_of_a_held_item_is_dropped_but_a_consumed_one_is_not(self):
        build, notes = self.build(["amp", "Amp", "fuzz-pedal", "amp"], "keytar")
        self.assertEqual(build, ("amp", "fuzz-pedal", "amp"))
        self.assertEqual(notes[0], "build: dropped a repeat of Amp from the shopping list -- you can't hold two of the same item at once.")
        self.assertEqual(len(notes), 2)

    def test_unknown_items_are_dropped_with_this_rulesets_names(self):
        build, notes = self.build(["Tip Jar", "backline"])
        self.assertEqual(build, ("backline",))
        self.assertTrue(notes[0].startswith("build: dropped 'Tip Jar' from the shopping list -- it is not an item in this game (Amp, "))
        self.assertIn("Backline", notes[0])
        self.assertIn("Headliner", notes[0])

    def test_nothing_usable_is_none_and_the_default_applies(self):
        build, notes = self.build(["Tip Jar", "banana"])
        self.assertIsNone(build)
        self.assertEqual(len(notes), 3)
        self.assertEqual(notes[-1], "build: nothing usable was left of the shopping list, so the drums default build applies.")
        self.assertEqual(self.build([]), (None, ()))
        self.assertEqual(self.build(None), (None, ()))
        self.assertEqual(len(self.build({"x": 1})[1]), 1)

    def test_the_cut_note(self):
        economy = json.loads(json.dumps(E.load_economy(LATE)))
        economy["shop"]["planSteps"] = 4
        with mock.patch.object(E, "load_economy", return_value=economy):
            build, notes = E.normalize_build(["wall-of-sound", "arpeggiator"], "drums", LATE)
        self.assertEqual(build, ("wall-of-sound", "arpeggiator"))
        self.assertEqual(notes[-1], "build: the shopping list is longer than the 4 steps anyone can buy in a match; kept the first 4.")

    def test_a_separated_string_is_tolerated(self):
        self.assertEqual(self.build("Backline, then Wall of Sound")[0], ("backline", "wall-of-sound"))

    def test_rulesets_without_recipes_validate_exactly_as_before(self):
        for raw in (["amp", "Tip Jar", "amp", "road-case", "metronome", "bass-strings"], ["backline"], ["Amps!"], []):
            self.assertEqual(E.normalize_build(raw, "keytar", "eco-2"), E.normalize_build(raw, "keytar"))
            self.assertEqual(E.normalize_build(raw, "keytar", "eco-3"), E.normalize_build(raw, "keytar"))
        self.assertEqual(E.normalize_build(["amp", "amp"], "keytar")[1],
                         ("build: dropped a repeat of Amp from the shopping list -- an item can only be bought once.",))

if __name__ == "__main__":
    unittest.main()
