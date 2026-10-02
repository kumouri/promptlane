/**
 * The out-of-base speed boost, `homeguard-1` (pvp-2; Ceryce's package, 2026-09-30 23:18 CT): a
 * bearbot that has been in its own base moves `speedMult` times as fast until it takes damage or
 * enters the river. A recall or a respawn puts it back in base, so the walk back out to its lane is
 * quick and the walk on into the enemy half is not. Named after League's Homeguard, which ends the
 * same way on damage.
 * - **On:** after any tick that ends with the bot within `baseRadius` of its base point (pvp-2's
 *   respawn points and the recall's landing spot are inside it).
 * - **Off:** after a tick in which it lost hp (any source: bearbot, minion, tower), after a tick that
 *   ends with it in the river (`src/geometry.ts` inRiverOf), or when it dies. Being back in base
 *   turns it on again, so a bot dragged into a fight in its own base is boosted only on the ticks it
 *   isn't hit.
 *
 * Applied from outside the frozen sim like every ruleset layer: it registers a `moveSpeed`
 * multiplier with the shared stat derivation (`src/ruleset/stats.ts`) and writes the bot's
 * `moveSpeed` from it after each tick, so items, Encore and the boost multiply and none drops
 * another's bonus. It hugs the sim's tick (attached right after the resolution, inside the
 * teleport and the recall), so the hp comparison sees only the sim's damage, never a level-up,
 * lifesteal or a respawn's heal. It reads hp and positions, uses no RNG and counts in ticks, so a
 * match stays a function of its seed and its decisions. The constants are in
 * `src/homeguard/homeguard-1.json`, and a match log records them inside its `map`.
 */
import type { Observation, Team } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import { INSTRUMENTS } from './sim/entities';
import { dist } from './sim/map';
import { inRiverOf, mapGeometry } from './geometry';
import { setStatMultiplier, statMultiplier } from './ruleset/stats';

/** The constants file's shape (`src/homeguard/homeguard-1.json`). A changed number is a new name. */
export interface HomeguardRules {
  name: string;
  /** Move speed multiplier while the boost is on. */
  speedMult: number;
  /** Within this distance of its base point a bot is "in base" (map units, already at the map's scale). */
  baseRadius: number;
}

/** Why a boost ended. */
export type HomeguardBreak = 'damage' | 'river' | 'death';

export interface HomeguardSummary {
  name: string;
  /** Per bot index: ticks it moved boosted, and how each boost ended. */
  bots: Array<{ boostedTicks: number } & Record<HomeguardBreak, number>>;
}

type PilotStates = Map<string, { pilot: { decide(obs: Observation): Promise<unknown> } }>;
type Steppable = { tick(dt: number): void };
const EPS = 1e-9;

const homeguardOf = new WeakMap<Match, Homeguard>();

/** The boost layer attached to `match`, if any (the replay checkpoint reads it). */
export function getHomeguard(match: Match): Homeguard | undefined {
  return homeguardOf.get(match);
}

export class Homeguard {
  /** Per bot: whether it is boosted now. */
  readonly on: boolean[];
  private readonly hpBefore: number[];
  private readonly counts: HomeguardSummary['bots'];

  constructor(
    private readonly match: Match,
    readonly rules: HomeguardRules,
  ) {
    this.on = match.bearbots.map(() => false);
    this.hpBefore = match.bearbots.map((b) => b.hp);
    this.counts = match.bearbots.map(() => ({ boostedTicks: 0, damage: 0, river: 0, death: 0 }));
  }

  beforeTick(): void {
    this.match.bearbots.forEach((b, i) => (this.hpBefore[i] = b.hp));
  }

  afterTick(): void {
    const geo = mapGeometry(this.match);
    this.match.bearbots.forEach((b, i) => {
      const was = this.on[i];
      if (was) this.counts[i].boostedTicks += 1;
      let now = was;
      let why: HomeguardBreak | null = null;
      if (!b.alive) {
        now = false;
        why = 'death';
      } else {
        if (dist(b.pos, geo.base[b.team]) <= this.rules.baseRadius) now = true;
        if (b.hp < this.hpBefore[i] - EPS) {
          now = false;
          why = 'damage';
        } else if (inRiverOf(geo, b.pos)) {
          now = false;
          why = 'river';
        }
      }
      this.on[i] = now;
      if (was && !now && why) this.counts[i][why] += 1;
      if (b.alive) this.applySpeed(i);
    });
  }

  /** This layer's stat multiplier (`src/ruleset/stats.ts`). */
  multiplier(i: number, key: string): number {
    return key === 'moveSpeed' && this.on[i] ? this.rules.speedMult : 1;
  }

  /** `moveSpeed` from the instrument base and every layer's multiplier, as `deriveStats` writes it. */
  private applySpeed(i: number): void {
    const b = this.match.bearbots[i];
    const v = INSTRUMENTS[b.instrument].moveSpeed * statMultiplier(this.match, i, 'moveSpeed');
    if (b.moveSpeed !== v) b.moveSpeed = v;
  }

  /** The layer's part of a replay checkpoint. */
  checkpoint(): number[] {
    return this.on.map((on) => (on ? 1 : 0));
  }

  summary(): HomeguardSummary {
    return { name: this.rules.name, bots: this.counts.map((c) => ({ ...c })) };
  }
}

/** Per team, the summary's counts added up. */
export function homeguardTotals(summary: HomeguardSummary, teams: readonly Team[]): Record<Team, { boostedTicks: number } & Record<HomeguardBreak, number>> {
  const zero = () => ({ boostedTicks: 0, damage: 0, river: 0, death: 0 });
  const out: Record<Team, ReturnType<typeof zero>> = { violet: zero(), green: zero() };
  summary.bots.forEach((b, i) => {
    const o = out[teams[i]];
    o.boostedTicks += b.boostedTicks;
    o.damage += b.damage;
    o.river += b.river;
    o.death += b.death;
  });
  return out;
}

/**
 * Attach `rules` to a match that has not ticked yet: right after the resolution and before the
 * teleport and the recall (`attachMapRules`), so it hugs the sim's tick. Pilots see
 * `self.speedBoost` (true while boosted).
 */
export function attachHomeguard(match: Match, rules: HomeguardRules, _tickDt: number = TICK_DT): Homeguard {
  if (homeguardOf.has(match)) throw new Error('a speed boost is already attached to this match');
  const hg = new Homeguard(match, rules);
  homeguardOf.set(match, hg);
  setStatMultiplier(match, 'homeguard', (i, key) => hg.multiplier(i, key));
  const m = match as unknown as Steppable;
  const origTick = m.tick.bind(match);
  m.tick = (dt: number) => {
    if (match.ended) return origTick(dt);
    hg.beforeTick();
    origTick(dt);
    hg.afterTick();
  };
  const index = new Map(match.bearbots.map((b, i) => [b.id, i]));
  const states = (match as unknown as { pilotState: PilotStates }).pilotState;
  for (const ps of states.values()) {
    const inner = ps.pilot;
    ps.pilot = {
      decide: (obs: Observation) => {
        const i = index.get(obs.self.id);
        return inner.decide({ ...obs, self: { ...obs.self, speedBoost: i !== undefined && hg.on[i] } } as Observation);
      },
    };
  }
  return hg;
}
