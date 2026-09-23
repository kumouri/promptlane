#!/usr/bin/env python3
"""Synthetic `Observation` snapshots for the prose-to-schema translator fidelity test.

Why synthetic, not replayed from a checked-in log: `runs/*-drums-vs-*.json` and the jam-sample/
Phase-C run logs record `decisions[]` as `{tick, bot, reply, action, ms}` -- for these three pilots
(no self-reported worksheet, unlike house-violet.md) that is only the *parsed action*, never the
`Observation` that produced it (confirmed by reading `harness.py`'s own module docstring, which
found the same gap for house-violet.md's worksheet, and by inspecting these files directly:
`decisions[]` has no `self`/`visibleEnemies`/`nearbyMinions`, and `checkpoints[]` only has bare
`[hp,x,y,alive,recalling]` per bearbot every 100 ticks with no per-entity id, cooldown map, or
minion/tower identity -- not enough to reconstruct a real `Observation`, and ticks don't even land
on checkpoint boundaries: cadence puts a decision roughly every 40 ticks, checkpoints every 100).

So this module builds `Observation` objects by hand, in the exact shape `tools/arena/pages/
contract.mjs`'s `EXAMPLE_OBSERVATION` documents (`clockSec`, `self`, `allies`, `visibleEnemies`,
`nearbyMinions`, `nearbyTowers`) -- the real contract, not an invented one. Each scenario is
designed to sit on a decision boundary one of `drums.md`/`keytar.md`/`violin.md` actually names:
the hp-quarter recall threshold, melee vs. ranged distance, ability cooldown, a clustered vs.
isolated enemy, a threatened ally, a lowest-hp ("softest") target among several. No distance/range
field is precomputed into the Observation -- only raw `pos: {x,y}`, same as the real contract -- so
neither the ground-truth model nor the translated schema gets help the real game wouldn't give it.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Ability names per instrument, in (primary, ultimate) order -- drums.md/keytar.md/violin.md's own
# vocabulary (verbatim from each file).
ABILITIES = {
    "drums": ("kick", "fill"),
    "keytar": ("chord", "glissando"),
    "violin": ("staccato", "solo"),
}

MAX_HP = {"drums": 300, "keytar": 170, "violin": 140}  # tanky/mid/glass, matching each file's own text

HOME_POS = {"violet": {"x": 100, "y": 900}, "green": {"x": 900, "y": 100}}  # house-violet/green.md's own "go home" targets
SELF_POS = {"x": 300, "y": 500}


@dataclass(frozen=True)
class EntitySpec:
    id: str
    pos: dict
    hp_frac: float
    kind: str = "bearbot"  # bearbot | minion | tower | nexus
    max_hp: float = 200.0


@dataclass(frozen=True)
class Scenario:
    name: str
    description: str
    self_hp_frac: float
    primary_ready: bool
    ultimate_ready: bool
    self_pos: dict = field(default_factory=lambda: dict(SELF_POS))
    allies: list = field(default_factory=list)
    enemies: list = field(default_factory=list)  # bearbot/minion/tower/nexus, all go in visibleEnemies
    minions: list = field(default_factory=list)  # nearbyMinions -- team-flagged, both sides possible
    clock_sec: float = 90.0


def E(id, pos, hp_frac, kind="bearbot", max_hp=200.0):
    return EntitySpec(id, pos, hp_frac, kind, max_hp)


SCENARIOS: list[Scenario] = [
    Scenario(
        name="empty_lane_push",
        description="Nothing visible; early clock. Tests baseline lane-push / positioning with no threats.",
        self_hp_frac=0.95, primary_ready=True, ultimate_ready=True, clock_sec=25.0,
        allies=[E("ally-1", {"x": 260, "y": 540}, 0.9), E("ally-2", {"x": 340, "y": 470}, 0.9)],
    ),
    Scenario(
        name="low_hp_recall_under_pressure",
        description="Self below the quarter-health line, an enemy bearbot nearby, ability ready. Tests whether hp overrides everything else.",
        self_hp_frac=0.20, primary_ready=True, ultimate_ready=True,
        enemies=[E("enemy-near", {"x": 340, "y": 520}, 0.6)],
    ),
    Scenario(
        name="melee_range_enemy_ability_ready",
        description="One enemy bearbot essentially adjacent (small dx/dy), ability ready, self healthy. Tests close-range engagement vs. flee-the-melee-range logic.",
        self_hp_frac=0.80, primary_ready=True, ultimate_ready=True,
        enemies=[E("enemy-adjacent", {"x": 320, "y": 512}, 0.5)],
    ),
    Scenario(
        name="ranged_enemy_far",
        description="One enemy bearbot far away (large dx/dy), ability ready, self healthy. Tests ranged engagement / closing distance.",
        self_hp_frac=0.80, primary_ready=True, ultimate_ready=True,
        enemies=[E("enemy-far", {"x": 820, "y": 140}, 0.5)],
    ),
    Scenario(
        name="clustered_enemies",
        description="Two enemy bearbots plus a minion, all close together. Tests AoE / densest-cluster target selection (drums Fill, keytar Chord).",
        self_hp_frac=0.85, primary_ready=True, ultimate_ready=True,
        enemies=[E("enemy-clusterA", {"x": 420, "y": 460}, 0.7), E("enemy-clusterB", {"x": 435, "y": 470}, 0.65)],
        minions=[E("minion-enemy-1", {"x": 410, "y": 455}, 0.5, kind="minion")],
    ),
    Scenario(
        name="ability_on_cooldown_enemy_present",
        description="Enemy bearbot at medium range, ability NOT ready. Tests fallback (basic attack only) behavior.",
        self_hp_frac=0.80, primary_ready=False, ultimate_ready=True,
        enemies=[E("enemy-mid", {"x": 480, "y": 480}, 0.4)],
    ),
    Scenario(
        name="ally_under_threat",
        description="Self is far from the action and full hp; an ally is low hp with an enemy bearbot near that ally (not near self). Tests drums.md's 'enemy near ally is my problem' rule specifically.",
        self_hp_frac=0.95, primary_ready=True, ultimate_ready=True,
        allies=[E("ally-threatened", {"x": 700, "y": 200}, 0.25), E("ally-safe", {"x": 260, "y": 540}, 0.9)],
        enemies=[E("enemy-near-ally", {"x": 715, "y": 210}, 0.55)],
    ),
    Scenario(
        name="isolated_vs_grouped_enemy",
        description="One enemy bearbot alone far away; two enemy bearbots grouped together at similar distance. Tests violin.md's isolated-target preference.",
        self_hp_frac=0.90, primary_ready=True, ultimate_ready=True,
        enemies=[
            E("enemy-isolated", {"x": 640, "y": 520}, 0.6),
            E("enemy-groupA", {"x": 300, "y": 850}, 0.6),
            E("enemy-groupB", {"x": 315, "y": 860}, 0.55),
        ],
    ),
    Scenario(
        name="enemy_tower_only",
        description="No enemy bearbot; one enemy tower visible. Tests tower engagement / poke-only behavior.",
        self_hp_frac=0.90, primary_ready=True, ultimate_ready=True,
        enemies=[E("tower-enemy", {"x": 500, "y": 500}, 0.8, kind="tower", max_hp=1200)],
    ),
    Scenario(
        name="hp_exactly_at_threshold",
        description="Self hp exactly at the quarter-health boundary, enemy present, ability ready. Edge case for the recall threshold.",
        self_hp_frac=0.25, primary_ready=True, ultimate_ready=True,
        enemies=[E("enemy-boundary", {"x": 420, "y": 480}, 0.5)],
    ),
    Scenario(
        name="minion_wave_poke",
        description="Several allied minions nearby, no visible enemies. Tests lane-push / poke-the-wave baseline, distinguished from empty_lane_push by minion presence.",
        self_hp_frac=0.90, primary_ready=True, ultimate_ready=True, clock_sec=140.0,
        minions=[
            E("minion-ally-1", {"x": 340, "y": 520}, 0.8, kind="minion"),
            E("minion-ally-2", {"x": 355, "y": 530}, 0.8, kind="minion"),
        ],
    ),
    Scenario(
        name="softest_target_selection",
        description="Two enemy bearbots visible: one close but nearly full hp, one far but almost dead. Tests nearest-vs-lowest-hp target selection.",
        self_hp_frac=0.85, primary_ready=True, ultimate_ready=True,
        enemies=[E("enemy-close-healthy", {"x": 330, "y": 510}, 0.9), E("enemy-far-weak", {"x": 780, "y": 160}, 0.15)],
    ),
]


def _entity_dict(spec: EntitySpec, max_hp: float | None = None) -> dict:
    mh = max_hp if max_hp is not None else spec.max_hp
    return {"id": spec.id, "pos": spec.pos, "hp": round(spec.hp_frac * mh, 1), "maxHp": mh}


def build_observation(scenario: Scenario, team: str, instrument: str) -> dict:
    """One `Observation`, exact contract shape (`tools/arena/pages/contract.mjs`)."""
    max_hp = MAX_HP[instrument]
    primary, ultimate = ABILITIES[instrument]
    self_hp = round(scenario.self_hp_frac * max_hp, 1)
    cooldowns = {
        primary: 0.0 if scenario.primary_ready else 5.0,
        ultimate: 0.0 if scenario.ultimate_ready else 12.0,
    }
    visible_enemies = []
    for e in scenario.enemies:
        d = _entity_dict(e, max_hp=1200 if e.kind in ("tower", "nexus") else None)
        d["kind"] = e.kind
        visible_enemies.append(d)
    nearby_minions = []
    enemy_team = "green" if team == "violet" else "violet"
    for i, m in enumerate(scenario.minions):
        d = _entity_dict(m)
        # minions named "minion-enemy-*" belong to the enemy team, "minion-ally-*" to our team
        d["team"] = enemy_team if m.id.startswith("minion-enemy") else team
        nearby_minions.append(d)
    return {
        "clockSec": scenario.clock_sec,
        "self": {
            "id": f"{team}-{instrument}",
            "team": team,
            "lane": {"drums": "top", "keytar": "mid", "violin": "bottom"}[instrument],
            "instrument": instrument,
            "pos": scenario.self_pos,
            "hp": self_hp,
            "maxHp": max_hp,
            "moveSpeed": 5.0,
            "cooldowns": cooldowns,
        },
        "allies": [_entity_dict(a) for a in scenario.allies],
        "visibleEnemies": visible_enemies,
        "nearbyMinions": nearby_minions,
        "nearbyTowers": [],
    }


def all_scenarios() -> list[Scenario]:
    return list(SCENARIOS)
