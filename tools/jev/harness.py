#!/usr/bin/env python3
"""Runs the house-violet.md suitability test end to end: real checked-in Observation-proxy
snapshots -> Jev questions -> a stub or the real API -> compare against what qwen3.5:9b actually
did. See `docs/jev-decision-model-research.md` (memo, branch `docs/jev-preview-research`) for why
this test; `rules.py` for the rule -> question mapping; `serializer.py` for the state paragraph;
`client.py` for the wire shape and where the API key comes from.

WHAT "OBSERVATION SNAPSHOT" ACTUALLY MEANS HERE -- read this before trusting the word "Observation"
anywhere else in this harness. The brief that requested this harness assumed the checked-in run
logs (`runs/house-prompt-2026-09-21-r*.json`) contain the raw `Observation` object
(`tools/arena/pages/contract.mjs`: `self`, `allies`, `visibleEnemies`, `nearbyMinions`,
`nearbyTowers`) that was sent to the model each tick. They do not -- both structures the logs
actually contain were read in full before writing this file:

  - `decisions[]` -- `{tick, bot, reply, action, ms, cached}`. `action` is the *parsed reply*: the
    five worksheet fields house-violet.md's model self-reports (`hp`, `wave`, `tower`, `foe`, `cd`)
    plus the `kind`/`target`/`ability` it chose. No positions, no per-ability cooldown map (only the
    one active ability's cd), no minion identities, no enemy `kind`/hp beyond a bare foe id.
  - `checkpoints[]` -- a compact full-sim-state snapshot every 100 ticks: `b` (per-bearbot
    `[hp,x,y,alive,recalling]`), `t` (tower hp array), `n` (nexus hp array), `m` (a bare minion
    *count*, no per-minion data at all). Even less than `decisions[]` has for this purpose --
    no cooldowns, no per-minion or per-enemy identity.

So there is no raw `Observation` to replay. What this harness replays instead is the *worksheet*:
the reduced set of fields (hp, wave, tower-present, foe-present, cd) house-violet.md's own model
already extracted from its real Observation and wrote down before deciding -- which is exactly the
subset the seven rules consume (`rules.py`'s module docstring walks through why that subset covers
six of the seven rules, and what it can't cover for the third). This is a materially smaller test
than "feed Jev the full game state"; it is what the checked-in data actually supports, stated
plainly rather than assumed.

Run it:

    python tools/jev/harness.py                    # dry run, stub client, no network
    TYPESAFE_API_KEY=... python tools/jev/harness.py --live   # the real thing, once a key exists
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import (  # noqa: E402
    DEFAULT_MODEL,
    StubSystemOneClient,
    SystemOneClient,
    estimate_cost_usd,
    estimate_request_tokens,
    resolve_api_key,
)
from rules import (  # noqa: E402
    ActionBucket,
    Worksheet,
    bind_questions,
    bucket_for_action,
    bucket_for_rule,
    first_match,
)
from serializer import state_paragraph  # noqa: E402

HOUSE_VIOLET_PROMPT_FILE = "prompts/pilots/house-violet.md"
REPO_ROOT = Path(__file__).resolve().parents[2]

# `src/replay.ts`'s JAM_ROSTER -- bot index -> (team, lane, instrument). Fixed jam roster order,
# copied read-only (this Python tool can't import the frozen TS source; the value itself is
# read-only game topology, not sim behavior, so copying it does not touch "promptlane src is
# frozen" -- nothing about the sim, the arena, or a pilot prompt changes because this list exists).
JAM_ROSTER = [
    ("violet", "top", "drums"),
    ("violet", "mid", "keytar"),
    ("violet", "bottom", "violin"),
    ("green", "top", "drums"),
    ("green", "mid", "keytar"),
    ("green", "bottom", "violin"),
]


@dataclass(frozen=True)
class Snapshot:
    """One worksheet plus the ground-truth action the ruled model actually took for it."""

    source_file: str
    worksheet: Worksheet
    action_kind: str
    action_target: object
    ground_truth_bucket: ActionBucket


def default_run_paths() -> list[Path]:
    return sorted(REPO_ROOT.glob("runs/house-prompt-2026-09-21-r*.json"))


def load_house_violet_snapshots(run_paths: list[Path]) -> list[Snapshot]:
    """Every house-violet.md decision across `run_paths`: a real model call (not cached, not a
    parse failure) whose action classifies into one of the six buckets `rules.py` defines. A pure
    function over checked-in files -- see `test_harness.py`."""
    snapshots: list[Snapshot] = []
    for path in run_paths:
        log = json.loads(Path(path).read_text(encoding="utf-8"))
        sides = log["sides"]
        for dec in log["decisions"]:
            team, _lane, instrument = JAM_ROSTER[dec["bot"]]
            if sides[team]["promptFile"] != HOUSE_VIOLET_PROMPT_FILE:
                continue
            if "reply" not in dec:  # cached tick: no fresh worksheet, skip
                continue
            action = dec.get("action")
            if action is None:  # parse failure: no worksheet to replay
                continue
            bucket = bucket_for_action(action["kind"], action.get("target"), action["foe"], action["tower"])
            if bucket is None:  # an action shape the seven rules never produce (e.g. hold)
                continue
            ws = Worksheet(
                hp=action["hp"],
                wave=action["wave"],
                tower=action["tower"],
                foe=action["foe"],
                cd=action["cd"],
                instrument=instrument,
                team=team,
                tick=dec["tick"],
                clock_sec=dec["tick"] * log["tickDt"],
            )
            snapshots.append(
                Snapshot(
                    source_file=Path(path).name,
                    worksheet=ws,
                    action_kind=action["kind"],
                    action_target=action.get("target"),
                    ground_truth_bucket=bucket,
                )
            )
    return snapshots


@dataclass
class Prediction:
    snapshot: Snapshot
    predicted_bucket: ActionBucket
    per_question: dict  # id -> {"rule_number", "noul", "answered", "correct", "confidence"}
    input_tokens: int


def run_snapshot(client, snapshot: Snapshot) -> Prediction:
    """One systemone call (all six questions batched, matching how Jev actually answers -- in
    parallel, in one call) plus the rule-cascade and scoring that turn it into a `Prediction`."""
    ws = snapshot.worksheet
    bound = bind_questions(ws.instrument, ws)
    state = state_paragraph(ws)
    response = client.ask(state, bound)
    answers = response.get("answers", {})
    usage = response.get("usage", {})
    yes_no: dict[str, bool] = {}
    per_question = {}
    for q in bound:
        cell = answers.get(q.id)
        if cell is None or "noul" not in cell:
            raise ValueError(f"systemone response missing a noul answer for {q.id!r}: {response!r}")
        raw = cell["noul"]
        answered = raw > 0.5
        yes_no[q.id] = answered
        per_question[q.id] = {
            "rule_number": q.rule_number,
            "noul": raw,
            "answered": answered,
            "correct": answered == q.ground_truth_value,
            "confidence": abs(raw - 0.5) * 2,
        }
    predicted_bucket = bucket_for_rule(first_match(yes_no))
    input_tokens = usage.get("input_tokens") or estimate_request_tokens(state, bound)
    return Prediction(snapshot, predicted_bucket, per_question, input_tokens)


def build_report(predictions: list[Prediction]) -> dict:
    total = len(predictions)
    agree = sum(1 for p in predictions if p.predicted_bucket == p.snapshot.ground_truth_bucket)
    per_rule: dict[str, dict] = {}
    disagreements = []
    for p in predictions:
        for qid, info in p.per_question.items():
            row = per_rule.setdefault(qid, {"rule_number": info["rule_number"], "n": 0, "correct": 0, "wrong_confidences": []})
            row["n"] += 1
            if info["correct"]:
                row["correct"] += 1
            else:
                row["wrong_confidences"].append(info["confidence"])
        if p.predicted_bucket != p.snapshot.ground_truth_bucket:
            disagreements.append(
                {
                    "source_file": p.snapshot.source_file,
                    "tick": p.snapshot.worksheet.tick,
                    "instrument": p.snapshot.worksheet.instrument,
                    "predicted": p.predicted_bucket,
                    "actual": p.snapshot.ground_truth_bucket,
                }
            )
    per_rule_summary = {
        qid: {
            "rule_number": row["rule_number"],
            "n": row["n"],
            "accuracy": row["correct"] / row["n"] if row["n"] else None,
            "avg_confidence_when_wrong": statistics.mean(row["wrong_confidences"]) if row["wrong_confidences"] else None,
        }
        for qid, row in per_rule.items()
    }
    total_input_tokens = sum(p.input_tokens for p in predictions)
    return {
        "snapshot_count": total,
        "overall_agreement_rate": agree / total if total else None,
        "per_rule": per_rule_summary,
        "disagreements": disagreements,
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--live", action="store_true", help="call the real TypeSafe API (requires TYPESAFE_API_KEY); default is a dry run against a stub client")
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Jev model id (default {DEFAULT_MODEL!r} -- inferred, not confirmed by TypeSafe's own docs; see client.py)")
    p.add_argument("--api-key-env", default="TYPESAFE_API_KEY")
    p.add_argument("--runs", nargs="*", default=None, help="run log paths (default: the four checked-in house-prompt-2026-09-21 logs)")
    p.add_argument("--error-rate", type=float, default=0.1, help="stub client's induced error rate; ignored by --live")
    p.add_argument("--out", default=None, help="also write the JSON report to this path")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    run_paths = [Path(p) for p in args.runs] if args.runs else default_run_paths()
    snapshots = load_house_violet_snapshots(run_paths)
    if not snapshots:
        print("no house-violet.md snapshots found in the given run logs", file=sys.stderr)
        return 1

    if args.live:
        api_key = resolve_api_key(args.api_key_env)
        client = SystemOneClient(api_key, model=args.model)
    else:
        client = StubSystemOneClient(error_rate=args.error_rate)

    predictions = [run_snapshot(client, s) for s in snapshots]
    report = build_report(predictions)
    report["mode"] = "live" if args.live else "dry-run (stub client, no network)"
    report["run_paths"] = [str(p) for p in run_paths]

    text = json.dumps(report, indent=2)
    print(text)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
