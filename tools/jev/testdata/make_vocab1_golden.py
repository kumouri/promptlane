#!/usr/bin/env python3
"""Writes `vocab1_golden.json` from the code as it stands: the translator prompt for each
instrument, a hash of the description of every corpus observation (`vocab1_observations.json` plus
`scenarios.py`'s synthetic ones), and what every vocab-1 selector resolves to on each, under both
targeting rules. Made once from develop at eaf1b45, before vocab-2 existed; `test_vocab.py` holds
every later checkout to it. Re-running it on a later checkout would only copy that checkout's
behaviour, so don't, unless vocab-1 is meant to change (it never is: docs/vocabulary-spec.md §5).

    python tools/jev/testdata/make_vocab1_golden.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from fidelity_harness import describe_observation  # noqa: E402
from scenarios import ABILITIES, all_scenarios, build_observation  # noqa: E402
from target_resolve import TARGETING_RULES, resolve_target  # noqa: E402
import translator as T  # noqa: E402

PROSE = (HERE / "vocab1_prose.md").read_text(encoding="utf-8")


def corpus() -> list[dict]:
    obs = [o["obs"] for o in json.loads((HERE / "vocab1_observations.json").read_text(encoding="utf-8"))]
    for sc in all_scenarios():
        for team in ("violet", "green"):
            for inst in ABILITIES:
                obs.append(build_observation(sc, team, inst))
    return obs


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def resolutions(obs: dict) -> dict:
    out = {}
    for targeting in TARGETING_RULES:
        for sel in T.TARGET_SELECTORS:
            out[f"{targeting}:{sel}"] = resolve_target(sel, obs, targeting)
    return out


def main() -> int:
    obs = corpus()
    golden = {
        "made_from": "develop eaf1b45 (before vocab-2)",
        "prompts": {inst: T._translation_prompt(PROSE, inst, *ABILITIES[inst]) for inst in ABILITIES},
        "selectors": list(T.TARGET_SELECTORS),
        "descriptions": [sha(describe_observation(o)) for o in obs],
        "resolutions": [resolutions(o) for o in obs],
    }
    (HERE / "vocab1_golden.json").write_text(json.dumps(golden, indent=0) + "\n", encoding="utf-8")
    print(f"{len(obs)} observations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
