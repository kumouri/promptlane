#!/usr/bin/env python3
"""Calibrates vocab-2's fight verdict (`vocab.fight_verdict`, docs/vocabulary-spec.md §4.1 A3 and
§7 D4) on recorded matches, with no model call. Input is `tools/match/fight_samples.mjs`' JSONL:
what a bot saw at a decision where an enemy bearbot was in sight, and every bearbot's hp
`horizon` seconds later.

The outcome the verdict is scored against is the spec's: over the next 5 s, which side of the
fight near the bot lost more hp. A side is the bearbots the verdict counted (the bot and its allies
within 260; the enemy bearbots it could see), a dead bearbot's loss is all its hp, and a gain (a
heal at base) counts as no loss. The exchange is their loss minus ours: positive, our side won it.

For each candidate setting (the hp ratio, how a tower over the fight counts -- `vocab.fight_verdict`'s
`tower_rule` -- and the outnumbered-by-two veto) it reports how often "stronger" was followed by a
won exchange and "weaker" by a lost one, among samples where any hp changed hands, and how many
samples got a decisive verdict at all.

    node tools/match/fight_samples.mjs --out samples.jsonl <logs...>
    python tools/jev/calibrate_fight.py samples.jsonl [--markdown]
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vocab import OUTNUMBERED_BY, STRONGER_HP_RATIO, TOWER_RULE, VISION_RADIUS, dist, fight, map_spec  # noqa: E402

RATIOS = (1.0, 1.1, 1.25, 1.5, 2.0)
TOWER_RULES = ("first", "or", "off")
VETOES = (None, 2)


def exchange(sample: dict) -> float:
    """Their side's hp loss minus ours over the horizon (positive: ours won the exchange)."""
    obs, future = sample["obs"], sample["future"]
    me = obs["self"]["pos"]
    mine = [obs["self"]] + [a for a in obs["allies"] if dist(me, a["pos"]) <= VISION_RADIUS]
    theirs = [e for e in obs["visibleEnemies"] if e.get("kind") == "bearbot"]

    def loss(units):
        return sum(max(0.0, u["hp"] - future.get(u["id"], u["hp"])) for u in units)

    return loss(theirs) - loss(mine)


@dataclass
class Tally:
    n: int = 0
    by_verdict: dict = field(default_factory=lambda: {v: [0, 0, 0] for v in ("stronger", "even", "weaker")})  # won, lost, nothing
    exchange_sum: dict = field(default_factory=lambda: {"stronger": 0.0, "even": 0.0, "weaker": 0.0})

    def add(self, verdict: str, x: float) -> None:
        self.n += 1
        cell = self.by_verdict[verdict]
        cell[0 if x > 0 else 1 if x < 0 else 2] += 1
        self.exchange_sum[verdict] += x

    def row(self) -> dict:
        s, w, e = (self.by_verdict[v] for v in ("stronger", "weaker", "even"))
        s_dec, w_dec = s[0] + s[1], w[0] + w[1]
        correct = s[0] + w[1]
        decisive = s_dec + w_dec
        n_s, n_w, n_e = sum(s), sum(w), sum(e)
        return {
            "samples": self.n,
            "stronger": n_s, "weaker": n_w, "even": n_e,
            "coverage": (n_s + n_w) / self.n if self.n else None,
            "stronger_won": s[0] / s_dec if s_dec else None,
            "weaker_lost": w[1] / w_dec if w_dec else None,
            "accuracy": correct / decisive if decisive else None,
            "mean_exchange": {v: (self.exchange_sum[v] / max(1, sum(self.by_verdict[v]))) for v in self.exchange_sum},
        }


def calibrate(samples, ratios=RATIOS) -> list[dict]:
    settings = list(itertools.product(ratios, TOWER_RULES, VETOES))
    tallies = {s: Tally() for s in settings}
    for sample in samples:
        obs = sample["obs"]
        spec = map_spec(sample.get("map"))
        x = exchange(sample)
        for ratio, towers, veto in settings:
            fb = fight(obs, spec, ratio=ratio, tower_rule=towers, outnumbered_by=veto)
            if fb.verdict != "none":
                tallies[(ratio, towers, veto)].add(fb.verdict, x)
    return [{"ratio": ratio, "towers": towers, "veto": veto, **t.row()} for (ratio, towers, veto), t in tallies.items()]


def _pct(x) -> str:
    return "–" if x is None else f"{100 * x:.1f} %"


def markdown(rows: list[dict]) -> str:
    lines = [
        "| hp ratio | tower clause | outnumbered veto | decisive verdicts | stronger → won | weaker → lost | accuracy | mean exchange (stronger / even / weaker) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in sorted(rows, key=lambda r: (r["ratio"], TOWER_RULES.index(r["towers"]), r["veto"] is not None)):
        me = r["mean_exchange"]
        mark = " **(shipped)**" if (r["ratio"], r["towers"], r["veto"]) == (STRONGER_HP_RATIO, TOWER_RULE, OUTNUMBERED_BY) else ""
        lines.append(
            f"| {r['ratio']:g}{mark} | {r['towers']} | {r['veto'] or 'off'} | {_pct(r['coverage'])} "
            f"({r['stronger']} / {r['weaker']} of {r['samples']}) | {_pct(r['stronger_won'])} | {_pct(r['weaker_lost'])} | "
            f"{_pct(r['accuracy'])} | {me['stronger']:+.1f} / {me['even']:+.1f} / {me['weaker']:+.1f} |"
        )
    return "\n".join(lines)


def read_samples(path: str):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("samples", help="fight_samples.mjs JSONL")
    p.add_argument("--markdown", action="store_true", help="print a markdown table instead of JSON")
    args = p.parse_args(argv)
    rows = calibrate(read_samples(args.samples))
    print(markdown(rows) if args.markdown else json.dumps(rows, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
