#!/usr/bin/env python3
"""Builds the offline intent-compliance corpus for the Jev-vs-qwen32b model test
(`docs/jev-vs-qwen32b-intent.md`). No network, no cost -- a pure function over the same checked-in
worksheets `tools/jev/harness.py` already reads (`runs/house-prompt-2026-09-21-r*.json`), reused
here only as a source of realistic (hp, wave, tower, foe, cd) combinations, NOT as "what the
correct answer was" -- that model (qwen3.5:9b playing house-violet.md's DIFFERENT cascade) is not
this test's ground truth. Ground truth here is `team_rules.ground_truth_bucket`, evaluated fresh
against THIS intent document's cascade.

WHAT'S APPROXIMATED, same posture as `rules.py`'s own KNOWN APPROXIMATION note -- flagged, not
hidden:

  - `max_hp`: exact, not approximated -- bearbots never level in this sim (`src/sim/entities.ts`'s
    `INSTRUMENTS` table is a fixed per-instrument constant: drums 220, keytar 140, violin 150), so a
    worksheet's `instrument` determines its owner's `max_hp` precisely.
  - `foe_is_bearbot`: inferred from the foe id's prefix (`bb-` = bearbot, `mn-` = minion, matching
    `src/sim/entities.ts`'s id scheme) -- exact, since the logs do carry the id, just not a `kind`
    field.
  - `foe_hp` / `foe_max_hp`: UNAVAILABLE -- the logs never captured the foe's own hp (see
    `harness.py`'s module docstring). Both are left `None` for every scenario. This makes violin's
    ability condition (`foe_hp < 50% of foe_max_hp`) evaluate to `False` in every scenario here,
    for both models being compared -- an equal, documented limitation on both sides of this offline
    check, not an advantage to either.

Run it: `python tools/jev/team_compliance_scenarios.py --out runs/jev-vs-qwen32b-scenarios.json`
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from team_rules import Instrument, Worksheet, ground_truth_bucket  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
HOUSE_VIOLET_PROMPT_FILE = "prompts/pilots/house-violet.md"

# src/replay.ts's JAM_ROSTER, copied read-only -- same posture as harness.py's own copy.
JAM_ROSTER = [
    ("violet", "top", "drums"),
    ("violet", "mid", "keytar"),
    ("violet", "bottom", "violin"),
    ("green", "top", "drums"),
    ("green", "mid", "keytar"),
    ("green", "bottom", "violin"),
]

# src/sim/entities.ts's INSTRUMENTS table -- fixed, no leveling, copied read-only.
MAX_HP: dict[Instrument, float] = {"drums": 220, "keytar": 140, "violin": 150}


def default_run_paths() -> list[Path]:
    return sorted(REPO_ROOT.glob("runs/house-prompt-2026-09-21-r*.json"))


def build_scenarios(run_paths: list[Path]) -> list[dict]:
    scenarios = []
    for path in run_paths:
        log = json.loads(Path(path).read_text(encoding="utf-8"))
        sides = log["sides"]
        for dec in log["decisions"]:
            team, _lane, instrument = JAM_ROSTER[dec["bot"]]
            if sides[team]["promptFile"] != HOUSE_VIOLET_PROMPT_FILE:
                continue
            if "reply" not in dec:
                continue
            action = dec.get("action")
            if action is None:
                continue
            foe = action.get("foe")
            foe_is_bearbot = bool(foe) and foe.startswith("bb-")
            ws = Worksheet(
                hp=action["hp"],
                max_hp=MAX_HP[instrument],
                wave=action["wave"],
                tower=action["tower"],
                foe=foe,
                foe_is_bearbot=foe_is_bearbot,
                foe_hp=None,
                foe_max_hp=None,
                cd=action["cd"],
                instrument=instrument,
                team=team,
                tick=dec["tick"],
                clock_sec=dec["tick"] * log["tickDt"],
            )
            scenarios.append(
                {
                    "source_file": Path(path).name,
                    "tick": ws.tick,
                    "clock_sec": ws.clock_sec,
                    "team": ws.team,
                    "instrument": ws.instrument,
                    "hp": ws.hp,
                    "max_hp": ws.max_hp,
                    "wave": ws.wave,
                    "tower": ws.tower,
                    "foe": ws.foe,
                    "foe_is_bearbot": ws.foe_is_bearbot,
                    "cd": ws.cd,
                    "ground_truth_bucket": ground_truth_bucket(ws),
                }
            )
    return scenarios


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--runs", nargs="*", default=None)
    p.add_argument("--out", default="runs/jev-vs-qwen32b-scenarios.json")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    run_paths = [Path(p) for p in args.runs] if args.runs else default_run_paths()
    scenarios = build_scenarios(run_paths)
    bucket_counts: dict[str, int] = {}
    for s in scenarios:
        bucket_counts[s["ground_truth_bucket"]] = bucket_counts.get(s["ground_truth_bucket"], 0) + 1
    print(f"{len(scenarios)} scenarios from {len(run_paths)} run(s); ground-truth bucket distribution: {bucket_counts}")
    Path(args.out).write_text(json.dumps(scenarios, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
