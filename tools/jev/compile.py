#!/usr/bin/env python3
"""Compile an entrant's prose into the Jev decision schema the jam will run, and print the
transparency view: the compiled rule cascade per instrument, what Jev is literally asked, which
sentence each rule came from, and -- quoted -- the prose Jev can't take, with the reason.

This is the ONE code path behind all three entrant doors (`docs/entrant-compile-preview.md`):

    A. local command     python tools/jev/compile.py entrants/<you>/pilot.md      (or: npm run compile -- <file>)
    B. Elysium panel     tools/arena/compile.mjs runs this file with --stdin --format json
    C. PR bot            jamobair-entrants' workflow runs this file, pinned to a promptlane ref

Nothing here is new translation logic: `translator.translate_pilot` (prompt, parse, retries, the
priority guard) and `transparency.render_report_markdown` are used unchanged. What this file adds is
the plumbing an entrant needs -- any prose (not just the three hand-labelled reference pilots:
`segment.auto_segments` labels it), all three instruments (one prompt drives drums, keytar and
violin, so each is compiled separately), and a choice of backend.

BACKENDS (`llm_backends.py`) -- same model either way, so every door compiles alike:
    --backend ollama      host Ollama, qwen3.5:9b, free. $OLLAMA_HOST (default 127.0.0.1:11434).
    --backend openrouter  OpenRouter, qwen/qwen3.5-9b, key from $OPENROUTER_API_KEY. ~$0.0005/compile.
Default: $JEV_COMPILE_BACKEND, else ollama.

ECONOMY. --economy NAME (default `economy_rules.DEFAULT_ECONOMY`) is the ruleset whose items the
prompt lists and the shopping list is checked against. A non-default ruleset is named in the output:
a top-level "economy" key in the JSON, and in each saved schema; the default writes nothing new, so
its output is unchanged. Under a ruleset with recipes (`eco-3-late`) the compiled "build" is the list
as declared and the match fills in parts (`docs/late-game-economy-spec.md` §7.4): FORMAT_VERSION
stays 2.

NO TOKEN CAPS (Ceryce, 2026-10-02 17:59 CT: "Get rid of any fucking token caps."). No reply is cut
at a token count and no run is refused for its token total (`llm_backends`, NO TOKEN CAPS). The old
per-run cap, --max-total-tokens, is still accepted so a caller pinned to an older promptlane (the
entrants' PR bot) keeps working, and it does nothing. A vocab-1 compile alone still sends the
1,800-token reply cap its recorded runs used, so its request is byte-identical. --timeout (seconds
per model call) is not a length limit: the default is long enough to fill the model's whole context
window (`llm_backends.CALL_TIMEOUT_SEC`).

VOCABULARY. --vocab (default `vocab.DEFAULT_VOCAB`, vocab-2) is what the prose compiles under: the
facts Jev is told each decision and the targets a rule can name (`vocab.py`, `docs/vocabulary-spec.md`).
A vocab-2 schema names it in a "vocab" key and plays under it wherever it goes; `--vocab vocab-1`
writes exactly the schema JSON a compile wrote before vocabularies existed.

EXIT STATUS. 0 every instrument compiled; 1 at least one failed to compile (the model never produced
a valid schema -- the view says which); 2 bad usage or backend unreachable. (3, "the token cap
stopped the run", is retired with the cap.)

Standard library only.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from economy_rules import DEFAULT_ECONOMY, known_economies  # noqa: E402
from llm_backends import CALL_TIMEOUT_SEC, VOCAB1_MAX_COMPLETION_TOKENS, Backend, BackendError, make_backend  # noqa: E402
from scenarios import ABILITIES  # noqa: E402
from segment import auto_segments, hand_segments_for  # noqa: E402
from transparency import build_report, render_report_markdown  # noqa: E402
from translator import (  # noqa: E402
    Action,
    Cascade,
    GuardNode,
    TranslatedRule,
    TranslatedSchema,
    scope_to_instrument,
    translate_pilot,
)
from vocab import DEFAULT_VOCAB, LEGACY_VOCAB, MAPS, VOCABS, resolve_vocab  # noqa: E402

INSTRUMENTS = ("drums", "keytar", "violin")
# vocab-1's per-call timeout before the caps went; kept with its reply cap so a vocab-1 compile runs as recorded.
VOCAB1_TIMEOUT_SEC = 120.0
# 2: schemas carry "build" (the entrant's shopping list, or null for the instrument default).
# A version-1 schema has no "build" and reads as null, so v1 files still load. An optional
# "economy" key (absent = the default ruleset) names the ruleset "build" was checked against.
FORMAT_VERSION = 2


# --- schema <-> JSON (the flat shape runs/jev-translator-schema-*.json already uses) ---------------
#
# A plain rule is the flat object below. A guard (translator-guards-and-defaults-spec.md §2.2) sits
# inline in the same list as {"type": "guard", "id", "condition", "criteria_true", "criteria_false",
# "then": {"nodes": [...], "default_action": {...} | null}, "else": {...same...}} -- the WHOLE tree is
# written, not `schema.rules` (the root's plain rules only), so a guard and everything under it
# reaches the Jev server (`schema_server.py`). A schema with no guards serializes exactly as before.

def _action_to_dict(action: Action | None) -> dict | None:
    return None if action is None else {"kind": action.kind, "ability": action.ability, "target_selector": action.target_selector}


def _node_to_dict(n) -> dict:
    if isinstance(n, GuardNode):
        return {
            "type": "guard",
            "id": n.id,
            "condition": n.condition,
            "criteria_true": n.criteria_true,
            "criteria_false": n.criteria_false,
            "then": {"nodes": [_node_to_dict(c) for c in n.then.nodes], "default_action": _action_to_dict(n.then.default)},
            "else": {"nodes": [_node_to_dict(c) for c in n.else_.nodes], "default_action": _action_to_dict(n.else_.default)},
        }
    return {
        "id": n.id,
        "condition": n.condition,
        "criteria_true": n.criteria_true,
        "criteria_false": n.criteria_false,
        "action_kind": n.action_kind,
        "action_ability": n.action_ability,
        "action_target_selector": n.action_target_selector,
    }


def schema_to_dict(schema: TranslatedSchema) -> dict:
    """A vocab-1 schema writes no "vocab" key, so it is exactly what it was before vocabularies
    existed; any later vocabulary is named, last, so the schema plays under it (`vocab.py`). Likewise
    a schema checked against the default economy writes no "economy" key."""
    out = {
        "pilot_file": schema.pilot_file,
        "instrument": schema.instrument,
        "rules": [_node_to_dict(n) for n in schema.root.nodes],
        "default_action": {"kind": schema.default_kind, "ability": schema.default_ability, "target_selector": schema.default_target_selector},
        "validation_notes": list(schema.validation_notes),
        "build": None if schema.build is None else list(schema.build),
    }
    if schema.economy not in (None, DEFAULT_ECONOMY):
        out["economy"] = schema.economy
    if schema.vocab != LEGACY_VOCAB:
        out["vocab"] = schema.vocab
    if schema.map:
        out["map"] = schema.map
    return out


def _action_from_dict(a: dict | None) -> Action | None:
    return None if a is None else Action(a.get("kind", "hold"), a.get("ability"), a.get("target_selector"))


def _node_from_dict(r: dict):
    criteria = r.get("criteria") or {}
    ct = r.get("criteria_true", criteria.get("true", "the condition holds"))
    cf = r.get("criteria_false", criteria.get("false", "the condition does not hold"))
    if r.get("type") == "guard":
        if not isinstance(r.get("then"), dict) or not isinstance(r.get("else"), dict):
            raise ValueError(f"guard {r['id']}: 'then' and 'else' must both be present cascade objects")
        branch = lambda b: Cascade(nodes=tuple(_node_from_dict(c) for c in b.get("nodes") or ()), default=_action_from_dict(b.get("default_action")))  # noqa: E731
        return GuardNode(id=r["id"], condition=r["condition"], criteria_true=ct, criteria_false=cf, then=branch(r["then"]), else_=branch(r["else"]))
    action = r.get("action") or {}
    return TranslatedRule(
        id=r["id"],
        condition=r["condition"],
        criteria_true=ct,
        criteria_false=cf,
        action_kind=r.get("action_kind", action.get("kind")),
        action_ability=r.get("action_ability", action.get("ability")),
        action_target_selector=r.get("action_target_selector", action.get("target_selector")),
    )


def schema_from_dict(d: dict) -> TranslatedSchema:
    """No "vocab" key is vocab-1; a vocabulary this checkout doesn't know is a ValueError, never a
    silent fallback to a different description."""
    da = d.get("default_action") or {}
    build = d.get("build")
    return TranslatedSchema(
        pilot_file=d.get("pilot_file", "pilot.md"),
        instrument=d["instrument"],
        raw_model_output="",
        validation_notes=tuple(d.get("validation_notes") or ()),
        build=None if build is None else tuple(build),
        economy=d.get("economy"),
        root=Cascade(nodes=tuple(_node_from_dict(r) for r in d["rules"]),
                     default=Action(da.get("kind", "hold"), da.get("ability"), da.get("target_selector"))),
        vocab=resolve_vocab(d.get("vocab")),
        map=d.get("map"),
    )


# --- compiling ----------------------------------------------------------------------------------

def segments_for(text: str, display_name: str):
    """(pilot_file shown in the report, segments, labels). A byte-exact reference pilot keeps its
    hand labels and its own file name, so its view is the checked-in transparency run's view."""
    hand = hand_segments_for(text)
    if hand is not None:
        return hand[0], hand[1], "hand"
    return display_name, auto_segments(text), "auto"


def compile_instrument(text: str, display_name: str, instrument: str, backend: Backend | None, attempts: int = 3,
                       schema: TranslatedSchema | None = None, vocab: str = DEFAULT_VOCAB, economy: str | None = None, map_: str | None = None) -> dict:
    """One instrument: translate (unless `schema` is given), then build + render the report.
    Never raises for a translation failure -- the entry says what went wrong instead.

    The report is built from the prose this instrument's translation actually saw
    (`translator.scope_to_instrument`); clauses the prose marks for another instrument are listed
    under Dropped as `other_instrument`, not flagged as rules that compiled to nothing."""
    scoped = scope_to_instrument(text, instrument)
    pilot_file, segments, labels = segments_for(scoped.text, display_name)
    segments = list(segments) + [("other_instrument", clause) for clause in scoped.set_aside]
    entry = {"instrument": instrument, "ok": False, "labels": labels}
    try:
        if schema is None:
            primary, ultimate = ABILITIES[instrument]
            schema = translate_pilot(text, pilot_file, instrument, primary, ultimate, max_attempts=attempts, generate=backend.generate, vocab=vocab,
                                     economy=economy, map_=map_)
        report = build_report(schema, pilot_file, segments=segments, labels=labels)
        entry.update(ok=True, schema=schema_to_dict(schema), markdown=render_report_markdown(report),
                     dropped=[{"label": d.label, "text": d.text.strip()} for d in report.dropped if d.text.strip()],
                     unmatched_rules=[rp.rule.id for rp in report.rules if not rp.source_segments])
    except BackendError as err:
        entry.update(error=str(err), backend_error=True)
    except (RuntimeError, ValueError) as err:
        entry.update(error=f"the translator could not produce a valid schema for {instrument}: {err}")
    return entry


def compile_prompt(text: str, display_name: str, instruments, backend: Backend | None, parallel: int = 1,
                   attempts: int = 3, schemas: dict | None = None, vocab: str = DEFAULT_VOCAB, economy: str | None = None,
                   map_: str | None = None) -> dict:
    """`vocab` is what a fresh translation is compiled under; a saved schema (`schemas`) keeps its own.
    The result's `vocab` names the vocabulary every compiled instrument is in. `economy` None (or the
    default's name) compiles for `DEFAULT_ECONOMY` and adds nothing to the result; any other ruleset
    is recorded as `result["economy"]`."""
    text = text.replace("\r\n", "\n")
    economy = None if economy == DEFAULT_ECONOMY else economy
    work = lambda inst: compile_instrument(text, display_name, inst, backend, attempts, (schemas or {}).get(inst), vocab, economy, map_)  # noqa: E731
    with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
        entries = list(pool.map(work, instruments))
    used = sorted({e["schema"].get("vocab", LEGACY_VOCAB) for e in entries if e["ok"]}) or [vocab]
    result = {
        "name": display_name,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "vocab": ", ".join(used),
        "instruments": {e["instrument"]: e for e in entries},
    }
    if economy is not None:
        result["economy"] = economy
    return result


# --- rendering the whole preview ------------------------------------------------------------------

def header_markdown(result: dict, backend_desc: str, usage: dict) -> str:
    cost = f"${usage['cost_usd']:.4f}"
    lines = [
        f"# Jev compile preview: `{result['name']}`",
        "",
        f"Compiled by promptlane's prose-to-schema translator with `{backend_desc}` -- "
        f"{usage['calls']} model call(s), {usage['total_tokens']:,} tokens"
        + f", {cost}, {usage['seconds']:.1f} s.",
        "",
        "At the jam your prose is not run by a chat model: it is compiled once into the rule cascade "
        "below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so "
        "compiling the same prose twice can differ a little -- wording that compiles the same way every "
        "time is wording that will play the way you meant.",
        "",
        "One prompt drives all three of your bearbots, so each instrument is compiled separately. A line "
        "that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only "
        "for the instrument it names.",
        "",
        f"Vocabulary: `{result.get('vocab', LEGACY_VOCAB)}` -- the facts Jev is told about the game each decision and "
        "the targets a rule can name. A compiled schema always plays under the vocabulary it was compiled in.",
        "",
    ]
    if result.get("economy"):
        lines += [f"Items and shopping lists follow the `{result['economy']}` ruleset.", ""]
    for inst, e in result["instruments"].items():
        if e["ok"]:
            n = len(e["schema"]["rules"])
            flags = []
            if e["unmatched_rules"]:
                flags.append(f"{len(e['unmatched_rules'])} rule(s) with no clear source sentence")
            unclaimed = sum(1 for d in e["dropped"] if d["label"] == "unclaimed_rule")
            if unclaimed:
                flags.append(f"{unclaimed} rule-like sentence(s) that compiled to nothing")
            removed = sum(1 for n in e["schema"]["validation_notes"] if n.startswith("instrument scope: removed rule"))
            if removed:
                flags.append(f"{removed} rule(s) removed for belonging to another instrument")
            lines.append(f"- **{inst}**: {n} rules" + (" -- ⚠ " + "; ".join(flags) if flags else ""))
        else:
            lines.append(f"- **{inst}**: ✗ not compiled -- {e['error']}")
    return "\n".join(lines) + "\n"


def full_markdown(result: dict, backend_desc: str, usage: dict) -> str:
    parts = [header_markdown(result, backend_desc, usage)]
    for e in result["instruments"].values():
        if e["ok"]:
            parts.append("---\n\n" + e["markdown"])
    return "\n".join(parts)


# --- CLI ------------------------------------------------------------------------------------------

def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="python tools/jev/compile.py",
        description="Compile prose pilot(s) into Jev decision schemas and print the transparency view.",
    )
    p.add_argument("prompts", nargs="*", help="prompt file(s), e.g. entrants/<you>/pilot.md")
    p.add_argument("--stdin", action="store_true", help="read one prompt from stdin instead of files")
    p.add_argument("--name", default="pilot.md", help="display name for --stdin (default pilot.md)")
    p.add_argument("--instrument", choices=("all",) + INSTRUMENTS, default="all", help="compile one instrument, or all three (default)")
    p.add_argument("--backend", choices=("ollama", "openrouter"), default=os.environ.get("JEV_COMPILE_BACKEND", "ollama"))
    p.add_argument("--model", default=None, help="override the model (default qwen3.5:9b / qwen/qwen3.5-9b)")
    p.add_argument("--ollama-url", default=None, help="Ollama base URL (default $OLLAMA_HOST, else http://127.0.0.1:11434)")
    p.add_argument("--api-key-env", default="OPENROUTER_API_KEY", help="env var holding the OpenRouter key")
    # Retired with the token caps; accepted and ignored so a caller pinned to an older promptlane keeps working.
    p.add_argument("--max-total-tokens", type=int, default=None, help=argparse.SUPPRESS)
    p.add_argument("--attempts", type=int, default=3, help="translation attempts per instrument before giving up")
    p.add_argument("--parallel", type=int, default=None, help="instruments compiled at once (default 1 for ollama, 3 for openrouter)")
    p.add_argument("--timeout", type=float, default=None,
                   help=f"seconds per model call, not a length limit (default {CALL_TIMEOUT_SEC:.0f}: enough to fill the model's "
                   f"whole context window; {VOCAB1_TIMEOUT_SEC:.0f} under vocab-1)")
    p.add_argument("--format", choices=("markdown", "json"), default="markdown")
    p.add_argument("--out", default=None, help="write the output here instead of stdout")
    p.add_argument("--economy", choices=known_economies(), default=DEFAULT_ECONOMY,
                   help=f"the ruleset whose items the prompt lists and the shopping list is checked against (default {DEFAULT_ECONOMY})")
    p.add_argument("--schema-in", action="append", default=[], metavar="FILE",
                   help="render from a saved schema JSON instead of calling a model (repeatable, one per instrument; no spend)")
    p.add_argument("--save-schemas", default=None, metavar="DIR", help="also write each compiled schema as JSON here")
    p.add_argument("--vocab", choices=VOCABS, default=DEFAULT_VOCAB,
                   help=f"the vocabulary to compile under (tools/jev/vocab.py; default {DEFAULT_VOCAB}). "
                   f"{LEGACY_VOCAB} writes exactly the schema JSON compiles wrote before vocabularies existed")
    p.add_argument("--map", choices=tuple(MAPS), default=None,
                   help="the map the prose is written for (src/mapVariant.ts). pvp-2 offers a vocab-2 compile its teleport "
                   "(a third ability, aimed by tp_lane_tower or tp_threatened_tower) and its facts; a map with base towers "
                   "(pvp-1-hp300-base700, pvp-2-hp400-base950 and their tunings, vocab.BASE_TOWER_MAPS) offers the enemy_base_tower target and the base towers' fact. "
                   "Either way the schema records \"map\"; no map (the default) or any other compiles exactly as before")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.stdin == bool(args.prompts):
        print("give prompt file(s) or --stdin (not both)", file=sys.stderr)
        return 2
    instruments = INSTRUMENTS if args.instrument == "all" else (args.instrument,)
    economy = None if args.economy == DEFAULT_ECONOMY else args.economy

    sources = [(args.name, sys.stdin.read())] if args.stdin else []
    for f in args.prompts:
        path = Path(f)
        if not path.is_file():
            print(f"no such file: {f}", file=sys.stderr)
            return 2
        sources.append((f.replace("\\", "/"), path.read_text(encoding="utf-8")))

    schemas = None
    if args.schema_in:
        schemas = {}
        for f in args.schema_in:
            s = schema_from_dict(json.loads(Path(f).read_text(encoding="utf-8")))
            if economy is not None and s.economy is None:  # a saved schema's own "economy" wins
                s = dataclasses.replace(s, economy=economy)
            schemas[s.instrument] = s
        instruments = tuple(i for i in instruments if i in schemas)

    legacy = args.vocab == LEGACY_VOCAB  # vocab-1 keeps its recorded reply cap and timeout; nothing else is capped
    timeout = args.timeout or (VOCAB1_TIMEOUT_SEC if legacy else CALL_TIMEOUT_SEC)
    backend = None
    backend_desc = "saved schema (no model call)"
    if schemas is None:
        try:
            backend = make_backend(args.backend, args.model, max_tokens=VOCAB1_MAX_COMPLETION_TOKENS if legacy else None,
                                   ollama_url=args.ollama_url, api_key_env=args.api_key_env, timeout=timeout)
        except (BackendError, ValueError) as err:
            print(f"compile: {err}", file=sys.stderr)
            return 2
        backend_desc = backend.describe()
    parallel = args.parallel or (3 if args.backend == "openrouter" else 1)

    started = time.perf_counter()
    results = [compile_prompt(text, name, instruments, backend, parallel, args.attempts, schemas, args.vocab, economy, args.map) for name, text in sources]
    usage = backend.usage.as_dict() if backend else {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost_usd": 0.0, "seconds": 0.0}
    usage["wall_seconds"] = round(time.perf_counter() - started, 2)

    if args.save_schemas:
        out_dir = Path(args.save_schemas)
        out_dir.mkdir(parents=True, exist_ok=True)
        for r in results:
            stem = Path(r["name"]).stem if Path(r["name"]).stem != "pilot" else Path(r["name"]).parent.name or "pilot"
            for inst, e in r["instruments"].items():
                if e["ok"]:
                    (out_dir / f"{stem}-{inst}.json").write_text(json.dumps(e["schema"], indent=1) + "\n", encoding="utf-8")

    if args.format == "json":
        payload = {
            "version": FORMAT_VERSION,
            **({"economy": economy} if economy is not None else {}),
            "backend": backend_desc,
            "usage": usage,
            "prompts": [{**r, "markdown": full_markdown(r, backend_desc, usage)} for r in results],
        }
        out = json.dumps(payload, indent=1) + "\n"
    else:
        out = "\n\n".join(full_markdown(r, backend_desc, usage) for r in results)

    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
    else:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")  # a Windows console defaults to cp1252; the view has ⚠ and —
        sys.stdout.write(out)

    entries = [e for r in results for e in r["instruments"].values()]
    if any(e.get("backend_error") for e in entries):
        return 2
    return 0 if all(e["ok"] for e in entries) else 1


if __name__ == "__main__":
    sys.exit(main())
