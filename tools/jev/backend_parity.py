#!/usr/bin/env python3
"""Backend parity: the same recorded decision states sent to BOTH Jev transports -- Cloudflare
Workers AI (`--jev-backend workers-ai`) and TypeSafe's own API (`--jev-backend typesafe`) -- to say
whether switching the default changes what Jev answers, how fast, and what it costs
(`runs/jev-backend-parity-2026-09-30.md`).

Two recorded decision sets, the two shapes of question the arena actually asks:

    house   house-violet.md's seven rule conditions (`rules.bind_questions`, what `house_server.py`
            asks), on real live worksheets captured from matches
            (`runs/jev-jam-readiness-worksheets-2026-09-25.json`), sampled like
            `jam_readiness_report.py`: rule-3-contested states plus the rest.
    schema  every node of a compiled tier cascade (`runs/house-tiers-schemas-{easy,medium,hard}-*.json`,
            what `schema_server.py` asks in a Jam-shape match) on the fixed fidelity observations
            (`scenarios.py`), for each instrument and both teams.

Every question is a `noul` -- the only question type the game's wire contract uses -- so "question
type" below means the rule condition (house: q1..q7; schema: one row per tier).

Jev is not deterministic (the same call can flip), so a cross-backend disagreement only means
something against each backend's disagreement WITH ITSELF. Each decision is therefore sent
`--repeats` times (default 2) to each backend, and the report gives, per question type:

    cross      agreement between a workers-ai answer and a typesafe answer (all repeat pairings)
    self-wa    agreement between two workers-ai answers to the same state
    self-ts    agreement between two typesafe answers to the same state
    |dnoul|    mean absolute difference of the raw probabilities, cross-backend

If cross ~= self, the two transports serve the same model. Calls alternate which backend goes
first so drift over the run can't favour either. Latency is client-side wall time per call (the
time a game tick waits); cost is real `usage.input_tokens` x $0.042/M (both list the same price).

    python tools/jev/backend_parity.py --stub                      # plumbing, no network, $0
    python tools/jev/backend_parity.py --out-json runs/x.json      # live, both backends

Live needs both credentials: a Cloudflare token (as `house_server.py`) and `$PROMPTLANE_JEV_API_KEY`
(a Windows User variable is read from the registry). `--budget-usd` (default 0.50) stops
scheduling new decisions once the estimated spend across both backends reaches it.
"""
from __future__ import annotations

import argparse
import itertools
import json
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from client import JEV_BACKENDS, PRICE_IN_PER_M, estimate_cost_usd, make_jev_client  # noqa: E402
from compile import schema_from_dict  # noqa: E402
from fidelity_harness import BoundQuestion, DumbStubJevClient, describe_observation  # noqa: E402
from jam_readiness_report import sample, worksheet  # noqa: E402
from rules import bind_questions, bucket_for_rule, first_match  # noqa: E402
from scenarios import all_scenarios, build_observation  # noqa: E402
from serializer import state_paragraph  # noqa: E402
from translator import evaluate_schema, node_answers, schema_questions  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WORKSHEETS = ROOT / "runs" / "jev-jam-readiness-worksheets-2026-09-25.json"
DEFAULT_TIERS = {t: ROOT / "runs" / f"house-tiers-schemas-{t}-2026-09-30.json" for t in ("easy", "medium", "hard")}


def house_items(path: Path, contested: int, other: int) -> list[dict]:
    """Recorded live worksheets -> the exact (state, questions) `house_server.py` sends, with the
    decision label it would play (rule cascade -> bucket; answers >= 0.5 are yes, as there)."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    items = []
    for d in sample(data["worksheets"], contested, other):
        ws = worksheet(d, foe_detail=True)
        items.append({
            "family": "house",
            "key": f"house seed={d.get('seed')} tick={d.get('tick')} {d['instrument']}",
            "state": state_paragraph(ws),
            "questions": bind_questions(ws.instrument, ws),
            "yes": lambda v: v >= 0.5,
            "decide": lambda yes: bucket_for_rule(first_match(yes)),
        })
    return items


def schema_items(tiers: dict[str, Path], teams=("violet", "green")) -> list[dict]:
    """Each tier's compiled cascade x instrument x fidelity observation x team -> the exact request
    `schema_server.py` makes (`fidelity_harness.run_prediction`: every node in one call, > 0.5 is yes)."""
    items = []
    for tier, path in tiers.items():
        schemas = json.loads(Path(path).read_text(encoding="utf-8"))
        for instrument, raw in schemas.items():
            schema = schema_from_dict(raw)
            questions = [BoundQuestion(qid, q.condition, {"true": q.criteria_true, "false": q.criteria_false})
                         for qid, q in schema_questions(schema.root)]  # an AND rule asks each of its questions
            for scenario in all_scenarios():
                for team in teams:
                    obs = build_observation(scenario, team, instrument)
                    items.append({
                        "family": f"schema:{tier}",
                        "key": f"{tier} {instrument} {scenario.name} {team}",
                        "state": describe_observation(obs),
                        "questions": questions,
                        "yes": lambda v: v > 0.5,
                        "decide": (lambda s: lambda yes: _action_label(evaluate_schema(s, node_answers(s.root, yes))))(schema),
                    })
    return items


def _action_label(action) -> str:
    return ":".join(x for x in (action.kind, action.ability, action.target_selector) if x)


def ask_once(client, item: dict) -> dict:
    started = time.perf_counter()
    try:
        resp = client.ask(item["state"], item["questions"])
    except Exception as err:  # noqa: BLE001 -- a failed call is a data point, not a crash
        return {"ok": False, "sec": time.perf_counter() - started, "error": f"{type(err).__name__}: {str(err)[:200]}"}
    sec = time.perf_counter() - started
    answers = {qid: float(a.get("noul", 0.0)) for qid, a in (resp.get("answers") or {}).items()}
    yes = {qid: item["yes"](v) for qid, v in answers.items()}
    usage = resp.get("usage") or {}
    return {
        "ok": True,
        "sec": sec,
        "model": resp.get("model"),
        "answers": answers,
        "decision": item["decide"](yes),
        "input_tokens": int(usage.get("input_tokens") or 0),
        "output_tokens": int(usage.get("output_tokens") or 0),
    }


class Spend:
    def __init__(self, budget_usd: float | None):
        self.budget_usd = budget_usd
        self.tokens = 0
        self.lock = threading.Lock()

    def add(self, tokens: int) -> None:
        with self.lock:
            self.tokens += tokens

    def exhausted(self) -> bool:
        with self.lock:
            return self.budget_usd is not None and estimate_cost_usd(self.tokens) >= self.budget_usd


def run(items: list[dict], clients: dict, repeats: int = 2, workers: int = 4, budget_usd: float | None = 0.50,
        progress=None) -> list[dict]:
    """Each item to every backend `repeats` times; which backend goes first alternates per call
    round. Items past the budget are skipped (recorded as `skipped`), never half-run."""
    spend = Spend(budget_usd)
    names = list(clients)

    def one(i_item):
        i, item = i_item
        row = {"family": item["family"], "key": item["key"], "calls": {n: [] for n in names}}
        if spend.exhausted():
            row["skipped"] = "budget"
            return row
        for r in range(repeats):
            order = names if (i + r) % 2 == 0 else list(reversed(names))
            for name in order:
                res = ask_once(clients[name], item)
                spend.add(res.get("input_tokens", 0))
                row["calls"][name].append(res)
        if progress:
            progress(i)
        return row

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(one, enumerate(items)))


def _pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def _rate(pairs: list[bool]) -> float | None:
    return round(sum(pairs) / len(pairs), 4) if pairs else None


def _pairs(a_calls: list[dict], b_calls: list[dict], same: bool):
    """Every (a, b) pairing of successful calls: across two backends, or distinct repeats of one."""
    a_ok = [c for c in a_calls if c["ok"]]
    b_ok = [c for c in b_calls if c["ok"]]
    if same:
        return list(itertools.combinations(a_ok, 2))
    return list(itertools.product(a_ok, b_ok))


def summarize(rows: list[dict], names: list[str], yes_by_family: dict) -> dict:
    a, b = names
    ran = [r for r in rows if "skipped" not in r]
    per_backend = {}
    for n in names:
        calls = [c for r in ran for c in r["calls"][n]]
        ok = [c for c in calls if c["ok"]]
        secs = [c["sec"] for c in ok]
        tok = [c["input_tokens"] for c in ok]
        mean_tok = sum(tok) / len(tok) if tok else 0.0
        per_backend[n] = {
            "calls": len(calls),
            "errors": len(calls) - len(ok),
            "error_samples": sorted({c["error"] for c in calls if not c["ok"]})[:5],
            "models": sorted({c.get("model") or "?" for c in ok}),
            "latency_p50_ms": round(1000 * _pct(secs, 0.50), 1) if secs else None,
            "latency_p95_ms": round(1000 * _pct(secs, 0.95), 1) if secs else None,
            "latency_mean_ms": round(1000 * sum(secs) / len(secs), 1) if secs else None,
            "latency_max_ms": round(1000 * max(secs), 1) if secs else None,
            "input_tokens_total": sum(tok),
            "input_tokens_mean": round(mean_tok, 1),
            "output_tokens_mean": round(sum(c["output_tokens"] for c in ok) / len(ok), 1) if ok else 0.0,
            "cost_usd": round(estimate_cost_usd(sum(tok)), 5),
            "cost_per_1000_decisions_usd": round(mean_tok * PRICE_IN_PER_M / 1_000_000 * 1000, 5),
        }

    def question_rows(family_filter, by_question: bool):
        buckets: dict[str, dict[str, list]] = {}
        for r in ran:
            if not family_filter(r["family"]):
                continue
            yes = yes_by_family[r["family"]]
            groups = {}
            for kind, pairs in (("cross", _pairs(r["calls"][a], r["calls"][b], False)),
                                (f"self_{a}", _pairs(r["calls"][a], [], True)),
                                (f"self_{b}", _pairs(r["calls"][b], [], True))):
                for x, y in pairs:
                    for qid in set(x["answers"]) & set(y["answers"]):
                        label = qid if by_question else r["family"]
                        g = groups.setdefault(label, {})
                        g.setdefault(kind, []).append(yes(x["answers"][qid]) == yes(y["answers"][qid]))
                        if kind == "cross":
                            g.setdefault("dnoul", []).append(abs(x["answers"][qid] - y["answers"][qid]))
            for label, g in groups.items():
                dest = buckets.setdefault(label, {})
                for k, v in g.items():
                    dest.setdefault(k, []).extend(v)
        out = {}
        for label, g in sorted(buckets.items()):
            out[label] = {
                "n_cross_pairs": len(g.get("cross", [])),
                "cross": _rate(g.get("cross", [])),
                f"self_{a}": _rate(g.get(f"self_{a}", [])),
                f"self_{b}": _rate(g.get(f"self_{b}", [])),
                "mean_abs_dnoul": round(sum(g["dnoul"]) / len(g["dnoul"]), 4) if g.get("dnoul") else None,
            }
        return out

    decisions = {}
    for fam in sorted({r["family"] for r in ran}) + ["all"]:
        rs = [r for r in ran if fam == "all" or r["family"] == fam]
        agg = {"cross": [], f"self_{a}": [], f"self_{b}": []}
        for r in rs:
            for kind, pairs in (("cross", _pairs(r["calls"][a], r["calls"][b], False)),
                                (f"self_{a}", _pairs(r["calls"][a], [], True)),
                                (f"self_{b}", _pairs(r["calls"][b], [], True))):
                agg[kind].extend(x["decision"] == y["decision"] for x, y in pairs)
        decisions[fam] = {"n_states": len(rs), **{k: _rate(v) for k, v in agg.items()}}

    return {
        "backends": names,
        "states": len(rows),
        "states_run": len(ran),
        "states_skipped": len(rows) - len(ran),
        "per_backend": per_backend,
        "per_question_house": question_rows(lambda f: f == "house", by_question=True),
        "per_family": question_rows(lambda f: True, by_question=False),
        "decision_agreement": decisions,
    }


def render_markdown(s: dict) -> str:
    a, b = s["backends"]
    lines = [f"States: {s['states_run']} run ({s['states_skipped']} skipped).", "",
             "| backend | calls | errors | p50 ms | p95 ms | mean ms | max ms | mean input tokens | $ / 1,000 decisions | spent |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for n in s["backends"]:
        p = s["per_backend"][n]
        lines.append(f"| {n} | {p['calls']} | {p['errors']} | {p['latency_p50_ms']} | {p['latency_p95_ms']} | "
                     f"{p['latency_mean_ms']} | {p['latency_max_ms']} | {p['input_tokens_mean']} | "
                     f"${p['cost_per_1000_decisions_usd']:.4f} | ${p['cost_usd']:.4f} |")
    for title, table in (("Per question type (yes/no at the server's threshold)", s["per_family"]),
                         ("House rule conditions, one row per question", s["per_question_house"])):
        lines += ["", f"**{title}**", "",
                  f"| question | cross pairs | cross | self {a} | self {b} | mean abs dnoul |",
                  "|---|---:|---:|---:|---:|---:|"]
        for label, r in table.items():
            lines.append(f"| {label} | {r['n_cross_pairs']} | {r['cross']} | {r[f'self_{a}']} | {r[f'self_{b}']} | {r['mean_abs_dnoul']} |")
    lines += ["", "**Decision the server would play (bucket / action)**", "",
              f"| set | states | cross | self {a} | self {b} |", "|---|---:|---:|---:|---:|"]
    for fam, r in s["decision_agreement"].items():
        lines.append(f"| {fam} | {r['n_states']} | {r['cross']} | {r[f'self_{a}']} | {r[f'self_{b}']} |")
    return "\n".join(lines) + "\n"


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--stub", action="store_true", help="both backends are seeded stubs: plumbing only, no network, $0")
    p.add_argument("--worksheets", default=str(DEFAULT_WORKSHEETS))
    p.add_argument("--house-contested", type=int, default=60)
    p.add_argument("--house-other", type=int, default=60)
    p.add_argument("--no-schema", action="store_true", help="skip the compiled-tier set")
    p.add_argument("--repeats", type=int, default=2, help="calls per backend per state (>= 2 for the self-agreement floor)")
    p.add_argument("--workers", type=int, default=4, help="states in flight at once (a match has 6 bots asking)")
    p.add_argument("--timeout", type=float, default=30.0)
    p.add_argument("--budget-usd", type=float, default=0.50, help="both backends together; negative disables")
    p.add_argument("--out-json", default=None)
    p.add_argument("--out-md", default=None)
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    items = house_items(Path(args.worksheets), args.house_contested, args.house_other)
    if not args.no_schema:
        items += schema_items(DEFAULT_TIERS)
    random.Random(20260930).shuffle(items)  # interleave families so drift over the run hits both evenly
    yes_by_family = {it["family"]: it["yes"] for it in items}
    if args.stub:
        clients = {"workers-ai": DumbStubJevClient(seed=1), "typesafe": DumbStubJevClient(seed=2)}
    else:
        # fallback=False: a typesafe call that failed over would be measuring Workers AI
        clients = {name: make_jev_client(name, timeout=args.timeout, fallback=False) for name in JEV_BACKENDS}
    total = len(items)
    started = time.monotonic()

    def progress(i):
        if (i + 1) % 25 == 0:
            print(f"  ~{i + 1}/{total} states, {time.monotonic() - started:.0f}s", file=sys.stderr, flush=True)

    budget = None if args.budget_usd < 0 else args.budget_usd
    rows = run(items, clients, repeats=args.repeats, workers=args.workers, budget_usd=budget, progress=progress)
    summary = summarize(rows, list(clients), yes_by_family)
    summary.update({"mode": "stub" if args.stub else "live", "repeats": args.repeats, "workers": args.workers,
                    "wall_sec": round(time.monotonic() - started, 1)})
    md = render_markdown(summary)
    print(md)
    if args.out_json:
        Path(args.out_json).write_text(json.dumps({"summary": summary, "rows": rows}, indent=1) + "\n", encoding="utf-8")
        print(f"wrote {args.out_json}", file=sys.stderr)
    if args.out_md:
        Path(args.out_md).write_text(md, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
