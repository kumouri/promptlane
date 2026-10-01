/**
 * The Jam economy (docs/economy-spec.md §3): respawn, gold in two pools, levels, items and a shop at
 * base, applied to a `Match` from the OUTSIDE. The specimen sim (`src/sim/*`) is frozen, so this is a
 * ruleset layer in the same shape as `src/mapVariant.ts`: every place that builds a match attaches
 * it right after `applyMapVariant`, and a match log records the ruleset it was played under
 * (`MatchLog.economy`). A log without one was played without an economy, and replays unchanged.
 *
 * How it works without editing the sim:
 * - damage attribution (kill credit, last hits, lifesteal) comes from `src/attribution.ts`;
 * - the match's own `tick` is wrapped: the sim ticks, then this layer resolves that tick (§3.8);
 * - stats from levels and items are written into each bearbot's own mutable fields between ticks,
 *   through the derivation every ruleset layer shares (`src/ruleset/stats.ts`), so the river
 *   objective's Encore and this layer's levels and items multiply instead of overwriting each other;
 * - respawn sets a dead bearbot back to life between ticks; the sim polls it again on its next tick;
 * - each pilot's `decide` is wrapped so its observation carries the economy fields (§4.1);
 * - it registers the match's reward sink (`src/ruleset/rewards.ts`), which is how the river objective
 *   pays Bandstand gold and XP (§9.5): with no economy attached there is no sink, and a capture pays
 *   the Encore only.
 *
 * Every number is in the ruleset (`src/economy/eco-1.json`); nothing here is a tuning constant. The
 * layer uses no RNG and resolves everything in roster order, so a match is a function of its seed and
 * its decisions exactly as before.
 */
import type { Instrument, Observation, Team } from './types';
import type { Match } from './sim/match';
import type { Bearbot, Unit } from './sim/entities';
import { BASE, LANE_PATHS, dist, pointAlongPath } from './sim/map';
import { attachAttribution } from './attribution';
import { deriveStats, setStatMultiplier } from './ruleset/stats';
import { setRewardSink, type RewardSink } from './ruleset/rewards';
import ECO_1_JSON from './economy/eco-1.json';

/**
 * Ledger keys, one per income source. `pools.safeSources` names the ones paid into the safe pool.
 * The two `bandstand-*` keys are paid only by the river objective (§9.5), through `rewards` below.
 */
export const GOLD_SOURCES = ['passive', 'minion', 'kill', 'assist', 'drop', 'first-blood', 'tower-team', 'tower-local', 'bandstand-team', 'bandstand-local'] as const;
export type GoldSource = (typeof GOLD_SOURCES)[number];
/** The sources §6.2's pre-registered gold lines read: everything but the Bandstand's (§9.5). */
export const ECO_1_GOLD_SOURCES: readonly GoldSource[] = GOLD_SOURCES.filter((k) => !k.startsWith('bandstand-'));

export interface ItemDef {
  name: string;
  cost: number;
  gives: string;
  givesUp: string;
  /** Multipliers as fractions (+0.35 = +35 %); `pvpLifesteal` is the healed share of PvP damage. */
  mods: Partial<Record<'maxHp' | 'attackDamage' | 'moveSpeed' | 'attackCooldownSec' | 'abilityCooldown' | 'pvpLifesteal', number>>;
}

export interface EconomyRuleset {
  /** Stable name recorded in match logs. A changed number is a new name. */
  name: string;
  respawn: { baseSec: number; perLevelSec: number };
  gold: {
    start: number;
    passivePerSec: number;
    minionLastHit: number;
    kill: number;
    assistPool: number;
    firstBlood: number;
    towerTeam: number;
    towerLocalPool: number;
    towerLocalRadius: number;
    pools: { safeSources: string[] };
    /**
     * The Q2 ruling's knobs (§3.3). On a death the victim loses
     * `min(atRisk, floor(lossOfAtRisk × atRisk + lossOfNetWorth × netWorth))`, and
     * `floor(toKillers × loss)` of it is split among the killer and assisters; the rest vanishes.
     */
    death: { lossOfAtRisk: number; lossOfNetWorth: number; toKillers: number };
  };
  credit: { windowSec: number; assistRadius: number };
  xp: {
    radius: number;
    minion: number;
    kill: number;
    tower: number;
    /** Cumulative XP to reach level 1, 2, …; the length is the level cap. */
    thresholds: number[];
    perLevel: { maxHp: number; attackDamage: number };
  };
  shop: { radius: number; slots: number };
  items: Record<string, ItemDef>;
  defaultBuilds: Record<Instrument, string[]>;
}

export const ECO_1: EconomyRuleset = ECO_1_JSON as EconomyRuleset;

export const ECONOMY_RULESETS: Record<string, EconomyRuleset> = { [ECO_1.name]: ECO_1 };

/**
 * The economy new matches get when none is named: none, until Ceryce's go/no-go gate on Sun 10-04
 * (§7, ruled Q10). Matches opt in with `--economy eco-1` (CLI) or `economy` (runner, arena config).
 */
export const DEFAULT_ECONOMY: EconomyRuleset | null = null;

/** What a match log records: the whole ruleset (so a later retune can't change an old replay) and each bot's shopping list. */
export interface LogEconomy {
  ruleset: EconomyRuleset;
  /** Per roster index: the item keys this bot buys, in order. */
  builds: string[][];
}

/** Resolve a name (CLI `--economy`) or a recorded ruleset; `none`/absent = no economy. */
export function resolveEconomy(economy: string | EconomyRuleset | null | undefined): EconomyRuleset | null {
  if (economy == null || economy === 'none') return null;
  if (typeof economy !== 'string') return economy;
  const found = ECONOMY_RULESETS[economy];
  if (!found) throw new Error(`unknown economy ruleset "${economy}" (known: none, ${Object.keys(ECONOMY_RULESETS).join(', ')})`);
  return found;
}

/**
 * A bot's shopping list: the declared one cleaned (unknown and repeated items dropped, cut to the
 * slot count), or the instrument's default when nothing usable was declared. The translator already
 * validates a compiled `build` (tools/jev/economy_rules.py); this is the same rule at the last step.
 */
export function resolveBuild(ruleset: EconomyRuleset, instrument: Instrument, declared?: readonly string[] | null): string[] {
  const clean: string[] = [];
  for (const key of declared ?? []) {
    if (Object.hasOwn(ruleset.items, key) && !clean.includes(key)) clean.push(key);
  }
  const build = clean.length ? clean : ruleset.defaultBuilds[instrument] ?? [];
  return build.slice(0, ruleset.shop.slots);
}

// --- per-bot state -------------------------------------------------------------------------------

export interface BotEconomy {
  atRisk: number;
  safe: number;
  xp: number;
  level: number;
  items: string[];
  /** Index of the next item on `build`. */
  cursor: number;
  build: string[];
  /** Tick at which a dead bot comes back; null while alive. */
  respawnAtTick: number | null;
  earned: Record<GoldSource, number>;
  /** Gold lost on death, all of it (what the killers got is in their `drop`). */
  lost: number;
  kills: number;
  deaths: number;
  assists: number;
}

export type EconomyEvent =
  | { tick: number; kind: 'death'; bot: number; killer: number | null; assisters: number[]; carried: number; loss: number; paid: number; respawnAtTick: number }
  | { tick: number; kind: 'buy'; bot: number; item: string; cost: number }
  | { tick: number; kind: 'respawn'; bot: number }
  | { tick: number; kind: 'level'; bot: number; level: number }
  | { tick: number; kind: 'tower'; team: Team; local: number[] };

export interface EconomySummary {
  ruleset: string;
  bots: Array<{ gold: number; atRisk: number; safe: number; level: number; xp: number; items: string[]; earned: Record<GoldSource, number>; lost: number; kills: number; deaths: number; assists: number }>;
}

/** Fields the economy adds to an observation (§4.1). */
export interface EconomyObservation extends Observation {
  self: Observation['self'] & {
    gold: number;
    goldAtRisk: number;
    deathLoss: number;
    deathPayout: number;
    bounty: number;
    level: number;
    xp: number;
    xpToNext: number | null;
    items: string[];
    slotsFree: number;
    nextItem: { item: string; cost: number } | null;
    atShop: boolean;
  };
  allies: Array<Observation['allies'][number] & { level: number; gold: number; items: string[] }>;
  visibleEnemies: Array<Observation['visibleEnemies'][number] & { level?: number; bounty?: number; items?: string[] }>;
  respawning: Array<{ id: string; team: Team; inSec: number }>;
  shop: Array<{ item: string; cost: number }>;
}

type Steppable = { tick(dt: number): void };
type PilotStateView = { pilot: { decide(obs: Observation): Promise<unknown> }; currentAction: { kind: string } };
type PilotStates = Map<string, PilotStateView>;

const economyOf = new WeakMap<Match, Economy>();

/** The economy attached to `match`, if any (the replay checkpoint reads it). */
export function getEconomy(match: Match): Economy | undefined {
  return economyOf.get(match);
}

/** Split `amount` equally among `recipients`; the remainder goes to the first. */
function split(amount: number, recipients: number[]): Array<[number, number]> {
  if (!recipients.length || amount <= 0) return [];
  const each = Math.floor(amount / recipients.length);
  const rest = amount - each * recipients.length;
  return recipients.map((r, i) => [r, each + (i === 0 ? rest : 0)]);
}

export class Economy {
  readonly bots: BotEconomy[];
  readonly events: EconomyEvent[] = [];
  private readonly index = new Map<Bearbot, number>();
  private readonly idIndex = new Map<string, number>();
  private readonly wasAlive: boolean[];
  private readonly towerAlive: boolean[];
  private readonly prevCooldowns: Array<Record<string, number>>;
  /** Enemy-bearbot damage taken, per victim: who and when (for kill credit). */
  private readonly recent: Array<Array<{ bot: number; tick: number }>>;
  /** PvP damage dealt this tick, per bot (for lifesteal). */
  private readonly pvpDealt: number[];
  /** This tick's minion last hits (bot index) and minion deaths (team, position). */
  private lastHits: number[] = [];
  private minionDeaths: Array<{ team: Team; pos: { x: number; y: number } }> = [];
  private passivePaid = 0;
  private firstBloodTaken = false;
  private readonly tickHz: number;

  constructor(
    private readonly match: Match,
    readonly ruleset: EconomyRuleset,
    builds: string[][],
    private readonly tickDt: number,
  ) {
    this.tickHz = Math.round(1 / tickDt);
    const zero = (): Record<GoldSource, number> => Object.fromEntries(GOLD_SOURCES.map((s) => [s, 0])) as Record<GoldSource, number>;
    this.bots = match.bearbots.map((b, i) => {
      this.index.set(b, i);
      this.idIndex.set(b.id, i);
      const bot: BotEconomy = {
        atRisk: 0,
        safe: 0,
        xp: 0,
        level: 1,
        items: [],
        cursor: 0,
        build: builds[i] ?? resolveBuild(ruleset, b.instrument),
        respawnAtTick: null,
        earned: zero(),
        lost: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
      return bot;
    });
    if (ruleset.gold.start > 0) this.bots.forEach((_, i) => this.pay(i, 'passive', 0, ruleset.gold.start));
    this.wasAlive = match.bearbots.map((b) => b.alive);
    this.towerAlive = match.towers.map((t) => t.alive);
    this.prevCooldowns = match.bearbots.map((b) => ({ ...b.cooldowns }));
    this.recent = match.bearbots.map(() => []);
    this.pvpDealt = match.bearbots.map(() => 0);
  }

  // --- money ---------------------------------------------------------------------------------------

  gold(i: number): number {
    return this.bots[i].atRisk + this.bots[i].safe;
  }

  netWorth(i: number): number {
    const b = this.bots[i];
    return b.atRisk + b.safe + b.items.reduce((s, k) => s + this.ruleset.items[k].cost, 0);
  }

  /** What bot `i` would lose if it died now (§3.3). */
  deathLoss(i: number): number {
    const d = this.ruleset.gold.death;
    const b = this.bots[i];
    return Math.min(b.atRisk, Math.floor(d.lossOfAtRisk * b.atRisk + d.lossOfNetWorth * this.netWorth(i)));
  }

  /** How much of that loss the killers would get. */
  deathPayout(i: number): number {
    return Math.floor(this.ruleset.gold.death.toKillers * this.deathLoss(i));
  }

  /** What killing bot `i` pays the enemy team: kill + assist pool + payout (first blood left out). */
  bounty(i: number): number {
    return this.ruleset.gold.kill + this.ruleset.gold.assistPool + this.deathPayout(i);
  }

  private pay(i: number, source: GoldSource, _tick: number, amount: number): void {
    if (amount <= 0) return;
    const b = this.bots[i];
    if (this.ruleset.gold.pools.safeSources.includes(source)) b.safe += amount;
    else b.atRisk += amount;
    b.earned[source] += amount;
  }

  /** Spend from the at-risk pool first, then the safe pool (as in Dota). */
  private spend(i: number, amount: number): void {
    const b = this.bots[i];
    const fromRisk = Math.min(b.atRisk, amount);
    b.atRisk -= fromRisk;
    b.safe -= amount - fromRisk;
  }

  private addXp(i: number, amount: number): void {
    if (amount > 0) this.bots[i].xp += amount;
  }

  /**
   * What the river objective pays through (`src/ruleset/rewards.ts`): Bandstand gold into the pools
   * by the same `pools.safeSources` rule as every other source, and XP like any other XP. Registered
   * on the match by `attachEconomy`.
   */
  readonly rewards: RewardSink = {
    gold: (i, amount, source, tick) => this.pay(i, source, tick, amount),
    xp: (i, amount) => this.addXp(i, amount),
  };

  // --- the tick (§3.8) -----------------------------------------------------------------------------

  /** Attribution listener: remember this tick's PvP hits, last hits and minion deaths. */
  onHit(srcBot: Bearbot | null, srcTeam: Team, victim: Unit, dmg: number, killed: boolean, pos: { x: number; y: number }, tick: number): void {
    const src = srcBot ? this.index.get(srcBot) ?? null : null;
    if (victim.kind === 'bearbot') {
      const v = this.index.get(victim);
      if (v !== undefined && src !== null && srcTeam !== victim.team) {
        this.recent[v].push({ bot: src, tick });
        this.pvpDealt[src] += dmg;
      }
    } else if (victim.kind === 'minion' && killed) {
      this.minionDeaths.push({ team: victim.team, pos });
      if (src !== null && srcTeam !== victim.team) this.lastHits.push(src);
    }
  }

  /** Everything the economy does after the sim's own tick, in the spec's order. */
  afterTick(tick: number): void {
    const r = this.ruleset;
    const bb = this.match.bearbots;

    // 1. This tick's deaths: minion last hits and minion XP, then bearbots (kill credit, gold, the
    //    death loss and its payout, XP), in roster order.
    for (const i of this.lastHits) this.pay(i, 'minion', tick, r.gold.minionLastHit);
    for (const m of this.minionDeaths) {
      bb.forEach((b, i) => {
        if (b.alive && b.team !== m.team && dist(b.pos, m.pos) <= r.xp.radius) this.addXp(i, r.xp.minion);
      });
    }
    this.lastHits = [];
    this.minionDeaths = [];
    const windowTicks = Math.round(r.credit.windowSec / this.tickDt);
    bb.forEach((b, v) => {
      if (!(this.wasAlive[v] && !b.alive)) return;
      this.resolveDeath(v, tick, windowTicks);
    });

    // 2. Towers that fell this tick.
    this.match.towers.forEach((t, k) => {
      if (!(this.towerAlive[k] && !t.alive)) return;
      this.towerAlive[k] = false;
      const team: Team = t.team === 'violet' ? 'green' : 'violet';
      bb.forEach((b, i) => {
        if (b.team === team) this.pay(i, 'tower-team', tick, r.gold.towerTeam);
      });
      const local = bb.map((b, i) => i).filter((i) => bb[i].team === team && bb[i].alive && dist(bb[i].pos, t.pos) <= r.gold.towerLocalRadius);
      for (const [i, amount] of split(r.gold.towerLocalPool, local)) this.pay(i, 'tower-local', tick, amount);
      bb.forEach((b, i) => {
        if (b.team === team && b.alive && dist(b.pos, t.pos) <= r.xp.radius) this.addXp(i, r.xp.tower);
      });
      this.events.push({ tick, kind: 'tower', team, local });
    });

    // 3. Passive gold, paid in whole coins: everything owed by this tick that hasn't been paid.
    const owed = Math.floor((r.gold.passivePerSec * tick) / this.tickHz + 1e-9);
    if (owed > this.passivePaid) {
      const due = owed - this.passivePaid;
      this.passivePaid = owed;
      this.bots.forEach((_, i) => this.pay(i, 'passive', tick, due));
    }

    // 4. Level-ups.
    this.bots.forEach((e, i) => {
      const level = r.xp.thresholds.filter((x) => e.xp >= x).length;
      if (level > e.level) {
        e.level = level;
        this.events.push({ tick, kind: 'level', bot: i, level });
      }
    });

    // 5. Respawns.
    bb.forEach((b, i) => {
      const e = this.bots[i];
      if (!b.alive && e.respawnAtTick !== null && tick >= e.respawnAtTick) this.respawn(i, tick);
    });

    // 6. The shop.
    bb.forEach((b, i) => this.shopFor(i, tick));

    // 7. Stats, then lifesteal, then the Metronome's cooldown cut on any ability just cast.
    bb.forEach((b, i) => {
      if (!b.alive) return;
      this.deriveStats(i);
      const steal = this.mod(i, 'pvpLifesteal');
      if (steal > 0 && this.pvpDealt[i] > 0) b.hp = Math.min(b.maxHp, b.hp + steal * this.pvpDealt[i]);
      const cdMod = this.mod(i, 'abilityCooldown');
      for (const k of Object.keys(b.cooldowns)) {
        if (cdMod !== 0 && b.cooldowns[k] > (this.prevCooldowns[i][k] ?? 0) + 1e-9) b.cooldowns[k] *= 1 + cdMod;
      }
      this.prevCooldowns[i] = { ...b.cooldowns };
    });
    this.pvpDealt.fill(0);
    bb.forEach((b, i) => (this.wasAlive[i] = b.alive));
  }

  private resolveDeath(v: number, tick: number, windowTicks: number): void {
    const r = this.ruleset;
    const bb = this.match.bearbots;
    const victim = bb[v];
    const e = this.bots[v];
    const credited = this.recent[v].filter((h) => tick - h.tick <= windowTicks && bb[h.bot].team !== victim.team);
    // Kill credit: the last enemy bearbot that damaged the victim in the window (a minion or tower may land the blow).
    const killer = credited.length ? credited[credited.length - 1].bot : null;
    const assisters: number[] = [];
    if (killer !== null) {
      bb.forEach((b, i) => {
        if (i === killer || b.team === victim.team) return;
        const hit = credited.some((h) => h.bot === i);
        const near = b.alive && dist(b.pos, victim.pos) <= r.credit.assistRadius;
        if (hit || near) assisters.push(i);
      });
    }
    const carried = this.gold(v);
    const loss = this.deathLoss(v);
    let paid = 0;
    if (killer !== null) {
      this.pay(killer, 'kill', tick, r.gold.kill);
      if (!this.firstBloodTaken) this.pay(killer, 'first-blood', tick, r.gold.firstBlood);
      this.firstBloodTaken = true;
      for (const [i, amount] of split(r.gold.assistPool, assisters)) this.pay(i, 'assist', tick, amount);
      paid = Math.floor(r.gold.death.toKillers * loss);
    }
    e.atRisk -= loss;
    e.lost += loss;
    if (paid > 0) for (const [i, amount] of split(paid, [killer!, ...assisters])) this.pay(i, 'drop', tick, amount);
    if (killer !== null) {
      this.bots[killer].kills += 1;
      for (const i of assisters) this.bots[i].assists += 1;
      for (const i of [killer, ...assisters]) this.addXp(i, r.xp.kill);
    }
    e.deaths += 1;
    e.respawnAtTick = tick + Math.round((r.respawn.baseSec + r.respawn.perLevelSec * e.level) / this.tickDt);
    this.recent[v] = [];
    this.events.push({ tick, kind: 'death', bot: v, killer, assisters, carried, loss, paid, respawnAtTick: e.respawnAtTick });
  }

  private respawn(i: number, tick: number): void {
    const b = this.match.bearbots[i];
    const e = this.bots[i];
    const spawn = pointAlongPath(LANE_PATHS[b.lane], b.team === 'violet' ? 0.08 : 0.92);
    this.deriveStats(i);
    b.alive = true;
    b.hp = b.maxHp;
    b.pos = { x: spawn.x, y: spawn.y };
    b.recalling = false;
    b.attackTimer = 0;
    b.moveTarget = null;
    b.attackTarget = null;
    b.buffs = { soloUntil: 0, slowUntil: 0 };
    for (const k of Object.keys(b.cooldowns)) b.cooldowns[k] = 0;
    this.prevCooldowns[i] = { ...b.cooldowns };
    // The sim keeps the action a bot died with; a revived bot starts from `hold` and is asked again next tick.
    const ps = (this.match as unknown as { pilotState: PilotStates }).pilotState.get(b.id);
    if (ps) ps.currentAction = { kind: 'hold' };
    e.respawnAtTick = null;
    this.events.push({ tick, kind: 'respawn', bot: i });
  }

  atShop(i: number): boolean {
    const b = this.match.bearbots[i];
    return b.alive && dist(b.pos, BASE[b.team]) <= this.ruleset.shop.radius;
  }

  /** Position on the build of the next item to buy (items already owned are passed over), or -1. */
  private nextIndex(i: number): number {
    const e = this.bots[i];
    if (e.items.length >= this.ruleset.shop.slots) return -1;
    for (let k = e.cursor; k < e.build.length; k++) if (!e.items.includes(e.build[k])) return k;
    return -1;
  }

  nextItem(i: number): { item: string; cost: number } | null {
    const k = this.nextIndex(i);
    if (k < 0) return null;
    const item = this.bots[i].build[k];
    return { item, cost: this.ruleset.items[item].cost };
  }

  /** Buy down the list while the bot is at its shop and can afford the next item; never skip one. */
  private shopFor(i: number, tick: number): void {
    if (!this.atShop(i)) return;
    const e = this.bots[i];
    for (let k = this.nextIndex(i); k >= 0; k = this.nextIndex(i)) {
      const item = e.build[k];
      const cost = this.ruleset.items[item].cost;
      if (this.gold(i) < cost) break;
      this.spend(i, cost);
      e.items.push(item);
      e.cursor = k + 1;
      this.events.push({ tick, kind: 'buy', bot: i, item, cost });
    }
  }

  private mod(i: number, key: keyof ItemDef['mods']): number {
    return this.bots[i].items.reduce((s, k) => s + (this.ruleset.items[k].mods[key] ?? 0), 0);
  }

  /** This layer's stat multiplier, registered with the shared derivation (`src/ruleset/stats.ts`). */
  multiplier(i: number, key: 'maxHp' | 'attackDamage' | 'moveSpeed' | 'attackCooldownSec'): number {
    let m = 1;
    if (key === 'maxHp' || key === 'attackDamage') m *= 1 + this.ruleset.xp.perLevel[key] * (this.bots[i].level - 1);
    for (const k of this.bots[i].items) m *= 1 + (this.ruleset.items[k].mods[key] ?? 0);
    return m;
  }

  /**
   * `stat = instrumentBase × (1 + levelBonus) × Π(1 + itemModifier)` (§3.5), times any other layer's
   * multiplier (the river objective's Encore), written into the bot's own fields by the shared
   * derivation. A level-1 bot with no items gets its base values back exactly. Current hp moves by
   * as much as max hp does, and never below 1 for a living bot.
   */
  private deriveStats(i: number): void {
    deriveStats(this.match, i);
  }

  // --- what pilots see (§4.1) ------------------------------------------------------------------------

  observe(obs: Observation, tick: number): EconomyObservation {
    const i = this.idIndex.get(obs.self.id)!;
    const e = this.bots[i];
    const r = this.ruleset;
    const cap = r.xp.thresholds.length;
    return {
      ...obs,
      self: {
        ...obs.self,
        gold: this.gold(i),
        goldAtRisk: e.atRisk,
        deathLoss: this.deathLoss(i),
        deathPayout: this.deathPayout(i),
        bounty: this.bounty(i),
        level: e.level,
        xp: e.xp,
        xpToNext: e.level < cap ? r.xp.thresholds[e.level] - e.xp : null,
        items: [...e.items],
        slotsFree: r.shop.slots - e.items.length,
        nextItem: this.nextItem(i),
        atShop: this.atShop(i),
      },
      allies: obs.allies.map((a) => {
        const j = this.idIndex.get(a.id)!;
        return { ...a, level: this.bots[j].level, gold: this.gold(j), items: [...this.bots[j].items] };
      }),
      visibleEnemies: obs.visibleEnemies.map((v) => {
        const j = v.kind === 'bearbot' ? this.idIndex.get(v.id) : undefined;
        return j === undefined ? v : { ...v, level: this.bots[j].level, bounty: this.bounty(j), items: [...this.bots[j].items] };
      }),
      respawning: this.match.bearbots.flatMap((b, j) => {
        const at = this.bots[j].respawnAtTick;
        return !b.alive && at !== null ? [{ id: b.id, team: b.team, inSec: Math.round(Math.max(0, at - tick) * this.tickDt * 10) / 10 }] : [];
      }),
      shop: Object.entries(r.items).map(([item, def]) => ({ item, cost: def.cost })),
    };
  }

  // --- replay and reports ------------------------------------------------------------------------------

  /** Per-bot `[atRisk, safe, xp, items]` for the replay checkpoint. */
  checkpoint(): Array<[number, number, number, string]> {
    return this.bots.map((e) => [e.atRisk, e.safe, e.xp, e.items.join('+')]);
  }

  summary(): EconomySummary {
    return {
      ruleset: this.ruleset.name,
      bots: this.bots.map((e, i) => ({
        gold: this.gold(i),
        atRisk: e.atRisk,
        safe: e.safe,
        level: e.level,
        xp: e.xp,
        items: [...e.items],
        earned: { ...e.earned },
        lost: e.lost,
        kills: e.kills,
        deaths: e.deaths,
        assists: e.assists,
      })),
    };
  }
}

/**
 * Attach `ruleset` to a match that has not ticked yet (after `applyMapVariant`, and after the river
 * objective when there is one: the layer attached last wraps `tick` outermost and runs last, so the
 * objective's update lands between the sim and this layer's steps, as §3.8 and §9.6 order them).
 * `builds` is the per-roster-index shopping list a log records; missing entries use the instrument
 * default.
 */
export function attachEconomy(match: Match, ruleset: EconomyRuleset, builds: string[][], tickDt: number): Economy {
  if (economyOf.has(match)) throw new Error('an economy is already attached to this match');
  const economy = new Economy(match, ruleset, builds, tickDt);
  economyOf.set(match, economy);
  setStatMultiplier(match, 'economy', (i, key) => economy.multiplier(i, key));
  setRewardSink(match, economy.rewards);
  const tickNow = () => Math.round(match.clockSec / tickDt);

  attachAttribution(match, (h) => economy.onHit(h.srcBot, h.srcTeam, h.victim, h.dmg, h.killed, h.pos, tickNow()));

  const m = match as unknown as Steppable;
  const origTick = m.tick.bind(match);
  m.tick = (dt: number) => {
    if (match.ended) return origTick(dt);
    origTick(dt);
    economy.afterTick(tickNow());
  };

  const states = (match as unknown as { pilotState: PilotStates }).pilotState;
  for (const ps of states.values()) {
    const inner = ps.pilot;
    ps.pilot = { decide: (obs: Observation) => inner.decide(economy.observe(obs, tickNow())) };
  }
  return economy;
}

/** Each roster bot's shopping list for the log: declared lists cleaned, defaults filled in. */
export function resolveBuilds(ruleset: EconomyRuleset, instruments: readonly Instrument[], declared: Array<readonly string[] | null | undefined> = []): string[][] {
  return instruments.map((inst, i) => resolveBuild(ruleset, inst, declared[i]));
}
