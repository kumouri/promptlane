/**
 * `src/iso.ts` (docs/render-spec.md §4/§5) is pure math with no canvas/DOM dependency, so it's
 * bundled and imported straight into Node — the same trick `test_browser.mjs` uses for
 * `src/live.ts` — instead of only being exercised through a real `<canvas>`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { ROOT } from '../match/load.mjs';

async function loadIso() {
  const bundle = await build({ entryPoints: [path.join(ROOT, 'src', 'iso.ts')], absWorkingDir: ROOT, bundle: true, write: false, format: 'esm', platform: 'node', target: 'node20', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
}

const iso = await loadIso();
const { toIso, fitIso, project, groundMatrixOf, screenAngleOfWorldDir, footprintRadii, depthOf, compareDepth, stableHash, stableOffset, clusterUnits, HEIGHT_BY_KIND } = iso;

const VIOLET_BASE = { x: 100, y: 900 };
const GREEN_BASE = { x: 900, y: 100 };
const TOP_APEX = { x: 100, y: 100 };
const BOTTOM_APEX = { x: 900, y: 900 };

test('toIso: both bases sit on v = 1000 (§4 — they land at the same screen height)', () => {
  assert.equal(toIso(VIOLET_BASE).v, 1000);
  assert.equal(toIso(GREEN_BASE).v, 1000);
});

test('toIso: the river diagonal (x = y) is exactly u = 0 for its whole length', () => {
  for (const k of [0, 250, 500, 750, 1000]) assert.equal(toIso({ x: k, y: k }).u, 0);
});

test('toIso: top lane apex is the map\'s smallest v (200), bottom lane apex the largest (1800) — the two arcs (§4)', () => {
  assert.equal(toIso(TOP_APEX).v, 200);
  assert.equal(toIso(BOTTOM_APEX).v, 1800);
  assert.ok(toIso(TOP_APEX).v < toIso(VIOLET_BASE).v);
  assert.ok(toIso(BOTTOM_APEX).v > toIso(VIOLET_BASE).v);
});

test('fitIso: ky is always half of kx (2:1 iso ratio), and both scale down for a smaller canvas', () => {
  const wide = fitIso(1600, 900);
  const phone = fitIso(360, 640);
  assert.ok(wide.kx > 0 && phone.kx > 0);
  assert.ok(Math.abs(wide.ky - wide.kx * 0.5) < 1e-9);
  assert.ok(Math.abs(phone.ky - phone.kx * 0.5) < 1e-9);
  assert.ok(phone.kx < wide.kx, 'a narrow phone viewport yields a smaller scale, never a broken/negative one');
});

test('fitIso: content is vertically centered — equal margin above the tallest lifted point and below the ground plane (regression: an earlier version double-applied ISO_RATIO and left half the canvas empty)', () => {
  const w = 2000;
  const h = 1075; // chosen so kxFromWidth (1) and kxFromHeight (1) coincide at the default maxHeight (150)
  const fit = fitIso(w, h);
  const topOfContent = fit.originY - HEIGHT_BY_KIND.nexus * fit.kz; // v=0, fully lifted
  const bottomOfContent = fit.originY + 1000 * fit.ky * 2; // v=2000, ground
  const topMargin = topOfContent;
  const bottomMargin = h - bottomOfContent;
  assert.ok(Math.abs(topMargin - bottomMargin) < 1e-6, `expected symmetric margins, got top=${topMargin} bottom=${bottomMargin}`);
  assert.ok(topMargin > 0 && topMargin < h * 0.2, `margin should be a small fraction of the canvas, not half of it: ${topMargin}`);
});

test('project: both bases land at the same screen height (h=0), one at screen-left and one at screen-right', () => {
  const fit = fitIso(1200, 800);
  const violet = project(VIOLET_BASE, 0, fit);
  const green = project(GREEN_BASE, 0, fit);
  assert.ok(Math.abs(violet.y - green.y) < 1e-9);
  assert.ok(violet.x < fit.originX && green.x > fit.originX);
});

test('project: the mid lane (both bases, v=1000 for the whole path) is a straight horizontal line through screen center', () => {
  const fit = fitIso(1200, 800);
  const mid = project({ x: 100, y: 900 }, 0, fit);
  const midpoint = project({ x: 500, y: 500 }, 0, fit);
  assert.ok(Math.abs(mid.y - midpoint.y) < 1e-9);
  assert.ok(Math.abs(midpoint.x - fit.originX) < 1e-9, 'mid lane crosses the river at exact screen center');
});

test('project: lifting an entity by more h moves it strictly up the screen (smaller y), never affecting x', () => {
  const fit = fitIso(1200, 800);
  const ground = project({ x: 500, y: 500 }, 0, fit);
  const lifted = project({ x: 500, y: 500 }, 100, fit);
  assert.ok(lifted.y < ground.y);
  assert.equal(lifted.x, ground.x);
});

test('groundMatrixOf: applying the matrix by hand reproduces project(_, 0, fit) for an arbitrary point', () => {
  const fit = fitIso(1000, 700);
  const [a, b, c, d, e, f] = groundMatrixOf(fit);
  const p = { x: 317, y: 642 };
  const viaMatrix = { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
  const viaProject = project(p, 0, fit);
  assert.ok(Math.abs(viaMatrix.x - viaProject.x) < 1e-9);
  assert.ok(Math.abs(viaMatrix.y - viaProject.y) < 1e-9);
});

test('screenAngleOfWorldDir: the mid lane direction becomes exactly horizontal on screen', () => {
  const fit = fitIso(1200, 800);
  const angle = screenAngleOfWorldDir(GREEN_BASE.x - VIOLET_BASE.x, GREEN_BASE.y - VIOLET_BASE.y, fit);
  assert.ok(Math.abs(angle) < 1e-9);
});

test('footprintRadii: a shadow ellipse is squashed to the same 2:1 ratio as the camera', () => {
  const fit = fitIso(1200, 800);
  const { rx, ry } = footprintRadii(28, fit);
  assert.ok(rx > 0 && ry > 0);
  assert.ok(Math.abs(ry - rx * 0.5) < 1e-9);
});

test('depthOf / compareDepth: ascending ground depth, then kind priority, then id — never random', () => {
  const near = { pos: { x: 0, y: 0 }, kind: 'nexus', id: 'a' };
  const far = { pos: { x: 500, y: 500 }, kind: 'nexus', id: 'b' };
  assert.ok(depthOf(far.pos) > depthOf(near.pos));
  assert.ok(compareDepth(near, far) < 0);
  assert.ok(compareDepth(far, near) > 0);

  const samePos = { x: 100, y: 100 };
  const tower = { pos: samePos, kind: 'tower', id: 'z' };
  const minion = { pos: samePos, kind: 'minion', id: 'a' };
  const bearbot = { pos: samePos, kind: 'bearbot', id: 'a' };
  assert.ok(compareDepth(tower, minion) < 0, 'map furniture draws before a minion at equal depth');
  assert.ok(compareDepth(minion, bearbot) < 0, 'a minion draws before a bearbot at equal depth, so it is never hidden behind a creep');

  const a = { pos: samePos, kind: 'minion', id: 'minion-1' };
  const b = { pos: samePos, kind: 'minion', id: 'minion-2' };
  assert.ok(compareDepth(a, b) < 0);
  assert.equal(compareDepth(a, a), 0);
});

test('stableHash / stableOffset: deterministic across calls, never random, and bounded by magnitude', () => {
  assert.equal(stableHash('bot-3'), stableHash('bot-3'));
  assert.notEqual(stableHash('bot-3'), stableHash('bot-4'));
  assert.ok(stableHash('bot-3') >= 0 && stableHash('bot-3') < 1);

  const off1 = stableOffset('minion-17', 10);
  const off2 = stableOffset('minion-17', 10);
  assert.deepEqual(off1, off2, 'same id -> identical offset every frame, or units would visibly jitter');
  assert.ok(Math.hypot(off1.x, off1.y) <= 10 + 1e-9);
});

test('clusterUnits: units within the threshold group into one cluster with correct per-team counts; far units stay separate', () => {
  const units = [
    { id: 'v1', team: 'violet', pos: { x: 500, y: 500 } },
    { id: 'v2', team: 'violet', pos: { x: 510, y: 500 } },
    { id: 'g1', team: 'green', pos: { x: 520, y: 500 } },
    { id: 'lonely', team: 'green', pos: { x: 5, y: 5 } },
  ];
  const clusters = clusterUnits(units, 30);
  assert.equal(clusters.length, 2);
  const big = clusters.find((c) => c.members.length === 3);
  assert.ok(big);
  assert.equal(big.byTeam.violet, 2);
  assert.equal(big.byTeam.green, 1);
  const solo = clusters.find((c) => c.members.length === 1);
  assert.equal(solo.members[0].id, 'lonely');
});

test('clusterUnits: a tighter threshold splits the same units back apart', () => {
  const units = [
    { id: 'a', team: 'violet', pos: { x: 0, y: 0 } },
    { id: 'b', team: 'violet', pos: { x: 25, y: 0 } },
  ];
  assert.equal(clusterUnits(units, 30).length, 1);
  assert.equal(clusterUnits(units, 10).length, 2);
});
