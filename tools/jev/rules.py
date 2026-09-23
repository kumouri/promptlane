#!/usr/bin/env python3
"""house-violet.md's seven-rule decision table, extracted into Jev `noul` questions.

Read `prompts/pilots/house-violet.md` in full before touching this file. It is READ ONLY here and
everywhere in this harness -- the file is the arena's own house opponent, not an entrant artifact,
and this experiment never edits it (brief rule: "house-violet.md is READ, never edited").

The prompt's rules, quoted verbatim from the file, and the question each becomes:

    1. hp less than 75 -> "kind":"recall"
    2. tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900}
    3. keytar only: cd is 0 and foe is not null -> ability
       violin only: cd is 0 and foe is a bearbot with hp less than 100 -> ability
       drums only:  cd is 0 and foe is a bearbot with hp less than 100 -> ability
    4. foe is not null -> "kind":"attack","target":foe
    5. tower is not null -> "kind":"attack","target":tower
    6. foe is null, tower is null and wave is 1 or more -> ride with a violet minion
    7. otherwise -> wait for the next wave at home

becomes, one row per rule so a reader can check "rule 3 became this question" without
reverse-engineering anything:

    rule 1  ->  q1_low_hp_recall
    rule 2  ->  q2_tower_no_wave_go_home
    rule 3  ->  q3_ability_ready              (instrument-gated; see the caveat below)
    rule 4  ->  q4_foe_present_attack
    rule 5  ->  q5_tower_present_attack
    rule 6  ->  q6_wave_present_ride
    rule 7  ->  (no question -- the unconditional "otherwise" once q1-q6 all answer "no";
                 there is nothing left to decide, so nothing is asked)

Each question is a Jev `noul` (calibrated yes/no, 0-1) -- see `client.py` for the wire shape this
maps to and the TypeSafe docs it's drawn from. The harness asks all six in a single `systemone`
call per snapshot (matching Jev's own design: one call, every question answered in parallel), then
applies them in rule order in Python -- `first_match()` below -- exactly like the prompt's own
"Take the FIRST rule that matches." Jev is asked to answer each *condition*; the priority cascade
that turns those conditions into one action is this harness's code, not something Jev is asked to
do itself, so a wrong final action can be traced back to exactly which condition it disagreed on.

KNOWN APPROXIMATION -- q3 and the missing foe. The checked-in run logs
(`runs/house-prompt-2026-09-21-r*.json`) do not record a foe's `kind` or `hp`, only its id (see
`harness.py`'s module docstring for what the logs actually contain). Rule 3's violin/drums variant
needs "foe is a bearbot with hp less than 100", which this harness cannot evaluate for those two
instruments from the data available. q3 therefore asks the same reduced condition -- cd is 0 and
foe is not null -- for every instrument, including violin and drums. This is documented here, in
the harness report, and in the per-question accuracy output; it is not silently smoothed over. It
means predicted `ability` firings for violin/drums are expected to over-trigger relative to the true
rule whenever the real foe was a minion, or a bearbot at or above 100 hp -- a known, explainable
source of disagreement, not a harness bug.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Instrument = Literal["drums", "keytar", "violin"]

# Action buckets a house-violet decision can land in. `go_home` covers both rule 2 and rule 7 --
# they emit the identical action ({"kind":"move","target":{"x":100,"y":900}}) -- so there is no way
# to tell them apart from the action alone, and no need to: both mean the same thing happened.
ActionBucket = Literal["recall", "go_home", "ability", "attack_foe", "attack_tower", "ride_wave"]

HOME_TARGET = {"x": 100, "y": 900}


@dataclass(frozen=True)
class Worksheet:
    """The five worksheet fields house-violet.md's model self-reports before it decides
    (`"hp"`, `"wave"`, `"tower"`, `"foe"`, `"cd"`), plus the identity fields needed to build the
    state paragraph and pick the right q3 wording. `tower`/`foe` are the id string or `None`, since
    presence -- not identity -- is all the seven rules ever test."""

    hp: float
    wave: int
    tower: str | None
    foe: str | None
    cd: float
    instrument: Instrument
    team: str
    tick: int
    clock_sec: float


# --- rule predicates --------------------------------------------------------------------------
# Ground truth for "was this condition true", computed directly from the worksheet fields the ruled
# model itself reported -- the same fields, the same comparisons, as the prompt text above.


def rule1_low_hp(ws: Worksheet) -> bool:
    return ws.hp < 75


def rule2_tower_no_wave(ws: Worksheet) -> bool:
    return ws.tower is not None and ws.wave == 0


def rule3_ability_ready(ws: Worksheet) -> bool:
    """Reduced condition -- see the KNOWN APPROXIMATION note above. Evaluates the keytar variant
    (`cd is 0 and foe is not null`) for every instrument."""
    return ws.cd == 0 and ws.foe is not None


def rule4_foe_present(ws: Worksheet) -> bool:
    return ws.foe is not None


def rule5_tower_present(ws: Worksheet) -> bool:
    return ws.tower is not None


def rule6_wave_present(ws: Worksheet) -> bool:
    return ws.foe is None and ws.tower is None and ws.wave >= 1


@dataclass(frozen=True)
class Question:
    """One rule's condition, as a Jev `noul` question. `instructions`/`criteria` are exactly the
    fields the raw `POST /v1/systemone` wire format and the Python SDK's `Noul(...)` both expect --
    see `client.py`."""

    id: str
    rule_number: int
    instructions: str
    criteria: dict[str, str]
    ground_truth: "callable[[Worksheet], bool]"


def question_set(instrument: Instrument) -> list[Question]:
    """The six questions for one decision, in rule order. `instrument` only changes q3's wording
    (to name the right ability and, honestly, to say what it can't check -- see the module
    docstring); the reduced condition it evaluates is identical across instruments."""
    ability_name = {"keytar": "chord", "violin": "staccato", "drums": "kick"}[instrument]
    q3_instructions = (
        f"This bearbot plays {instrument}; its ability is called {ability_name!r}. Should it use "
        f"{ability_name!r} right now because the ability is off cooldown and there is a foe to use "
        "it on?"
    )
    if instrument != "keytar":
        q3_instructions += (
            " (The house prompt's real rule for this instrument also requires the foe to be a "
            "bearbot under 100 hp; that detail is not available in this dataset, so judge only on "
            "cooldown and foe presence.)"
        )
    return [
        Question(
            id="q1_low_hp_recall",
            rule_number=1,
            instructions="Is this bearbot's hp low enough that it must recall home to heal, rather "
            "than do anything else this turn?",
            criteria={"true": "hp is below the recall threshold of 75", "false": "hp is 75 or above"},
            ground_truth=rule1_low_hp,
        ),
        Question(
            id="q2_tower_no_wave_go_home",
            rule_number=2,
            instructions="Is an enemy tower or nexus visible while this bearbot has no allied minion "
            "wave nearby, meaning it should head home instead of pushing alone?",
            criteria={
                "true": "a tower/nexus is visible and the allied wave count is 0",
                "false": "no tower/nexus is visible, or the allied wave count is 1 or more",
            },
            ground_truth=rule2_tower_no_wave,
        ),
        Question(
            id="q3_ability_ready",
            rule_number=3,
            instructions=q3_instructions,
            criteria={
                "true": "the ability is off cooldown (cd is 0) and a foe is present",
                "false": "the ability is still cooling down, or no foe is present",
            },
            ground_truth=rule3_ability_ready,
        ),
        Question(
            id="q4_foe_present_attack",
            rule_number=4,
            instructions="Given the ability was not the right call this turn, is there a foe present "
            "to attack?",
            criteria={"true": "a foe id is present", "false": "no foe is present"},
            ground_truth=rule4_foe_present,
        ),
        Question(
            id="q5_tower_present_attack",
            rule_number=5,
            instructions="Given there is no foe to attack, is an enemy tower or nexus visible to "
            "attack instead?",
            criteria={"true": "a tower/nexus id is present", "false": "no tower/nexus is visible"},
            ground_truth=rule5_tower_present,
        ),
        Question(
            id="q6_wave_present_ride",
            rule_number=6,
            instructions="Given there is no foe and no tower in sight, does this bearbot have an "
            "allied minion wave nearby to ride with?",
            criteria={
                "true": "no foe, no tower, and the allied wave count is 1 or more",
                "false": "a foe or tower is present, or the allied wave count is 0",
            },
            ground_truth=rule6_wave_present,
        ),
    ]


@dataclass(frozen=True)
class BoundQuestion:
    """A `Question` evaluated against one `Worksheet` -- what actually goes into one systemone
    call. `id`/`instructions`/`criteria` are the wire fields (`client.build_request_body` reads
    exactly these three); `rule_number` and `ground_truth_value` are harness-only bookkeeping the
    real API is never sent (and that `client.build_request_body` never looks at)."""

    id: str
    rule_number: int
    instructions: str
    criteria: dict[str, str]
    ground_truth_value: bool


def bind_questions(instrument: Instrument, ws: Worksheet) -> list[BoundQuestion]:
    """`question_set(instrument)`, each question evaluated against `ws` for its ground truth."""
    return [
        BoundQuestion(q.id, q.rule_number, q.instructions, q.criteria, q.ground_truth(ws))
        for q in question_set(instrument)
    ]


def first_match(answers: dict[str, bool]) -> int:
    """Apply q1..q6 in rule order, first "yes" wins; falls through to rule 7 (the unconditional
    default) if none are true. `answers` maps question id -> yes/no."""
    order = [
        "q1_low_hp_recall",
        "q2_tower_no_wave_go_home",
        "q3_ability_ready",
        "q4_foe_present_attack",
        "q5_tower_present_attack",
        "q6_wave_present_ride",
    ]
    for qid in order:
        if answers.get(qid):
            return order.index(qid) + 1
    return 7


def bucket_for_rule(rule_number: int) -> ActionBucket:
    return {
        1: "recall",
        2: "go_home",
        3: "ability",
        4: "attack_foe",
        5: "attack_tower",
        6: "ride_wave",
        7: "go_home",
    }[rule_number]


def ground_truth_answers(ws: Worksheet) -> dict[str, bool]:
    """The same six conditions, evaluated straight from the worksheet -- this is what "ground
    truth" means throughout this harness: not a re-derivation of what *should* happen, but the
    literal comparisons the ruled model's own self-reported fields make possible."""
    return {
        "q1_low_hp_recall": rule1_low_hp(ws),
        "q2_tower_no_wave_go_home": rule2_tower_no_wave(ws),
        "q3_ability_ready": rule3_ability_ready(ws),
        "q4_foe_present_attack": rule4_foe_present(ws),
        "q5_tower_present_attack": rule5_tower_present(ws),
        "q6_wave_present_ride": rule6_wave_present(ws),
    }


def bucket_for_action(kind: str, target: object, foe: str | None, tower: str | None) -> ActionBucket | None:
    """Classify a logged (real) action into the same six buckets, so Jev's prediction and the
    ruled model's real decision can be compared on equal terms. Returns `None` for an action shape
    house-violet.md's rules never produce (e.g. `hold`) -- the harness excludes those snapshots."""
    if kind == "recall":
        return "recall"
    if kind == "ability":
        return "ability"
    if kind == "attack":
        if target == foe and foe is not None:
            return "attack_foe"
        if target == tower and tower is not None:
            return "attack_tower"
        return None
    if kind == "move":
        if target == HOME_TARGET:
            return "go_home"
        return "ride_wave"
    return None
