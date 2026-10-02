/**
 * The rule layers a map variant brings with it (`MapVariant.homeguard`, `MapVariant.teleport`;
 * `src/mapVariant.ts`). Every place that builds a match calls this right after `attachResolution`
 * and before `attachRecall`, so the speed boost and the teleport hug the sim's tick inside the
 * recall (`src/homeguard.ts`, `src/teleport.ts` explain why each needs that). A variant with
 * neither attaches nothing, so a pvp-1 or v1 match is exactly what it was.
 */
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import type { MapVariant } from './mapVariant';
import { SEQUENTIAL, type Resolution } from './resolution';
import { attachHomeguard, type Homeguard } from './homeguard';
import { attachTeleport, type Teleport } from './teleport';

export function attachMapRules(match: Match, variant: MapVariant, resolution: Resolution): { homeguard: Homeguard | null; teleport: Teleport | null } {
  if ((variant.scale ?? 1) !== 1 && resolution === SEQUENTIAL) {
    throw new Error(`map "${variant.name}" is scaled: its minions walk the scaled lanes only under the simultaneous-1 resolution (src/resolution.ts)`);
  }
  const homeguard = variant.homeguard ? attachHomeguard(match, variant.homeguard, TICK_DT) : null;
  const teleport = variant.teleport ? attachTeleport(match, variant.teleport, TICK_DT) : null;
  return { homeguard, teleport };
}
