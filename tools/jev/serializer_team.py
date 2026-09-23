#!/usr/bin/env python3
"""Serializes a `team_rules.Worksheet` into Jev's `state` field. Sibling to `serializer.py`
(house-violet.md's serializer, unchanged) -- same "short, dense, detailed paragraph" style
(TypeSafe's own guidance, see `serializer.py`'s module docstring for the sourcing), extended with
`maxHp` and the foe's own kind/hp/maxHp, which `docs/jev-vs-qwen32b-intent.md`'s percentage
thresholds and violin's finisher condition need that house-violet.md's fixed-number cascade did
not."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from team_rules import RECALL_THRESHOLD_FRAC, Worksheet  # noqa: E402


def _wave_clause(wave: int) -> str:
    if wave == 0:
        return "no allied minions are in its wave right now (wave count 0)"
    plural = "minion" if wave == 1 else "minions"
    return f"{wave} allied {plural} are nearby in its wave (wave count {wave})"


def _tower_clause(tower: str | None) -> str:
    if tower is None:
        return "No enemy tower or nexus is visible right now."
    return f"An enemy tower or nexus is visible, id {tower}."


def _foe_clause(ws: Worksheet) -> str:
    if ws.foe is None:
        return "No enemy is currently targeted as a foe."
    kind = "an enemy bearbot" if ws.foe_is_bearbot else "an enemy minion"
    detail = ""
    if ws.foe_is_bearbot and ws.foe_hp is not None and ws.foe_max_hp:
        pct = round(100 * ws.foe_hp / ws.foe_max_hp)
        detail = f", at {ws.foe_hp:g}/{ws.foe_max_hp:g} hp ({pct}% of its own maxHp)"
    return f"{kind.capitalize()} is targeted as a foe, id {ws.foe}{detail}."


def _cd_clause(cd: float) -> str:
    if cd == 0:
        return f"Its instrument ability's cooldown is {cd:.1f} seconds, meaning the ability is off cooldown and ready to use."
    return f"Its instrument ability's cooldown is {cd:.1f} seconds, meaning the ability is still cooling down and not ready."


def _hp_clause(ws: Worksheet) -> str:
    threshold_pct = round(RECALL_THRESHOLD_FRAC[ws.instrument] * 100)
    own_pct = round(100 * ws.hp / ws.max_hp) if ws.max_hp else 0
    if own_pct < threshold_pct:
        return (
            f"Its own hp is {ws.hp:g}/{ws.max_hp:g} ({own_pct}% of maxHp), which is below its "
            f"{threshold_pct}%-of-maxHp recall threshold."
        )
    return (
        f"Its own hp is {ws.hp:g}/{ws.max_hp:g} ({own_pct}% of maxHp), which is at or above its "
        f"{threshold_pct}%-of-maxHp recall threshold."
    )


def state_paragraph(ws: Worksheet) -> str:
    return " ".join(
        [
            f"This is a {ws.team}-team bearbot playing {ws.instrument}, "
            f"{ws.clock_sec:.1f} sim-seconds into the match (tick {ws.tick}).",
            _hp_clause(ws),
            _wave_clause(ws.wave).capitalize() + ".",
            _tower_clause(ws.tower),
            _foe_clause(ws),
            _cd_clause(ws.cd),
        ]
    )
