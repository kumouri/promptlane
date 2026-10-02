#!/usr/bin/env python3
"""Resolves a translator `target_selector` (`translator.TARGET_SELECTORS`) against one `Observation`
into a concrete target: an entity id string (for `attack`/`ability`) or an `{x,y}` position (for
`move`) -- exactly the two target shapes the real game contract accepts
(`tools/arena/pages/contract.mjs` §4). Deterministic, no model call: this is the piece of the
pipeline that turns "which selector" (the translator's job) into "which specific entity, right now"
(arithmetic over the current Observation, same job `bind_questions`/target logic would do in any of
this repo's other rule-based pilots). `bandstand` is the one selector that reads an optional
Observation field (the objective's `bandstand` block); without it, it falls back to `push_lane`.

Targeting rules (`TARGETING_RULES`), named the way `src/resolution.ts` names a tick resolution so a
match log and an evolution campaign can pin the one they played:

- `own-lane-1` (the default since 2026-10-01). Two changes from `first-min`:
  - **A bot at its own fountain rides its own lane.** Within `FOUNTAIN_RADIUS` of its base,
    `nearby_minion` sends the bot to the start of its own assigned lane (`obs.self.lane`, its match
    slot), not to whichever minion is nearest. That point is `LANE_START_T` along the lane, where
    the match spawns the bot and the economy respawns it. Once it is out there, `nearby_minion` is
    the nearest allied minion again.
  - **Float noise decides nothing.** A selector that picks the nearest (or farthest) candidate
    counts every candidate within `TIE_TOLERANCE` of the best score as tied. It breaks the tie
    side-symmetrically: the bot's own lane, then lane order (top, mid, bottom), then position in
    the bot's own frame, then spawn order. A mirrored state gives the mirrored choice.
- `first-min`: a plain `min()`/`max()` over the float scores, so an exact tie went to whichever
  candidate floating-point noise put a hair ahead. At its own fountain a bot sees all three
  lanes' minions 42.5 units away, and that noise sent green's bots up the top lane 135 times of
  136 (runs/bandstand-4-2026-10-01.md). Kept so a campaign cached under it plays on under it, and
  so a request that names no rule (a runner older than the field) gets what it always got.

Vocabularies (`vocab.py`). The twelve selectors above are vocab-1's, and resolve as they always have
under every vocabulary. vocab-2 adds six (`VOCAB2_SELECTORS`, `docs/vocabulary-spec.md` §4.1 A4),
which read `nearbyTowers` and the map's tower placement; a vocab-1 schema naming one is a
`ValueError`, as any unknown selector always was. Each picks through `_pick`, so a mirrored state
gives the mirrored choice under `own-lane-1`.

One vocab-1 selector reads more under vocab-2 (`VOCAB2_WIDER`): `nearest_tower` picks from the enemy
towers vocab-2's description lists (`vocab.tower_facts`, out to `nearbyTowers`' 390), not only those in
`visibleEnemies` (260). Jev is told a tower is there, so "attack their tower" gets it as a target, and
the sim's `attack` walks to a target that is out of reach (src/sim/match.ts approachAndAttack).
Under vocab-1 it reads `visibleEnemies` as it always has."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vocab import SPECIMEN_LANE_PATHS, TOWER_STAND_OFF, VOCAB_1, MapSpec, map_spec, resolve_vocab, tower_facts  # noqa: E402

TARGETING_FIRST_MIN = "first-min"
TARGETING_OWN_LANE_1 = "own-lane-1"
TARGETING_RULES = (TARGETING_FIRST_MIN, TARGETING_OWN_LANE_1)
DEFAULT_TARGETING = TARGETING_OWN_LANE_1

# Map units. Far above the sim's mirror noise (#56 measured ~1e-11) and far below anything a bot can
# act on: it walks at least 2.75 units a tick (55/s at 20 tps).
TIE_TOLERANCE = 0.5

# src/sim/map.ts LANE_PATHS (the frozen specimen sim), violet base -> green base. The mirror
# (x, y) -> (y, x) swaps the bases and maps every lane onto itself. A scaled map (pvp-2) scales every
# point (`MapSpec.lane_paths`, `MapSpec.home`); each function below takes the request's spec.
LANES = ("top", "mid", "bottom")
LANE_PATHS = SPECIMEN_LANE_PATHS
SPECIMEN = map_spec(None)

# "At its fountain": within the nexus's own radius of the base point (src/sim/map.ts NEXUS_RADIUS).
# Both recalls land inside it (recall-2 teleports to the base point; the specimen's run home stops
# within 20), and so does `home`. It ends 35 units short of the nearest lane start (mid's, 90.5 out),
# so a bot standing where the match or a respawn put it is already in its lane.
FOUNTAIN_RADIUS = 55
# "A bit down the lane": the lane fraction a bot spawns at (src/sim/match.ts) and respawns at
# (src/economy.ts), measured from its own base -- 128 units out on top and bottom, 90.5 on mid.
LANE_START_T = 0.08


def _dist(a: dict, b: dict) -> float:
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def _point_along_path(path: tuple, t: float) -> dict:
    """src/sim/map.ts pointAlongPath: the point at fraction `t` of the polyline's length."""
    segments = list(zip(path, path[1:]))
    total = sum(_dist({"x": a[0], "y": a[1]}, {"x": b[0], "y": b[1]}) for a, b in segments)
    left = total * max(0.0, min(1.0, t))
    for i, (a, b) in enumerate(segments):
        seg = _dist({"x": a[0], "y": a[1]}, {"x": b[0], "y": b[1]})
        if left <= seg or i == len(segments) - 1:
            f = 0 if seg == 0 else left / seg
            return {"x": a[0] + (b[0] - a[0]) * f, "y": a[1] + (b[1] - a[1]) * f}
        left -= seg
    return {"x": path[-1][0], "y": path[-1][1]}


def lane_start(lane: str, team: str, spec: MapSpec = SPECIMEN) -> dict:
    """Where `team`'s bot on `lane` starts it: `LANE_START_T` along the lane from its own base."""
    return _point_along_path(spec.lane_paths()[lane], LANE_START_T if team == "violet" else 1 - LANE_START_T)


def at_fountain(self_: dict, spec: MapSpec = SPECIMEN) -> bool:
    return _dist(self_["pos"], spec.home(self_["team"])) <= FOUNTAIN_RADIUS


def _segment_dist(p: dict, a: tuple, b: tuple) -> float:
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    t = max(0.0, min(1.0, ((p["x"] - ax) * dx + (p["y"] - ay) * dy) / (dx * dx + dy * dy)))
    return _dist(p, {"x": ax + t * dx, "y": ay + t * dy})


def lane_of(pos: dict, spec: MapSpec = SPECIMEN) -> str | None:
    """The lane whose path runs nearest `pos`, or None when two lanes are within `TIE_TOLERANCE` of
    it (only at a base, where all three start). The Observation doesn't say which lane a minion
    walks, but a minion is always on its own lane's path."""
    by_lane = sorted((min(_segment_dist(pos, a, b) for a, b in zip(path, path[1:])), lane) for lane, path in spec.lane_paths().items())
    return by_lane[0][1] if by_lane[1][0] - by_lane[0][0] > TIE_TOLERANCE else None


def _own_frame(pos: dict, team: str) -> tuple:
    """`pos` as the bot's own side sees the map: violet's frame is the map; green's is its mirror."""
    return (pos["x"], pos["y"]) if team == "violet" else (pos["y"], pos["x"])


def _spawn_order(id_: str) -> tuple:
    """Entity ids are `<kind>-<counter>` (src/sim/entities.ts nextId): sort by the counter, which is
    creation order, and a mirrored state creates both sides' entities in the same order."""
    prefix, _, n = str(id_).rpartition("-")
    return (prefix, int(n)) if n.isdigit() else (str(id_), -1)


def _pick(pool: list, score, self_: dict, targeting: str, best=min, spec: MapSpec = SPECIMEN):
    """The candidate with the best `score` (`best` = min for nearest, max for farthest)."""
    if targeting == TARGETING_FIRST_MIN:
        return best(pool, key=score)
    scores = [score(c) for c in pool]
    top = best(scores)
    tied = [c for c, s in zip(pool, scores) if s == top or abs(s - top) <= TIE_TOLERANCE]
    if len(tied) == 1:
        return tied[0]
    own_lane, team = self_.get("lane"), self_["team"]

    def tie_key(c):
        lane = lane_of(c["pos"], spec)
        fx, fy = _own_frame(c["pos"], team)
        return (
            0 if own_lane is not None and lane == own_lane else 1,
            LANES.index(lane) if lane in LANES else len(LANES),
            round(fx / TIE_TOLERANCE),
            round(fy / TIE_TOLERANCE),
            _spawn_order(c.get("id", "")),
        )

    return min(tied, key=tie_key)


# vocab-2's selectors (translator.VOCAB2_SELECTORS describes them to the translator).
VOCAB2_SELECTORS = ("own_tower", "own_front_tower", "nearest_enemy_bearbot", "nearest_enemy_minion", "tower_diver", "nearest_ally")
# A teleport's two targets on a map that has one (pvp-2, `src/teleport.ts`; translator.PVP2_SELECTORS):
# a tower id from the observation's own `teleport.towers` list, or None when it names none (a match
# without the teleport, or no tower that qualifies).
PVP2_SELECTORS = ("tp_lane_tower", "tp_threatened_tower")
# vocab-1 selectors that vocab-2 resolves from what its description states (module docstring).
VOCAB2_WIDER = ("nearest_tower",)


def tower_spot(spec: MapSpec, lane: str, team: str, tier: int) -> dict:
    """src/mapVariant.ts towerPos: where `team`'s tier-`tier` tower (1 inner, 2 outer) of `lane` stands."""
    frac = spec.fractions(lane)[tier - 1]
    return _point_along_path(spec.lane_paths()[lane], frac if team == "violet" else 1 - frac)


def stand_by(tower_pos: dict, team: str, spec: MapSpec = SPECIMEN) -> dict:
    """`TOWER_STAND_OFF` units from a tower toward this team's base: inside its range, behind it."""
    home = spec.home(team)
    d = _dist(tower_pos, home)
    if d <= TOWER_STAND_OFF:
        return dict(home)
    f = TOWER_STAND_OFF / d
    return {"x": tower_pos["x"] + (home["x"] - tower_pos["x"]) * f, "y": tower_pos["y"] + (home["y"] - tower_pos["y"]) * f}


def _seen_at(obs: dict, spot: dict, team: str) -> dict | None:
    """The tower of `team` the observation lists at `spot` (alive or dead), or None when it is
    beyond the 390 units towers are listed within, so whether it stands is unknown."""
    for t in obs.get("nearbyTowers") or ():
        if t.get("team") == team and _dist(t["pos"], spot) <= 1.0:
            return t
    return None


def _lane_tower(obs: dict, spec: MapSpec, tiers: tuple) -> dict:
    """The first of this bot's own-lane tower spots, in `tiers` order, whose tower stands or isn't
    listed (so may stand: a dead tower beyond 390 can't be known before stage B); else home."""
    self_ = obs["self"]
    team, lane = self_["team"], self_.get("lane")
    if lane in LANE_PATHS:
        for tier in tiers:
            spot = tower_spot(spec, lane, team, tier)
            seen = _seen_at(obs, spot, team)
            if seen is None or seen.get("alive", True):
                return stand_by(spot, team, spec)
    return spec.home(team)


def _teleport_tower(selector: str, obs: dict) -> str | None:
    """A teleport's destination (`src/teleport.ts`): one of this bot's own standing towers from the
    observation's `teleport.towers`, which lists them map-wide.
    - `tp_lane_tower`: its own lane's outer tower, else its own lane's inner one.
    - `tp_threatened_tower`: the tower with the most enemy bearbots within 260 of it (at least one);
      ties go to the bot's own lane, then lane order (top, mid, bottom), then the outer tower, so a
      mirrored state picks the mirrored tower."""
    towers = (obs.get("teleport") or {}).get("towers") or []
    lane = obs["self"].get("lane")
    if selector == "tp_lane_tower":
        mine = sorted((t for t in towers if t.get("lane") == lane), key=lambda t: -t.get("tier", 0))
        return mine[0]["id"] if mine else None
    hot = [t for t in towers if (t.get("enemyBearbots") or 0) > 0]
    if not hot:
        return None

    def key(t):
        return (-t["enemyBearbots"], 0 if t.get("lane") == lane else 1,
                LANES.index(t["lane"]) if t.get("lane") in LANES else len(LANES), -t.get("tier", 0))

    return min(hot, key=key)["id"]


def _resolve_vocab2(selector: str, obs: dict, targeting: str, spec: MapSpec) -> object | None:
    self_ = obs["self"]
    team = self_["team"]
    enemies = obs.get("visibleEnemies", [])
    bearbots = [e for e in enemies if e.get("kind") == "bearbot"]
    own_alive = [t for t in obs.get("nearbyTowers") or () if t.get("team") == team and t.get("alive", True)]

    def nearest(pool):
        return _pick(pool, lambda e: _dist(self_["pos"], e["pos"]), self_, targeting, spec=spec)

    if selector in PVP2_SELECTORS:
        return _teleport_tower(selector, obs)
    if selector == "own_tower":
        # the nearest of my towers listed alive, else my lane's spots, the inner one first
        return stand_by(nearest(own_alive)["pos"], team, spec) if own_alive else _lane_tower(obs, spec, (1, 2))
    if selector == "own_front_tower":
        return _lane_tower(obs, spec, (2, 1))
    if selector == "nearest_enemy_bearbot":
        return nearest(bearbots)["id"] if bearbots else None
    if selector == "nearest_enemy_minion":
        minions = [e for e in enemies if e.get("kind") == "minion"]
        return nearest(minions)["id"] if minions else None
    if selector == "tower_diver":
        divers = [e for e in bearbots if any(_dist(e["pos"], t["pos"]) <= spec.tower_range for t in own_alive)]
        return nearest(divers)["id"] if divers else None
    if selector == "nearest_tower":
        # every enemy tower or nexus the description lists: vocab-1's pool (`visibleEnemies`), plus
        # the alive enemy towers of its tower lines, from the same list they read
        towers = [e for e in enemies if e.get("kind") in ("tower", "nexus")]
        seen = {e["id"] for e in towers}
        towers += [f.tower for f in tower_facts(obs, spec) if not f.own and f.tower.get("alive", True) and f.tower["id"] not in seen]
        return nearest(towers)["id"] if towers else None
    if selector == "nearest_ally":
        allies = obs.get("allies", [])
        if allies:
            a = nearest(allies)
            return {"x": a["pos"]["x"], "y": a["pos"]["y"]}
        near = resolve_target("nearby_minion", obs, targeting, map_=spec)
        return near if near is not None else spec.home(team)
    raise ValueError(f"unknown target_selector {selector!r}")


def resolve_target(selector: str | None, obs: dict, targeting: str = DEFAULT_TARGETING, vocab: str = VOCAB_1,
                   map_: str | dict | None = None) -> object | None:
    """`None` means either `selector` needs no target, or the selector's candidate pool is empty
    for this Observation (e.g. `lowest_hp_enemy` with no visible enemies) -- both are legitimate,
    distinguished by the caller only caring whether a target was actually produced. `targeting` is
    one of `TARGETING_RULES` (module docstring); `vocab` is the schema's vocabulary (`vocab.py`),
    and `map_` the match's map variant, which only vocab-2's tower selectors read."""
    if targeting not in TARGETING_RULES:
        raise ValueError(f"unknown targeting {targeting!r} (known: {', '.join(TARGETING_RULES)})")
    vocab = resolve_vocab(vocab)
    if selector in (None, "none"):
        return None
    spec = map_ if isinstance(map_, MapSpec) else map_spec(map_)
    if vocab != VOCAB_1 and (selector in VOCAB2_SELECTORS or selector in VOCAB2_WIDER or selector in PVP2_SELECTORS):
        return _resolve_vocab2(selector, obs, targeting, spec)
    self_ = obs["self"]
    team = self_["team"]
    enemy_team = "green" if team == "violet" else "violet"

    def nearest(pool, origin=None):
        origin = origin or self_["pos"]
        return _pick(pool, lambda e: _dist(origin, e["pos"]), self_, targeting, spec=spec)

    if selector == "home":
        return spec.home(team)
    if selector == "push_lane":
        return spec.home(enemy_team)
    if selector == "bandstand":
        # The river objective (docs/economy-spec.md §9.7): its stage while it is open or opens
        # within the warning window; closed, done, or a match with no objective at all -> exactly
        # push_lane, so a stale "go take the Bandstand" rule walks up the lane instead of parking.
        stand = obs.get("bandstand")
        if stand and stand.get("status") in ("upcoming", "open"):
            return {"x": stand["pos"]["x"], "y": stand["pos"]["y"]}
        return resolve_target("push_lane", obs, targeting, map_=spec)

    enemies = obs.get("visibleEnemies", [])
    bearbots = [e for e in enemies if e.get("kind") == "bearbot"]

    if selector == "nearest_enemy":
        return nearest(enemies)["id"] if enemies else None
    if selector == "lowest_hp_enemy":
        # hp ties are exact (no position in them), and list order is the same for both sides
        pool = bearbots or enemies
        return min(pool, key=lambda e: e["hp"])["id"] if pool else None
    if selector == "densest_cluster_enemy":
        # an integer count: ties are exact, and list order is the same for both sides
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
        return _pick(pool, min_dist_to_others, self_, targeting, best=max)["id"]
    if selector == "nearest_tower":
        towers = [e for e in enemies if e.get("kind") in ("tower", "nexus")]
        return nearest(towers)["id"] if towers else None
    if selector == "threatened_ally_enemy":
        allies = obs.get("allies", [])
        if not allies or not enemies:
            return None
        weakest_ally = min(allies, key=lambda a: a["hp"] / a["maxHp"])
        return nearest(enemies, weakest_ally["pos"])["id"]
    if selector == "highest_bounty_enemy":
        # docs/economy-spec.md §4.3: the visible enemy bearbot with the largest `bounty` (the economy
        # layer's field). Ties go to the nearer one. No bounty-bearing bearbot (none visible, or a match
        # without an economy) falls back to `nearest_enemy`, as the other enemy selectors fall back.
        pool = [e for e in bearbots if isinstance(e.get("bounty"), (int, float))]
        if pool:
            if targeting == TARGETING_FIRST_MIN:
                return max(pool, key=lambda e: (e["bounty"], -_dist(self_["pos"], e["pos"])))["id"]
            richest = max(e["bounty"] for e in pool)
            return nearest([e for e in pool if e["bounty"] == richest])["id"]
        return resolve_target("nearest_enemy", obs, targeting, map_=spec)
    if selector == "nearby_minion":
        minions = [m for m in obs.get("nearbyMinions", []) if m.get("team") == team]
        if not minions:
            return None
        if targeting == TARGETING_OWN_LANE_1 and self_.get("lane") in LANE_PATHS and at_fountain(self_, spec):
            return lane_start(self_["lane"], team, spec)
        target = nearest(minions)
        return {"x": target["pos"]["x"], "y": target["pos"]["y"]}

    raise ValueError(f"unknown target_selector {selector!r}")


def main() -> int:
    """`python tools/jev/target_resolve.py`: one JSON request a line on stdin, `{"selector",
    "observation", "targeting"?, "vocab"?, "map"?}` (absent targeting = first-min, as at the schema
    server; absent vocab = vocab-1), one `{"target"}` or `{"error"}` line back. It lets a test drive
    this resolver from the real sim's observations (tools/match/test_targeting.mjs, test_vocab.mjs)."""
    import json

    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            req = json.loads(line)
            out = {"target": resolve_target(req["selector"], req["observation"], req.get("targeting", TARGETING_FIRST_MIN),
                                            req.get("vocab", VOCAB_1), req.get("map"))}
        except Exception as exc:  # noqa: BLE001 -- reported to the caller, line by line
            out = {"error": f"{type(exc).__name__}: {exc}"}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
