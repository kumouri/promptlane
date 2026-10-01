/**
 * The one stat derivation every ruleset layer shares (docs/economy-spec.md §9.6). A bearbot's
 * `maxHp`, `attackDamage`, `moveSpeed` and `attackCooldownSec` are plain mutable fields the frozen
 * sim reads every tick (`src/sim/entities.ts`); a layer changes them from outside, between ticks.
 * Two layers writing the same field would fight (the last writer wins and drops the other's bonus),
 * so no layer writes a stat itself. Each registers a MULTIPLIER under its own name, and
 * `deriveStats` writes
 *
 *     stat = instrument base × Π over layers (multiplier)
 *
 * Any layer may call `deriveStats` after its update, as often as it likes: the result depends only
 * on the base and the registered multipliers at that moment, so the order the layers run in cannot
 * change it. The river objective (`src/objective.ts`) registers `encore`; the economy registers its
 * levels and items (§3.5) the same way when it lands. A match with no layer that registers anything
 * keeps its instrument stats bit-for-bit.
 */
import type { Match } from '../sim/match';
import { INSTRUMENTS } from '../sim/entities';

export type StatKey = 'maxHp' | 'attackDamage' | 'moveSpeed' | 'attackCooldownSec';
export const STAT_KEYS: readonly StatKey[] = ['maxHp', 'attackDamage', 'moveSpeed', 'attackCooldownSec'];

/** A layer's multiplier for one bot (index into `match.bearbots`) and stat. 1 = no change. */
export type StatMultiplier = (botIndex: number, key: StatKey) => number;

const layersOf = new WeakMap<Match, Map<string, StatMultiplier>>();

/** Register (or replace) `layer`'s multiplier on `match`. Layers multiply in registration order. */
export function setStatMultiplier(match: Match, layer: string, multiplier: StatMultiplier): void {
  let layers = layersOf.get(match);
  if (!layers) {
    layers = new Map();
    layersOf.set(match, layers);
  }
  layers.set(layer, multiplier);
}

/** The product of every registered layer's multiplier for this bot and stat. */
export function statMultiplier(match: Match, botIndex: number, key: StatKey): number {
  let m = 1;
  for (const f of layersOf.get(match)?.values() ?? []) m *= f(botIndex, key);
  return m;
}

/**
 * Write bot `botIndex`'s stats from its instrument base and every layer's multiplier. Current hp
 * moves by as much as max hp does (a bigger pool is not a heal, a smaller one never kills: a living
 * bot keeps at least 1), and stays within the new max. A stat whose value is already right is not
 * written, so a bot with no modifiers is left untouched.
 */
export function deriveStats(match: Match, botIndex: number): void {
  const b = match.bearbots[botIndex];
  const base = INSTRUMENTS[b.instrument];
  const maxHp = base.maxHp * statMultiplier(match, botIndex, 'maxHp');
  if (maxHp !== b.maxHp) {
    const hp = b.hp + (maxHp - b.maxHp);
    b.maxHp = maxHp;
    b.hp = Math.min(maxHp, b.alive ? Math.max(1, hp) : hp);
  }
  for (const key of ['attackDamage', 'moveSpeed', 'attackCooldownSec'] as const) {
    const v = base[key] * statMultiplier(match, botIndex, key);
    if (b[key] !== v) b[key] = v;
  }
}
