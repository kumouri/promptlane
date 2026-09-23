import type { Match } from './sim/match';
import { INSTRUMENTS } from './sim/entities';
import { LANE_PATHS, LANES, WORLD_SIZE, inRiver } from './sim/map';
import type { Lane, Team, Vec2 } from './types';
import {
  ELEVATION_RATIO,
  HEIGHT_BY_KIND,
  clusterUnits,
  compareDepth,
  fitIso,
  footprintRadii,
  groundMatrixOf,
  project,
  screenAngleOfWorldDir,
  stableOffset,
  type DrawableKind,
  type IsoFit,
} from './iso';

const VIOLET = '#8e00ff';
const GREEN = '#00ff0f';

const HIT_FLASH_MS = 160;
const DEATH_FADE_MS = 360;
const CAST_PULSE_MS = 420;
const CAST_STREAK_MS = 260;

/** §5: units within this many world units of each other count as one cluster for the team-fight count badge. */
const CLUSTER_DIST = 70;
/** §5: past this many units in one cluster, individual silhouettes stop being legible — layer a count badge instead of trying to spread them further. */
const CLUSTER_BADGE_MIN = 6;
/** §5: the near-coincident-unit offset — small, and a stable hash of the id (never per-frame random), so overlapping minions/bearbots in a fight separate visually without misrepresenting position. */
const JITTER_MAGNITUDE = 9;

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

/** A unit queued for the depth-sorted sprite pass (docs/render-spec.md §5). `pos` is the (possibly jittered) world position used for both depth (structurally a `DepthEntry`, see iso.ts) and projection; `height` is `h(entity)` for this frame, already animated toward 0 for a unit mid-death-fade. */
interface Drawable {
  kind: DrawableKind;
  id: string;
  pos: Vec2;
  height: number;
  worldRadius: number;
  draw: (ctx: CanvasRenderingContext2D, fit: IsoFit) => void;
}

export function render(ctx: CanvasRenderingContext2D, match: Match, selectedBotId: string | null, fx: RenderFx): void {
  const { canvas } = ctx;
  const fit = fitIso(canvas.width, canvas.height);
  const t = fx.now();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ground layer (docs/render-spec.md §4): river, lanes and jungle dots are drawn with the exact
  // same world-space code as before phase 2, just under the iso projection's linear part as a
  // canvas transform instead of a uniform translate+scale — see iso.ts's file doc comment for why
  // that reproduces `project(_, 0, fit)` for every point on every path without re-deriving them.
  ctx.setTransform(...groundMatrixOf(fit));
  drawRiver(ctx);
  drawLanes(ctx);
  drawJungleDots(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const drawables: Drawable[] = [];
  for (const n of match.nexuses) drawables.push(nexusDrawable(n, fx, t));
  for (const tw of match.towers) drawables.push(towerDrawable(tw, fx, t));
  for (const m of match.minions) drawables.push(minionDrawable(m, fx, t));
  for (const b of match.bearbots) drawables.push(bearbotDrawable(b, b.id === selectedBotId, fx, t, match.clockSec));
  drawables.sort((a, b) => compareDepth(a, b));

  for (const d of drawables) {
    if (d.height > 0) drawFootprintShadow(ctx, project(d.pos, 0, fit), d.worldRadius, fit);
    d.draw(ctx, fit);
  }

  drawTeamFightBadges(ctx, match, fit);

  ctx.restore();
  fx.prune();
}

function teamColor(team: string): string {
  return team === 'violet' ? VIOLET : GREEN;
}

/** The soft ground-shadow ellipse drawn at a lifted unit's un-lifted (u,v) position (§4). */
function drawFootprintShadow(ctx: CanvasRenderingContext2D, groundPos: Vec2, worldRadius: number, fit: IsoFit): void {
  const { rx, ry } = footprintRadii(worldRadius, fit);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(groundPos.x, groundPos.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

/** Angle (world radians) of the lane segment nearest `p` — used to orient a tower's silhouette along its lane. */
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

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number, color: string, px: number): void {
  const pct = Math.max(0, hp / maxHp);
  const h = Math.max(2, 5 * px);
  ctx.save();
  ctx.fillStyle = '#222';
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * pct, h);
  ctx.restore();
}

/** 0 (just died) .. under 1 (about to finish fading) while the death animation is in flight; null once it's done. */
function deathProgress(deathAt: number | null, t: number): number | null {
  if (deathAt === null) return null;
  const elapsed = t - deathAt;
  if (elapsed >= DEATH_FADE_MS) return null;
  return elapsed / DEATH_FADE_MS;
}

/** A dim, permanent wreckage mark left after a structure/bearbot's death-fade finishes — so "which base fell" and unit-count reads (criterion 4) stay honest instead of the unit just vanishing. Drawn settled on the ground (h=0). */
function drawHusk(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, shape: Shape, px: number): void {
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.5 * px);
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

function drawHitFlash(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, shape: Shape, px: number): void {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, 3 * px);
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeRect(pos.x - r, pos.y - r, r * 2, r * 2);
  }
  ctx.restore();
}

function drawStatusRing(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, dashed: boolean, px: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 2 * px);
  if (dashed) ctx.setLineDash([4 * px, 3 * px]);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, r + 6 * px, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCastPulse(ctx: CanvasRenderingContext2D, pos: Vec2, color: string, progress: number, px: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 4 * px);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, (14 + progress * 70) * px, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCastStreak(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2, color: string, progress: number, px: number): void {
  ctx.save();
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 5 * px);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

/** Idle bob for a living bearbot (§4: "bearbot low with an idle bob") — wall-clock, purely cosmetic, never fed back into the sim. */
function bearbotHeight(t: number): number {
  const BOB_PERIOD_MS = 1400;
  const BOB_AMPLITUDE = 6;
  return HEIGHT_BY_KIND.bearbot + Math.sin((t / BOB_PERIOD_MS) * Math.PI * 2) * BOB_AMPLITUDE;
}

// --- nexus --------------------------------------------------------------------

function drawNexusShape(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, alpha: number, sizeMul: number, t: number, px: number): void {
  const rr = r * sizeMul;
  const pulse = 0.15 * Math.sin(t / 500) + 0.85;
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 6 * px);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, rr + 14 * pulse * px, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, 2 * px);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, rr * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function nexusDrawable(n: Match['nexuses'][number], fx: RenderFx, t: number): Drawable {
  const color = teamColor(n.team);
  const ufxNow = fx.trackUnit(n.id, n.hp, n.alive);
  const height = n.alive ? HEIGHT_BY_KIND.nexus : (() => {
    const p = deathProgress(ufxNow.deathAt, t);
    return p === null ? 0 : HEIGHT_BY_KIND.nexus * (1 - p);
  })();
  return {
    kind: 'nexus',
    id: n.id,
    pos: n.pos,
    height,
    worldRadius: n.radius,
    draw: (ctx, fit) => {
      const ufx = fx.trackUnit(n.id, n.hp, n.alive);
      const screenPos = project(n.pos, height, fit);
      const radiusPx = n.radius * fit.kx;
      if (!n.alive) {
        const p = deathProgress(ufx.deathAt, t);
        if (p === null) {
          drawHusk(ctx, screenPos, radiusPx, color, 'circle', fit.kx);
          return;
        }
        drawNexusShape(ctx, screenPos, radiusPx, color, 1 - p, 1 - 0.3 * p, t, fit.kx);
        return;
      }
      drawNexusShape(ctx, screenPos, radiusPx, color, 1, 1, t, fit.kx);
      if (t < ufx.hitFlashUntil) drawHitFlash(ctx, screenPos, radiusPx + 5 * fit.kx, 'circle', fit.kx);
      drawHpBar(ctx, screenPos.x, screenPos.y - radiusPx - 12 * fit.kx, 90 * fit.kx, n.hp, n.maxHp, color, fit.kx);
    },
  };
}

// --- tower ----------------------------------------------------------------------

function drawTowerShape(ctx: CanvasRenderingContext2D, pos: Vec2, r: number, color: string, alpha: number, sizeMul: number, angle: number, px: number): void {
  const rr = r * sizeMul;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle + Math.PI / 4); // a diamond, aligned to the lane it stands in — "oriented along the lane" (§6)
  ctx.fillStyle = color;
  ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, 2 * px);
  ctx.strokeRect(-rr, -rr, rr * 2, rr * 2);
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = '#000';
  const ir = rr * 0.42;
  ctx.fillRect(-ir, -ir, ir * 2, ir * 2);
  ctx.restore();
}

function towerDrawable(twr: Match['towers'][number], fx: RenderFx, t: number): Drawable {
  const color = teamColor(twr.team);
  const worldAngle = nearestSegmentAngle(LANE_PATHS[twr.lane], twr.pos);
  const ufxNow = fx.trackUnit(twr.id, twr.hp, twr.alive);
  const height = twr.alive ? HEIGHT_BY_KIND.tower : (() => {
    const p = deathProgress(ufxNow.deathAt, t);
    return p === null ? 0 : HEIGHT_BY_KIND.tower * (1 - p);
  })();
  return {
    kind: 'tower',
    id: twr.id,
    pos: twr.pos,
    height,
    worldRadius: twr.radius,
    draw: (ctx, fit) => {
      const ufx = fx.trackUnit(twr.id, twr.hp, twr.alive);
      const screenPos = project(twr.pos, height, fit);
      const radiusPx = twr.radius * fit.kx;
      const angle = screenAngleOfWorldDir(Math.cos(worldAngle), Math.sin(worldAngle), fit);
      if (!twr.alive) {
        const p = deathProgress(ufx.deathAt, t);
        if (p === null) {
          drawHusk(ctx, screenPos, radiusPx, color, 'square', fit.kx);
          return;
        }
        drawTowerShape(ctx, screenPos, radiusPx, color, 1 - p, 1 - 0.4 * p, angle, fit.kx);
        return;
      }
      drawTowerShape(ctx, screenPos, radiusPx, color, 1, 1, angle, fit.kx);
      if (t < ufx.hitFlashUntil) drawHitFlash(ctx, screenPos, radiusPx + 4 * fit.kx, 'square', fit.kx);
      drawHpBar(ctx, screenPos.x, screenPos.y - radiusPx - 10 * fit.kx, 46 * fit.kx, twr.hp, twr.maxHp, color, fit.kx);
    },
  };
}

// --- minion -----------------------------------------------------------------------

function minionDrawable(m: Match['minions'][number], fx: RenderFx, t: number): Drawable {
  const jitter = stableOffset(m.id, JITTER_MAGNITUDE);
  const renderPos = { x: m.pos.x + jitter.x, y: m.pos.y + jitter.y };
  return {
    kind: 'minion',
    id: m.id,
    pos: renderPos,
    height: 0,
    worldRadius: m.radius,
    draw: (ctx, fit) => {
      const ufx = fx.trackUnit(m.id, m.hp, m.alive);
      // A dead minion is spliced out of `match.minions` the same tick it dies (sim/match.ts
      // updateMinions) — no state survives to animate a fade for, and §8's death-feedback bullet
      // calls this out for bearbots/towers "especially", not minions (§6: they're the deliberately
      // unornamented "background unit"). So minions disappear instantly, same as before phase 1.
      if (!m.alive) return;
      const screenPos = project(renderPos, 0, fit);
      const radiusPx = m.radius * fit.kx;
      ctx.save();
      ctx.fillStyle = teamColor(m.team);
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (t < ufx.hitFlashUntil) drawHitFlash(ctx, screenPos, radiusPx + 2 * fit.kx, 'circle', fit.kx);
    },
  };
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

function bearbotDrawable(b: Match['bearbots'][number], selected: boolean, fx: RenderFx, t: number, clockSec: number): Drawable {
  const color = teamColor(b.team);
  const jitter = stableOffset(b.id, JITTER_MAGNITUDE);
  const renderPos = { x: b.pos.x + jitter.x, y: b.pos.y + jitter.y };
  const bfxNow = fx.trackBot(b);
  const height = b.alive ? bearbotHeight(t) : (() => {
    const p = deathProgress(bfxNow.deathAt, t);
    return p === null ? 0 : bearbotHeight(t) * (1 - p);
  })();
  return {
    kind: 'bearbot',
    id: b.id,
    pos: renderPos,
    height,
    worldRadius: b.radius,
    draw: (ctx, fit) => {
      const bfx = fx.trackBot(b);
      const screenPos = project(renderPos, height, fit);
      const radiusPx = b.radius * fit.kx;

      if (!b.alive) {
        const p = deathProgress(bfx.deathAt, t);
        if (p === null) {
          drawHusk(ctx, screenPos, radiusPx, color, 'circle', fit.kx);
          return;
        }
        drawBearChassis(ctx, screenPos, radiusPx * (1 - 0.35 * p), color, 1 - p);
        return;
      }

      for (const cast of bfx.casts) {
        const elapsed = t - cast.startedAt;
        const fromScreen = project(cast.fromPos, height, fit);
        const toScreen = project(cast.toPos, height, fit);
        if (PULSE_ABILITIES.has(cast.ability) && elapsed < CAST_PULSE_MS) {
          drawCastPulse(ctx, toScreen, color, elapsed / CAST_PULSE_MS, fit.kx);
        } else if (STREAK_ABILITIES.has(cast.ability) && elapsed < CAST_STREAK_MS) {
          drawCastStreak(ctx, fromScreen, toScreen, color, elapsed / CAST_STREAK_MS, fit.kx);
        }
      }

      drawBearChassis(ctx, screenPos, radiusPx, color, 1);
      drawInstrumentMarker(ctx, b.instrument, screenPos, radiusPx);

      ctx.save();
      ctx.strokeStyle = selected ? '#fff' : '#000';
      ctx.lineWidth = Math.max(1, (selected ? 3 : 1.5) * fit.kx);
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (clockSec < b.buffs.slowUntil) drawStatusRing(ctx, screenPos, radiusPx, 'rgba(190,225,255,0.9)', true, fit.kx);
      if (clockSec < b.buffs.soloUntil) drawStatusRing(ctx, screenPos, radiusPx + 3 * fit.kx, 'rgba(255,255,255,0.9)', false, fit.kx);

      if (t < bfx.hitFlashUntil) drawHitFlash(ctx, screenPos, radiusPx + 3 * fit.kx, 'circle', fit.kx);

      drawHpBar(ctx, screenPos.x, screenPos.y - radiusPx - 10 * fit.kx, 34 * fit.kx, b.hp, b.maxHp, color, fit.kx);
    },
  };
}

// --- team-fight cluster count badge (§5, acceptance criterion 4) ------------------------------

function drawClusterBadge(ctx: CanvasRenderingContext2D, pos: Vec2, byTeam: Record<Team, number>, px: number): void {
  const fontSize = Math.max(11, 13 * px);
  ctx.save();
  ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
  ctx.textBaseline = 'middle';
  const violetText = String(byTeam.violet);
  const dashText = '–';
  const greenText = String(byTeam.green);
  const violetW = ctx.measureText(violetText).width;
  const dashW = ctx.measureText(dashText).width;
  const greenW = ctx.measureText(greenText).width;
  const textWidth = violetW + dashW + greenW;
  const padX = Math.max(5, 6 * px);
  const padY = Math.max(3, 4 * px);
  const w = textWidth + padX * 2;
  const h = fontSize + padY * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(pos.x - w / 2, pos.y - h / 2, w, h);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, 1.5 * px);
  ctx.strokeRect(pos.x - w / 2, pos.y - h / 2, w, h);
  let cx = pos.x - textWidth / 2;
  ctx.fillStyle = VIOLET;
  ctx.fillText(violetText, cx, pos.y);
  cx += violetW;
  ctx.fillStyle = '#fff';
  ctx.fillText(dashText, cx, pos.y);
  cx += dashW;
  ctx.fillStyle = GREEN;
  ctx.fillText(greenText, cx, pos.y);
  ctx.restore();
}

/** §5: "consider a small stacked +N badge on the densest cluster rather than trying to keep spreading them." Individual silhouettes still draw underneath (§5's stable jitter, not clustering-aware spreading) — the badge is what actually answers acceptance criterion 4 once a cluster gets dense. */
function drawTeamFightBadges(ctx: CanvasRenderingContext2D, match: Match, fit: IsoFit): void {
  const members = [
    ...match.minions.filter((m) => m.alive).map((m) => ({ id: m.id, team: m.team, pos: m.pos })),
    ...match.bearbots.filter((b) => b.alive).map((b) => ({ id: b.id, team: b.team, pos: b.pos })),
  ];
  const clusters = clusterUnits(members, CLUSTER_DIST).filter((c) => c.members.length > CLUSTER_BADGE_MIN);
  for (const cluster of clusters) {
    const badgeHeight = HEIGHT_BY_KIND.bearbot / ELEVATION_RATIO; // sit clearly above the crowd's own lift
    const pos = project(cluster.centroid, badgeHeight, fit);
    drawClusterBadge(ctx, pos, cluster.byTeam, fit.kx);
  }
}
