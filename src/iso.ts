/**
 * The isometric camera (docs/render-spec.md §4/§5) — pure math, no canvas/DOM. Kept separate from
 * `render.ts` so it can be unit-tested directly (bundled and imported in Node, the same trick
 * `tools/arena/test_browser.mjs` already uses for `src/live.ts`) instead of only being exercised
 * through a real `<canvas>`.
 *
 * The transform aligns the iso axes with the map's own diagonals (§4), not a rotation of the raw
 * (x, y) axes:
 *   u = x - y   (river axis: the river band |x-y| < 55 is exactly |u| < 55)
 *   v = x + y   (base-to-base axis: both bases sit on v = 1000)
 *   screenX = originX + u * kx
 *   screenY = originY + v * ky - h(entity) * kz     (ky = kx / 2, the classic 2:1 iso ratio)
 *
 * `project()` is that formula. A world-space rectangle stroked along the diagonal river/lanes
 * under the *linear part* of this same transform ([kx, ky, -kx, ky] as a canvas setTransform)
 * reproduces the identical projection for every point on the path — so `render.ts` draws the
 * ground layer (river, lanes, jungle dots, footprint shadows) by reusing the old world-space
 * drawing code verbatim under that matrix, rather than re-deriving every point through `project()`
 * by hand. `groundMatrixOf()` returns exactly that matrix.
 */
import type { Team, Vec2 } from './types';

export type DrawableKind = 'nexus' | 'tower' | 'minion' | 'bearbot';

/** ky = kx * ISO_RATIO — the 2:1 iso ratio. Also the squash ratio of a footprint shadow ellipse. */
export const ISO_RATIO = 0.5;

/** kz = kx * ELEVATION_RATIO — how strongly world-unit "visual height" lifts a sprite on screen. */
export const ELEVATION_RATIO = 0.5;

/** Per-kind "visual height" h(entity) in world units (§4: nexus tallest, tower mid, bearbot low, minion flat). */
export const HEIGHT_BY_KIND: Record<DrawableKind, number> = {
  nexus: 150,
  tower: 85,
  bearbot: 40,
  minion: 0,
};

/** Draw order tie-break (§5): map furniture, then minions, then the units eyes track. */
export const KIND_PRIORITY: Record<DrawableKind, number> = {
  nexus: 0,
  tower: 0,
  minion: 1,
  bearbot: 2,
};

export interface IsoFit {
  kx: number;
  ky: number;
  kz: number;
  originX: number;
  originY: number;
}

/** u = x-y (river axis), v = x+y (base-to-base axis) — the map's own diagonals, not a rotation of them. */
export function toIso(p: Vec2): { u: number; v: number } {
  return { u: p.x - p.y, v: p.x + p.y };
}

/**
 * Fit the whole 1000x1000 world (u spans [-1000, 1000], v spans [0, 2000]) plus elevation headroom
 * into canvasWidth x canvasHeight, centered on both axes. Works for any aspect ratio, including a
 * narrow phone viewport (docs/render-spec.md §15) — it just yields a smaller `kx`.
 */
export function fitIso(canvasWidth: number, canvasHeight: number, maxHeight: number = HEIGHT_BY_KIND.nexus): IsoFit {
  const MARGIN = 0.92; // leave room for HP bars/glow rings that extend past a unit's own radius
  const uSpan = 2000;
  const vSpan = 2000 * ISO_RATIO; // = 1000
  const kxFromWidth = canvasWidth / uSpan;
  const kxFromHeight = canvasHeight / (vSpan + maxHeight * ELEVATION_RATIO);
  const kx = Math.max(0, Math.min(kxFromWidth, kxFromHeight) * MARGIN);
  const ky = kx * ISO_RATIO;
  const kz = kx * ELEVATION_RATIO;
  const topPad = maxHeight * kz; // headroom above the ground plane for the tallest lifted sprite
  const groundScreenHeight = vSpan * ky; // the v=[0,2000] ground plane's screen-space extent
  const originX = canvasWidth / 2;
  const originY = (canvasHeight - groundScreenHeight - topPad) / 2 + topPad;
  return { kx, ky, kz, originX, originY };
}

/** Screen position of a world point lifted by `h` world units of visual height. */
export function project(p: Vec2, h: number, fit: IsoFit): Vec2 {
  const { u, v } = toIso(p);
  return { x: fit.originX + u * fit.kx, y: fit.originY + v * fit.ky - h * fit.kz };
}

/** The linear part of `project(_, 0, fit)` as a canvas `setTransform` matrix — see the file doc comment. */
export function groundMatrixOf(fit: IsoFit): [number, number, number, number, number, number] {
  return [fit.kx, fit.ky, -fit.kx, fit.ky, fit.originX, fit.originY];
}

/** A world-space direction vector's equivalent screen-space angle under the ground projection. */
export function screenAngleOfWorldDir(dx: number, dy: number, fit: IsoFit): number {
  return Math.atan2(fit.ky * (dx + dy), fit.kx * (dx - dy));
}

/** Semi-axes (px) of a ground-shadow ellipse for a world-space circle of radius `r` (see file doc comment for the derivation: a world circle becomes a circle of radius r*sqrt(2) in (u,v)-space, then an axis-aligned ellipse on screen). */
export function footprintRadii(r: number, fit: IsoFit): { rx: number; ry: number } {
  const rx = r * fit.kx * Math.SQRT2;
  return { rx, ry: rx * ISO_RATIO };
}

export function depthOf(p: Vec2): number {
  return p.x + p.y;
}

export interface DepthEntry {
  pos: Vec2;
  kind: DrawableKind;
  id: string;
}

/** Draw order (§5): ground depth ascending, then kind priority, then entity id — the last two only matter as tie-breaks at equal depth, so two units never flicker their relative order frame to frame. */
export function compareDepth(a: DepthEntry, b: DepthEntry): number {
  const dv = depthOf(a.pos) - depthOf(b.pos);
  if (dv !== 0) return dv;
  const dk = KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  if (dk !== 0) return dk;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** FNV-1a over the id string, folded to [0, 1). Deterministic and stable across frames/processes — never `Math.random()` (§5). */
export function stableHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** A small, stable per-id nudge (§5: "near-coincident-unit offset ... must be a stable hash of the entity id, never per-frame random") so overlapping units in a cluster separate visually without misrepresenting position. */
export function stableOffset(id: string, magnitude: number): Vec2 {
  const angle = stableHash(id) * Math.PI * 2;
  const r = stableHash(`${id}:r`) * magnitude;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

export interface ClusterMember {
  id: string;
  team: Team;
  pos: Vec2;
}

export interface Cluster {
  members: ClusterMember[];
  centroid: Vec2;
  byTeam: Record<Team, number>;
}

/**
 * Groups units within `threshold` world units of each other (single-link) — a cheap, deterministic
 * stand-in for "a team fight" (§5). Used to decide when to layer a count badge on top of a dense
 * cluster instead of relying on the individually-drawn (and, past a point, genuinely
 * indistinguishable) silhouettes to answer acceptance criterion 4 on their own.
 */
export function clusterUnits(units: ClusterMember[], threshold: number): Cluster[] {
  const n = units.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = units[i].pos.x - units[j].pos.x;
      const dy = units[i].pos.y - units[j].pos.y;
      if (dx * dx + dy * dy <= threshold * threshold) union(i, j);
    }
  }
  const groups = new Map<number, ClusterMember[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let g = groups.get(root);
    if (!g) {
      g = [];
      groups.set(root, g);
    }
    g.push(units[i]);
  }
  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    const byTeam: Record<Team, number> = { violet: 0, green: 0 };
    let cx = 0;
    let cy = 0;
    for (const m of members) {
      byTeam[m.team] += 1;
      cx += m.pos.x;
      cy += m.pos.y;
    }
    clusters.push({ members, centroid: { x: cx / members.length, y: cy / members.length }, byTeam });
  }
  return clusters;
}
