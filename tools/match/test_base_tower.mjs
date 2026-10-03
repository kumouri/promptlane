/**
 * The base tower (`src/baseTower.ts`, the opt-in map `pvp-1-hp300-base700`, runs/nexus-guard-2026-10-02.md):
 * where it stands, its backdoor protection, that its fall wins the match as a nexus kill, and that a
 * played match records it and replays. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();

const MAP = 'pvp-1-hp300-base700';
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
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
/** Violet walks the lane toward green's base and hits what is in sight; green holds at home. eco-3 respawns violet (the sim alone doesn't). */
const pusher = (_i, team) => ({
  async decide(obs) {
    if (team === 'green') return { reply: '{"kind":"hold"}', action: { kind: 'hold' } };
    const towers = obs.visibleEnemies.filter((e) => e.kind === 'tower');
    const foe = towers[0] ?? obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    const action = foe ? { kind: 'attack', target: foe.id } : { kind: 'move', target: BASE[other(obs.self.team)] };
    return { reply: JSON.stringify(action), action };
  },
});
const scripted = (opts = {}) =>
  h.runMatch({ seed: 5, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: pusher, cadenceSec: 1, backend: { kind: 'scripted' }, flush, economy: 'eco-3', resolution: 'simultaneous-1', ...opts });

// Played before any test is registered: a hand-built match made meanwhile would take entity ids out
// of the middle of the log being recorded (test_recall.mjs).
const onBase = await scripted({ map: MAP });
const onPvp1 = await scripted({ map: 'pvp-1' });

function built(map = MAP, { finale = false } = {}) {
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async () => ({ kind: 'hold' }) }) }));
  const match = new h.Match(1, roster);
  const variant = typeof map === 'string' ? h.resolveMap(map) : map;
  h.applyMapVariant(match, variant);
  h.attachResolution(match, h.resolveResolution('simultaneous-1'));
  h.attachMapRules(match, variant, 'simultaneous-1');
  if (finale) h.attachFinale(match, h.FINAL_CHORUS_1, h.TICK_DT);
  return match;
}
const tick = (m) => m.tick(h.TICK_DT);
const baseOf = (m, team) => m.towers.find((t) => t.team === team && h.isBaseTower(t));
const nexusOf = (m, team) => m.nexuses.find((n) => n.team === team);
const inner = (m, team, lane = 'top') => m.towers.find((t) => t.team === team && t.lane === lane && t.tier === 1);

test('pvp-1-hp300-base700 is pvp-1 with towers at 300 / 500 and a 700 base tower; opt-in, pvp-1 stays the default', () => {
  const v = h.resolveMap(MAP);
  const { name, towerHp, baseTower, ...geometry } = v;
  const { name: _n, ...pvp1 } = h.PVP_MAP;
  assert.equal(name, MAP);
  assert.deepEqual(towerHp, [500, 300]);
  assert.deepEqual(baseTower, { hp: 700, standoff: 100, needsInnerDown: true });
  assert.deepEqual(geometry, pvp1, 'same lane towers, same range');
  assert.equal(h.DEFAULT_MAP.name, 'pvp-1');
  assert.ok(!('baseTower' in h.PVP_MAP) && !('baseTower' in h.resolveMap('pvp-1-hp400')));
});

test('one base tower per team stands 100 in front of its nexus on the mid lane, at 700 hp, with the map`s range', () => {
  const m = built();
  assert.equal(m.towers.length, 14);
  for (const team of ['violet', 'green']) {
    const b = baseOf(m, team);
    assert.equal(b.tier, h.BASE_TOWER_TIER);
    assert.equal(b.lane, 'mid');
    assert.deepEqual([b.hp, b.maxHp, b.attackRange], [700, 700, 160]);
    assert.ok(Math.abs(dist(b.pos, nexusOf(m, team).pos) - 100) < 1e-9);
    assert.ok(dist(b.pos, BASE[other(team)]) < dist(BASE[team], BASE[other(team)]), 'in front: toward the enemy');
    for (const lane of ['top', 'mid', 'bottom']) assert.ok(dist(b.pos, inner(m, team, lane).pos) > 56, `${lane} inner tower doesn't overlap it`);
  }
  for (const t of m.towers.filter((t) => !h.isBaseTower(t))) assert.equal(t.hp, t.tier === 2 ? 300 : 500);
  const plain = built('pvp-1');
  assert.equal(plain.towers.length, 12);
  assert.equal(h.getBaseTowers(plain), undefined);
});

test('protected: a base tower and its nexus shrug off damage until one of that team`s inner towers falls', () => {
  const m = built();
  baseOf(m, 'green').hp -= 650;
  nexusOf(m, 'green').hp -= 2000;
  tick(m);
  assert.equal(baseOf(m, 'green').hp, 700, 'undone at the end of the tick');
  assert.equal(nexusOf(m, 'green').hp, 2200);
  // Green's top inner tower falls: green's base tower is open from that tick on, violet's is not.
  inner(m, 'green').hp = 0;
  inner(m, 'green').alive = false;
  baseOf(m, 'green').hp -= 650;
  baseOf(m, 'violet').hp -= 650;
  nexusOf(m, 'green').hp -= 2000;
  tick(m);
  assert.equal(baseOf(m, 'green').hp, 50, 'kept');
  assert.equal(baseOf(m, 'violet').hp, 700, 'violet`s inner towers all stand');
  assert.equal(nexusOf(m, 'green').hp, 2200, 'the nexus stays untouchable while its base tower stands');
  assert.equal(m.ended, false);
  const s = h.getBaseTowers(m).summary();
  assert.equal(s.openedTick.green, 2);
  assert.equal(s.openedTick.violet, null);
});

test('a fallen base tower takes its nexus: the other team wins on that tick, endReason nexus', () => {
  const m = built();
  inner(m, 'violet', 'mid').hp = 0;
  inner(m, 'violet', 'mid').alive = false;
  tick(m);
  baseOf(m, 'violet').hp = 0;
  baseOf(m, 'violet').alive = false;
  tick(m);
  assert.equal(m.ended, true);
  assert.equal(m.winner, 'green');
  assert.equal(m.endReason, 'nexus');
  assert.equal(nexusOf(m, 'violet').alive, false);
  assert.equal(h.getBaseTowers(m).summary().fellTick.violet, 2);
});

test('both base towers on one tick is a draw, not violet`s nexus checked first', () => {
  const m = built();
  for (const team of ['violet', 'green']) {
    inner(m, team).hp = 0;
    inner(m, team).alive = false;
    baseOf(m, team).hp = 0;
    baseOf(m, team).alive = false;
  }
  tick(m);
  assert.equal(m.ended, true);
  assert.equal(m.winner, null);
  assert.equal(m.endReason, 'nexus');
});

test('needsInnerDown false: a base tower keeps damage from the first tick', () => {
  const v = { ...h.resolveMap(MAP), name: 'x', baseTower: { hp: 700, standoff: 100, needsInnerDown: false } };
  const m = built(v);
  baseOf(m, 'green').hp -= 100;
  tick(m);
  assert.equal(baseOf(m, 'green').hp, 600);
  assert.deepEqual(h.getBaseTowers(m).summary().openedTick, { violet: 0, green: 0 });
});

test('the Final Chorus counts the base towers, rescales them to a third, and protection holds in sudden death', async () => {
  const m = built(MAP, { finale: true });
  const chorus = Math.round(h.FINAL_CHORUS_1.atSec / h.TICK_DT);
  m.clockSec = (chorus - 1) * h.TICK_DT;
  tick(m);
  await flush();
  assert.equal(h.getFinale(m).towersAtChorus.violet, 7);
  assert.equal(baseOf(m, 'green').maxHp, 700 / 3);
  baseOf(m, 'green').hp -= 100;
  tick(m);
  assert.equal(baseOf(m, 'green').hp, 700 / 3);
  assert.equal(m.ended, false);
});

test('a played match records the base tower in its map and result, and replays exactly', async () => {
  assert.deepEqual(onBase.map, h.resolveMap(MAP));
  assert.ok(onBase.result.baseTower, 'summary recorded');
  const v = await h.verifyReplay(onBase, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
  const without = await h.verifyReplay({ ...onBase, map: { ...onBase.map, baseTower: undefined } }, flush);
  assert.equal(without.ok, false, 'the same decisions without the base tower diverge');
});

test('the scripted push wins by downing the base tower', () => {
  assert.equal(onBase.result.winner, 'violet');
  assert.equal(onBase.result.endReason, 'nexus');
  assert.ok(onBase.result.baseTower.fellTick.green !== null);
  assert.ok(onBase.result.baseTower.openedTick.green <= onBase.result.baseTower.fellTick.green);
});

/** What bot `i`'s own pilot is handed: the sim's observation through every layer `attachMapRules` wrapped around it. */
async function seenBy(map, i) {
  const seen = [];
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async (obs) => (seen.push(obs), { kind: 'hold' }) }) }));
  const m = new h.Match(1, roster);
  const variant = h.resolveMap(map);
  h.applyMapVariant(m, variant);
  h.attachResolution(m, h.resolveResolution('simultaneous-1'));
  h.attachMapRules(m, variant, 'simultaneous-1');
  await m.pilotState.get(m.bearbots[i].id).pilot.decide(m.observe(m.bearbots[i]));
  return { m, obs: seen[0] };
}

test('pilots see both base towers map-wide, and whether each can be hit, by the rule the sim applies', () => {
  const m = built();
  const handed = h.getBaseTowers(m).observe(m.observe(m.bearbots[0])).baseTowers;
  assert.deepEqual(Object.keys(handed), ['own', 'enemy']);
  assert.equal(m.bearbots[0].team, 'violet');
  assert.equal(handed.own.id, baseOf(m, 'violet').id);
  assert.equal(handed.enemy.id, baseOf(m, 'green').id);
  assert.deepEqual([handed.enemy.hp, handed.enemy.maxHp, handed.enemy.alive, handed.enemy.canBeHit], [700, 700, true, false]);
  assert.ok(dist(m.bearbots[0].pos, handed.enemy.pos) > 390, 'listed map-wide, far beyond the 390 towers are listed within');
  inner(m, 'green', 'bottom').hp = 0;
  inner(m, 'green', 'bottom').alive = false;
  tick(m);
  const after = h.getBaseTowers(m).observe(m.observe(m.bearbots[0])).baseTowers;
  assert.equal(after.enemy.canBeHit, true, 'one of their inner towers is down');
  assert.equal(after.own.canBeHit, false);
  assert.equal(after.enemy.canBeHit, h.getBaseTowers(m).vulnerable('green'), 'one source of truth');
  const green = h.getBaseTowers(m).observe(m.observe(m.bearbots[3])).baseTowers;
  assert.equal(green.own.canBeHit, true, 'and green sees its own as open');
});

test('the layer hands every pilot the base towers; a map without them hands none', async () => {
  for (let i = 0; i < 6; i++) {
    const { m, obs } = await seenBy(MAP, i);
    assert.equal(obs.baseTowers.own.id, baseOf(m, m.bearbots[i].team).id);
    assert.equal(obs.baseTowers.enemy.id, baseOf(m, other(m.bearbots[i].team)).id);
  }
  assert.ok('teleport' in (await seenBy('pvp-2-hp400-base950', 0)).obs, 'pvp-2`s layers still wrap it');
  assert.ok('baseTowers' in (await seenBy('pvp-2-hp400-base950', 0)).obs);
  assert.ok(!('baseTowers' in (await seenBy('pvp-1', 0)).obs));
});

test('pvp-2-hp400-base950 is pvp-2 with towers at 400 / 700 and a 950 base tower 133 in front of its nexus; opt-in', () => {
  const v = h.resolveMap('pvp-2-hp400-base950');
  const { name, towerHp, baseTower, ...rest } = v;
  const { name: _n, ...pvp2 } = h.PVP_2_MAP;
  assert.deepEqual(towerHp, [700, 400]);
  assert.deepEqual(baseTower, { hp: 950, standoff: 100, needsInnerDown: true });
  assert.deepEqual(rest, pvp2, 'pvp-2 otherwise: scale, towers, boost, teleport');
  assert.equal(h.DEFAULT_MAP.name, 'pvp-1');
  const m = built(v);
  assert.equal(m.towers.length, 14);
  for (const team of ['violet', 'green']) {
    const b = baseOf(m, team);
    assert.deepEqual([b.hp, b.maxHp], [950, 950]);
    assert.ok(Math.abs(dist(b.pos, nexusOf(m, team).pos) - 133) < 1e-6);
  }
  for (const t of m.towers.filter((t) => !h.isBaseTower(t))) assert.equal(t.hp, t.tier === 2 ? 400 : 700);
});

test('a pvp-1 log has no base tower and replays as before', async () => {
  assert.ok(!('baseTower' in onPvp1.map));
  assert.ok(!('baseTower' in onPvp1.result));
  const v = await h.verifyReplay(onPvp1, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
});
