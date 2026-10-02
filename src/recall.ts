/**
 * The channelled recall, `recall-2` (docs/economy-spec.md §9.10; Ceryce's redesign, 2026-09-30
 * 23:00 CT). The specimen's recall is a run home at 3× speed (`RECALL_SPEED_MULT`, `src/sim/match.ts`),
 * which brings a bot from mid to its fountain in about 3 s and lets a team rotate one bot home and
 * back while the rest keep a stage frozen. `recall-2` replaces it with a channel:
 * - a `recall` starts a **4.0 s channel where the bot stands**; when it completes, the bot is
 *   **teleported to its own fountain** (`BASE`, or a scaled map's own: `src/geometry.ts`) and fully healed, as the sim's recall heals on arrival;
 * - **damage taken in the first 3.5 s cancels it** (the bot stays where it is, and the recall has to
 *   be issued again); damage in the last 0.5 s does not;
 * - **choosing another action cancels it.** `hold` does not: the sim's own recall also survives a
 *   `hold`, and a channelling bot is holding anyway.
 *
 * The specimen sim (`src/sim/*`) is frozen, so this is a ruleset layer applied from OUTSIDE, the same
 * shape as `src/objective.ts`. `attachRecall` goes right after `applyMapVariant`, before the objective
 * and the economy, so its wrapper sits innermost around the sim's own tick:
 * - before the sim ticks, a bot whose current action is `recall` has that action swapped for `hold`
 *   (so the sim never starts its 3× run) and its channel starts, or continues;
 * - after the sim ticks, a channelling bot that lost hp in the tick (any source: bearbot, minion,
 *   tower) inside the interruptible window loses its channel, and one that has channelled the full
 *   4 s is moved to its fountain at full hp.
 * Hugging the sim tick means the hp comparison sees only the sim's damage, never an economy level-up
 * or lifesteal, and the objective's next step already counts the teleported bot off the stage.
 *
 * It reads `currentAction`, hp, `alive` and positions, uses no RNG and counts time in ticks, so a
 * match stays a function of its seed and its decisions. A log records the rule it was played under
 * (`MatchLog.recall`); a log without one replays exactly as before, because nothing is attached.
 * Every number is in `src/recall/recall-2.json`.
 */
import type { Observation, Team } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import { mapGeometry } from './geometry';
import RECALL_2_JSON from './recall/recall-2.json';

/** The constants file's shape (`src/recall/recall-2.json`). */
export interface RecallRules {
  /** Stable name recorded in match logs. A changed number is a new name. */
  name: string;
  /** Seconds a bot channels, standing still, before it is teleported to its fountain. */
  channelSec: number;
  /** Damage taken in this many seconds from the start of the channel cancels it; later damage does not. */
  interruptibleSec: number;
}

export const RECALL_2: RecallRules = RECALL_2_JSON as RecallRules;

export const RECALL_RULES: Record<string, RecallRules> = { [RECALL_2.name]: RECALL_2 };

/**
 * The recall new matches play with when the caller names none: the specimen's own 3× run (`null`).
 * `recall-2` is opt-in (`--recall recall-2`, `recall: 'recall-2'`) until Ceryce rules it in.
 */
export const DEFAULT_RECALL: RecallRules | null = null;

/** A name (`'recall-2'`, or `'none'` = the specimen's recall), a recorded rule (a log's `recall`), or absent. */
export function resolveRecall(recall: string | RecallRules | null | undefined): RecallRules | null {
  if (recall == null || recall === 'none') return null;
  if (typeof recall !== 'string') return recall;
  const found = RECALL_RULES[recall];
  if (!found) throw new Error(`unknown recall rule "${recall}" (known: none, ${Object.keys(RECALL_RULES).join(', ')})`);
  return found;
}

/** How a channel ended. */
export type RecallEnd = 'home' | 'damage' | 'action' | 'death';

export interface RecallEvent {
  /** Tick on which it happened (for `start`, the first tick of the channel). */
  tick: number;
  bot: number;
  kind: 'start' | RecallEnd;
}

/** What `MatchLog.result.recall` carries. */
export interface RecallSummary {
  name: string;
  /** Per bot index: channels started, and how each ended (a channel still running at the end is in neither). */
  bots: Array<{ started: number } & Record<RecallEnd, number>>;
  events: RecallEvent[];
}

const recallOf = new WeakMap<Match, Recall>();

/** The recall layer attached to `match`, if any (the replay checkpoint reads it). */
export function getRecall(match: Match): Recall | undefined {
  return recallOf.get(match);
}

type Action = { kind: string };
type PilotStates = Map<string, { pilot: { decide(obs: Observation): Promise<unknown> }; currentAction: Action }>;
type Steppable = { tick(dt: number): void };

/** Floating-point slack for "lost hp this tick". */
const EPS = 1e-9;

/** One match's channelled recalls. */
export class Recall {
  /** Per bot: the first tick of its running channel; null = not channelling. */
  readonly channelStart: Array<number | null>;
  readonly events: RecallEvent[] = [];
  private readonly hpBefore: number[];
  private readonly channelTicks: number;
  private readonly interruptibleTicks: number;
  private readonly states: PilotStates;

  constructor(
    private readonly match: Match,
    readonly rules: RecallRules,
    private readonly tickDt: number = TICK_DT,
  ) {
    const hz = Math.round(1 / tickDt);
    this.channelTicks = Math.round(rules.channelSec * hz);
    this.interruptibleTicks = Math.round(rules.interruptibleSec * hz);
    this.channelStart = match.bearbots.map(() => null);
    this.hpBefore = match.bearbots.map((b) => b.hp);
    this.states = (match as unknown as { pilotState: PilotStates }).pilotState;
  }

  /** The match's current tick (the sim adds `tickDt` to `clockSec` once per tick). */
  tickNow(): number {
    return Math.round(this.match.clockSec / this.tickDt);
  }

  /** Whether bot `i` is channelling. */
  channelling(i: number): boolean {
    return this.channelStart[i] !== null;
  }

  /** Seconds of channel bot `i` has done after the last tick; 0 = not channelling. */
  channelSec(i: number, tick = this.tickNow()): number {
    const s = this.channelStart[i];
    return s === null ? 0 : Math.round((tick - s + 1) * this.tickDt * 100) / 100;
  }

  private actionOf(i: number): { ps: { currentAction: Action } | undefined; action: Action } {
    const ps = this.states.get(this.match.bearbots[i].id);
    return { ps, action: ps?.currentAction ?? { kind: 'hold' } };
  }

  private end(i: number, kind: RecallEnd, tick: number): void {
    this.channelStart[i] = null;
    this.events.push({ tick, bot: i, kind });
  }

  /** Runs right before the sim's tick: start, continue or cancel channels from the bots' actions. */
  beforeTick(): void {
    const next = this.tickNow() + 1;
    this.match.bearbots.forEach((b, i) => {
      this.hpBefore[i] = b.hp;
      if (!b.alive) return;
      const { ps, action } = this.actionOf(i);
      if (action.kind === 'recall') {
        // The sim must never see `recall` (it would start its own 3× run): the channel stands still.
        if (ps) ps.currentAction = { kind: 'hold' };
        b.recalling = false;
        if (this.channelStart[i] === null) {
          this.channelStart[i] = next;
          this.events.push({ tick: next, bot: i, kind: 'start' });
        }
      } else if (action.kind !== 'hold' && this.channelStart[i] !== null) {
        this.end(i, 'action', next);
      }
    });
  }

  /** Runs right after the sim's tick: damage interrupts, a finished channel teleports home. */
  afterTick(): void {
    const t = this.tickNow();
    this.match.bearbots.forEach((b, i) => {
      const start = this.channelStart[i];
      if (start === null) return;
      if (!b.alive) return this.end(i, 'death', t);
      if (b.hp < this.hpBefore[i] - EPS && t - start < this.interruptibleTicks) {
        // Interrupted: the bot stays put and holds until its pilot issues `recall` again.
        const { ps } = this.actionOf(i);
        if (ps) ps.currentAction = { kind: 'hold' };
        return this.end(i, 'damage', t);
      }
      if (t - start + 1 >= this.channelTicks) {
        const home = mapGeometry(this.match).base[b.team];
        b.pos.x = home.x;
        b.pos.y = home.y;
        b.hp = b.maxHp;
        b.recalling = false;
        const { ps } = this.actionOf(i);
        if (ps) ps.currentAction = { kind: 'hold' };
        this.end(i, 'home', t);
      }
    });
  }

  /** The layer's part of a replay checkpoint: every bot's channel start (−1 = none). */
  checkpoint(): number[] {
    return this.channelStart.map((s) => s ?? -1);
  }

  summary(): RecallSummary {
    const bots = this.match.bearbots.map(() => ({ started: 0, home: 0, damage: 0, action: 0, death: 0 }));
    for (const e of this.events) {
      if (e.kind === 'start') bots[e.bot].started += 1;
      else bots[e.bot][e.kind] += 1;
    }
    return { name: this.rules.name, bots, events: this.events.map((e) => ({ ...e })) };
  }
}

/** Per team, the summary's counts added up (the CLI's result line, the metric tool). */
export function recallTotals(summary: RecallSummary, teams: readonly Team[]): Record<Team, { started: number } & Record<RecallEnd, number>> {
  const zero = () => ({ started: 0, home: 0, damage: 0, action: 0, death: 0 });
  const out: Record<Team, ReturnType<typeof zero>> = { violet: zero(), green: zero() };
  summary.bots.forEach((b, i) => {
    const o = out[teams[i]];
    o.started += b.started;
    o.home += b.home;
    o.damage += b.damage;
    o.action += b.action;
    o.death += b.death;
  });
  return out;
}

/**
 * Attach `rules` to a match that has not ticked yet: right after `applyMapVariant`, before the river
 * objective and the economy, so this wrapper is the innermost one around the sim's own tick.
 */
export function attachRecall(match: Match, rules: RecallRules, tickDt: number = TICK_DT): Recall {
  if (recallOf.has(match)) throw new Error('a recall rule is already attached to this match');
  const recall = new Recall(match, rules, tickDt);
  recallOf.set(match, recall);
  const m = match as unknown as Steppable;
  const origTick = m.tick.bind(match);
  m.tick = (dt: number) => {
    if (match.ended) return origTick(dt);
    recall.beforeTick();
    origTick(dt);
    recall.afterTick();
  };
  return recall;
}
