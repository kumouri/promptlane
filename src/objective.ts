/**
 * The river objective, the Bandstand (docs/economy-spec.md §9; Q14–Q17 ruled option A,
 * 2026-09-30). A neutral stage on the river alternates between two sites. A team takes it by
 * holding the stage, and any enemy bearbot on it freezes the capture. Taking it gives the whole
 * team a 45 s Encore (+15 % attack damage, +10 % move speed, lost on death), plus gold and XP when
 * the economy layer is on.
 *
 * The specimen sim (`src/sim/*`) is frozen, so this is a ruleset layer applied from OUTSIDE, the
 * same shape as `src/mapVariant.ts`: every place that builds a match calls `attachObjective` after
 * `applyMapVariant` (and after the economy, when there is one). It
 * - wraps the match instance's own `tick`: the sim ticks, then `Objective.update` runs (§9.6);
 * - wraps each pilot's `decide`, so the observation carries the `bandstand` block and the Encore
 *   fields (§9.7) before the pilot sees it;
 * - writes the Encore into the bots' stats only through `src/ruleset/stats.ts`, the derivation it
 *   shares with the economy;
 * - pays gold and XP only through `src/ruleset/rewards.ts`, which only the economy registers.
 *
 * It reads positions and `alive`, uses no RNG, and counts time in ticks, so a match stays a
 * function of its seed and its decisions. A log records the ruleset it was played under
 * (`MatchLog.objective`); a log without one replays exactly as before, because nothing is attached.
 * Every number is in `src/objective/river-1.json`.
 *
 * `river-2` (§9.10; Ceryce's redesign, 2026-09-30 23:00–23:02 CT) is the same layer with three
 * switches its constants file turns on, so `river-1` logs replay exactly as before:
 * - a **close timer** (`close`): an opening nobody takes closes 30 s after it opened, or, if a bot
 *   is on the stage then, on the first tick the stage is empty, and at 45 s at the latest. The next
 *   opening is scheduled exactly as after a capture;
 * - **faster sets**: full in 7.5 / 5 / 2.5 s for 1 / 2 / 3 bots;
 * - **the bigger group pushes** (`capture.contest: 'outnumber'`): with both teams on the stage, the
 *   team with more bots lowers the other team's progress at the margin's rate, but never raises its
 *   own while any enemy is on it. Equal numbers: nothing moves (river-1's freeze).
 *
 * `river-2-set10` is §9.8's one tuning pass on `river-2` (runs/bandstand-5-2026-10-01.md): its first
 * knob, a longer set so contests last longer, scaled as §9.8 scales river-1's (15 -> 20 s, x4/3).
 * One bot fills it in 10 s instead of 7.5; everything else is `river-2`.
 */
import type { Observation, Team, Vec2 } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import { dist } from './sim/map';
import { deriveStats, setStatMultiplier } from './ruleset/stats';
import { rewardSinkOf } from './ruleset/rewards';
import RIVER_1_JSON from './objective/river-1.json';
import RIVER_2_JSON from './objective/river-2.json';
import RIVER_2_SET10_JSON from './objective/river-2-set10.json';

export interface ObjectiveSite {
  id: string;
  x: number;
  y: number;
}

/** The constants file's shape (`src/objective/river-1.json`). */
export interface ObjectiveRules {
  /** Stable name recorded in match logs. A changed number is a new name. */
  name: string;
  /** Openings cycle through these in order: 1st, 3rd, 5th … at the first, 2nd, 4th … at the second. */
  sites: ObjectiveSite[];
  /** Capture circle radius; a bearbot is on the stage when its centre is within it. */
  radius: number;
  schedule: {
    /** Sim second of the first opening. */
    firstOpenSec: number;
    /** Seconds from a capture to the next opening. */
    afterCaptureSec: number;
    /** An opening is announced (`upcoming`) this many seconds ahead. */
    warnSec: number;
    /** No opening is scheduled after this sim second. */
    lastOpenSec: number;
  };
  /**
   * When an opening nobody takes closes (river-2). Absent (river-1): it stays open until captured.
   * `afterCaptureSec` then also counts from the close.
   */
  close?: {
    /** Seconds after opening at which it closes, if nobody is on the stage at that moment. */
    emptySec: number;
    /** If somebody is: it closes on the first tick the stage is empty, and at this second at the latest. */
    occupiedSec: number;
  };
  capture: {
    /** Seconds one bearbot needs to take an empty bar. */
    setSec: number;
    /** Speed multiplier by bots on the stage: index 1, 2, 3 (the last entry covers more). */
    rateByCount: number[];
    /** Seconds an empty stage takes to drain a full bar back to 0. */
    drainSec: number;
    /**
     * Both teams on the stage. `freeze` (river-1, the default): nothing moves. `outnumber` (river-2):
     * the team with more bots lowers the other team's progress at `rate(margin)`; its own never rises.
     */
    contest?: 'freeze' | 'outnumber';
  };
  encore: {
    durationSec: number;
    /** Fractional bonuses: 0.15 = +15 %. Basic attacks only; ability damage is the sim's own table. */
    mods: { attackDamage: number; moveSpeed: number };
    lostOnDeath: boolean;
  };
  /** Paid only when an economy layer registered a reward sink (`src/ruleset/rewards.ts`). */
  economy: { goldTeam: number; goldLocalPool: number; xpCapturer: number };
}

export const RIVER_1: ObjectiveRules = RIVER_1_JSON as ObjectiveRules;
export const RIVER_2: ObjectiveRules = RIVER_2_JSON as ObjectiveRules;
export const RIVER_2_SET10: ObjectiveRules = RIVER_2_SET10_JSON as ObjectiveRules;

export const OBJECTIVES: Record<string, ObjectiveRules> = {
  [RIVER_1.name]: RIVER_1,
  [RIVER_2.name]: RIVER_2,
  [RIVER_2_SET10.name]: RIVER_2_SET10,
};

/**
 * The objective new matches play with when the caller names none: none, until Ceryce's go/no-go
 * gate (Q17; when it falls: docs/arena-runbook.md §6, *The Jam calendar*). `--objective river-1`
 * (CLI) or `objective: 'river-1'` turns it on.
 */
export const DEFAULT_OBJECTIVE: ObjectiveRules | null = null;

/** A name (`'river-1'`, or `'none'`), a recorded ruleset (a log's `objective`), or absent = none. */
export function resolveObjective(objective: string | ObjectiveRules | null | undefined): ObjectiveRules | null {
  if (objective == null || objective === 'none') return null;
  if (typeof objective !== 'string') return objective;
  const found = OBJECTIVES[objective];
  if (!found) throw new Error(`unknown objective "${objective}" (known: none, ${Object.keys(OBJECTIVES).join(', ')})`);
  return found;
}

export type BandstandStatus = 'closed' | 'upcoming' | 'open' | 'done';

/** The `bandstand` block of a pilot's observation, from that bot's team's side (§9.7). */
export interface BandstandView {
  /** The open site, or the next one; the last one once `done`. */
  site: string;
  pos: Vec2;
  radius: number;
  status: BandstandStatus;
  /** Whole seconds until it opens while `closed` or `upcoming`; null while `open` or `done`. */
  opensInSec: number | null;
  /** −1..+1 from YOUR team's side: +1 = your team takes it. 0 unless open. */
  progress: number;
  /** Both teams have a bearbot on the stage right now. */
  contested: boolean;
  /** Your team's bearbots on the stage, you included. The enemy's count is not shown. */
  alliesOn: number;
  selfOn: boolean;
}

/** An observation with the objective's fields (only a match played with an objective has them). */
export interface ObjectiveObservation extends Observation {
  self: Observation['self'] & { encoreSec: number };
  allies: Array<Observation['allies'][number] & { encoreSec: number }>;
  visibleEnemies: Array<Observation['visibleEnemies'][number] & { encore?: boolean }>;
  bandstand: BandstandView;
}

export interface BandstandOpening {
  /** 1-based: the first opening of the match is 1. */
  index: number;
  site: string;
  openSec: number;
  /** When it was taken; null if it closed untaken or the match ended with it open. */
  captureSec: number | null;
  /** river-2: when it closed untaken (`close`). Absent: taken, still open at the end, or river-1. */
  closedSec?: number;
  team: Team | null;
  /** Bots (indices into `match.bearbots`) on the stage at the moment of capture. */
  capturers: number[];
  /** Both teams had a bearbot on the stage at some tick while it was open. */
  contested: boolean;
  /** Ticks during which it was contested. */
  contestedTicks: number;
  /** Bots of the capturing team that got the Encore (alive at the capture). */
  encore: number[];
  /** Gold and XP went to the economy's reward sink (false: no economy on the match). */
  rewarded: boolean;
}

/** What `MatchLog.result.objective` carries: every opening, in order. */
export interface ObjectiveSummary {
  name: string;
  openings: BandstandOpening[];
  captures: Record<Team, number>;
}

const STATUS_CODE: Record<BandstandStatus, number> = { closed: 0, upcoming: 1, open: 2, done: 3 };
/** Floating-point slack for "the bar is full" (300 additions of 1/300 land a hair under 1). */
const EPS = 1e-9;
const round = (n: number, places: number) => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

const objectiveOf = new WeakMap<Match, Objective>();

/** The objective attached to `match`, if any (the replay checkpoint and the viewer read it). */
export function getObjective(match: Match): Objective | undefined {
  return objectiveOf.get(match);
}

/** One match's Bandstand: its schedule, its capture bar and every bot's Encore. */
export class Objective {
  readonly openings: BandstandOpening[] = [];
  /** Index into `rules.sites` of the open or next site. */
  siteIndex = 0;
  status: BandstandStatus = 'closed';
  /** −1 (green has it) … +1 (violet has it). */
  bar = 0;
  /** Tick of the next opening; null once no more are scheduled. */
  nextOpenTick: number | null;
  /** Per bot: the tick its Encore ends (exclusive); null = none. */
  readonly encoreUntil: Array<number | null>;
  /** Bots on the stage after the last update, per team (the viewer draws them). */
  onStage: Record<Team, number[]> = { violet: [], green: [] };
  private readonly hz: number;
  private readonly warnTicks: number;
  private readonly lastOpenTick: number;
  private readonly afterCaptureTicks: number;
  private readonly encoreTicks: number;
  /** river-2's close timer in ticks; null under river-1. */
  private readonly closeTicks: { empty: number; occupied: number } | null;
  /** Tick the open stage opened; null while not open. */
  private openTick: number | null = null;

  constructor(
    private readonly match: Match,
    readonly rules: ObjectiveRules,
    private readonly tickDt: number = TICK_DT,
  ) {
    this.hz = Math.round(1 / tickDt);
    this.warnTicks = Math.round(rules.schedule.warnSec * this.hz);
    this.lastOpenTick = Math.round(rules.schedule.lastOpenSec * this.hz);
    this.afterCaptureTicks = Math.round(rules.schedule.afterCaptureSec * this.hz);
    this.encoreTicks = Math.round(rules.encore.durationSec * this.hz);
    this.closeTicks = rules.close
      ? { empty: Math.round(rules.close.emptySec * this.hz), occupied: Math.round(rules.close.occupiedSec * this.hz) }
      : null;
    const first = Math.round(rules.schedule.firstOpenSec * this.hz);
    this.nextOpenTick = first <= this.lastOpenTick ? first : null;
    if (this.nextOpenTick === null) this.status = 'done';
    this.encoreUntil = match.bearbots.map(() => null);
  }

  get site(): ObjectiveSite {
    return this.rules.sites[this.siteIndex];
  }

  /** The match's current tick (the sim adds `tickDt` to `clockSec` once per tick). */
  tickNow(): number {
    return Math.round(this.match.clockSec / this.tickDt);
  }

  /** Whether bot `i` has the Encore at tick `tick`. */
  hasEncore(i: number, tick = this.tickNow()): boolean {
    const until = this.encoreUntil[i];
    return until !== null && tick < until;
  }

  /** This layer's stat multiplier (`src/ruleset/stats.ts`): the Encore's bonuses while it lasts. */
  multiplier(i: number, key: 'maxHp' | 'attackDamage' | 'moveSpeed' | 'attackCooldownSec'): number {
    if (!this.hasEncore(i)) return 1;
    if (key === 'attackDamage') return 1 + this.rules.encore.mods.attackDamage;
    if (key === 'moveSpeed') return 1 + this.rules.encore.mods.moveSpeed;
    return 1;
  }

  /**
   * One tick of the objective, run right after the sim's tick (§9.6 tick order):
   * 1. clear the Encore of dead bots; 2. count bots on the stage; 3. move the bar;
   * 4. on a capture, grant the Encore, then gold and XP if an economy is on; otherwise, under
   *    river-2, close an opening its timer has run out on;
   * 5. advance the schedule; 6. expire finished Encores and derive stats.
   */
  update(): void {
    const t = this.tickNow();
    const bots = this.match.bearbots;

    // 1. The Encore ends on death.
    if (this.rules.encore.lostOnDeath) {
      bots.forEach((b, i) => {
        if (!b.alive) this.encoreUntil[i] = null;
      });
    }

    // 2. Who is on the stage.
    const site = this.site;
    const on: Record<Team, number[]> = { violet: [], green: [] };
    bots.forEach((b, i) => {
      if (b.alive && dist(b.pos, site) <= this.rules.radius) on[b.team].push(i);
    });
    this.onStage = on;

    // 3. The bar.
    if (this.status === 'open') {
      const opening = this.openings[this.openings.length - 1];
      const v = on.violet.length;
      const g = on.green.length;
      if (v > 0 && g > 0) {
        opening.contested = true;
        opening.contestedTicks += 1;
        // river-2: the bigger group pushes the other team's progress down, never its own up.
        if (this.rules.capture.contest === 'outnumber' && v !== g) {
          const push = this.rate(Math.abs(v - g)) * this.tickDt;
          if (v > g && this.bar < 0) this.bar = Math.min(0, this.bar + push);
          else if (g > v && this.bar > 0) this.bar = Math.max(0, this.bar - push);
        }
      } else if (v > 0) {
        if (this.bar < 0) this.bar = 0;
        this.bar = Math.min(1, this.bar + this.rate(v) * this.tickDt);
      } else if (g > 0) {
        if (this.bar > 0) this.bar = 0;
        this.bar = Math.max(-1, this.bar - this.rate(g) * this.tickDt);
      } else if (this.bar !== 0) {
        const drain = this.tickDt / this.rules.capture.drainSec;
        this.bar = this.bar > 0 ? Math.max(0, this.bar - drain) : Math.min(0, this.bar + drain);
      }

      // 4. A capture.
      const team: Team | null = this.bar >= 1 - EPS ? 'violet' : this.bar <= -1 + EPS ? 'green' : null;
      if (team) this.capture(opening, team, on[team], t);
      // 4b. river-2: an opening nobody took closes (a capture on the same tick wins).
      else if (this.closeTicks && this.openTick !== null) {
        const age = t - this.openTick;
        if (age >= this.closeTicks.occupied || (age >= this.closeTicks.empty && v === 0 && g === 0)) {
          opening.closedSec = round(t * this.tickDt, 2);
          this.scheduleNext(t);
        }
      }
    }

    // 5. The schedule.
    if (this.status !== 'open' && this.nextOpenTick !== null) {
      if (t >= this.nextOpenTick) {
        this.status = 'open';
        this.bar = 0;
        this.nextOpenTick = null;
        this.openTick = t;
        this.openings.push({
          index: this.openings.length + 1,
          site: this.site.id,
          openSec: round(t * this.tickDt, 2),
          captureSec: null,
          team: null,
          capturers: [],
          contested: false,
          contestedTicks: 0,
          encore: [],
          rewarded: false,
        });
      } else {
        this.status = t >= this.nextOpenTick - this.warnTicks ? 'upcoming' : 'closed';
      }
    }

    // 6. Expire, then write stats through the shared derivation.
    bots.forEach((_, i) => {
      const until = this.encoreUntil[i];
      if (until !== null && t >= until) this.encoreUntil[i] = null;
      deriveStats(this.match, i);
    });
  }

  /** Bar units per second for `n` bots of one team on the stage. */
  private rate(n: number): number {
    const r = this.rules.capture.rateByCount;
    return r[Math.min(n, r.length - 1)] / this.rules.capture.setSec;
  }

  private capture(opening: BandstandOpening, team: Team, capturers: number[], t: number): void {
    const bots = this.match.bearbots;
    opening.captureSec = round(t * this.tickDt, 2);
    opening.team = team;
    opening.capturers = [...capturers];

    // The Encore: every living bot of the team, refreshed (not stacked) if it already had one.
    bots.forEach((b, i) => {
      if (b.team === team && b.alive) {
        this.encoreUntil[i] = t + this.encoreTicks;
        opening.encore.push(i);
      }
    });

    // Gold and XP, only through the economy's sink (`src/ruleset/rewards.ts`).
    const sink = rewardSinkOf(this.match);
    if (sink) {
      const eco = this.rules.economy;
      bots.forEach((b, i) => {
        if (b.team === team && eco.goldTeam > 0) sink.gold(i, eco.goldTeam, 'bandstand-team', t);
      });
      if (capturers.length && eco.goldLocalPool > 0) {
        const each = Math.floor(eco.goldLocalPool / capturers.length);
        const rest = eco.goldLocalPool - each * capturers.length;
        capturers.forEach((i, k) => sink.gold(i, each + (k === 0 ? rest : 0), 'bandstand-local', t));
      }
      if (eco.xpCapturer > 0) for (const i of capturers) sink.xp(i, eco.xpCapturer, 'bandstand', t);
      opening.rewarded = true;
    }

    this.scheduleNext(t);
  }

  /**
   * Close the stage (taken, or river-2's close timer); the next opening is at the other site, unless
   * it would come too late (then the site stays the last one, which is what a `done` observation shows).
   */
  private scheduleNext(t: number): void {
    this.bar = 0;
    this.openTick = null;
    const next = t + this.afterCaptureTicks;
    this.nextOpenTick = next <= this.lastOpenTick ? next : null;
    this.status = this.nextOpenTick === null ? 'done' : 'closed';
    if (this.nextOpenTick !== null) this.siteIndex = (this.siteIndex + 1) % this.rules.sites.length;
  }

  /** Seconds until the next opening, whole and rounded up; null when open or done. */
  opensInSec(tick = this.tickNow()): number | null {
    if (this.status === 'open' || this.nextOpenTick === null) return null;
    return Math.max(0, Math.ceil((this.nextOpenTick - tick) / this.hz));
  }

  /** Seconds of Encore bot `i` has left at `tick`, one decimal; 0 = none. */
  encoreSec(i: number, tick = this.tickNow()): number {
    const until = this.encoreUntil[i];
    return until !== null && tick < until ? round((until - tick) / this.hz, 1) : 0;
  }

  /** The `bandstand` block as a bot of `team` sees it (`botIndex` null: a spectator, e.g. the viewer). */
  view(team: Team, botIndex: number | null): BandstandView {
    const sign = team === 'violet' ? 1 : -1;
    const open = this.status === 'open';
    return {
      site: this.site.id,
      pos: { x: this.site.x, y: this.site.y },
      radius: this.rules.radius,
      status: this.status,
      opensInSec: this.opensInSec(),
      progress: open ? round(this.bar * sign, 2) + 0 : 0,
      contested: open && this.onStage.violet.length > 0 && this.onStage.green.length > 0,
      alliesOn: this.onStage[team].length,
      selfOn: botIndex !== null && this.onStage[team].includes(botIndex),
    };
  }

  /** Extend the observation the sim built for bot `obs.self.id` (a new object; the sim's is untouched). */
  observe(obs: Observation): ObjectiveObservation {
    const tick = this.tickNow();
    const index = new Map(this.match.bearbots.map((b, i) => [b.id, i]));
    const self = index.get(obs.self.id) ?? null;
    const enc = (id: string) => {
      const i = index.get(id);
      return i === undefined ? 0 : this.encoreSec(i, tick);
    };
    return {
      ...obs,
      self: { ...obs.self, encoreSec: self === null ? 0 : this.encoreSec(self, tick) },
      allies: obs.allies.map((a) => ({ ...a, encoreSec: enc(a.id) })),
      visibleEnemies: obs.visibleEnemies.map((e) => (e.kind === 'bearbot' ? { ...e, encore: enc(e.id) > 0 } : e)),
      bandstand: this.view(obs.self.team, self),
    };
  }

  /** The objective's part of a replay checkpoint: everything that decides what it does next. */
  checkpoint(): unknown[] {
    return [
      STATUS_CODE[this.status],
      this.siteIndex,
      round(this.bar, 4),
      this.nextOpenTick ?? -1,
      this.encoreUntil.map((u) => u ?? -1),
      // river-2 only, so a river-1 checkpoint is exactly what it was.
      ...(this.closeTicks ? [this.openTick ?? -1] : []),
    ];
  }

  summary(): ObjectiveSummary {
    const captures: Record<Team, number> = { violet: 0, green: 0 };
    for (const o of this.openings) if (o.team) captures[o.team] += 1;
    return { name: this.rules.name, openings: this.openings.map((o) => ({ ...o, capturers: [...o.capturers], encore: [...o.encore] })), captures };
  }
}

/** The specimen's private members this layer reaches, exactly as `headless.ts` reaches `tick`. */
type Steppable = { tick(dt: number): void };
type PilotStates = Map<string, { pilot: { decide(obs: Observation): Promise<unknown> } }>;

/**
 * Attach `rules` to a match that has not ticked yet: after `applyMapVariant`, and after the economy
 * when there is one. Wraps the instance's `tick` (sim first, then the objective) and every pilot's
 * `decide` (the observation gains the objective's fields), and registers the Encore with the shared
 * stat derivation.
 */
export function attachObjective(match: Match, rules: ObjectiveRules, tickDt: number = TICK_DT): Objective {
  if (objectiveOf.has(match)) throw new Error('an objective is already attached to this match');
  const objective = new Objective(match, rules, tickDt);
  objectiveOf.set(match, objective);
  setStatMultiplier(match, 'encore', (i, key) => objective.multiplier(i, key));

  const m = match as unknown as Steppable;
  const origTick = m.tick.bind(match);
  m.tick = (dt: number) => {
    if (match.ended) return origTick(dt);
    origTick(dt);
    objective.update();
  };

  const states = (match as unknown as { pilotState: PilotStates }).pilotState;
  for (const ps of states.values()) {
    const inner = ps.pilot;
    ps.pilot = { decide: (obs: Observation) => inner.decide(objective.observe(obs)) };
  }
  return objective;
}
