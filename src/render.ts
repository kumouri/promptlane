import type { Match } from './sim/match';
import { LANE_PATHS, LANES, WORLD_SIZE, inRiver } from './sim/map';

const VIOLET = '#8e00ff';
const GREEN = '#00ff0f';

const INSTRUMENT_LETTER: Record<string, string> = { drums: 'D', keytar: 'K', violin: 'V' };

export function render(ctx: CanvasRenderingContext2D, match: Match, selectedBotId: string | null): void {
  const { canvas } = ctx;
  const scale = Math.min(canvas.width, canvas.height) / WORLD_SIZE;
  const offsetX = (canvas.width - WORLD_SIZE * scale) / 2;
  const offsetY = (canvas.height - WORLD_SIZE * scale) / 2;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  drawRiver(ctx);
  drawLanes(ctx);
  drawJungleDots(ctx);

  for (const n of match.nexuses) drawNexus(ctx, n);
  for (const t of match.towers) drawTower(ctx, t);
  for (const m of match.minions) drawMinion(ctx, m);
  for (const b of match.bearbots) drawBearbot(ctx, b, b.id === selectedBotId);

  ctx.restore();
}

function teamColor(team: string): string {
  return team === 'violet' ? VIOLET : GREEN;
}

function drawRiver(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#123';
  ctx.lineWidth = 70;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WORLD_SIZE, WORLD_SIZE);
  ctx.stroke();
  ctx.restore();
}

function drawLanes(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 46;
  ctx.lineJoin = 'round';
  for (const lane of LANES) {
    const path = LANE_PATHS[lane];
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
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

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, maxHp: number, color: string): void {
  const pct = Math.max(0, hp / maxHp);
  ctx.save();
  ctx.fillStyle = '#222';
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * pct, 5);
  ctx.restore();
}

function drawNexus(ctx: CanvasRenderingContext2D, n: Match['nexuses'][number]): void {
  ctx.save();
  ctx.fillStyle = n.alive ? teamColor(n.team) : '#222';
  ctx.beginPath();
  ctx.arc(n.pos.x, n.pos.y, n.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  drawHpBar(ctx, n.pos.x, n.pos.y - n.radius - 12, 90, n.hp, n.maxHp, teamColor(n.team));
}

function drawTower(ctx: CanvasRenderingContext2D, t: Match['towers'][number]): void {
  if (!t.alive) return;
  ctx.save();
  ctx.fillStyle = teamColor(t.team);
  const r = t.radius;
  ctx.fillRect(t.pos.x - r, t.pos.y - r, r * 2, r * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(t.pos.x - r, t.pos.y - r, r * 2, r * 2);
  ctx.restore();
  drawHpBar(ctx, t.pos.x, t.pos.y - r - 10, 46, t.hp, t.maxHp, teamColor(t.team));
}

function drawMinion(ctx: CanvasRenderingContext2D, m: Match['minions'][number]): void {
  ctx.save();
  ctx.fillStyle = teamColor(m.team);
  ctx.beginPath();
  ctx.arc(m.pos.x, m.pos.y, m.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBearbot(ctx: CanvasRenderingContext2D, b: Match['bearbots'][number], selected: boolean): void {
  if (!b.alive) return;
  ctx.save();
  ctx.fillStyle = teamColor(b.team);
  ctx.beginPath();
  ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = selected ? '#fff' : '#000';
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.stroke();

  ctx.fillStyle = '#000';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(INSTRUMENT_LETTER[b.instrument] ?? '?', b.pos.x, b.pos.y + 1);
  ctx.restore();

  drawHpBar(ctx, b.pos.x, b.pos.y - b.radius - 10, 34, b.hp, b.maxHp, teamColor(b.team));
}
