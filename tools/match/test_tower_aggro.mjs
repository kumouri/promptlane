/**
 * Tower aggro (`src/towerAggro.ts`, `aggro-1`): a tower retargets a bearbot that damages a bearbot
 * of the tower's team from inside its range. Matches built by hand for the rule itself (trigger,
 * window, leaving range, what doesn't count), then the runner: off by default (a log is what it was
 * before), recorded and replayed when on, and what pilots see. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();
const A1 = h.AGGRO_1;

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

// The runner's logs are played before any test is registered (see test_recall.mjs: a hand-built
// match made meanwhile would take entity ids out of the middle of the log being recorded).
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
/** Walk the lane toward the enemy base and hit the nearest enemy bearbot in sight, else anything in sight. */
const pusher = () => ({
  async decide(obs) {
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    const action = foe ? { kind: 'attack', target: foe.id } : { kind: 'move', target: BASE[other(obs.self.team)] };
    return { reply: JSON.stringify(action), action };
  },
});
const seen = [];
const watching = () => {
  const inner = pusher();
  return { decide: (obs) => (seen.push(structuredClone(obs)), inner.decide(obs)) };
};
const scripted = (opts = {}) =>
  h.runMatch({ seed: 5, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: pusher, cadenceSec: 1, backend: { kind: 'scripted' }, flush, maxSimSec: 240, ...opts });
const withAggro = await scripted({ towerAggro: 'aggro-1' });
const without = await scripted();
const namedNone = await scripted({ towerAggro: 'none' });
const jamStack = await scripted({ towerAggro: 'aggro-1', map: 'pvp-1-hp400', economy: 'eco-3-late', objective: 'river-2-set10', recall: 'recall-2', finale: 'final-chorus-1', maxSimSec: 600 });
const observed = await scripted({ towerAggro: 'aggro-1', decisionPilotFor: (i) => (i === 1 ? watching() : pusher()) });

/**
 * A pvp-1 `simultaneous-1` match, tower aggro attached when `aggro`. Once it is set up, bot `i`'s
 * pilot plays `plan[i](n, s)` on its n-th ask (an action, or undefined = hold); before that every
 * pilot holds. Green's mid outer tower has a violet keytar A and a violet minion (which stands still
 * and deals nothing) inside its range, and green's violin V beside A.
 */
async function setup({ aggro = true, plan = {}, mapName = 'pvp-1', pick = (t) => t.team === 'green' && t.lane === 'mid' && t.tier === 2 } = {}) {
  const s = { ready: false };
  const asks = ROSTER.map(() => 0);
  const roster = ROSTER.map((slot, i) => ({
    ...slot,
    pilotKind: 'scripted',
    makePilot: () => ({
      decide: async () => (s.ready && plan[i] ? plan[i](asks[i]++, s) : undefined) ?? { kind: 'hold' },
    }),
  }));
  const match = new h.Match(1, roster);
  const map = h.resolveMap(mapName);
  h.applyMapVariant(match, map);
  const resolution = h.resolveResolution('simultaneous-1');
  h.attachResolution(match, resolution);
  h.attachMapRules(match, map, resolution);
  s.match = match;
  s.layer = aggro ? h.attachTowerAggro(match, A1, h.TICK_DT) : null;
  s.step = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      match.tick(h.TICK_DT);
      await flush();
    }
  };
  s.tower = match.towers.find(pick);
  s.at = (u, dx, dy) => {
    u.pos.x = s.tower.pos.x + dx;
    u.pos.y = s.tower.pos.y + dy;
  };
  [s.A, s.V] = [match.bearbots[1], match.bearbots[5]];
  while (!match.minions.some((m) => m.team === 'violet')) await s.step(); // the first wave (bots hold at base meanwhile)
  s.minion = match.minions.find((m) => m.team === 'violet');
  match.minions.splice(0, match.minions.length, s.minion); // only this one minion
  s.minion.moveSpeed = 0;
  s.minion.attackDamage = 0;
  s.minion.hp = s.minion.maxHp = 10000; // outlives every test
  s.at(s.minion, -60, 60);
  s.at(s.A, -100, 100); // 141 from the tower: inside its 160
  s.at(s.V, -100, 40); // 60 from A: inside the keytar's 160
  s.ready = true;
  /** Step until V has been hit (the tick of the hit), at most `max` ticks. */
  s.untilHit = async (max = 40) => {
    for (let t = 0; t < max && s.V.hp === s.V.maxHp; t++) await s.step();
    assert.ok(s.V.hp < s.V.maxHp, 'the keytar hit the violin');
  };
  return s;
}

const SHOT = 18;
const attackV = (_n, s) => ({ kind: 'attack', target: s.V.id });
const attackOnce = (n, s) => (n === 0 ? { kind: 'attack', target: s.V.id } : { kind: 'hold' });

test('aggro-1 is a named rule, off by default; an unknown name refuses', () => {
  assert.deepEqual(A1, { name: 'aggro-1', windowSec: 3 });
  assert.equal(h.DEFAULT_TOWER_AGGRO, null);
  assert.equal(h.resolveTowerAggro(undefined), null);
  assert.equal(h.resolveTowerAggro('none'), null);
  assert.equal(h.resolveTowerAggro('aggro-1'), A1);
  assert.equal(h.resolveTowerAggro(A1), A1, 'a recorded rule (a log`s towerAggro) is used as recorded');
  assert.throws(() => h.resolveTowerAggro('aggro-9'), /unknown tower aggro rule/);
});

test('without the rule the tower keeps shooting the minion while the keytar hits under it', async () => {
  const s = await setup({ aggro: false, plan: { 1: attackV } });
  const a0 = s.A.hp;
  await s.untilHit();
  const m0 = s.minion.hp;
  await s.step(80); // 4 s
  assert.equal(s.A.hp, a0, 'the specimen tower never shot the keytar');
  assert.ok(s.minion.hp < m0, 'it shot the minion');
});

test('a hit on a bearbot of the tower`s team from inside its range turns its next shot on the attacker', async () => {
  const s = await setup({ plan: { 1: attackV } });
  const a0 = s.A.hp;
  await s.untilHit();
  const m0 = s.minion.hp; // the tower's step in the hit's tick already saw the lock
  await s.step(19); // the tower's cooldown is 20 ticks, so exactly one shot lands in [hit, hit + 19]
  assert.equal(a0 - s.A.hp, SHOT, 'one tower shot, at the keytar');
  assert.equal(s.minion.hp, m0, 'none at the minion');
  const sum = s.layer.summary();
  assert.equal(sum.teams.green.triggers, 1);
  assert.equal(sum.teams.green.triggersWithMinions, 1, 'a dive: the tower had a violet minion in range');
  assert.equal(sum.teams.green.aggroShots, 1);
  assert.equal(sum.teams.green.retargetedShots, 1);
  assert.deepEqual(sum.teams.violet, { triggers: 0, triggersWithMinions: 0, aggroShots: 0, retargetedShots: 0, kills: 0 });
});

test('one hit holds the tower for 3 s (three shots), then it goes back to the minion', async () => {
  const s = await setup({ plan: { 1: attackOnce } });
  const a0 = s.A.hp;
  await s.untilHit();
  const m0 = s.minion.hp;
  await s.step(20 * 6); // 6 s
  assert.equal(s.V.hp, s.V.maxHp - s.A.attackDamage, 'the keytar hit once');
  assert.equal(a0 - s.A.hp, 3 * SHOT, 'three tower shots at the keytar, then none');
  assert.ok(s.minion.hp < m0, 'the tower went back to the minion');
  assert.equal(s.layer.summary().teams.green.aggroShots, 3);
});

test('leaving the tower`s range drops the lock: coming back inside the window draws no more fire', async () => {
  const s = await setup({ plan: { 1: attackOnce } });
  await s.untilHit();
  const aHit = s.A.hp;
  s.at(s.A, -200, 200); // 283 from the tower
  await s.step();
  s.at(s.A, -100, 100); // back inside, 0.05 s later
  const m0 = s.minion.hp;
  await s.step(40);
  assert.ok(aHit - s.A.hp <= 0, 'no shot at the keytar after it left');
  assert.ok(s.minion.hp < m0, 'the tower went back to the minion');
});

test('what does not count: a hit from outside the tower`s range, a hit on a minion, a minion hitting a bearbot', async () => {
  // The victim inside the range, the attacker (keytar, range 160) outside it: the rule's other reading.
  const out = await setup({ plan: { 1: attackV } });
  out.at(out.A, -150, 150); // 212 from the tower
  out.at(out.V, -60, 60);
  await out.untilHit();
  await out.step(40);
  assert.equal(out.layer.summary().teams.green.triggers, 0);
  assert.equal(out.A.hp, out.A.maxHp);

  const s = await setup({ plan: { 1: (_n, st) => ({ kind: 'attack', target: st.minion.id }) } });
  s.minion.team = 'green'; // the keytar hits a green minion under green's tower
  await s.step(60);
  assert.ok(s.minion.hp < s.minion.maxHp);
  assert.equal(s.layer.summary().teams.green.triggers, 0);
  assert.equal(s.layer.summary().teams.green.aggroShots, 0);

  const m = await setup();
  m.minion.team = 'green';
  m.minion.attackDamage = 6;
  m.at(m.minion, -100, 120); // beside the keytar
  await m.step(60);
  assert.ok(m.A.hp < m.A.maxHp, 'the green minion (and the tower) hit the keytar');
  assert.equal(m.layer.summary().teams.violet.triggers + m.layer.summary().teams.green.triggers, 0);
});

test('a killing blow counts, and a shot that kills the locked attacker is a kill', async () => {
  const s = await setup({ plan: { 1: attackV } });
  s.V.hp = 1; // the keytar's first hit kills
  s.A.hp = SHOT; // and the tower's first shot kills the keytar
  for (let t = 0; t < 40 && s.A.alive; t++) await s.step();
  assert.equal(s.V.alive, false);
  assert.equal(s.A.alive, false);
  assert.equal(s.layer.summary().teams.green.kills, 1);
});

test('a tower a map adds gets the rule too: the base tower (pvp-1-hp300-base700)', async () => {
  const s = await setup({ plan: { 1: attackV }, mapName: 'pvp-1-hp300-base700', pick: (t) => t.team === 'green' && h.isBaseTower(t) });
  assert.ok(s.tower, 'the map has a green base tower');
  await s.untilHit();
  assert.equal(s.layer.lockOf(s.tower.id)?.target, s.A.id, 'the base tower is locked on the keytar');
  const m0 = s.minion.hp;
  await s.step(19);
  assert.equal(s.minion.hp, m0, 'no tower in range shot the minion');
  assert.ok(s.layer.summary().teams.green.triggersWithMinions >= 1);
});

test('attaching after something wrapped the tower step refuses', async () => {
  const roster = ROSTER.map((slot) => ({ ...slot, pilotKind: 'scripted', makePilot: () => ({ decide: async () => ({ kind: 'hold' }) }) }));
  const match = new h.Match(1, roster);
  match.updateTowers = match.updateTowers.bind(match); // as attribution does
  assert.throws(() => h.attachTowerAggro(match, A1, h.TICK_DT), /fresh match/);
});

/** A log's actions with entity ids made relative to its `idBase` (the id counter is global to the process). */
const actionsOf = (log) =>
  log.decisions.map((d) => JSON.stringify(d.action).replace(/"([a-z]+)-(\d+)"/g, (_m, k, n) => `"${k}-${Number(n) - log.idBase}"`));

test('the runner: off by default and under "none", the same log as before; recorded whole when on', () => {
  assert.equal('towerAggro' in without, false);
  assert.equal('towerAggro' in namedNone, false);
  assert.equal(without.result.towerAggro, undefined);
  assert.deepEqual(namedNone.checkpoints, without.checkpoints);
  assert.deepEqual(actionsOf(namedNone), actionsOf(without));
  assert.deepEqual(withAggro.towerAggro, A1);
  assert.equal(withAggro.result.towerAggro.name, 'aggro-1');
  assert.ok(withAggro.checkpoints.every((c) => JSON.parse(c.state).a), 'every checkpoint carries the locks');
  assert.ok(without.checkpoints.every((c) => !('a' in JSON.parse(c.state))));
});

test('a log with tower aggro replays under it; the same decisions without it diverge', async () => {
  const v = await h.verifyReplay(withAggro, flush);
  assert.equal(v.ok, true, JSON.stringify(v));
  const j = await h.verifyReplay(jamStack, flush);
  assert.equal(j.ok, true, JSON.stringify(j));
  const fired = ['violet', 'green'].reduce((n, t) => n + jamStack.result.towerAggro.teams[t].aggroShots, 0);
  assert.ok(fired > 0, 'the pushers drew tower fire in the Jam-stack match');
  const { towerAggro: _drop, ...rest } = withAggro;
  const off = await h.verifyReplay(rest, flush);
  if (withAggro.result.towerAggro.teams.violet.aggroShots + withAggro.result.towerAggro.teams.green.aggroShots > 0) {
    assert.equal(off.ok, false, 'a tower shot went elsewhere without the rule');
  }
});

test('pilots see the rule, and each listed tower`s lock', () => {
  assert.ok(seen.length > 0);
  assert.ok(seen.every((o) => o.towerAggro && o.towerAggro.name === 'aggro-1' && o.towerAggro.windowSec === 3));
  assert.ok(seen.every((o) => o.nearbyTowers.every((t) => 'aggro' in t)));
  const locked = seen.flatMap((o) => o.nearbyTowers.filter((t) => t.aggro));
  for (const t of locked) {
    assert.equal(typeof t.aggro.target, 'string');
    assert.ok(t.aggro.leftSec > 0 && t.aggro.leftSec <= 3);
  }
  assert.equal(observed.towerAggro.name, 'aggro-1');
});

test('committed logs replay unchanged: none of them has tower aggro, and each still verifies', async () => {
  for (const f of ['runs/economy-p1-smoke-2026-09-30-m1-medium-vs-hard-s7.json', 'runs/jam-sample-drums-vs-violin.json']) {
    const log = JSON.parse(await readFile(path.join(ROOT, f), 'utf8'));
    assert.equal(log.towerAggro, undefined, f);
    const v = await h.verifyReplay(log, flush);
    assert.equal(v.ok, true, `${f}: ${JSON.stringify(v)}`);
  }
});
