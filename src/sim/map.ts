import type { Lane, Team, Vec2 } from '../types';

/** World is a 1000x1000 square diamond arena. Bases sit on opposite corners along x+y=1000. */
export const WORLD_SIZE = 1000;

export const BASE: Record<Team, Vec2> = {
  violet: { x: 100, y: 900 },
  green: { x: 900, y: 100 },
};

export const NEXUS_RADIUS = 55;
export const TOWER_RADIUS = 28;
export const BEARBOT_RADIUS = 14;
export const MINION_RADIUS = 8;

/** Lane paths, always ordered violet-base -> green-base. */
export const LANE_PATHS: Record<Lane, Vec2[]> = {
  top: [
    { x: 100, y: 900 },
    { x: 100, y: 100 },
    { x: 900, y: 100 },
  ],
  mid: [
    { x: 100, y: 900 },
    { x: 900, y: 100 },
  ],
  bottom: [
    { x: 100, y: 900 },
    { x: 900, y: 900 },
    { x: 900, y: 100 },
  ],
};

export const LANES: Lane[] = ['top', 'mid', 'bottom'];

function pathLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += dist(path[i - 1], path[i]);
  }
  return total;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Point at fraction t (0..1) along a polyline, measured violet-base -> green-base. */
export function pointAlongPath(path: Vec2[], t: number): Vec2 {
  const clamped = Math.max(0, Math.min(1, t));
  const total = pathLength(path);
  let target = total * clamped;
  for (let i = 1; i < path.length; i++) {
    const segLen = dist(path[i - 1], path[i]);
    if (target <= segLen || i === path.length - 1) {
      const segT = segLen === 0 ? 0 : target / segLen;
      return {
        x: path[i - 1].x + (path[i].x - path[i - 1].x) * segT,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * segT,
      };
    }
    target -= segLen;
  }
  return path[path.length - 1];
}

/** Tower fractions along the lane path, from each team's own base outward. */
const TOWER_FRACTIONS = [0.22, 0.42];

export interface TowerSpawn {
  lane: Lane;
  team: Team;
  pos: Vec2;
  tier: 1 | 2;
}

export function towerSpawns(): TowerSpawn[] {
  const spawns: TowerSpawn[] = [];
  for (const lane of LANES) {
    const path = LANE_PATHS[lane];
    TOWER_FRACTIONS.forEach((frac, i) => {
      spawns.push({ lane, team: 'violet', pos: pointAlongPath(path, frac), tier: (i + 1) as 1 | 2 });
      spawns.push({ lane, team: 'green', pos: pointAlongPath(path, 1 - frac), tier: (i + 1) as 1 | 2 });
    });
  }
  return spawns;
}

export function otherTeam(team: Team): Team {
  return team === 'violet' ? 'green' : 'violet';
}

/** River band: the anti-diagonal strip around x == y, purely visual/flavor. */
export function inRiver(p: Vec2): boolean {
  return Math.abs(p.x - p.y) < 55;
}
