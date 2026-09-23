#!/usr/bin/env python3
"""`docs/jev-vs-qwen32b-intent.md`'s rule cascade, extracted into Jev `noul` questions.

Sibling to `rules.py` (house-violet.md's cascade, unchanged, still used by the house bot) -- this
module is a NEW cascade for a NEW intent document, not a replay of house-violet.md's. Read
`docs/jev-vs-qwen32b-intent.md` in full before touching this file; it is the source of truth both
this module and `prompts/pilots/team-qwen.md` are derived from.

The intent document's cascade, quoted from its own table, and the question each becomes:

    1.  own hp below this instrument's recall threshold          -> recall
    2a. foe present, ability off cooldown, ability condition met  -> ability
    2b. foe present (2a not met)                                  -> attack_foe
    3.  no foe, tower visible, own wave (>=1) present              -> attack_tower
    4.  no foe, tower visible, no own wave                         -> go_home (regroup)
    5.  no foe, no tower, own wave present                         -> ride_wave
    6.  otherwise                                                  -> go_home (wait for next wave)

becomes:

    rule 1  ->  q1_recall_low_hp
    rule 2a ->  q2a_engage_ability
    rule 2b ->  q2b_engage_attack
    rule 3  ->  q3_push_tower_with_wave
    rule 4  ->  q4_regroup_no_wave
    rule 5  ->  q5_ride_wave
    rule 7  ->  (no question -- the unconditional default once q1-q5 all answer "no")

THE FIX THIS CASCADE EXISTS TO MAKE. `runs/jev-house-bot-2026-09-23.md` found that
house-violet.md's rule order -- "no wave near tower -> go home" and "no foe/tower -> ride wave"
both checked BEFORE "foe present -> attack" -- let Jev's bearbots reach a positioning rule before
ever reaching combat, 5x less often than qwen fought under the identical rule table. Here, q1
(emergency recall) is the only rule ahead of engagement; q2a/q2b (fight) are asked before any
positioning question (q3-q5). A Jev bearbot using this cascade cannot answer its way into "go home"
or "ride wave" while a fightable foe is in front of it, the way the old cascade's order allowed.

Thresholds are fractions of `maxHp`, not a fixed HP number (house-violet.md's 75 was tuned to that
prompt's specific maxHp assumptions; a percentage means the same thing regardless of a bearbot's
actual maxHp, which `Observation.self.maxHp` -- `tools/arena/pages/contract.mjs` -- carries).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Instrument = Literal["drums", "keytar", "violin"]

ActionBucket = Literal["recall", "go_home", "ability", "attack_foe", "attack_tower", "ride_wave"]

HOME_TARGET = {"violet": {"x": 100, "y": 900}, "green": {"x": 900, "y": 100}}

# Per-instrument recall threshold, as a fraction of maxHp -- docs/jev-vs-qwen32b-intent.md's table.
RECALL_THRESHOLD_FRAC: dict[Instrument, float] = {"drums": 0.20, "keytar": 0.35, "violin": 0.35}

ABILITY_NAME: dict[Instrument, str] = {"keytar": "chord", "violin": "staccato", "drums": "kick"}


@dataclass(frozen=True)
class Worksheet:
    """Extends `rules.Worksheet` with the fields this cascade's percentage thresholds and violin's
    finisher condition need that house-violet.md's cascade never had to carry: `max_hp` (for the
    recall fraction), and the foe's own kind/hp/maxHp (for "is my target a weakened bearbot").
    `tower`/`foe` stay presence-only ids, same as `rules.Worksheet` -- target *selection* is done in
    code before this Worksheet is built (see `tools/match/jevTeamPilot.ts::extractWorksheet`), not
    something either model is asked to compute here."""

    hp: float
    max_hp: float
    wave: int
    tower: str | None
    foe: str | None
    foe_is_bearbot: bool
    foe_hp: float | None
    foe_max_hp: float | None
    cd: float
    instrument: Instrument
    team: str
    tick: int
    clock_sec: float


# --- rule predicates --------------------------------------------------------------------------
# Ground truth for "was this condition true", each evaluated independently of cascade order --
# same posture as rules.py: e.g. q2b's ground truth is just "a foe is present", not "...and rule 1
# didn't already win", matching how `first_match` (below) is the only place order is applied.


def recall_threshold(ws: Worksheet) -> float:
    return RECALL_THRESHOLD_FRAC[ws.instrument] * ws.max_hp


def rule1_recall_low_hp(ws: Worksheet) -> bool:
    return ws.hp < recall_threshold(ws)


def ability_condition_met(ws: Worksheet) -> bool:
    """drums/keytar: any foe is a valid ability target. violin: only a bearbot foe already below
    half of ITS OWN maxHp -- the intent doc's "finisher, not fired at anything merely present"."""
    if ws.foe is None:
        return False
    if ws.instrument != "violin":
        return True
    return ws.foe_is_bearbot and ws.foe_hp is not None and ws.foe_max_hp is not None and ws.foe_hp < 0.5 * ws.foe_max_hp


def rule2a_engage_ability(ws: Worksheet) -> bool:
    return ws.foe is not None and ws.cd == 0 and ability_condition_met(ws)


def rule2b_engage_attack(ws: Worksheet) -> bool:
    return ws.foe is not None


def rule3_push_tower_with_wave(ws: Worksheet) -> bool:
    return ws.foe is None and ws.tower is not None and ws.wave >= 1


def rule4_regroup_no_wave(ws: Worksheet) -> bool:
    return ws.foe is None and ws.tower is not None and ws.wave == 0


def rule5_ride_wave(ws: Worksheet) -> bool:
    return ws.foe is None and ws.tower is None and ws.wave >= 1


@dataclass(frozen=True)
class Question:
    id: str
    rule_number: int
    instructions: str
    criteria: dict[str, str]
    ground_truth: "callable[[Worksheet], bool]"


def question_set(instrument: Instrument) -> list[Question]:
    """The five questions for one decision, in cascade order. Threshold and ability wording are
    instrument-specific per docs/jev-vs-qwen32b-intent.md's table; the conditions themselves
    (foe/tower/wave presence) are identical across instruments."""
    threshold_pct = round(RECALL_THRESHOLD_FRAC[instrument] * 100)
    ability_name = ABILITY_NAME[instrument]
    if instrument == "violin":
        ability_instructions = (
            f"Is there a foe present that is an enemy bearbot already below 50% of its own maxHp, "
            f"with '{ability_name}' off cooldown, meaning this bearbot should use '{ability_name}' "
            "to finish it rather than plain-attack?"
        )
        ability_criteria = {
            "true": "a foe is present, it is an enemy bearbot below 50% of its own maxHp, and the ability is off cooldown",
            "false": "no foe is present, the foe is not a weakened bearbot, or the ability is still cooling down",
        }
    else:
        ability_instructions = (
            f"Is a foe present with '{ability_name}' off cooldown, meaning this bearbot should use "
            f"'{ability_name}' on it rather than plain-attack?"
        )
        ability_criteria = {
            "true": "a foe is present and the ability is off cooldown",
            "false": "no foe is present, or the ability is still cooling down",
        }
    return [
        Question(
            id="q1_recall_low_hp",
            rule_number=1,
            instructions=(
                f"Is this bearbot's hp below {threshold_pct}% of its own maxHp, meaning it must "
                "recall home to heal before doing anything else?"
            ),
            criteria={
                "true": f"hp is below {threshold_pct}% of maxHp",
                "false": f"hp is at or above {threshold_pct}% of maxHp",
            },
            ground_truth=rule1_recall_low_hp,
        ),
        Question(
            id="q2a_engage_ability",
            rule_number=2,
            instructions=ability_instructions,
            criteria=ability_criteria,
            ground_truth=rule2a_engage_ability,
        ),
        Question(
            id="q2b_engage_attack",
            rule_number=3,
            instructions="Given the ability was not the right call this turn, is a foe present to plain-attack?",
            criteria={"true": "a foe id is present", "false": "no foe is present"},
            ground_truth=rule2b_engage_attack,
        ),
        Question(
            id="q3_push_tower_with_wave",
            rule_number=4,
            instructions=(
                "Given there is no foe to fight, is an enemy tower or nexus visible AND is this "
                "bearbot's own minion wave (one or more allied minions) nearby, meaning it's safe "
                "to push the tower together with the wave?"
            ),
            criteria={
                "true": "a tower/nexus is visible and the allied wave count is 1 or more",
                "false": "no tower/nexus is visible, or the allied wave count is 0",
            },
            ground_truth=rule3_push_tower_with_wave,
        ),
        Question(
            id="q4_regroup_no_wave",
            rule_number=5,
            instructions=(
                "Given there is no foe and no safe tower push, is a tower/nexus visible while this "
                "bearbot's own wave is NOT there, meaning it should go home and regroup instead of "
                "pushing alone?"
            ),
            criteria={
                "true": "a tower/nexus is visible and the allied wave count is 0",
                "false": "no tower/nexus is visible, or the allied wave count is 1 or more",
            },
            ground_truth=rule4_regroup_no_wave,
        ),
        Question(
            id="q5_ride_wave",
            rule_number=6,
            instructions=(
                "Given there is no foe and no tower in sight, does this bearbot have an allied "
                "minion wave nearby to ride with toward the enemy nexus?"
            ),
            criteria={
                "true": "no foe, no tower, and the allied wave count is 1 or more",
                "false": "a foe or tower is present, or the allied wave count is 0",
            },
            ground_truth=rule5_ride_wave,
        ),
    ]


@dataclass(frozen=True)
class BoundQuestion:
    id: str
    rule_number: int
    instructions: str
    criteria: dict[str, str]
    ground_truth_value: bool


def bind_questions(instrument: Instrument, ws: Worksheet) -> list[BoundQuestion]:
    return [
        BoundQuestion(q.id, q.rule_number, q.instructions, q.criteria, q.ground_truth(ws))
        for q in question_set(instrument)
    ]


def first_match(answers: dict[str, bool]) -> int:
    """q1..q5 in cascade order, first "yes" wins; falls through to rule 7 (unconditional default:
    go_home) if none are true. Rule numbers 1-6 are claimed by the six questions below (in this
    order) -- the fallback must be 7, not 6, or it collides with q5_ride_wave's own rule number."""
    order = [
        "q1_recall_low_hp",
        "q2a_engage_ability",
        "q2b_engage_attack",
        "q3_push_tower_with_wave",
        "q4_regroup_no_wave",
        "q5_ride_wave",
    ]
    for qid in order:
        if answers.get(qid):
            return order.index(qid) + 1
    return 7


def bucket_for_rule(rule_number: int) -> ActionBucket:
    return {
        1: "recall",
        2: "ability",
        3: "attack_foe",
        4: "attack_tower",
        5: "go_home",
        6: "ride_wave",
    }.get(rule_number, "go_home")


def ground_truth_answers(ws: Worksheet) -> dict[str, bool]:
    return {
        "q1_recall_low_hp": rule1_recall_low_hp(ws),
        "q2a_engage_ability": rule2a_engage_ability(ws),
        "q2b_engage_attack": rule2b_engage_attack(ws),
        "q3_push_tower_with_wave": rule3_push_tower_with_wave(ws),
        "q4_regroup_no_wave": rule4_regroup_no_wave(ws),
        "q5_ride_wave": rule5_ride_wave(ws),
    }


def ground_truth_bucket(ws: Worksheet) -> ActionBucket:
    return bucket_for_rule(first_match(ground_truth_answers(ws)))


def bucket_for_action(kind: str, target: object, foe: str | None, tower: str | None, team: str) -> ActionBucket | None:
    """Classify a real (model-produced) action into the same six buckets, so a live reply can be
    compared to `ground_truth_bucket` on equal terms. Returns `None` for a shape this cascade never
    produces (e.g. `hold`)."""
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
        home = HOME_TARGET.get(team)
        if isinstance(target, dict) and home and target.get("x") == home["x"] and target.get("y") == home["y"]:
            return "go_home"
        return "ride_wave"
    return None
