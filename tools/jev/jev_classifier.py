#!/usr/bin/env python3
"""A Jev CLASSIFIER stage for the prose-to-schema translator -- Jev is never asked to write a
schema (it has no free-text output primitive at all, `docs/jev-decision-model-research.md` §1,
`translator.py`'s own module docstring: producing new structure is not what a System One model is
built for). Ceryce, 2026-09-26 00:40 CT: "this seems like something Jev would be relatively good at,
it emits a confidence that the given prose is a specific type of rule or something like that" -- Jev
answering a `noul` question with a confidence is exactly `guard_noul_calibration.py`'s Phase 0 shape,
generalized here from "one guard, three wordings" to "every rule-shaped clause in a pilot, three
class questions each."

METHOD.

1. Split the pilot's prose into clauses. Reuses `segment.auto_segments` -- this repo's existing
   paragraph-then-sentence splitter -- deterministically, for the SPLIT only, dropping only the
   `boilerplate` segments (the fixed OBSERVATION/JSON tail). Its `rule`/`open_strategy`/`voice`
   LABEL is deliberately not used to pre-filter which clauses this classifier ever sees: checked
   live against the three reference pilots (`runs/jev-classifier-hand-key-2026-09-26.json`), that
   label is a false positive on violin's own identity sentence ("you are fast, you are fragile...")
   and, more importantly, a false NEGATIVE on the repo's own canonical class-1 guard example --
   violin's "you only take fights you can win in one phrase" is labelled `voice` by `segment.py`.
   Pre-filtering on that label would have made it structurally impossible for this classifier to
   ever see the one sentence the whole guard-tree design (`docs/translator-guards-and-defaults-
   spec.md` §2) was built around.
2. Ask Jev, in ONE `systemone` call per pilot (state = the full pilot prose, for context; every
   clause's three class questions batched together -- the same one-call-per-decision posture
   `fidelity_harness.run_prediction`/`guard_noul_calibration.run_calibration` already use), three
   `noul` questions per clause: does this exact sentence read as a GUARD (a judgment verdict that
   gates which whole set of other rules applies), a DEFAULT (an unconditional fallback action), or
   an ordinary RULE (a state condition paired with a specific action)? The three questions per
   clause are independent noul answers, not a forced single choice -- `classify_clause` below picks
   the argmax only when it clears 0.5, so a clause all three questions answer "no" to reports `None`
   (not one of the three) rather than a forced, low-confidence guess.
3. `format_hints` renders the winning classification per clause as one line -- e.g. `clause 5
   ("...you only take fights you can win...") reads as a guard, p=0.81` -- for the translator prompt
   to receive as extra context (task 1b: "hand those labels to the translator as hints"). This is
   NOT a rewrite of either translation prompt (`docs/translator-guards-and-defaults-spec.md` §9's
   A/B still sends Arm A's or Arm B's prompt text unmodified) -- the hints block is appended after
   it, identically regardless of arm, by the caller (`ab_prompt_harness.py`).

Run it:

    python tools/jev/jev_classifier.py --live --pilots drums keytar violin \\
        --out runs/jev-classifier-2026-09-26.json
    python tools/jev/jev_classifier.py --score runs/jev-classifier-2026-09-26.json \\
        runs/jev-classifier-hand-key-2026-09-26.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import (  # noqa: E402
    WORKERS_AI_MODEL,
    WorkersAIClient,
    estimate_cost_usd,
    estimate_request_tokens,
    resolve_workers_ai_token_provider,
)
from segment import auto_segments  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PILOTS = {
    "drums": REPO_ROOT / "prompts" / "pilots" / "drums.md",
    "keytar": REPO_ROOT / "prompts" / "pilots" / "keytar.md",
    "violin": REPO_ROOT / "prompts" / "pilots" / "violin.md",
}

CLASSES = ("guard", "default", "rule")

_QUESTION_TEXT = {
    "guard": (
        "Consider only this exact sentence from the prose above: \"{clause}\" Does this specific "
        "sentence state a strategic JUDGMENT VERDICT that decides which whole SET of other rules "
        "applies -- a gate whose yes/no answer changes which entire behavior applies -- rather than "
        "a plain state-condition-plus-action, or an unconditional always-do-this fallback?"
    ),
    "default": (
        "Consider only this exact sentence from the prose above: \"{clause}\" Does this specific "
        "sentence describe an UNCONDITIONAL FALLBACK action -- what the bot does whenever nothing "
        "more specific or urgent is happening -- rather than a specific triggered condition, or a "
        "strategic gating verdict?"
    ),
    "rule": (
        "Consider only this exact sentence from the prose above: \"{clause}\" Does this specific "
        "sentence describe an ORDINARY RULE: a specific game-state condition (a threshold, presence "
        "check, or ordering) paired with a specific action -- rather than a strategic gating verdict, "
        "or an unconditional always-on fallback?"
    ),
}
_CRITERIA = {
    "guard": {"true": "yes, this sentence is a gating judgment over other rules", "false": "no, it is not a gating judgment"},
    "default": {"true": "yes, this sentence is an unconditional fallback", "false": "no, it is not an unconditional fallback"},
    "rule": {"true": "yes, this sentence is an ordinary condition-plus-action rule", "false": "no, it is not an ordinary rule"},
}


@dataclass(frozen=True)
class BoundQuestion:
    id: str
    instructions: str
    criteria: dict


def clauses_for_pilot(pilot_text: str) -> list[tuple[int, str]]:
    """Every non-boilerplate clause of `pilot_text`, in `segment.auto_segments`'s own order --
    reused for the split only (see module docstring for why the label itself is not trusted here)."""
    return [(i, sent.strip()) for i, (label, sent) in enumerate(auto_segments(pilot_text)) if label != "boilerplate"]


def _clause_question_id(idx: int, cls: str) -> str:
    return f"c{idx}_{cls}"


def build_questions(clauses: list[tuple[int, str]]) -> list[BoundQuestion]:
    questions = []
    for idx, text in clauses:
        for cls in CLASSES:
            questions.append(
                BoundQuestion(
                    id=_clause_question_id(idx, cls),
                    instructions=_QUESTION_TEXT[cls].format(clause=text),
                    criteria=_CRITERIA[cls],
                )
            )
    return questions


def classify_pilot(client, pilot_name: str, pilot_text: str) -> dict:
    clauses = clauses_for_pilot(pilot_text)
    questions = build_questions(clauses)
    start = time.perf_counter()
    response = client.ask(pilot_text, questions)
    latency_sec = time.perf_counter() - start
    answers = response.get("answers", {})
    usage = response.get("usage", {})
    input_tokens = usage.get("input_tokens") or estimate_request_tokens(pilot_text, questions)

    rows = []
    for idx, text in clauses:
        per_class = {}
        for cls in CLASSES:
            cell = answers.get(_clause_question_id(idx, cls))
            if cell is None or "noul" not in cell:
                raise ValueError(f"systemone response missing a noul answer for clause {idx} class {cls!r}")
            per_class[cls] = cell["noul"]
        predicted, confidence = None, None
        best_cls = max(per_class, key=per_class.get)
        if per_class[best_cls] > 0.5:
            predicted, confidence = best_cls, per_class[best_cls]
        rows.append({"clause_index": idx, "text": text, "per_class": per_class, "predicted_class": predicted, "confidence": confidence})

    return {
        "pilot": pilot_name,
        "n_clauses": len(clauses),
        "rows": rows,
        "input_tokens": input_tokens,
        "estimated_cost_usd": estimate_cost_usd(input_tokens),
        "latency_sec": latency_sec,
    }


def format_hints(pilot_report: dict, max_chars: int = 100) -> str:
    """One line per clause Jev assigned a class to (confidence > 0.5), for the translator prompt to
    receive as extra context -- task 1b's "hand those labels to the translator as hints." Clauses
    Jev didn't classify (`predicted_class` is `None`) are omitted, not padded with a forced guess."""
    lines = []
    for row in pilot_report["rows"]:
        if row["predicted_class"] is None:
            continue
        quoted = row["text"].replace("\n", " ")
        if len(quoted) > max_chars:
            quoted = quoted[: max_chars - 1] + "…"
        lines.append(f'clause {row["clause_index"]} ("{quoted}") reads as a {row["predicted_class"]}, p={row["confidence"]:.2f}')
    if not lines:
        return ""
    return (
        "Jev-classifier hints (a separate model's confidence that specific sentences in the prose "
        "below read as a guard / an unconditional default / an ordinary rule -- informational only; "
        "translate the whole prose yourself, these are hints, not instructions to follow blindly):\n"
        + "\n".join(f"- {line}" for line in lines)
    )


def score_against_hand_key(classifier_report: dict, hand_key: dict) -> dict:
    """Compares `classify_pilot`'s per-clause `predicted_class` against the hand-labelled key
    (`runs/jev-classifier-hand-key-2026-09-26.json`, written and committed before this classifier
    code existed on this branch -- see that file's own `_provenance`). `hand_class` is one of
    guard/default/rule/voice; a hand label of `voice` matches a classifier `predicted_class` of
    `None` (Jev correctly found nothing to classify), not a fabricated fourth question."""
    hand_by_index = {row["clause_index"]: row for row in hand_key[classifier_report["pilot"]]}
    rows = []
    correct = 0
    confidences = []
    for row in classifier_report["rows"]:
        hand = hand_by_index[row["clause_index"]]
        predicted = row["predicted_class"]
        expected = hand["hand_class"]
        is_correct = (predicted == expected) or (predicted is None and expected == "voice")
        correct += is_correct
        if row["confidence"] is not None:
            confidences.append(row["confidence"])
        rows.append(
            {
                "clause_index": row["clause_index"],
                "text": row["text"],
                "hand_class": expected,
                "predicted_class": predicted,
                "confidence": row["confidence"],
                "correct": is_correct,
            }
        )
    n = len(rows)
    return {
        "pilot": classifier_report["pilot"],
        "n_clauses": n,
        "n_correct": correct,
        "accuracy": correct / n if n else None,
        "confidence_distribution": sorted(confidences),
        "rows": rows,
    }


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--live", action="store_true", help="call real Jev via Cloudflare Workers AI")
    p.add_argument("--model", default=WORKERS_AI_MODEL)
    p.add_argument("--cloudflare-token-env", default="CLOUDFLARE_API_TOKEN")
    p.add_argument("--pilots", nargs="*", default=list(PILOTS), choices=list(PILOTS))
    p.add_argument("--out", default=None)
    p.add_argument("--score", nargs=2, metavar=("CLASSIFIER_REPORT", "HAND_KEY"), default=None,
                    help="score an existing classifier report against the hand-labelled key, offline")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.score:
        classifier_path, hand_key_path = args.score
        classifier = json.loads(Path(classifier_path).read_text(encoding="utf-8"))
        hand_key = json.loads(Path(hand_key_path).read_text(encoding="utf-8"))
        per_pilot = {p["pilot"]: score_against_hand_key(p, hand_key) for p in classifier["per_pilot_detail"]}
        all_rows = [row for r in per_pilot.values() for row in r["rows"]]
        overall = {
            "n_clauses": len(all_rows),
            "n_correct": sum(1 for r in all_rows if r["correct"]),
            "accuracy": (sum(1 for r in all_rows if r["correct"]) / len(all_rows)) if all_rows else None,
            "confidence_distribution": sorted(r["confidence"] for r in all_rows if r["confidence"] is not None),
        }
        out = {"per_pilot": per_pilot, "overall": overall}
        print(json.dumps({k: v for k, v in out.items() if k != "per_pilot"} | {
            "per_pilot_accuracy": {p: r["accuracy"] for p, r in per_pilot.items()}
        }, indent=2))
        if args.out:
            Path(args.out).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        return 0

    if args.live:
        token_provider = resolve_workers_ai_token_provider(args.cloudflare_token_env)
        client = WorkersAIClient(token_provider, model=args.model)
        mode = f"live (workers-ai, model={args.model})"
    else:
        from fidelity_harness import DumbStubJevClient
        client = DumbStubJevClient()
        mode = "dry-run (stub Jev, no network)"

    per_pilot = []
    for name in args.pilots:
        pilot_text = PILOTS[name].read_text(encoding="utf-8")
        print(f"classifying {name}.md ({len(clauses_for_pilot(pilot_text))} clauses) ...", file=sys.stderr)
        report = classify_pilot(client, name, pilot_text)
        per_pilot.append(report)
        print(f"  -> {report['input_tokens']} input tokens, ${report['estimated_cost_usd']:.6f}", file=sys.stderr)

    total_input_tokens = sum(r["input_tokens"] for r in per_pilot)
    out = {
        "mode": mode,
        "pilots": args.pilots,
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
        "per_pilot_hints": {r["pilot"]: format_hints(r) for r in per_pilot},
        "per_pilot_detail": per_pilot,
    }
    text = json.dumps(out, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "per_pilot_detail"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
