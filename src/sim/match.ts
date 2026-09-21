import type { Action, Instrument, Lane, Observation, Pilot, PilotKind, Team, Vec2 } from '../types';
import { Rng } from '../rng';
import { BASE, LANES, LANE_PATHS, dist, otherTeam, pointAlongPath, towerSpawns } from './map';
import {
  Bearbot,
  INSTRUMENTS,
  Minion,
  Nexus,
  Tower,
  Unit,
  makeBearbot,
  makeMinion,
  makeNexus,
  makeTower,
} from './entities';

const TICK_HZ = 20;
export const TICK_DT = 1 / TICK_HZ;
const MATCH_DURATION_SEC = 10 * 60;
const MINION_WAVE_INTERVAL_SEC = 30;
const PILOT_DECISION_INTERVAL_SEC = 0.5;
const VISION_RADIUS = 260;
const AGGRO_RADIUS = 130;
const RECALL_SPEED_MULT = 3;
const SLOW_MULT = 0.5;

export interface RosterSlot {
  team: Team;
  lane: Lane;
  instrument: Instrument;
  pilotKind: PilotKind;
  makePilot: (bot: Bearbot) => Pilot;
}

export interface PromptTrace {
  prompt: string;
  reply: string;
  action: Action | null;
  atSec: number;
}

interface PilotState {
  pilot: Pilot;
  pilotKind: PilotKind;
  nextDecisionAt: number;
  pending: boolean;
  currentAction: Action;
}

export type MatchEndReason = 'nexus' | 'timeout' | null;

export class Match {
  readonly bearbots: Bearbot[] = [];
  readonly minions: Minion[] = [];
  readonly towers: Tower[] = [];
  readonly nexuses: Nexus[] = [];
  readonly promptTrace = new Map<string, PromptTrace>();

  clockSec = 0;
  running = false;
  ended = false;
  winner: Team | null = null;
  endReason: MatchEndReason = null;

  private rng: Rng;
  private waveTimer = MINION_WAVE_INTERVAL_SEC;
  private pilotState = new Map<string, PilotState>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private onChange: (() => void) | null = null;

  constructor(seed: number, roster: RosterSlot[]) {
    this.rng = new Rng(seed);

    for (const team of ['violet', 'green'] as Team[]) {
      this.nexuses.push(makeNexus(team, BASE[team]));
    }
    for (const spawn of towerSpawns()) {
      this.towers.push(makeTower(spawn.team, spawn.lane, spawn.tier, spawn.pos));
    }
    for (const slot of roster) {
      const spawnPos = pointAlongPath(LANE_PATHS[slot.lane], slot.team === 'violet' ? 0.08 : 0.92);
      const bot = makeBearbot(slot.team, slot.lane, slot.instrument, spawnPos);
      this.bearbots.push(bot);
      this.pilotState.set(bot.id, {
        pilot: slot.makePilot(bot),
        pilotKind: slot.pilotKind,
        nextDecisionAt: 0,
        pending: false,
        currentAction: { kind: 'hold' },
      });
    }
  }

  onUpdate(cb: () => void): void {
    this.onChange = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => this.tick(TICK_DT), 1000 / TICK_HZ);
  }

  stop(): void {
    this.running = false;
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  getPilotKind(botId: string): PilotKind | undefined {
    return this.pilotState.get(botId)?.pilotKind;
  }

  private tick(dt: number): void {
    if (this.ended) return;
    this.clockSec += dt;

    this.pollPilots();
    this.updateMinionWaves(dt);
    this.updateBearbots(dt);
    this.updateMinions(dt);
    this.updateTowers(dt);
    this.checkWinConditions();

    this.onChange?.();
  }

  // --- pilots -----------------------------------------------------------

  private pollPilots(): void {
    for (const bot of this.bearbots) {
      if (!bot.alive) continue;
      const ps = this.pilotState.get(bot.id)!;
      if (ps.pending || this.clockSec < ps.nextDecisionAt) continue;
      ps.pending = true;
      const obs = this.observe(bot);
      ps.pilot
        .decide(obs)
        .then((action) => {
          ps.currentAction = action;
        })
        .catch(() => {
          ps.currentAction = { kind: 'hold' };
        })
        .finally(() => {
          ps.pending = false;
          ps.nextDecisionAt = this.clockSec + PILOT_DECISION_INTERVAL_SEC;
        });
    }
  }

  recordPromptTrace(botId: string, trace: PromptTrace): void {
    this.promptTrace.set(botId, trace);
  }

  // --- observation --------------------------------------------------------

  observe(bot: Bearbot): Observation {
    const enemyTeam = otherTeam(bot.team);
    const cooldowns: Record<string, number> = {};
    for (const [k, v] of Object.entries(bot.cooldowns)) cooldowns[k] = Math.round(v * 10) / 10;

    const allies = this.bearbots
      .filter((b) => b.team === bot.team && b.id !== bot.id && b.alive)
      .map((b) => ({ id: b.id, pos: b.pos, hp: b.hp, maxHp: b.maxHp }));

    const visibleEnemies: Observation['visibleEnemies'] = [];
    for (const b of this.bearbots) {
      if (b.team !== enemyTeam || !b.alive) continue;
      if (dist(bot.pos, b.pos) <= VISION_RADIUS) {
        visibleEnemies.push({ id: b.id, pos: b.pos, hp: b.hp, maxHp: b.maxHp, kind: 'bearbot' });
      }
    }
    for (const m of this.minions) {
      if (m.team !== enemyTeam || !m.alive) continue;
      if (dist(bot.pos, m.pos) <= VISION_RADIUS) {
        visibleEnemies.push({ id: m.id, pos: m.pos, hp: m.hp, maxHp: m.maxHp, kind: 'minion' });
      }
    }
    for (const t of this.towers) {
      if (t.team !== enemyTeam || !t.alive) continue;
      if (dist(bot.pos, t.pos) <= VISION_RADIUS) {
        visibleEnemies.push({ id: t.id, pos: t.pos, hp: t.hp, maxHp: t.maxHp, kind: 'tower' });
      }
    }
    for (const n of this.nexuses) {
      if (n.team !== enemyTeam || !n.alive) continue;
      if (dist(bot.pos, n.pos) <= VISION_RADIUS) {
        visibleEnemies.push({ id: n.id, pos: n.pos, hp: n.hp, maxHp: n.maxHp, kind: 'nexus' });
      }
    }

    const nearbyMinions = this.minions
      .filter((m) => m.alive && dist(bot.pos, m.pos) <= VISION_RADIUS)
      .map((m) => ({ id: m.id, team: m.team, pos: m.pos, hp: m.hp, maxHp: m.maxHp }));

    const nearbyTowers = this.towers
      .filter((t) => dist(bot.pos, t.pos) <= VISION_RADIUS * 1.5)
      .map((t) => ({ id: t.id, team: t.team, lane: t.lane, pos: t.pos, hp: t.hp, maxHp: t.maxHp, alive: t.alive }));

    return {
      clockSec: Math.round(this.clockSec),
      self: {
        id: bot.id,
        team: bot.team,
        lane: bot.lane,
        instrument: bot.instrument,
        pos: bot.pos,
        hp: bot.hp,
        maxHp: bot.maxHp,
        moveSpeed: bot.moveSpeed,
        cooldowns,
      },
      allies,
      visibleEnemies,
      nearbyMinions,
      nearbyTowers,
    };
  }

  private findUnit(id: string): Unit | undefined {
    return (
      this.bearbots.find((b) => b.id === id) ??
      this.minions.find((m) => m.id === id) ??
      this.towers.find((t) => t.id === id) ??
      this.nexuses.find((n) => n.id === id)
    );
  }

  // --- bearbots -------------------------------------------------------------

  private updateBearbots(dt: number): void {
    for (const bot of this.bearbots) {
      if (!bot.alive) continue;
      for (const k of Object.keys(bot.cooldowns)) bot.cooldowns[k] = Math.max(0, bot.cooldowns[k] - dt);
      bot.attackTimer = Math.max(0, bot.attackTimer - dt);

      const ps = this.pilotState.get(bot.id)!;
      const action = ps.currentAction;
      const speed = bot.moveSpeed * (this.clockSec < bot.buffs.slowUntil ? SLOW_MULT : 1) * (this.clockSec < bot.buffs.soloUntil ? 1.6 : 1);

      if (action.kind === 'recall') {
        bot.recalling = true;
      } else if (action.kind !== 'hold') {
        bot.recalling = false;
      }

      if (bot.recalling) {
        this.stepToward(bot.pos, BASE[bot.team], speed * RECALL_SPEED_MULT, dt);
        if (dist(bot.pos, BASE[bot.team]) < 20) {
          bot.hp = bot.maxHp;
          bot.recalling = false;
          ps.currentAction = { kind: 'hold' };
        }
        continue;
      }

      switch (action.kind) {
        case 'move': {
          const target = this.resolveVec2(action.target);
          if (target) this.stepToward(bot.pos, target, speed, dt);
          break;
        }
        case 'attack': {
          const targetUnit = typeof action.target === 'string' ? this.findUnit(action.target) : undefined;
          if (targetUnit && targetUnit.alive) {
            this.approachAndAttack(bot, targetUnit, speed, dt);
          }
          break;
        }
        case 'ability': {
          this.tryUseAbility(bot, action);
          break;
        }
        case 'hold':
        default:
          break;
      }
    }
  }

  private resolveVec2(target: Action['target']): Vec2 | null {
    if (!target) return null;
    if (typeof target === 'string') {
      const unit = this.findUnit(target);
      return unit ? unit.pos : null;
    }
    return target;
  }

  private approachAndAttack(bot: Bearbot, target: Unit, speed: number, dt: number): void {
    const d = dist(bot.pos, target.pos);
    if (d > bot.attackRange) {
      this.stepToward(bot.pos, target.pos, speed, dt);
      return;
    }
    if (bot.attackTimer <= 0) {
      target.hp -= bot.attackDamage;
      bot.attackTimer = bot.attackCooldownSec;
      this.checkDeath(target);
    }
  }

  private tryUseAbility(bot: Bearbot, action: Action): void {
    const def = INSTRUMENTS[bot.instrument];
    const ability = def.abilities.find((a) => a.name === action.ability);
    if (!ability || bot.cooldowns[ability.name] > 0) return;

    const targetUnit = typeof action.target === 'string' ? this.findUnit(action.target) : undefined;

    switch (ability.effect) {
      case 'stab': {
        if (targetUnit && dist(bot.pos, targetUnit.pos) <= ability.range) {
          targetUnit.hp -= ability.damage ?? 0;
          this.checkDeath(targetUnit);
          bot.cooldowns[ability.name] = ability.cooldownSec;
        }
        break;
      }
      case 'aoe-burst': {
        const point = targetUnit ? targetUnit.pos : this.resolveVec2(action.target) ?? bot.pos;
        if (dist(bot.pos, point) <= ability.range) {
          this.aoeDamage(bot.team, point, ability.radius ?? 60, ability.damage ?? 0);
          bot.cooldowns[ability.name] = ability.cooldownSec;
        }
        break;
      }
      case 'taunt-slow': {
        if (targetUnit && dist(bot.pos, targetUnit.pos) <= ability.range) {
          targetUnit.hp -= ability.damage ?? 0;
          this.checkDeath(targetUnit);
          if ('buffs' in targetUnit) (targetUnit as Bearbot).buffs.slowUntil = this.clockSec + 1.5;
          bot.cooldowns[ability.name] = ability.cooldownSec;
        }
        break;
      }
      case 'aoe-slow': {
        this.applySlowAround(bot.team, bot.pos, ability.radius ?? 90, 2.5);
        bot.cooldowns[ability.name] = ability.cooldownSec;
        break;
      }
      case 'dash': {
        const point = this.resolveVec2(action.target) ?? bot.pos;
        const dx = point.x - bot.pos.x;
        const dy = point.y - bot.pos.y;
        const len = Math.hypot(dx, dy) || 1;
        const dashDist = Math.min(len, 140);
        bot.pos = { x: bot.pos.x + (dx / len) * dashDist, y: bot.pos.y + (dy / len) * dashDist };
        bot.cooldowns[ability.name] = ability.cooldownSec;
        break;
      }
      case 'solo': {
        bot.buffs.soloUntil = this.clockSec + 3;
        bot.cooldowns[ability.name] = ability.cooldownSec;
        break;
      }
    }
  }

  private aoeDamage(fromTeam: Team, point: Vec2, radius: number, damage: number): void {
    const enemy = otherTeam(fromTeam);
    for (const u of [...this.bearbots, ...this.minions, ...this.towers, ...this.nexuses]) {
      if (u.team !== enemy || !u.alive) continue;
      if (dist(u.pos, point) <= radius) {
        u.hp -= damage;
        this.checkDeath(u);
      }
    }
  }

  private applySlowAround(fromTeam: Team, point: Vec2, radius: number, seconds: number): void {
    const enemy = otherTeam(fromTeam);
    for (const b of this.bearbots) {
      if (b.team === enemy && b.alive && dist(b.pos, point) <= radius) {
        b.buffs.slowUntil = this.clockSec + seconds;
      }
    }
  }

  private stepToward(from: Vec2, to: Vec2, speed: number, dt: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const step = Math.min(len, speed * dt);
    from.x += (dx / len) * step;
    from.y += (dy / len) * step;
  }

  private checkDeath(unit: Unit): void {
    if (unit.hp <= 0 && unit.alive) {
      unit.hp = 0;
      unit.alive = false;
    }
  }

  // --- minions --------------------------------------------------------------

  private updateMinionWaves(dt: number): void {
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer += MINION_WAVE_INTERVAL_SEC;
      for (const lane of LANES) {
        for (const team of ['violet', 'green'] as Team[]) {
          for (let i = 0; i < 3; i++) {
            const m = makeMinion(team, lane);
            m.pathT = team === 'violet' ? 0 : 1;
            const jitter = i * 18;
            const basePos = pointAlongPath(LANE_PATHS[lane], m.pathT);
            m.pos = { x: basePos.x + (this.rng.next() - 0.5) * 10, y: basePos.y - jitter * (team === 'violet' ? 1 : -1) };
            this.minions.push(m);
          }
        }
      }
    }
  }

  private updateMinions(dt: number): void {
    for (const m of this.minions) {
      if (!m.alive) continue;
      m.attackTimer = Math.max(0, m.attackTimer - dt);

      const enemyTeam = otherTeam(m.team);
      const target = [...this.bearbots, ...this.minions, ...this.towers, ...this.nexuses]
        .filter((u) => u.team === enemyTeam && u.alive && dist(u.pos, m.pos) <= AGGRO_RADIUS)
        .sort((a, b) => dist(a.pos, m.pos) - dist(b.pos, m.pos))[0];

      if (target) {
        const d = dist(m.pos, target.pos);
        if (d > m.attackRange) {
          this.stepToward(m.pos, target.pos, m.moveSpeed, dt);
        } else if (m.attackTimer <= 0) {
          target.hp -= m.attackDamage;
          m.attackTimer = m.attackCooldownSec;
          this.checkDeath(target);
        }
        continue;
      }

      const dir = m.team === 'violet' ? 1 : -1;
      m.pathT = Math.max(0, Math.min(1, m.pathT + (dir * m.moveSpeed * dt) / this.laneLength(m.lane)));
      m.pos = pointAlongPath(LANE_PATHS[m.lane], m.pathT);

      if (m.pathT <= 0 || m.pathT >= 1) m.alive = false; // reached enemy base area and despawns into it
    }
    for (let i = this.minions.length - 1; i >= 0; i--) {
      if (!this.minions[i].alive) this.minions.splice(i, 1);
    }
  }

  private laneLength(lane: Lane): number {
    const path = LANE_PATHS[lane];
    let total = 0;
    for (let i = 1; i < path.length; i++) total += dist(path[i - 1], path[i]);
    return total;
  }

  // --- towers -----------------------------------------------------------------

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      if (!t.alive) continue;
      t.attackTimer = Math.max(0, t.attackTimer - dt);
      const enemyTeam = otherTeam(t.team);
      const target = [...this.minions, ...this.bearbots]
        .filter((u) => u.team === enemyTeam && u.alive && dist(u.pos, t.pos) <= t.attackRange)
        .sort((a, b) => (a.kind === 'minion' ? -1 : 1) - (b.kind === 'minion' ? -1 : 1))[0];
      if (target && t.attackTimer <= 0) {
        target.hp -= t.attackDamage;
        t.attackTimer = t.attackCooldownSec;
        this.checkDeath(target);
      }
    }
  }

  // --- win conditions -----------------------------------------------------------

  private checkWinConditions(): void {
    for (const n of this.nexuses) {
      if (!n.alive) {
        this.finish(otherTeam(n.team), 'nexus');
        return;
      }
    }
    if (this.clockSec >= MATCH_DURATION_SEC) {
      this.finish(this.decideByTiebreak(), 'timeout');
    }
  }

  private decideByTiebreak(): Team | null {
    const towersAlive: Record<Team, number> = { violet: 0, green: 0 };
    for (const t of this.towers) if (t.alive) towersAlive[t.team] += 1;
    if (towersAlive.violet !== towersAlive.green) {
      return towersAlive.violet > towersAlive.green ? 'violet' : 'green';
    }
    const nexusHp: Record<Team, number> = { violet: 0, green: 0 };
    for (const n of this.nexuses) nexusHp[n.team] = n.hp;
    if (nexusHp.violet === nexusHp.green) return null;
    return nexusHp.violet > nexusHp.green ? 'violet' : 'green';
  }

  private finish(winner: Team | null, reason: MatchEndReason): void {
    this.ended = true;
    this.winner = winner;
    this.endReason = reason;
    this.stop();
    this.onChange?.();
  }

  towersDestroyedBy(team: Team): number {
    return this.towers.filter((t) => t.team !== team && !t.alive).length;
  }
}
