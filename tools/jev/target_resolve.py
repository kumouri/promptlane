#!/usr/bin/env python3
"""Resolves a translator `target_selector` (`translator.TARGET_SELECTORS`) against one `Observation`
into a concrete target: an entity id string (for `attack`/`ability`) or an `{x,y}` position (for
`move`) -- exactly the two target shapes the real game contract accepts
(`tools/arena/pages/contract.mjs` §4). Deterministic, no model call: this is the piece of the
pipeline that turns "which selector" (the translator's job) into "which specific entity, right now"
(arithmetic over the current Observation, same job `bind_questions`/target logic would do in any of
this repo's other rule-based pilots)."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scenarios import HOME_POS  # noqa: E402


def _dist(a: dict, b: dict) -> float:
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def resolve_target(selector: str | None, obs: dict) -> object | None:
    """`None` means either `selector` needs no target, or the selector's candidate pool is empty
    for this Observation (e.g. `lowest_hp_enemy` with no visible enemies) -- both are legitimate,
    distinguished by the caller only caring whether a target was actually produced."""
    if selector in (None, "none"):
        return None
    self_ = obs["self"]
    team = self_["team"]
    enemy_team = "green" if team == "violet" else "violet"

    if selector == "home":
        return dict(HOME_POS[team])
    if selector == "push_lane":
        return dict(HOME_POS[enemy_team])

    enemies = obs.get("visibleEnemies", [])
    bearbots = [e for e in enemies if e.get("kind") == "bearbot"]

    if selector == "nearest_enemy":
        pool = enemies
        return min(pool, key=lambda e: _dist(self_["pos"], e["pos"]))["id"] if pool else None
    if selector == "lowest_hp_enemy":
        pool = bearbots or enemies
        return min(pool, key=lambda e: e["hp"])["id"] if pool else None
    if selector == "densest_cluster_enemy":
        pool = enemies
        if not pool:
            return None
        def crowd(e):
            return sum(1 for o in pool if o["id"] != e["id"] and _dist(e["pos"], o["pos"]) < 150)
        return max(pool, key=crowd)["id"]
    if selector == "isolated_enemy":
        pool = bearbots or enemies
        if not pool:
            return None
        def min_dist_to_others(e):
            others = [o for o in pool if o["id"] != e["id"]]
            return min((_dist(e["pos"], o["pos"]) for o in others), default=float("inf"))
        return max(pool, key=min_dist_to_others)["id"]
    if selector == "nearest_tower":
        towers = [e for e in enemies if e.get("kind") in ("tower", "nexus")]
        return min(towers, key=lambda e: _dist(self_["pos"], e["pos"]))["id"] if towers else None
    if selector == "threatened_ally_enemy":
        allies = obs.get("allies", [])
        if not allies or not enemies:
            return None
        weakest_ally = min(allies, key=lambda a: a["hp"] / a["maxHp"])
        return min(enemies, key=lambda e: _dist(weakest_ally["pos"], e["pos"]))["id"]
    if selector == "nearby_minion":
        minions = [m for m in obs.get("nearbyMinions", []) if m.get("team") == team]
        if not minions:
            return None
        nearest = min(minions, key=lambda m: _dist(self_["pos"], m["pos"]))
        return {"x": nearest["pos"]["x"], "y": nearest["pos"]["y"]}

    raise ValueError(f"unknown target_selector {selector!r}")
