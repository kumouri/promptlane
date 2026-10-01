/**
 * The river objective (`src/objective.ts`, the Bandstand of docs/economy-spec.md §9) — one test per
 * rule, on matches built by hand with pilots that do exactly what the test says, plus replay
 * determinism and old-log compatibility. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();
const R = h.RIVER_1;
const HZ = Math.round(1 / h.TICK_DT);
const TOP = { x: 300, y: 300 };
const BOTTOM = { x: 700, y: 700 };

const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];
const BASE_STATS = ROSTER.map(() => null);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);

/**
 * A pvp-1 match whose pilots hold still (bots are placed by hand), with the objective attached and,
 * if asked, the economy after it. Nothing has ticked. Every bot not placed waits at its spawn.
 */
function setup({ rules = R, economy = false } = {}) {
  const seen = ROSTER.map(() => null);
  const roster = ROSTER.map((s, i) => ({
    ...s,
    pilotKind: 'scripted',
    makePilot: () => ({
      decide: async (obs) => {
        seen[i] = obs;
        return { kind: 'hold' };
      },
    }),
  }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  match.bearbots.forEach((b, i) => (BASE_STATS[i] ??= { attackDamage: b.attackDamage, moveSpeed: b.moveSpeed, maxHp: b.maxHp, attackCooldownSec: b.attackCooldownSec }));
  const obj = h.attachObjective(match, rules, h.TICK_DT);
  const eco = economy ? h.attachEconomy(match, h.ECO_1, [], h.TICK_DT) : null;
  const tick = () => Math.round(match.clockSec / h.TICK_DT);
  const stepTo = async (t) => {
    while (tick() < t) {
      match.tick(h.TICK_DT);
      await flush();
    }
  };
  const place = (i, p) => (match.bearbots[i].pos = { x: p.x, y: p.y });
  return { match, obj, eco, seen, tick, stepTo, place, bots: match.bearbots };
}

const OPEN = R.schedule.firstOpenSec * HZ; // 1800: the stage opens at the end of this tick
const WARN = R.schedule.warnSec * HZ;
const AFTER = R.schedule.afterCaptureSec * HZ;

// --- schedule (§9.3) ------------------------------------------------------------------------------

test('constants come from river-1.json: sites (300,300)/(700,700), radius 60, 1:30, 20 s warning, 75 s, 9:00', () => {
  assert.equal(R.name, 'river-1');
  assert.deepEqual(R.sites.map((s) => [s.id, s.x, s.y]), [['top-side', 300, 300], ['bottom-side', 700, 700]]);
  assert.equal(R.radius, 60);
  assert.deepEqual(R.schedule, { firstOpenSec: 90, afterCaptureSec: 75, warnSec: 20, lastOpenSec: 540 });
  assert.deepEqual(R.encore, { durationSec: 45, mods: { attackDamage: 0.15, moveSpeed: 0.1 }, lostOnDeath: true });
  assert.deepEqual(R.economy, { goldTeam: 40, goldLocalPool: 60, xpCapturer: 40 });
});

test('resolveObjective: a name, a recorded ruleset, none; unknown names fail; off by default until the gate', () => {
  assert.equal(h.resolveObjective('river-1'), R);
  assert.equal(h.resolveObjective(undefined), null);
  assert.equal(h.resolveObjective('none'), null);
  const recorded = { ...R, radius: 80 };
  assert.equal(h.resolveObjective(recorded), recorded);
  assert.throws(() => h.resolveObjective('river-9'), /unknown objective/);
  assert.equal(h.DEFAULT_OBJECTIVE, null);
});

test('closed until 1:10, upcoming for the 20 s before 1:30, open at 1:30 at the top-side site', async () => {
  const s = setup();
  assert.equal(s.obj.status, 'closed');
  await s.stepTo(OPEN - WARN - 1);
  assert.equal(s.obj.status, 'closed');
  assert.equal(s.obj.opensInSec(), 21);
  await s.stepTo(OPEN - WARN);
  assert.equal(s.obj.status, 'upcoming');
  assert.equal(s.obj.opensInSec(), 20);
  assert.equal(s.obj.site.id, 'top-side');
  await s.stepTo(OPEN - 1);
  assert.equal(s.obj.status, 'upcoming');
  await s.stepTo(OPEN);
  assert.equal(s.obj.status, 'open');
  assert.equal(s.obj.opensInSec(), null);
  assert.equal(s.obj.openings.length, 1);
  assert.equal(s.obj.openings[0].openSec, 90);
});

// --- capture (§9.4) -------------------------------------------------------------------------------

for (const [n, sec] of [[1, 15], [2, 10], [3, 7.5]]) {
  test(`${n} bearbot(s) of one team take an empty stage in ${sec} s`, async () => {
    const s = setup();
    await s.stepTo(OPEN);
    for (let k = 0; k < n; k++) s.place(k, TOP);
    await s.stepTo(OPEN + sec * HZ - 1);
    assert.equal(s.obj.status, 'open', 'not yet');
    await s.stepTo(OPEN + sec * HZ);
    assert.equal(s.obj.openings[0].team, 'violet');
    assert.equal(s.obj.openings[0].captureSec, 90 + sec);
    assert.deepEqual(s.obj.openings[0].capturers, [0, 1, 2].slice(0, n));
  });
}

test('green takes it the same way, toward −1', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(3, TOP);
  s.place(4, TOP);
  await s.stepTo(OPEN + 100);
  close(s.obj.bar, -0.5);
  await s.stepTo(OPEN + 200);
  assert.equal(s.obj.openings[0].team, 'green');
});

test('a bot just outside the 60 radius is not on the stage', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(0, { x: 300 + 60.5, y: 300 });
  s.place(3, { x: 300, y: 300 + 60 }); // exactly 60: on it
  await s.stepTo(OPEN + 30);
  assert.deepEqual(s.obj.onStage, { violet: [], green: [3] });
});

test('any enemy on the stage freezes the bar (contested), and the opening is marked contested', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  s.place(1, TOP);
  await s.stepTo(OPEN + 100);
  const before = s.obj.bar;
  close(before, 0.5);
  s.place(5, TOP);
  await s.stepTo(OPEN + 300);
  assert.equal(s.obj.bar, before, 'frozen while both are on it');
  assert.equal(s.obj.status, 'open');
  assert.equal(s.obj.openings[0].contested, true);
  assert.equal(s.obj.openings[0].contestedTicks, 200);
  assert.equal(s.obj.view('violet', 0).contested, true);
});

test('the other team\'s progress is wiped out first when one team has the stage alone', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  await s.stepTo(OPEN + 150);
  close(s.obj.bar, 0.5);
  s.place(0, { x: 900, y: 100 });
  s.place(3, TOP);
  await s.stepTo(OPEN + 151);
  close(s.obj.bar, -1 / 300, 'reset to 0, then one tick toward green');
});

test('an empty stage drains toward 0: a full bar would empty in 15 s', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  await s.stepTo(OPEN + 150);
  s.place(0, { x: 900, y: 100 });
  await s.stepTo(OPEN + 150 + 75);
  close(s.obj.bar, 0.25, 'drains at 1/15 per second');
  await s.stepTo(OPEN + 150 + 200);
  assert.equal(s.obj.bar, 0, 'stops at 0');
});

test('a dead bot is not on the stage', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  s.place(3, TOP);
  s.bots[3].alive = false;
  s.bots[3].hp = 0;
  await s.stepTo(OPEN + 10);
  assert.deepEqual(s.obj.onStage, { violet: [0], green: [] });
  close(s.obj.bar, 10 / 300);
});

// --- schedule after a capture (§9.3) ---------------------------------------------------------------

test('after a capture: closed, the next opening 75 s later at the other site, announced 20 s ahead', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  for (const k of [0, 1, 2]) s.place(k, TOP);
  const cap = OPEN + 150;
  await s.stepTo(cap);
  assert.equal(s.obj.status, 'closed');
  assert.equal(s.obj.bar, 0);
  assert.equal(s.obj.site.id, 'bottom-side');
  assert.equal(s.obj.nextOpenTick, cap + AFTER);
  assert.equal(s.obj.view('violet', 0).opensInSec, 75);
  await s.stepTo(cap + AFTER - WARN);
  assert.equal(s.obj.status, 'upcoming');
  await s.stepTo(cap + AFTER);
  assert.equal(s.obj.status, 'open');
  assert.equal(s.obj.openings[1].site, 'bottom-side');
  // the bots still on the top-side stage do nothing now
  await s.stepTo(cap + AFTER + 50);
  assert.equal(s.obj.bar, 0);
  for (const k of [3, 4, 5]) s.place(k, BOTTOM);
  await s.stepTo(cap + AFTER + 50 + 150);
  assert.equal(s.obj.openings[1].team, 'green');
  assert.equal(s.obj.site.id, 'top-side', 'alternates back');
});

test('it stays open until someone takes it', async () => {
  const s = setup();
  await s.stepTo(OPEN + 200 * HZ);
  assert.equal(s.obj.status, 'open');
  assert.equal(s.obj.openings.length, 1);
});

test('no opening after 9:00: one due at exactly 9:00 opens, one due later never does (done)', async () => {
  // Same rules, schedule shifted so the boundary is reached quickly.
  const early = { ...R, name: 'river-test', schedule: { ...R.schedule, firstOpenSec: 5, lastOpenSec: 5 + 7.5 + 75 } };
  const s = setup({ rules: early });
  await s.stepTo(5 * HZ);
  for (const k of [0, 1, 2]) s.place(k, TOP);
  await s.stepTo(5 * HZ + 150); // captured at 12.5 s; next due at 87.5 s = lastOpenSec: allowed
  assert.equal(s.obj.status, 'closed');
  await s.stepTo(Math.round(87.5 * HZ));
  assert.equal(s.obj.status, 'open');
  for (const k of [0, 1, 2]) s.place(k, BOTTOM);
  await s.stepTo(Math.round(87.5 * HZ) + 150); // next would be due after lastOpenSec
  assert.equal(s.obj.status, 'done');
  assert.equal(s.obj.nextOpenTick, null);
  assert.equal(s.obj.site.id, 'bottom-side', 'a done stage shows the last site');
  assert.equal(s.obj.view('green', 3).opensInSec, null);
  const late = { ...R, name: 'river-test2', schedule: { ...R.schedule, firstOpenSec: 600 } };
  assert.equal(setup({ rules: late }).obj.status, 'done', 'a first opening after lastOpenSec never comes');
});

// --- the Encore (§9.5) ------------------------------------------------------------------------------

test('Encore: +15 % attack damage and +10 % move speed for 45 s to every living bot of the capturing team', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.bots[2].alive = false; // a dead teammate gets nothing
  s.bots[2].hp = 0;
  s.place(0, TOP);
  const cap = OPEN + 300;
  await s.stepTo(cap);
  assert.deepEqual(s.obj.openings[0].encore, [0, 1]);
  for (const i of [0, 1]) {
    close(s.bots[i].attackDamage, BASE_STATS[i].attackDamage * 1.15, `bot ${i} damage`);
    close(s.bots[i].moveSpeed, BASE_STATS[i].moveSpeed * 1.1, `bot ${i} speed`);
    assert.equal(s.bots[i].maxHp, BASE_STATS[i].maxHp, 'max hp untouched');
    assert.equal(s.bots[i].attackCooldownSec, BASE_STATS[i].attackCooldownSec, 'attack speed untouched');
  }
  for (const i of [2, 3, 4, 5]) assert.equal(s.bots[i].attackDamage, BASE_STATS[i].attackDamage, `bot ${i} unbuffed`);
  await s.stepTo(cap + 45 * HZ - 1);
  assert.equal(s.obj.hasEncore(0), true);
  assert.equal(s.obj.encoreSec(0), 0.1);
  await s.stepTo(cap + 45 * HZ);
  assert.equal(s.obj.hasEncore(0), false);
  assert.equal(s.bots[0].attackDamage, BASE_STATS[0].attackDamage, 'back to base exactly');
  assert.equal(s.bots[0].moveSpeed, BASE_STATS[0].moveSpeed);
});

test('Encore is lost on death, and a second capture refreshes it rather than stacking', async () => {
  const quick = { ...R, name: 'river-test', schedule: { ...R.schedule, afterCaptureSec: 1, warnSec: 0 } };
  const s = setup({ rules: quick });
  await s.stepTo(OPEN);
  for (const k of [0, 1, 2]) s.place(k, TOP);
  await s.stepTo(OPEN + 150);
  const first = s.obj.encoreUntil[1];
  s.bots[0].alive = false;
  s.bots[0].hp = 0;
  await s.stepTo(OPEN + 151);
  assert.equal(s.obj.encoreUntil[0], null, 'lost on death');
  for (const k of [1, 2]) s.place(k, BOTTOM);
  await s.stepTo(OPEN + 150 + HZ + 200);
  assert.equal(s.obj.openings[1].team, 'violet');
  assert.ok(s.obj.encoreUntil[1] > first, 'refreshed to a new 45 s');
  close(s.bots[1].attackDamage, BASE_STATS[1].attackDamage * 1.15, 'not stacked');
});

// --- what pilots see (§9.7) --------------------------------------------------------------------------

test('the observation: bandstand block from each team\'s side, Encore seconds, enemy Encore flag', async () => {
  const s = setup();
  await s.stepTo(OPEN - 5 * HZ);
  assert.deepEqual(s.obj.view('violet', 0), { site: 'top-side', pos: TOP, radius: 60, status: 'upcoming', opensInSec: 5, progress: 0, contested: false, alliesOn: 0, selfOn: false });
  // Pilots are polled every 0.5 s, so the last observation a pilot saw is up to 10 ticks old.
  let v = s.seen[0].bandstand;
  assert.equal(v.status, 'upcoming');
  assert.ok(v.opensInSec >= 5 && v.opensInSec <= 6, `opensInSec ${v.opensInSec}`);
  await s.stepTo(OPEN);
  s.place(0, TOP);
  s.place(1, TOP);
  s.place(3, { x: 330, y: 380 }); // green drums 85 from the stage: within vision, not on it
  await s.stepTo(OPEN + 100);
  v = s.obj.view('violet', 0);
  assert.equal(v.status, 'open');
  assert.equal(v.progress, 0.5);
  assert.equal(v.alliesOn, 2);
  assert.equal(v.selfOn, true);
  assert.equal(v.opensInSec, null);
  assert.equal(s.obj.view('green', 3).progress, -0.5, 'the enemy sees it from its own side');
  assert.equal(s.obj.view('green', 3).alliesOn, 0);
  assert.equal(s.obj.view('violet', 2).selfOn, false);
  assert.equal(s.obj.view('violet', 2).alliesOn, 2);
  await s.stepTo(OPEN + 100 + 10); // every pilot has been asked since
  assert.ok(s.seen[0].bandstand.progress > 0.5 && s.seen[3].bandstand.progress < -0.5, 'what the pilots saw has the same signs');
  assert.equal(s.seen[0].bandstand.selfOn, true);
  await s.stepTo(OPEN + 200 + 10);
  assert.ok(s.seen[0].self.encoreSec > 44 && s.seen[0].self.encoreSec <= 45, `encoreSec ${s.seen[0].self.encoreSec}`);
  assert.equal(s.seen[0].allies.find((a) => a.id === s.bots[1].id).encoreSec, s.seen[0].self.encoreSec);
  const seenByGreen = s.seen[3].visibleEnemies.find((e) => e.id === s.bots[0].id);
  assert.equal(seenByGreen.encore, true);
  assert.equal(s.seen[3].self.encoreSec, 0);
  assert.equal(s.seen[3].bandstand.status, 'closed');
  assert.equal(s.seen[3].bandstand.site, 'bottom-side');
  const minion = s.seen[3].visibleEnemies.find((e) => e.kind !== 'bearbot');
  if (minion) assert.equal('encore' in minion, false, 'only bearbots carry the flag');
});

test('a match without the objective sends exactly today\'s observation', async () => {
  let obs = null;
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async (o) => ((obs = o), { kind: 'hold' }) }) }));
  const match = new h.Match(1, roster);
  match.tick(h.TICK_DT);
  await flush();
  assert.equal('bandstand' in obs, false);
  assert.equal('encoreSec' in obs.self, false);
  assert.equal(h.getObjective(match), undefined);
  assert.equal(JSON.parse(h.checkpointOf(match)).o, undefined, 'no objective state in the checkpoint');
});

// --- gold and XP: only through the economy's reward sink (§9.5) ----------------------------------------

test('without an economy a capture pays the Encore only', async () => {
  const s = setup();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  await s.stepTo(OPEN + 300);
  assert.equal(s.obj.openings[0].rewarded, false);
});

test('a registered reward sink gets team gold for every bot (alive or dead), the local pool split among capturers, XP per capturer', async () => {
  const s = setup();
  const paid = [];
  h.setRewardSink(s.match, { gold: (i, amount, source) => paid.push(['gold', i, amount, source]), xp: (i, amount, source) => paid.push(['xp', i, amount, source]) });
  await s.stepTo(OPEN);
  s.bots[2].alive = false;
  s.bots[2].hp = 0;
  s.place(0, TOP);
  s.place(1, TOP);
  await s.stepTo(OPEN + 200);
  assert.equal(s.obj.openings[0].rewarded, true);
  assert.deepEqual(paid, [
    ['gold', 0, 40, 'bandstand-team'],
    ['gold', 1, 40, 'bandstand-team'],
    ['gold', 2, 40, 'bandstand-team'],
    ['gold', 0, 30, 'bandstand-local'],
    ['gold', 1, 30, 'bandstand-local'],
    ['xp', 0, 40, 'bandstand'],
    ['xp', 1, 40, 'bandstand'],
  ]);
});

test('with the economy attached: Bandstand gold lands in its ledger and pools, XP counts, and the Encore multiplies the level bonus', async () => {
  const s = setup({ economy: true });
  await s.stepTo(OPEN);
  for (const k of [0, 1, 2]) s.place(k, TOP);
  s.eco.bots[0].xp = 80; // level 2 after this tick's level-up step
  const before = s.eco.bots.map((e) => ({ ...e.earned }));
  await s.stepTo(OPEN + 150);
  assert.equal(s.obj.openings[0].rewarded, true);
  for (const i of [0, 1, 2]) {
    assert.equal(s.eco.bots[i].earned['bandstand-team'] - before[i]['bandstand-team'], 40);
    assert.equal(s.eco.bots[i].earned['bandstand-local'] - before[i]['bandstand-local'], 20);
  }
  for (const i of [3, 4, 5]) assert.equal(s.eco.bots[i].earned['bandstand-team'], 0);
  assert.equal(s.eco.bots[1].xp >= 40, true);
  assert.equal(s.eco.bots[0].level, 2);
  close(s.bots[0].attackDamage, BASE_STATS[0].attackDamage * (1 + h.ECO_1.xp.perLevel.attackDamage) * 1.15, 'level × Encore');
  close(s.bots[0].moveSpeed, BASE_STATS[0].moveSpeed * 1.1);
  close(s.bots[1].attackDamage, BASE_STATS[1].attackDamage * 1.15);
});

// --- replay (§9.6) -------------------------------------------------------------------------------------

const SIDES = { violet: { name: 'ann', promptFile: 'ann.md', promptText: 'ann' }, green: { name: 'bo', promptFile: 'bo.md', promptText: 'bo' } };

/** Scripted tracing pilots that go to the Bandstand and fight whoever is there: captures, contests, deaths. */
const toTheStage = (i, team) => ({
  async decide(obs) {
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot');
    const st = obs.bandstand;
    let action = { kind: 'hold' };
    if (foe && (team === 'green' || i === 0)) action = { kind: 'attack', target: foe.id };
    else if (st && (st.status === 'open' || st.status === 'upcoming')) action = { kind: 'move', target: st.pos };
    return { reply: JSON.stringify(action), action };
  },
});
const scripted = (opts = {}) =>
  h.runMatch({ seed: 11, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: toTheStage, cadenceSec: 2, backend: { kind: 'scripted' }, flush, objective: 'river-1', ...opts });
const riverLog = await scripted();
const riverLog2 = await scripted();

test('a river-1 log records the whole ruleset and every opening; its checkpoints carry the objective', () => {
  assert.deepEqual(riverLog.objective, R);
  assert.equal(riverLog.map.name, 'pvp-1');
  const s = riverLog.result.objective;
  assert.equal(s.name, 'river-1');
  assert.ok(s.openings.length >= 2, `openings ${s.openings.length}`);
  assert.ok(s.captures.violet + s.captures.green >= 1);
  assert.ok(s.openings.some((o) => o.contested), 'the scripted bots contest at least one opening');
  assert.ok(JSON.parse(riverLog.checkpoints[0].state).o, 'checkpoint has o');
});

test('replay determinism: a river-1 log replay-verifies, a second run reproduces it, a changed ruleset diverges', async () => {
  const v = await h.verifyReplay(riverLog, flush);
  assert.equal(v.ok, true);
  assert.equal(v.checkpointsCompared, riverLog.checkpoints.length);
  assert.deepEqual(riverLog2.checkpoints, riverLog.checkpoints);
  // Wall-clock call time may differ, and entity ids are offset by each run's idBase (a global counter).
  const norm = (log) =>
    log.decisions.map(({ ms: _ms, reply: _r, ...d }) =>
      typeof d.action?.target === 'string' ? { ...d, action: { ...d.action, target: d.action.target.replace(/-(\d+)$/,(_m, n) => `-${Number(n) - log.idBase}`) } } : d,
    );
  assert.deepEqual(norm(riverLog2), norm(riverLog));
  assert.deepEqual(riverLog2.result.objective, riverLog.result.objective);
  const tampered = { ...riverLog, objective: { ...R, radius: 80 } };
  assert.equal((await h.verifyReplay(tampered, flush)).ok, false);
  const stripped = { ...riverLog };
  delete stripped.objective;
  assert.equal((await h.verifyReplay(stripped, flush)).ok, false, 'replaying without the objective diverges');
});

test('a match without an objective writes no objective field and no o in its checkpoints', async () => {
  const log = await scripted({ objective: undefined, maxSimSec: 30 });
  assert.equal('objective' in log, false);
  assert.equal('objective' in log.result, false);
  assert.equal(JSON.parse(log.checkpoints[0].state).o, undefined);
});

test('old logs replay unchanged: committed v1 and pvp-1 (economy) logs still verify', async () => {
  for (const f of ['runs/jam-sample-drums-vs-violin.json', 'runs/house-prompt-2026-09-21-r1-house-vs-drums-seed7.json', 'runs/economy-p1-smoke-2026-09-30-m1-medium-vs-hard-s7.json']) {
    const log = JSON.parse(await readFile(path.join(ROOT, f), 'utf8'));
    assert.equal(log.objective, undefined, f);
    const v = await h.verifyReplay(log, flush);
    assert.equal(v.ok, true, `${f} diverged at ${v.firstDivergenceTick}`);
  }
});

// --- river-2 (§9.10; Ceryce's redesign, 2026-09-30 23:00–23:02 CT) ---------------------------------
// Registered after the logs above are played, so their hand-built matches cannot take entity ids from
// the middle of a log being recorded.

const R2 = h.RIVER_2;
const r2 = () => setup({ rules: R2 });

test('river-2 constants: river-1 plus a 30 s / 45 s close timer, sets of 7.5 / 5 / 2.5 s, and the bigger group pushes', () => {
  assert.equal(R2.name, 'river-2');
  assert.equal(h.resolveObjective('river-2'), R2);
  assert.deepEqual(R2.close, { emptySec: 30, occupiedSec: 45 });
  assert.deepEqual(R2.capture, { setSec: 7.5, rateByCount: [0, 1, 1.5, 3], drainSec: 15, contest: 'outnumber' });
  for (const k of ['sites', 'radius', 'schedule', 'encore', 'economy']) assert.deepEqual(R2[k], R[k], k);
  assert.equal(R.close, undefined, 'river-1 has no close timer');
  assert.equal(R.capture.contest, undefined, 'river-1 freezes');
});

for (const [n, sec] of [[1, 7.5], [2, 5], [3, 2.5]]) {
  test(`river-2: ${n} bearbot(s) of one team take an empty stage in ${sec} s`, async () => {
    const s = r2();
    await s.stepTo(OPEN);
    for (let k = 0; k < n; k++) s.place(k, TOP);
    await s.stepTo(OPEN + sec * HZ - 1);
    assert.equal(s.obj.status, 'open', 'not yet');
    await s.stepTo(OPEN + sec * HZ);
    assert.equal(s.obj.openings[0].team, 'violet');
    assert.equal(s.obj.openings[0].captureSec, 90 + sec);
  });
}

test('river-2: equal numbers on the stage freeze it, as in river-1', async () => {
  const s = r2();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  await s.stepTo(OPEN + 75);
  close(s.obj.bar, 0.5);
  s.place(3, TOP);
  await s.stepTo(OPEN + 175);
  close(s.obj.bar, 0.5, 'frozen 1 v 1');
  s.place(1, TOP);
  s.place(4, TOP);
  await s.stepTo(OPEN + 275);
  close(s.obj.bar, 0.5, 'frozen 2 v 2');
});

test('river-2: the bigger group lowers the other team\'s progress at the margin\'s rate, and stops at 0', async () => {
  const s = r2();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  await s.stepTo(OPEN + 75);
  close(s.obj.bar, 0.5, 'violet alone: half in 3.75 s');
  s.place(3, TOP);
  s.place(4, TOP);
  await s.stepTo(OPEN + 75 + 30);
  close(s.obj.bar, 0.5 - 30 / 150, '2 v 1: a margin of 1 lowers it as one bot would raise it (1/7.5 per s)');
  s.place(5, TOP);
  await s.stepTo(OPEN + 75 + 30 + 20);
  close(s.obj.bar, 0.3 - 20 / 100, '3 v 1: a margin of 2 (1/5 per s)');
  await s.stepTo(OPEN + 75 + 30 + 20 + 100);
  assert.equal(s.obj.bar, 0, 'down to 0 and no further');
  assert.equal(s.obj.status, 'open', 'never taken while an enemy stands on it');
  assert.equal(s.obj.openings[0].contested, true);
});

test('river-2: the bigger group\'s own progress never rises while any enemy is on the stage', async () => {
  const s = r2();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  s.place(1, TOP);
  await s.stepTo(OPEN + 40);
  close(s.obj.bar, 40 * 1.5 / 150);
  s.place(2, TOP);
  s.place(3, TOP);
  await s.stepTo(OPEN + 200);
  close(s.obj.bar, 0.4, '3 v 1 holds violet\'s 40 %, does not add to it');
});

test('river-2: an opening nobody is on at 30 s closes then, and the next is 75 s later at the other site', async () => {
  const s = r2();
  await s.stepTo(OPEN + 30 * HZ - 1);
  assert.equal(s.obj.status, 'open');
  await s.stepTo(OPEN + 30 * HZ);
  assert.equal(s.obj.status, 'closed');
  assert.equal(s.obj.openings[0].closedSec, 120);
  assert.equal(s.obj.openings[0].captureSec, null);
  assert.equal(s.obj.openings[0].team, null);
  assert.equal(s.obj.site.id, 'bottom-side');
  assert.equal(s.obj.nextOpenTick, OPEN + 30 * HZ + AFTER);
  await s.stepTo(OPEN + 30 * HZ + AFTER);
  assert.equal(s.obj.status, 'open');
  assert.equal(s.obj.openings[1].openSec, 195);
  assert.equal(s.obj.openings[1].site, 'bottom-side');
});

test('river-2: a stage occupied at 30 s stays open until the first tick it is empty', async () => {
  const s = r2();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  s.place(3, TOP); // 1 v 1: nobody can take it
  await s.stepTo(OPEN + 35 * HZ);
  assert.equal(s.obj.status, 'open', 'extended past 30 s');
  s.place(0, { x: 900, y: 100 });
  s.place(3, { x: 100, y: 900 });
  await s.stepTo(OPEN + 35 * HZ + 1);
  assert.equal(s.obj.status, 'closed');
  assert.equal(s.obj.openings[0].closedSec, 125.05);
});

test('river-2: and closes at 45 s at the latest, even with bots on it', async () => {
  const s = r2();
  await s.stepTo(OPEN);
  s.place(0, TOP);
  s.place(3, TOP);
  await s.stepTo(OPEN + 45 * HZ - 1);
  assert.equal(s.obj.status, 'open');
  await s.stepTo(OPEN + 45 * HZ);
  assert.equal(s.obj.status, 'closed');
  assert.equal(s.obj.openings[0].closedSec, 135);
  assert.equal(s.obj.openings[0].contested, true);
});

test('river-2: a capture before the close timer is an ordinary capture (no closedSec)', async () => {
  const s = r2();
  await s.stepTo(OPEN + 25 * HZ);
  s.place(0, TOP);
  await s.stepTo(OPEN + 25 * HZ + 7.5 * HZ);
  assert.equal(s.obj.openings[0].team, 'violet');
  assert.equal('closedSec' in s.obj.openings[0], false);
});

test('river-2 checkpoints add the open tick; river-1 checkpoints are exactly what they were', async () => {
  const a = setup();
  const b = r2();
  await a.stepTo(OPEN + 10);
  await b.stepTo(OPEN + 10);
  assert.equal(a.obj.checkpoint().length, 5);
  assert.deepEqual(b.obj.checkpoint().slice(0, 5), a.obj.checkpoint());
  assert.equal(b.obj.checkpoint()[5], OPEN);
});
