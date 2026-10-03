/**
 * Tower hp on a map variant (`src/mapVariant.ts` `towerHp` / `nexusHp`, the opt-in `pvp-1-hp400`,
 * runs/tower-hp-2026-10-02.md): what the variant sets, that it is recorded and replays, that a variant
 * without it leaves the specimen's 900 / 2200 alone, and that the Final Chorus rescales from the cut
 * hp. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();

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
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
/** Walk the lane toward the enemy base and hit what is in sight, so towers take damage. */
const pusher = () => ({
  async decide(obs) {
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    const action = foe ? { kind: 'attack', target: foe.id } : { kind: 'move', target: BASE[other(obs.self.team)] };
    return { reply: JSON.stringify(action), action };
  },
});
const scripted = (opts = {}) =>
  h.runMatch({ seed: 5, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: pusher, cadenceSec: 1, backend: { kind: 'scripted' }, flush, economy: 'eco-3', objective: 'river-2-set10', recall: 'recall-2', finale: 'final-chorus-1', ...opts });

// Played before any test is registered: a hand-built match made meanwhile would take entity ids out
// of the middle of the log being recorded (test_recall.mjs).
const onCut = await scripted({ map: 'pvp-1-hp400' });
const onPvp1 = await scripted({ map: 'pvp-1' });

function built(map) {
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async () => ({ kind: 'hold' }) }) }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap(map));
  return match;
}

test('pvp-1-hp400 is pvp-1 with outer towers at 400 and inner at 600; opt-in, pvp-1 stays the default', () => {
  const v = h.resolveMap('pvp-1-hp400');
  const { name, towerHp, ...geometry } = v;
  const { name: _n, ...pvp1 } = h.PVP_MAP;
  assert.equal(name, 'pvp-1-hp400');
  assert.deepEqual(towerHp, [600, 400]);
  assert.deepEqual(geometry, pvp1, 'same towers, same range');
  assert.equal(h.DEFAULT_MAP.name, 'pvp-1');
  assert.ok(!('towerHp' in h.PVP_MAP) && !('nexusHp' in h.PVP_MAP));
});

test('the variant sets each tower`s hp and maxHp by tier before the first tick; the nexus keeps 2200', () => {
  const m = built('pvp-1-hp400');
  for (const t of m.towers) {
    const want = t.tier === 2 ? 400 : 600;
    assert.equal(t.hp, want, `${t.team} ${t.lane} tier ${t.tier}`);
    assert.equal(t.maxHp, want);
  }
  for (const n of m.nexuses) assert.deepEqual([n.hp, n.maxHp], [2200, 2200]);
});

test('a variant without towerHp leaves the specimen`s 900 and 2200 alone; nexusHp sets the nexus', () => {
  const m = built('pvp-1');
  for (const t of m.towers) assert.deepEqual([t.hp, t.maxHp], [900, 900]);
  for (const n of m.nexuses) assert.deepEqual([n.hp, n.maxHp], [2200, 2200]);
  const custom = built({ ...h.PVP_MAP, name: 'x', nexusHp: 1500 });
  for (const t of custom.towers) assert.equal(t.hp, 900);
  for (const n of custom.nexuses) assert.deepEqual([n.hp, n.maxHp], [1500, 1500]);
});

test('a played match records the cut in its map and replays exactly; without the cut it does not', async () => {
  assert.deepEqual(onCut.map, h.resolveMap('pvp-1-hp400'));
  assert.equal(onCut.map.towerHp[1], 400);
  const v = await h.verifyReplay(onCut, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
  // The same decisions on the uncut towers diverge from the first checkpoint (tower hp is in it).
  const uncut = await h.verifyReplay({ ...onCut, map: { ...onCut.map, towerHp: undefined } }, flush);
  assert.equal(uncut.ok, false);
});

test('a pvp-1 log has no towerHp in its map and replays as before', async () => {
  assert.ok(!('towerHp' in onPvp1.map));
  const v = await h.verifyReplay(onPvp1, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
});

test('the Final Chorus rescales from the cut hp: a level match enters sudden death at a third of 400 and 600', async () => {
  const m = built('pvp-1-hp400');
  h.attachResolution(m, h.resolveResolution('simultaneous-1'));
  h.attachFinale(m, h.FINAL_CHORUS_1, h.TICK_DT);
  const chorus = Math.round(h.FINAL_CHORUS_1.atSec / h.TICK_DT);
  m.clockSec = (chorus - 1) * h.TICK_DT;
  m.tick(h.TICK_DT);
  await flush();
  for (const t of m.towers) assert.equal(t.maxHp, (t.tier === 2 ? 400 : 600) / 3);
});
