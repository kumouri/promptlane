/**
 * Live view and fast replay for the one-page UI (docs/arena-site-spec.md §3.4). Jam tooling
 * beside `replay.ts`; the sim in `sim/` is untouched.
 *
 * Both modes are the same thing: a `Match` with six `ReplayPilot`s answering from decision
 * buffers, stepped from *outside* by calling the private `tick(TICK_DT)` — the pattern
 * `tools/match/headless.ts` and the acceptance adapters already use — instead of `Match.start()`'s
 * real-time interval. A finished log fills the buffers up front and the `Ticker` runs at 1×/4×/16×.
 * A live match fills them as `decision` events arrive over SSE and the ticker may only step up to
 * the last tick whose asks have all been answered (`round`), because a `ReplayPilot` with an
 * empty buffer answers `hold`, which would silently diverge. The browser is therefore always
 * *behind* the server, never ahead; the lag is one round of asks.
 *
 * `LiveFeed` (pure: events in, state out) and `Ticker` (needs only a match and a yield) are kept
 * free of DOM so `tools/arena/test_browser.mjs` can drive them in Node; `openLive` is the
 * `EventSource` glue.
 */
import type { Action, Observation, Pilot, Team } from './types';
import { Match, TICK_DT, type RosterSlot } from './sim/match';
import {
  JAM_ROSTER,
  ReplayPilot,
  checkpointOf,
  idNumber,
  tickOf,
  type LogDecision,
  type LogSide,
  type MatchLog,
  type MatchResult,
} from './replay';

/** The specimen keeps `tick` private; the driver steps it from outside without editing the sim. */
type Steppable = { tick(dt: number): void };
export function stepOnce(match: Match): void {
  (match as unknown as Steppable).tick(TICK_DT);
}

/** `meta` event payload: the log header (see `metaOf` in `tools/arena/live.mjs`). */
export interface LiveMeta {
  seed: number;
  tickDt: number;
  cadenceSec: number;
  idBase: number;
  backend: Record<string, unknown>;
  sides: Record<Team, LogSide>;
  createdAt?: string;
  /** Set by the server when the stream is synthesized from a finished log (play at the chosen speed, not catch-up). */
  finished?: boolean;
}

export interface LiveEnd {
  status: 'finished' | 'void' | 'timed-out' | 'failed' | 'gone' | string;
  reason?: string | null;
  verify?: { checkpointsCompared: number; ticks: number } | null;
}

export type LiveEvent =
  | { event: 'waiting'; data: { status: string; position: number } }
  | { event: 'meta'; data: LiveMeta }
  | { event: 'decision'; data: LogDecision }
  | { event: 'round'; data: { tick: number; asks: number } }
  | { event: 'checkpoint'; data: { tick: number; state: string } }
  | { event: 'death'; data: { tick: number; bot: number } }
  | { event: 'progress'; data: { clockSec: number; calls: number; elapsedMs: number } }
  | { event: 'result'; data: MatchResult }
  | { event: 'end'; data: LiveEnd };

/**
 * Accumulates a match log from the event stream. `byBot` arrays are handed to the `ReplayPilot`s
 * by reference, so pushing a decision is all it takes for the sim to be able to use it.
 */
export class LiveFeed {
  meta: LiveMeta | null = null;
  readonly byBot: LogDecision[][] = JAM_ROSTER.map(() => []);
  readonly checkpoints = new Map<number, string>();
  /** Highest tick whose asks are all answered; the sim may be stepped up to and including it. */
  lastRoundTick = -1;
  result: MatchResult | null = null;
  end: LiveEnd | null = null;
  waiting: { status: string; position: number } | null = null;
  progress: { clockSec: number; calls: number; elapsedMs: number } | null = null;
  decisions = 0;
  /** A checkpoint may arrive after the sim passed its tick; the divergence check wants to know. */
  onCheckpoint: ((tick: number, state: string) => void) | null = null;

  apply(e: LiveEvent): void {
    switch (e.event) {
      case 'waiting':
        this.waiting = e.data;
        break;
      case 'meta':
        this.meta = e.data;
        this.waiting = null;
        break;
      case 'decision':
        this.byBot[e.data.bot]?.push(e.data);
        this.decisions += 1;
        break;
      case 'round':
        this.lastRoundTick = Math.max(this.lastRoundTick, e.data.tick);
        break;
      case 'checkpoint':
        this.checkpoints.set(e.data.tick, e.data.state);
        this.onCheckpoint?.(e.data.tick, e.data.state);
        break;
      case 'progress':
        this.progress = e.data;
        break;
      case 'result':
        this.result = e.data;
        // trailing ticks without asks are safe to step now
        this.lastRoundTick = Math.max(this.lastRoundTick, e.data.ticks);
        break;
      case 'end':
        this.end = e.data;
        break;
      default:
        break;
    }
  }

  /** A finished log, loaded whole: everything is known up front. */
  static fromLog(log: MatchLog): LiveFeed {
    const f = new LiveFeed();
    f.apply({ event: 'meta', data: { seed: log.seed, tickDt: log.tickDt, cadenceSec: log.cadenceSec, idBase: log.idBase, backend: log.backend, sides: log.sides, createdAt: log.createdAt, finished: true } });
    for (const d of log.decisions) f.apply({ event: 'decision', data: d });
    for (const c of log.checkpoints) f.apply({ event: 'checkpoint', data: c });
    f.apply({ event: 'result', data: log.result });
    return f;
  }

  /** The limit the ticker may step to. Infinity once the sim can end on its own. */
  get limitTick(): number {
    if (this.result && this.result.endReason !== null) return Infinity;
    return this.lastRoundTick;
  }
}

/** Counts the sim's asks per tick so the driver knows when to let the pilot promises settle. */
class CountingPilot implements Pilot {
  constructor(private readonly inner: ReplayPilot, private readonly asks: { count: number }) {}
  decide(obs: Observation): Promise<Action> {
    this.asks.count += 1;
    return this.inner.decide(obs);
  }
}

/**
 * Build the match for a feed: six `ReplayPilot`s over the feed's buffers. `onDecision` receives
 * each non-cached decision as the sim consumes it (for the side panel's "last reply").
 */
export function buildMatch(feed: LiveFeed, onDecision?: (botIndex: number, decision: LogDecision, action: Action) => void): { match: Match; asks: { count: number } } {
  const meta = feed.meta;
  if (!meta) throw new Error('no meta yet');
  const asks = { count: 0 };
  let match: Match | null = null;
  const roster: RosterSlot[] = JAM_ROSTER.map((slot, i) => ({
    ...slot,
    pilotKind: 'prompt-http',
    makePilot: () =>
      new CountingPilot(
        new ReplayPilot({
          decisions: feed.byBot[i],
          idOffset: () => (match ? idNumber(match.nexuses[0].id) - meta.idBase : 0),
          onDecision: (decision, action) => {
            if (!decision.cached) onDecision?.(i, decision, action);
          },
        }),
        asks,
      ),
  }));
  match = new Match(meta.seed, roster);
  return { match, asks };
}

/** Yield a macrotask so the sim's own promise chain (decide → then → finally) settles, unclamped by nested-timer throttling. */
export const yieldMacrotask: () => Promise<void> =
  typeof MessageChannel === 'function'
    ? () =>
        new Promise((resolve) => {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => {
            ch.port1.close();
            resolve();
          };
          ch.port2.postMessage(0);
        })
    : () => new Promise((resolve) => setTimeout(resolve, 0));

export interface TickerOptions {
  /** Highest tick the sim may reach (inclusive). Re-read every step, so a live feed can grow it. */
  limit: () => number;
  /** Sim seconds per real second; `Infinity` = catch up as fast as possible. */
  speed: () => number;
  /** Called after every stepped tick; return false to stop (e.g. divergence). */
  onTick?: (tick: number) => boolean | void;
  /** True once nothing more can arrive; the loop exits when the limit is reached. */
  finished?: () => boolean;
  /** Frame scheduler; `requestAnimationFrame` in the browser, a timer in Node. */
  frame?: () => Promise<void>;
  yieldFn?: () => Promise<void>;
  now?: () => number;
}

/**
 * The external-tick driver. Steps `match` toward `limit()` at `speed()` sim-seconds per real
 * second; after any tick that asked a pilot, yields so the answers settle before the next tick
 * (exactly what the headless runner does). One loop for live (`speed: Infinity`, growing limit)
 * and for replay (`speed: 1|4|16`, fixed limit).
 */
export class Ticker {
  private stopped = false;
  private baseTick = 0;
  private baseNow = 0;
  private lastSpeed = NaN;
  readonly done: Promise<void>;

  constructor(private readonly match: Match, private readonly asks: { count: number }, private readonly opts: TickerOptions) {
    this.done = this.run();
  }

  stop(): void {
    this.stopped = true;
  }

  private async run(): Promise<void> {
    const now = this.opts.now ?? (() => performance.now());
    const frame = this.opts.frame ?? (() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    const yieldFn = this.opts.yieldFn ?? yieldMacrotask;
    while (!this.stopped && !this.match.ended) {
      if (this.opts.finished?.() && tickOf(this.match) >= this.opts.limit()) break;
      const speed = this.opts.speed();
      if (speed !== this.lastSpeed) {
        this.lastSpeed = speed;
        this.baseTick = tickOf(this.match);
        this.baseNow = now();
      }
      const budget = speed === Infinity ? Infinity : this.baseTick + Math.floor((((now() - this.baseNow) / 1000) * speed) / TICK_DT);
      let target = Math.min(this.opts.limit(), budget);
      let steppedThisFrame = 0;
      while (!this.stopped && !this.match.ended && tickOf(this.match) < target) {
        this.asks.count = 0;
        stepOnce(this.match);
        if (this.asks.count > 0) await yieldFn();
        if (this.opts.onTick?.(tickOf(this.match)) === false) {
          this.stopped = true;
          break;
        }
        // catch-up mode still has to paint once in a while
        if (speed === Infinity && ++steppedThisFrame >= 400) break;
        if (speed !== Infinity) target = Math.min(this.opts.limit(), budget);
      }
      await frame();
    }
  }
}

/** `EventSource` glue: parse each named event into the feed, tell the caller on every change. */
export function openLive(url: string, feed: LiveFeed, onChange: () => void, onError: (message: string) => void): { close: () => void } {
  const es = new EventSource(url);
  const names: LiveEvent['event'][] = ['waiting', 'meta', 'decision', 'round', 'checkpoint', 'death', 'progress', 'result', 'end'];
  for (const name of names) {
    es.addEventListener(name, (ev) => {
      let data: unknown;
      try {
        data = JSON.parse((ev as MessageEvent).data);
      } catch {
        return;
      }
      feed.apply({ event: name, data } as LiveEvent);
      if (name === 'end') es.close();
      onChange();
    });
  }
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) onError(feed.end ? '' : 'stream closed');
  };
  return { close: () => es.close() };
}

/** Checkpoint bookkeeping shared by replay and live: compare on both sides of the arrival order. */
export class DivergenceCheck {
  divergedAt: number | null = null;
  /** Checkpoints compared so far (either arrival order). */
  compared = 0;
  private readonly mine = new Map<number, string>();

  constructor(private readonly feed: LiveFeed, private readonly every: number) {}

  /** After a step: record ours at checkpoint ticks and compare if the server's is already here. */
  afterTick(match: Match): void {
    if (this.divergedAt !== null) return;
    const t = tickOf(match);
    if (t % this.every !== 0) return;
    const state = checkpointOf(match);
    this.mine.set(t, state);
    const expected = this.feed.checkpoints.get(t);
    if (expected === undefined) return;
    this.compared += 1;
    if (expected !== state) this.divergedAt = t;
  }

  /** When a checkpoint arrives after we passed it. */
  onCheckpoint(tick: number, state: string): void {
    if (this.divergedAt !== null) return;
    const mine = this.mine.get(tick);
    if (mine === undefined) return;
    this.compared += 1;
    if (mine !== state) this.divergedAt = tick;
  }
}
