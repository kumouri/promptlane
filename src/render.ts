import type { Match } from './sim/match';
import { INSTRUMENTS } from './sim/entities';
import { LANE_PATHS, LANES, WORLD_SIZE, inRiver } from './sim/map';
import type { Lane, Vec2 } from './types';

const VIOLET = '#8e00ff';
const GREEN = '#00ff0f';

const HIT_FLASH_MS = 160;
const DEATH_FADE_MS = 360;
const CAST_PULSE_MS = 420;
const CAST_STREAK_MS = 260;

/**
 * Ability -> visual treatment (docs/render-spec.md §8): the two AoE abilities get a radial pulse
 * at the cast point, the two dashes (glissando, and violin's staccato lunge) get a directional
 * streak. kick's taunt-slow and fill's aoe-slow both also leave a status ring on whoever they
 * slow — that's drawn straight from `buffs.slowUntil` below, not from cast detection, since it's
 * about the target, not the caster.
 */
const PULSE_ABILITIES = new Set(['fill', 'chord']);
const STREAK_ABILITIES = new Set(['glissando', 'staccato']);

type Shape = 'circle' | 'square';

interface UnitFx {
  prevHp: number;
  prevAlive: boolean;
  hitFlashUntil: number;
  deathAt: number | null;
}

interface CastFx {
  ability: string;
  startedAt: number;
  fromPos: Vec2;
  toPos: Vec2;
}

interface BotFx extends UnitFx {
  prevPos: Vec2;
  prevCooldowns: Record<string, number>;
  casts: CastFx[];
}

/**
 * Hit/death/cast feedback (docs/render-spec.md §8) needs to know what just *changed*, which
 * `Match` alone can't say — it only carries current state. This holds exactly the previous
 * frame's values per entity id, plus wall-clock timestamps for the handful of transient effects
 * in flight. Not a growing animation queue: every effect's remaining life is computed from
 * `now() - startedAt`, so it stays correct even if a future replay scrub/seek jumps the clock
 * (§8's forward-looking note) — a stale entry just stops drawing once its own window passes.
 * `prune()` drops entries nothing touched this frame, so a match restart (ids reused from zero)
 * doesn't carry stale fade/flash state into the new match.
 */
export class RenderFx {
  private readonly units = new Map<string, UnitFx>();
  private readonly bots = new Map<string, BotFx>();
  private readonly clock: () => number;
  private touched = new Set<string>();

  constructor(now: () => number = () => performance.now()) {
    this.clock = now;
  }

  now(): number {
    return this.clock();
  }

  trackUnit(id: string, hp: number, alive: boolean): UnitFx {
    this.touched.add(id);
    let fx = this.units.get(id);
    if (!fx) {
      fx = { prevHp: hp, prevAlive: alive, hitFlashUntil: 0, deathAt: null };
      this.units.set(id, fx);
      return fx;
    }
    const t = this.clock();
    if (alive && hp < fx.prevHp) fx.hitFlashUntil = t + HIT_FLASH_MS;
    if (fx.prevAlive && !alive) fx.deathAt = t;
    if (alive && !fx.prevAlive) fx.deathAt = null; // id reused by a fresh match
    fx.prevHp = hp;
    fx.prevAlive = alive;
    return fx;
  }

  trackBot(b: Match['bearbots'][number]): BotFx {
    this.touched.add(b.id);
    let fx = this.bots.get(b.id);
    if (!fx) {
      fx = {
        prevHp: b.hp,
        prevAlive: b.alive,
        hitFlashUntil: 0,
        deathAt: null,
        prevPos: { ...b.pos },
        prevCooldowns: { ...b.cooldowns },
        casts: [],
      };
      this.bots.set(b.id, fx);
      return fx;
    }
    const t = this.clock();
    if (b.alive && b.hp < fx.prevHp) fx.hitFlashUntil = t + HIT_FLASH_MS;
    if (fx.prevAlive && !b.alive) fx.deathAt = t;
    if (b.alive && !fx.prevAlive) fx.deathAt = null;
    for (const def of INSTRUMENTS[b.instrument].abilities) {
      const wasOnCooldown = fx.prevCooldowns[def.name] ?? 0;
      const cur = b.cooldowns[def.name] ?? 0;
      const justCast = cur > wasOnCooldown && (PULSE_ABILITIES.has(def.name) || STREAK_ABILITIES.has(def.name));
      if (justCast) fx.casts.push({ ability: def.name, startedAt: t, fromPos: fx.prevPos, toPos: { ...b.pos } });
    }
    fx.casts = fx.casts.filter((c) => t - c.startedAt < Math.max(CAST_PULSE_MS, CAST_STREAK_MS));
    fx.prevHp = b.hp;
    fx.prevAlive = b.alive;
    fx.prevPos = { ...b.pos };
    fx.prevCooldowns = { ...b.cooldowns };
    return fx;
  }

  prune(): void {
    for (const id of this.units.keys()) if (!this.touched.has(id)) this.units.delete(id);
    for (const id of this.bots.keys()) if (!this.touched.has(id)) this.bots.delete(id);
    this.touched = new Set();
  }
}

export function render(ctx: CanvasRenderingContext2D, match: Match, selectedBotId: string | null, fx: RenderFx): void {
  const { canvas } = ctx;
  const scale = Math.min(canvas.width, canvas.height) / WORLD_SIZE;
  const offsetX = (canvas.width - WORLD_SIZE * scale) / 2;
  const offsetY = (canvas.height - WORLD_SIZE * scale) / 2;
  const t = fx.now();

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  drawRiver(ctx);
  drawLanes(ctx);
  drawJungleDots(ctx);

  for (const n of match.nexuses) drawNexus(ctx, n, fx, t);
  for (const tw of match.towers) drawTower(ctx, tw, fx, t);
  for (const m of match.minions) drawMinion(ctx, m, fx, t);
  for (const b of match.bearbots) drawBearbot(ctx, b, b.id === selectedBotId, fx, t, match.clockSec);

  ctx.restore();
  fx.prune();
}

function teamColor(team: string): string {
  return team === 'violet' ? VIOLET : GREEN;
}

function drawRiver(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#123c52';
  ctx.lineWidth = 74;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WORLD_SIZE, WORLD_SIZE);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(130,205,255,0.25)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WORLD_SIZE, WORLD_SIZE);
  ctx.stroke();
  ctx.restore();
}

function drawLanes(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#242424';
  ctx.lineWidth = 48;
  for (const lane of LANES) strokeLane(ctx, lane);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 3;
  for (const lane of LANES) strokeLane(ctx, lane);
  ctx.restore();
}

function strokeLane(ctx: CanvasRenderingContext2D, lane: Lane): void {
  const path = LANE_PATHS[lane];
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function drawJungleDots(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = '#0c0c0c';
  for (let x = 40; x < WORLD_SIZE; x += 90) {
    for (let y = 40; y < WORLD_SIZE; y += 90) {
      if (inRiver({ x, y })) continue;
      const distTop = Math.min(distToSeg(x, y, 100, 900, 100, 100), distToSeg(x, y, 100, 100, 900, 100));
      const distBottom = Math.min(distToSeg(x, y, 100, 900, 900, 900), distToSeg(x, y, 900, 900, 900, 100));
      const distMid = distToSeg(x, y, 100, 900, 900, 100);
      if (Math.min(distTop, distBottom, distMid) > 60) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Angle of the lane segment nearest `p` — used to orient a tower's silhouette along its lane. */
function nearestSegmentAngle(path: Vec2[], p: Vec2): number {
  let bestDist = Infinity;
  let bestAngle = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = distToSeg(p.x, p.y, a.x, a.y, b.x, b.y);
    if (d < bestDist) {
      bestDist = d;
      bestAngle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  return bestAngle;
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number, color: string): void {
  const pct = Math.max(0, hp / maxHp);
  ctx.save();
  ctx.fillStyle = '#222';
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * pct, 5);
  ctx.restore();
}

/** 0 (just died) .. under 1 (about to finish fading) while the death animation is in flight; null once it's done. */
function deathProgress(deathAt: number | null, t: number): number | null {
  if (deathAt === null) return null;
  const elapsed = t - deathAt;
  if (elapsed >= DEATH_FADE_MS) return null;
  return elapsed / DEATH_FADE_MS;
}

/** A dim, permanent wreckage mark left after a structure/bearbot's death-fade finishes — so "which base fell" and unit-count reads (criterion 4) stay honest instead of the unit just vanishing. */
function drawHusk(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, shape: Shape): void {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const s = r * 0.6;
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(pos.x - s, pos.y - s, s * 2, s * 2);
    ctx.strokeRect(pos.x - s, pos.y - s, s * 2, s * 2);
  }
  ctx.restore();
}

function drawHitFlash(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, shape: Shape): void {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(pos.x - r, pos.y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawStatusRing(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, dashed: boolean): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCastPulse(ctx: CanvasRenderingContext2D, pos: Vec2, color: string, progress: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 14 + progress * 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCastStreak(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2, color: string, progress: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

// --- nexus --------------------------------------------------------------------

function drawNexusShape(ctx: CanvasRenderingContext2D, n: Match['nexuses'][number], color: string, alpha: number, scale: number, t: number): void {
  const r = n.radius * scale;
  const pulse = 0.15 * Math.sin(t / 500) + 0.85;
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(n.pos.x, n.pos.y, r + 14 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(n.pos.x, n.pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(n.pos.x, n.pos.y, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNexus(ctx: CanvasRenderingContext2D, n: Match['nexuses'][number], fx: RenderFx, t: number): void {
  const ufx = fx.trackUnit(n.id, n.hp, n.alive);
  const color = teamColor(n.team);
  if (!n.alive) {
    const p = deathProgress(ufx.deathAt, t);
    if (p === null) {
      drawHusk(ctx, n.pos, n.radius, color, 'circle');
      return;
    }
    drawNexusShape(ctx, n, color, 1 - p, 1 - 0.3 * p, t);
    return;
  }
  drawNexusShape(ctx, n, color, 1, 1, t);
  if (t < ufx.hitFlashUntil) drawHitFlash(ctx, n.pos, n.radius + 5, 'circle');
  drawHpBar(ctx, n.pos.x, n.pos.y - n.radius - 12, 90, n.hp, n.maxHp, color);
}

// --- tower ----------------------------------------------------------------------

function drawTowerShape(ctx: CanvasRenderingContext2D, twr: Match['towers'][number], color: string, alpha: number, scale: number, angle: number): void {
  const r = twr.radius * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(twr.pos.x, twr.pos.y);
  ctx.rotate(angle + Math.PI / 4); // a diamond, aligned to the lane it stands in — "oriented along the lane" (§6), no elevation available in phase 1
  ctx.fillStyle = color;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(-r, -r, r * 2, r * 2);
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = '#000';
  const ir = r * 0.42;
  ctx.fillRect(-ir, -ir, ir * 2, ir * 2);
  ctx.restore();
}

function drawTower(ctx: CanvasRenderingContext2D, twr: Match['towers'][number], fx: RenderFx, t: number): void {
  const ufx = fx.trackUnit(twr.id, twr.hp, twr.alive);
  const color = teamColor(twr.team);
  const angle = nearestSegmentAngle(LANE_PATHS[twr.lane], twr.pos);
  if (!twr.alive) {
    const p = deathProgress(ufx.deathAt, t);
    if (p === null) {
      drawHusk(ctx, twr.pos, twr.radius, color, 'square');
      return;
    }
    drawTowerShape(ctx, twr, color, 1 - p, 1 - 0.4 * p, angle);
    return;
  }
  drawTowerShape(ctx, twr, color, 1, 1, angle);
  if (t < ufx.hitFlashUntil) drawHitFlash(ctx, twr.pos, twr.radius + 4, 'square');
  drawHpBar(ctx, twr.pos.x, twr.pos.y - twr.radius - 10, 46, twr.hp, twr.maxHp, color);
}

// --- minion -----------------------------------------------------------------------

function drawMinion(ctx: CanvasRenderingContext2D, m: Match['minions'][number], fx: RenderFx, t: number): void {
  const ufx = fx.trackUnit(m.id, m.hp, m.alive);
  // A dead minion is spliced out of `match.minions` the same tick it dies (sim/match.ts
  // updateMinions) — no state survives to animate a fade for, and §8's death-feedback bullet
  // calls this out for bearbots/towers "especially", not minions (§6: they're the deliberately
  // unornamented "background unit"). So minions disappear instantly, same as before phase 1.
  if (!m.alive) return;
  ctx.save();
  ctx.fillStyle = teamColor(m.team);
  ctx.beginPath();
  ctx.arc(m.pos.x, m.pos.y, m.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (t < ufx.hitFlashUntil) drawHitFlash(ctx, m.pos, m.radius + 2, 'circle');
}

// --- bearbot --------------------------------------------------------------------------

function drawBearChassis(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const earR = r * 0.32;
  const earOffset = r * 0.72;
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(pos.x + dx * earOffset, pos.y - r * 0.72, earR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Per-instrument marker (§7): 3-6 strokes on top of the shared bear chassis, not a different
 * base shape. Lane position already hints the instrument, but a bearbot leaves its lane to fight
 * constantly, so this is what keeps identity legible once it does.
 */
function drawInstrumentMarker(ctx: CanvasRenderingContext2D, instrument: 'drums' | 'keytar' | 'violin', pos: Vec2, r: number): void {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1, r * 0.12);
  switch (instrument) {
    case 'drums': {
      // a kit seen from above: a ring inside a ring — "solid/round", the tank
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'keytar': {
      // a long diagonal bar with keys crossing it — "angular/linear", the ranged mage. The keys
      // are ticks *perpendicular* to the bar (not parallel notches cut into it), and thinner than
      // the bar itself, so they read as a separate row of keys rather than thickening the bar.
      const len = r * 1.15;
      const dir = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
      const perp = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(-dir.x * (len / 2), -dir.y * (len / 2));
      ctx.lineTo(dir.x * (len / 2), dir.y * (len / 2));
      ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.06);
      for (const f of [-0.32, 0.02, 0.36]) {
        const cx = dir.x * f * len;
        const cy = dir.y * f * len;
        const tick = r * 0.32;
        ctx.beginPath();
        ctx.moveTo(cx - perp.x * tick, cy - perp.y * tick);
        ctx.lineTo(cx + perp.x * tick, cy + perp.y * tick);
        ctx.stroke();
      }
      break;
    }
    case 'violin': {
      // a narrow body with f-hole notches — "thin/curved", the assassin
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.3, r * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.12, -r * 0.24);
        ctx.quadraticCurveTo(side * r * 0.02, 0, side * r * 0.12, r * 0.24);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawBearbot(ctx: CanvasRenderingContext2D, b: Match['bearbots'][number], selected: boolean, fx: RenderFx, t: number, clockSec: number): void {
  const bfx = fx.trackBot(b);
  const color = teamColor(b.team);

  if (!b.alive) {
    const p = deathProgress(bfx.deathAt, t);
    if (p === null) {
      drawHusk(ctx, b.pos, b.radius, color, 'circle');
      return;
    }
    drawBearChassis(ctx, b.pos, b.radius * (1 - 0.35 * p), color, 1 - p);
    return;
  }

  for (const cast of bfx.casts) {
    const elapsed = t - cast.startedAt;
    if (PULSE_ABILITIES.has(cast.ability) && elapsed < CAST_PULSE_MS) {
      drawCastPulse(ctx, cast.toPos, color, elapsed / CAST_PULSE_MS);
    } else if (STREAK_ABILITIES.has(cast.ability) && elapsed < CAST_STREAK_MS) {
      drawCastStreak(ctx, cast.fromPos, cast.toPos, color, elapsed / CAST_STREAK_MS);
    }
  }

  drawBearChassis(ctx, b.pos, b.radius, color, 1);
  drawInstrumentMarker(ctx, b.instrument, b.pos, b.radius);

  ctx.save();
  ctx.strokeStyle = selected ? '#fff' : '#000';
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.beginPath();
  ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (clockSec < b.buffs.slowUntil) drawStatusRing(ctx, b.pos, b.radius, 'rgba(190,225,255,0.9)', true);
  if (clockSec < b.buffs.soloUntil) drawStatusRing(ctx, b.pos, b.radius + 3, 'rgba(255,255,255,0.9)', false);

  if (t < bfx.hitFlashUntil) drawHitFlash(ctx, b.pos, b.radius + 3, 'circle');

  drawHpBar(ctx, b.pos.x, b.pos.y - b.radius - 10, 34, b.hp, b.maxHp, color);
}
