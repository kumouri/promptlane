#!/usr/bin/env python3
"""Serializes a `Worksheet` (rules.py) into Jev's `state` field.

Jev's docs (fetched 2026-09-22) say `state` accepts "String, JSON object, or array of text values."
TypeSafe's own launch post, in the nuance section of its side-by-side demo, says: "The `state` is
also a short, dense, and detailed paragraph, to emphasize the difference in sampling methodology."
(https://typesafe.ai/blog/introducing-system-one-models-and-jev, fetched 2026-09-22). That is the
only concrete guidance found anywhere in TypeSafe's docs, the SDK docs, or Simon Willison's
independent write-up on *how* to shape state text -- none of them say more, and this harness does
not invent past what they say. So: prose, not a raw JSON dump of the worksheet.

THE NUMBERS DECISION -- the central risk this harness exists to test (memo, `docs/
jev-decision-model-research.md`, quoting Simon Willison: Jev is "not great with numbers, dates").
The seven rules are nothing but numeric/threshold comparisons (hp vs 75, cd vs 0, wave vs 1) and
presence checks, so there is no way to omit numbers from the state -- the comparison itself is the
thing under test. What this serializer controls is how much interpretation rides *alongside* the
raw number:

    chosen:  spell out both the raw value and its threshold-relative meaning in the same clause,
             e.g. "cd is 0.0 seconds, meaning the ability is off cooldown and ready to use" --
             on the theory that a model reportedly weak at numeric comparison may do better when
             the comparison's conclusion is already in the text next to the number, not left for
             it to compute silently.
    why:     it is the more Jev-idiomatic reading of the vendor's own "dense and detailed"
             guidance -- detailed, not just terse -- and it costs a few more input tokens per call
             (a few cents at most across the whole run; see `harness.py`'s cost estimate), a trade
             worth making for a first suitability read.

WHAT TO TRY INSTEAD, if this run's results are inconclusive or make the numbers-risk look worse than
it is:

    1. Bare numbers, no interpretation -- "hp is 61" with no "which is below the recall threshold"
       clause -- to isolate whether the interpretive framing is *helping* Jev or just padding
       tokens. Cheapest variant to try; swap `_hp_clause` etc. below.
    2. Numbers spelled as words ("sixty-one") instead of digits -- Willison's caveat doesn't say
       *which* numeric failure mode Jev has, and digit-vs-word tokenization is a known sharp edge
       for small/decision models generally.
    3. Structured `state` (a JSON object, which the docs also accept) instead of prose, to see
       whether Jev's own internal handling of an explicit field beats a paragraph's use of English
       comparison words ("below", "at or above") for the same numbers. Implemented below as
       `state_object()` -- the harness's second live run uses it (`--state-encoding json`).

Each snapshot's paragraph is built by `state_paragraph()` alone, decoupled from HTTP/question
plumbing, specifically so any of the above is a one-function edit, not a harness rewrite.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rules import Worksheet  # noqa: E402


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
    """Offline (`foe_detail` False) the logs only have the foe's id, so the clause says only that --
    byte-identical to what the suitability harness measured. Live, it also states the foe's kind and
    hp against rule 3's 100-hp line, interpretation next to the number like `_hp_clause`."""
    if ws.foe is None:
        return "No enemy bearbot or minion is currently targeted as a foe."
    if not ws.foe_detail:
        return f"An enemy is targeted as a foe, id {ws.foe}."
    if ws.foe_kind != "bearbot":
        return f"An enemy minion (not a bearbot) is targeted as a foe, id {ws.foe}."
    hp = ws.foe_hp if ws.foe_hp is not None else 0.0
    relation = "below" if hp < 100 else "at or above"
    return f"An enemy bearbot is targeted as a foe, id {ws.foe}; its hp is {hp:g}, which is {relation} 100."


def _cd_clause(cd: float) -> str:
    if cd == 0:
        return f"Its instrument ability's cooldown is {cd:.1f} seconds, meaning the ability is off cooldown and ready to use."
    return f"Its instrument ability's cooldown is {cd:.1f} seconds, meaning the ability is still cooling down and not ready."


def _hp_clause(hp: float) -> str:
    if hp < 75:
        return f"Its own hp is {hp:g}, which is below the 75-hp recall threshold."
    return f"Its own hp is {hp:g}, which is at or above the 75-hp recall threshold."


def state_paragraph(ws: Worksheet) -> str:
    """A short, dense, detailed paragraph describing one bearbot's decision-relevant state at one
    tick -- the subset of an `Observation` (`tools/arena/pages/contract.mjs`) that the checked-in
    run logs actually preserve. See `harness.py`'s module docstring for exactly what that is and
    is not (no position, no per-ability cooldown map, no minion/enemy roster -- only presence).
    A live worksheet (`ws.foe_detail`) also carries the foe's kind and hp -- see `_foe_clause`."""
    return " ".join(
        [
            f"This is a {ws.team}-team bearbot playing {ws.instrument}, "
            f"{ws.clock_sec:.1f} sim-seconds into the match (tick {ws.tick}).",
            _hp_clause(ws.hp),
            _wave_clause(ws.wave).capitalize() + ".",
            _tower_clause(ws.tower),
            _foe_clause(ws),
            _cd_clause(ws.cd),
        ]
    )


def state_object(ws: Worksheet) -> dict:
    """Option 3 from the module docstring: the same worksheet fields as a structured JSON object
    instead of a prose paragraph, with the raw numbers alongside their fixed thresholds but none of
    `state_paragraph`'s interpretive English ("below", "at or above") -- the direct comparison this
    harness's second live run makes: does Jev do better with an explicit field than with English
    comparison words for the same numbers (Simon Willison's "not great with numbers" caveat, see
    module docstring)."""
    obj = {
        "team": ws.team,
        "instrument": ws.instrument,
        "tick": ws.tick,
        "clock_sec": ws.clock_sec,
        "hp": ws.hp,
        "hp_recall_threshold": 75,
        "wave": ws.wave,
        "tower": ws.tower,
        "foe": ws.foe,
        "cd": ws.cd,
        "cd_ready_threshold": 0,
    }
    if ws.foe_detail:
        obj.update({"foe_kind": ws.foe_kind, "foe_hp": ws.foe_hp, "foe_hp_ability_threshold": 100})
    return obj
