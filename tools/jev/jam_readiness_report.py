#!/usr/bin/env python3
"""Before/after numbers for the rule-3 fix (`runs/jev-jam-readiness-2026-09-25.md`).

Ground truth everywhere is house-violet.md's REAL seven rules on the exact live worksheet
(`rules.ground_truth_answers` with `foe_detail=True`) -- the rule the house bot is supposed to play,
not the offline harness's approximation of it.

    offline  Real live worksheets (`capture_house_worksheets.mjs`, foe kind/hp included), each asked
             to Jev twice: arm "approx" = what the live path asked before (no foe detail, the
             approximate q3 and the id-only foe clause); arm "exact" = what it asks now. Scores
             each arm's cascade bucket against the true rule. `--stub` runs with
             `StubSystemOneClient` (no network, no cost) to check the plumbing.

        python tools/jev/jam_readiness_report.py offline --worksheets runs/jev-jam-readiness-worksheets-2026-09-25.json \
            --out runs/jev-jam-readiness-offline-2026-09-25.json [--stub] [--contested 120 --other 80]

    bench    Scores the Jev side of `run_house_bench.mjs` output the same way: every real Jev
             decision's logged worksheet (jevPilot.ts logs foeKind/foeHp) against the true rule.

        python tools/jev/jam_readiness_report.py bench runs/jev-jam-readiness-bench-exact-*.json
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import StubSystemOneClient, WorkersAIClient, estimate_cost_usd, resolve_workers_ai_token_provider  # noqa: E402
from rules import Worksheet, bind_questions, bucket_for_rule, first_match, ground_truth_answers  # noqa: E402
from serializer import state_paragraph  # noqa: E402


def worksheet(d: dict, foe_detail: bool = True) -> Worksheet:
    return Worksheet(
        hp=float(d["hp"]), wave=int(d["wave"]), tower=d.get("tower"), foe=d.get("foe"), cd=float(d["cd"]),
        instrument=d["instrument"], team=d.get("team", "violet"), tick=int(d.get("tick", 0)),
        clock_sec=float(d.get("clockSec", 0.0)), foe_detail=foe_detail,
        foe_kind=d.get("foeKind") if foe_detail else None,
        foe_hp=float(d["foeHp"]) if foe_detail and d.get("foeHp") is not None else None,
    )


def truth_bucket(d: dict) -> str:
    return bucket_for_rule(first_match(ground_truth_answers(worksheet(d))))


def is_contested(d: dict) -> bool:
    """Where rule 3 decides the action and the approximation differs from the real rule's inputs:
    a violin/drums bot, ability ready, a foe present, and neither rule 1 nor rule 2 already fired."""
    ws = worksheet(d)
    return ws.instrument != "keytar" and ws.cd == 0 and ws.foe is not None and ws.hp >= 75 and not (ws.tower is not None and ws.wave == 0)


def sample(worksheets: list[dict], contested: int, other: int, seed: int = 20260925) -> list[dict]:
    rng = random.Random(seed)
    c_yes = [d for d in worksheets if is_contested(d) and truth_bucket(d) == "ability"]
    c_no = [d for d in worksheets if is_contested(d) and truth_bucket(d) != "ability"]
    rest = [d for d in worksheets if not is_contested(d)]
    half = contested // 2
    picked = rng.sample(c_no, min(len(c_no), contested - min(half, len(c_yes))))
    picked += rng.sample(c_yes, min(len(c_yes), contested - len(picked)))
    picked += rng.sample(rest, min(len(rest), other))
    return picked


def score(rows: list[dict], pred_key: str) -> dict:
    n = len(rows)
    agree = sum(r[pred_key] == r["truth"] for r in rows)
    contested = [r for r in rows if r["contested"]]
    over = [r for r in contested if r[pred_key] == "ability" and r["truth"] != "ability"]
    missed = [r for r in contested if r[pred_key] != "ability" and r["truth"] == "ability"]
    truth_not_ability = sum(r["truth"] != "ability" for r in contested)
    truth_ability = sum(r["truth"] == "ability" for r in contested)
    return {
        "n": n,
        "bucket_agreement": round(agree / n, 4) if n else None,
        "contested_n": len(contested),
        "contested_agreement": round(sum(r[pred_key] == r["truth"] for r in contested) / len(contested), 4) if contested else None,
        "ability_over_trigger": f"{len(over)}/{truth_not_ability}",
        "ability_over_trigger_rate": round(len(over) / truth_not_ability, 4) if truth_not_ability else None,
        "ability_missed": f"{len(missed)}/{truth_ability}",
        "ability_missed_rate": round(len(missed) / truth_ability, 4) if truth_ability else None,
    }


def run_offline(args) -> int:
    data = json.loads(Path(args.worksheets).read_text(encoding="utf-8"))
    scenarios = sample(data["worksheets"], args.contested, args.other)
    client = StubSystemOneClient() if args.stub else WorkersAIClient(resolve_workers_ai_token_provider())
    rows, tokens, latencies = [], 0, []
    for i, d in enumerate(scenarios):
        row = {"worksheet": d, "truth": truth_bucket(d), "contested": is_contested(d)}
        for arm, detail in (("approx", False), ("exact", True)):
            ws = worksheet(d, foe_detail=detail)
            started = time.perf_counter()
            resp = client.ask(state_paragraph(ws), bind_questions(ws.instrument, ws))
            latencies.append(time.perf_counter() - started)
            answers = {qid: float(a.get("noul", 0.0)) for qid, a in resp.get("answers", {}).items()}
            row[f"{arm}_answers"] = answers
            row[arm] = bucket_for_rule(first_match({q: v >= 0.5 for q, v in answers.items()}))
            tokens += int((resp.get("usage") or {}).get("input_tokens") or 0)
        rows.append(row)
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(scenarios)} scenarios, ${estimate_cost_usd(tokens):.4f} so far", file=sys.stderr)
    summary = {
        "source": args.worksheets,
        "mode": "stub" if args.stub else "live",
        "calls": 2 * len(rows),
        "input_tokens": tokens,
        "cost_usd": round(estimate_cost_usd(tokens), 4),
        "mean_latency_sec": round(sum(latencies) / len(latencies), 3) if latencies else None,
        "before_approx_q3": score(rows, "approx"),
        "after_exact_q3": score(rows, "exact"),
    }
    print(json.dumps(summary, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps({"summary": summary, "rows": rows}, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {args.out}", file=sys.stderr)
    return 0


def jev_decisions(bench: dict) -> list[dict]:
    """The Jev (violet, bots 0-2) side's real decisions whose reply carries a full worksheet."""
    out = []
    for log in bench["matches"]:
        for d in log["decisions"]:
            if d["bot"] >= 3 or d.get("cached") or not d.get("reply"):
                continue
            reply = d["reply"]
            if reply.startswith("[jev-fallback:"):
                reply = reply[reply.index("] ") + 2:]
            try:
                parsed = json.loads(reply)
            except ValueError:
                continue
            if "foeKind" in parsed and "instrument" in parsed:
                out.append(parsed)
    return out


def run_bench(args) -> int:
    for path in args.files:
        bench = json.loads(Path(path).read_text(encoding="utf-8"))
        decisions = jev_decisions(bench)
        rows = [{"pred": p["bucket"], "truth": truth_bucket(p), "contested": is_contested(p)} for p in decisions]
        buckets: dict[str, int] = {}
        for p in decisions:
            buckets[p["bucket"]] = buckets.get(p["bucket"], 0) + 1
        s = bench["summary"]["jevHouse"]
        report = {
            "file": path,
            "matches": bench["summary"]["matches"],
            "wins": bench["summary"]["wins"],
            "jev_decisions_scored": len(rows),
            "fallbacks": sum(1 for p in decisions if p.get("fallback")),
            "vs_true_rules": score(rows, "pred"),
            "jev_buckets": buckets,
            "jev_deaths": s["deaths"],
            "qwen_deaths": bench["summary"]["qwenHouse"]["deaths"],
            "jev_call_errors": s["decision_failures"]["callErrors"],
            "jev_latency": s["latency"],
        }
        print(json.dumps(report, indent=2))
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("offline")
    o.add_argument("--worksheets", required=True)
    o.add_argument("--out")
    o.add_argument("--contested", type=int, default=120)
    o.add_argument("--other", type=int, default=80)
    o.add_argument("--stub", action="store_true")
    b = sub.add_parser("bench")
    b.add_argument("files", nargs="+")
    args = p.parse_args(argv)
    return run_offline(args) if args.cmd == "offline" else run_bench(args)


if __name__ == "__main__":
    raise SystemExit(main())
