#!/usr/bin/env python3
"""Runs the prose-to-schema translator fidelity test end to end:

    pilot.md (prose) --[translator.py, Ollama qwen3.5:9b]--> schema
    schema --[this file's rule cascade + target_resolve.py]--> Jev noul questions per scenario
    Jev (live, WorkersAIClient) answers -> predicted action

    pilot.md (the SAME untranslated prose) --[ground_truth.py, same Ollama model, real chat call]-->
    ground-truth action, on the same synthetic Observation (scenarios.py)

    compare predicted vs. ground truth -- this is the fidelity number. Ground truth is deliberately
    NOT the translator's own output and NOT Jev: it's what the entrant's actual words, run live, do
    -- see `ground_truth.py`'s module docstring for why that's the correct independent baseline.

Two Jev calls are avoided by design, matching the existing house-violet.md harness's own pattern:
every rule's condition for one (pilot, scenario) pair goes into ONE `systemone` call (Jev answers
all questions in parallel per call, per its own design -- `docs/jev-decision-model-research.md` §1).

Run it:

    python tools/jev/fidelity_harness.py                        # dry run: stub Jev answers, no network
    python tools/jev/fidelity_harness.py --live                 # real Jev via Cloudflare Workers AI
    python tools/jev/fidelity_harness.py --live --out runs/jev-translator-fidelity-2026-09-23.json

Ollama (translation + ground truth) always runs live against the host's Ollama -- there is no stub
for that half; it's free and local, so there's no cost reason to stub it, and stubbing it would
defeat the point (ground truth has to be real).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import statistics
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
    resolve_workers_ai_token,
)
from ground_truth import ground_truth_action  # noqa: E402
from scenarios import all_scenarios, build_observation, ABILITIES  # noqa: E402
from target_resolve import resolve_target  # noqa: E402
from translator import TranslatedSchema, render_markdown, translate_pilot  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
PILOTS = {
    "drums": REPO_ROOT / "prompts" / "pilots" / "drums.md",
    "keytar": REPO_ROOT / "prompts" / "pilots" / "keytar.md",
    "violin": REPO_ROOT / "prompts" / "pilots" / "violin.md",
}
TEAM = "violet"


@dataclass(frozen=True)
class BoundQuestion:
    id: str
    instructions: str
    criteria: dict


class DumbStubJevClient:
    """Plumbing-only dry run: seeded pseudo-random noul answers, no ground-truth concept (unlike
    `client.StubSystemOneClient`, which needs a hand-coded oracle per question -- this harness's
    questions are LLM-authored prose, not fixed formulas, so there is no such oracle to stub
    against). Exercises the wire shape and the rest of the pipeline; says nothing about fidelity."""

    def __init__(self, seed: int = 20260923):
        self._rng = random.Random(seed)

    def ask(self, state, questions: list) -> dict:
        answers = {q.id: {"noul": round(self._rng.uniform(0.1, 0.9), 4)} for q in questions}
        input_tokens = estimate_request_tokens(state, questions)
        return {"model": "stub-jev", "answers": answers, "usage": {"input_tokens": input_tokens, "output_tokens": 0}}


def describe_observation(obs: dict) -> str:
    """A short, dense, detailed paragraph (TypeSafe's own guidance, quoted in `serializer.py`),
    generic over any `Observation` -- not tied to one pilot's worksheet the way `serializer.
    state_paragraph` is. No precomputed distance/range: only raw positions, same as the real
    contract gives the game's own chat-model pilots (`tools/arena/pages/contract.mjs`)."""
    self_ = obs["self"]
    parts = [
        f"This is a {self_['team']}-team bearbot playing {self_['instrument']}, "
        f"{obs['clockSec']:.1f} sim-seconds into the match, at position "
        f"({self_['pos']['x']:.0f},{self_['pos']['y']:.0f}).",
        f"Its own hp is {self_['hp']:.0f} out of {self_['maxHp']:.0f} "
        f"({100*self_['hp']/self_['maxHp']:.0f}%).",
    ]
    cd_bits = [
        f"{name} cooldown {secs:.1f}s ({'ready' if secs == 0 else 'not ready'})"
        for name, secs in self_["cooldowns"].items()
    ]
    parts.append("Cooldowns: " + ", ".join(cd_bits) + ".")
    if obs["allies"]:
        parts.append(
            "Allies visible: "
            + "; ".join(
                f"{a['id']} at ({a['pos']['x']:.0f},{a['pos']['y']:.0f}) with "
                f"{a['hp']:.0f}/{a['maxHp']:.0f} hp"
                for a in obs["allies"]
            )
            + "."
        )
    else:
        parts.append("No allies visible nearby.")
    if obs["visibleEnemies"]:
        parts.append(
            "Visible enemies: "
            + "; ".join(
                f"{e['id']} ({e['kind']}) at ({e['pos']['x']:.0f},{e['pos']['y']:.0f}) with "
                f"{e['hp']:.0f}/{e['maxHp']:.0f} hp"
                for e in obs["visibleEnemies"]
            )
            + "."
        )
    else:
        parts.append("No enemies visible.")
    if obs["nearbyMinions"]:
        parts.append(
            "Nearby minions: "
            + "; ".join(
                f"{m['id']} (team {m['team']}) at ({m['pos']['x']:.0f},{m['pos']['y']:.0f})"
                for m in obs["nearbyMinions"]
            )
            + "."
        )
    else:
        parts.append("No minions nearby.")
    return " ".join(parts)


def run_prediction(client, schema: TranslatedSchema, obs: dict) -> dict:
    """One systemone call (all rule conditions batched), then the rule cascade in Python -- first
    "yes" wins, same posture as `rules.first_match` and as house-violet.md's own prose ("Take the
    FIRST rule that matches")."""
    questions = [BoundQuestion(r.id, r.condition, {"true": r.criteria_true, "false": r.criteria_false}) for r in schema.rules]
    state = describe_observation(obs)
    start = time.perf_counter()
    response = client.ask(state, questions)
    latency_sec = time.perf_counter() - start
    answers = response.get("answers", {})
    usage = response.get("usage", {})

    fired = None
    per_question = {}
    for r in schema.rules:
        cell = answers.get(r.id)
        if cell is None or "noul" not in cell:
            raise ValueError(f"systemone response missing a noul answer for {r.id!r}: {response!r}")
        val = cell["noul"]
        answered = val > 0.5
        per_question[r.id] = {"noul": val, "answered": answered}
        if answered and fired is None:
            fired = r

    if fired is not None:
        kind, ability, selector = fired.action_kind, fired.action_ability, fired.action_target_selector
    else:
        kind, ability, selector = schema.default_kind, schema.default_ability, schema.default_target_selector

    target = resolve_target(selector, obs)
    action = {"kind": kind}
    if ability:
        action["ability"] = ability
    if target is not None:
        action["target"] = target

    input_tokens = usage.get("input_tokens") or estimate_request_tokens(state, questions)
    return {
        "action": action,
        "fired_rule": fired.id if fired else None,
        "per_question": per_question,
        "input_tokens": input_tokens,
        "latency_sec": latency_sec,
    }


def _target_ids_match(pred_target, gt_target) -> bool | None:
    """`None` when the comparison doesn't apply (one side has no string-id target)."""
    if isinstance(pred_target, str) and isinstance(gt_target, str):
        return pred_target == gt_target
    return None


def run_pilot(pilot_name: str, pilot_text: str, schema: TranslatedSchema, client, ollama_model: str) -> dict:
    rows = []
    for scenario in all_scenarios():
        obs = build_observation(scenario, TEAM, schema.instrument)
        gt_action, gt_reply = ground_truth_action(pilot_text, obs, model=ollama_model)
        gt_kind = gt_action["kind"] if gt_action else "hold"  # unparseable reply -> the game's own hold path
        gt_target = gt_action.get("target") if gt_action else None
        gt_ability = gt_action.get("ability") if gt_action else None

        pred = run_prediction(client, schema, obs)
        pred_kind = pred["action"]["kind"]
        pred_target = pred["action"].get("target")
        pred_ability = pred["action"].get("ability")

        target_match = _target_ids_match(pred_target, gt_target)
        rows.append(
            {
                "scenario": scenario.name,
                "description": scenario.description,
                "ground_truth": {"kind": gt_kind, "target": gt_target, "ability": gt_ability, "raw_reply": gt_reply},
                "predicted": {
                    "kind": pred_kind,
                    "target": pred_target,
                    "ability": pred_ability,
                    "fired_rule": pred["fired_rule"],
                },
                "kind_match": pred_kind == gt_kind,
                "ability_match": (pred_ability == gt_ability) if (pred_kind == "ability" and gt_kind == "ability") else None,
                "target_id_match": target_match,
                "input_tokens": pred["input_tokens"],
                "latency_sec": pred["latency_sec"],
            }
        )
    return {"pilot": pilot_name, "rows": rows}


def summarize(pilot_report: dict) -> dict:
    rows = pilot_report["rows"]
    n = len(rows)
    kind_agree = sum(1 for r in rows if r["kind_match"])
    ability_rows = [r for r in rows if r["ability_match"] is not None]
    ability_agree = sum(1 for r in ability_rows if r["ability_match"])
    target_rows = [r for r in rows if r["target_id_match"] is not None]
    target_agree = sum(1 for r in target_rows if r["target_id_match"])
    latencies = sorted(r["latency_sec"] for r in rows)
    return {
        "pilot": pilot_report["pilot"],
        "n_scenarios": n,
        "kind_agreement_rate": kind_agree / n if n else None,
        "ability_agreement_rate": (ability_agree / len(ability_rows)) if ability_rows else None,
        "ability_agreement_n": len(ability_rows),
        "target_id_agreement_rate": (target_agree / len(target_rows)) if target_rows else None,
        "target_id_agreement_n": len(target_rows),
        "total_input_tokens": sum(r["input_tokens"] for r in rows),
        "mean_latency_sec": statistics.mean(latencies) if latencies else None,
    }


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--live", action="store_true", help="call real Jev via Cloudflare Workers AI; default is a stub Jev (Ollama half is always real)")
    p.add_argument("--model", default=WORKERS_AI_MODEL, help="Jev model id (workers-ai)")
    p.add_argument("--cloudflare-token-env", default="CLOUDFLARE_API_TOKEN")
    p.add_argument("--ollama-model", default="qwen3.5:9b", help="model for both translation and ground truth")
    p.add_argument("--pilots", nargs="*", default=list(PILOTS), choices=list(PILOTS))
    p.add_argument("--schemas-out", default=None, help="directory to write translated schemas (markdown + json) to")
    p.add_argument("--out", default=None, help="write the full JSON report here")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.live:
        token = resolve_workers_ai_token(args.cloudflare_token_env)
        client = WorkersAIClient(token, model=args.model)
    else:
        client = DumbStubJevClient()

    schemas_dir = Path(args.schemas_out) if args.schemas_out else None
    if schemas_dir:
        schemas_dir.mkdir(parents=True, exist_ok=True)

    pilot_reports = []
    for name in args.pilots:
        pilot_path = PILOTS[name]
        pilot_text = pilot_path.read_text(encoding="utf-8")
        primary, ultimate = ABILITIES[name]
        print(f"translating {name}.md ...", file=sys.stderr)
        schema = translate_pilot(
            pilot_text, f"prompts/pilots/{name}.md", name, primary, ultimate, model=args.ollama_model
        )
        print(f"  -> {len(schema.rules)} rules", file=sys.stderr)
        if schemas_dir:
            (schemas_dir / f"{name}.md").write_text(render_markdown(schema), encoding="utf-8")
            (schemas_dir / f"{name}.json").write_text(
                json.dumps(
                    {
                        "pilot_file": schema.pilot_file,
                        "instrument": schema.instrument,
                        "rules": [r.__dict__ for r in schema.rules],
                        "default_action": {
                            "kind": schema.default_kind,
                            "ability": schema.default_ability,
                            "target_selector": schema.default_target_selector,
                        },
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

        print(f"running {len(all_scenarios())} scenarios for {name} ...", file=sys.stderr)
        report = run_pilot(name, pilot_text, schema, client, args.ollama_model)
        pilot_reports.append(report)

    summaries = [summarize(r) for r in pilot_reports]
    all_rows = [row for r in pilot_reports for row in r["rows"]]
    overall_n = len(all_rows)
    overall_kind_agree = sum(1 for r in all_rows if r["kind_match"])
    total_input_tokens = sum(r["input_tokens"] for r in all_rows)

    out = {
        "mode": f"live (workers-ai, model={args.model})" if args.live else "dry-run (stub Jev, no network)",
        "ollama_model": args.ollama_model,
        "pilots": args.pilots,
        "n_scenarios_per_pilot": len(all_scenarios()),
        "per_pilot": summaries,
        "overall_kind_agreement_rate": overall_kind_agree / overall_n if overall_n else None,
        "overall_n": overall_n,
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
        "detail": pilot_reports,
    }
    text = json.dumps(out, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "detail"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
