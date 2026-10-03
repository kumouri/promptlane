/**
 * The rule layers a map variant brings with it (`MapVariant.homeguard`, `MapVariant.teleport`,
 * `MapVariant.baseTower`; `src/mapVariant.ts`). Every place that builds a match calls this right after `attachResolution`
 * and before `attachRecall`, so the speed boost and the teleport hug the sim's tick inside the
 * recall (`src/homeguard.ts`, `src/teleport.ts` explain why each needs that). The base towers
 * (`src/baseTower.ts`) join `match.towers` here, before the economy reads that list, and a bot
 * structure-damage multiplier (`MapVariant.botStructureDamage`, `src/structureDamage.ts`) wraps the
 * bots' attack and ability before anything that hears hits (`src/attribution.ts`). A variant with
 * none of them attaches nothing, so a pvp-1 or v1 match is exactly what it was.
 */
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import type { MapVariant } from './mapVariant';
import { SEQUENTIAL, type Resolution } from './resolution';
import { attachHomeguard, type Homeguard } from './homeguard';
import { attachTeleport, type Teleport } from './teleport';
import { attachBaseTowers, type BaseTowers } from './baseTower';
import { attachStructureDamage } from './structureDamage';

export function attachMapRules(
  match: Match,
  variant: MapVariant,
  resolution: Resolution,
): { homeguard: Homeguard | null; teleport: Teleport | null; baseTowers: BaseTowers | null } {
  if ((variant.scale ?? 1) !== 1 && resolution === SEQUENTIAL) {
    throw new Error(`map "${variant.name}" is scaled: its minions walk the scaled lanes only under the simultaneous-1 resolution (src/resolution.ts)`);
  }
  const homeguard = variant.homeguard ? attachHomeguard(match, variant.homeguard, TICK_DT) : null;
  const teleport = variant.teleport ? attachTeleport(match, variant.teleport, TICK_DT) : null;
  const baseTowers = variant.baseTower ? attachBaseTowers(match, variant.baseTower, variant.towerRange, TICK_DT) : null;
  if (variant.botStructureDamage != null) attachStructureDamage(match, variant.botStructureDamage);
  return { homeguard, teleport, baseTowers };
}
