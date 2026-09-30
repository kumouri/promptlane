"""Per-instrument clauses must not leak across instruments (`docs/translator-guards-and-defaults-spec.md`
§10). One prompt drives drums, keytar and violin, and `compile.py` translates it once per instrument, so
prose like house-violet.md's rule 3 ("keytar only: ... chord", "violin only: ... staccato", "drums only:
... kick") has to come out as ONE ability rule per schema -- the instrument's own. Before this fix the
translator put all three into every schema (live qwen3.5:9b: 39 of 51 compiles, 76%), and a rule naming
another instrument's ability is a silent no-op in the sim (`src/sim/match.ts`: unknown ability -> return)
that pre-empts every rule below it.

No network: the model is either a canned reply (the drums schema the prompt-evolution smoke run
actually compiled, `runs/prompt-evolution-smoke-2026-09-30-genomes.json` on feat/prompt-evolution) or
`_literal_model`, which translates every scoped line it is SHOWN -- what the live model did 76% of the
time -- so the tests pin what the translator shows the model and what it keeps, not model skill."""
from __future__ import annotations

import json
import os
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import compile as C  # noqa: E402
import translator as T  # noqa: E402
from llm_backends import ScriptedBackend  # noqa: E402
from scenarios import ABILITIES  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
HOUSE_VIOLET = (REPO / "prompts" / "pilots" / "house-violet.md").read_text(encoding="utf-8").replace("\r\n", "\n")
HOUSE_GREEN = (REPO / "prompts" / "pilots" / "house-green.md").read_text(encoding="utf-8").replace("\r\n", "\n")


def _rule(rid, cond, kind, ability=None, selector=None):
    return {"id": rid, "condition": cond, "criteria": {"true": "yes", "false": "no"},
            "action": {"kind": kind, "ability": ability, "target_selector": selector}}


# The drums schema the smoke run compiled from house-violet.md (OpenRouter qwen/qwen3.5-9b), put back
# into the model's reply shape. Rules 3 and 4 are the leak; `keytar_ready` fired 2x in ~900 decisions.
SMOKE_RUN_DRUMS_REPLY = json.dumps({
    "rules": [
        _rule("low_hp_retreat", "is this bot's hp below 75?", "recall"),
        _rule("tower_no_wave_home", "is an enemy tower visible AND is the minion wave count zero?", "move", None, "home"),
        _rule("keytar_ready", "is the keytar ability cooldown zero AND is there an enemy target?", "ability", "chord", "nearest_enemy"),
        _rule("violin_ready", "is the violin ability cooldown zero AND is the target a low-hp bearbot?", "ability", "staccato", "nearest_enemy"),
        _rule("drums_ready", "is the drum ability cooldown zero AND is the target a low-hp bearbot?", "ability", "kick", "nearest_enemy"),
        _rule("attack_foe", "is there an enemy target?", "attack", None, "nearest_enemy"),
        _rule("attack_tower", "is an enemy tower visible?", "attack", None, "nearest_tower"),
        _rule("ride_wave", "is there no enemy target AND no enemy tower AND is the minion wave count one or more?", "move", None, "nearby_minion"),
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "home"},
})

_SCOPED_ABILITY_LINE = re.compile(r'(drums|keytar|violin) only:.*"ability":"(\w+)"')


def _literal_model(prompt: str) -> str:
    """A stand-in for the model that faithfully translates every '<instrument> only: ... "ability":"x"'
    line in the prose it is shown into a rule firing x -- the live failure's shape. It reads only the
    PROSE PILOT section, so whatever the translator hides from the model, it can't translate."""
    prose = prompt.split("PROSE PILOT:", 1)[1]
    rules = [_rule("low_hp", "is hp below 75?", "recall")]
    for inst, ability in _SCOPED_ABILITY_LINE.findall(prose):
        rules.append(_rule(f"{inst}_ready", f"is the {inst} ability cooldown zero and is there a foe?", "ability", ability, "nearest_enemy"))
    rules.append(_rule("attack_foe", "is there a foe?", "attack", None, "nearest_enemy"))
    return json.dumps({"rules": rules, "default_action": {"kind": "move", "ability": None, "target_selector": "home"}})


def _ability_rules(schema: T.TranslatedSchema) -> list[T.TranslatedRule]:
    return [n for n in T.collect_nodes(schema.root) if isinstance(n, T.TranslatedRule) and n.action_kind == "ability"]


def _translate(text, instrument, generate, name="prompts/pilots/house-violet.md"):
    primary, ultimate = ABILITIES[instrument]
    return T.translate_pilot(text, name, instrument, primary, ultimate, generate=generate)


class ReproTests(unittest.TestCase):
    """The failing tests this fix was written against."""

    def test_smoke_run_drums_reply_keeps_only_drums_ability(self):
        schema = _translate(HOUSE_VIOLET, "drums", lambda p: SMOKE_RUN_DRUMS_REPLY)
        ids = [r.id for r in schema.rules]
        self.assertNotIn("keytar_ready", ids)
        self.assertNotIn("violin_ready", ids)
        self.assertEqual([(r.id, r.action_ability) for r in _ability_rules(schema)], [("drums_ready", "kick")])
        notes = " ".join(schema.validation_notes)
        self.assertIn("keytar_ready", notes)
        self.assertIn("violin_ready", notes)

    def test_house_prose_compiles_one_own_ability_rule_per_instrument(self):
        for name, text in (("house-violet.md", HOUSE_VIOLET), ("house-green.md", HOUSE_GREEN)):
            for inst in C.INSTRUMENTS:
                with self.subTest(pilot=name, instrument=inst):
                    schema = _translate(text, inst, _literal_model, f"prompts/pilots/{name}")
                    self.assertEqual([r.action_ability for r in _ability_rules(schema)], [ABILITIES[inst][0]])

    def test_the_model_is_never_shown_another_instruments_clause(self):
        for inst in C.INSTRUMENTS:
            seen: list[str] = []
            _translate(HOUSE_VIOLET, inst, lambda p: (seen.append(p), _literal_model(p))[1])
            prose = seen[0].split("PROSE PILOT:", 1)[1]
            with self.subTest(instrument=inst):
                for other in set(C.INSTRUMENTS) - {inst}:
                    self.assertNotIn(f"{other} only:", prose)
                self.assertIn(f"{inst} only:", prose)


class ScopeToInstrumentTests(unittest.TestCase):
    def test_house_violet_sets_aside_the_other_two_lines(self):
        scoped = T.scope_to_instrument(HOUSE_VIOLET, "drums")
        self.assertEqual(len(scoped.set_aside), 2)
        self.assertTrue(scoped.set_aside[0].lstrip().startswith("3. keytar only:"))
        self.assertTrue(scoped.set_aside[1].lstrip().startswith("violin only:"))
        self.assertIn("drums only: cd is 0", scoped.text)
        # nothing else moves: rule 2 and rule 4 are still there, in order
        self.assertLess(scoped.text.index("2. tower is not null"), scoped.text.index("drums only:"))
        self.assertLess(scoped.text.index("drums only:"), scoped.text.index("4. foe is not null"))

    def test_marker_forms(self):
        prose = "\n".join([
            "- Keytar only: chord the nearest foe.",
            "* (violin only) staccato a bearbot under 100 hp.",
            "Violin and keytar only - stay behind the drums.",
            "2) DRUMS ONLY: kick anything in reach.",
            "keytar-only: glissando when two are bunched.",
            "Push the lane with the wave.",
        ])
        self.assertEqual(T.scope_to_instrument(prose, "drums").text.splitlines(),
                         ["2) DRUMS ONLY: kick anything in reach.", "Push the lane with the wave."])
        self.assertEqual(T.scope_to_instrument(prose, "violin").text.splitlines(), [
            "* (violin only) staccato a bearbot under 100 hp.",
            "Violin and keytar only - stay behind the drums.",
            "Push the lane with the wave.",
        ])

    def test_team_qwen_bold_bullets_scope_with_their_wrapped_lines(self):
        # team-qwen.md's per-instrument table: "- **drums**: ... Ability is "kick" ..." with each
        # bullet wrapped onto indented lines. Before this fix its drums schema got a staccato rule.
        text = (REPO / "prompts" / "pilots" / "team-qwen.md").read_text(encoding="utf-8").replace("\r\n", "\n")
        scoped = T.scope_to_instrument(text, "drums")
        self.assertEqual([c.split(":", 1)[0] for c in scoped.set_aside], ["- **keytar**", "- **violin**"])
        self.assertIn('Ability is "kick"', scoped.text)
        self.assertNotIn('"chord"', scoped.text)
        self.assertNotIn('"staccato"', scoped.text)
        self.assertIn("You will be handed an OBSERVATION", scoped.text)  # the shared tail survives

    def test_several_marked_clauses_on_one_line(self):
        prose = "Keytar only: chord it. Violin only: staccato it. Drums: kick it.\nPush the lane."
        self.assertEqual(T.scope_to_instrument(prose, "violin").text, "Violin only: staccato it.\nPush the lane.")
        self.assertEqual(T.scope_to_instrument(prose, "drums").set_aside, ("Keytar only: chord it.", "Violin only: staccato it."))

    def test_bare_marker_scopes_its_block_and_heading_scopes_its_section(self):
        bare = "Keytar only:\nChord the nearest.\nGlissando when bunched.\n\nPush the lane."
        self.assertEqual(T.scope_to_instrument(bare, "drums").text.strip(), "Push the lane.")
        headed = "## Keytar\nChord the nearest.\n\nStill keytar.\n## Violin only\nStaccato.\n# Shared\nPush."
        self.assertEqual(T.scope_to_instrument(headed, "drums").text, "# Shared\nPush.")
        self.assertEqual(T.scope_to_instrument(headed, "violin").text, "## Violin only\nStaccato.\n# Shared\nPush.")

    def test_unfinished_sentence_continues_onto_the_next_line(self):
        prose = "Keytar only: when two are bunched, glissando the densest, and\notherwise chord the nearest.\nAttack the nearest enemy."
        self.assertEqual(T.scope_to_instrument(prose, "drums").text, "Attack the nearest enemy.")

    def test_indented_continuation_goes_with_its_marker(self):
        prose = "keytar only: when an enemy is in range and chord is ready,\n    chord the nearest one.\nAttack the nearest enemy."
        scoped = T.scope_to_instrument(prose, "violin")
        self.assertEqual(scoped.text, "Attack the nearest enemy.")
        self.assertEqual(len(scoped.set_aside), 1)
        self.assertIn("chord the nearest one", scoped.set_aside[0])

    def test_unmarked_prose_is_untouched(self):
        # "only" without a following separator is ordinary English, not a scope marker; nor is a
        # sentence that merely mentions an instrument (the ally/enemy instrument is not observable,
        # so the prose may well talk about "our violin").
        for prose in ("Violin only gets one solo a fight, so save it.\nProtect our keytar when she's low.",
                      Path(REPO / "prompts" / "pilots" / "drums.md").read_text(encoding="utf-8")):
            scoped = T.scope_to_instrument(prose, "drums")
            self.assertEqual(scoped.text, prose)
            self.assertEqual(scoped.set_aside, ())


class InstrumentGuardTests(unittest.TestCase):
    def _parse(self, rules, instrument="drums", default=None):
        raw = {"rules": rules, "default_action": default or {"kind": "move", "ability": None, "target_selector": "push_lane"}}
        schema = T.parse_schema(raw, "p.md", instrument, "raw")
        primary, ultimate = ABILITIES[instrument]
        return T.enforce_instrument_scope(schema, instrument, primary, ultimate)

    def test_foreign_ability_rule_is_removed_with_a_note(self):
        schema = self._parse([_rule("chord_it", "is chord ready?", "ability", "chord", "nearest_enemy"),
                              _rule("attack", "is a foe visible?", "attack", None, "nearest_enemy")])
        self.assertEqual([r.id for r in schema.rules], ["attack"])
        self.assertTrue(any("chord_it" in n and "keytar" in n for n in schema.validation_notes), schema.validation_notes)

    def test_ability_rule_with_no_ability_is_removed(self):
        # live failure shape 2: three scoped clauses merged into one rule that can't name an ability
        schema = self._parse([_rule("ability_ready", "is the ability ready?", "ability", None, "nearest_enemy"),
                              _rule("attack", "is a foe visible?", "attack", None, "nearest_enemy")])
        self.assertEqual([r.id for r in schema.rules], ["attack"])
        self.assertTrue(any("ability_ready" in n for n in schema.validation_notes))

    def test_own_ability_is_kept_and_case_normalized(self):
        schema = self._parse([_rule("k", "is a foe in reach?", "ability", "Kick", "nearest_enemy"),
                              _rule("f", "are foes bunched?", "ability", "fill", "densest_cluster_enemy")])
        self.assertEqual([r.action_ability for r in schema.rules], ["kick", "fill"])
        self.assertEqual(schema.validation_notes, ())

    def test_rule_inside_a_guard_branch_is_checked_too(self):
        guard = {"type": "guard", "id": "can_win", "condition": "can this bot win the fight?", "criteria": {"true": "y", "false": "n"},
                 "then": {"nodes": [_rule("stac", "is a foe low?", "ability", "staccato", "lowest_hp_enemy"),
                                    _rule("hit", "is a foe visible?", "attack", None, "nearest_enemy")], "default_action": None},
                 "else": {"nodes": [], "default_action": {"kind": "recall", "ability": None, "target_selector": None}}}
        schema = self._parse([guard], instrument="keytar")
        g = schema.root.nodes[0]
        self.assertEqual([n.id for n in g.then.nodes], ["hit"])
        self.assertTrue(any("stac" in n and "violin" in n for n in schema.validation_notes))

    def test_condition_naming_another_instrument_is_flagged_not_removed(self):
        # "our violin" is legitimate intent (allies' instruments aren't observable, but the prose may
        # still mean it), so this is a warning for the entrant, not a strip.
        schema = self._parse([_rule("guard_violin", "is an enemy near our violin?", "attack", None, "threatened_ally_enemy")])
        self.assertEqual([r.id for r in schema.rules], ["guard_violin"])
        self.assertTrue(any("guard_violin" in n and "violin" in n for n in schema.validation_notes))

    def test_default_with_another_instruments_ability_is_invalid(self):
        with self.assertRaises(ValueError):
            self._parse([_rule("attack", "is a foe visible?", "attack", None, "nearest_enemy")],
                        default={"kind": "ability", "ability": "solo", "target_selector": None})

    def test_all_rules_leaked_is_invalid(self):
        with self.assertRaises(ValueError):
            self._parse([_rule("chord_it", "is chord ready?", "ability", "chord", "nearest_enemy")])


class ScopedOverrideTests(unittest.TestCase):
    def test_another_instruments_override_does_not_fail_this_compile(self):
        # the priority guard reads override language from the prose; a "no exceptions" clause scoped to
        # keytar must not demand a matching rule in the drums schema.
        prose = "keytar only: recall below a third of your health, no exceptions.\nAttack the nearest enemy bearbot."
        reply = json.dumps({"rules": [_rule("attack", "is an enemy bearbot visible?", "attack", None, "nearest_enemy")],
                            "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"}})
        schema = _translate(prose, "drums", lambda p: reply, "p.md")
        self.assertEqual([r.id for r in schema.rules], ["attack"])


class CompileViewTests(unittest.TestCase):
    def test_set_aside_lines_are_not_flagged_as_dropped_rules(self):
        backend = ScriptedBackend([_literal_model("PROSE PILOT:\n" + T.scope_to_instrument(HOUSE_VIOLET, "drums").text)])
        e = C.compile_prompt(HOUSE_VIOLET, "prompts/pilots/house-violet.md", ("drums",), backend)["instruments"]["drums"]
        self.assertTrue(e["ok"], e.get("error"))
        by_label = {}
        for d in e["dropped"]:
            by_label.setdefault(d["label"], []).append(d["text"])
        self.assertNotIn("only:", " ".join(by_label.get("unclaimed_rule", [])))
        self.assertEqual(len(by_label["other_instrument"]), 2)
        self.assertIn("Marked for another instrument", e["markdown"])
        self.assertIn("## Instrument scope", e["markdown"])


if __name__ == "__main__":
    unittest.main()
