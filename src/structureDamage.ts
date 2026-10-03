/**
 * Bearbot damage to structures × k (Ceryce, 2026-10-02 22:45 CT: "...unless we just add a flat
 * multiplier to player attacks against towers or something"; runs/tower-tune-2026-10-02.md). A map
 * variant may carry `botStructureDamage` (`src/mapVariant.ts`). Then every point of hp a bearbot's
 * attack or ability takes off an enemy tower (base tower included) or nexus is followed by
 * `k - 1` more, so a bot's hit on a structure lands as `k` times the hit.
 *
 * - **What it leaves alone:** minion and tower damage, bearbot damage to bearbots and minions, every
 *   hp. A minion wave chips a tower exactly as it did. So it is not the same as cutting tower hp by
 *   `1 - 1/k`: on a cut, a wave's hits count for more of the tower too; here only the bots' do. A
 *   tower nobody's bot touches falls exactly when it did on the unmultiplied map.
 * - **How, from outside the frozen sim (`src/sim/*`):** the sim deals a bot's damage in two private
 *   methods, `approachAndAttack` (the basic attack) and `tryUseAbility` (a stab, a taunt, an AoE
 *   burst). Both are wrapped on the match instance: read every enemy structure's hp before the call,
 *   and after it take `(k - 1) ×` what each one lost, then let the sim's own `checkDeath` see it. Under
 *   `simultaneous-1` (`src/resolution.ts`) that only notes the death for the end of the step, as for
 *   any hit; under the specimen's order a structure the first hit already killed loses nothing more.
 * - **Attached by `attachMapRules`,** after the resolution (whose bearbot step calls these two
 *   methods on the instance) and before anything that hears hits (`src/attribution.ts`: the
 *   economy, tower aggro, the metrics tool). So every listener hears one hit of `k ×` the damage.
 * - **The base tower's protection still holds:** `src/baseTower.ts` puts a protected structure back
 *   to full at the end of the tick, multiplied hits included. **The Final Chorus's ×3** is an hp
 *   rescale (`src/finale.ts`), so in sudden death a bot's hit on a structure is `3k` times its old
 *   share.
 *
 * A log records the variant whole (`MatchLog.map`), with the multiplier in it, so it replays under
 * the rule it was played with. A variant without `botStructureDamage` (or with 1) attaches nothing.
 */
import type { Action, Team } from './types';
import type { Match } from './sim/match';
import type { Bearbot, Unit } from './sim/entities';
import { otherTeam } from './sim/map';

interface Internals {
  approachAndAttack(bot: Bearbot, target: Unit, speed: number, dt: number): void;
  tryUseAbility(bot: Bearbot, action: Action): void;
  checkDeath(unit: Unit): void;
}

const attached = new WeakSet<Match>();

/** The structures a bot of `team` can damage: the other team's towers (base tower included) and nexus. */
function enemyStructures(match: Match, team: Team): Unit[] {
  const enemy = otherTeam(team);
  return [...match.towers.filter((t) => t.team === enemy), ...match.nexuses.filter((n) => n.team === enemy)];
}

/** Multiply every bearbot's damage to enemy structures by `k` on a match that has not ticked yet. `k === 1` attaches nothing. */
export function attachStructureDamage(match: Match, k: number): void {
  if (!(k > 0) || !Number.isFinite(k)) throw new Error(`botStructureDamage must be a positive number, got ${k}`);
  if (k === 1) return;
  if (attached.has(match)) throw new Error('a structure damage multiplier is already attached to this match');
  if (match.clockSec !== 0) throw new Error('attach the structure damage multiplier to a fresh match');
  attached.add(match);
  const m = match as unknown as Internals;
  const origAttack = m.approachAndAttack.bind(match);
  const origAbility = m.tryUseAbility.bind(match);
  const amplify = (bot: Bearbot, run: () => void) => {
    const structures = enemyStructures(match, bot.team).filter((u) => u.alive);
    const before = structures.map((u) => u.hp);
    run();
    structures.forEach((u, i) => {
      const lost = before[i] - u.hp;
      if (!(lost > 0) || !u.alive) return;
      u.hp -= (k - 1) * lost;
      m.checkDeath(u);
    });
  };
  m.approachAndAttack = (bot, target, speed, dt) => amplify(bot, () => origAttack(bot, target, speed, dt));
  m.tryUseAbility = (bot, action) => amplify(bot, () => origAbility(bot, action));
}
