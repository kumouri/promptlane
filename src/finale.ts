/**
 * The Final Chorus, `final-chorus-1` (docs/fewer-draws-spec.md §4.1): the 10-minute match gets a
 * decisive last act, all of it inside the 600 s.
 * 1. **At 8:00 (`atSec`), a team ahead on towers wins on the spot** (`endReason: 'chorus-lead'`).
 * 2. **If towers are level at 8:00, the last two minutes are sudden death:** from then on, towers
 *    and nexuses take ×3 damage (`structureDamageMult`), and the first tower to fall ends the match
 *    for the team that took it (`endReason: 'sudden-death'`). If one tower falls on each side in the
 *    same tick, towers are still level and the match plays on.
 * 3. **If nothing falls by 10:00,** the sim's own timeout tiebreak decides it, unchanged.
 * A nexus kill still ends the match the sim's own way (`'nexus'`), before or during sudden death.
 *
 * ×3 is applied as an **hp rescale**, exactly as the spec's sims did: on entering sudden death, every
 * living tower and nexus has its `hp` and `maxHp` divided by 3. A hit then takes three times the
 * share of a structure it took before, a structure dies on exactly the hit that ×3 damage would kill
 * it with, and the sim's own death and tiebreak code needs no change. So, from 8:00 in a level match:
 * - pilots see structures at a third of their old hp and maxHp (the same fraction of maxHp);
 * - hp lost by a structure (`src/attribution.ts`, the metrics tool) is in the rescaled hp: multiply
 *   by `structureDamageMult` for the equivalent damage on the old scale;
 * - the nexus-hp tiebreak compares two nexuses rescaled alike, so its order is unchanged.
 *
 * The specimen sim (`src/sim/*`) is frozen, so this is a ruleset layer applied from OUTSIDE, the same
 * shape as `src/recall.ts`. `attachFinale` goes **last**, after the economy, so its wrapper is the
 * outermost one around the tick: it reads the towers once every layer has finished the tick (a tower
 * the economy paid for has already fallen), and it ends the match through the sim's own `finish`.
 *
 * It reads towers, nexuses and the clock, uses no RNG and counts time in ticks, so a match stays a
 * function of its seed and its decisions. A log records the rule it was played under
 * (`MatchLog.finale`); a log without one replays exactly as before, because nothing is attached.
 * Every number is in `src/finale/final-chorus-1.json`.
 */
import type { Team } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import FINAL_CHORUS_1_JSON from './finale/final-chorus-1.json';

/** The constants file's shape (`src/finale/final-chorus-1.json`). */
export interface FinaleRules {
  /** Stable name recorded in match logs. A changed number is a new name. */
  name: string;
  /** Sim-second of the Chorus: a tower lead here wins; level towers start sudden death. */
  atSec: number;
  /** Damage multiplier on towers and nexuses during sudden death (applied as an hp ÷ rescale). */
  structureDamageMult: number;
}

export const FINAL_CHORUS_1: FinaleRules = FINAL_CHORUS_1_JSON as FinaleRules;

export const FINALES: Record<string, FinaleRules> = { [FINAL_CHORUS_1.name]: FINAL_CHORUS_1 };

/**
 * The finale new matches play with when the caller names none: none, the match runs to 10:00 as it
 * always has. `final-chorus-1` is opt-in (`--finale final-chorus-1`) until Ceryce rules it in.
 */
export const DEFAULT_FINALE: FinaleRules | null = null;

/** A name (`'final-chorus-1'`, or `'none'`), a recorded rule (a log's `finale`), or absent. */
export function resolveFinale(finale: string | FinaleRules | null | undefined): FinaleRules | null {
  if (finale == null || finale === 'none') return null;
  if (typeof finale !== 'string') return finale;
  const found = FINALES[finale];
  if (!found) throw new Error(`unknown finale "${finale}" (known: none, ${Object.keys(FINALES).join(', ')})`);
  return found;
}

/** The two ways only a finale ends a match; `'nexus'` and `'timeout'` stay the sim's own. */
export type FinaleEndReason = 'chorus-lead' | 'sudden-death';

/** Every reason a match can end with, under any ruleset (`null` = unfinished). */
export type EndReason = 'nexus' | 'timeout' | FinaleEndReason | null;

/** Words for a result line or a viewer: why the match ended. */
export function endReasonLabel(reason: EndReason | string, finale?: FinaleRules | null): string {
  const at = finale ? clockLabel(finale.atSec) : '8:00';
  switch (reason) {
    case 'nexus':
      return 'nexus destroyed';
    case 'timeout':
      return 'timeout tiebreak';
    case 'chorus-lead':
      return `tower lead at ${at}`;
    case 'sudden-death':
      return 'first tower in sudden death';
    case null:
      return 'unfinished';
    default:
      return String(reason);
  }
}

function clockLabel(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/** What `MatchLog.result.finale` carries. */
export interface FinaleSummary {
  name: string;
  /** The tick the Chorus came on; null = the match ended before it. */
  chorusTick: number | null;
  /** Towers standing per team at the Chorus; null = the match ended before it. */
  towersAtChorus: Record<Team, number> | null;
  /** The tick sudden death ended the match on a fallen tower; null = it didn't. */
  suddenDeathTick: number | null;
}

const finaleOf = new WeakMap<Match, Finale>();

/** The finale attached to `match`, if any (the viewer and the metrics tool read it). */
export function getFinale(match: Match): Finale | undefined {
  return finaleOf.get(match);
}

type Steppable = { tick(dt: number): void };
type Finishable = { finish(winner: Team | null, reason: string): void };

function towersAlive(match: Match): Record<Team, number> {
  const out: Record<Team, number> = { violet: 0, green: 0 };
  for (const t of match.towers) if (t.alive) out[t.team] += 1;
  return out;
}

/** One match's Final Chorus. */
export class Finale {
  /** `before` the Chorus; `sudden-death` once towers were level at it; `over` once it decided the match. */
  phase: 'before' | 'sudden-death' | 'over' = 'before';
  chorusTick: number | null = null;
  towersAtChorus: Record<Team, number> | null = null;
  suddenDeathTick: number | null = null;
  private readonly chorusAtTick: number;

  constructor(
    private readonly match: Match,
    readonly rules: FinaleRules,
    private readonly tickDt: number = TICK_DT,
  ) {
    this.chorusAtTick = Math.round(rules.atSec / tickDt);
  }

  /** The match's current tick (the sim adds `tickDt` to `clockSec` once per tick). */
  tickNow(): number {
    return Math.round(this.match.clockSec / this.tickDt);
  }

  /** Whether the ×3 window is open: towers were level at the Chorus and the match goes on. */
  get suddenDeath(): boolean {
    return this.phase === 'sudden-death' && !this.match.ended;
  }

  private end(winner: Team, reason: FinaleEndReason): void {
    this.phase = 'over';
    (this.match as unknown as Finishable).finish(winner, reason);
  }

  /** Runs after every other layer has finished the tick. */
  afterTick(): void {
    if (this.match.ended || this.phase === 'over') return;
    const t = this.tickNow();
    if (this.phase === 'before') {
      if (t < this.chorusAtTick) return;
      const alive = towersAlive(this.match);
      this.chorusTick = t;
      this.towersAtChorus = alive;
      if (alive.violet !== alive.green) return this.end(alive.violet > alive.green ? 'violet' : 'green', 'chorus-lead');
      // Level: ×3 structure damage from the next tick, as a rescale of every living structure.
      const mult = this.rules.structureDamageMult;
      for (const u of [...this.match.towers, ...this.match.nexuses]) {
        if (!u.alive) continue;
        u.hp /= mult;
        u.maxHp /= mult;
      }
      this.phase = 'sudden-death';
      return;
    }
    const alive = towersAlive(this.match);
    if (alive.violet === alive.green) return;
    this.suddenDeathTick = t;
    this.end(alive.violet > alive.green ? 'violet' : 'green', 'sudden-death');
  }

  summary(): FinaleSummary {
    return {
      name: this.rules.name,
      chorusTick: this.chorusTick,
      towersAtChorus: this.towersAtChorus ? { ...this.towersAtChorus } : null,
      suddenDeathTick: this.suddenDeathTick,
    };
  }
}

/**
 * Attach `rules` to a match that has not ticked yet, LAST: after the map, resolution, recall,
 * objective and economy, so this wrapper is the outermost one around the tick.
 */
export function attachFinale(match: Match, rules: FinaleRules, tickDt: number = TICK_DT): Finale {
  if (finaleOf.has(match)) throw new Error('a finale is already attached to this match');
  const finale = new Finale(match, rules, tickDt);
  finaleOf.set(match, finale);
  const m = match as unknown as Steppable;
  const origTick = m.tick.bind(match);
  m.tick = (dt: number) => {
    if (match.ended) return origTick(dt);
    origTick(dt);
    finale.afterTick();
  };
  return finale;
}
