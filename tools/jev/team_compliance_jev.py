#!/usr/bin/env python3
"""Live Jev half of the offline intent-compliance check (`docs/jev-vs-qwen32b-intent.md`). Reads
the scenario corpus `team_compliance_scenarios.py` built, asks Jev the same cascade
(`team_rules.bind_questions`) for each one, and compares Jev's predicted bucket against the
scenario's `ground_truth_bucket` -- a real network call per scenario, real `usage.input_tokens`,
real latency, no stub.

Run it: python tools/jev/team_compliance_jev.py --scenarios runs/jev-vs-qwen32b-scenarios.json \
            --out runs/jev-vs-qwen32b-compliance-jev.json
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import WorkersAIClient, estimate_cost_usd, resolve_workers_ai_token  # noqa: E402
from serializer_team import state_paragraph  # noqa: E402
from team_rules import Worksheet, bind_questions, bucket_for_rule, first_match  # noqa: E402


def _percentile(sorted_values: list[float], pct: float) -> float | None:
    if not sorted_values:
        return None
    k = (len(sorted_values) - 1) * pct
    lo, hi = int(k), min(int(k) + 1, len(sorted_values) - 1)
    if lo == hi:
        return sorted_values[lo]
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)


def run(scenarios: list[dict], client) -> dict:
    predictions = []
    per_rule: dict[str, dict] = {}
    disagreements = []
    total_input_tokens = 0
    latencies = []
    for s in scenarios:
        ws = Worksheet(
            hp=s["hp"], max_hp=s["max_hp"], wave=s["wave"], tower=s["tower"], foe=s["foe"],
            foe_is_bearbot=s["foe_is_bearbot"], foe_hp=None, foe_max_hp=None, cd=s["cd"],
            instrument=s["instrument"], team=s["team"], tick=s["tick"], clock_sec=s["clock_sec"],
        )
        bound = bind_questions(ws.instrument, ws)
        state = state_paragraph(ws)
        start = time.perf_counter()
        response = client.ask(state, bound)
        latency = time.perf_counter() - start
        latencies.append(latency)
        answers = response.get("answers", {})
        usage = response.get("usage", {})
        yes_no = {}
        for q in bound:
            cell = answers.get(q.id)
            if cell is None or "noul" not in cell:
                raise ValueError(f"systemone response missing a noul answer for {q.id!r}: {response!r}")
            raw = cell["noul"]
            answered = raw > 0.5
            yes_no[q.id] = answered
            row = per_rule.setdefault(q.id, {"rule_number": q.rule_number, "n": 0, "correct": 0})
            row["n"] += 1
            if answered == q.ground_truth_value:
                row["correct"] += 1
        predicted_bucket = bucket_for_rule(first_match(yes_no))
        input_tokens = usage.get("input_tokens") or 0
        total_input_tokens += input_tokens
        predictions.append({"scenario": s, "predicted_bucket": predicted_bucket})
        if predicted_bucket != s["ground_truth_bucket"]:
            disagreements.append(
                {
                    "source_file": s["source_file"],
                    "tick": s["tick"],
                    "instrument": s["instrument"],
                    "predicted": predicted_bucket,
                    "actual": s["ground_truth_bucket"],
                }
            )
    total = len(scenarios)
    agree = sum(1 for p in predictions if p["predicted_bucket"] == p["scenario"]["ground_truth_bucket"])
    sorted_lat = sorted(latencies)
    per_rule_summary = {
        qid: {"rule_number": row["rule_number"], "n": row["n"], "accuracy": row["correct"] / row["n"] if row["n"] else None}
        for qid, row in per_rule.items()
    }
    return {
        "model": "jev (workers-ai typesafe/jev)",
        "n": total,
        "overall_agreement_rate": agree / total if total else None,
        "per_question": per_rule_summary,
        "disagreements": disagreements,
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
        "latency": {
            "mean_sec": statistics.mean(latencies) if latencies else None,
            "p50_sec": _percentile(sorted_lat, 0.5),
            "p90_sec": _percentile(sorted_lat, 0.9),
        },
    }


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--scenarios", default="runs/jev-vs-qwen32b-scenarios.json")
    p.add_argument("--out", default="runs/jev-vs-qwen32b-compliance-jev.json")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--cloudflare-token-env", default="CLOUDFLARE_API_TOKEN")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    scenarios = json.loads(Path(args.scenarios).read_text(encoding="utf-8"))
    if args.limit is not None:
        scenarios = scenarios[: args.limit]
    token = resolve_workers_ai_token(args.cloudflare_token_env)
    client = WorkersAIClient(token)
    report = run(scenarios, client)
    text = json.dumps(report, indent=2)
    print(text)
    Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
