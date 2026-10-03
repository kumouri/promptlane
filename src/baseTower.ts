/**
 * The base tower (Ceryce, 2026-10-02 19:39 CT: "one tower in front of the Nexus at 700 and if you
 * down that you win"; runs/nexus-guard-2026-10-02.md). A map variant may carry `baseTower`
 * (`src/mapVariant.ts`). The sim then has one more tower per team, standing in front of that team's
 * nexus, and **the team whose base tower falls loses: its nexus falls with it**, so the match ends
 * the sim's own way, `endReason: 'nexus'`.
 *
 * - **Where it stands:** `standoff` units from the nexus centre (× the map's scale), along the mid
 *   lane toward the map centre. Every lane ends at the nexus, so attackers from any lane walk up to
 *   it. Its range is the map's tower range, and it shoots like any tower (the sim's own
 *   `updateTowers`: minions first).
 * - **It is a tower in the sim's own list** (`match.towers`), lane `mid`, tier 3 at runtime
 *   (`isBaseTower`). So the sim's tower step, its minion and bearbot targeting, the observation, the
 *   checkpoints, the Final Chorus's tower count and the 10:00 tower-count tiebreak all see it with
 *   no change. A tower log on this map has 14 towers, not 12.
 * - **Backdoor protection (`needsInnerDown`):** when true, a base tower takes no damage until at
 *   least one of its own team's inner (tier 1) towers has fallen, in any lane, as in Dota and League,
 *   where base structures can be hit only once a lane is open. Without it, a pushing bot could walk
 *   past both lane towers and win by hitting one 700-hp target, and the "hard towers in front of it
 *   you have to take down" would be optional.
 * - **What pilots see:** both base towers map-wide, with whether each can be hit now
 *   (`BaseTowerObservation`), so a bot can push to the enemy's once a lane is open. vocab-2 states
 *   it, and `enemy_base_tower` targets it (`tools/jev/`).
 * - **The nexus can't be hurt while its base tower stands**, and the match ends the moment the base
 *   tower falls, so on this map the base tower is the only structure that wins. The nexus stays as
 *   the thing the base tower guards, and as the sim's own win path.
 *
 * "Takes no damage" is applied from outside the frozen sim (`src/sim/*`): the sim deals damage in a
 * dozen places, so at the end of every tick (just before the sim's own `checkWinConditions`) a
 * protected structure is put back to full hp and alive. A protected structure has never kept any
 * damage, so full is exactly what it had. The Final Chorus's ÷3 rescale changes `maxHp` too, so this
 * also holds in sudden death. One tick can't take a protected structure from full to 0. Hits on a
 * protected structure still reach attribution listeners (`src/attribution.ts`, the metrics tool)
 * before they are undone.
 *
 * If both base towers fall on the same tick, the match is a draw with `endReason: 'nexus'`. Letting
 * the sim decide would give it to green, because its nexus loop checks violet's first.
 *
 * A log records the variant whole (`MatchLog.map`), with the base tower in it, so it replays under
 * the rule it was played with. A variant without `baseTower` attaches nothing.
 */
import type { Observation, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import type { Tower } from './sim/entities';
import { makeTower } from './sim/entities';
import { pointAlongPath } from './sim/map';
import { mapGeometry } from './geometry';

export interface BaseTowerRules {
  /** hp (and maxHp) at the start. */
  hp: number;
  /** Distance from the nexus centre toward the map centre, along the mid lane, in specimen units (× the map's scale). */
  standoff: number;
  /** true: it takes no damage until one of its own team's inner (tier 1) towers has fallen (module comment). */
  needsInnerDown: boolean;
}

/** The runtime tier a base tower carries; the lane towers are 1 (inner) and 2 (outer). */
export const BASE_TOWER_TIER = 3;

export function isBaseTower(t: Tower): boolean {
  return (t.tier as number) === BASE_TOWER_TIER;
}

type PilotStates = Map<string, { pilot: { decide(obs: Observation): Promise<unknown> } }>;
type Finishable ={ finish(winner: Team | null, reason: string): void };
type WinCheck = { checkWinConditions(): void };

/** One match's base towers. */
export class BaseTowers {
  readonly towers: Record<Team, Tower>;
  private readonly openedTick: Record<Team, number | null> = { violet: null, green: null };
  private readonly fellTick: Record<Team, number | null> = { violet: null, green: null };

  constructor(
    private readonly match: Match,
    readonly rules: BaseTowerRules,
    range: number,
    private readonly tickDt: number = TICK_DT,
  ) {
    const geo = mapGeometry(match);
    const midLen = geo.laneLengths.mid;
    const at = (team: Team): Vec2 => {
      const t = (rules.standoff * geo.scale) / midLen;
      return pointAlongPath(geo.lanePaths.mid, team === 'violet' ? t : 1 - t);
    };
    const make = (team: Team): Tower => {
      const t = makeTower(team, 'mid', 1, at(team));
      (t as { tier: number }).tier = BASE_TOWER_TIER;
      t.hp = t.maxHp = rules.hp;
      t.attackRange = range;
      match.towers.push(t);
      return t;
    };
    this.towers = { violet: make('violet'), green: make('green') };
  }

  /** Whether `team`'s base tower can be damaged now. */
  vulnerable(team: Team): boolean {
    if (!this.rules.needsInnerDown) return true;
    return this.match.towers.some((t) => t.team === team && t.tier === 1 && !t.alive);
  }

  /** End of the sim's tick, before its own win check: undo damage on protected structures; a fallen base tower takes its nexus. */
  endOfTick(): void {
    const tick = Math.round(this.match.clockSec / this.tickDt);
    const fallen: Team[] = [];
    for (const team of ['violet', 'green'] as Team[]) {
      const base = this.towers[team];
      if (!this.vulnerable(team)) {
        base.hp = base.maxHp;
        base.alive = true;
      } else if (this.openedTick[team] === null) {
        this.openedTick[team] = this.rules.needsInnerDown ? tick : 0;
      }
      if (!base.alive) {
        fallen.push(team);
        this.fellTick[team] = tick;
      } else {
        for (const n of this.match.nexuses) {
          if (n.team !== team) continue;
          n.hp = n.maxHp;
          n.alive = true;
        }
      }
    }
    if (fallen.length === 2) {
      (this.match as unknown as Finishable).finish(null, 'nexus');
      return;
    }
    if (fallen.length === 1) {
      for (const n of this.match.nexuses) {
        if (n.team !== fallen[0]) continue;
        n.hp = 0;
        n.alive = false;
      }
    }
  }

  /** `obs` plus both base towers (`BaseTowerObservation`). */
  observe(obs: Observation): Observation & BaseTowerObservation {
    const team = obs.self.team;
    const view = (side: Team) => {
      const t = this.towers[side];
      return { id: t.id, pos: { x: t.pos.x, y: t.pos.y }, hp: Math.round(t.hp * 10) / 10, maxHp: t.maxHp, alive: t.alive, canBeHit: t.alive && this.vulnerable(side) };
    };
    return { ...obs, baseTowers: { own: view(team), enemy: view(team === 'violet' ? 'green' : 'violet') } };
  }

  summary(): BaseTowerSummary {
    return { openedTick: { ...this.openedTick }, fellTick: { ...this.fellTick } };
  }
}

/**
 * What pilots see on a map with base towers (runs/bots-push-to-base-2026-10-02.md): both base
 * towers, map-wide, and whether each can be hit now. `canBeHit` is `BaseTowers.vulnerable`, the rule
 * `endOfTick` applies, so the description and the sim can't disagree. A protected base tower's hp
 * reads full, because it is: its damage is undone every tick.
 */
export interface BaseTowerObservation {
  baseTowers: Record<'own' | 'enemy', { id: string; pos: Vec2; hp: number; maxHp: number; alive: boolean; canBeHit: boolean }>;
}

/** What `MatchLog.result.baseTower` carries. */
export interface BaseTowerSummary {
  /** Per team, the tick its base tower became damageable (its first inner tower fell); 0 without protection; null = never. */
  openedTick: Record<Team, number | null>;
  /** Per team, the tick its base tower fell; null = it stood. */
  fellTick: Record<Team, number | null>;
}

const baseTowersOf = new WeakMap<Match, BaseTowers>();

/** The base towers attached to `match`, if its map has them. */
export function getBaseTowers(match: Match): BaseTowers | undefined {
  return baseTowersOf.get(match);
}

/**
 * Add the base towers to a match that has not ticked yet and wrap the sim's win check. Called by
 * `attachMapRules`, after `applyMapVariant` (which registers a scaled map's geometry) and before any
 * layer that reads `match.towers` once at attach time (the economy).
 */
export function attachBaseTowers(match: Match, rules: BaseTowerRules, range: number, tickDt: number = TICK_DT): BaseTowers {
  if (baseTowersOf.has(match)) throw new Error('base towers are already attached to this match');
  if (match.clockSec !== 0) throw new Error('attach the base towers to a fresh match');
  const bt = new BaseTowers(match, rules, range, tickDt);
  baseTowersOf.set(match, bt);
  const m = match as unknown as WinCheck;
  const specimenWinCheck = m.checkWinConditions.bind(match);
  m.checkWinConditions = () => {
    if (!match.ended) bt.endOfTick();
    if (match.ended) return;
    specimenWinCheck();
  };
  const states = (match as unknown as { pilotState: PilotStates }).pilotState;
  for (const ps of states.values()) {
    const inner = ps.pilot;
    ps.pilot = { decide: (obs: Observation) => inner.decide(bt.observe(obs)) };
  }
  return bt;
}
