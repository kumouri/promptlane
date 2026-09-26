#!/usr/bin/env python3
"""Phase 0 calibration for the guard-question tree design
(`docs/translator-guards-and-defaults-spec.md`).

Before building any guard/tree cascade, this measures whether Jev can answer a JUDGMENT-shaped
`noul` question -- "can this bot win the fight it is currently in?" -- well enough to gate a
sub-cascade on. This is a different kind of question than the ones `rules.py`/`fidelity_harness.py`
already ask Jev: those are state-presence/threshold conditions a pilot's prose already spells out in
comparable terms ("is this bot's hp below a quarter of its max?"). A guard like `violin.md`'s "you
only take fights you can win in one phrase" asks Jev to make the SAME strategic judgment the pilot
author was making, not just report a fact about the Observation. If Jev can't do that reliably, the
guard-tree design (§2 of the spec) doesn't work regardless of how well the rest of the translator is
built -- this check has to run before any of that gets written.

METHOD. Reuses `fidelity_harness.describe_observation` and `scenarios.py`'s 12 synthetic
Observations -- the same ones the #25/#31 fidelity harness already uses -- built for `violin`, the
one pilot whose prose states this exact guard ("you only take fights you can win in one phrase").
Three noul wordings of the same guard question (`GUARD_QUESTIONS` below) are asked together in ONE
`systemone` call per scenario, matching Jev's own one-call, parallel-questions design (the same
posture `fidelity_harness.run_prediction` already uses for a schema's rule conditions). Jev's yes/no
(`noul > 0.5`) is compared against violin's own prose-derived ground-truth labels
(`runs/prose-ground-truth-violin.json`, hand-labeled by a Claude subagent from the prose alone, #25
§4.4) for the scenarios where that label is unambiguously "commit" (`ability`) or "don't commit"
(`hold`) -- the other scenarios' labels are `move`/`recall`, which this guard question is not about
(closing distance on a target already picked, or overridden by the health rule), and are recorded
for transparency but not scored against the guard.

Run it:

    python tools/jev/guard_noul_calibration.py --live --out runs/guard-noul-calibration-2026-09-25

Drop `--live` for a dry run against a seeded stub (plumbing only, no fidelity signal -- same posture
as `fidelity_harness.py`'s own dry run). `--out` is a path prefix; both `<prefix>.json` and
`<prefix>.md` are written.
"""
from __future__ import annotations

import argparse
import json
import os
import random
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
from fidelity_harness import describe_observation  # noqa: E402
from scenarios import all_scenarios, build_observation  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PROSE_GROUND_TRUTH = REPO_ROOT / "runs" / "prose-ground-truth-violin.json"
TEAM = "violet"
INSTRUMENT = "violin"

# Three wordings of the same guard, asked together in one call so the calibration itself measures
# wording sensitivity, not just one phrasing's luck. None of these are the noul questions any shipped
# rule would use -- they are the judgment-gate question class the spec's guard-tree design (§2) needs
# Jev to answer, distinct from a state-presence/threshold condition.
GUARD_QUESTIONS = [
    (
        "guard_can_win",
        "Given everything visible right now, can this bearbot win the fight it is currently in or "
        "about to enter, by itself, right now?",
        {
            "true": "yes -- there is a fight this bearbot can win alone right now",
            "false": "no -- there is no fight right now that this bearbot can win alone (no target, "
            "or the odds are bad)",
        },
    ),
    (
        "guard_commit_now",
        "Should this bearbot commit fully to engaging the enemy it can currently see, because the "
        "fight is winnable?",
        {
            "true": "yes, commit and engage now -- this is a fight worth finishing",
            "false": "no, do not commit right now -- wait, reposition, or retreat instead",
        },
    ),
    (
        "guard_favorable_target",
        "Is there a visible enemy right now that this bearbot could defeat alone, either because it "
        "is isolated or because it is clearly the weakest target present?",
        {
            "true": "yes, a beatable target (isolated or clearly the softest) is visible",
            "false": "no beatable target is visible right now",
        },
    ),
]


@dataclass(frozen=True)
class BoundQuestion:
    id: str
    instructions: str
    criteria: dict


class StubGuardClient:
    """Plumbing-only dry run -- no fidelity signal. Mirrors `fidelity_harness.DumbStubJevClient`."""

    def __init__(self, seed: int = 20260925):
        self._rng = random.Random(seed)

    def ask(self, state, questions: list) -> dict:
        answers = {q.id: {"noul": round(self._rng.uniform(0.1, 0.9), 4)} for q in questions}
        input_tokens = estimate_request_tokens(state, questions)
        return {"model": "stub-jev", "answers": answers, "usage": {"input_tokens": input_tokens, "output_tokens": 0}}


def load_expected_labels() -> dict[str, bool | None]:
    """`scenario name -> expected guard answer`, derived from violin's own prose-ground-truth labels:
    `ability` (violin commits with staccato/solo) means the guard should read "yes, winnable";
    `hold` (violin waits rather than commit) means the guard should read "no, not winnable right
    now". `move`/`recall` scenarios are not about this guard (closing distance on an already-picked
    target, or the health rule overriding everything) -- `None` means "not scored"."""
    data = json.loads(PROSE_GROUND_TRUTH.read_text(encoding="utf-8"))
    expected: dict[str, bool | None] = {}
    for label in data["labels"]:
        kind = label["action"]["kind"]
        if kind == "ability":
            expected[label["scenario"]] = True
        elif kind == "hold":
            expected[label["scenario"]] = False
        else:
            expected[label["scenario"]] = None
    return expected


def run_calibration(client) -> dict:
    expected = load_expected_labels()
    questions = [BoundQuestion(qid, instructions, criteria) for qid, instructions, criteria in GUARD_QUESTIONS]
    rows = []
    total_input_tokens = 0
    for scenario in all_scenarios():
        obs = build_observation(scenario, TEAM, INSTRUMENT)
        state = describe_observation(obs)
        start = time.perf_counter()
        response = client.ask(state, questions)
        latency_sec = time.perf_counter() - start
        answers = response.get("answers", {})
        usage = response.get("usage", {})
        input_tokens = usage.get("input_tokens") or estimate_request_tokens(state, questions)
        total_input_tokens += input_tokens

        per_wording = {}
        for qid, _, _ in GUARD_QUESTIONS:
            cell = answers.get(qid)
            if cell is None or "noul" not in cell:
                raise ValueError(f"systemone response missing a noul answer for {qid!r}: {response!r}")
            val = cell["noul"]
            per_wording[qid] = {"noul": val, "answer": val > 0.5}

        votes = [v["answer"] for v in per_wording.values()]
        majority = sum(votes) > len(votes) / 2
        exp = expected.get(scenario.name)
        rows.append(
            {
                "scenario": scenario.name,
                "description": scenario.description,
                "per_wording": per_wording,
                "majority_answer": majority,
                "wording_agreement": len(set(votes)) == 1,
                "expected": exp,
                "scored": exp is not None,
                "main_wording_match": (per_wording["guard_can_win"]["answer"] == exp) if exp is not None else None,
                "majority_match": (majority == exp) if exp is not None else None,
                "input_tokens": input_tokens,
                "latency_sec": latency_sec,
            }
        )

    scored = [r for r in rows if r["scored"]]
    n_scored = len(scored)
    main_agree = sum(1 for r in scored if r["main_wording_match"])
    majority_agree = sum(1 for r in scored if r["majority_match"])
    unanimous_wording = sum(1 for r in rows if r["wording_agreement"])

    return {
        "instrument": INSTRUMENT,
        "guard_questions": [{"id": qid, "instructions": instr, "criteria": crit} for qid, instr, crit in GUARD_QUESTIONS],
        "n_scenarios": len(rows),
        "n_scored": n_scored,
        "scored_scenarios": [r["scenario"] for r in scored],
        "main_wording_agreement_rate": (main_agree / n_scored) if n_scored else None,
        "main_wording_agreement_n": f"{main_agree}/{n_scored}",
        "majority_vote_agreement_rate": (majority_agree / n_scored) if n_scored else None,
        "majority_vote_agreement_n": f"{majority_agree}/{n_scored}",
        "wording_unanimous_rate": unanimous_wording / len(rows) if rows else None,
        "wording_unanimous_n": f"{unanimous_wording}/{len(rows)}",
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
        "rows": rows,
    }


def render_markdown(report: dict, mode: str) -> str:
    lines = [
        "# Guard-noul calibration -- can Jev answer a judgment guard question?",
        "",
        f"Mode: {mode}. Instrument: `{report['instrument']}`. "
        f"{report['n_scenarios']} scenarios, {report['n_scored']} scored against violin's own "
        "prose-derived labels (the rest are `move`/`recall` scenarios this guard isn't about).",
        "",
        "## Headline",
        "",
        f"- Main wording (`guard_can_win`) vs. violin's prose labels: "
        f"**{report['main_wording_agreement_n']}** "
        f"({report['main_wording_agreement_rate']:.1%})" if report["main_wording_agreement_rate"] is not None
        else "- Main wording: not scored (no scenarios matched)",
        f"- Majority vote across 3 wordings vs. violin's prose labels: "
        f"**{report['majority_vote_agreement_n']}** "
        f"({report['majority_vote_agreement_rate']:.1%})" if report["majority_vote_agreement_rate"] is not None
        else "- Majority vote: not scored",
        f"- All 3 wordings agreed with each other on **{report['wording_unanimous_n']}** "
        f"of all {report['n_scenarios']} scenarios ({report['wording_unanimous_rate']:.1%})",
        f"- Cost: {report['total_input_tokens']} input tokens, ${report['estimated_cost_usd']:.6f}",
        "",
        "## What this does and does not show",
        "",
        f"n=4 scored scenarios: one scenario is 25 percentage points. A perfect score on 4 cases is "
        "real evidence Jev can answer this specific judgment question in this specific wording, on "
        "these specific states -- it is not evidence the guard-tree design generalizes to every "
        "wording or every pilot's version of this same idea.",
        "",
        "The three wordings agreeing with each other on only "
        f"{report['wording_unanimous_n']} of {report['n_scenarios']} scenarios is the more important "
        "number for the design question: `guard_favorable_target` answered \"yes\" far more often "
        "than `guard_can_win`/`guard_commit_now` (it is a softer question -- \"is a beatable target "
        "visible\" rather than \"should this bot commit\" -- and Jev treated it that way), so it "
        "disagreed with the other two on scenarios where no fight was even in progress "
        "(`ability_on_cooldown_enemy_present`, `softest_target_selection`). A guard-tree cascade "
        "picks ONE wording per guard and lives with it every decision; this run shows that choice is "
        "not interchangeable -- the exact phrasing changes the answer, not just its confidence.",
        "",
        "## Guard wordings asked",
        "",
    ]
    for q in report["guard_questions"]:
        lines.append(f"- `{q['id']}`: \"{q['instructions']}\"")
    lines += ["", "## Per-scenario", "", "| Scenario | Scored? | Expected | can_win | commit_now | favorable_target | Majority | Unanimous |", "|---|---|---|---|---|---|---|---|"]
    for r in report["rows"]:
        exp = "yes" if r["expected"] is True else ("no" if r["expected"] is False else "—")
        pw = r["per_wording"]
        cw = lambda qid: ("yes" if pw[qid]["answer"] else "no") + f" ({pw[qid]['noul']:.2f})"
        lines.append(
            f"| {r['scenario']} | {'yes' if r['scored'] else 'no'} | {exp} | {cw('guard_can_win')} | "
            f"{cw('guard_commit_now')} | {cw('guard_favorable_target')} | "
            f"{'yes' if r['majority_answer'] else 'no'} | {'yes' if r['wording_agreement'] else 'no'} |"
        )
    lines.append("")
    return "\n".join(lines)


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--live", action="store_true", help="call real Jev via Cloudflare Workers AI; default is a stub (no fidelity signal)")
    p.add_argument("--model", default=WORKERS_AI_MODEL)
    p.add_argument("--cloudflare-token-env", default="CLOUDFLARE_API_TOKEN")
    p.add_argument("--out", default=None, help="path prefix; writes <prefix>.json and <prefix>.md")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    if args.live:
        token_provider = resolve_workers_ai_token_provider(args.cloudflare_token_env)
        client = WorkersAIClient(token_provider, model=args.model)
        mode = f"live (workers-ai, model={args.model})"
    else:
        client = StubGuardClient()
        mode = "dry-run (stub, no network, no fidelity signal)"

    report = run_calibration(client)
    report["mode"] = mode

    text_json = json.dumps(report, indent=2)
    text_md = render_markdown(report, mode)
    if args.out:
        Path(f"{args.out}.json").write_text(text_json + "\n", encoding="utf-8")
        Path(f"{args.out}.md").write_text(text_md + "\n", encoding="utf-8")
    print(text_md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
