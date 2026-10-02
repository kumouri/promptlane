/**
 * The map's geometry as one match plays it: where the bases are and where the lanes run. The frozen
 * sim's own constants (`BASE`, `LANE_PATHS` in `src/sim/map.ts`) are the specimen's 1000 × 1000 world;
 * a scaled map variant (`MapVariant.scale`, `src/mapVariant.ts`) registers a scaled copy on the
 * match, and every layer outside the sim that needs a base or a lane (the minion walk in
 * `src/resolution.ts`, the recall's fountain, the economy's respawn and shop, the Bandstand's sites,
 * the speed boost and the teleport) reads it from here. A match with no geometry registered gets
 * the specimen's own objects back, so nothing about an unscaled match changes, bit for bit.
 */
import type { Lane, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import { BASE, LANE_PATHS, dist } from './sim/map';

export interface MapGeometry {
  /** Every coordinate of the specimen world × this. 1 = the specimen. */
  scale: number;
  /** Each team's base point (the nexus, the recall's landing spot, the shop's centre). */
  base: Record<Team, Vec2>;
  /** Lane paths, violet base -> green base. */
  lanePaths: Record<Lane, Vec2[]>;
  /** Each lane path's length. */
  laneLengths: Record<Lane, number>;
  /** The river's half-width (`src/sim/map.ts` inRiver: |x − y| < 55 on the specimen). */
  riverHalfWidth: number;
}

function pathLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
  return total;
}

function build(scale: number, base: Record<Team, Vec2>, lanePaths: Record<Lane, Vec2[]>): MapGeometry {
  return {
    scale,
    base,
    lanePaths,
    laneLengths: { top: pathLength(lanePaths.top), mid: pathLength(lanePaths.mid), bottom: pathLength(lanePaths.bottom) },
    riverHalfWidth: 55 * scale,
  };
}

/** The specimen's own world, built on the sim's own objects. */
export const SPECIMEN_GEOMETRY: MapGeometry = build(1, BASE, LANE_PATHS);

const scaleBy = (p: Vec2, s: number): Vec2 => ({ x: p.x * s, y: p.y * s });

/** The specimen world with every coordinate × `scale` (`scale` 1 is the specimen itself). */
export function scaledGeometry(scale: number): MapGeometry {
  if (scale === 1) return SPECIMEN_GEOMETRY;
  return build(
    scale,
    { violet: scaleBy(BASE.violet, scale), green: scaleBy(BASE.green, scale) },
    {
      top: LANE_PATHS.top.map((p) => scaleBy(p, scale)),
      mid: LANE_PATHS.mid.map((p) => scaleBy(p, scale)),
      bottom: LANE_PATHS.bottom.map((p) => scaleBy(p, scale)),
    },
  );
}

const geometryOf = new WeakMap<Match, MapGeometry>();

/** Register a scaled geometry on a match that has not ticked (`applyMapVariant` does this). */
export function setGeometry(match: Match, geometry: MapGeometry): void {
  if (geometry !== SPECIMEN_GEOMETRY) geometryOf.set(match, geometry);
}

/** The geometry `match` plays on: its registered one, else the specimen's. */
export function mapGeometry(match: Match): MapGeometry {
  return geometryOf.get(match) ?? SPECIMEN_GEOMETRY;
}

/** Whether `p` is in the river (`src/sim/map.ts` inRiver, at this geometry's scale). */
export function inRiverOf(geometry: MapGeometry, p: Vec2): boolean {
  return Math.abs(p.x - p.y) < geometry.riverHalfWidth;
}
