"""Tests for tools/jev/compile.py -- the one code path behind the three entrant doors. No network:
the model is `llm_backends.ScriptedBackend`, or a schema recovered from a checked-in run.

The load-bearing test is `ReproducesCheckedInRunsTests`: each checked-in transparency run
(`runs/jev-translator-transparency-*-2026-09-23.md`) is parsed back into the schema it rendered, fed
through `compile.py` exactly as an entrant's prose would be, and must come out byte-for-byte equal.
That pins door A (and so doors B and C, which call it) to the view `docs/translator-transparency.md`
documents. Translation itself is sampled, so a *live* compile can't be byte-compared -- see
`docs/entrant-compile-preview.md` for the live runs and how they compare."""
from __future__ import annotations

import io
import json
import os
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import compile as C  # noqa: E402
from llm_backends import CALL_TIMEOUT_SEC, ScriptedBackend  # noqa: E402
from translator import TARGET_SELECTORS, TranslatedRule, TranslatedSchema  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RUNS = REPO / "runs"
PILOTS = REPO / "prompts" / "pilots"

CHECKED_IN = {
    "drums": RUNS / "jev-translator-transparency-drums-2026-09-23.md",
    "keytar": RUNS / "jev-translator-transparency-keytar-2026-09-23.md",
    "violin": RUNS / "jev-translator-transparency-violin-2026-09-23.md",
}
KEYTAR_BAD = RUNS / "jev-translator-transparency-keytar-ORIGINAL-bad-compile-2026-09-23.md"

# The checked-in runs predate the shopping-list line, so they are compared without it; the line
# itself is tested in test_transparency.py and below.
_SHOPPING = re.compile(r"\nShopping list: [^\n]*\n")


def _without_shopping_line(md: str) -> str:
    return _SHOPPING.sub("", md, count=1)


_SELECTOR_BY_DESC = {v: k for k, v in TARGET_SELECTORS.items()}


def _parse_action(desc: str) -> tuple[str, str | None, str | None]:
    desc = desc.strip()
    if desc == "**recall** home":
        return "recall", None, "none"
    if desc == "**hold** (do nothing this tick)":
        return "hold", None, "none"
    base, _, target = desc.partition(" targeting: ")
    selector = _SELECTOR_BY_DESC[target] if target else None
    m = re.fullmatch(r"use \*\*(.+?)\*\*", base)
    if m:
        return "ability", m.group(1), selector
    m = re.fullmatch(r"\*\*(\w+)\*\*", base)
    return m.group(1), None, selector


def schema_from_report(md: str, instrument: str) -> TranslatedSchema:
    """Recovers the schema a checked-in transparency report rendered -- every field the report
    prints is enough to rebuild it (the raw schema JSON for these runs was not kept)."""
    rules = []
    for block in re.split(r"\n(?=### \d+\. )", md.split("## Rule detail", 1)[1].split("\n## ", 1)[0]):
        m = re.match(r"### \d+\. `(.+?)` — (.*)\n", block.strip() + "\n")
        if not m:
            continue
        then = re.search(r"^- \*\*Then:\*\* (.*)$", block, re.M).group(1)
        ask = re.search(r"^- \*\*What Jev is asked:\*\* .*? -- yes means (.*); no means (.*)\.$", block, re.M)
        kind, ability, selector = _parse_action(then)
        rules.append(TranslatedRule(m.group(1), m.group(2), ask.group(1), ask.group(2), kind, ability, selector))
    default = re.search(r"^\| — \| — \| \*\(none of the above.*?\)\* \| (.*) \|$", md, re.M).group(1)
    dkind, dability, dselector = _parse_action(default)
    notes = ()
    if "## Automatic priority fixes applied to this schema" in md:
        section = md.split("## Automatic priority fixes applied to this schema", 1)[1].split("\n## ", 1)[0]
        notes = tuple(line[2:] for line in section.strip().splitlines() if line.startswith("- "))
    return TranslatedSchema(
        pilot_file=f"{instrument}.md", instrument=instrument, rules=rules, default_kind=dkind,
        default_ability=dability, default_target_selector=dselector, raw_model_output="", validation_notes=notes,
    )


class ReproducesCheckedInRunsTests(unittest.TestCase):
    def _check(self, instrument: str, report_path: Path):
        expected = report_path.read_text(encoding="utf-8")
        schema = schema_from_report(expected, instrument)
        text = (PILOTS / f"{instrument}.md").read_text(encoding="utf-8")
        entry = C.compile_instrument(text, f"prompts/pilots/{instrument}.md", instrument, backend=None, schema=schema)
        self.assertTrue(entry["ok"], entry.get("error"))
        self.assertEqual(entry["labels"], "hand")
        self.assertIn(f"Shopping list: ", entry["markdown"])
        self.assertIn(f"(default for {instrument} — your prose names no items)", entry["markdown"])
        self.assertEqual(_without_shopping_line(entry["markdown"]), expected)

    def test_drums(self):
        self._check("drums", CHECKED_IN["drums"])

    def test_keytar(self):
        self._check("keytar", CHECKED_IN["keytar"])

    def test_violin(self):
        self._check("violin", CHECKED_IN["violin"])

    def test_keytar_original_bad_compile_flags_the_chord_rule(self):
        self._check("keytar", KEYTAR_BAD)
        md = KEYTAR_BAD.read_text(encoding="utf-8")
        self.assertIn("⚠ no strong match", md)

    def test_saved_schema_json_round_trips_through_cli(self):
        schema = schema_from_report(CHECKED_IN["drums"].read_text(encoding="utf-8"), "drums")
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "drums.json"
            f.write_text(json.dumps(C.schema_to_dict(schema)), encoding="utf-8")
            out = Path(d) / "out.md"
            rc = C.main([str(PILOTS / "drums.md"), "--schema-in", str(f), "--out", str(out)])
            self.assertEqual(rc, 0)
            rendered = out.read_text(encoding="utf-8")
        self.assertTrue(_without_shopping_line(rendered).endswith(CHECKED_IN["drums"].read_text(encoding="utf-8")))
        self.assertIn("saved schema (no model call)", rendered)


def _reply(instrument: str) -> str:
    primary, ultimate = C.ABILITIES[instrument]
    return json.dumps({
        "rules": [
            {"id": "low_hp_recall", "condition": "is this bot's hp below a quarter of its max?",
             "criteria": {"true": "hp < 25% max", "false": "hp >= 25% max"},
             "action": {"kind": "recall", "ability": None, "target_selector": "none"}},
            {"id": "enemy_close_primary", "condition": f"is an enemy bearbot close enough to {primary}?",
             "criteria": {"true": "enemy in range", "false": "no enemy in range"},
             "action": {"kind": "ability", "ability": primary, "target_selector": "nearest_enemy"}},
        ],
        "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
    })


ENTRANT_PROSE = """You are a bearbot who hates standing still. Whatever you hold, you play it loud.

Recall when your health drops below a quarter, no exceptions. Use your first ability the instant an
enemy bearbot is close enough to hit. Guard the ally with the lowest health when an enemy is near them.

Push the lane with your minions. Be the song everyone remembers.

You will be handed an OBSERVATION as JSON. Reply with exactly one JSON action object and nothing else:

{"kind": "move"|"attack"|"ability"|"recall"|"hold", "target"?: <entity id or {"x","y"}>, "ability"?: <ability name>}

No commentary, no explanation, no markdown — just the object.
"""


class EntrantProseTests(unittest.TestCase):
    def test_compiles_all_three_instruments_with_auto_labels(self):
        replies = [_reply(i) for i in C.INSTRUMENTS]
        backend = ScriptedBackend(replies)
        result = C.compile_prompt(ENTRANT_PROSE, "entrants/alice/pilot.md", C.INSTRUMENTS, backend)
        self.assertEqual(list(result["instruments"]), list(C.INSTRUMENTS))
        for inst, e in result["instruments"].items():
            self.assertTrue(e["ok"], e.get("error"))
            self.assertEqual(e["labels"], "auto")
            self.assertIn("automatically, by a word list", e["markdown"])
            self.assertIn(f"`entrants/alice/pilot.md` -> Jev decision schema ({inst})", e["markdown"])
        md = C.full_markdown(result, backend.describe(), backend.usage.as_dict())
        self.assertIn("# Jev compile preview: `entrants/alice/pilot.md`", md)
        # the boilerplate tail is never shown; the voice line is quoted under Dropped
        self.assertNotIn("No commentary", md)
        self.assertIn("> Be the song everyone remembers.", md)

    def test_guard_sentence_that_no_rule_claims_is_flagged(self):
        backend = ScriptedBackend([_reply("drums")])
        e = C.compile_prompt(ENTRANT_PROSE, "p.md", ("drums",), backend)["instruments"]["drums"]
        unclaimed = [d["text"] for d in e["dropped"] if d["label"] == "unclaimed_rule"]
        self.assertTrue(any("Guard the ally" in t for t in unclaimed), e["dropped"])

    def test_invalid_model_output_is_reported_not_raised(self):
        backend = ScriptedBackend(["no json here"])
        e = C.compile_prompt(ENTRANT_PROSE, "p.md", ("violin",), backend, attempts=2)["instruments"]["violin"]
        self.assertFalse(e["ok"])
        self.assertIn("could not produce a valid schema", e["error"])
        self.assertEqual(backend.usage.calls, 2)

    def test_no_token_cap_refuses_a_call(self):
        """Ceryce, 2026-10-02 17:59 CT: "Get rid of any fucking token caps." A long reply is never refused
        or cut: every instrument compiles however many tokens it takes."""
        padded = [_reply(i) + " " * 400_000 for i in C.INSTRUMENTS]  # ~100k tokens of reply each
        backend = ScriptedBackend(padded)
        result = C.compile_prompt(ENTRANT_PROSE, "p.md", C.INSTRUMENTS, backend)
        self.assertEqual([e["ok"] for e in result["instruments"].values()], [True, True, True])
        self.assertGreater(backend.usage.total_tokens, 300_000)

    def test_cli_json_format_and_exit_codes(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "pilot.md"
            f.write_text(ENTRANT_PROSE, encoding="utf-8")
            buf = io.StringIO()
            orig = C.make_backend
            C.make_backend = lambda *a, **k: ScriptedBackend([_reply(i) for i in C.INSTRUMENTS])
            try:
                with redirect_stdout(buf):
                    rc = C.main([str(f), "--format", "json"])
                self.assertEqual(rc, 0)
                data = json.loads(buf.getvalue())
                self.assertEqual(data["version"], 2)
                self.assertNotIn("cap_tokens", data)
                self.assertNotIn("cap", data["prompts"][0]["markdown"].split("\n")[2])
                self.assertEqual(data["usage"]["calls"], 3)
                self.assertEqual(sorted(data["prompts"][0]["instruments"]), sorted(C.INSTRUMENTS))
                # the retired per-run cap is still accepted (the entrants' pinned PR bot passes it) and does nothing
                for value in ("100", "0"):
                    with redirect_stdout(io.StringIO()):
                        self.assertEqual(C.main([str(f), "--max-total-tokens", value]), 0)
            finally:
                C.make_backend = orig

    def test_no_vocabulary_sends_a_reply_cap(self):
        seen = []

        def fake(*a, **k):
            seen.append((k.get("max_tokens"), k.get("timeout"), k.get("vocab1")))
            return ScriptedBackend([_reply(i) for i in C.INSTRUMENTS])

        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "pilot.md"
            f.write_text(ENTRANT_PROSE, encoding="utf-8")
            orig = C.make_backend
            C.make_backend = fake
            try:
                for extra in ([], ["--vocab", "vocab-2"], ["--vocab", "vocab-1"], ["--timeout", "5"]):
                    with redirect_stdout(io.StringIO()):
                        C.main([str(f), "--format", "json"] + extra)
            finally:
                C.make_backend = orig
        self.assertEqual(seen, [(None, CALL_TIMEOUT_SEC, False), (None, CALL_TIMEOUT_SEC, False),
                                (None, C.VOCAB1_TIMEOUT_SEC, True), (None, 5.0, False)])

    def test_missing_file_and_bad_usage(self):
        import contextlib
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(C.main(["no/such/file.md"]), 2)
            self.assertEqual(C.main([]), 2)


# A violin translation with a guard (translator-guards-and-defaults-spec.md §2.2): one root rule, then
# a strategic-verdict guard whose yes-branch has a nested rule and whose no-branch has only a default.
GUARD_REPLY = json.dumps({
    "rules": [
        {"id": "low_hp_recall", "condition": "is this bot's hp below a quarter of its max?",
         "criteria": {"true": "hp < 25% max", "false": "hp >= 25% max"},
         "action": {"kind": "recall", "ability": None, "target_selector": "none"}},
        {"type": "guard", "id": "can_win_fight",
         "condition": "can this bot win the fight it is in or about to enter, by itself, right now?",
         "criteria": {"true": "a winnable fight is present", "false": "no winnable fight is present"},
         "then": {"nodes": [{"id": "opener_ready", "condition": "is staccato ready and an enemy bearbot in range?",
                             "criteria": {"true": "staccato ready, enemy in range", "false": "otherwise"},
                             "action": {"kind": "ability", "ability": "staccato", "target_selector": "nearest_enemy"}}],
                  "default_action": {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"}},
         "else": {"nodes": [], "default_action": {"kind": "move", "ability": None, "target_selector": "home"}}},
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
})

GUARD_PROSE = """You are a violin bearbot. Recall when your health drops below a quarter.
You only take fights you can win: when you can, open with staccato, otherwise fall back home.
"""

GUARD_OBS = {
    "clockSec": 42.0,
    "self": {"id": "bb-1", "team": "violet", "lane": "top", "instrument": "violin", "pos": {"x": 300, "y": 300},
             "hp": 200, "maxHp": 220, "moveSpeed": 55, "cooldowns": {"staccato": 0, "solo": 3.5}},
    "allies": [],
    "visibleEnemies": [{"id": "bb-4", "pos": {"x": 320, "y": 310}, "hp": 150, "maxHp": 150, "kind": "bearbot"}],
    "nearbyMinions": [],
    "nearbyTowers": [],
}


class _RecordingJev:
    """Says yes to the ids in `yes`, and records every question id it was asked."""

    model = "recording-jev"

    def __init__(self, yes: set[str]):
        self.yes, self.asked = yes, []

    def ask(self, state, questions):
        self.asked.append([q.id for q in questions])
        return {"answers": {q.id: {"noul": 0.9 if q.id in self.yes else 0.1} for q in questions},
                "usage": {"input_tokens": 500}}


class GuardNodesSurviveTheSavePathTests(unittest.TestCase):
    """A guard the translator emits must reach the Jev server: the schema compile.py hands on (the
    `schema` field of --format json, which door B's practice match POSTs; --save-schemas files;
    --schema-in) has to carry the whole tree, not the flat root-rules view."""

    ALL_IDS = ["low_hp_recall", "can_win_fight", "opener_ready"]

    def _compiled(self) -> dict:
        e = C.compile_prompt(GUARD_PROSE, "entrants/vi/pilot.md", ("violin",), ScriptedBackend([GUARD_REPLY]))["instruments"]["violin"]
        self.assertTrue(e["ok"], e.get("error"))
        return e["schema"]

    def test_saved_schema_keeps_the_guard_and_both_branches(self):
        saved = self._compiled()
        guard = next((r for r in saved["rules"] if r.get("type") == "guard"), None)
        self.assertIsNotNone(guard, saved["rules"])
        self.assertEqual(guard["id"], "can_win_fight")
        self.assertEqual([n["id"] for n in guard["then"]["nodes"]], ["opener_ready"])
        self.assertEqual(guard["then"]["default_action"]["kind"], "attack")
        self.assertEqual(guard["else"]["nodes"], [])
        self.assertEqual(guard["else"]["default_action"]["target_selector"], "home")

    def test_save_load_round_trip_is_the_same_tree(self):
        from translator import collect_nodes
        reloaded = C.schema_from_dict(json.loads(json.dumps(self._compiled())))
        self.assertEqual([n.id for n in collect_nodes(reloaded.root)], self.ALL_IDS)
        self.assertEqual(C.schema_to_dict(reloaded), self._compiled())

    def test_save_schemas_file_carries_the_guard(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "pilot.md"
            f.write_text(GUARD_PROSE, encoding="utf-8")
            orig = C.make_backend
            C.make_backend = lambda *a, **k: ScriptedBackend([GUARD_REPLY])
            try:
                with redirect_stdout(io.StringIO()):
                    rc = C.main([str(f), "--instrument", "violin", "--save-schemas", d, "--format", "json"])
            finally:
                C.make_backend = orig
            self.assertEqual(rc, 0)
            saved = json.loads((Path(d) / f"{Path(d).name}-violin.json").read_text(encoding="utf-8"))
        self.assertIn("can_win_fight", [r["id"] for r in saved["rules"]])

    def test_schema_server_asks_jev_every_node_and_walks_the_guard(self):
        from schema_server import JevSchemaBackend
        body = json.loads(json.dumps({"schema": self._compiled(), "observation": GUARD_OBS}))  # over the wire
        jev = _RecordingJev({"can_win_fight", "opener_ready"})
        out = JevSchemaBackend(jev, budget_usd=None).decide(body)
        self.assertEqual(jev.asked, [self.ALL_IDS])
        self.assertEqual(out["rule"], "opener_ready")
        self.assertEqual(out["action"], {"kind": "ability", "ability": "staccato", "target": "bb-4"})

        # guard says no: the else-branch's own default (retreat home), not the root's push_lane
        out = JevSchemaBackend(_RecordingJev(set()), budget_usd=None).decide(body)
        self.assertIsNone(out["rule"])
        self.assertEqual(out["action"]["kind"], "move")
        self.assertEqual(set(out["answers"]), set(self.ALL_IDS))



class EconomyFlagTests(unittest.TestCase):
    """--economy NAME (docs/late-game-economy-spec.md §7.4): the default writes nothing new; any other
    ruleset is named in the JSON and in each saved schema. FORMAT_VERSION stays 2."""

    def _schema(self, build=None, economy=None):
        return TranslatedSchema(pilot_file="p.md", instrument="drums", raw_model_output="",
                                rules=(TranslatedRule("r1", "is an enemy near?", "yes", "no", "attack", None, "nearest_enemy"),),
                                default_kind="move", default_ability=None, default_target_selector="push_lane",
                                build=build, economy=economy)

    def test_the_default_economy_writes_no_key(self):
        for economy in (None, "eco-3"):
            self.assertNotIn("economy", C.schema_to_dict(self._schema(("amp",), economy)))
        self.assertEqual(C.schema_to_dict(self._schema(("amp",), "eco-3")), C.schema_to_dict(self._schema(("amp",))))

    def test_a_named_economy_round_trips(self):
        d = C.schema_to_dict(self._schema(("wall-of-sound",), "eco-3-late"))
        self.assertEqual(d["economy"], "eco-3-late")
        back = C.schema_from_dict(json.loads(json.dumps(d)))
        self.assertEqual((back.economy, back.build), ("eco-3-late", ("wall-of-sound",)))
        self.assertEqual(C.schema_to_dict(back), d)
        del d["economy"]
        self.assertIsNone(C.schema_from_dict(d).economy)
        self.assertEqual(C.FORMAT_VERSION, 2)

    def _main_json(self, extra, reply):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "pilot.md"
            f.write_text("Recall when hurt. Engage enemy bearbots. Build toward Wall of Sound.\n", encoding="utf-8")
            out = Path(d) / "out.json"
            saved = Path(d) / "saved"
            original = C.make_backend
            C.make_backend = lambda *a, **k: ScriptedBackend([reply])
            try:
                rc = C.main([str(f), "--format", "json", "--out", str(out), "--save-schemas", str(saved)] + extra)
            finally:
                C.make_backend = original
            return rc, json.loads(out.read_text(encoding="utf-8")), [json.loads(p.read_text(encoding="utf-8")) for p in sorted(saved.glob("*.json"))]

    def test_main_with_the_late_economy(self):
        reply = json.dumps({"rules": [{"id": "engage", "condition": "is an enemy bearbot visible?",
                                       "action": {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"}}],
                            "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
                            "build": ["Wall of Sound"]})
        rc, data, saved = self._main_json(["--economy", "eco-3-late"], reply)
        self.assertEqual(rc, 0)
        self.assertEqual((data["version"], data["economy"]), (2, "eco-3-late"))
        prompt = data["prompts"][0]
        self.assertEqual(prompt["economy"], "eco-3-late")
        self.assertIn("Items and shopping lists follow the `eco-3-late` ruleset.", prompt["markdown"])
        for e in prompt["instruments"].values():
            self.assertEqual((e["schema"]["build"], e["schema"]["economy"]), (["wall-of-sound"], "eco-3-late"))
            self.assertIn("**Wall of Sound** (from your prose; parts filled in)", e["markdown"])
        self.assertEqual([s["economy"] for s in saved], ["eco-3-late"] * 3)

    def test_main_with_the_default_economy_adds_nothing(self):
        reply = json.dumps({"rules": [{"id": "engage", "condition": "is an enemy bearbot visible?",
                                       "action": {"kind": "attack", "ability": None, "target_selector": "nearest_enemy"}}],
                            "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
                            "build": ["amp"]})
        for extra in ([], ["--economy", "eco-3"]):
            rc, data, saved = self._main_json(extra, reply)
            self.assertEqual(rc, 0)
            self.assertEqual(list(data), ["version", "backend", "usage", "prompts"])
            self.assertNotIn("economy", data["prompts"][0])
            self.assertNotIn("follow the", data["prompts"][0]["markdown"])
            for s in saved:
                self.assertNotIn("economy", s)

    def test_an_unknown_economy_is_a_usage_error(self):
        from contextlib import redirect_stderr
        with self.assertRaises(SystemExit) as cm, redirect_stderr(io.StringIO()):
            C.parse_args(["p.md", "--economy", "eco-99"])
        self.assertEqual(cm.exception.code, 2)

if __name__ == "__main__":
    unittest.main()


class BuildWireFormatTests(unittest.TestCase):
    """`build` is on the wire (FORMAT_VERSION 2): a list or null, and a v1 dict without the key still
    loads as "no build"."""

    def _schema(self, build):
        rule = TranslatedRule("r1", "is hp low?", "low", "ok", "recall", None, "none")
        return TranslatedSchema(pilot_file="p.md", instrument="keytar", raw_model_output="", rules=[rule],
                                default_kind="move", default_ability=None, default_target_selector="push_lane", build=build)

    def test_format_version_is_2(self):
        self.assertEqual(C.FORMAT_VERSION, 2)

    def test_build_round_trips_as_a_list(self):
        d = C.schema_to_dict(self._schema(("amp", "bass-strings", "road-case")))
        self.assertEqual(d["build"], ["amp", "bass-strings", "road-case"])
        back = C.schema_from_dict(json.loads(json.dumps(d)))
        self.assertEqual(back.build, ("amp", "bass-strings", "road-case"))
        self.assertEqual(C.schema_to_dict(back), d)

    def test_no_build_is_written_as_null_and_reads_back_none(self):
        d = C.schema_to_dict(self._schema(None))
        self.assertIn("build", d)
        self.assertIsNone(d["build"])
        self.assertIsNone(C.schema_from_dict(d).build)

    def test_a_version_1_dict_without_build_still_loads(self):
        d = C.schema_to_dict(self._schema(None))
        del d["build"]
        loaded = C.schema_from_dict(d)
        self.assertIsNone(loaded.build)
        self.assertEqual([r.id for r in loaded.rules], ["r1"])

    def test_compiled_build_reaches_the_saved_schema(self):
        reply = json.loads(_reply("keytar"))
        reply["build"] = ["The Amp", "bass strings", "Tip Jar"]
        entry = C.compile_instrument("Buy the Amp, then Bass Strings.", "pilot.md", "keytar",
                                     ScriptedBackend([json.dumps(reply)]))
        self.assertTrue(entry["ok"], entry.get("error"))
        self.assertEqual(entry["schema"]["build"], ["amp", "bass-strings"])
        self.assertTrue(any("Tip Jar" in n for n in entry["schema"]["validation_notes"]))
        self.assertIn("Shopping list: Amp → Bass Strings (from your prose)", entry["markdown"])
        self.assertIn("## Shopping list — what was changed", entry["markdown"])
        self.assertNotIn("Automatic priority fixes", entry["markdown"])
