/**
 * Damage attribution from outside the frozen sim: who hit whom, for how much, and whether it killed.
 *
 * The specimen keeps its damage code private (`src/sim/match.ts`), so this wraps four of a match
 * instance's own methods -- bearbot attack, ability, minion update and tower update -- and reads every
 * unit's hp before and after each call. Every point of hp lost is attributed to the source that was
 * running at that moment. The wrappers call the originals with the same arguments and only read hp
 * around them, so attaching never changes a match.
 *
 * Shared by the match metrics tool (`tools/match/metrics.ts`, which this was extracted from) and the
 * economy layer (`src/economy.ts`: kill credit, last hits, lifesteal). Both can attach to the same
 * match: the methods are wrapped once, and every listener sees every hit in the same order.
 */
import type { Action, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import type { Bearbot, Unit } from './sim/entities';
import { otherTeam } from './sim/map';

export type DamageSourceKind = 'bearbot' | 'minion' | 'tower';

export interface Hit {
  srcKind: DamageSourceKind;
  srcTeam: Team;
  /** The bearbot that dealt it; null for a minion or tower. */
  srcBot: Bearbot | null;
  victim: Unit;
  dmg: number;
  /** This hit took the victim from alive to dead. */
  killed: boolean;
  /** Where the victim stood, copied. */
  pos: Vec2;
}

export type HitListener = (hit: Hit) => void;

type Patched = {
  approachAndAttack(bot: Bearbot, target: Unit, speed: number, dt: number): void;
  tryUseAbility(bot: Bearbot, action: Action): void;
  updateMinions(dt: number): void;
  updateTowers(dt: number): void;
};

type Snapshot = Map<Unit, { hp: number; alive: boolean }>;

const listenersOf = new WeakMap<Match, HitListener[]>();

/** Call `listener` with every hp loss in `match` from now on. Wraps the methods on first attach only. */
export function attachAttribution(match: Match, listener: HitListener): void {
  const existing = listenersOf.get(match);
  if (existing) {
    existing.push(listener);
    return;
  }
  const listeners: HitListener[] = [listener];
  listenersOf.set(match, listeners);

  const emit = (srcKind: DamageSourceKind, srcTeam: Team, srcBot: Bearbot | null, victim: Unit, before: { hp: number; alive: boolean }) => {
    const dmg = before.hp - victim.hp;
    if (!(dmg > 0)) return;
    const hit: Hit = { srcKind, srcTeam, srcBot, victim, dmg, killed: before.alive && !victim.alive, pos: { x: victim.pos.x, y: victim.pos.y } };
    for (const l of listeners) l(hit);
  };
  const allUnits = (): Unit[] => [...match.bearbots, ...match.minions, ...match.towers, ...match.nexuses];
  const snapshot = (): Snapshot => new Map(allUnits().map((u) => [u, { hp: u.hp, alive: u.alive }]));
  const diffAll = (before: Snapshot, src: (victim: Unit) => [DamageSourceKind, Team, Bearbot | null]) => {
    for (const [u, b] of before) {
      if (b.hp > u.hp) {
        const [k, team, bot] = src(u);
        emit(k, team, bot, u, b);
      }
    }
  };

  const p = match as unknown as Patched;
  const origAttack = p.approachAndAttack.bind(match);
  const origAbility = p.tryUseAbility.bind(match);
  const origMinions = p.updateMinions.bind(match);
  const origTowers = p.updateTowers.bind(match);
  p.approachAndAttack = (bot, target, speed, dt) => {
    const before = { hp: target.hp, alive: target.alive };
    origAttack(bot, target, speed, dt);
    emit('bearbot', bot.team, bot, target, before);
  };
  p.tryUseAbility = (bot, action) => {
    const before = snapshot();
    origAbility(bot, action);
    diffAll(before, () => ['bearbot', bot.team, bot]);
  };
  p.updateMinions = (dt) => {
    const before = snapshot();
    origMinions(dt);
    diffAll(before, (v) => ['minion', otherTeam(v.team), null]);
  };
  p.updateTowers = (dt) => {
    const before = snapshot();
    origTowers(dt);
    diffAll(before, (v) => ['tower', otherTeam(v.team), null]);
  };
}
