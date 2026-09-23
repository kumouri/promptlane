/**
 * Headless jam match: two entrant prompts, each driving a whole band on `PromptPilot`, run in
 * lockstep against the UNCHANGED specimen sim. Bundled by `cli.mjs` (esbuild) and imported there;
 * this module has no Node dependencies so it typechecks with the app.
 *
 * Lockstep means the sim never advances while a model is thinking: each tick that asks a pilot
 * for a decision waits for every outstanding reply before the next tick. The result depends only
 * on the seed and the replies, not on wall-clock latency — which also makes the log replayable.
 * The trade-off is time: a 10-minute match at the game's own 0.5 s polling rate is 1,200 rounds
 * of six model calls. `cadenceSec` stretches the interval between real calls; between them the
 * bearbot keeps its last action, exactly as the game does while a reply is in flight. (In the
 * browser's live mode a local model that serialises six callers gives each bearbot a fresh
 * decision only every few real seconds anyway, so a 2 s cadence is sharper than live play.)
 */
import type { Action, Observation, Pilot, Team } from '../../src/types';
import { Match, TICK_DT, type RosterSlot } from '../../src/sim/match';
import { PromptPilot } from '../../src/pilots/promptPilot';
import type { CallModel } from '../../src/pilots/callModel';
import type { TracingDecision, TracingPilot } from './jevPilot';
import {
  CHECKPOINT_EVERY_TICKS,
  JAM_ROSTER,
  MATCH_LOG_SCHEMA,
  ReplayPilot,
  checkpointOf,
  decisionsByBot,
  idNumber,
  tickOf,
  type LogDecision,
  type LogSide,
  type MatchLog,
  type SideStats,
} from '../../src/replay';

export { mockCallModel } from '../../src/pilots/callModel';
export { jevTracingPilot } from './jevPilot';

const MATCH_DURATION_SEC = 600;
const MAX_TICKS = Math.ceil(MATCH_DURATION_SEC / TICK_DT) + 2;

/** The specimen keeps `tick` private; the runner drives it from outside without editing the sim. */
type Steppable = { tick(dt: number): void };
function step(match: Match): void {
  (match as unknown as Steppable).tick(TICK_DT);
}

export interface RunOptions {
  seed: number;
  sides: Record<Team, LogSide>;
  /** One adapter per bearbot index (0..5), so mocks can be seeded per bot. */
  callModelFor: (botIndex: number) => CallModel;
  /**
   * Per-bot override of the whole decision pilot, not just the model call -- for a bearbot whose
   * decision logic isn't a text prompt at all (the Jev house bot, `tools/match/jevPilot.ts`).
   * Returning `undefined` for a bot index falls back to the default `PromptPilot`/`callModelFor`
   * pilot exactly as before; omitting this option entirely (the default) makes every bot use the
   * default pilot, so an existing caller's behaviour is unchanged byte-for-byte. The third
   * argument is this match's own tick counter, for a pilot (like Jev's) whose wire format wants
   * "what tick is this" and has no other way to know.
   */
  decisionPilotFor?: (botIndex: number, team: Team, currentTick: () => number) => TracingPilot | undefined;
  /** Seconds of sim time between real model calls per bearbot. 0.5 = the game's own polling rate. */
  cadenceSec?: number;
  backend: Record<string, unknown>;
  /** Yields to the event loop so the sim's own promise chain settles between ticks. */
  flush?: () => Promise<void>;
  /** Progress callback, once per sim-minute. */
  onProgress?: (info: { clockSec: number; calls: number; elapsedMs: number }) => void;
  /**
   * Stop the sim once its clock reaches this many seconds (quick tests: 180). The log is written
   * with `endReason: null`, which `resultLine` prints as `unfinished`. Default: the full match.
   */
  maxSimSec?: number;
  /** Aborting stops the loop at the next tick (wall-clock cap); the log is left `unfinished`. */
  signal?: AbortSignal;
  /**
   * Live-stream hooks (Phase B, spec §3.4). All optional and additive; the log is unchanged.
   * `onStart` hands over the in-progress log once its header (`idBase`) is known — it *is* the
   * log being built, so a late joiner's backlog is just its contents so far.
   */
  onStart?: (log: MatchLog) => void;
  /** Every decision as it is pushed into `log.decisions` (cached ones included — a replay needs them). */
  onDecision?: (decision: LogDecision) => void;
  /** A tick's asks have all been answered (`inflight` is empty): the sim can be stepped to `tick`. */
  onRound?: (round: { tick: number; asks: number }) => void;
  onCheckpoint?: (checkpoint: { tick: number; state: string }) => void;
  onDeath?: (death: { tick: number; bot: number }) => void;
}

const defaultFlush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function emptyStats(): SideStats {
  return { calls: 0, cached: 0, parseErrors: 0, callErrors: 0, avgMs: 0, deaths: 0, towersLost: 0 };
}

/** Adapts a `PromptPilot` (the frozen v1 specimen, `src/pilots/promptPilot.ts`) to the
 * `TracingPilot` contract `RecordingPilot` below now speaks generically -- the game's only text-
 * prompt pilot, unchanged, wrapped rather than edited. */
function promptTracingPilot(promptText: string, callModel: CallModel): TracingPilot {
  let lastTrace: { reply: string; action: Action | null } | null = null;
  const inner = new PromptPilot(promptText, callModel, (_prompt, reply, action) => {
    lastTrace = { reply, action };
  });
  return {
    async decide(obs: Observation): Promise<TracingDecision> {
      await inner.decide(obs); // PromptPilot's own return already folds null -> hold; the trace has the pre-fallback action
      const trace = lastTrace ?? { reply: '', action: null };
      lastTrace = null;
      return trace;
    },
  };
}

/** Wraps any `TracingPilot` (a prompt bearbot or a Jev one, `tools/match/jevPilot.ts`): records
 * every ask into the log, enforces cadence, tracks in-flight calls. Identical to every caller that
 * doesn't pass `decisionPilotFor` -- the only reader of this generalisation, added for the Jev
 * house bot, is that one new option. */
class RecordingPilot implements Pilot {
  private last: Action = { kind: 'hold' };
  private nextCallAt = -Infinity;

  constructor(
    private readonly botIndex: number,
    private readonly pilot: TracingPilot,
    private readonly ctx: {
      cadenceSec: number;
      log: MatchLog;
      stats: SideStats;
      inflight: Set<Promise<unknown>>;
      asks: { count: number };
      currentTick: () => number;
      currentClock: () => number;
      totalMs: { value: number };
      onDecision?: (decision: LogDecision) => void;
    },
  ) {}

  decide(obs: Observation): Promise<Action> {
    const { ctx } = this;
    const tick = ctx.currentTick();
    ctx.asks.count += 1;

    if (ctx.currentClock() < this.nextCallAt) {
      ctx.stats.cached += 1;
      const cached: LogDecision = { tick, bot: this.botIndex, action: this.last, cached: true };
      ctx.log.decisions.push(cached);
      ctx.onDecision?.(cached);
      return Promise.resolve(this.last);
    }
    this.nextCallAt = ctx.currentClock() + ctx.cadenceSec;

    const started = Date.now();
    const p = this.pilot.decide(obs).then((trace) => {
      const ms = Date.now() - started;
      const action = trace.action ?? { kind: 'hold' as const };
      ctx.stats.calls += 1;
      ctx.totalMs.value += ms;
      if (trace.action === null) {
        if (trace.reply.startsWith('[pilot error:')) ctx.stats.callErrors += 1;
        else ctx.stats.parseErrors += 1;
      }
      this.last = action;
      const decision: LogDecision = { tick, bot: this.botIndex, reply: trace.reply, action: trace.action, ms };
      ctx.log.decisions.push(decision);
      ctx.onDecision?.(decision);
      return action;
    });
    ctx.inflight.add(p);
    p.finally(() => ctx.inflight.delete(p)).catch(() => undefined);
    return p;
  }
}

export async function runMatch(opts: RunOptions): Promise<MatchLog> {
  const cadenceSec = opts.cadenceSec ?? 0.5;
  const flush = opts.flush ?? defaultFlush;
  const stats: Record<Team, SideStats> = { violet: emptyStats(), green: emptyStats() };
  const totalMs: Record<Team, { value: number }> = { violet: { value: 0 }, green: { value: 0 } };

  const log: MatchLog = {
    schema: MATCH_LOG_SCHEMA,
    createdAt: new Date().toISOString(),
    seed: opts.seed,
    tickDt: TICK_DT,
    cadenceSec,
    idBase: 0,
    backend: opts.backend,
    sides: opts.sides,
    decisions: [],
    checkpoints: [],
    result: { winner: null, endReason: null, durationSec: 0, ticks: 0, deaths: [], stats },
  };

  const inflight = new Set<Promise<unknown>>();
  const asks = { count: 0 };
  let match: Match | null = null;
  const currentTick = () => (match ? tickOf(match) : 0);
  const currentClock = () => match?.clockSec ?? 0;

  const roster: RosterSlot[] = JAM_ROSTER.map((slot, i) => ({
    ...slot,
    pilotKind: 'prompt-http',
    makePilot: () => {
      const pilot =
        opts.decisionPilotFor?.(i, slot.team, currentTick) ?? promptTracingPilot(opts.sides[slot.team].promptText, opts.callModelFor(i));
      return new RecordingPilot(i, pilot, {
        cadenceSec,
        log,
        stats: stats[slot.team],
        inflight,
        asks,
        currentTick,
        currentClock,
        totalMs: totalMs[slot.team],
        onDecision: opts.onDecision,
      });
    },
  }));

  match = new Match(opts.seed, roster);
  log.idBase = idNumber(match.nexuses[0].id);
  opts.onStart?.(log);

  const startedMs = Date.now();
  let nextProgressAt = 60;
  const aliveBefore = match.bearbots.map((b) => b.alive);
  const towersBefore = match.towers.map((t) => t.alive);

  const maxSimSec = opts.maxSimSec ?? Infinity;
  for (let tick = 0; tick < MAX_TICKS && !match.ended; tick++) {
    if (match.clockSec >= maxSimSec || opts.signal?.aborted) break;
    asks.count = 0;
    step(match);
    if (asks.count > 0) {
      while (inflight.size > 0) await Promise.all([...inflight]);
      await flush();
    }
    const t = tickOf(match);
    if (asks.count > 0) opts.onRound?.({ tick: t, asks: asks.count });
    match.bearbots.forEach((b, i) => {
      if (aliveBefore[i] && !b.alive) {
        const death = { tick: t, bot: i };
        log.result.deaths.push(death);
        stats[b.team].deaths += 1;
        aliveBefore[i] = false;
        opts.onDeath?.(death);
      }
    });
    match.towers.forEach((tw, i) => {
      if (towersBefore[i] && !tw.alive) {
        stats[tw.team].towersLost += 1;
        towersBefore[i] = false;
      }
    });
    if (t % CHECKPOINT_EVERY_TICKS === 0) {
      const checkpoint = { tick: t, state: checkpointOf(match) };
      log.checkpoints.push(checkpoint);
      opts.onCheckpoint?.(checkpoint);
    }
    if (match.clockSec >= nextProgressAt) {
      nextProgressAt += 60;
      opts.onProgress?.({
        clockSec: match.clockSec,
        calls: stats.violet.calls + stats.green.calls,
        elapsedMs: Date.now() - startedMs,
      });
    }
  }

  for (const team of ['violet', 'green'] as Team[]) {
    stats[team].avgMs = stats[team].calls ? Math.round(totalMs[team].value / stats[team].calls) : 0;
  }
  log.result.winner = match.winner;
  log.result.endReason = match.endReason;
  log.result.durationSec = Math.round(match.clockSec * 100) / 100;
  log.result.ticks = tickOf(match);
  return log;
}

export interface VerifyResult {
  ok: boolean;
  ticks: number;
  checkpointsCompared: number;
  firstDivergenceTick: number | null;
  winner: Team | null;
  endReason: 'nexus' | 'timeout' | null;
}

/**
 * Re-simulate a log with `ReplayPilot`s and compare every checkpoint and the final result. A log
 * stopped early (`maxSimSec`, or an aborted run) has `endReason: null`; the replay then stops at
 * the same tick count and must reach it in the same state.
 */
export async function verifyReplay(log: MatchLog, flush: () => Promise<void> = defaultFlush): Promise<VerifyResult> {
  const byBot = decisionsByBot(log);
  let match: Match | null = null;
  let asked = 0;
  const roster: RosterSlot[] = JAM_ROSTER.map((slot, i) => ({
    ...slot,
    pilotKind: 'prompt-http',
    makePilot: () =>
      new ReplayPilot({
        decisions: byBot[i],
        idOffset: () => idNumber(match!.nexuses[0].id) - log.idBase,
        onDecision: () => {
          asked += 1;
        },
      }),
  }));
  match = new Match(log.seed, roster);

  const expected = new Map(log.checkpoints.map((c) => [c.tick, c.state]));
  let compared = 0;
  let firstDivergenceTick: number | null = null;
  for (let tick = 0; tick < MAX_TICKS && !match.ended; tick++) {
    if (log.result.endReason === null && tickOf(match) >= log.result.ticks) break;
    asked = 0;
    step(match);
    if (asked > 0) await flush();
    const t = tickOf(match);
    const want = expected.get(t);
    if (want !== undefined) {
      compared += 1;
      if (want !== checkpointOf(match) && firstDivergenceTick === null) firstDivergenceTick = t;
    }
  }
  const sameResult =
    match.winner === log.result.winner && match.endReason === log.result.endReason && tickOf(match) === log.result.ticks;
  return {
    ok: firstDivergenceTick === null && sameResult,
    ticks: tickOf(match),
    checkpointsCompared: compared,
    firstDivergenceTick,
    winner: match.winner,
    endReason: match.endReason,
  };
}

export type { LogDecision, MatchLog };
