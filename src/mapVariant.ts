/**
 * Map variants: tower placement and tower range applied to a freshly built `Match` from the
 * outside. The specimen sim (`src/sim/*`) is frozen (runs/historical-v1.md records its hashes), so a
 * balance change to the Jam's map cannot edit `TOWER_FRACTIONS` in `sim/map.ts` or the tower stats
 * in `sim/entities.ts`; it is a constant here instead, applied before the first tick by every
 * place that builds a match (the headless runner, its replay verifier, the browser replay/live view
 * and the match metrics tool). A match log records the variant it was played on (`MatchLog.map`);
 * a log without one was played on the specimen map, so every older log still replays unchanged.
 *
 * Why the variant exists, and the measurements behind its numbers: runs/balance-pvp-2026-09-30.md.
 *
 * `pvp-2` (Ceryce, 2026-09-30 23:18 CT; runs/pvp-2-2026-10-02.md) adds three things a variant may carry:
 * - `scale`: every map coordinate is multiplied by it — bases, lane paths, towers, spawn points, the
 *   fountain's shop zone and the Bandstand's sites — while ranges, vision and speeds stay as they
 *   are, so every walk takes `scale` times as long. The frozen sim reads `BASE` and `LANE_PATHS`
 *   itself in three places, and each is handled from outside: `applyMapVariant` moves the nexuses,
 *   towers and bearbots before tick 1 and re-places each minion wave as it spawns; the minion's
 *   lane walk is `src/resolution.ts`'s (so a scaled map needs `simultaneous-1`); and the recall,
 *   respawn, shop and Bandstand read `mapGeometry(match)`. A variant without `scale` registers no
 *   geometry, and every one of those reads the specimen's own constants, as before.
 * - `laneTowerFractions`: one lane's tower fractions, overriding `towerFractions` for that lane.
 * - `homeguard` and `teleport`: rule layers the map brings with it (`src/homeguard.ts`,
 *   `src/teleport.ts`), attached by `attachMapRules`.
 */
import type { Lane, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import { LANE_PATHS, LANES, dist, pointAlongPath } from './sim/map';
import { scaledGeometry, setGeometry, type MapGeometry } from './geometry';
import type { HomeguardRules } from './homeguard';
import type { TeleportRules } from './teleport';
import HOMEGUARD_1_JSON from './homeguard/homeguard-1.json';
import TELEPORT_1_JSON from './teleport/teleport-1.json';

export const HOMEGUARD_1: HomeguardRules = HOMEGUARD_1_JSON as HomeguardRules;
export const TELEPORT_1: TeleportRules = TELEPORT_1_JSON as TeleportRules;

export interface MapVariant {
  /** Stable name recorded in match logs. */
  name: string;
  /** Tower attack range, centre to centre (the sim compares `dist(unit.pos, tower.pos)`). */
  towerRange: number;
  /** Tower path fractions from each team's own base: [tier 1 (inner), tier 2 (outer)]. */
  towerFractions: [number, number];
  /** Per-lane override of `towerFractions`. Absent = every lane uses `towerFractions`. */
  laneTowerFractions?: Partial<Record<Lane, [number, number]>>;
  /** Every map coordinate × this (module comment). Absent = 1, the specimen's 1000 × 1000 world. */
  scale?: number;
  /** Out-of-base speed boost (`src/homeguard.ts`). Absent = none. */
  homeguard?: HomeguardRules;
  /** Teleport to a friendly tower, every bot's extra ability (`src/teleport.ts`). Absent = none. */
  teleport?: TeleportRules;
  /**
   * Tower hp (and maxHp) at the start: [tier 1 (inner), tier 2 (outer)]. Absent = the specimen's 900
   * for both, and the towers' hp is not touched, so a log recorded without it replays unchanged.
   */
  towerHp?: [number, number];
  /** Nexus hp (and maxHp) at the start. Absent = the specimen's 2200, not touched. */
  nexusHp?: number;
}

/** The specimen's own map, exactly as `sim/map.ts` and `sim/entities.ts` build it. */
export const SPECIMEN_MAP: MapVariant = { name: 'v1', towerRange: 160, towerFractions: [0.22, 0.42] };

/**
 * The PvP map (2026-09-30): both towers of every lane pulled back toward their base, range kept,
 * so each lane has a stretch between the outer towers that no tower covers (mid 132, top/bottom 320
 * path units; the specimen has none). See runs/balance-pvp-2026-09-30.md.
 */
export const PVP_MAP: MapVariant = { name: 'pvp-1', towerRange: 160, towerFractions: [0.16, 0.3] };

/**
 * The measured alternative: a similar neutral stretch (mid 122, top/bottom 272) made mostly by
 * cutting tower range below the keytar's 160 instead. Rejected on the same Jev matches: no more
 * PvP than the specimen, towers hit bearbots harder, bots spread apart. Kept so its logs replay.
 */
export const PVP_SHORT_RANGE_MAP: MapVariant = { name: 'pvp-1r', towerRange: 120, towerFractions: [0.2, 0.34] };

/**
 * pvp-2 (opt-in; Ceryce approved the package 2026-09-30 23:18 CT): the world scaled ×1.33, back
 * towers at 0.16 and front towers at 0.35 of each side lane, mid's front tower at 0.375, an
 * out-of-base speed boost (homeguard-1) and a teleport to any friendly tower (teleport-1). Recall
 * stays recall-2. Couriers are not in it yet (runs/pvp-2-2026-10-02.md §4). `pvp-1` stays the default.
 */
export const PVP_2_MAP: MapVariant = {
  name: 'pvp-2',
  towerRange: 160,
  towerFractions: [0.16, 0.35],
  laneTowerFractions: { mid: [0.16, 0.375] },
  scale: 1.33,
  homeguard: HOMEGUARD_1,
  teleport: TELEPORT_1,
};

/**
 * pvp-1 with the towers' hp cut (opt-in, 2026-10-02): outer towers 400, inner 600, nexus unchanged
 * at 2200. On pvp-1 at 900 no tower fell before the Final Chorus's 8:00 in any of 44 recorded Jev
 * matches. By 7:59 the weakest outer tower had lost a median of 472, an inner tower at most 26, and
 * no nexus had been touched. Outer 400 is the knee: with today's bots it puts the first tower down
 * before 8:00 in about half the matches, and a deeper cut adds almost nothing. Inner 600 keeps an
 * inner tower tougher than the outer one in front of it.
 * See runs/tower-hp-2026-10-02.md.
 */
export const PVP_TOWER_HP_MAP: MapVariant = { ...PVP_MAP, name: 'pvp-1-hp400', towerHp: [600, 400] };

export const MAP_VARIANTS: Record<string, MapVariant> = {
  [SPECIMEN_MAP.name]: SPECIMEN_MAP,
  [PVP_MAP.name]: PVP_MAP,
  [PVP_SHORT_RANGE_MAP.name]: PVP_SHORT_RANGE_MAP,
  [PVP_2_MAP.name]: PVP_2_MAP,
  [PVP_TOWER_HP_MAP.name]: PVP_TOWER_HP_MAP,
};

/**
 * The map new Jam matches are played on (the CLI, the arena, the evolution harness). The PvP map
 * since 2026-09-30: seed-paired on Jev it raised PvP damage and moved fights out from under towers
 * (runs/balance-pvp-2026-09-30.md). `--map v1` still plays the specimen map.
 */
export const DEFAULT_MAP: MapVariant = PVP_MAP;

/** Resolve a name (CLI `--map`) or a recorded variant (a log's `map`); absent = the specimen map. */
export function resolveMap(map: string | MapVariant | null | undefined): MapVariant {
  if (map == null) return SPECIMEN_MAP;
  if (typeof map !== 'string') return map;
  const found = MAP_VARIANTS[map];
  if (!found) throw new Error(`unknown map variant "${map}" (known: ${Object.keys(MAP_VARIANTS).join(', ')})`);
  return found;
}

/** The variant's geometry (`src/geometry.ts`): the specimen's own unless it has a `scale`. */
export function variantGeometry(variant: MapVariant): MapGeometry {
  return scaledGeometry(variant.scale ?? 1);
}

/** A lane's [tier 1, tier 2] tower fractions on a variant. */
export function laneFractions(variant: MapVariant, lane: Lane): [number, number] {
  return variant.laneTowerFractions?.[lane] ?? variant.towerFractions;
}

/** Where a tower of this lane/team/tier stands on a variant. */
export function towerPos(variant: MapVariant, lane: Lane, team: Team, tier: 1 | 2): Vec2 {
  const frac = laneFractions(variant, lane)[tier - 1];
  return pointAlongPath(variantGeometry(variant).lanePaths[lane], team === 'violet' ? frac : 1 - frac);
}

/** Where the sim spawns a bearbot (`src/sim/match.ts`) and the economy respawns it: 0.08 down its lane. */
export const LANE_SPAWN_T = 0.08;

/**
 * Move and re-range the towers of a match that has not ticked yet, and set the structures' hp when
 * the variant carries it (`towerHp`, `nexusHp`). A no-op on the specimen map, so a v1 match is
 * bit-identical whether or not this is called.
 *
 * On a scaled variant it also moves the nexuses and the bearbots to the scaled world, registers the
 * geometry on the match (`src/geometry.ts`), and wraps the sim's minion-wave step so each new
 * minion is re-placed at the scaled lane start (keeping the sim's own jitter, so the RNG draws are
 * the same). A scaled match needs the `simultaneous-1` resolution for its minions' lane walk:
 * `attachMapRules` checks.
 */
export function applyMapVariant(match: Match, variant: MapVariant): void {
  for (const t of match.towers) {
    const p = towerPos(variant, t.lane, t.team, t.tier);
    t.pos.x = p.x;
    t.pos.y = p.y;
    t.attackRange = variant.towerRange;
    if (variant.towerHp) t.hp = t.maxHp = variant.towerHp[t.tier - 1];
  }
  if (variant.nexusHp != null) for (const n of match.nexuses) n.hp = n.maxHp = variant.nexusHp;
  const scale = variant.scale ?? 1;
  if (scale === 1) return;
  const geo = variantGeometry(variant);
  setGeometry(match, geo);
  for (const n of match.nexuses) {
    n.pos.x = geo.base[n.team].x;
    n.pos.y = geo.base[n.team].y;
  }
  for (const b of match.bearbots) {
    const p = pointAlongPath(geo.lanePaths[b.lane], b.team === 'violet' ? LANE_SPAWN_T : 1 - LANE_SPAWN_T);
    b.pos.x = p.x;
    b.pos.y = p.y;
  }
  const m = match as unknown as { updateMinionWaves(dt: number): void };
  const specimenWaves = m.updateMinionWaves.bind(match);
  m.updateMinionWaves = (dt: number) => {
    const before = match.minions.length;
    specimenWaves(dt);
    for (let k = before; k < match.minions.length; k++) {
      const mn = match.minions[k];
      const from = pointAlongPath(LANE_PATHS[mn.lane], mn.pathT);
      const to = pointAlongPath(geo.lanePaths[mn.lane], mn.pathT);
      mn.pos = { x: to.x + (mn.pos.x - from.x), y: to.y + (mn.pos.y - from.y) };
    }
  };
}

export interface LaneCoverage {
  lane: Lane;
  /** Lane length along its path. */
  length: number;
  /** Straight-line distance between the two outer (tier 2) towers. */
  outerTowerDistance: number;
  /**
   * Path length between the outer towers that neither outer tower covers. 0 means the two towers'
   * ranges meet or overlap along the lane: every point of the lane between them is under a tower.
   */
  neutralLength: number;
  /** `neutralLength` as a share of the lane's length. */
  neutralShare: number;
  /** Path length between the outer towers covered by BOTH outer towers at once. */
  overlapLength: number;
  /**
   * Straight-line gap between the two outer towers' coverage circles (distance − 2·range). Negative
   * means the circles overlap by that much — and a bend in the lane can put that overlap off the
   * path.
   */
  circleGap: number;
  /**
   * Path length between one team's own inner and outer towers that neither covers (the "blank" a
   * pushing wave crosses after the outer tower falls). 0 = the two ranges meet along the lane.
   */
  innerGapLength: number;
}

/** Model-independent geometry: how much of each lane sits outside both outer towers' coverage. */
export function laneCoverage(variant: MapVariant, samplesPerLane = 4000): LaneCoverage[] {
  const geo = variantGeometry(variant);
  return LANES.map((lane) => {
    const path = geo.lanePaths[lane];
    let length = 0;
    for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
    const [innerFrac, outerFrac] = laneFractions(variant, lane);
    const vInner = towerPos(variant, lane, 'violet', 1);
    const vOuter = towerPos(variant, lane, 'violet', 2);
    const gOuter = towerPos(variant, lane, 'green', 2);
    const [lo, hi] = [outerFrac, 1 - outerFrac];
    let neutral = 0;
    let overlap = 0;
    let innerGap = 0;
    const step = 1 / samplesPerLane;
    for (let k = 0; k < samplesPerLane; k++) {
      const t = (k + 0.5) * step;
      const p = pointAlongPath(path, t);
      if (t >= innerFrac && t <= outerFrac && dist(p, vInner) > variant.towerRange && dist(p, vOuter) > variant.towerRange) innerGap += step * length;
      if (t < lo || t > hi) continue;
      const inV = dist(p, vOuter) <= variant.towerRange;
      const inG = dist(p, gOuter) <= variant.towerRange;
      if (!inV && !inG) neutral += step * length;
      if (inV && inG) overlap += step * length;
    }
    const outerTowerDistance = dist(vOuter, gOuter);
    return {
      lane,
      length,
      outerTowerDistance,
      neutralLength: neutral,
      neutralShare: neutral / length,
      overlapLength: overlap,
      circleGap: outerTowerDistance - 2 * variant.towerRange,
      innerGapLength: innerGap,
    };
  });
}
