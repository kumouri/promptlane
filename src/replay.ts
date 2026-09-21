/**
 * Match-log schema + replay pilot, shared by the headless jam runner (`tools/match/`) and the
 * one-page UI (`?replay=`). Jam tooling, not part of the historical game specimen: it drives the
 * unchanged `Match` from the outside and never alters sim rules.
 *
 * Replay is a re-simulation: the log stores the seed and every pilot decision (in the order the
 * sim asked for them), and a `ReplayPilot` answers each ask with the logged action. The sim is a
 * fixed-timestep, seeded simulation, so the same decisions reproduce the same match. Checkpoints
 * every `CHECKPOINT_EVERY_TICKS` let a replayer prove that instead of assuming it.
 */
import type { Action, Instrument, Lane, Observation, Pilot, Team } from './types';
import type { Match } from './sim/match';

export const MATCH_LOG_SCHEMA = 'promptlane-match-log-1';

/** Tick length of the specimen sim (20 tps). Mirrors `TICK_DT` in `sim/match.ts`. */
export const REPLAY_TICK_DT = 1 / 20;

/** How often a state checkpoint is written into the log (100 ticks = 5 sim-seconds). */
export const CHECKPOINT_EVERY_TICKS = 100;

/**
 * The fixed jam roster: one band per side, drums top / keytar mid / violin bottom. Index `i` here
 * is `match.bearbots[i]`, because `Match` creates bearbots in roster order.
 */
export const JAM_ROSTER: ReadonlyArray<{ team: Team; lane: Lane; instrument: Instrument }> = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];

/** One answer to one `decide()` call. `reply` is omitted when the runner reused the last action. */
export interface LogDecision {
  /** Sim tick on which the pilot was asked; the action applies from the following tick. */
  tick: number;
  /** Index into `JAM_ROSTER` / `match.bearbots`. */
  bot: number;
  /** Raw model reply (or `[pilot error: …]`). Absent when `cached` is true. */
  reply?: string;
  /** The action the sim was given. `null` means the reply did not parse and the sim held. */
  action: Action | null;
  /** True when no model call was made and the previous action was returned (cadence > 0.5 s). */
  cached?: boolean;
  /** Wall-clock milliseconds the model call took. */
  ms?: number;
}

export interface LogCheckpoint {
  tick: number;
  state: string;
}

export interface LogSide {
  /** Display name — the entrant's handle, derived from the prompt path. */
  name: string;
  promptFile: string;
  promptText: string;
}

export interface SideStats {
  /** Model calls made. */
  calls: number;
  /** Asks answered from the previous action without a model call. */
  cached: number;
  /** Replies received that did not parse into a valid action (the sim held). */
  parseErrors: number;
  /** Calls that threw (endpoint down, timeout…); also held. */
  callErrors: number;
  avgMs: number;
  deaths: number;
  towersLost: number;
}

export interface MatchResult {
  winner: Team | null;
  endReason: 'nexus' | 'timeout' | null;
  durationSec: number;
  ticks: number;
  deaths: Array<{ tick: number; bot: number }>;
  stats: Record<Team, SideStats>;
}

export interface MatchLog {
  schema: typeof MATCH_LOG_SCHEMA;
  createdAt: string;
  seed: number;
  tickDt: number;
  cadenceSec: number;
  /** Numeric part of the first entity id the match allocated; replay remaps ids by the offset. */
  idBase: number;
  /** Which model answered: `{kind:'mock'}` or `{kind:'http', endpoint, health}`. */
  backend: Record<string, unknown>;
  sides: Record<Team, LogSide>;
  decisions: LogDecision[];
  checkpoints: LogCheckpoint[];
  result: MatchResult;
}

export function isMatchLog(value: unknown): value is MatchLog {
  const v = value as Partial<MatchLog> | null;
  return !!v && v.schema === MATCH_LOG_SCHEMA && typeof v.seed === 'number' && Array.isArray(v.decisions);
}

/** Current tick index of a match: the sim increments `clockSec` by `TICK_DT` once per tick. */
export function tickOf(match: Pick<Match, 'clockSec'>): number {
  return Math.round(match.clockSec / REPLAY_TICK_DT);
}

/** Numeric suffix of an entity id such as `mn-23`. */
export function idNumber(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

/** Shift an entity id's numeric suffix (ids are allocated by a module-global counter). */
export function remapId(id: string, offset: number): string {
  if (offset === 0) return id;
  const m = /^([a-z]+)-(\d+)$/.exec(id);
  return m ? `${m[1]}-${Number(m[2]) + offset}` : id;
}

/** Compact, rounded snapshot of everything that decides a match. Equal strings ⇒ same state. */
export function checkpointOf(match: Match): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return JSON.stringify({
    b: match.bearbots.map((b) => [r(b.hp), r(b.pos.x), r(b.pos.y), b.alive ? 1 : 0, b.recalling ? 1 : 0]),
    t: match.towers.map((t) => r(t.hp)),
    n: match.nexuses.map((n) => r(n.hp)),
    m: match.minions.length,
  });
}

export interface ReplayPilotOptions {
  /** This bot's decisions, in log order. */
  decisions: LogDecision[];
  /** Difference between the replaying match's first entity id and `log.idBase`. */
  idOffset: () => number;
  /** Called with each logged decision as it is handed back to the sim. */
  onDecision?: (decision: LogDecision, action: Action) => void;
}

/** Answers the sim's asks from a log instead of a model. Out of decisions ⇒ hold. */
export class ReplayPilot implements Pilot {
  private cursor = 0;
  private last: Action = { kind: 'hold' };

  constructor(private readonly opts: ReplayPilotOptions) {}

  async decide(_obs: Observation): Promise<Action> {
    const decision = this.opts.decisions[this.cursor];
    if (!decision) return { kind: 'hold' };
    this.cursor += 1;
    const offset = this.opts.idOffset();
    const logged = decision.action ?? { kind: 'hold' as const };
    const action: Action =
      typeof logged.target === 'string' ? { ...logged, target: remapId(logged.target, offset) } : { ...logged };
    this.last = action;
    this.opts.onDecision?.(decision, action);
    return this.last;
  }

  get exhausted(): boolean {
    return this.cursor >= this.opts.decisions.length;
  }
}

/** Split a log's decisions per bot, preserving order. */
export function decisionsByBot(log: MatchLog): LogDecision[][] {
  const byBot: LogDecision[][] = JAM_ROSTER.map(() => []);
  for (const d of log.decisions) byBot[d.bot]?.push(d);
  return byBot;
}
