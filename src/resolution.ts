/**
 * Tick resolution: whether one step of the sim lets the units that update first act on a world the
 * later ones have not touched yet.
 *
 * The specimen sim (`src/sim/match.ts`, frozen) resolves its bearbot and minion steps one unit at a
 * time, in array order. Violet's bearbots come first in the roster and violet's minions are pushed
 * first in every wave, so in a mirror fight violet's units act on a world green's have not yet
 * changed. A minion that kills lands its whole volley before the victim's last shot, a slow lands
 * before the slowed bot moves, and a bot that steps into range hands the first swing to whoever
 * updates after it. On `pvp-1`, with every bearbot holding at base, that is 48 one-second samples
 * of violet minions under green towers a match against green's 2. The geometry is mirror-exact:
 * spawning green first in every wave gives exactly 2 against 48. The full evidence is in
 * runs/side-fairness-2026-10-01.md.
 *
 * `simultaneous-1` replaces those two steps on the match instance (the sim's own source is not
 * touched) with the same rules resolved simultaneously:
 * - every unit alive at the start of the step acts, against positions, lives and slows as they were
 *   at the start of the step;
 * - moves land together at the end of the step;
 * - damage still lands immediately (so attribution, last hits and lifesteal see each hit as it
 *   happens), but a unit taken to 0 hp is only marked dead at the end of the step, after every
 *   unit has acted. A unit dealt lethal damage dies then even if something healed it meanwhile.
 * Nothing else changes: the same stats, ranges, targeting and tie-breaks, and the tower step is
 * left as the specimen wrote it (a tower can't hurt a tower, so no tower's update changes what
 * an enemy tower sees).
 *
 * A match log records the resolution it was played under (`MatchLog.resolution`). A log without
 * one was played on the specimen's sequential order, so every older log replays byte-identically;
 * a log with one replays under the same named resolution. A later change is a new name.
 */
import type { Action, Lane, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import type { Bearbot, Minion, Unit } from './sim/entities';
import { BASE, LANE_PATHS, dist, otherTeam, pointAlongPath } from './sim/map';

/** The specimen's own order: no layer attached. Never recorded in a log. */
export const SEQUENTIAL = 'sequential';
export const SIMULTANEOUS_1 = 'simultaneous-1';
export type Resolution = typeof SEQUENTIAL | typeof SIMULTANEOUS_1;
export const RESOLUTIONS: readonly Resolution[] = [SEQUENTIAL, SIMULTANEOUS_1];

/** What new matches play (the CLI, the arena, the evolution harness). `--resolution sequential` opts out. */
export const DEFAULT_RESOLUTION: Resolution = SIMULTANEOUS_1;

/** Resolve a name (CLI `--resolution`) or a log's recorded value; absent = the specimen's order. */
export function resolveResolution(name: string | null | undefined): Resolution {
  if (name == null) return SEQUENTIAL;
  if (!(RESOLUTIONS as readonly string[]).includes(name)) {
    throw new Error(`unknown resolution "${name}" (known: ${RESOLUTIONS.join(', ')})`);
  }
  return name as Resolution;
}

// The specimen's constants, copied: `src/sim/match.ts` does not export them.
const AGGRO_RADIUS = 130;
const RECALL_SPEED_MULT = 3;
const SLOW_MULT = 0.5;
const SOLO_SPEED_MULT = 1.6;

/** The specimen's private members this layer reaches, as `headless.ts` reaches `tick`. */
interface Internals {
  pilotState: Map<string, { currentAction: Action }>;
  updateBearbots(dt: number): void;
  updateMinions(dt: number): void;
  approachAndAttack(bot: Bearbot, target: Unit, speed: number, dt: number): void;
  tryUseAbility(bot: Bearbot, action: Action): void;
  findUnit(id: string): Unit | undefined;
  resolveVec2(target: Action['target']): Vec2 | null;
  stepToward(from: Vec2, to: Vec2, speed: number, dt: number): void;
  checkDeath(unit: Unit): void;
}

const resolutionOf = new WeakMap<Match, Resolution>();

/** The resolution attached to a match (`sequential` when none was). */
export function getResolution(match: Match): Resolution {
  return resolutionOf.get(match) ?? SEQUENTIAL;
}

/**
 * Attach `resolution` to a match that has not ticked yet, right after `applyMapVariant` and before
 * any other layer: attribution (`src/attribution.ts`, via the economy and the metrics tool) wraps
 * the instance's minion step, so it has to wrap this one. `sequential` attaches nothing.
 */
export function attachResolution(match: Match, resolution: Resolution): void {
  if (resolution === SEQUENTIAL) return;
  if (resolutionOf.has(match)) throw new Error('a resolution is already attached to this match');
  const m = match as unknown as Internals;
  const proto = Object.getPrototypeOf(match) as Internals;
  if (match.clockSec !== 0 || m.updateMinions !== proto.updateMinions || m.updateBearbots !== proto.updateBearbots) {
    throw new Error('attach the resolution to a fresh match, before any other layer');
  }
  resolutionOf.set(match, resolution);

  // Deaths are deferred inside the two steps: the sim's own `checkDeath` (called after every hit)
  // only notes the unit, and the step kills everything it noted once every unit has acted.
  const specimenCheckDeath = proto.checkDeath;
  let pending: Set<Unit> | null = null;
  m.checkDeath = (unit: Unit) => {
    if (pending) {
      if (unit.hp <= 0 && unit.alive) pending.add(unit);
    } else {
      specimenCheckDeath.call(match, unit);
    }
  };
  const resolveDeaths = () => {
    const dead = pending!;
    pending = null;
    for (const u of dead) {
      u.hp = 0;
      u.alive = false;
    }
  };

  m.updateBearbots = (dt: number) => {
    pending = new Set();
    const start = match.bearbots.map((b) => ({ pos: b.pos, x: b.pos.x, y: b.pos.y, slowUntil: b.buffs.slowUntil, soloUntil: b.buffs.soloUntil }));
    const moved: Array<Vec2 | null> = match.bearbots.map(() => null);
    match.bearbots.forEach((bot, i) => {
      if (!bot.alive) return;
      updateOneBearbot(m, match.clockSec, bot, start[i], dt);
      // Hold the move until every bot has acted; until then the others see where it started.
      moved[i] = { x: bot.pos.x, y: bot.pos.y };
      bot.pos = start[i].pos;
      bot.pos.x = start[i].x;
      bot.pos.y = start[i].y;
    });
    match.bearbots.forEach((bot, i) => {
      const to = moved[i];
      if (to) {
        bot.pos.x = to.x;
        bot.pos.y = to.y;
      }
    });
    resolveDeaths();
  };

  m.updateMinions = (dt: number) => {
    pending = new Set();
    const units: Unit[] = [...match.bearbots, ...match.minions, ...match.towers, ...match.nexuses];
    const start = new Map(units.map((u) => [u, { x: u.pos.x, y: u.pos.y, alive: u.alive }]));
    const moves: Array<() => void> = [];
    for (const mn of match.minions) {
      if (!mn.alive) continue;
      mn.attackTimer = Math.max(0, mn.attackTimer - dt);
      const me = start.get(mn)!;
      const target = nearestEnemy(mn.team, me, units, start);
      if (target) {
        const at = start.get(target)!;
        const d = Math.hypot(at.x - me.x, at.y - me.y);
        if (d > mn.attackRange) {
          moves.push(() => m.stepToward(mn.pos, { x: at.x, y: at.y }, mn.moveSpeed, dt));
        } else if (mn.attackTimer <= 0) {
          target.hp -= mn.attackDamage;
          mn.attackTimer = mn.attackCooldownSec;
          m.checkDeath(target);
        }
        continue;
      }
      moves.push(() => walkLane(mn, dt));
    }
    for (const move of moves) move();
    resolveDeaths();
    for (let i = match.minions.length - 1; i >= 0; i--) {
      if (!match.minions[i].alive) match.minions.splice(i, 1);
    }
  };
}

/**
 * The specimen's `updateBearbots` loop body for one bot, except that its speed reads the slows
 * and solos it had at the start of the step (a slow cast this step applies from the next).
 */
function updateOneBearbot(m: Internals, clockSec: number, bot: Bearbot, start: { slowUntil: number; soloUntil: number }, dt: number): void {
  for (const k of Object.keys(bot.cooldowns)) bot.cooldowns[k] = Math.max(0, bot.cooldowns[k] - dt);
  bot.attackTimer = Math.max(0, bot.attackTimer - dt);

  const ps = m.pilotState.get(bot.id)!;
  const action = ps.currentAction;
  const speed = bot.moveSpeed * (clockSec < start.slowUntil ? SLOW_MULT : 1) * (clockSec < start.soloUntil ? SOLO_SPEED_MULT : 1);

  if (action.kind === 'recall') {
    bot.recalling = true;
  } else if (action.kind !== 'hold') {
    bot.recalling = false;
  }

  if (bot.recalling) {
    m.stepToward(bot.pos, BASE[bot.team], speed * RECALL_SPEED_MULT, dt);
    if (dist(bot.pos, BASE[bot.team]) < 20) {
      bot.hp = bot.maxHp;
      bot.recalling = false;
      ps.currentAction = { kind: 'hold' };
    }
    return;
  }

  switch (action.kind) {
    case 'move': {
      const target = m.resolveVec2(action.target);
      if (target) m.stepToward(bot.pos, target, speed, dt);
      break;
    }
    case 'attack': {
      const targetUnit = typeof action.target === 'string' ? m.findUnit(action.target) : undefined;
      if (targetUnit && targetUnit.alive) m.approachAndAttack(bot, targetUnit, speed, dt);
      break;
    }
    case 'ability':
      m.tryUseAbility(bot, action);
      break;
    case 'hold':
    default:
      break;
  }
}

/** The specimen's minion target: the nearest living enemy within aggro range, ties to the earlier unit. */
function nearestEnemy(team: Team, from: Vec2, units: Unit[], start: Map<Unit, { x: number; y: number; alive: boolean }>): Unit | undefined {
  const enemy = otherTeam(team);
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const u of units) {
    const s = start.get(u)!;
    if (u.team !== enemy || !s.alive) continue;
    const d = Math.hypot(s.x - from.x, s.y - from.y);
    if (d <= AGGRO_RADIUS && d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

/** The specimen's lane walk for a minion with nothing in range. */
function walkLane(mn: Minion, dt: number): void {
  const dir = mn.team === 'violet' ? 1 : -1;
  mn.pathT = Math.max(0, Math.min(1, mn.pathT + (dir * mn.moveSpeed * dt) / laneLength(mn.lane)));
  mn.pos = pointAlongPath(LANE_PATHS[mn.lane], mn.pathT);
  if (mn.pathT <= 0 || mn.pathT >= 1) mn.alive = false; // reached the enemy base area and despawns into it
}

function laneLength(lane: Lane): number {
  const path = LANE_PATHS[lane];
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
  return total;
}
