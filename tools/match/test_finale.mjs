/**
 * The Final Chorus (`src/finale.ts`, `final-chorus-1`, docs/fewer-draws-spec.md §4.1) — one test per
 * way a match can end under it and for the ×3 window, on matches built by hand, plus replay, the
 * default (off: a log is what it was before), committed logs, and a mirror match. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();
const F = h.FINAL_CHORUS_1;
const CHORUS = Math.round(F.atSec / h.TICK_DT); // 9600

const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];
const BASE = { violet: { x: 100, y: 900 }, green: { x: 900, y: 100 } };
const other = (t) => (t === 'violet' ? 'green' : 'violet');
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The logs are played before any test is registered (see test_recall.mjs: a hand-built match made
// meanwhile would take entity ids out of the middle of the log being recorded).
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
/** Walk the lane toward the enemy base and hit what is in sight: towers fall, so the finale has work. */
const pusher = () => ({
  async decide(obs) {
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    const action = foe ? { kind: 'attack', target: foe.id } : { kind: 'move', target: BASE[other(obs.self.team)] };
    return { reply: JSON.stringify(action), action };
  },
});
const scripted = (opts = {}) =>
  h.runMatch({ seed: 5, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: pusher, cadenceSec: 1, backend: { kind: 'scripted' }, flush, economy: 'eco-3', objective: 'river-2-set10', recall: 'recall-2', ...opts });
const withFinale = await scripted({ finale: 'final-chorus-1' });
const withoutFinale = await scripted();
const namedNone = await scripted({ finale: 'none' });

/** A pvp-1 `simultaneous-1` match whose pilots hold, with the finale attached last. Nothing has ticked. */
function setup() {
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async () => ({ kind: 'hold' }) }) }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  h.attachResolution(match, h.resolveResolution('simultaneous-1'));
  const finale = h.attachFinale(match, F, h.TICK_DT);
  const tick = () => Math.round(match.clockSec / h.TICK_DT);
  const step = async () => {
    match.tick(h.TICK_DT);
    await flush();
  };
  /** Jump the clock to just before tick `t` (bots hold at base, so nothing else needs to happen). */
  const jumpTo = (t) => (match.clockSec = t * h.TICK_DT);
  const kill = (u) => {
    u.hp = 0;
    u.alive = false;
  };
  const tower = (team, i = 0) => match.towers.filter((t) => t.team === team)[i];
  return { match, finale, tick, step, jumpTo, kill, tower };
}

test('final-chorus-1 is a named rule, off by default; an unknown name refuses', () => {
  assert.deepEqual(F, { name: 'final-chorus-1', atSec: 480, structureDamageMult: 3 });
  assert.equal(h.DEFAULT_FINALE, null);
  assert.equal(h.resolveFinale(undefined), null);
  assert.equal(h.resolveFinale('none'), null);
  assert.equal(h.resolveFinale('final-chorus-1'), F);
  assert.equal(h.resolveFinale(F), F, 'a recorded rule (a log`s finale) is used as recorded');
  assert.throws(() => h.resolveFinale('final-chorus-9'), /unknown finale/);
});

test('a tower lead at 8:00 wins on the spot', async () => {
  const s = setup();
  s.kill(s.tower('green'));
  s.jumpTo(CHORUS - 2);
  await s.step();
  assert.equal(s.match.ended, false, 'nothing happens before 8:00');
  await s.step();
  assert.equal(s.tick(), CHORUS);
  assert.equal(s.match.ended, true);
  assert.equal(s.match.winner, 'violet');
  assert.equal(s.match.endReason, 'chorus-lead');
  assert.deepEqual(s.finale.summary(), { name: F.name, chorusTick: CHORUS, towersAtChorus: { violet: 6, green: 5 }, suddenDeathTick: null });
  assert.equal(s.tower('violet').hp, 900, 'no rescale when a lead ends it');
});

test('level at 8:00: the ×3 window opens exactly then, as a rescale of every living structure', async () => {
  const s = setup();
  s.kill(s.tower('violet', 1));
  s.kill(s.tower('green', 1));
  s.tower('violet').hp = 600;
  s.jumpTo(CHORUS - 1);
  assert.equal(s.tower('green').hp, 900);
  await s.step();
  assert.equal(s.match.ended, false);
  assert.equal(s.finale.suddenDeath, true);
  assert.equal(s.tower('green').hp, 300);
  assert.equal(s.tower('green').maxHp, 300);
  assert.equal(s.tower('violet').hp, 200, 'a damaged tower keeps its share of hp: 600/900 = 200/300');
  assert.equal(s.tower('violet', 1).maxHp, 900, 'a fallen tower is left alone');
  for (const n of s.match.nexuses) assert.deepEqual([n.hp, n.maxHp], [2200 / 3, 2200 / 3]);
  assert.deepEqual(s.finale.summary().towersAtChorus, { violet: 5, green: 5 });
});

test('×3 in sudden death: the same bot hit takes three times the share of a tower it took before 8:00', async () => {
  const s = setup();
  const target = s.tower('green', 0);
  const bot = s.match.bearbots[0]; // violet drums
  const hitShare = async () => {
    bot.pos = { x: target.pos.x - 20, y: target.pos.y };
    bot.hp = bot.maxHp;
    bot.attackTimer = 0;
    s.match.pilotState.get(bot.id).currentAction = { kind: 'attack', target: target.id };
    const before = target.hp / target.maxHp;
    await s.step();
    s.match.pilotState.get(bot.id).currentAction = { kind: 'hold' };
    return before - target.hp / target.maxHp;
  };
  s.jumpTo(CHORUS - 10);
  const early = await hitShare();
  assert.ok(early > 0, 'the hit landed');
  assert.equal(s.finale.suddenDeath, false);
  s.jumpTo(CHORUS - 1);
  await s.step();
  assert.equal(s.finale.suddenDeath, true);
  const late = await hitShare();
  assert.ok(Math.abs(late / early - 3) < 1e-9, `×3: ${late} vs ${early}`);
});

test('sudden death: the first tower to fall wins; one each in the same tick plays on', async () => {
  const s = setup();
  s.jumpTo(CHORUS - 1);
  await s.step();
  assert.equal(s.finale.suddenDeath, true);
  s.kill(s.tower('violet', 2));
  s.kill(s.tower('green', 2));
  await s.step();
  assert.equal(s.match.ended, false, 'still level: 5-5');
  s.kill(s.tower('violet', 3));
  await s.step();
  assert.equal(s.match.ended, true);
  assert.equal(s.match.winner, 'green', 'the team that took the tower');
  assert.equal(s.match.endReason, 'sudden-death');
  assert.equal(s.finale.summary().suddenDeathTick, s.tick());
  assert.ok(s.match.clockSec < 600);
});

test('a nexus kill still ends it the sim`s own way, before or during sudden death', async () => {
  for (const at of [CHORUS - 50, CHORUS + 50]) {
    const s = setup();
    s.jumpTo(at < CHORUS ? at : CHORUS - 1);
    if (at > CHORUS) {
      await s.step();
      assert.equal(s.finale.suddenDeath, true);
    }
    s.kill(s.match.nexuses.find((n) => n.team === 'green'));
    await s.step();
    assert.equal(s.match.endReason, 'nexus');
    assert.equal(s.match.winner, 'violet');
  }
});

test('nothing falls in sudden death: 10:00 and the sim`s own tiebreak, never later', async () => {
  const s = setup();
  s.jumpTo(CHORUS - 1);
  while (!s.match.ended) await s.step();
  assert.equal(s.match.endReason, 'timeout');
  assert.equal(s.match.winner, null);
  // The sim's own 600 s check on its summed float clock (12,000 or 12,001 ticks, as without a finale).
  assert.ok(s.match.clockSec >= 600 && s.match.clockSec < 600 + 2 * h.TICK_DT, `ended at ${s.match.clockSec}`);
});

test('a played match records the rule and its summary, and replays exactly', async () => {
  assert.deepEqual(withFinale.finale, F);
  assert.ok(withFinale.result.finale, 'the summary is in the result');
  assert.ok(['chorus-lead', 'sudden-death', 'nexus', 'timeout'].includes(withFinale.result.endReason));
  assert.ok(withFinale.result.durationSec <= 600);
  const v = await h.verifyReplay(withFinale, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
  assert.equal(v.endReason, withFinale.result.endReason);
  // The same decisions replayed without the finale don't reproduce it once it has acted.
  if (withFinale.result.endReason === 'chorus-lead' || withFinale.result.endReason === 'sudden-death') {
    const { finale, ...rest } = withFinale;
    const off = await h.verifyReplay(rest, flush);
    assert.equal(off.ok, false);
  }
});

test('off by default: a match without a finale writes no field, and naming none is the same match', () => {
  // Entity ids come from a module-global counter, so two runs differ by an id offset: compare
  // everything that has no id in it, plus the header's keys.
  const strip = (log) => JSON.stringify({ keys: Object.keys(log), checkpoints: log.checkpoints, decisions: log.decisions.length, result: { ...log.result, stats: null } });
  assert.ok(!('finale' in withoutFinale));
  assert.ok(!('finale' in withoutFinale.result));
  assert.ok(!('finale' in namedNone));
  assert.equal(strip(namedNone), strip(withoutFinale));
  // Before 8:00 the finale changes nothing: every checkpoint up to the Chorus is the same.
  const upTo = (log) => log.checkpoints.filter((c) => c.tick < CHORUS);
  assert.deepEqual(upTo(withFinale), upTo(withoutFinale));
});

test('committed logs replay unchanged: none of them has a finale, and each still verifies', async () => {
  for (const f of ['runs/economy-p1-smoke-2026-09-30-m1-medium-vs-hard-s7.json', 'runs/jam-sample-drums-vs-violin.json']) {
    const log = JSON.parse(await readFile(path.join(ROOT, f), 'utf8'));
    assert.ok(!('finale' in log), f);
    const v = await h.verifyReplay(log, flush);
    assert.equal(v.ok, true, `${f} diverged at ${v.firstDivergenceTick}`);
  }
});

/**
 * The game's ScriptedPilot, restated (as in test_resolution.mjs): the same play from either side, so
 * a fair match is its own mirror image.
 */
const mirrorPilot = () => ({
  decide: async (obs) => {
    if (obs.self.hp / obs.self.maxHp < 0.25) return { kind: 'recall' };
    if (obs.visibleEnemies.length > 0) {
      const target = [...obs.visibleEnemies].sort((a, b) => d2(obs.self.pos, a.pos) - d2(obs.self.pos, b.pos))[0];
      const ready = Object.entries(obs.self.cooldowns).find(([, left]) => left === 0)?.[0];
      return ready ? { kind: 'ability', ability: ready, target: target.id } : { kind: 'attack', target: target.id };
    }
    const minion = obs.nearbyMinions.filter((m) => m.team !== obs.self.team).sort((a, b) => d2(obs.self.pos, a.pos) - d2(obs.self.pos, b.pos))[0];
    if (minion) return { kind: 'attack', target: minion.id };
    return { kind: 'move', target: BASE[other(obs.self.team)] };
  },
});

function sideState(match, team, mirror) {
  const p = (pos) => (mirror ? [pos.y, pos.x] : [pos.x, pos.y]).map((v) => Math.round(v * 1e6) / 1e6);
  return {
    bots: match.bearbots.filter((b) => b.team === team).map((b) => [b.lane, ...p(b.pos), b.hp, b.alive]),
    minions: match.minions.filter((m) => m.team === team && m.alive).map((m) => [m.lane, ...p(m.pos), m.hp].join(' ')).sort(),
    towers: match.towers.filter((t) => t.team === team).map((t) => [t.lane, t.tier, t.hp, t.maxHp]),
    nexus: match.nexuses.filter((n) => n.team === team).map((n) => [n.hp, n.maxHp]),
  };
}

test('a mirror match stays its own mirror image through the Chorus and sudden death, and ends drawn', async () => {
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: mirrorPilot }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  h.attachResolution(match, h.resolveResolution('simultaneous-1'));
  const finale = h.attachFinale(match, F, h.TICK_DT);
  let firstAsymmetricTick = null;
  let sawSuddenDeath = false;
  for (let t = 1; t <= 600 / h.TICK_DT && !match.ended; t++) {
    match.tick(h.TICK_DT);
    await flush();
    sawSuddenDeath ||= finale.suddenDeath;
    if (firstAsymmetricTick === null && JSON.stringify(sideState(match, 'violet', false)) !== JSON.stringify(sideState(match, 'green', true))) {
      firstAsymmetricTick = t;
    }
  }
  assert.equal(firstAsymmetricTick, null);
  assert.equal(sawSuddenDeath, true, 'level at 8:00, as a mirror must be');
  assert.equal(match.winner, null);
  assert.equal(match.endReason, 'timeout');
});
