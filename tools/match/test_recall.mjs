/**
 * The channelled recall (`src/recall.ts`, `recall-2`, docs/economy-spec.md §9.10) — one test per
 * rule, on matches built by hand with pilots that do exactly what the test says, plus replay
 * determinism and old-log compatibility. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();
const R = h.RECALL_2;
const HZ = Math.round(1 / h.TICK_DT);
const CHANNEL = R.channelSec * HZ; // 80 ticks
const WINDOW = R.interruptibleSec * HZ; // 70 ticks
const VIOLET_BASE = { x: 100, y: 900 };
const MID = { x: 500, y: 500 };

const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];

// The logs are played before any test is registered: node:test starts a test as soon as it is
// registered, and a hand-built match constructed meanwhile would take entity ids (a global counter in
// the sim) out of the middle of the log being recorded, which breaks the replay's id remap.
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
/** Walk up the lane, fight what is in sight, recall under half hp: recalls that get hit and ones that finish. */
const fighter = () => ({
  async decide(obs) {
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    let action;
    if (obs.self.hp < obs.self.maxHp / 2) action = { kind: 'recall' };
    else if (foe) action = { kind: 'attack', target: foe.id };
    else action = { kind: 'move', target: { x: 500, y: 500 } };
    return { reply: JSON.stringify(action), action };
  },
});
const scripted = (opts = {}) =>
  h.runMatch({ seed: 5, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: fighter, cadenceSec: 1, backend: { kind: 'scripted' }, flush, recall: 'recall-2', economy: 'eco-1', objective: 'river-2', ...opts });
const recallLog = await scripted();
const recallLog2 = await scripted();

/**
 * A pvp-1 match whose pilots answer `act[i]` (default hold), with `recall-2` attached and, if asked,
 * the economy after it. Nothing has ticked.
 */
function setup({ economy = false } = {}) {
  const act = ROSTER.map(() => ({ kind: 'hold' }));
  const roster = ROSTER.map((s, i) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async () => act[i] }) }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  const recall = h.attachRecall(match, R, h.TICK_DT);
  const eco = economy ? h.attachEconomy(match, h.ECO_1, [], h.TICK_DT) : null;
  const tick = () => Math.round(match.clockSec / h.TICK_DT);
  const step = async () => {
    match.tick(h.TICK_DT);
    await flush();
  };
  const stepTo = async (t) => {
    while (tick() < t) await step();
  };
  const place = (i, p) => (match.bearbots[i].pos = { x: p.x, y: p.y });
  /** Set a bot's current action directly, so it applies on the very next tick (no 0.5 s poll lag). */
  const force = (i, action) => (match.pilotState.get(match.bearbots[i].id).currentAction = action);
  const starts = (i) => recall.events.filter((e) => e.bot === i && e.kind === 'start');
  const ends = (i) => recall.events.filter((e) => e.bot === i && e.kind !== 'start');
  return { match, recall, eco, act, tick, step, stepTo, place, force, starts, ends, bots: match.bearbots };
}

/** Bot 0 (violet drums) at mid, at 100 hp, starts recalling; returns the channel's first tick. */
async function channelAtMid(s) {
  s.place(0, MID);
  s.bots[0].hp = 100;
  s.act[0] = { kind: 'recall' };
  while (!s.starts(0).length) await s.step();
  return s.starts(0)[0].tick;
}

/** Green violin (5) lands exactly one hit on bot 0 on tick `t` (it stands next to it, cooldown ready). */
async function hitOn(s, t) {
  s.place(5, { x: s.bots[0].pos.x + 20, y: s.bots[0].pos.y });
  await s.stepTo(t - 1);
  s.bots[5].attackTimer = 0;
  s.force(5, { kind: 'attack', target: s.bots[0].id });
  await s.step(); // tick t: the hit lands
  s.force(5, { kind: 'hold' });
  s.act[5] = { kind: 'hold' };
}

test('constants come from recall-2.json: a 4.0 s channel, interruptible for its first 3.5 s', () => {
  assert.deepEqual(R, { name: 'recall-2', channelSec: 4, interruptibleSec: 3.5 });
});

test('resolveRecall: a name, a recorded rule, none; unknown names fail; off by default (the specimen 3x run)', () => {
  assert.equal(h.resolveRecall('recall-2'), R);
  assert.equal(h.resolveRecall(undefined), null);
  assert.equal(h.resolveRecall('none'), null);
  const recorded = { ...R, channelSec: 5 };
  assert.equal(h.resolveRecall(recorded), recorded);
  assert.throws(() => h.resolveRecall('recall-9'), /unknown recall rule/);
  assert.equal(h.DEFAULT_RECALL, null);
});

test('a recall channels 4.0 s standing still (the sim never starts its 3x run), then teleports home at full hp', async () => {
  const s = setup();
  const start = await channelAtMid(s);
  for (let t = start; t < start + CHANNEL - 1; t++) {
    await s.stepTo(t);
    assert.deepEqual({ ...s.bots[0].pos }, MID, `still at mid on tick ${t}`);
    assert.equal(s.bots[0].recalling, false, 'the sim is not recalling');
    assert.equal(s.recall.channelling(0), true);
  }
  await s.stepTo(start + CHANNEL - 1); // the 80th tick of the channel
  assert.deepEqual({ ...s.bots[0].pos }, VIOLET_BASE, 'teleported to its own fountain');
  assert.equal(s.bots[0].hp, s.bots[0].maxHp, 'full heal on arrival');
  assert.deepEqual(s.ends(0).map((e) => [e.kind, e.tick]), [['home', start + CHANNEL - 1]]);
  assert.equal(s.match.pilotState.get(s.bots[0].id).currentAction.kind, 'hold');
});

test('damage in the first 3.5 s cancels it: the bot stays where it is and holds', async () => {
  const s = setup();
  const start = await channelAtMid(s);
  const at = { ...s.bots[0].pos };
  s.act[0] = { kind: 'hold' }; // so the pilot does not issue it again straight away
  await hitOn(s, start + 10);
  assert.ok(s.bots[0].hp < 100, 'the hit landed');
  assert.deepEqual(s.ends(0).map((e) => e.kind), ['damage']);
  assert.equal(s.recall.channelling(0), false);
  assert.deepEqual({ ...s.bots[0].pos }, at, 'not moved');
  assert.equal(s.match.pilotState.get(s.bots[0].id).currentAction.kind, 'hold');
});

test('the window boundary: a hit on the channel\'s 70th tick (3.45–3.5 s) cancels, one on its 71st does not', async () => {
  const late = setup();
  const s1 = await channelAtMid(late);
  await hitOn(late, s1 + WINDOW - 1);
  assert.deepEqual(late.ends(0).map((e) => e.kind), ['damage'], 'last interruptible tick');

  const immune = setup();
  const s2 = await channelAtMid(immune);
  await hitOn(immune, s2 + WINDOW);
  assert.equal(immune.recall.channelling(0), true, 'the last 0.5 s ignores damage');
  await immune.stepTo(s2 + CHANNEL - 1);
  assert.deepEqual(immune.ends(0).map((e) => e.kind), ['home']);
  assert.deepEqual({ ...immune.bots[0].pos }, VIOLET_BASE);
  assert.equal(immune.bots[0].hp, immune.bots[0].maxHp);
});

test('after an interrupt the recall must be re-issued, and the new channel starts from 0', async () => {
  const s = setup();
  const start = await channelAtMid(s);
  s.act[0] = { kind: 'hold' }; // the pilot stops asking for it
  await hitOn(s, start + 30);
  await s.stepTo(start + 30 + 2 * HZ);
  assert.equal(s.starts(0).length, 1, 'no new channel without a new recall');
  s.act[0] = { kind: 'recall' };
  while (s.starts(0).length < 2) await s.step();
  const again = s.starts(0)[1].tick;
  await s.stepTo(again + CHANNEL - 2);
  assert.equal(s.recall.channelling(0), true, 'a fresh 4 s, not the remainder');
  await s.stepTo(again + CHANNEL - 1);
  assert.deepEqual(s.ends(0).map((e) => e.kind), ['damage', 'home']);
});

test('choosing another action cancels it; a hold, or the recall asked again, does not', async () => {
  const s = setup();
  const start = await channelAtMid(s);
  await s.stepTo(start + 20); // the pilot answered `recall` again at every 0.5 s poll meanwhile
  assert.equal(s.starts(0).length, 1, 'the repeated recall continued the channel');
  s.act[0] = { kind: 'hold' };
  await s.stepTo(start + 40);
  assert.equal(s.recall.channelling(0), true, 'hold keeps channelling');
  s.act[0] = { kind: 'move', target: { x: 500, y: 300 } };
  await s.stepTo(start + 60);
  assert.deepEqual(s.ends(0).map((e) => e.kind), ['action']);
  assert.notDeepEqual({ ...s.bots[0].pos }, MID, 'and the bot walks off');
});

test('death ends the channel (economy on, so the bot can die and come back)', async () => {
  const s = setup({ economy: true });
  const start = await channelAtMid(s);
  await s.stepTo(start + 5);
  s.bots[0].hp = 1;
  await hitOn(s, start + 10);
  assert.equal(s.bots[0].alive, false);
  assert.deepEqual(s.ends(0).map((e) => e.kind), ['death']);
  assert.equal(s.recall.channelling(0), false);
});

test('a teleported bot is at its shop the same tick (the economy runs after the recall)', async () => {
  const s = setup({ economy: true });
  const start = await channelAtMid(s);
  await s.stepTo(start + CHANNEL - 1);
  assert.equal(s.eco.atShop(0), true);
});

test('the summary counts channels started and how each ended, per bot', async () => {
  const s = setup();
  const start = await channelAtMid(s);
  await hitOn(s, start + 5);
  while (s.starts(0).length < 2) await s.step();
  await s.stepTo(s.starts(0)[1].tick + CHANNEL - 1);
  const sum = s.recall.summary();
  assert.equal(sum.name, 'recall-2');
  assert.deepEqual(sum.bots[0], { started: 2, home: 1, damage: 1, action: 0, death: 0 });
  assert.deepEqual(sum.bots[1], { started: 0, home: 0, damage: 0, action: 0, death: 0 });
});

// --- logs and replay -------------------------------------------------------------------------------

test('a recall-2 log records the rule, every channel, and carries r in its checkpoints', () => {
  assert.deepEqual(recallLog.recall, R);
  const sum = recallLog.result.recall;
  const total = (k) => sum.bots.reduce((n, b) => n + b[k], 0);
  assert.ok(total('started') >= 3, `channels ${total('started')}`);
  assert.ok(total('home') >= 1, 'some got home');
  assert.ok(total('damage') >= 1, 'some were interrupted');
  assert.ok(Array.isArray(JSON.parse(recallLog.checkpoints[0].state).r), 'checkpoint has r');
});

test('replay determinism: a recall-2 log replay-verifies, a second run reproduces it, a changed or missing rule diverges', async () => {
  const v = await h.verifyReplay(recallLog, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
  assert.equal(v.checkpointsCompared, recallLog.checkpoints.length);
  assert.deepEqual(recallLog2.checkpoints, recallLog.checkpoints);
  assert.deepEqual(recallLog2.result.recall, recallLog.result.recall);
  assert.equal((await h.verifyReplay({ ...recallLog, recall: { ...R, channelSec: 3 } }, flush)).ok, false);
  const stripped = { ...recallLog };
  delete stripped.recall;
  assert.equal((await h.verifyReplay(stripped, flush)).ok, false, 'replaying with the specimen recall diverges');
});

test('a match without a recall rule writes no recall field and no r in its checkpoints', async () => {
  const log = await scripted({ recall: undefined, maxSimSec: 30 });
  assert.equal('recall' in log, false);
  assert.equal('recall' in log.result, false);
  assert.equal(JSON.parse(log.checkpoints[0].state).r, undefined);
});

test('old logs replay unchanged: committed v1 and pvp-1 (economy) logs still verify', async () => {
  for (const f of ['runs/jam-sample-drums-vs-violin.json', 'runs/house-prompt-2026-09-21-r1-house-vs-drums-seed7.json', 'runs/economy-p1-smoke-2026-09-30-m1-medium-vs-hard-s7.json']) {
    const log = JSON.parse(await readFile(path.join(ROOT, f), 'utf8'));
    assert.equal(log.recall, undefined, f);
    const v = await h.verifyReplay(log, flush);
    assert.equal(v.ok, true, `${f} diverged at ${v.firstDivergenceTick}`);
  }
});
