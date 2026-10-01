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
 */
import type { Lane, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import { LANE_PATHS, LANES, dist, pointAlongPath } from './sim/map';

export interface MapVariant {
  /** Stable name recorded in match logs. */
  name: string;
  /** Tower attack range, centre to centre (the sim compares `dist(unit.pos, tower.pos)`). */
  towerRange: number;
  /** Tower path fractions from each team's own base: [tier 1 (inner), tier 2 (outer)]. */
  towerFractions: [number, number];
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

export const MAP_VARIANTS: Record<string, MapVariant> = {
  [SPECIMEN_MAP.name]: SPECIMEN_MAP,
  [PVP_MAP.name]: PVP_MAP,
  [PVP_SHORT_RANGE_MAP.name]: PVP_SHORT_RANGE_MAP,
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

/** Where a tower of this lane/team/tier stands on a variant. */
export function towerPos(variant: MapVariant, lane: Lane, team: Team, tier: 1 | 2): Vec2 {
  const frac = variant.towerFractions[tier - 1];
  return pointAlongPath(LANE_PATHS[lane], team === 'violet' ? frac : 1 - frac);
}

/**
 * Move and re-range the towers of a match that has not ticked yet. A no-op on the specimen map, so
 * a v1 match is bit-identical whether or not this is called.
 */
export function applyMapVariant(match: Pick<Match, 'towers'>, variant: MapVariant): void {
  for (const t of match.towers) {
    const p = towerPos(variant, t.lane, t.team, t.tier);
    t.pos.x = p.x;
    t.pos.y = p.y;
    t.attackRange = variant.towerRange;
  }
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
}

/** Model-independent geometry: how much of each lane sits outside both outer towers' coverage. */
export function laneCoverage(variant: MapVariant, samplesPerLane = 4000): LaneCoverage[] {
  return LANES.map((lane) => {
    const path = LANE_PATHS[lane];
    let length = 0;
    for (let i = 1; i < path.length; i++) length += dist(path[i - 1], path[i]);
    const vOuter = towerPos(variant, lane, 'violet', 2);
    const gOuter = towerPos(variant, lane, 'green', 2);
    const [lo, hi] = [variant.towerFractions[1], 1 - variant.towerFractions[1]];
    let neutral = 0;
    let overlap = 0;
    const step = 1 / samplesPerLane;
    for (let k = 0; k < samplesPerLane; k++) {
      const t = (k + 0.5) * step;
      if (t < lo || t > hi) continue;
      const p = pointAlongPath(path, t);
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
    };
  });
}
