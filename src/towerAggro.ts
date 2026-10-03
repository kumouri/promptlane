/**
 * Tower aggro, `aggro-1` (Ceryce, 2026-10-02 19:42 CT: "Allow towers to retarget. Start with only
 * retargeting if they deal damage to an enemy player in range of the tower."). The specimen's tower
 * (`src/sim/match.ts` updateTowers) shoots enemy minions first and a bearbot only when no enemy
 * minion is in range, so a bearbot can hit an enemy bearbot under that enemy's tower for free while
 * its wave stands there. Under `aggro-1`:
 * - **Trigger.** An enemy bearbot deals damage (an attack or an ability, the killing blow included)
 *   to a bearbot of the tower's team while **the attacker** stands inside the tower's attack range.
 *   The tower then shoots that attacker instead of whatever the specimen would have picked.
 *   Only bearbot damage to a bearbot counts: a minion or a tower hitting a bearbot, or a bearbot
 *   hitting a minion or a structure, changes nothing.
 * - **How long.** For `windowSec` (3 s) from the hit, refreshed by every further qualifying hit,
 *   and ended early when the attacker leaves the tower's range or dies. After that the tower goes
 *   back to the specimen's pick.
 * - **Several at once.** The most recent qualifying hit wins. A hit within range of two towers of
 *   the victim's team aggroes both.
 * - **Everything else** is the specimen's: the same 1 s cooldown, damage and range, and minions
 *   first otherwise, with the specimen's array-order pick ("start with only" this).
 * - **Which towers:** every entry of `match.towers`, so a map that adds towers (base or
 *   nexus-guard towers) gets the same rule. A nexus doesn't shoot, so it is untouched.
 *
 * Why 3 s, and not "until the attacker leaves range":
 * - The tower's commitment then scales with the attacker's aggression. One poke costs at most three
 *   tower shots (54 hp), more than a third of a keytar's or a violin's hp (140 and 150) and a
 *   quarter of a drum's (220).
 * - 3 s is more than twice the slowest basic attack's cooldown (1.3 s), so a bot that keeps trading
 *   under the tower keeps the aggro the whole time. Pressing on has the same result as the sticky
 *   rule.
 * - A single poke doesn't turn into "leave or die", which a 1 s tower shooting a 140 hp bot for as
 *   long as it stands there would be.
 * - It's also the shape of the MOBA convention behind Ceryce's sentence: Dota's creep aggro is a
 *   couple of seconds.
 *
 * Attacker in range, not victim in range: the tower can only shoot what is in its range, so the
 * attacker's position is what counts. The other reading (the victim inside the tower's range) would
 * also let a keytar (range 160) hit a defender at the tower's edge from outside the tower's range
 * and draw no fire. Under this rule that is still free.
 *
 * Applied from outside the frozen sim like every ruleset layer. It replaces the instance's
 * `updateTowers` with the specimen's own loop plus the lock, and hears hits through
 * `src/attribution.ts`. So it goes right after the map's layers and before the recall and the
 * economy, before anything else attaches attribution: attribution then wraps this tower step, and
 * the economy's and the metrics' listeners see every tower shot as before. It reads hp and
 * positions, uses no RNG and counts in ticks, so a match stays a function of its seed and its
 * decisions. A log records the rule whole (`MatchLog.towerAggro`). A log without one attaches
 * nothing, so it replays exactly as before.
 *
 * Pilots see it (`Observation.towerAggro`, and an `aggro` entry on every listed tower: the bearbot it
 * is locked on and the seconds left, or null). The vocab-2 description states the rule and
 * whether a tower is shooting this bot because of it (`tools/jev/fidelity_harness.py`). A match
 * without the layer carries neither field.
 */
import type { Observation, Team } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import type { Bearbot, Tower, Unit } from './sim/entities';
import { dist, otherTeam } from './sim/map';
import { attachAttribution, type Hit } from './attribution';
import AGGRO_1_JSON from './towerAggro/aggro-1.json';

/** The constants file's shape (`src/towerAggro/aggro-1.json`). A changed number is a new name. */
export interface TowerAggroRules {
  /** Stable name recorded in match logs. */
  name: string;
  /** Seconds a tower stays on the attacker after its last qualifying hit (unless it leaves range or dies first). */
  windowSec: number;
}

export const AGGRO_1: TowerAggroRules = AGGRO_1_JSON as TowerAggroRules;

export const TOWER_AGGRO_RULES: Record<string, TowerAggroRules> = { [AGGRO_1.name]: AGGRO_1 };

/** What new matches play with when the caller names none: the specimen's towers. `aggro-1` is opt-in. */
export const DEFAULT_TOWER_AGGRO: TowerAggroRules | null = null;

/** A name (`'aggro-1'`, or `'none'` = the specimen's towers), a recorded rule (a log's `towerAggro`), or absent. */
export function resolveTowerAggro(aggro: string | TowerAggroRules | null | undefined): TowerAggroRules | null {
  if (aggro == null || aggro === 'none') return null;
  if (typeof aggro !== 'string') return aggro;
  const found = TOWER_AGGRO_RULES[aggro];
  if (!found) throw new Error(`unknown tower aggro rule "${aggro}" (known: none, ${Object.keys(TOWER_AGGRO_RULES).join(', ')})`);
  return found;
}

/** Per team (the towers' team), what the rule did. */
export interface TowerAggroCounts {
  /** Qualifying hits, counted once per tower they aggroed. */
  triggers: number;
  /** Of those, the ones where the tower had a minion of the attacker's team in range: a dive the specimen's tower ignored. */
  triggersWithMinions: number;
  /** Tower shots fired at a locked attacker. */
  aggroShots: number;
  /** Of those, the shots the specimen's tower would have fired at something else (a minion). */
  retargetedShots: number;
  /** Bearbots killed by a shot at a locked attacker. */
  kills: number;
}

/** What `MatchLog.result.towerAggro` carries. */
export interface TowerAggroSummary {
  name: string;
  teams: Record<Team, TowerAggroCounts>;
}

/** The tower aggro shown to pilots (`Observation.towerAggro`). */
export interface TowerAggroObservation {
  name: string;
  windowSec: number;
}

/** A listed tower's lock (`Observation.nearbyTowers[i].aggro`): the bearbot it shoots, and for how much longer at most. */
export interface TowerAggroLock {
  target: string;
  leftSec: number;
}

type PilotStates = Map<string, { pilot: { decide(obs: Observation): Promise<unknown> } }>;

/** The specimen's private members this layer reaches, as `src/resolution.ts` does. */
interface Internals {
  updateTowers(dt: number): void;
  checkDeath(unit: Unit): void;
}

const aggroOf = new WeakMap<Match, TowerAggro>();

/** The tower aggro attached to `match`, if any (the replay checkpoint reads it). */
export function getTowerAggro(match: Match): TowerAggro | undefined {
  return aggroOf.get(match);
}

const zero = (): TowerAggroCounts => ({ triggers: 0, triggersWithMinions: 0, aggroShots: 0, retargetedShots: 0, kills: 0 });

export class TowerAggro {
  /** Per tower: the bearbot it is locked on and the first tick the lock no longer holds. */
  private readonly locks = new Map<Tower, { bot: Bearbot; untilTick: number }>();
  private readonly windowTicks: number;
  private readonly counts: Record<Team, TowerAggroCounts> = { violet: zero(), green: zero() };

  constructor(
    private readonly match: Match,
    readonly rules: TowerAggroRules,
    private readonly tickDt: number = TICK_DT,
  ) {
    this.windowTicks = Math.round(rules.windowSec / tickDt);
  }

  /** The match's current tick (the sim adds `tickDt` to `clockSec` once per tick). */
  tickNow(): number {
    return Math.round(this.match.clockSec / this.tickDt);
  }

  /** A hit from attribution: a bearbot damaging an enemy bearbot locks every tower of the victim's team whose range holds the attacker. */
  onHit(hit: Hit): void {
    const src = hit.srcBot;
    if (hit.srcKind !== 'bearbot' || !src || hit.victim.kind !== 'bearbot' || hit.victim.team === src.team) return;
    const untilTick = this.tickNow() + this.windowTicks;
    for (const t of this.match.towers) {
      if (!t.alive || t.team !== hit.victim.team || dist(src.pos, t.pos) > t.attackRange) continue;
      this.locks.set(t, { bot: src, untilTick });
      const c = this.counts[t.team];
      c.triggers += 1;
      if (this.match.minions.some((mn) => mn.alive && mn.team === src.team && dist(mn.pos, t.pos) <= t.attackRange)) c.triggersWithMinions += 1;
    }
  }

  /** The locked attacker `t` shoots now, or null (and the lock is dropped once it no longer holds). */
  private lockedTarget(t: Tower, tick: number): Bearbot | null {
    const lock = this.locks.get(t);
    if (!lock) return null;
    if (tick >= lock.untilTick || !lock.bot.alive || dist(lock.bot.pos, t.pos) > t.attackRange) {
      this.locks.delete(t);
      return null;
    }
    return lock.bot;
  }

  /** The specimen's tower step (`src/sim/match.ts` updateTowers), with the lock taking the target when it holds. */
  updateTowers(m: Internals, dt: number): void {
    const tick = this.tickNow();
    for (const t of this.match.towers) {
      if (!t.alive) continue;
      t.attackTimer = Math.max(0, t.attackTimer - dt);
      const enemyTeam = otherTeam(t.team);
      const specimen = [...this.match.minions, ...this.match.bearbots]
        .filter((u) => u.team === enemyTeam && u.alive && dist(u.pos, t.pos) <= t.attackRange)
        .sort((a, b) => (a.kind === 'minion' ? -1 : 1) - (b.kind === 'minion' ? -1 : 1))[0];
      const locked = this.lockedTarget(t, tick);
      const target = locked ?? specimen;
      if (target && t.attackTimer <= 0) {
        target.hp -= t.attackDamage;
        t.attackTimer = t.attackCooldownSec;
        m.checkDeath(target);
        if (locked) {
          const c = this.counts[t.team];
          c.aggroShots += 1;
          if (specimen !== locked) c.retargetedShots += 1;
          if (!locked.alive || locked.hp <= 0) c.kills += 1;
        }
      }
    }
  }

  /** The lock of the tower with id `towerId`, as a pilot sees it: one that would hold at the tower's next step; null = none. */
  lockOf(towerId: string): TowerAggroLock | null {
    const t = this.match.towers.find((x) => x.id === towerId);
    const lock = t && this.locks.get(t);
    if (!t || !lock || !lock.bot.alive || !t.alive || dist(lock.bot.pos, t.pos) > t.attackRange) return null;
    const left = lock.untilTick - this.tickNow();
    if (left <= 0) return null;
    return { target: lock.bot.id, leftSec: Math.round(left * this.tickDt * 10) / 10 };
  }

  /** The layer's part of a replay checkpoint: per tower, the locked bot's index and the ticks left (-1, 0 = none). */
  checkpoint(): Array<[number, number]> {
    const now = this.tickNow();
    return this.match.towers.map((t) => {
      const lock = this.locks.get(t);
      return lock ? [this.match.bearbots.indexOf(lock.bot), lock.untilTick - now] : [-1, 0];
    });
  }

  summary(): TowerAggroSummary {
    return { name: this.rules.name, teams: { violet: { ...this.counts.violet }, green: { ...this.counts.green } } };
  }
}

/**
 * Attach `rules` to a match that has not ticked yet: right after `attachMapRules` and before the
 * recall, the objective, the economy, the finale and the metrics, so that every later
 * `attachAttribution` wraps this tower step. Pilots see `towerAggro` and each listed tower's `aggro`.
 */
export function attachTowerAggro(match: Match, rules: TowerAggroRules, tickDt: number = TICK_DT): TowerAggro {
  if (aggroOf.has(match)) throw new Error('a tower aggro rule is already attached to this match');
  const m = match as unknown as Internals;
  if (match.clockSec !== 0 || Object.prototype.hasOwnProperty.call(match, 'updateTowers')) {
    throw new Error('attach the tower aggro to a fresh match, before anything wraps its tower step (attribution, the economy, the metrics)');
  }
  const aggro = new TowerAggro(match, rules, tickDt);
  aggroOf.set(match, aggro);
  m.updateTowers = (dt: number) => aggro.updateTowers(m, dt);
  attachAttribution(match, (hit) => aggro.onHit(hit));

  const shown: TowerAggroObservation = { name: rules.name, windowSec: rules.windowSec };
  const states = (match as unknown as { pilotState: PilotStates }).pilotState;
  for (const ps of states.values()) {
    const inner = ps.pilot;
    ps.pilot = {
      decide: (obs: Observation) =>
        inner.decide({
          ...obs,
          towerAggro: shown,
          nearbyTowers: obs.nearbyTowers.map((t) => ({ ...t, aggro: aggro.lockOf(t.id) })),
        } as Observation),
    };
  }
  return aggro;
}
