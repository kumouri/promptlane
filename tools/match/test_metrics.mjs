/**
 * Map variants (`src/mapVariant.ts`) and match metrics (`metrics.ts` / `metrics.mjs`), on the
 * game's deterministic mock model — no server, no key. The Bandstand's metrics and §9.8 verdict
 * (docs/economy-spec.md) use scripted pilots that walk to the stage, and synthetic metric sets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { flush, loadHeadless, loadMetrics } from './load.mjs';
import { encodePng, markdown, pairedMarkdown, parseArgs, renderHeatmap, verdictMarkdown } from './metrics.mjs';

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

// The Bandstand's matches, run and measured here, before any test starts: entity ids come from a
// module-global counter, so a match must not run while a test is replaying another one.
/** A pilot from a function of (bot index, observation): no model, the reply is the action itself. */
const scripted = (fn) => (i) => ({
  async decide(obs) {
    const action = fn(i, obs);
    return { action, reply: JSON.stringify(action) };
  },
});
const HOLD = { kind: 'hold' };
const toStage = (obs) => ({ kind: 'move', target: { ...obs.bandstand.pos } });

const objLog = await mockMatch({ map: 'pvp-1', objective: 'river-1' });
const mo = await metrics.measureLog(objLog, flush, 'obj.json');
// Violet walks to every stage (open or next); green stays home.
const takeLog = await mockMatch({ maxSimSec: 330, objective: 'river-1', decisionPilotFor: scripted((i, obs) => (i < 3 ? toStage(obs) : HOLD)) });
const mt = await metrics.measureLog(takeLog, flush, 'take.json');
const { objective: takeObjective, ...takeLogStripped } = takeLog;
const mtStripped = await metrics.measureLog(takeLogStripped, flush);
// Everybody walks on once it opens and hits any enemy bearbot within 150: a fight on the stage.
const fightLog = await mockMatch({
  maxSimSec: 330,
  objective: 'river-1',
  decisionPilotFor: scripted((i, obs) => {
    if (obs.bandstand.status !== 'open') return HOLD;
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot' && Math.hypot(e.pos.x - obs.self.pos.x, e.pos.y - obs.self.pos.y) < 150);
    return foe ? { kind: 'attack', target: foe.id } : toStage(obs);
  }),
});
const mf = await metrics.measureLog(fightLog, flush, 'fight.json');

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

// --- the Bandstand (docs/economy-spec.md §9.8) --------------------------------------------------

const BANDSTAND_KEYS = [
  'bandstandOpenings', 'bandstandCaptures', 'bandstandCapturesViolet', 'bandstandCapturesGreen', 'bandstandContestedShare',
  'teamFightsNearBandstand', 'bandstandCaptureSplit', 'bandstandMoreCapturesWon', 'encoreUptime', 'bandstandRuleFires',
];

test('an objective log replays with the objective attached, and its metrics match the logged summary', () => {
  for (const [log, m] of [[objLog, mo], [takeLog, mt], [fightLog, mf]]) {
    assert.equal(m.replayOk, true);
    assert.ok(m.checkpointsCompared > 40);
    const s = log.result.objective;
    assert.equal(m.objective.name, 'river-1');
    assert.equal(m.objective.openings, s.openings.length);
    assert.deepEqual({ violet: m.objective.captures.violet, green: m.objective.captures.green }, s.captures);
    assert.equal(m.objective.contestedOpenings, s.openings.filter((o) => o.contested).length);
    assert.deepEqual(m.objective.sites.map((x) => x.pos), [{ x: 300, y: 300 }, { x: 700, y: 700 }]);
    const v = metrics.matchValues(m);
    for (const k of BANDSTAND_KEYS.filter((k) => k !== 'bandstandMoreCapturesWon' && k !== 'bandstandRuleFires')) assert.equal(typeof v[k], 'number', k);
  }
  assert.ok(mo.objective.openings >= 1, 'first opening at 90 s');
});

test('replaying an objective log without its objective diverges (it is applied, not just read)', () => {
  assert.ok(takeObjective);
  assert.equal(mtStripped.replayOk, false);
  assert.equal(mtStripped.objective, null);
});

test('a log without an objective: Bandstand metrics are null and every other metric is what the objective-free replay gives', () => {
  for (const m of [mm, mp]) {
    assert.equal(m.objective, null);
    assert.equal(m.bandstandRuleFires, null, 'mock sides play no compiled schema');
    const v = metrics.matchValues(m);
    for (const k of BANDSTAND_KEYS) assert.equal(v[k], null, k);
  }
  // The mock pilots never reach the stage, so attaching the objective changes nothing else.
  const { objective: a, file: fa, ...withObjective } = mo;
  const { objective: b, file: fb, ...without } = mp;
  assert.deepEqual(withObjective, without);
});

test('captures, split, Encore uptime: one team takes every stage', () => {
  const o = mt.objective;
  assert.ok(o.captures.violet >= 2, `violet took ${o.captures.violet}`);
  assert.equal(o.captures.green, 0);
  assert.equal(o.captures.total, o.captures.violet);
  assert.equal(o.contestedOpenings, 0);
  assert.equal(o.captureSplit, 0, 'the team with fewer captures took none');
  assert.equal(o.moreCapturesWon, null, 'an unfinished match has no winner');
  // Encore: 45 s for each of violet's alive bots per capture; green never has it.
  assert.ok(o.encoreUptime > 0 && o.encoreUptime <= 0.5, `uptime ${o.encoreUptime}`);
  const aliveTicks = mt.bots.reduce((s, b) => s + b.aliveSec, 0) / takeLog.tickDt;
  const encoreTicks = (takeLog.result.objective.openings.reduce((s, op) => s + op.encore.length, 0) * 45) / takeLog.tickDt;
  assert.ok(o.encoreUptime <= encoreTicks / aliveTicks + 1e-9, 'at most 45 s per Encore holder (less if one died or the match stopped)');
});

test('a fight on an open stage: contested, and counted as a team fight at the Bandstand', () => {
  const o = mf.objective;
  assert.ok(o.contestedOpenings >= 1);
  assert.ok(o.contestedShare > 0 && o.contestedShare <= 1);
  assert.ok(o.teamFightsNear >= 1, 'the fight starts on the stage');
  assert.ok(o.teamFightsNear <= mf.teamFights.length);
  const nearASite = mf.teamFights.filter((f) => [300, 700].some((c) => Math.hypot(f.at.x - c, f.at.y - c) <= metrics.BANDSTAND_FIGHT_RADIUS));
  assert.ok(nearASite.length >= o.teamFightsNear, 'a counted fight is near a site');
});

test("Bandstand rule fires: read from the reply's rule id and the side's compiled schemas, guards included", () => {
  const rule = (id, selector) => ({ id, condition: 'c', criteria_true: 't', criteria_false: 'f', action_kind: 'move', action_ability: null, action_target_selector: selector });
  const schema = {
    instrument: 'drums',
    rules: [
      rule('r1', 'bandstand'),
      { type: 'guard', id: 'g1', condition: 'g', criteria_true: 't', criteria_false: 'f', then: { nodes: [rule('g1r1', 'bandstand')], default_action: null }, else: { nodes: [rule('g1r2', 'push_lane')], default_action: null } },
      rule('r2', 'nearest_enemy'),
    ],
    default_action: { kind: 'move', ability: null, target_selector: 'bandstand' },
  };
  const reply = (r) => JSON.stringify({ rule: r, action: { kind: 'move' }, answers: {}, ms: 1 });
  const log = {
    ...pvpLog,
    sides: { violet: { ...pvpLog.sides.violet, schemas: { drums: schema, keytar: schema, violin: schema } }, green: pvpLog.sides.green },
    decisions: [
      { tick: 1, bot: 0, reply: reply('r1'), action: HOLD },
      { tick: 1, bot: 1, reply: reply('g1r1'), action: HOLD },
      { tick: 1, bot: 2, reply: reply('g1r2'), action: HOLD },
      { tick: 1, bot: 0, reply: reply(null), action: HOLD }, // a default answered: not a rule
      { tick: 1, bot: 0, cached: true, action: HOLD },
      { tick: 1, bot: 1, reply: '[pilot error: timeout]', action: null },
      { tick: 1, bot: 3, reply: reply('r1'), action: HOLD }, // green plays no schema
    ],
  };
  assert.deepEqual(metrics.countBandstandRuleFires(log), { total: 2, byTeam: { violet: 2, green: 0 }, decisions: 4 });
  assert.equal(metrics.countBandstandRuleFires(pvpLog), null);
});

// Synthetic metric sets for the verdict: a real one, with each line's inputs overwritten.
function fake(seed, o) {
  const m = structuredClone(mp);
  m.seed = seed;
  m.winner = o.winner ?? null;
  m.teamFights = Array.from({ length: o.tf }, () => ({ startSec: 100, endSec: 110, at: { x: 300, y: 300 }, deaths: 0 }));
  m.damagePerMin.pvp = o.pvp;
  m.pvpDamageByCoverage = { neutral: o.neutral, 'victim-tower': 1 - o.neutral, 'enemy-tower': 0, both: 0 };
  m.botTime.underEnemyTower = o.under;
  m.deaths = 4;
  m.deathsByCoverage = { neutral: 4 - o.deathsUnder, 'victim-tower': 0, 'enemy-tower': o.deathsUnder, both: 0 };
  m.firstBlood = { team: 'violet', killer: 0, victim: 3, sec: o.fb };
  m.objective = o.captures
    ? {
        name: 'river-1',
        sites: [],
        radius: 60,
        openings: o.openings,
        contestedOpenings: o.contested,
        contestedShare: o.contested / o.openings,
        captures: { violet: o.captures[0], green: o.captures[1], total: o.captures[0] + o.captures[1] },
        teamFightsNear: o.near,
        captureSplit: Math.min(...o.captures) >= 1 ? 1 : 0,
        moreCapturesWon: o.captures[0] > o.captures[1] && m.winner ? (m.winner === 'violet' ? 1 : 0) : null,
        encoreUptime: 0.2,
      }
    : null;
  m.bandstandRuleFires = { total: o.fires ?? 0, byTeam: { violet: o.fires ?? 0, green: 0 }, decisions: 100 };
  return m;
}
const SEEDS = [7, 11, 42, 101, 5, 6];
const P = SEEDS.map((s, k) => fake(s, { tf: 3, pvp: 180, neutral: 0.6, under: 0.1, deathsUnder: 2, fb: 360, fires: k === 0 ? 1 : 0 }));
const goodO = (k) => ({ tf: 5 + (k % 2), pvp: 185 + k, neutral: 0.65, under: 0.1, deathsUnder: 2, fb: 350, captures: [3, 2], openings: 5, contested: 3, near: 2, winner: 'violet', fires: 20 });
/** O against P with `over` (an object, or k → object per pair) replacing the passing values. */
const verdict = (over = {}) => metrics.bandstandVerdict(P, SEEDS.map((s, k) => fake(s, { ...goodO(k), ...(typeof over === 'function' ? over(k) : over) })), 2000);
const line = (v, key) => v.lines.find((l) => l.key === key);

test('§9.8 verdict: every line passes', () => {
  const v = verdict();
  assert.equal(v.pass, true, JSON.stringify(v.lines.filter((l) => l.pass === false)));
  assert.equal(line(v, 'teamFightsPerMatch').value, 5.5);
  assert.ok(line(v, 'teamFightsPerMatch').diff.lo > 0);
  assert.equal(line(v, 'bandstandCaptures').value, 5);
  assert.equal(line(v, 'bandstandContestedShare').value, 0.6);
  assert.deepEqual([line(v, 'bandstandRuleFires').baseline, line(v, 'bandstandRuleFires').value], [1, 120], 'totals over each group');
  assert.equal(line(v, 'bandstandMoreCapturesWon').value, 1);
  assert.ok(v.lines.filter((l) => l.section === 'reported').every((l) => l.pass === null));
  assert.match(v.next, /ships/);
  const md = verdictMarkdown('P', 'O', v);
  assert.match(md, /\| target \| team fights \/ match \| 3\.00 \| 5\.50 \|/);
  assert.doesNotMatch(md, /\*\*FAIL\*\*/);
});

test('§9.8 verdict: the target fails on the mean or on the interval; keep-lines hold', () => {
  const low = verdict({ tf: 4 }); // mean 4.0 < 4.6
  assert.equal(low.target, false);
  assert.equal(low.keep, true);
  assert.equal(low.pass, false);
  assert.match(low.next, /tuning pass/);
  // Mean 5 ≥ 4.6, but half the pairs went down: the interval reaches below 0.
  const shaky = verdict((k) => ({ tf: [9, 9, 9, 1, 1, 1][k] }));
  assert.ok(line(shaky, 'teamFightsPerMatch').value >= 4.6);
  assert.ok(line(shaky, 'teamFightsPerMatch').diff.lo <= 0);
  assert.equal(line(shaky, 'teamFightsPerMatch').pass, false);
  assert.match(verdictMarkdown('P', 'O', shaky), /\*\*FAIL\*\*/);
});

test('§9.8 verdict: keep-lines fail past the midpoint or when the interval is wholly on the wrong side', () => {
  assert.equal(line(verdict({ pvp: 150 }), 'pvpDamagePerMin').pass, false, 'below 161');
  assert.equal(line(verdict({ neutral: 0.4 }), 'pvpDamageNeutral').pass, false, 'below 41.5 %');
  assert.equal(line(verdict({ under: 0.14 }), 'underEnemyTower').pass, false, 'above 13.7 %');
  // 2.5 of 4 deaths = 62.5 % ≤ 75.3 %, but every pair rose: the CI is wholly above 0.
  const rose = verdict({ deathsUnder: 2.5 });
  assert.equal(line(rose, 'deathsUnderEnemyTower').pass, false);
  assert.equal(rose.keep, false);
  assert.match(rose.next, /keep-line regresses/);
  assert.equal(line(verdict({ fb: 410 }), 'firstBloodSec').pass, false, 'above 402 s');
  assert.equal(line(verdict({ fb: 390 }), 'firstBloodSec').pass, false, '≤ 402 s, but later than P in every pair');
  assert.equal(line(verdict({ fb: 365 }), 'firstBloodSec').pass, false, 'by 5 s every time is still wholly above 0');
  assert.equal(line(verdict((k) => ({ fb: k % 2 ? 340 : 380 })), 'firstBloodSec').pass, true, 'mixed: the CI straddles 0');
});

test('§9.8 verdict: objective-in-use lines, and no objective data is a fail', () => {
  const oneSided = verdict({ captures: [4, 0] });
  assert.equal(line(oneSided, 'bandstandCaptureSplit').pass, false);
  assert.equal(oneSided.target && oneSided.keep, true);
  assert.equal(oneSided.objective, false);
  assert.match(oneSided.next, /Ceryce rules/);
  assert.equal(line(verdict({ captures: [1, 1] }), 'bandstandCaptures').pass, false, 'median 2 < 3');
  assert.equal(line(verdict({ contested: 2 }), 'bandstandContestedShare').pass, false, '40 % < 50 %');
  assert.equal(line(verdict({ near: 0 }), 'teamFightsNearBandstand').pass, false);
  const none = verdict({ captures: null });
  assert.deepEqual(none.lines.filter((l) => l.section === 'objective').map((l) => [l.value, l.pass]), [[null, false], [null, false], [null, false], [null, false]]);
});

// --- CLI pieces for the Bandstand ---------------------------------------------------------------

test('tables: Bandstand rows only when a condition has the objective; --prereg is validated', () => {
  const plain = markdown([metrics.aggregate('pvp-1', [mp])]);
  assert.doesNotMatch(plain, /Bandstand|Encore/);
  const withObj = markdown([metrics.aggregate('P', [mp]), metrics.aggregate('O', [mt])]);
  assert.match(withObj, /\| Bandstand captures \/ match \| – \| \d+\.\d\d \|/);
  assert.match(withObj, /bot-time with the Encore/);
  assert.match(pairedMarkdown('P', { O: metrics.paired([mp], [mp]) }), /deaths \/ min/);
  assert.equal(parseArgs(['--prereg', 'bandstand', '--group', 'P', 'a.json']).prereg, 'bandstand');
  assert.throws(() => parseArgs(['--prereg', 'nope']), /unknown table/);
});

test('heatmap draws the Bandstand sites in gold, on both panels', () => {
  const W = 100;
  const png = renderHeatmap({ heat: mt.heat, heatN: metrics.HEAT_N, towers: [], lanePaths: [], sites: [{ pos: { x: 300, y: 300 }, radius: 60 }] }, W / 1000);
  const raw = inflateSync(png.subarray(41, 41 + png.readUInt32BE(33)));
  const stride = (W * 2 + 6) * 3 + 1;
  const pixel = (x, y) => [...raw.subarray(y * stride + 1 + x * 3, y * stride + 1 + x * 3 + 3)];
  assert.deepEqual(pixel(30, 30), [255, 200, 0], 'centre dot');
  assert.deepEqual(pixel(W + 6 + 30, 30), [255, 200, 0], 'green panel too');
});
