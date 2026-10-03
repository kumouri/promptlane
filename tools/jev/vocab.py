#!/usr/bin/env python3
"""The shared vocabulary a compiled rule is written in (`docs/vocabulary-spec.md`): which facts the
game states to Jev every decision, and which targets a rule can name. One name pins the whole set,
the way `target_resolve.TARGETING_RULES` names a targeting rule:

- `vocab-1`: the vocabulary every schema had before 2026-10-02. A schema with no `"vocab"` key is
  vocab-1, and it is described (`fidelity_harness.describe_observation`) and resolved
  (`target_resolve.resolve_target`) byte for byte as before, forever.
- `vocab-2` (stage A of the spec, §4.1): vocab-1 plus tower facts by team (under my own tower; will
  an enemy tower shoot me), distances and attack-range flags, minion hp, the bot's own lane, a
  fight-balance line that counts towers, and six targets: `own_tower`, `own_front_tower`,
  `nearest_enemy_bearbot`, `nearest_enemy_minion`, `tower_diver`, `nearest_ally`. The default for
  entrant compiles (`DEFAULT_VOCAB`, read by `compile.py`).

A schema plays under the vocabulary it was compiled under, never under a server's default (§3
rule 3). This module is pure arithmetic over the observation as the sim hands it (`src/types.ts`);
no model call, no sim state the observation doesn't carry.

Two numbers the observation doesn't carry come from the request's `map` (`src/mapVariant.ts`, the
variant object a match log records): tower range and the towers' lane fractions. The attack ranges
are the specimen's static per-instrument table (`src/sim/entities.ts`; items don't change them).
`tools/match/test_vocab.mjs` holds both mirrors to the TypeScript."""
from __future__ import annotations

from dataclasses import dataclass

VOCAB_1 = "vocab-1"
VOCAB_2 = "vocab-2"
VOCABS = (VOCAB_1, VOCAB_2)
# What a schema that names no vocabulary is: every schema compiled before the key existed.
LEGACY_VOCAB = VOCAB_1
# What an entrant compile writes (`compile.py --vocab`): ruled 2026-10-02 (spec §7 D1, D2).
DEFAULT_VOCAB = VOCAB_2

# src/sim/match.ts: enemies and minions are listed within VISION_RADIUS, towers within 1.5x it.
VISION_RADIUS = 260
TOWER_SIGHT = VISION_RADIUS * 1.5
# src/sim/entities.ts INSTRUMENTS[*].attackRange, centre to centre (match.ts approachAndAttack).
ATTACK_RANGE = {"drums": 40, "keytar": 160, "violin": 45}
# src/mapVariant.ts MAP_VARIANTS: name -> (towerRange, (tier-1 fraction, tier-2 fraction)).
MAPS = {
    "v1": (160, (0.22, 0.42)),
    "pvp-1": (160, (0.16, 0.30)),
    "pvp-1r": (120, (0.20, 0.34)),
    "pvp-2": (160, (0.16, 0.35)),
    "pvp-1-hp400": (160, (0.16, 0.30)),  # pvp-1's towers at lower hp; hp is in the observation, not here
    # pvp-1's lane towers at lower hp plus a base tower per team (src/baseTower.ts). The base tower is in the
    # observation's own tower list like any tower, so nothing here needs it.
    "pvp-1-hp300-base700": (160, (0.16, 0.30)),
}
# src/mapVariant.ts: a variant's `scale` and `laneTowerFractions`, for the maps that have them.
MAP_GEOMETRY = {
    "pvp-2": (1.33, {"mid": (0.16, 0.375)}),
}
# src/sim/map.ts BASE and LANE_PATHS: the specimen's 1000 x 1000 world, violet base -> green base.
SPECIMEN_BASE = {"violet": (100, 900), "green": (900, 100)}
SPECIMEN_LANE_PATHS = {
    "top": ((100, 900), (100, 100), (900, 100)),
    "mid": ((100, 900), (900, 100)),
    "bottom": ((100, 900), (900, 900), (900, 100)),
}
# resolveMap(null): a request (like a log) that names no map is on the specimen map.
NO_MAP = "v1"

# The fight verdict (spec §4.1 A3), calibrated on 64,290 recorded pvp-1 decisions by
# `tools/jev/calibrate_fight.py` (runs/vocab-fight-calibration-2026-10-02.md): a tower over the
# fight on one side only decides it (that side won the next 5 s 71-89 % of the time), else hp at
# 1.25x. The spec's outnumbered-by-two veto made the verdict worse at every ratio, so it is off.
STRONGER_HP_RATIO = 1.25
TOWER_RULE = "first"  # "first": a one-sided tower decides; "or": the spec's starting rule; "off": hp only
OUTNUMBERED_BY = None
# `own_tower` / `own_front_tower` stand this far from the tower, toward home: inside its range, behind it.
TOWER_STAND_OFF = 40


def resolve_vocab(name: str | None) -> str:
    """A schema's or request's vocabulary; None (no key) is vocab-1."""
    if name is None:
        return LEGACY_VOCAB
    if name not in VOCABS:
        raise ValueError(f"unknown vocab {name!r} (this checkout knows: {', '.join(VOCABS)})")
    return name


@dataclass(frozen=True)
class MapSpec:
    name: str
    tower_range: float
    tower_fractions: tuple[float, float]
    # A scaled map (pvp-2, `src/geometry.ts`): every coordinate of the specimen world x this.
    scale: float = 1.0
    # Per-lane overrides of `tower_fractions`, as ((lane, (tier 1, tier 2)), ...).
    lane_fractions: tuple = ()

    def fractions(self, lane: str) -> tuple[float, float]:
        return dict(self.lane_fractions).get(lane, self.tower_fractions)

    def home(self, team: str) -> dict:
        """The team's base point (src/geometry.ts base): the nexus, where recall-2 lands."""
        x, y = SPECIMEN_BASE[team]
        return {"x": x * self.scale, "y": y * self.scale} if self.scale != 1 else {"x": x, "y": y}

    def lane_paths(self) -> dict:
        if self.scale == 1:
            return SPECIMEN_LANE_PATHS
        return {lane: tuple((x * self.scale, y * self.scale) for x, y in path) for lane, path in SPECIMEN_LANE_PATHS.items()}


def map_spec(map_: str | dict | None) -> MapSpec:
    """The request's `map`: a variant object as a log records it (`{name, towerRange,
    towerFractions}`, plus `scale` and `laneTowerFractions` on pvp-2), or a name this module
    mirrors, or None for the specimen map."""
    if map_ is None:
        map_ = NO_MAP
    if isinstance(map_, dict):
        try:
            lanes = map_.get("laneTowerFractions") or {}
            return MapSpec(str(map_.get("name", "custom")), float(map_["towerRange"]), (float(map_["towerFractions"][0]), float(map_["towerFractions"][1])),
                           float(map_.get("scale", 1)), tuple(sorted((str(k), (float(v[0]), float(v[1]))) for k, v in lanes.items())))
        except (KeyError, IndexError, TypeError, ValueError, AttributeError) as err:
            raise ValueError(f"bad map {map_!r}: needs towerRange and towerFractions") from err
    if map_ not in MAPS:
        raise ValueError(f"unknown map {map_!r} (known: {', '.join(MAPS)}; or send the variant object)")
    rng, fr = MAPS[map_]
    scale, lanes = MAP_GEOMETRY.get(map_, (1.0, {}))
    return MapSpec(map_, float(rng), fr, float(scale), tuple(sorted(lanes.items())))


def dist(a: dict, b: dict) -> float:
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def enemy_of(team: str) -> str:
    return "green" if team == "violet" else "violet"


# --- tower facts (spec A1) ------------------------------------------------------------------------

@dataclass(frozen=True)
class TowerFact:
    tower: dict
    own: bool
    distance: float
    in_range: bool  # this bot stands inside the tower's range
    my_minions_in_range: int  # enemy tower only: this bot's minions it would shoot first
    divers: tuple[str, ...]  # own tower only: visible enemy bearbots inside its range

    @property
    def will_shoot_me(self) -> bool:
        """The sim's tower rule (match.ts updateTowers): minions first, a bearbot only when no minion
        of its team is in range. Judged from the minions this bot can see: one beyond 260 from it
        but inside the tower's range is missed (stage B makes it exact)."""
        return (not self.own) and self.tower.get("alive", True) and self.in_range and self.my_minions_in_range == 0

    @property
    def shooting_my_minions(self) -> bool:
        """The siege (spec §8.8): this bot stands inside an enemy tower's range while that tower has
        this bot's minions in range, so by the same rule it shoots them and not this bot. Exactly
        the in-range enemy towers that `will_shoot_me` leaves out, judged from the same minions."""
        return (not self.own) and self.tower.get("alive", True) and self.in_range and self.my_minions_in_range > 0


def tower_facts(obs: dict, spec: MapSpec) -> list[TowerFact]:
    self_ = obs["self"]
    me, team = self_["pos"], self_["team"]
    mine = [m for m in obs.get("nearbyMinions") or () if m.get("team") == team]
    bearbots = [e for e in obs.get("visibleEnemies") or () if e.get("kind") == "bearbot"]
    out = []
    for t in obs.get("nearbyTowers") or ():
        own = t.get("team") == team
        in_range = dist(me, t["pos"]) <= spec.tower_range
        out.append(TowerFact(
            tower=t,
            own=own,
            distance=dist(me, t["pos"]),
            in_range=in_range,
            my_minions_in_range=0 if own else sum(1 for m in mine if dist(m["pos"], t["pos"]) <= spec.tower_range),
            divers=tuple(e["id"] for e in bearbots if dist(e["pos"], t["pos"]) <= spec.tower_range) if own and t.get("alive", True) else (),
        ))
    return out


# --- the fight near me (spec A3) ------------------------------------------------------------------

@dataclass(frozen=True)
class FightSide:
    bearbots: int
    hp: float
    minions: int
    towers: int  # alive towers of this side whose range covers this bot


@dataclass(frozen=True)
class Fight:
    mine: FightSide
    theirs: FightSide
    verdict: str  # "stronger" | "even" | "weaker" (this bot's side) | "none" (no enemy bearbot near)


def fight_verdict(mine: FightSide, theirs: FightSide, ratio: float = STRONGER_HP_RATIO, tower_rule: str = TOWER_RULE,
                  outnumbered_by: int | None = OUTNUMBERED_BY) -> str:
    """Counts and hp only: a tower is a threat, not hp (nobody attacks a tower in a skirmish, so its
    900 hp doesn't fight, but its shots do).

    `tower_rule` "first" (shipped): a side with a tower over the fight when the other has none is
    stronger; otherwise the side whose bearbot hp is at least `ratio` times the other's is; otherwise
    even. "or" is the spec's starting rule (either clause makes a side stronger, both sides at once
    is even); "off" ignores towers. `outnumbered_by`, when set, stops a side outnumbered in bearbots
    by that many from reading stronger (and symmetrically). The calibration kept "first", 1.25, no veto."""
    if theirs.bearbots == 0:
        return "none"
    my_tower = tower_rule != "off" and mine.towers > 0 and theirs.towers == 0
    their_tower = tower_rule != "off" and theirs.towers > 0 and mine.towers == 0
    if tower_rule == "first" and (my_tower or their_tower):
        stronger, weaker = my_tower, their_tower
    else:
        stronger = mine.hp >= ratio * theirs.hp or my_tower
        weaker = theirs.hp >= ratio * mine.hp or their_tower
    if outnumbered_by is not None:
        if theirs.bearbots - mine.bearbots >= outnumbered_by:
            stronger = False
        if mine.bearbots - theirs.bearbots >= outnumbered_by:
            weaker = False
    if stronger and not weaker:
        return "stronger"
    if weaker and not stronger:
        return "weaker"
    return "even"


def fight(obs: dict, spec: MapSpec, **verdict_kw) -> Fight:
    """Everything within the vision radius of this bot. The allies list is map-wide, so it is cut to
    260 here; enemies and minions already are (match.ts observe)."""
    self_ = obs["self"]
    me, team = self_["pos"], self_["team"]
    allies = [a for a in obs.get("allies") or () if dist(me, a["pos"]) <= VISION_RADIUS]
    enemies = [e for e in obs.get("visibleEnemies") or () if e.get("kind") == "bearbot"]
    minions = obs.get("nearbyMinions") or ()
    towers = [f for f in tower_facts(obs, spec) if f.in_range and f.tower.get("alive", True)]
    mine = FightSide(1 + len(allies), self_["hp"] + sum(a["hp"] for a in allies),
                     sum(1 for m in minions if m.get("team") == team), sum(1 for f in towers if f.own))
    theirs = FightSide(len(enemies), sum(e["hp"] for e in enemies),
                       sum(1 for m in minions if m.get("team") != team), sum(1 for f in towers if not f.own))
    return Fight(mine, theirs, fight_verdict(mine, theirs, **verdict_kw))


# --- the facts list (spec A5) ---------------------------------------------------------------------

@dataclass(frozen=True)
class Fact:
    key: str
    # What the translator prompt says the game states. `lead` is the words the description's
    # sentence for it starts with; `test_vocab.py` checks every fact's lead appears in a vocab-2
    # description, so the list and the description can't drift apart.
    says: str
    lead: str
    when: str | None = None  # None: every match; else the condition under which it is stated


FACTS_V2 = (
    Fact("self", "this bearbot's team, instrument, lane, position, hp (and its % of max) and its own attack range in units", "Its attack range is"),
    Fact("cooldowns", "each of its two abilities' cooldown in seconds, and whether it is ready", "Cooldowns:"),
    Fact("allies", "every living allied bearbot anywhere on the map: position, distance from this bearbot, hp", "Allied bearbots"),
    Fact("enemies", "every enemy within 260 units (bearbots, minions, towers, the nexus): kind, position, distance, hp", "Enemies within 260 units"),
    Fact("in_attack_range", "which enemies are inside this bearbot's own attack range", "in your attack range"),
    Fact("minions", "every minion within 260 units, yours and theirs: distance and hp", "Minions within 260 units"),
    Fact("own_towers", "this bearbot's own towers within 390 units: hp, position, distance, whether it stands inside the tower's range "
         "(\"under your own tower\"), and any enemy bearbot inside that tower's range (a tower diver)", "under your own tower"),
    Fact("enemy_towers", "enemy towers within 390 units: hp, position, distance, whether this bearbot is inside the tower's range, and whether "
         "the tower will shoot it (a tower shoots minions first, and a bearbot only when none of that bearbot's minions is in its range); "
         "and whether this bearbot is inside an enemy tower's range while that tower has this bearbot's own minions in its range, so "
         "the tower shoots them, not it", "enemy tower will shoot you"),
    Fact("fight", "the fight near this bearbot (within 260 units): each side's bearbots and their total hp, minions, and towers whose "
         "range covers it, then a verdict: your side is stronger, even, or weaker here, or there is no fight near you", "Fight near you"),
    Fact("economy", "its gold, level and XP, items, next item and whether it can afford it, whether it is at its base; allies' gold "
         "and items; each visible enemy bearbot's level and bounty; who is respawning and when", "unspent gold", when="the match has the economy"),
    Fact("bandstand", "the Bandstand (the river objective): open, upcoming, closed or done, its distance, progress and who is on it, "
         "and who has Encore", "Bandstand", when="the match has the Bandstand; otherwise it says there is no Bandstand"),
)

FACTS = {VOCAB_1: (), VOCAB_2: FACTS_V2}

# What a map with a teleport and a speed boost adds (pvp-2: `src/teleport.ts`, `src/homeguard.ts`). The
# description states them only when the observation carries them, and a compile lists them only when
# it is told the map (`compile.py --map pvp-2`), so every pvp-1 prompt and description is unchanged.
FACTS_PVP2 = (
    Fact("speed_boost", "whether this bearbot's out-of-base speed boost is on (it moves faster after being in its base, until it takes "
         "damage or enters the river)", "speed boost", when="the map has the speed boost"),
    Fact("teleport", "whether its teleport is ready or how many seconds of cooldown are left, and whether it is channelling one", "Its teleport",
         when="the map has the teleport"),
    Fact("own_towers_map", "every standing tower of its own team, anywhere on the map: lane, inner or outer, hp, and how many enemy "
         "bearbots are within 260 units of it", "Your standing towers", when="the map has the teleport"),
    Fact("teleports", "every teleport in progress, either team's: who, to which tower, and how many seconds until it lands",
         "teleporting", when="the map has the teleport"),
)


def map_has_teleport(map_: str | dict | None) -> bool:
    """Whether a compile's map brings the teleport (and the speed boost): pvp-2's do."""
    if isinstance(map_, dict):
        return bool(map_.get("teleport"))
    return map_ == "pvp-2"


def facts_for(vocab: str, map_: str | dict | None = None) -> tuple[Fact, ...]:
    facts = FACTS[resolve_vocab(vocab)]
    return facts + FACTS_PVP2 if facts and map_has_teleport(map_) else facts
