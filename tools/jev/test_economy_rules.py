"""Tests for tools/jev/economy_rules.py: the eco-1.json readers and `normalize_build`."""
from __future__ import annotations

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import economy_rules as E  # noqa: E402


class EconomyFileTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
