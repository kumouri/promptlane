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
violin, so each is compiled separately), a choice of backend, and a hard token cap.

BACKENDS (`llm_backends.py`) -- same model either way, so every door compiles alike:
    --backend ollama      host Ollama, qwen3.5:9b, free. $OLLAMA_HOST (default 127.0.0.1:11434).
    --backend openrouter  OpenRouter, qwen/qwen3.5-9b, key from $OPENROUTER_API_KEY. ~$0.0005/compile.
Default: $JEV_COMPILE_BACKEND, else ollama.

SPEND CAP. --max-total-tokens (default 60000, roughly 8 compiles' worth) bounds prompt+completion
tokens across the whole invocation; a call that could cross it is refused before it is made
(`llm_backends.TokenBudget`), and the instruments it would have compiled are reported as skipped.

EXIT STATUS. 0 every instrument compiled; 1 at least one failed to compile (the model never produced
a valid schema -- the view says which); 2 bad usage or backend unreachable; 3 the token cap stopped
the run.

Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from llm_backends import Backend, BackendError, BudgetExceeded, TokenBudget, make_backend  # noqa: E402
from scenarios import ABILITIES  # noqa: E402
from segment import auto_segments, hand_segments_for  # noqa: E402
from transparency import build_report, render_report_markdown  # noqa: E402
from translator import TranslatedRule, TranslatedSchema, translate_pilot  # noqa: E402

INSTRUMENTS = ("drums", "keytar", "violin")
DEFAULT_MAX_TOTAL_TOKENS = 60_000
FORMAT_VERSION = 1


# --- schema <-> JSON (the flat shape runs/jev-translator-schema-*.json already uses) ---------------

def schema_to_dict(schema: TranslatedSchema) -> dict:
    return {
        "pilot_file": schema.pilot_file,
        "instrument": schema.instrument,
        "rules": [
            {
                "id": r.id,
                "condition": r.condition,
                "criteria_true": r.criteria_true,
                "criteria_false": r.criteria_false,
                "action_kind": r.action_kind,
                "action_ability": r.action_ability,
                "action_target_selector": r.action_target_selector,
            }
            for r in schema.rules
        ],
        "default_action": {"kind": schema.default_kind, "ability": schema.default_ability, "target_selector": schema.default_target_selector},
        "validation_notes": list(schema.validation_notes),
    }


def schema_from_dict(d: dict) -> TranslatedSchema:
    rules = []
    for r in d["rules"]:
        action = r.get("action") or {}
        criteria = r.get("criteria") or {}
        rules.append(
            TranslatedRule(
                id=r["id"],
                condition=r["condition"],
                criteria_true=r.get("criteria_true", criteria.get("true", "the condition holds")),
                criteria_false=r.get("criteria_false", criteria.get("false", "the condition does not hold")),
                action_kind=r.get("action_kind", action.get("kind")),
                action_ability=r.get("action_ability", action.get("ability")),
                action_target_selector=r.get("action_target_selector", action.get("target_selector")),
            )
        )
    da = d.get("default_action") or {}
    return TranslatedSchema(
        pilot_file=d.get("pilot_file", "pilot.md"),
        instrument=d["instrument"],
        rules=rules,
        default_kind=da.get("kind", "hold"),
        default_ability=da.get("ability"),
        default_target_selector=da.get("target_selector"),
        raw_model_output="",
        validation_notes=tuple(d.get("validation_notes") or ()),
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
                       schema: TranslatedSchema | None = None) -> dict:
    """One instrument: translate (unless `schema` is given), then build + render the report.
    Never raises for a translation failure -- the entry says what went wrong instead."""
    pilot_file, segments, labels = segments_for(text, display_name)
    entry = {"instrument": instrument, "ok": False, "labels": labels}
    try:
        if schema is None:
            primary, ultimate = ABILITIES[instrument]
            schema = translate_pilot(text, pilot_file, instrument, primary, ultimate, max_attempts=attempts, generate=backend.generate)
        report = build_report(schema, pilot_file, segments=segments, labels=labels)
        entry.update(ok=True, schema=schema_to_dict(schema), markdown=render_report_markdown(report),
                     dropped=[{"label": d.label, "text": d.text.strip()} for d in report.dropped if d.text.strip()],
                     unmatched_rules=[rp.rule.id for rp in report.rules if not rp.source_segments])
    except BudgetExceeded as err:
        entry.update(error=f"skipped: {err}", budget=True)
    except BackendError as err:
        entry.update(error=str(err), backend_error=True)
    except (RuntimeError, ValueError) as err:
        entry.update(error=f"the translator could not produce a valid schema for {instrument}: {err}")
    return entry


def compile_prompt(text: str, display_name: str, instruments, backend: Backend | None, parallel: int = 1,
                   attempts: int = 3, schemas: dict | None = None) -> dict:
    text = text.replace("\r\n", "\n")
    work = lambda inst: compile_instrument(text, display_name, inst, backend, attempts, (schemas or {}).get(inst))  # noqa: E731
    with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
        entries = list(pool.map(work, instruments))
    return {
        "name": display_name,
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "instruments": {e["instrument"]: e for e in entries},
    }


# --- rendering the whole preview ------------------------------------------------------------------

def header_markdown(result: dict, backend_desc: str, usage: dict, cap: int | None) -> str:
    cost = f"${usage['cost_usd']:.4f}"
    lines = [
        f"# Jev compile preview: `{result['name']}`",
        "",
        f"Compiled by promptlane's prose-to-schema translator with `{backend_desc}` -- "
        f"{usage['calls']} model call(s), {usage['total_tokens']:,} tokens"
        + (f" of a {cap:,}-token cap" if cap else "")
        + f", {cost}, {usage['seconds']:.1f} s.",
        "",
        "At the jam your prose is not run by a chat model: it is compiled once into the rule cascade "
        "below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so "
        "compiling the same prose twice can differ a little -- wording that compiles the same way every "
        "time is wording that will play the way you meant.",
        "",
        "One prompt drives all three of your bearbots, so each instrument is compiled separately.",
        "",
    ]
    for inst, e in result["instruments"].items():
        if e["ok"]:
            n = len(e["schema"]["rules"])
            flags = []
            if e["unmatched_rules"]:
                flags.append(f"{len(e['unmatched_rules'])} rule(s) with no clear source sentence")
            unclaimed = sum(1 for d in e["dropped"] if d["label"] == "unclaimed_rule")
            if unclaimed:
                flags.append(f"{unclaimed} rule-like sentence(s) that compiled to nothing")
            lines.append(f"- **{inst}**: {n} rules" + (" -- ⚠ " + "; ".join(flags) if flags else ""))
        else:
            lines.append(f"- **{inst}**: ✗ not compiled -- {e['error']}")
    return "\n".join(lines) + "\n"


def full_markdown(result: dict, backend_desc: str, usage: dict, cap: int | None) -> str:
    parts = [header_markdown(result, backend_desc, usage, cap)]
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
    p.add_argument("--max-total-tokens", type=int, default=DEFAULT_MAX_TOTAL_TOKENS, help="spend cap across this whole run (prompt+completion tokens); 0 = uncapped")
    p.add_argument("--attempts", type=int, default=3, help="translation attempts per instrument before giving up")
    p.add_argument("--parallel", type=int, default=None, help="instruments compiled at once (default 1 for ollama, 3 for openrouter)")
    p.add_argument("--timeout", type=float, default=120.0, help="seconds per model call")
    p.add_argument("--format", choices=("markdown", "json"), default="markdown")
    p.add_argument("--out", default=None, help="write the output here instead of stdout")
    p.add_argument("--schema-in", action="append", default=[], metavar="FILE",
                   help="render from a saved schema JSON instead of calling a model (repeatable, one per instrument; no spend)")
    p.add_argument("--save-schemas", default=None, metavar="DIR", help="also write each compiled schema as JSON here")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.stdin == bool(args.prompts):
        print("give prompt file(s) or --stdin (not both)", file=sys.stderr)
        return 2
    instruments = INSTRUMENTS if args.instrument == "all" else (args.instrument,)

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
            schemas[s.instrument] = s
        instruments = tuple(i for i in instruments if i in schemas)

    cap = args.max_total_tokens or None
    backend = None
    backend_desc = "saved schema (no model call)"
    if schemas is None:
        try:
            backend = make_backend(args.backend, args.model, TokenBudget(cap), ollama_url=args.ollama_url,
                                   api_key_env=args.api_key_env, timeout=args.timeout)
        except (BackendError, ValueError) as err:
            print(f"compile: {err}", file=sys.stderr)
            return 2
        backend_desc = backend.describe()
    parallel = args.parallel or (3 if args.backend == "openrouter" else 1)

    started = time.perf_counter()
    results = [compile_prompt(text, name, instruments, backend, parallel, args.attempts, schemas) for name, text in sources]
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
        out = json.dumps({
            "version": FORMAT_VERSION,
            "backend": backend_desc,
            "cap_tokens": cap,
            "usage": usage,
            "prompts": [{**r, "markdown": full_markdown(r, backend_desc, usage, cap)} for r in results],
        }, indent=1) + "\n"
    else:
        out = "\n\n".join(full_markdown(r, backend_desc, usage, cap) for r in results)

    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
    else:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")  # a Windows console defaults to cp1252; the view has ⚠ and —
        sys.stdout.write(out)

    entries = [e for r in results for e in r["instruments"].values()]
    if any(e.get("budget") for e in entries):
        return 3
    if any(e.get("backend_error") for e in entries):
        return 2
    return 0 if all(e["ok"] for e in entries) else 1


if __name__ == "__main__":
    sys.exit(main())
