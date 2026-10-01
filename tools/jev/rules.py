#!/usr/bin/env python3
"""house-violet.md's decision table -- seven rules, plus the Bandstand rule -- extracted into Jev
`noul` questions.

Read `prompts/pilots/house-violet.md` in full before touching this file. It is READ ONLY here and
everywhere in this harness -- the file is the arena's own house opponent, not an entrant artifact,
and this experiment never edits it (brief rule: "house-violet.md is READ, never edited").

The prompt's rules, quoted verbatim from the file, and the question each becomes:

    1. hp less than 75 -> "kind":"recall"
    2. stand is "open", foe is null or a minion, and hp is more than 50% of self.maxHp
       -> go to the Bandstand: "kind":"move","target":{"x":<bandstand.pos.x>,"y":<bandstand.pos.y>}
    3. tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900}
    4. keytar only: cd is 0 and foe is not null -> ability
       violin only: cd is 0 and foe is a bearbot with hp less than 100 -> ability
       drums only:  cd is 0 and foe is a bearbot with hp less than 100 -> ability
    5. foe is not null -> "kind":"attack","target":foe
    6. tower is not null -> "kind":"attack","target":tower
    7. foe is null, tower is null and wave is 1 or more -> ride with a violet minion
    8. otherwise -> wait for the next wave at home

becomes, one row per rule so a reader can check "rule 4 became this question" without
reverse-engineering anything. The question ids and rule numbers here keep the numbering from
before the Bandstand (2026-09-30), so every checked-in log, report and test that names them still
means the same thing. The Bandstand rule, the file's rule 2, is numbered 8 in code. Everywhere
below, "rule N" is the code's number (rule 3, the ability, is the file's rule 4):

    file rule 1  ->  q1_low_hp_recall                  rule 1
    file rule 2  ->  q1b_bandstand_open                rule 8 (only with the objective; see below)
    file rule 3  ->  q2_tower_no_wave_go_home          rule 2
    file rule 4  ->  q3_ability_ready                  rule 3 (instrument-gated; see the caveat below)
    file rule 5  ->  q4_foe_present_attack             rule 4
    file rule 6  ->  q5_tower_present_attack           rule 5
    file rule 7  ->  q6_wave_present_ride              rule 6
    file rule 8  ->  (no question -- the unconditional "otherwise" once every question answers
                     "no"; there is nothing left to decide, so nothing is asked)   rule 7

THE BANDSTAND (docs/economy-spec.md §9.7, river-1). `q1b_bandstand_open` is asked ONLY when the
worksheet has the objective (`ws.stand` is not None -- `tools/match/jevPilot.ts::extractWorksheet`
sends `stand` and `maxHp` only for a match played with one). A worksheet without it gets exactly
the six questions, the ground truth and the decisions it got before the Bandstand existed; the
offline harness's logs never have it. `first_match` asks it second, right after the recall, as the
file does. Its action is a move to `bandstand.pos` (bucket `bandstand`).

Each question is a Jev `noul` (calibrated yes/no, 0-1) -- see `client.py` for the wire shape this
maps to and the TypeSafe docs it's drawn from. The harness asks all six (seven with the
objective) in a single `systemone` call per snapshot (matching Jev's own design: one call, every
question answered in parallel), then
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

THE LIVE PATH IS EXACT (2026-09-25). A live match *does* know the foe's kind and hp
(`Observation.visibleEnemies`), so `tools/match/jevPilot.ts::extractWorksheet` sends them and
`house_server.py` builds a `Worksheet` with `foe_detail=True`. For such a worksheet, q3 asks
house-violet.md's real rule 3 -- keytar: cd 0 and any foe; violin/drums: cd 0 and the foe is a
bearbot under 100 hp -- and `rule3_ability_ready` evaluates the same exact condition. The offline
harness never sets `foe_detail` (its logs cannot), so it keeps the approximation above, unchanged
and still labelled -- its numbers stay comparable to `runs/jev-suitability-harness-2026-09-22.md`.
Measured before/after: `runs/jev-jam-readiness-2026-09-25.md`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Instrument = Literal["drums", "keytar", "violin"]

# Action buckets a house-violet decision can land in. `go_home` covers both rule 2 and rule 7 --
# they emit the identical action ({"kind":"move","target":{"x":100,"y":900}}) -- so there is no way
# to tell them apart from the action alone, and no need to: both mean the same thing happened.
# `bandstand` (rule 8) is the move to `bandstand.pos`; only a worksheet with the objective reaches it.
ActionBucket = Literal["recall", "go_home", "ability", "attack_foe", "attack_tower", "ride_wave", "bandstand"]

HOME_TARGET = {"x": 100, "y": 900}

# The Bandstand rule's number in code: after rule 7 (the fallback), so rules 1-7 keep the meaning
# every log and report from before the Bandstand gives them. The file asks it second.
BANDSTAND_RULE = 8


@dataclass(frozen=True)
class Worksheet:
    """The worksheet fields house-violet.md's model self-reports before it decides
    (`"hp"`, `"wave"`, `"tower"`, `"foe"`, `"cd"`, `"stand"`), plus the identity fields needed to
    build the state paragraph and pick the right q3 wording. `tower`/`foe` are the id string or
    `None`, since presence -- not identity -- is all rules but rule 3 ever test.

    `foe_detail` says whether `foe_kind`/`foe_hp` are real: `True` on the live path (a live
    `Observation` has them), `False` offline (the logs never did). Rule 3's violin/drums variant and
    the Bandstand rule's "no enemy bearbot" read them -- see the module docstring's LIVE PATH note.

    `stand` (`bandstand.status`) and `max_hp` (`self.maxHp`, for the Bandstand rule's 50 % line) are
    `None` unless the match has the objective; `stand` being `None` is what keeps a worksheet without
    it on exactly the pre-Bandstand questions."""

    hp: float
    wave: int
    tower: str | None
    foe: str | None
    cd: float
    instrument: Instrument
    team: str
    tick: int
    clock_sec: float
    foe_detail: bool = False
    foe_kind: str | None = None  # "bearbot" | "minion" | None (no foe)
    foe_hp: float | None = None
    stand: str | None = None  # "closed" | "upcoming" | "open" | "done" | None (no objective)
    max_hp: float | None = None


# --- rule predicates --------------------------------------------------------------------------
# Ground truth for "was this condition true", computed directly from the worksheet fields the ruled
# model itself reported -- the same fields, the same comparisons, as the prompt text above.


def rule1_low_hp(ws: Worksheet) -> bool:
    return ws.hp < 75


def rule2_tower_no_wave(ws: Worksheet) -> bool:
    return ws.tower is not None and ws.wave == 0


def rule3_ability_ready(ws: Worksheet) -> bool:
    """house-violet.md's real rule 3 when the foe's kind/hp are known (`ws.foe_detail`, the live
    path); otherwise the reduced condition from the KNOWN APPROXIMATION note above, which evaluates
    the keytar variant (`cd is 0 and foe is not null`) for every instrument."""
    if ws.cd != 0 or ws.foe is None:
        return False
    if ws.instrument == "keytar" or not ws.foe_detail:
        return True
    return ws.foe_kind == "bearbot" and ws.foe_hp is not None and ws.foe_hp < 100


def rule4_foe_present(ws: Worksheet) -> bool:
    return ws.foe is not None


def rule5_tower_present(ws: Worksheet) -> bool:
    return ws.tower is not None


def rule6_wave_present(ws: Worksheet) -> bool:
    return ws.foe is None and ws.tower is None and ws.wave >= 1


def rule8_bandstand_open(ws: Worksheet) -> bool:
    """The file's rule 2: stand is "open", foe is null or a minion (no enemy bearbot in sight), and
    hp is more than 50 % of maxHp. False without the objective (`stand` None). A foe of unknown kind
    (no `foe_detail`) counts as a bearbot, so the rule never fires on a guess."""
    if ws.stand != "open" or ws.max_hp is None:
        return False
    no_bearbot = ws.foe is None or (ws.foe_detail and ws.foe_kind != "bearbot")
    return no_bearbot and ws.hp > 0.5 * ws.max_hp


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


BANDSTAND_QUESTION = Question(
    id="q1b_bandstand_open",
    rule_number=BANDSTAND_RULE,
    instructions="Given it does not need to recall, is the Bandstand open, with no enemy bearbot in "
    "sight, and this bearbot's hp above half of its own maxHp, meaning it should go to the "
    "Bandstand and take it?",
    criteria={
        "true": "the Bandstand is open, no enemy bearbot is visible (no foe, or the foe is a minion), "
        "and hp is above 50% of maxHp",
        "false": "the Bandstand is not open, an enemy bearbot is visible, or hp is at or below 50% of maxHp",
    },
    ground_truth=rule8_bandstand_open,
)


def question_set(instrument: Instrument, foe_detail: bool = False, bandstand: bool = False) -> list[Question]:
    """The six questions for one decision, in rule order. `instrument` only changes q3's wording
    (to name the right ability). `foe_detail` (the live path) makes q3 ask violin/drums' real
    condition -- the foe is a bearbot under 100 hp; without it q3 asks the reduced condition and
    says honestly what it can't check -- see the module docstring. `bandstand` (the match has the
    objective) adds `q1b_bandstand_open` right after q1, as the file's rule 2; without it the six
    questions are exactly the pre-Bandstand ones."""
    ability_name = {"keytar": "chord", "violin": "staccato", "drums": "kick"}[instrument]
    q3_criteria = {
        "true": "the ability is off cooldown (cd is 0) and a foe is present",
        "false": "the ability is still cooling down, or no foe is present",
    }
    if instrument != "keytar" and foe_detail:
        q3_instructions = (
            f"This bearbot plays {instrument}; its ability is called {ability_name!r}. Should it use "
            f"{ability_name!r} right now because the ability is off cooldown and the foe is an enemy "
            "bearbot with less than 100 hp? (A minion foe, or a bearbot foe at 100 hp or more, does "
            "not qualify.)"
        )
        q3_criteria = {
            "true": "cd is 0 and the foe is an enemy bearbot whose hp is below 100",
            "false": "the ability is still cooling down, there is no foe, the foe is a minion, or the "
            "foe bearbot has 100 hp or more",
        }
    else:
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
        *([BANDSTAND_QUESTION] if bandstand else []),
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
            criteria=q3_criteria,
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
    """`question_set(instrument, ws.foe_detail, bandstand=ws.stand is not None)`, each question
    evaluated against `ws` for its ground truth."""
    return [
        BoundQuestion(q.id, q.rule_number, q.instructions, q.criteria, q.ground_truth(ws))
        for q in question_set(instrument, ws.foe_detail, bandstand=ws.stand is not None)
    ]


# (question id, rule number) in the order the file asks them. The Bandstand question is second, as
# the file's rule 2, but keeps rule number 8 (see BANDSTAND_RULE).
RULE_ORDER: list[tuple[str, int]] = [
    ("q1_low_hp_recall", 1),
    ("q1b_bandstand_open", BANDSTAND_RULE),
    ("q2_tower_no_wave_go_home", 2),
    ("q3_ability_ready", 3),
    ("q4_foe_present_attack", 4),
    ("q5_tower_present_attack", 5),
    ("q6_wave_present_ride", 6),
]


def first_match(answers: dict[str, bool]) -> int:
    """Apply the questions in the file's order, first "yes" wins; falls through to rule 7 (the
    unconditional default) if none are true. `answers` maps question id -> yes/no; a question that
    was not asked (q1b, without the objective) is absent and counts as "no"."""
    for qid, rule in RULE_ORDER:
        if answers.get(qid):
            return rule
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
        BANDSTAND_RULE: "bandstand",
    }[rule_number]


def ground_truth_answers(ws: Worksheet) -> dict[str, bool]:
    """The same six conditions -- seven with the objective -- evaluated straight from the worksheet
    -- this is what "ground truth" means throughout this harness: not a re-derivation of what
    *should* happen, but the literal comparisons the ruled model's own self-reported fields make
    possible. Without the objective the dict is exactly the pre-Bandstand six."""
    answers = {"q1_low_hp_recall": rule1_low_hp(ws)}
    if ws.stand is not None:
        answers["q1b_bandstand_open"] = rule8_bandstand_open(ws)
    answers.update({
        "q2_tower_no_wave_go_home": rule2_tower_no_wave(ws),
        "q3_ability_ready": rule3_ability_ready(ws),
        "q4_foe_present_attack": rule4_foe_present(ws),
        "q5_tower_present_attack": rule5_tower_present(ws),
        "q6_wave_present_ride": rule6_wave_present(ws),
    })
    return answers


def bucket_for_action(kind: str, target: object, foe: str | None, tower: str | None) -> ActionBucket | None:
    """Classify a logged (real) action into the same six buckets, so Jev's prediction and the
    ruled model's real decision can be compared on equal terms. Returns `None` for an action shape
    house-violet.md's rules never produce (e.g. `hold`) -- the harness excludes those snapshots.
    The offline logs predate the Bandstand, so a non-home move is always `ride_wave` here; a log
    that has a `bandstand` block would need the bandstand's position to tell the two apart."""
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
