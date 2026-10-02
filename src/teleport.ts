/**
 * The teleport, `teleport-1` (pvp-2; Ceryce's package, 2026-09-30 23:18 CT): every bearbot has one
 * extra ability, `teleport`, aimed at one of its own standing towers. It is the existing `ability`
 * action — `{ kind: 'ability', ability: 'teleport', target: '<own tower id>' }` — so no new action
 * kind reaches the translator or the arena contract.
 * - **The channel.** The bot stands where it is for `channelSec` (5 s), then lands `landOffset` units
 *   from the tower on its own base's side. Damage does not interrupt it (as in Dota, where only a
 *   stun does, and this game has none). Another action does, and so do starting a recall, the
 *   bot's death and the tower falling. Repeating the same teleport, or `hold`, keeps it going; a
 *   teleport to a different tower starts over.
 * - **It is visible.** Every pilot's observation lists every channel in progress, both teams', with
 *   its destination tower and the seconds left (`teleports`), as Dota shows a teleport's
 *   destination to the whole map.
 * - **The cooldown** is one constant, `cooldownSec`, counted from the landing, so a cancelled channel
 *   costs only the time spent standing in it. Every bot starts with it ready. It is not in the
 *   sim's `cooldowns` (that would let the Metronome shorten it and a respawn reset it).
 * - **What the bot knows.** Its own towers are its team's buildings and always known, wherever they
 *   are: `teleport.towers` lists each standing one with its hp and how many enemy bearbots are
 *   within 260 of it (a tower's sight, the bearbot vision radius).
 *
 * A ruleset layer from outside the frozen sim, the same shape as `src/recall.ts`: before the sim
 * ticks, a bot whose action is a teleport has it swapped for `hold` (the sim's own `ability` would
 * look the name up on the instrument and do nothing anyway) and its channel starts or continues;
 * after the tick, a finished channel moves the bot. It is attached inside the recall (`attachMapRules`
 * runs before `attachRecall`), so the recall layer, which runs first, cancels its own channel when
 * the action is a teleport, and this layer cancels a teleport when the recall has started one. It
 * uses no RNG and counts in ticks. The constants are in `src/teleport/teleport-1.json`, and a match
 * log records them inside its `map`.
 */
import type { Lane, Observation, Team } from './types';
import type { Match } from './sim/match';
import { TICK_DT } from './sim/match';
import { dist } from './sim/map';
import { mapGeometry } from './geometry';
import { getRecall } from './recall';

/** The ability name a pilot uses. */
export const TELEPORT_ABILITY = 'teleport';

/** The constants file's shape (`src/teleport/teleport-1.json`). A changed number is a new name. */
export interface TeleportRules {
  name: string;
  /** Seconds the bot stands channelling before it lands. */
  channelSec: number;
  /** Seconds after a landing before the next teleport can start. */
  cooldownSec: number;
  /** The landing spot: this many units from the tower toward the bot's own base. */
  landOffset: number;
}

/** A tower's sight for `teleport.towers` (the bearbot vision radius, `src/sim/match.ts` VISION_RADIUS). */
export const TOWER_SIGHT = 260;

export type TeleportEnd = 'arrive' | 'action' | 'recall' | 'death' | 'tower' | 'retarget';

export interface TeleportEvent {
  tick: number;
  bot: number;
  kind: 'start' | TeleportEnd;
  tower: string;
}

export interface TeleportSummary {
  name: string;
  /** Per bot index: channels started, and how each ended. */
  bots: Array<{ started: number } & Record<TeleportEnd, number>>;
  events: TeleportEvent[];
}

/** What a pilot sees (added to every observation of a match with the teleport). */
export interface TeleportObservation {
  teleport: {
    ready: boolean;
    /** Seconds until it is ready again; 0 = ready. */
    cooldownSec: number;
    /** This bot's own channel, if it is in one. */
    channel: { tower: string; leftSec: number } | null;
    /** This bot's team's standing towers, map-wide. */
    towers: Array<{ id: string; lane: Lane; tier: 1 | 2; hp: number; maxHp: number; enemyBearbots: number }>;
  };
  /** Every teleport channel in progress, both teams'. */
  teleports: Array<{ id: string; team: Team; tower: string; lane: Lane; leftSec: number }>;
}

type Action = { kind: string; ability?: string; target?: unknown };
type PilotStates = Map<string, { pilot: { decide(obs: Observation): Promise<unknown> }; currentAction: Action }>;
type Steppable = { tick(dt: number): void };

const teleportOf = new WeakMap<Match, Teleport>();

/** The teleport layer attached to `match`, if any. */
export function getTeleport(match: Match): Teleport | undefined {
  return teleportOf.get(match);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export class Teleport {
  /** Per bot: the first tick of its running channel and its tower; null = not channelling. */
  readonly channel: Array<{ start: number; tower: string } | null>;
  /** Per bot: the first tick it may start a teleport again. */
  readonly readyAt: number[];
  readonly events: TeleportEvent[] = [];
  private readonly channelTicks: number;
  private readonly cooldownTicks: number;
  private readonly states: PilotStates;
  private readonly hz: number;

  constructor(
    private readonly match: Match,
    readonly rules: TeleportRules,
    private readonly tickDt: number = TICK_DT,
  ) {
    this.hz = Math.round(1 / tickDt);
    this.channelTicks = Math.round(rules.channelSec * this.hz);
    this.cooldownTicks = Math.round(rules.cooldownSec * this.hz);
    this.channel = match.bearbots.map(() => null);
    this.readyAt = match.bearbots.map(() => 0);
    this.states = (match as unknown as { pilotState: PilotStates }).pilotState;
  }

  tickNow(): number {
    return Math.round(this.match.clockSec / this.tickDt);
  }

  /** A standing tower of `team` with this id, or undefined. */
  private ownTower(team: Team, id: unknown) {
    return typeof id === 'string' ? this.match.towers.find((t) => t.id === id && t.team === team && t.alive) : undefined;
  }

  private end(i: number, kind: TeleportEnd, tick: number): void {
    const c = this.channel[i]!;
    this.channel[i] = null;
    this.events.push({ tick, bot: i, kind, tower: c.tower });
  }

  /** Runs right before the sim's tick (after the recall's own step: it is attached outside this one). */
  beforeTick(): void {
    const next = this.tickNow() + 1;
    const recall = getRecall(this.match);
    this.match.bearbots.forEach((b, i) => {
      if (!b.alive) return;
      const ps = this.states.get(b.id);
      const action: Action = ps?.currentAction ?? { kind: 'hold' };
      if (this.channel[i] && recall?.channelling(i)) {
        this.end(i, 'recall', next);
        return;
      }
      if (action.kind === 'ability' && action.ability === TELEPORT_ABILITY) {
        if (ps) ps.currentAction = { kind: 'hold' };
        const tower = this.ownTower(b.team, action.target);
        const ready = next >= this.readyAt[i];
        const c = this.channel[i];
        if (c && (!tower || c.tower !== tower.id)) this.end(i, tower && ready ? 'retarget' : 'action', next);
        if (tower && ready && !this.channel[i]) {
          this.channel[i] = { start: next, tower: tower.id };
          this.events.push({ tick: next, bot: i, kind: 'start', tower: tower.id });
        }
      } else if (action.kind !== 'hold' && this.channel[i]) {
        this.end(i, 'action', next);
      }
    });
  }

  /** Runs right after the sim's tick: a finished channel lands. */
  afterTick(): void {
    const t = this.tickNow();
    const geo = mapGeometry(this.match);
    this.match.bearbots.forEach((b, i) => {
      const c = this.channel[i];
      if (!c) return;
      if (!b.alive) return this.end(i, 'death', t);
      const tower = this.ownTower(b.team, c.tower);
      if (!tower) return this.end(i, 'tower', t);
      if (t - c.start + 1 < this.channelTicks) return;
      const home = geo.base[b.team];
      const d = dist(tower.pos, home);
      const f = d > 0 ? Math.min(1, this.rules.landOffset / d) : 0;
      b.pos.x = tower.pos.x + (home.x - tower.pos.x) * f;
      b.pos.y = tower.pos.y + (home.y - tower.pos.y) * f;
      b.recalling = false;
      this.readyAt[i] = t + 1 + this.cooldownTicks;
      const ps = this.states.get(b.id);
      if (ps) ps.currentAction = { kind: 'hold' };
      this.end(i, 'arrive', t);
    });
  }

  /** Seconds of channel left for bot `i` (0 when not channelling). */
  leftSec(i: number, tick = this.tickNow()): number {
    const c = this.channel[i];
    return c ? round1(Math.max(0, c.start + this.channelTicks - 1 - tick) / this.hz) : 0;
  }

  observe(obs: Observation, tick: number): Observation & TeleportObservation {
    const i = this.match.bearbots.findIndex((b) => b.id === obs.self.id);
    const team = obs.self.team;
    const enemies = this.match.bearbots.filter((b) => b.alive && b.team !== team);
    const c = i >= 0 ? this.channel[i] : null;
    const cooldownSec = i >= 0 ? round1(Math.max(0, this.readyAt[i] - (tick + 1)) / this.hz) : 0;
    const teleports: TeleportObservation['teleports'] = [];
    this.match.bearbots.forEach((b, j) => {
      const cj = this.channel[j];
      if (!cj || !b.alive) return;
      const tw = this.match.towers.find((t) => t.id === cj.tower);
      teleports.push({ id: b.id, team: b.team, tower: cj.tower, lane: tw ? tw.lane : b.lane, leftSec: this.leftSec(j, tick) });
    });
    return {
      ...obs,
      teleport: {
        ready: cooldownSec === 0,
        cooldownSec,
        channel: c ? { tower: c.tower, leftSec: this.leftSec(i, tick) } : null,
        towers: this.match.towers
          .filter((t) => t.team === team && t.alive)
          .map((t) => ({
            id: t.id,
            lane: t.lane,
            tier: t.tier,
            hp: round1(t.hp),
            maxHp: t.maxHp,
            enemyBearbots: enemies.filter((e) => dist(e.pos, t.pos) <= TOWER_SIGHT).length,
          })),
      },
      teleports,
    };
  }

  /** The layer's part of a replay checkpoint: per bot, channel start (−1 = none) and ready tick. */
  checkpoint(): Array<[number, number]> {
    return this.channel.map((c, i) => [c ? c.start : -1, this.readyAt[i]]);
  }

  summary(): TeleportSummary {
    const zero = () => ({ started: 0, arrive: 0, action: 0, recall: 0, death: 0, tower: 0, retarget: 0 });
    const bots = this.match.bearbots.map(zero);
    for (const e of this.events) {
      if (e.kind === 'start') bots[e.bot].started += 1;
      else bots[e.bot][e.kind] += 1;
    }
    return { name: this.rules.name, bots, events: this.events.map((e) => ({ ...e })) };
  }
}

/**
 * Attach `rules` to a match that has not ticked yet: after the speed boost and before the recall
 * (`attachMapRules`). Pilots see `teleport` and `teleports` (`TeleportObservation`).
 */
export function attachTeleport(match: Match, rules: TeleportRules, tickDt: number = TICK_DT): Teleport {
  if (teleportOf.has(match)) throw new Error('a teleport is already attached to this match');
  const tp = new Teleport(match, rules, tickDt);
  teleportOf.set(match, tp);
  const m = match as unknown as Steppable;
  const origTick = m.tick.bind(match);
  m.tick = (dt: number) => {
    if (match.ended) return origTick(dt);
    tp.beforeTick();
    origTick(dt);
    tp.afterTick();
  };
  const states = (match as unknown as { pilotState: PilotStates }).pilotState;
  for (const ps of states.values()) {
    const inner = ps.pilot;
    ps.pilot = { decide: (obs: Observation) => inner.decide(tp.observe(obs, tp.tickNow())) };
  }
  return tp;
}
