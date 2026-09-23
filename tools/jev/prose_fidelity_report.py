#!/usr/bin/env python3
"""Scores the translator's Jev-predicted actions AND qwen-on-prose (`ground_truth_action`) against
a THIRD, independent ground truth: hand-labeled "what the prose actually says to do", authored by a
subagent that read only the prose and the Observation, blind to both the translator's schema and to
qwen's own answers (`runs/jev-reference-schemas-2026-09-23/prose-ground-truth-*.json`).

Why this exists, distinct from `fidelity_harness.py`'s existing `kind_agreement`: that number scores
the translator against qwen's *live behavior*, which `docs/jev-decision-model-research.md` and
`runs/house-prompt-2026-09-21.md` both independently found is not a reliable oracle -- qwen follows
its own pilots' low-hp recall rule only ~46% of the time. A low translator-vs-qwen score is
therefore ambiguous: is the translator wrong, or is qwen wrong? Scoring both sides against a THIRD,
model-independent label answers the actual research question ("does the translated pilot do what the
entrant wrote?") without qwen's own unreliability muddying the answer.

Inputs (no network call -- pure comparison over two already-produced JSON files):
  - a fidelity_harness.py `--out` report (has, per scenario: `predicted` = translator-schema-via-Jev,
    `ground_truth` = qwen reading the raw prose live)
  - the hand-labeled `prose-ground-truth-<pilot>.json` files

Run it:
    python tools/jev/prose_fidelity_report.py runs/jev-translator-fidelity-fixed-2026-09-23.json \\
        runs/jev-reference-schemas-2026-09-23
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_prose_labels(reference_dir: Path, pilot: str) -> dict[str, dict]:
    path = reference_dir / f"prose-ground-truth-{pilot}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return {row["scenario"]: row["action"] for row in data["labels"]}


def score_pilot(fidelity_rows: list[dict], prose_labels: dict[str, dict]) -> dict:
    """Returns per-pilot translator-vs-prose and qwen-vs-prose kind agreement, over exactly the
    scenarios present in both `fidelity_rows` and `prose_labels` (a mismatch would silently drop
    rows and make `n` a lie, so this raises instead of proceeding on a partial join)."""
    missing = [r["scenario"] for r in fidelity_rows if r["scenario"] not in prose_labels]
    if missing:
        raise ValueError(f"prose labels missing scenarios: {missing}")

    n = len(fidelity_rows)
    translator_agree = 0
    qwen_agree = 0
    rows_out = []
    for row in fidelity_rows:
        label = prose_labels[row["scenario"]]
        t_kind = row["predicted"]["kind"]
        q_kind = row["ground_truth"]["kind"]
        p_kind = label["kind"]
        t_match = t_kind == p_kind
        q_match = q_kind == p_kind
        translator_agree += t_match
        qwen_agree += q_match
        rows_out.append(
            {
                "scenario": row["scenario"],
                "prose_label_kind": p_kind,
                "translator_kind": t_kind,
                "translator_matches_prose": t_match,
                "qwen_kind": q_kind,
                "qwen_matches_prose": q_match,
            }
        )
    return {
        "n_scenarios": n,
        "translator_prose_fidelity_rate": translator_agree / n if n else None,
        "qwen_prose_fidelity_rate": qwen_agree / n if n else None,
        "rows": rows_out,
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("fidelity_report", help="a fidelity_harness.py --out JSON report")
    p.add_argument("reference_dir", help="directory with prose-ground-truth-<pilot>.json files")
    p.add_argument("--out", default=None, help="write the full JSON report here")
    args = p.parse_args(argv)

    fidelity = json.loads(Path(args.fidelity_report).read_text(encoding="utf-8"))
    reference_dir = Path(args.reference_dir)

    per_pilot = {}
    for pilot_report in fidelity["detail"]:
        pilot = pilot_report["pilot"]
        labels = load_prose_labels(reference_dir, pilot)
        per_pilot[pilot] = score_pilot(pilot_report["rows"], labels)

    all_rows = [row for r in per_pilot.values() for row in r["rows"]]
    overall_n = len(all_rows)
    overall_translator = sum(1 for r in all_rows if r["translator_matches_prose"])
    overall_qwen = sum(1 for r in all_rows if r["qwen_matches_prose"])

    out = {
        "source_fidelity_report": args.fidelity_report,
        "source_reference_dir": args.reference_dir,
        "per_pilot": {
            pilot: {
                "n_scenarios": r["n_scenarios"],
                "translator_prose_fidelity_rate": r["translator_prose_fidelity_rate"],
                "qwen_prose_fidelity_rate": r["qwen_prose_fidelity_rate"],
            }
            for pilot, r in per_pilot.items()
        },
        "overall_n": overall_n,
        "overall_translator_prose_fidelity_rate": overall_translator / overall_n if overall_n else None,
        "overall_qwen_prose_fidelity_rate": overall_qwen / overall_n if overall_n else None,
        "detail": per_pilot,
    }
    text = json.dumps(out, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "detail"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
