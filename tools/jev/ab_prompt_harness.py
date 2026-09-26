#!/usr/bin/env python3
"""Controlled A/B: does the guard-aware translation prompt (this branch, PR #33) itself cause the
47.2% (17/36) prose-fidelity drop `docs/translator-guards-and-defaults-spec.md` §7 measured, or is it
ordinary `qwen3.5:9b` run-to-run variance? Requested 2026-09-26, "job it" -- see that spec's §7 for
the untested claim this settles.

Arm A: the translation prompt exactly as on `origin/develop` (`OLD_PROMPT_TEMPLATE` below, copied
verbatim from that commit -- this file does NOT import `translator._translation_prompt` for arm A,
so editing that function would not accidentally leak into arm A's text).
Arm B: `translator._translation_prompt`, i.e. this branch's HEAD, unmodified, imported directly.

Everything else is held identical between arms: same pilots, same 36 scenarios, same parse/retry/
priority-guard path (`translator.parse_schema`/`enforce_absolute_priority`, imported not
reimplemented), and the SAME downstream harness/scoring (`fidelity_harness.run_pilot`/`summarize`/
`guard_diagnostics`, imported unchanged). This file adds a translation entry point that only varies
the prompt text (plus, since 2026-09-26, which model translates it and an optional Jev-classifier
hints block appended after the prompt) -- it does not edit `translator.py`, `fidelity_harness.py`,
or `transparency.py`.

**2026-09-26 update (`docs/translator-guards-and-defaults-spec.md` §9): `--translator-backend`.**
The original A/B only ever ran `qwen3.5:9b` (think:false, as shipped) as the translator. Ceryce,
00:38 CT: "test it against something better, a haiku agent or something." `--translator-backend`
now selects which model translates (`qwen` -- unchanged default, `_ollama_generate` exactly as
before; `haiku`/`sonnet` -- `llm_backends.ClaudeCliBackend`, the subscription CLI, translator step
only, never the game/arena model path). `--jev-hints-file`, when given, appends a pilot's
Jev-classifier hints (`jev_classifier.format_hints`) after the arm's own prompt text, identically for
both arms -- a separate axis crossed with the arm, not an edit to either arm's prompt.

Run it (one arm, all three pilots, one live run):

    python tools/jev/ab_prompt_harness.py --live --arm a --run-id 1 --out runs/ab-arm-a-run1.json
    python tools/jev/ab_prompt_harness.py --live --arm b --translator-backend haiku \\
        --run-id 1 --out runs/ab-haiku-arm-b-run1.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import WORKERS_AI_MODEL, WorkersAIClient, estimate_cost_usd, resolve_workers_ai_token  # noqa: E402
from fidelity_harness import DumbStubJevClient, guard_diagnostics, run_pilot, summarize  # noqa: E402
from ground_truth import _ollama_generate, resolve_ollama_url  # noqa: E402
from jev_classifier import format_hints  # noqa: E402
from llm_backends import ClaudeCliBackend, DEFAULT_CLAUDE_MODEL  # noqa: E402
from scenarios import ABILITIES, all_scenarios  # noqa: E402
import translator as T  # noqa: E402

TRANSLATOR_BACKENDS = {
    "qwen": {"model": "qwen3.5:9b"},
    "haiku": {"model": DEFAULT_CLAUDE_MODEL},  # claude-haiku-4-5-20251001
    "sonnet": {"model": "sonnet"},  # the CLI's own latest-Sonnet alias, not a pinned snapshot
}

REPO_ROOT = Path(__file__).resolve().parents[2]
PILOTS = {
    "drums": REPO_ROOT / "prompts" / "pilots" / "drums.md",
    "keytar": REPO_ROOT / "prompts" / "pilots" / "keytar.md",
    "violin": REPO_ROOT / "prompts" / "pilots" / "violin.md",
}


def old_translation_prompt(pilot_text: str, instrument: str, primary_ability: str, ultimate_ability: str) -> str:
    """Byte-for-byte `_translation_prompt` from `origin/develop` at b927d7f (before the guard-tree
    prompt additions), the flat-rules-only version. Verified against `git show origin/develop:
    tools/jev/translator.py` at A/B-setup time -- see the PR's commit for the diff this was copied
    from."""
    selectors_desc = "\n".join(f'  "{k}" -- {v}' for k, v in T.TARGET_SELECTORS.items())
    return f"""You are translating a game-bot prompt written in prose into a strict decision table.

The bot plays {instrument}. Its two abilities are named "{primary_ability}" (primary) and
"{ultimate_ability}" (secondary/ultimate) -- use exactly these strings for "ability" fields, never
invent a different name.

Read this prose pilot below and extract its strategy as an ORDERED list of rules, evaluated top to
bottom, FIRST MATCH WINS -- exactly like a priority list. Each rule has:
  "id": a short snake_case id
  "condition": one yes/no question about the bot's current game state (a threshold comparison or a
      presence check -- e.g. "is this bot's hp below a quarter of its max?", "is an enemy bearbot
      within melee range?"). Never a question that needs a text answer.
  "criteria": {{"true": "one short clause describing what 'true' looks like in the state",
      "false": "one short clause describing what 'false' looks like in the state"}}
  "action": {{"kind": one of {T.ACTION_KINDS}, "ability": one of ["{primary_ability}", "{ultimate_ability}", null],
      "target_selector": one of {list(T.TARGET_SELECTORS)} or null}}

target_selector meanings (pick the closest match to what the prose says; do not invent a new one):
{selectors_desc}

Also include one "default_action" (same "action" shape) for when none of the rules match -- the
prose's fallback behavior (usually push the lane or go home).

Use between 3 and 8 rules. Output ONLY this JSON object, nothing else, no markdown fences:

{{"rules": [{{"id": "...", "condition": "...", "criteria": {{"true": "...", "false": "..."}}, "action": {{"kind": "...", "ability": null, "target_selector": null}}}}],
 "default_action": {{"kind": "...", "ability": null, "target_selector": null}}}}

PROSE PILOT:
{pilot_text.strip()}
"""


ARM_PROMPTS = {
    "a": old_translation_prompt,
    "b": T._translation_prompt,
}


def translate_pilot_arm(
    pilot_text: str,
    pilot_file: str,
    instrument: str,
    primary_ability: str,
    ultimate_ability: str,
    arm: str,
    generate,
    max_attempts: int = 3,
    hints: str | None = None,
) -> tuple[T.TranslatedSchema, dict]:
    """Same retry/parse/priority-guard shape as `translator.translate_pilot`, reusing its
    `parse_schema`/`enforce_absolute_priority` unmodified -- the only thing that varies by arm is
    which prompt-builder produces the text sent to the model. `generate` is a `prompt -> reply text`
    callable (`llm_backends.Backend.generate`, or the plain `_ollama_generate` closure for the
    original qwen path) -- which model translates is the caller's concern, not this function's.
    `hints`, when given (`jev_classifier.format_hints`'s output for this pilot), is appended after
    the arm's own prompt text on EVERY attempt including retries -- identically for arm A and arm B,
    so it is a separate axis crossed with the arm, not an edit to either arm's prompt (spec §9).
    Returns `(schema, diagnostics)`; `diagnostics` records compile failures and the
    `guard_`-named-but-not-a-guard failure mode (spec §7) so both are countable per arm without
    re-deriving them from raw text later."""
    prompt_fn = ARM_PROMPTS[arm]
    diag = {"attempts": 0, "compile_failures": 0, "guard_named_no_action_failures": 0, "guard_nodes_emitted": 0}
    base_prompt = prompt_fn(pilot_text, instrument, primary_ability, ultimate_ability)
    hints_block = f"\n\n{hints}\n" if hints else ""
    prompt = base_prompt + hints_block
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        diag["attempts"] += 1
        reply = generate(prompt)
        try:
            raw_json = T._extract_json_object(reply)
            schema = T.parse_schema(raw_json, pilot_file, instrument, reply)
            schema = T.enforce_absolute_priority(schema, pilot_text)
            diag["guard_nodes_emitted"] = sum(1 for n in T.collect_nodes(schema.root) if isinstance(n, T.GuardNode))
            return schema, diag
        except (ValueError, json.JSONDecodeError) as err:
            diag["compile_failures"] += 1
            if "guard_" in reply.lower() and '"then"' not in reply.lower():
                diag["guard_named_no_action_failures"] += 1
            last_err = err
            prompt = (
                base_prompt + hints_block
                + f"\n\nYour previous attempt was invalid: {err}. If this mentions a 'guard_'-named "
                "rule, you emitted a plain rule action for something that needed the full guard shape "
                "(type/then/else) -- either finish the guard shape or use a normal rule instead. "
                "Output ONLY the JSON object, no other text."
            )
    raise RuntimeError(f"translation failed after {max_attempts} attempts: {last_err}")


def make_translator_generate(translator_backend: str, ollama_model: str, ollama_url: str | None, claude_backend):
    """The `prompt -> reply text` callable `translate_pilot_arm` needs. `qwen` reproduces the
    original A/B's exact call (`_ollama_generate`, same timeout/max_tokens, unimported from a
    `Backend` wrapper) so that arm's results stay comparable to the pre-2026-09-26 A/B. `haiku`/
    `sonnet` hand back the shared `claude_backend.generate` so its `Usage` accumulates across every
    pilot in one arm-run (one `ClaudeCliBackend` instance per `run_arm` call, not per pilot)."""
    if translator_backend == "qwen":
        url = ollama_url or resolve_ollama_url(None)
        return lambda p: _ollama_generate(url, ollama_model, p, timeout=90.0, max_tokens=1800)
    if claude_backend is None:
        raise ValueError(f"translator backend {translator_backend!r} needs a ClaudeCliBackend instance")
    return claude_backend.generate


def run_arm(
    arm: str,
    pilots: list[str],
    client,
    translator_backend: str,
    ollama_model: str,
    schemas_out: Path | None,
    hints_by_pilot: dict[str, str] | None = None,
    claude_model: str | None = None,
    claude_effort: str | None = "low",
) -> dict:
    claude_backend = None
    if translator_backend != "qwen":
        model = claude_model or TRANSLATOR_BACKENDS[translator_backend]["model"]
        claude_backend = ClaudeCliBackend(model=model, effort=claude_effort)

    pilot_reports = []
    per_pilot_diag = {}
    wall_start = time.perf_counter()
    for name in pilots:
        pilot_path = PILOTS[name]
        pilot_text = pilot_path.read_text(encoding="utf-8")
        primary, ultimate = ABILITIES[name]
        hints = (hints_by_pilot or {}).get(name) or None
        generate = make_translator_generate(translator_backend, ollama_model, None, claude_backend)
        print(f"[arm {arm}] [{translator_backend}{'+jev-hints' if hints else ''}] translating {name}.md ...", file=sys.stderr)
        schema, diag = translate_pilot_arm(pilot_text, f"prompts/pilots/{name}.md", name, primary, ultimate, arm, generate, hints=hints)
        per_pilot_diag[name] = diag
        print(f"  -> {len(schema.rules)} root-level rules, {diag['guard_nodes_emitted']} guard nodes, {diag['compile_failures']} compile failures", file=sys.stderr)
        if schemas_out:
            schemas_out.mkdir(parents=True, exist_ok=True)
            (schemas_out / f"{arm}-{name}.md").write_text(T.render_markdown(schema), encoding="utf-8")
        print(f"[arm {arm}] running {len(all_scenarios())} scenarios for {name} ...", file=sys.stderr)
        report = run_pilot(name, pilot_text, schema, client, ollama_model)
        pilot_reports.append(report)
    wall_sec = time.perf_counter() - wall_start

    summaries = [summarize(r) for r in pilot_reports]
    all_rows = [row for r in pilot_reports for row in r["rows"]]
    overall_n = len(all_rows)
    overall_kind_agree = sum(1 for r in all_rows if r["kind_match"])
    total_input_tokens = sum(r["input_tokens"] for r in all_rows)

    return {
        "arm": arm,
        "translator_backend": translator_backend,
        "translator_model": (claude_backend.model if claude_backend else ollama_model),
        "jev_hints_used": bool(hints_by_pilot),
        "translator_usage": claude_backend.usage.as_dict() if claude_backend else None,
        "wall_sec": round(wall_sec, 2),
        "ollama_model": ollama_model,
        "pilots": pilots,
        "n_scenarios_per_pilot": len(all_scenarios()),
        "per_pilot": summaries,
        "per_pilot_translation_diagnostics": per_pilot_diag,
        "overall_kind_agreement_rate": overall_kind_agree / overall_n if overall_n else None,
        "overall_n": overall_n,
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
        "detail": pilot_reports,
    }


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--arm", required=True, choices=["a", "b"])
    p.add_argument("--live", action="store_true", help="call real Jev via Cloudflare Workers AI")
    p.add_argument("--model", default=WORKERS_AI_MODEL)
    p.add_argument("--cloudflare-token-env", default="CLOUDFLARE_API_TOKEN")
    p.add_argument("--ollama-model", default="qwen3.5:9b")
    p.add_argument("--translator-backend", default="qwen", choices=list(TRANSLATOR_BACKENDS),
                    help="qwen (default, unchanged) translates via Ollama; haiku/sonnet shell out to "
                    "the claude CLI on the subscription, translator step only")
    p.add_argument("--claude-model", default=None, help="override the model id/alias for --translator-backend haiku/sonnet")
    p.add_argument("--claude-effort", default="low")
    p.add_argument("--jev-hints-file", default=None,
                    help="a jev_classifier.py --out JSON report; when given, its per_pilot_hints are "
                    "appended after the translation prompt for BOTH arms identically")
    p.add_argument("--pilots", nargs="*", default=list(PILOTS), choices=list(PILOTS))
    p.add_argument("--schemas-out", default=None)
    p.add_argument("--out", default=None)
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.live:
        token = resolve_workers_ai_token(args.cloudflare_token_env)
        client = WorkersAIClient(token, model=args.model)
    else:
        client = DumbStubJevClient()
    schemas_out = Path(args.schemas_out) if args.schemas_out else None
    hints_by_pilot = None
    if args.jev_hints_file:
        classifier_report = json.loads(Path(args.jev_hints_file).read_text(encoding="utf-8"))
        hints_by_pilot = classifier_report["per_pilot_hints"]
    out = run_arm(
        args.arm, args.pilots, client, args.translator_backend, args.ollama_model, schemas_out,
        hints_by_pilot=hints_by_pilot, claude_model=args.claude_model, claude_effort=args.claude_effort,
    )
    text = json.dumps(out, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "detail"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
