/**
 * Match metrics: what a match log says about HOW the game was played, not just who won — PvP vs
 * PvE, team fights, where bearbots stand and die relative to tower coverage, and the pro-league
 * style numbers (first blood, kill participation, damage share, gold difference at fixed minutes).
 * Built for the 2026-09-30 PvP balance pass (runs/balance-pvp-2026-09-30.md) and meant for reuse
 * by the Jam and the evolution harness: `measureLog` takes any replay-verifiable match log,
 * `aggregate` folds many into per-condition and per-bot tables. The CLI is `metrics.mjs` here.
 *
 * How: the log is re-simulated exactly like `verifyReplay` (seed + recorded decisions, map variant
 * applied), and the sim is OBSERVED, never changed. The specimen keeps its damage code private, so
 * this wraps four of the match instance's own methods (bearbot attack, ability, minion update,
 * tower update) and reads every unit's hp before and after each — that attributes each point of
 * damage to a source without editing `src/sim`. The checkpoints are still compared, so a metric
 * set is only reported for a replay that reproduced the logged match (`replayOk`).
 *
 * The damage attribution itself lives in `src/attribution.ts`, shared with the economy layer.
 *
 * There is no gold in the specimen sim (no economy, no respawn: a dead bearbot stays dead). For a log
 * without an economy, gold here is a transparent PROXY, `GOLD` below: the value of what a team
 * destroyed. A log WITH an economy (`src/economy.ts`) is replayed with it attached: bots respawn and
 * can die more than once, gold is the real ledger, and `economy` carries the spec's §6.2 numbers.
 */
import type { Action, Instrument, Lane, Team, Vec2 } from '../../src/types';
import { Match, TICK_DT, type RosterSlot } from '../../src/sim/match';
import type { Bearbot, Unit } from '../../src/sim/entities';
import { WORLD_SIZE, dist, otherTeam } from '../../src/sim/map';
import { JAM_ROSTER, ReplayPilot, checkpointOf, decisionsByBot, idNumber, tickOf, type MatchLog } from '../../src/replay';
import { applyMapVariant, resolveMap, type MapVariant } from '../../src/mapVariant';
import { attachAttribution } from '../../src/attribution';
import { GOLD_SOURCES, attachEconomy, type Economy, type GoldSource } from '../../src/economy';

export { LANE_PATHS } from '../../src/sim/map';
export { towerPos } from '../../src/mapVariant';

// --- definitions (each one is a choice; the reason sits beside it) -----------------------------

/**
 * "Near a friendly bearbot". 200 ≈ the reach of the band's longest hit (keytar's chord: 180 cast
 * range + 60 blast) less a step, and ~3 s of walking at the band's 55–75 speed — an ally this
 * close can join your fight before the next decision at the Jam's 2 s cadence. Also the gank proxy:
 * there is no jungle or jungle role, so two bots of a team together is the nearest thing.
 */
export const PROXIMITY_RADIUS = 200;
/**
 * A team fight: at some moment ≥2 bots of EACH team are engaged (dealt or took bearbot damage in
 * the last `ENGAGED_WINDOW_SEC`) within 250 of one engaged bot. 250 = keytar chord reach (180 + 60),
 * rounded: the farthest one bearbot can be from another and still be in the same exchange.
 */
export const FIGHT_RADIUS = 250;
/** 3 s: the slowest basic attack is 1.3 s and the Jam's decision cadence is 2 s. */
export const ENGAGED_WINDOW_SEC = 3;
/** Fight moments less than 5 s apart are the same fight. */
export const FIGHT_MERGE_GAP_SEC = 5;
/** League's assist/kill-credit window: damage within 10 s of a death counts toward it. */
export const ASSIST_WINDOW_SEC = 10;
/**
 * Gold proxy, credited to the team that destroyed the unit. Bearbot kill 300 and tower 250 always
 * count, whoever landed the last hit (they are the losing team's loss either way). A minion counts
 * 20 only when a BEARBOT last-hit it — minions killed by minions or towers are nobody's income, as
 * in League. Values are League's own ballpark (kill 300, minion ~20, outer tower ~250 team gold).
 */
export const GOLD = { bearbot: 300, tower: 250, minionLastHit: 20 } as const;
/** Swinginess derivative window: one minion-wave interval (30 s). */
export const SWING_WINDOW_SEC = 30;
/** Heatmap cell size in world units (1000 / 25 = a 40 × 40 grid). */
export const HEAT_CELL = 25;
export const HEAT_N = Math.ceil(WORLD_SIZE / HEAT_CELL);

/** Violet's base is at (100, 900): the river (x == y) splits the map, violet's half has y > x. */
export function onOpponentSide(team: Team, p: Vec2): boolean {
  return team === 'violet' ? p.x > p.y : p.x < p.y;
}

// --- types -----------------------------------------------------------------------------------------

type SourceKind = 'bearbot' | 'minion' | 'tower';
type VictimKind = Unit['kind'];
/** Where a point sits relative to the towers alive at that moment, seen from the victim. */
export type Coverage = 'neutral' | 'victim-tower' | 'enemy-tower' | 'both';

export interface DamageEvent {
  tick: number;
  srcKind: SourceKind;
  srcTeam: Team;
  srcBot: number | null;
  victimKind: VictimKind;
  victimTeam: Team;
  victimBot: number | null;
  dmg: number;
  killed: boolean;
  pos: Vec2;
}

export interface BotMetrics {
  bot: number;
  team: Team;
  side: string;
  instrument: Instrument;
  lane: Lane;
  kills: number;
  deaths: number;
  assists: number;
  /** (kills + assists) / team kills; null when the team killed nobody. */
  killParticipation: number | null;
  damage: { pvp: number; minion: number; tower: number; nexus: number; friendly: number };
  taken: { bearbot: number; minion: number; tower: number };
  /** Share of the team's PvP (bearbot → enemy bearbot) damage; null when the team dealt none. */
  pvpDamageShare: number | null;
  /** Share of the team's damage to anything enemy; null when the team dealt none. */
  damageShare: number | null;
  goldProxy: number;
  aliveSec: number;
  /** Shares of alive time. */
  time: {
    nearFriendly: number;
    opponentSide: number;
    /** Of the time on the opponent's side, the share near a friendly bot (null: never went). */
    nearFriendlyOnOpponentSide: number | null;
    /** Dealt or took bearbot damage in the last ENGAGED_WINDOW_SEC. */
    engagedPvp: number;
    /** Not engagedPvp, but dealt damage to a minion/tower/nexus in the window. */
    engagedPve: number;
    underEnemyTower: number;
    /** Pilot intent: the share of alive time its current action targeted an enemy bearbot / a minion, tower or nexus. */
    intentPvp: number;
    intentPve: number;
  };
  firstBloodKill: boolean;
  firstBloodVictim: boolean;
}

export interface TeamFight {
  startSec: number;
  endSec: number;
  at: Vec2;
  deaths: number;
}

export interface MatchMetrics {
  file?: string;
  seed: number;
  map: string;
  sides: Record<Team, string>;
  winner: Team | null;
  endReason: string | null;
  durationMin: number;
  replayOk: boolean;
  checkpointsCompared: number;
  deaths: number;
  deathsPerMin: number;
  /** Damage per minute, all sources and victims, by kind. pvp = bearbot → enemy bearbot. */
  damagePerMin: { total: number; pvp: number; botToMinion: number; botToStructure: number; minionToBot: number; towerToBot: number; minionToMinion: number; towerToMinion: number };
  /** pvp / everything bearbots dealt to enemies. */
  pvpShareOfBotDamage: number | null;
  /** Bearbot-time shares, all six bots pooled. */
  botTime: { engagedPvp: number; engagedPve: number; nearFriendly: number; opponentSide: number; nearFriendlyOnOpponentSide: number | null; underEnemyTower: number; intentPvp: number; intentPve: number };
  goldPerMin: Record<Team, number> & { total: number };
  /**
   * Mean |d/dt (violet − green gold proxy)| per minute, the derivative taken over SWING_WINDOW_SEC
   * windows. A 1 s derivative would just be gold/min again (gold arrives in lumps, one team at a
   * time); over a wave cycle, gold both teams earn cancels and only the shift in the lead remains.
   */
  swinginess: number;
  /** swinginess / gold per minute: 0 = the teams always earned evenly, 1 = every window went one way. */
  swingRatio: number | null;
  leadChanges: number;
  goldDiffAt: Record<'3' | '6' | '9', number | null>;
  firstBlood: { team: Team; killer: number | null; victim: number; sec: number } | null;
  firstTower: { team: Team; sec: number } | null;
  towersDestroyed: Record<Team, number>;
  /** Share of all destroyed towers taken by each team (null: none fell). */
  objectiveControl: Record<Team, number | null>;
  teamFights: TeamFight[];
  teamFightsPerMin: number;
  /** PvP damage by where the VICTIM stood (coverage at that tick), as shares. */
  pvpDamageByCoverage: Record<Coverage, number> | null;
  deathsByCoverage: Record<Coverage, number>;
  deathsByKiller: Record<SourceKind, number>;
  deathSites: Array<{ sec: number; bot: number; pos: Vec2; coverage: Coverage; killerKind: SourceKind; killer: number | null }>;
  bots: BotMetrics[];
  /** The real economy's numbers (§6.2 of docs/economy-spec.md), when the log has an economy; else null. */
  economy: EconomyMetrics | null;
  /** Alive bot-ticks per HEAT_CELL cell, row-major [y][x] flattened, per team. */
  heat: Record<Team, number[]>;
}

export interface EconomyMetrics {
  ruleset: string;
  /** Everything earned, per bot per minute. */
  goldPerMinPerBot: number;
  /** The same, by ledger source. */
  goldPerMinBySource: Record<GoldSource, number>;
  /** (kill + assist + drop + first blood) ÷ all non-passive gold; null when nothing was earned. */
  pvpShareOfEarned: number | null;
  /** Items each bot owned at the end, in roster order. */
  itemsAtEnd: number[];
  /** Median over the bots that bought anything of their first purchase time; null if nobody bought. */
  firstItemSec: number | null;
  /** Median unspent gold carried into a death; null without deaths. */
  carriedAtDeath: number | null;
  /** Gold lost on death, and the part of it paid to killers. */
  lostOnDeath: number;
  paidToKillers: number;
  respawns: number;
  /** |violet − green earned at 6:00| ÷ both teams' earned then: 0 = level, 1 = one team has it all. */
  goldDiffShareAt6: number | null;
  /** 1 if the team behind in gold at 5:00 won, 0 if it lost; null if level at 5:00, a draw, or the match ended earlier. */
  comeback: number | null;
}

// --- measuring one log ---------------------------------------------------------------------------

type Steppable = { tick(dt: number): void };

const defaultFlush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const MATCH_DURATION_SEC = 600;
const MAX_TICKS = Math.ceil(MATCH_DURATION_SEC / TICK_DT) + 2;
const TEAMS: Team[] = ['violet', 'green'];

function coverageAt(match: Match, p: Vec2, victimTeam: Team): Coverage {
  let own = false;
  let enemy = false;
  for (const t of match.towers) {
    if (!t.alive || dist(t.pos, p) > t.attackRange) continue;
    if (t.team === victimTeam) own = true;
    else enemy = true;
  }
  return own && enemy ? 'both' : own ? 'victim-tower' : enemy ? 'enemy-tower' : 'neutral';
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/**
 * Re-simulate `log` and measure it. Never alters the result: the patched methods call the
 * originals with the same arguments and only read hp around them.
 */
export async function measureLog(log: MatchLog, flush: () => Promise<void> = defaultFlush, file?: string): Promise<MatchMetrics> {
  const variant: MapVariant = resolveMap(log.map);
  const byBot = decisionsByBot(log);
  const currentAction: Action[] = JAM_ROSTER.map(() => ({ kind: 'hold' }));
  let match: Match | null = null;
  let asked = 0;
  const roster: RosterSlot[] = JAM_ROSTER.map((slot, i) => ({
    ...slot,
    pilotKind: 'prompt-http',
    makePilot: () =>
      new ReplayPilot({
        decisions: byBot[i],
        idOffset: () => idNumber(match!.nexuses[0].id) - log.idBase,
        onDecision: (_d, action) => {
          asked += 1;
          currentAction[i] = action;
        },
      }),
  }));
  match = new Match(log.seed, roster);
  applyMapVariant(match, variant);
  const economy: Economy | null = log.economy ? attachEconomy(match, log.economy.ruleset, log.economy.builds, TICK_DT) : null;
  const m = match;
  const botIndex = new Map<Bearbot, number>(m.bearbots.map((b, i) => [b, i]));

  // --- damage attribution (src/attribution.ts) -------------------------------------------------
  const events: DamageEvent[] = [];
  let tickNow = 0;
  const allUnits = (): Unit[] => [...m.bearbots, ...m.minions, ...m.towers, ...m.nexuses];
  attachAttribution(m, (h) => {
    events.push({
      tick: tickNow,
      srcKind: h.srcKind,
      srcTeam: h.srcTeam,
      srcBot: h.srcBot ? botIndex.get(h.srcBot) ?? null : null,
      victimKind: h.victim.kind,
      victimTeam: h.victim.team,
      victimBot: h.victim.kind === 'bearbot' ? botIndex.get(h.victim) ?? null : null,
      dmg: h.dmg,
      killed: h.killed,
      pos: h.pos,
    });
  });
  const p = m as unknown as Steppable;

  // --- per-tick accumulators ----------------------------------------------------------------
  const n = m.bearbots.length;
  const zero = () => new Array<number>(n).fill(0);
  const alive = zero(), near = zero(), opp = zero(), nearOpp = zero(), engPvp = zero(), engPve = zero(), underEnemy = zero(), intPvp = zero(), intPve = zero();
  const lastPvp = new Array<number>(n).fill(-Infinity);
  const lastPve = new Array<number>(n).fill(-Infinity);
  const heat: Record<Team, number[]> = { violet: new Array(HEAT_N * HEAT_N).fill(0), green: new Array(HEAT_N * HEAT_N).fill(0) };
  const gold: Record<Team, number> = { violet: 0, green: 0 };
  const goldDiffBySec: number[] = [0];
  const goldTotalBySec: number[] = [0];
  const fightTicks: Array<{ tick: number; at: Vec2 }> = [];
  const coverageDamage: Record<Coverage, number> = { neutral: 0, 'victim-tower': 0, 'enemy-tower': 0, both: 0 };
  const deathSites: MatchMetrics['deathSites'] = [];
  const kills = zero(), deaths = zero(), assists = zero(), goldBot = zero();
  const recentBotDamage: Array<Array<{ bot: number; tick: number }>> = m.bearbots.map(() => []);
  let firstBlood: MatchMetrics['firstBlood'] = null;
  let firstTower: MatchMetrics['firstTower'] = null;
  const towersDestroyed: Record<Team, number> = { violet: 0, green: 0 };
  const windowTicks = Math.round(ENGAGED_WINDOW_SEC / TICK_DT);
  const assistTicks = Math.round(ASSIST_WINDOW_SEC / TICK_DT);
  let eventCursor = 0;

  const kindOfTarget = (action: Action, team: Team): 'pvp' | 'pve' | null => {
    if (action.kind !== 'attack' && action.kind !== 'ability') return null;
    if (typeof action.target !== 'string') return null;
    const u = allUnits().find((x) => x.id === action.target);
    if (!u || u.team === team) return null;
    return u.kind === 'bearbot' ? 'pvp' : 'pve';
  };

  const expected = new Map(log.checkpoints.map((c) => [c.tick, c.state]));
  let compared = 0;
  let diverged = false;
  for (let tick = 0; tick < MAX_TICKS && !m.ended; tick++) {
    if (log.result.endReason === null && tickOf(m) >= log.result.ticks) break;
    asked = 0;
    tickNow = tickOf(m) + 1;
    p.tick(TICK_DT);
    if (asked > 0) await flush();
    const t = tickOf(m);
    const want = expected.get(t);
    if (want !== undefined) {
      compared += 1;
      if (want !== checkpointOf(m)) diverged = true;
    }

    // Events of this tick: engagement clocks, kills, gold, coverage.
    for (; eventCursor < events.length; eventCursor++) {
      const e = events[eventCursor];
      e.tick = t;
      const friendly = e.srcTeam === e.victimTeam;
      if (e.srcBot !== null && !friendly) {
        if (e.victimKind === 'bearbot') lastPvp[e.srcBot] = t;
        else lastPve[e.srcBot] = t;
      }
      if (e.victimBot !== null && e.srcKind === 'bearbot' && !friendly) {
        lastPvp[e.victimBot] = t;
        coverageDamage[coverageAt(m, e.pos, e.victimTeam)] += e.dmg;
        recentBotDamage[e.victimBot].push({ bot: e.srcBot!, tick: t });
      }
      if (!e.killed) continue;
      if (e.victimKind === 'bearbot') {
        const v = e.victimBot!;
        deaths[v] += 1;
        const recent = recentBotDamage[v].filter((r) => t - r.tick <= assistTicks && m.bearbots[r.bot].team !== e.victimTeam);
        // League's credit rule: the last-hitting bearbot, else the last bearbot that hit it within the window.
        const killer = e.srcKind === 'bearbot' && !friendly ? e.srcBot : recent.length ? recent[recent.length - 1].bot : null;
        recentBotDamage[v] = []; // a respawned bot's next death is credited afresh
        const team = otherTeam(e.victimTeam);
        gold[team] += GOLD.bearbot;
        if (killer !== null) {
          kills[killer] += 1;
          goldBot[killer] += GOLD.bearbot;
        }
        for (const a of new Set(recent.map((r) => r.bot))) if (a !== killer) assists[a] += 1;
        const coverage = coverageAt(m, e.pos, e.victimTeam);
        deathSites.push({ sec: t * TICK_DT, bot: v, pos: e.pos, coverage, killerKind: e.srcKind, killer });
        if (!firstBlood) firstBlood = { team, killer, victim: v, sec: t * TICK_DT };
      } else if (e.victimKind === 'tower') {
        const team = otherTeam(e.victimTeam);
        towersDestroyed[team] += 1;
        gold[team] += GOLD.tower;
        if (e.srcBot !== null) goldBot[e.srcBot] += GOLD.tower;
        if (!firstTower) firstTower = { team, sec: t * TICK_DT };
      } else if (e.victimKind === 'minion' && e.srcKind === 'bearbot' && !friendly) {
        gold[e.srcTeam] += GOLD.minionLastHit;
        goldBot[e.srcBot!] += GOLD.minionLastHit;
      }
    }

    // Positions.
    const engaged: number[] = [];
    m.bearbots.forEach((b, i) => {
      if (!b.alive) return;
      alive[i] += 1;
      const cx = Math.min(HEAT_N - 1, Math.max(0, Math.floor(b.pos.x / HEAT_CELL)));
      const cy = Math.min(HEAT_N - 1, Math.max(0, Math.floor(b.pos.y / HEAT_CELL)));
      heat[b.team][cy * HEAT_N + cx] += 1;
      const isNear = m.bearbots.some((o, j) => j !== i && o.alive && o.team === b.team && dist(o.pos, b.pos) <= PROXIMITY_RADIUS);
      if (isNear) near[i] += 1;
      if (onOpponentSide(b.team, b.pos)) {
        opp[i] += 1;
        if (isNear) nearOpp[i] += 1;
      }
      if (t - lastPvp[i] <= windowTicks) {
        engPvp[i] += 1;
        engaged.push(i);
      } else if (t - lastPve[i] <= windowTicks) engPve[i] += 1;
      if (m.towers.some((tw) => tw.alive && tw.team !== b.team && dist(tw.pos, b.pos) <= tw.attackRange)) underEnemy[i] += 1;
      const intent = b.recalling ? null : kindOfTarget(currentAction[i], b.team);
      if (intent === 'pvp') intPvp[i] += 1;
      else if (intent === 'pve') intPve[i] += 1;
    });

    // Team fight: ≥2 engaged per team within FIGHT_RADIUS of one engaged bot.
    for (const a of engaged) {
      const close = engaged.filter((j) => dist(m.bearbots[j].pos, m.bearbots[a].pos) <= FIGHT_RADIUS);
      const per = { violet: 0, green: 0 };
      for (const j of close) per[m.bearbots[j].team] += 1;
      if (per.violet >= 2 && per.green >= 2) {
        const at = close.reduce((s, j) => ({ x: s.x + m.bearbots[j].pos.x / close.length, y: s.y + m.bearbots[j].pos.y / close.length }), { x: 0, y: 0 });
        fightTicks.push({ tick: t, at });
        break;
      }
    }

    if (economy) {
      // The real ledger replaces the proxy: everything each team has earned so far.
      for (const team of TEAMS) gold[team] = 0;
      economy.bots.forEach((e, i) => {
        const earned = GOLD_SOURCES.reduce((s, k) => s + e.earned[k], 0);
        gold[m.bearbots[i].team] += earned;
        goldBot[i] = earned;
      });
    }
    if (t % Math.round(1 / TICK_DT) === 0) {
      goldDiffBySec.push(gold.violet - gold.green);
      goldTotalBySec.push(gold.violet + gold.green);
    }
  }

  // --- fold ------------------------------------------------------------------------------------
  const durationSec = tickOf(m) * TICK_DT;
  const durationMin = durationSec / 60;
  const perMin = (x: number) => (durationMin > 0 ? x / durationMin : 0);

  const fights: TeamFight[] = [];
  const mergeTicks = Math.round(FIGHT_MERGE_GAP_SEC / TICK_DT);
  for (const f of fightTicks) {
    const last = fights[fights.length - 1];
    if (last && f.tick * TICK_DT - last.endSec <= mergeTicks * TICK_DT) last.endSec = f.tick * TICK_DT;
    else fights.push({ startSec: f.tick * TICK_DT, endSec: f.tick * TICK_DT, at: { x: Math.round(f.at.x), y: Math.round(f.at.y) }, deaths: 0 });
  }
  for (const d of deathSites) {
    const f = fights.find((x) => d.sec >= x.startSec && d.sec <= x.endSec + ENGAGED_WINDOW_SEC);
    if (f) f.deaths += 1;
  }

  const sum = (pred: (e: DamageEvent) => boolean) => events.reduce((s, e) => (pred(e) ? s + e.dmg : s), 0);
  const enemy = (e: DamageEvent) => e.srcTeam !== e.victimTeam;
  const pvp = sum((e) => enemy(e) && e.srcKind === 'bearbot' && e.victimKind === 'bearbot');
  const botToMinion = sum((e) => enemy(e) && e.srcKind === 'bearbot' && e.victimKind === 'minion');
  const botToStructure = sum((e) => enemy(e) && e.srcKind === 'bearbot' && (e.victimKind === 'tower' || e.victimKind === 'nexus'));

  const bots: BotMetrics[] = m.bearbots.map((b, i) => {
    const mine = (pred: (e: DamageEvent) => boolean) => sum((e) => e.srcBot === i && pred(e));
    const dmg = {
      pvp: mine((e) => enemy(e) && e.victimKind === 'bearbot'),
      minion: mine((e) => enemy(e) && e.victimKind === 'minion'),
      tower: mine((e) => enemy(e) && e.victimKind === 'tower'),
      nexus: mine((e) => enemy(e) && e.victimKind === 'nexus'),
      friendly: mine((e) => !enemy(e)),
    };
    const teamBots = m.bearbots.map((o, j) => j).filter((j) => m.bearbots[j].team === b.team);
    const teamPvp = sum((e) => e.srcBot !== null && teamBots.includes(e.srcBot) && enemy(e) && e.victimKind === 'bearbot');
    const teamAll = sum((e) => e.srcBot !== null && teamBots.includes(e.srcBot) && enemy(e));
    const teamKills = m.bearbots.reduce((s, o, j) => (o.team !== b.team ? s + deaths[j] : s), 0);
    const a = alive[i];
    return {
      bot: i,
      team: b.team,
      side: log.sides[b.team].name,
      instrument: b.instrument,
      lane: b.lane,
      kills: kills[i],
      deaths: deaths[i],
      assists: assists[i],
      killParticipation: ratio(kills[i] + assists[i], teamKills),
      damage: dmg,
      taken: {
        bearbot: sum((e) => e.victimBot === i && e.srcKind === 'bearbot' && enemy(e)),
        minion: sum((e) => e.victimBot === i && e.srcKind === 'minion'),
        tower: sum((e) => e.victimBot === i && e.srcKind === 'tower'),
      },
      pvpDamageShare: ratio(dmg.pvp, teamPvp),
      damageShare: ratio(dmg.pvp + dmg.minion + dmg.tower + dmg.nexus, teamAll),
      goldProxy: goldBot[i],
      aliveSec: a * TICK_DT,
      time: {
        nearFriendly: ratio(near[i], a) ?? 0,
        opponentSide: ratio(opp[i], a) ?? 0,
        nearFriendlyOnOpponentSide: ratio(nearOpp[i], opp[i]),
        engagedPvp: ratio(engPvp[i], a) ?? 0,
        engagedPve: ratio(engPve[i], a) ?? 0,
        underEnemyTower: ratio(underEnemy[i], a) ?? 0,
        intentPvp: ratio(intPvp[i], a) ?? 0,
        intentPve: ratio(intPve[i], a) ?? 0,
      },
      firstBloodKill: firstBlood !== null && firstBlood.killer === i,
      firstBloodVictim: firstBlood !== null && firstBlood.victim === i,
    };
  });

  const pooled = (num: number[], den: number[]) => ratio(num.reduce((s, x) => s + x, 0), den.reduce((s, x) => s + x, 0));
  let variation = 0;
  for (let k = SWING_WINDOW_SEC; k < goldDiffBySec.length; k += SWING_WINDOW_SEC) variation += Math.abs(goldDiffBySec[k] - goldDiffBySec[k - SWING_WINDOW_SEC]);
  const swingSpanMin = (Math.floor((goldDiffBySec.length - 1) / SWING_WINDOW_SEC) * SWING_WINDOW_SEC) / 60;
  const swinginess = swingSpanMin > 0 ? variation / swingSpanMin : 0;
  let leadChanges = 0;
  let lastSign = 0;
  for (let k = 1; k < goldDiffBySec.length; k++) {
    const s = Math.sign(goldDiffBySec[k]);
    if (s !== 0) {
      if (lastSign !== 0 && s !== lastSign) leadChanges += 1;
      lastSign = s;
    }
  }
  const diffAt = (min: number) => (goldDiffBySec.length > min * 60 ? goldDiffBySec[min * 60] : null);
  const totalTowers = towersDestroyed.violet + towersDestroyed.green;
  const coverageTotal = Object.values(coverageDamage).reduce((s, x) => s + x, 0);
  const deathsByCoverage: Record<Coverage, number> = { neutral: 0, 'victim-tower': 0, 'enemy-tower': 0, both: 0 };
  const deathsByKiller: Record<SourceKind, number> = { bearbot: 0, minion: 0, tower: 0 };
  for (const d of deathSites) {
    deathsByCoverage[d.coverage] += 1;
    deathsByKiller[d.killerKind] += 1;
  }
  const totalDeaths = deaths.reduce((s, x) => s + x, 0);
  const economyMetrics = economy ? measureEconomy(economy, durationMin, m.winner, goldDiffBySec, goldTotalBySec) : null;

  return {
    ...(file ? { file } : {}),
    seed: log.seed,
    map: variant.name,
    sides: { violet: log.sides.violet.name, green: log.sides.green.name },
    winner: m.winner,
    endReason: m.endReason,
    durationMin,
    replayOk: !diverged && (log.result.endReason === null || (m.winner === log.result.winner && tickOf(m) === log.result.ticks)),
    checkpointsCompared: compared,
    deaths: totalDeaths,
    deathsPerMin: perMin(totalDeaths),
    damagePerMin: {
      total: perMin(sum(() => true)),
      pvp: perMin(pvp),
      botToMinion: perMin(botToMinion),
      botToStructure: perMin(botToStructure),
      minionToBot: perMin(sum((e) => e.srcKind === 'minion' && e.victimKind === 'bearbot')),
      towerToBot: perMin(sum((e) => e.srcKind === 'tower' && e.victimKind === 'bearbot')),
      minionToMinion: perMin(sum((e) => e.srcKind === 'minion' && e.victimKind === 'minion')),
      towerToMinion: perMin(sum((e) => e.srcKind === 'tower' && e.victimKind === 'minion')),
    },
    pvpShareOfBotDamage: ratio(pvp, pvp + botToMinion + botToStructure),
    botTime: {
      engagedPvp: pooled(engPvp, alive) ?? 0,
      engagedPve: pooled(engPve, alive) ?? 0,
      nearFriendly: pooled(near, alive) ?? 0,
      opponentSide: pooled(opp, alive) ?? 0,
      nearFriendlyOnOpponentSide: pooled(nearOpp, opp),
      underEnemyTower: pooled(underEnemy, alive) ?? 0,
      intentPvp: pooled(intPvp, alive) ?? 0,
      intentPve: pooled(intPve, alive) ?? 0,
    },
    goldPerMin: { violet: perMin(gold.violet), green: perMin(gold.green), total: perMin(gold.violet + gold.green) },
    swinginess,
    swingRatio: ratio(swinginess, perMin(gold.violet + gold.green)),
    leadChanges,
    goldDiffAt: { '3': diffAt(3), '6': diffAt(6), '9': diffAt(9) },
    firstBlood,
    firstTower,
    towersDestroyed,
    objectiveControl: { violet: ratio(towersDestroyed.violet, totalTowers), green: ratio(towersDestroyed.green, totalTowers) },
    teamFights: fights,
    teamFightsPerMin: perMin(fights.length),
    pvpDamageByCoverage: coverageTotal > 0 ? (Object.fromEntries(Object.entries(coverageDamage).map(([k, v]) => [k, v / coverageTotal])) as Record<Coverage, number>) : null,
    deathsByCoverage,
    deathsByKiller,
    deathSites,
    bots,
    economy: economyMetrics,
    heat,
  };
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

function measureEconomy(economy: Economy, durationMin: number, winner: Team | null, diffBySec: number[], totalBySec: number[]): EconomyMetrics {
  const n = economy.bots.length;
  const perBotMin = (x: number) => (durationMin > 0 ? x / n / durationMin : 0);
  const bySource = Object.fromEntries(GOLD_SOURCES.map((k) => [k, economy.bots.reduce((s, e) => s + e.earned[k], 0)])) as Record<GoldSource, number>;
  const total = GOLD_SOURCES.reduce((s, k) => s + bySource[k], 0);
  const pvp = bySource.kill + bySource.assist + bySource.drop + bySource['first-blood'];
  const firstBuy = new Map<number, number>();
  const carried: number[] = [];
  let lost = 0;
  let paid = 0;
  let respawns = 0;
  for (const ev of economy.events) {
    if (ev.kind === 'buy' && !firstBuy.has(ev.bot)) firstBuy.set(ev.bot, ev.tick * TICK_DT);
    if (ev.kind === 'death') {
      carried.push(ev.carried);
      lost += ev.loss;
      paid += ev.paid;
    }
    if (ev.kind === 'respawn') respawns += 1;
  }
  const at6 = diffBySec.length > 360 ? diffBySec[360] : null;
  const total6 = totalBySec.length > 360 ? totalBySec[360] : null;
  const lead5 = diffBySec.length > 300 ? Math.sign(diffBySec[300]) : 0;
  const behind5: Team | null = lead5 > 0 ? 'green' : lead5 < 0 ? 'violet' : null;
  return {
    ruleset: economy.ruleset.name,
    goldPerMinPerBot: perBotMin(total),
    goldPerMinBySource: Object.fromEntries(GOLD_SOURCES.map((k) => [k, perBotMin(bySource[k])])) as Record<GoldSource, number>,
    pvpShareOfEarned: ratio(pvp, total - bySource.passive),
    itemsAtEnd: economy.bots.map((e) => e.items.length),
    firstItemSec: median([...firstBuy.values()]),
    carriedAtDeath: median(carried),
    lostOnDeath: lost,
    paidToKillers: paid,
    respawns,
    goldDiffShareAt6: at6 !== null && total6 ? Math.abs(at6) / total6 : null,
    comeback: behind5 && winner ? (winner === behind5 ? 1 : 0) : null,
  };
}

// --- aggregation ---------------------------------------------------------------------------------

const mean = (xs: Array<number | null | undefined>): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export interface BotAggregate {
  /** `${side}/${instrument}` — a prompt playing one position. */
  key: string;
  side: string;
  instrument: Instrument;
  matches: number;
  values: Record<string, number | null>;
  /** values − the mean of every bot of the same instrument in the condition ("vs others in their position"). */
  vsPosition: Record<string, number | null>;
}

export interface ConditionAggregate {
  label: string;
  matches: number;
  replayOk: number;
  match: Record<string, number | null>;
  bots: BotAggregate[];
  positions: Record<string, Record<string, number | null>>;
  heat: Record<Team, number[]>;
  deathSites: MatchMetrics['deathSites'];
  teamFights: number;
}

/** Per-bot numbers compared across positions. */
function botValues(b: BotMetrics, mm: MatchMetrics): Record<string, number | null> {
  const per = (x: number) => (mm.durationMin > 0 ? x / mm.durationMin : 0);
  return {
    kills: b.kills,
    deaths: b.deaths,
    assists: b.assists,
    killParticipation: b.killParticipation,
    pvpDamagePerMin: per(b.damage.pvp),
    pveDamagePerMin: per(b.damage.minion + b.damage.tower + b.damage.nexus),
    pvpDamageShare: b.pvpDamageShare,
    damageShare: b.damageShare,
    goldProxyPerMin: per(b.goldProxy),
    nearFriendly: b.time.nearFriendly,
    opponentSide: b.time.opponentSide,
    nearFriendlyOnOpponentSide: b.time.nearFriendlyOnOpponentSide,
    engagedPvp: b.time.engagedPvp,
    engagedPve: b.time.engagedPve,
    underEnemyTower: b.time.underEnemyTower,
    firstBloodKill: b.firstBloodKill ? 1 : 0,
    firstBloodVictim: b.firstBloodVictim ? 1 : 0,
    firstTowerTeam: mm.firstTower ? (mm.firstTower.team === b.team ? 1 : 0) : 0,
  };
}

/** One match's headline numbers, flat — what `aggregate` averages and `paired` differences. */
export function matchValues(m: MatchMetrics): Record<string, number | null> {
  const abs = (x: number | null) => (x === null ? null : Math.abs(x));
  return {
    durationMin: m.durationMin,
    decided: m.winner !== null ? 1 : 0,
    deathsPerMin: m.deathsPerMin,
    damagePerMin: m.damagePerMin.total,
    pvpDamagePerMin: m.damagePerMin.pvp,
    botToMinionPerMin: m.damagePerMin.botToMinion,
    botToStructurePerMin: m.damagePerMin.botToStructure,
    towerToBotPerMin: m.damagePerMin.towerToBot,
    minionToBotPerMin: m.damagePerMin.minionToBot,
    pvpShareOfBotDamage: m.pvpShareOfBotDamage,
    engagedPvp: m.botTime.engagedPvp,
    engagedPve: m.botTime.engagedPve,
    intentPvp: m.botTime.intentPvp,
    intentPve: m.botTime.intentPve,
    nearFriendly: m.botTime.nearFriendly,
    opponentSide: m.botTime.opponentSide,
    nearFriendlyOnOpponentSide: m.botTime.nearFriendlyOnOpponentSide,
    underEnemyTower: m.botTime.underEnemyTower,
    goldPerMin: m.goldPerMin.total,
    swinginess: m.swinginess,
    swingRatio: m.swingRatio,
    leadChanges: m.leadChanges,
    absGoldDiffAt3: abs(m.goldDiffAt['3']),
    absGoldDiffAt6: abs(m.goldDiffAt['6']),
    firstBloodRate: m.firstBlood ? 1 : 0,
    firstBloodSec: m.firstBlood ? m.firstBlood.sec : null,
    firstTowerRate: m.firstTower ? 1 : 0,
    towersDestroyed: m.towersDestroyed.violet + m.towersDestroyed.green,
    teamFightsPerMatch: m.teamFights.length,
    teamFightSec: m.teamFights.reduce((s, f) => s + f.endSec - f.startSec, 0),
    teamFightsPerMin: m.teamFightsPerMin,
    pvpDamageNeutral: m.pvpDamageByCoverage?.neutral ?? null,
    pvpDamageUnderVictimTower: m.pvpDamageByCoverage?.['victim-tower'] ?? null,
    pvpDamageUnderEnemyTower: m.pvpDamageByCoverage?.['enemy-tower'] ?? null,
    pvpDamageUnderBoth: m.pvpDamageByCoverage?.both ?? null,
    deathsUnderEnemyTower: m.deaths ? (m.deathsByCoverage['enemy-tower'] + m.deathsByCoverage.both) / m.deaths : null,
    deathsToTowers: m.deaths ? m.deathsByKiller.tower / m.deaths : null,
    // The economy's own lines (docs/economy-spec.md §6.2); null on a log without an economy.
    ecoGoldPerMinPerBot: m.economy?.goldPerMinPerBot ?? null,
    ecoPvpShareOfEarned: m.economy?.pvpShareOfEarned ?? null,
    ecoItemsPerBot: m.economy ? m.economy.itemsAtEnd.reduce((s, x) => s + x, 0) / m.economy.itemsAtEnd.length : null,
    ecoFirstItemSec: m.economy?.firstItemSec ?? null,
    ecoCarriedAtDeath: m.economy?.carriedAtDeath ?? null,
    ecoGoldDiffShareAt6: m.economy?.goldDiffShareAt6 ?? null,
    ecoComeback: m.economy?.comeback ?? null,
  };
}

export interface PairedDiff {
  /** Pairs where both matches have a value. */
  n: number;
  meanDiff: number | null;
  /** 95 % bootstrap interval of the mean paired difference (resampling pairs). */
  lo: number | null;
  hi: number | null;
  /** Pairs where `other` was higher / lower than the baseline. */
  up: number;
  down: number;
}

/** Same pairing, same seed: the key a seed-paired comparison matches on. */
export const pairKey = (m: MatchMetrics) => `${m.sides.violet}|${m.sides.green}|${m.seed}`;

/**
 * Seed-paired differences (other − baseline) per metric, with a 95 % bootstrap interval over the
 * pairs. Jev is not deterministic, so a "pair" is the same pairing and seed on both maps — the
 * seed fixes minion jitter and ids; the replies still vary, which the interval has to carry.
 */
export function paired(baseline: MatchMetrics[], other: MatchMetrics[], resamples = 10000, seed = 1): Record<string, PairedDiff> {
  const byKey = new Map(baseline.map((m) => [pairKey(m), m]));
  const pairs = other.filter((m) => byKey.has(pairKey(m))).map((m) => [matchValues(byKey.get(pairKey(m))!), matchValues(m)] as const);
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Record<string, PairedDiff> = {};
  const keys = baseline.length ? Object.keys(matchValues(baseline[0])) : [];
  for (const k of keys) {
    const d = pairs.filter(([a, b]) => a[k] !== null && b[k] !== null).map(([a, b]) => (b[k] as number) - (a[k] as number));
    if (!d.length) {
      out[k] = { n: 0, meanDiff: null, lo: null, hi: null, up: 0, down: 0 };
      continue;
    }
    const means: number[] = [];
    for (let r = 0; r < resamples; r++) {
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[Math.floor(rand() * d.length)];
      means.push(s / d.length);
    }
    means.sort((a, b) => a - b);
    out[k] = {
      n: d.length,
      meanDiff: d.reduce((s, x) => s + x, 0) / d.length,
      lo: means[Math.floor(0.025 * resamples)],
      hi: means[Math.ceil(0.975 * resamples) - 1],
      up: d.filter((x) => x > 0).length,
      down: d.filter((x) => x < 0).length,
    };
  }
  return out;
}

export function aggregate(label: string, matches: MatchMetrics[]): ConditionAggregate {
  const rows = matches.map(matchValues);
  const match: Record<string, number | null> = {};
  for (const k of rows.length ? Object.keys(rows[0]) : []) match[k] = mean(rows.map((r) => r[k]));

  const groups = new Map<string, Array<{ b: BotMetrics; m: MatchMetrics }>>();
  for (const mm of matches) for (const b of mm.bots) {
    const key = `${b.side}/${b.instrument}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ b, m: mm });
  }
  const positions: Record<string, Record<string, number | null>> = {};
  for (const inst of ['drums', 'keytar', 'violin'] as Instrument[]) {
    const rows = matches.flatMap((mm) => mm.bots.filter((b) => b.instrument === inst).map((b) => botValues(b, mm)));
    if (!rows.length) continue;
    positions[inst] = Object.fromEntries(Object.keys(rows[0]).map((k) => [k, mean(rows.map((r) => r[k]))]));
  }
  const bots: BotAggregate[] = [...groups.entries()].map(([key, rows]) => {
    const vals = rows.map(({ b, m }) => botValues(b, m));
    const values = Object.fromEntries(Object.keys(vals[0]).map((k) => [k, mean(vals.map((r) => r[k]))]));
    const pos = positions[rows[0].b.instrument];
    const vsPosition = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null || pos[k] == null ? null : v - (pos[k] as number)]));
    return { key, side: rows[0].b.side, instrument: rows[0].b.instrument, matches: rows.length, values, vsPosition };
  });
  bots.sort((a, b) => a.key.localeCompare(b.key));

  const heat: Record<Team, number[]> = { violet: new Array(HEAT_N * HEAT_N).fill(0), green: new Array(HEAT_N * HEAT_N).fill(0) };
  for (const mm of matches) for (const team of TEAMS) mm.heat[team].forEach((v, k) => (heat[team][k] += v));
  return {
    label,
    matches: matches.length,
    replayOk: matches.filter((m) => m.replayOk).length,
    match,
    bots,
    positions,
    heat,
    deathSites: matches.flatMap((m) => m.deathSites),
    teamFights: matches.reduce((s, m) => s + m.teamFights.length, 0),
  };
}
