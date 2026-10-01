/**
 * Map variants (`src/mapVariant.ts`) and match metrics (`metrics.ts` / `metrics.mjs`), on the
 * game's deterministic mock model — no server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { flush, loadHeadless, loadMetrics } from './load.mjs';
import { encodePng, markdown, parseArgs, renderHeatmap } from './metrics.mjs';

const headless = await loadHeadless();
const metrics = await loadMetrics();

const sides = {
  violet: { name: 'ann', promptFile: 'ann.md', promptText: 'ann' },
  green: { name: 'bo', promptFile: 'bo.md', promptText: 'bo' },
};
const mockMatch = (opts = {}) =>
  headless.runMatch({ seed: 7, sides, callModelFor: (i) => headless.mockCallModel(100 + i), cadenceSec: 2, maxSimSec: 240, backend: { kind: 'mock' }, flush, ...opts });

const v1Log = await mockMatch({ map: 'v1' });
const pvpLog = await mockMatch({ map: 'pvp-1' });

// --- map variants -----------------------------------------------------------------------------

test('the specimen map is the sim\'s own: no neutral lane stretch, outer towers overlap in every lane', () => {
  const cov = headless.laneCoverage(headless.SPECIMEN_MAP);
  assert.equal(cov.length, 3);
  for (const lane of cov) {
    assert.equal(lane.neutralLength, 0, lane.lane);
    assert.ok(lane.overlapLength > 100, `${lane.lane} overlap ${lane.overlapLength}`);
    assert.ok(Math.abs(lane.circleGap - -139) < 1, `${lane.lane} gap ${lane.circleGap}`);
  }
});

test('the PvP map leaves a neutral stretch in every lane and keeps tower range at keytar range', () => {
  assert.equal(headless.PVP_MAP.towerRange, 160);
  const cov = headless.laneCoverage(headless.PVP_MAP);
  for (const lane of cov) {
    assert.ok(lane.neutralLength > 100, `${lane.lane} neutral ${lane.neutralLength}`);
    assert.equal(lane.overlapLength, 0);
  }
  assert.ok(Math.abs(cov.find((c) => c.lane === 'mid').neutralLength - 132) < 2);
});

test('a specimen-map log carries no map field and is unchanged; a variant log records its variant', async () => {
  assert.equal('map' in v1Log, false);
  assert.deepEqual(pvpLog.map, headless.PVP_MAP);
  assert.throws(() => headless.resolveMap('nope'), /unknown map variant/);
  assert.equal(headless.resolveMap(undefined), headless.SPECIMEN_MAP);
  assert.equal(headless.DEFAULT_MAP, headless.PVP_MAP);
  assert.deepEqual((await mockMatch({ maxSimSec: 5 })).map, headless.PVP_MAP, 'no map option = DEFAULT_MAP, recorded');
});

test('both maps replay-verify, and replaying a variant log on the wrong map diverges', async () => {
  assert.equal((await headless.verifyReplay(v1Log, flush)).ok, true);
  assert.equal((await headless.verifyReplay(pvpLog, flush)).ok, true);
  const { map, ...stripped } = pvpLog;
  assert.ok(map);
  const wrong = await headless.verifyReplay(stripped, flush);
  assert.equal(wrong.ok, false, 'the map variant must change the match, or it is not applied');
});

// --- metrics ------------------------------------------------------------------------------------

const mm = await metrics.measureLog(v1Log, flush, 'v1.json');
const mp = await metrics.measureLog(pvpLog, flush, 'pvp.json');

test('measuring is observation only: the replay still reproduces the log', () => {
  assert.equal(mm.replayOk, true);
  assert.equal(mp.replayOk, true);
  assert.ok(mm.checkpointsCompared > 40);
  assert.equal(mm.map, 'v1');
  assert.equal(mp.map, 'pvp-1');
});

test('every logged death is measured once, credited or executed', () => {
  for (const [log, m] of [[v1Log, mm], [pvpLog, mp]]) {
    assert.equal(m.deaths, log.result.deaths.length);
    assert.equal(m.deathSites.length, log.result.deaths.length);
    assert.deepEqual(m.deathSites.map((d) => d.bot).sort(), log.result.deaths.map((d) => d.bot).sort());
    const kills = m.bots.reduce((s, b) => s + b.kills, 0);
    assert.ok(kills <= m.deaths);
    assert.equal(Object.values(m.deathsByKiller).reduce((s, x) => s + x, 0), m.deaths);
    assert.equal(Object.values(m.deathsByCoverage).reduce((s, x) => s + x, 0), m.deaths);
    if (log.result.deaths.length) {
      assert.equal(m.firstBlood.victim, log.result.deaths[0].bot);
      assert.equal(m.firstBlood.team, log.result.deaths[0].bot < 3 ? 'green' : 'violet');
    }
  }
});

test('damage adds up: per-bot PvP sums to the match PvP, shares sum to 1 per team', () => {
  const minutes = mm.durationMin;
  const botPvp = mm.bots.reduce((s, b) => s + b.damage.pvp, 0);
  assert.ok(Math.abs(botPvp - mm.damagePerMin.pvp * minutes) < 1e-6);
  for (const team of ['violet', 'green']) {
    const shares = mm.bots.filter((b) => b.team === team).map((b) => b.pvpDamageShare);
    if (shares.every((s) => s !== null)) assert.ok(Math.abs(shares.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  }
  assert.ok(mm.pvpShareOfBotDamage > 0 && mm.pvpShareOfBotDamage < 1);
  const takenFromBots = mm.bots.reduce((s, b) => s + b.taken.bearbot, 0);
  assert.ok(Math.abs(takenFromBots - botPvp) < 1e-6, 'damage dealt to enemy bots = damage enemy bots took from bots');
});

test('heat counts every alive bot-tick, and time shares are shares', () => {
  const ticks = mm.bots.reduce((s, b) => s + b.aliveSec, 0) / v1Log.tickDt;
  const heat = mm.heat.violet.reduce((s, x) => s + x, 0) + mm.heat.green.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(heat - ticks) < 1e-6);
  assert.equal(mm.heat.violet.length, metrics.HEAT_N * metrics.HEAT_N);
  for (const b of mm.bots) for (const [k, v] of Object.entries(b.time)) if (v !== null) assert.ok(v >= 0 && v <= 1, `${k}=${v}`);
});

test('opponent side is split by the river', () => {
  assert.equal(metrics.onOpponentSide('violet', { x: 900, y: 100 }), true);
  assert.equal(metrics.onOpponentSide('violet', { x: 100, y: 900 }), false);
  assert.equal(metrics.onOpponentSide('green', { x: 100, y: 900 }), true);
});

test('gold proxy: team gold covers every kill and tower; swing ratio is bounded', () => {
  const towers = mm.towersDestroyed.violet + mm.towersDestroyed.green;
  const total = mm.goldPerMin.total * mm.durationMin;
  assert.ok(total >= mm.deaths * metrics.GOLD.bearbot + towers * metrics.GOLD.tower - 1e-6);
  if (mm.swingRatio !== null) assert.ok(mm.swingRatio >= 0 && mm.swingRatio <= 1 + 1e-9);
});

test('aggregate: per-condition means, and "vs position" is relative to every bot in that position', () => {
  const agg = metrics.aggregate('both', [mm, mp]);
  assert.equal(agg.matches, 2);
  assert.equal(agg.replayOk, 2);
  assert.ok(Math.abs(agg.match.deathsPerMin - (mm.deathsPerMin + mp.deathsPerMin) / 2) < 1e-9);
  for (const inst of ['drums', 'keytar', 'violin']) {
    const rows = agg.bots.filter((b) => b.instrument === inst);
    assert.equal(rows.length, 2); // ann/<inst> and bo/<inst>
    // Two equal-sized groups: their deviations from the position mean cancel.
    assert.ok(Math.abs(rows[0].vsPosition.kills + rows[1].vsPosition.kills) < 1e-9);
  }
  const md = markdown([agg]);
  assert.match(md, /\| deaths \/ min \|/);
  assert.match(md, /ann\/drums/);
});

// --- CLI pieces ---------------------------------------------------------------------------------

test('parseArgs groups files under the --group before them', () => {
  const a = parseArgs(['--group', 'before', 'a.json', 'b.json', '--group', 'after', 'c.json', '--md', 'x.md']);
  assert.deepEqual(a.groups, [{ label: 'before', files: ['a.json', 'b.json'] }, { label: 'after', files: ['c.json'] }]);
  assert.equal(a.md, 'x.md');
  assert.deepEqual(parseArgs(['a.json']).groups, [{ label: 'all', files: ['a.json'] }]);
});

test('PNG: valid signature, header and pixel data', () => {
  const rgb = Buffer.alloc(3 * 2 * 2, 0);
  rgb[0] = 255;
  const png = encodePng(2, 2, rgb);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 2);
  assert.equal(png.readUInt32BE(20), 2);
  const idatLen = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.equal(raw.length, (2 * 3 + 1) * 2);
  assert.equal(raw[1], 255);
});

test('heatmap renders both panels at the requested scale', () => {
  const png = renderHeatmap({ heat: mm.heat, heatN: metrics.HEAT_N, towers: [], lanePaths: Object.values(metrics.LANE_PATHS) }, 0.1);
  assert.equal(png.readUInt32BE(16), 100 * 2 + 6);
  assert.equal(png.readUInt32BE(20), 100);
});

test('paired: same pairing + seed across conditions; identical runs differ by exactly zero', () => {
  const same = metrics.paired([mm], [mm]);
  assert.equal(same.deathsPerMin.n, 1);
  assert.equal(same.deathsPerMin.meanDiff, 0);
  assert.equal(same.deathsPerMin.lo, 0);
  const d = metrics.paired([mm], [mp]);
  assert.equal(d.pvpDamagePerMin.n, 1);
  assert.ok(Math.abs(d.pvpDamagePerMin.meanDiff - (mp.damagePerMin.pvp - mm.damagePerMin.pvp)) < 1e-9);
  assert.equal(metrics.paired([mm], [{ ...mp, seed: 99 }]).deathsPerMin.n, 0, 'a different seed is not a pair');
});
