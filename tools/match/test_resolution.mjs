/**
 * Tick resolution (`src/resolution.ts`): the frozen sim's sequential order favours violet, and
 * `simultaneous-1` makes a mirror match its own mirror image. Matches built by hand; no server.
 * The measurements behind it: runs/side-fairness-2026-10-01.md.
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
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const hold = () => ({ decide: async () => ({ kind: 'hold' }) });

/**
 * The game's ScriptedPilot (src/pilots/scriptedPilot.ts), restated here: a pilot that plays the
 * same way from either side, so a fair sim plays the same match from both. Push, hit the nearest
 * enemy with whatever ability is ready, recall low.
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

function build({ map = 'pvp-1', resolution, pilot = hold, seed = 1 }) {
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: pilot }));
  const match = new h.Match(seed, roster);
  h.applyMapVariant(match, h.resolveMap(map));
  h.attachResolution(match, h.resolveResolution(resolution));
  return match;
}

/** Bots holding at base, 600 s: one-second samples of each team's minions inside an enemy tower's range. */
function minionsUnderEnemyTowers(opts) {
  const match = build(opts);
  const under = { violet: 0, green: 0 };
  const alive = { violet: 0, green: 0 };
  for (let t = 1; t <= 600 / h.TICK_DT; t++) {
    match.tick(h.TICK_DT);
    if (t % 20) continue;
    for (const m of match.minions) {
      if (!m.alive) continue;
      alive[m.team] += 1;
      if (match.towers.some((tw) => tw.alive && tw.team !== m.team && d2(tw.pos, m.pos) <= tw.attackRange)) under[m.team] += 1;
    }
  }
  return { under, alive };
}

test('bots at base on pvp-1: the sequential order pushes violet minions onto green towers; simultaneous-1 is even', () => {
  const seq = minionsUnderEnemyTowers({ resolution: 'sequential' });
  assert.deepEqual(seq.under, { violet: 48, green: 2 }, 'the edge §13.3 of the economy spec measured');
  assert.ok(seq.alive.violet > seq.alive.green);
  const sim = minionsUnderEnemyTowers({ resolution: 'simultaneous-1' });
  assert.equal(sim.under.violet, sim.under.green);
  assert.equal(sim.alive.violet, sim.alive.green);
  // the specimen map was already even, and stays so
  const v1 = minionsUnderEnemyTowers({ map: 'v1', resolution: 'simultaneous-1' });
  assert.deepEqual(v1.under, { violet: 741, green: 741 });
});

/**
 * Everything one team has, as the other team would see it in a mirror: (x, y) -> (y, x) swaps the
 * bases and maps every lane onto itself, reversed.
 */
function sideState(match, team, mirror) {
  const p = (pos) => (mirror ? [pos.y, pos.x] : [pos.x, pos.y]).map((v) => Math.round(v * 1e6) / 1e6);
  return {
    bots: match.bearbots.filter((b) => b.team === team).map((b) => [b.lane, ...p(b.pos), b.hp, b.alive]),
    minions: match.minions.filter((m) => m.team === team && m.alive).map((m) => [m.lane, ...p(m.pos), m.hp].join(' ')).sort(),
    towers: match.towers.filter((t) => t.team === team).map((t) => [t.lane, t.tier, t.hp]),
    nexus: match.nexuses.filter((n) => n.team === team).map((n) => n.hp),
  };
}

async function mirrorMatch(resolution, seconds = 600) {
  const match = build({ resolution, pilot: mirrorPilot });
  let firstAsymmetricTick = null;
  for (let t = 1; t <= seconds / h.TICK_DT && !match.ended; t++) {
    match.tick(h.TICK_DT);
    await flush();
    if (firstAsymmetricTick === null && JSON.stringify(sideState(match, 'violet', false)) !== JSON.stringify(sideState(match, 'green', true))) {
      firstAsymmetricTick = t;
    }
  }
  return { match, firstAsymmetricTick };
}

test('a mirror match (the same pilot on both sides) stays its own mirror image every tick under simultaneous-1', async () => {
  const seq = await mirrorMatch('sequential', 120);
  assert.notEqual(seq.firstAsymmetricTick, null, 'the sequential order breaks the mirror');
  const sim = await mirrorMatch('simultaneous-1');
  assert.equal(sim.firstAsymmetricTick, null);
  const deaths = (team) => sim.match.bearbots.filter((b) => b.team === team && !b.alive).length;
  assert.equal(deaths('violet'), deaths('green'));
  assert.equal(sim.match.winner, null);
});

test('simultaneous-1: a unit killed this step still acts this step, and dies at its end', () => {
  const match = build({ resolution: 'simultaneous-1' });
  const [vb, , , gb] = match.bearbots;
  // two bots in range of each other, each one hit from dead, each attacking the other
  vb.pos = { x: 500, y: 500 };
  gb.pos = { x: 520, y: 500 };
  vb.hp = 1;
  gb.hp = 1;
  const ps = match.pilotState;
  ps.get(vb.id).currentAction = { kind: 'attack', target: gb.id };
  ps.get(gb.id).currentAction = { kind: 'attack', target: vb.id };
  ps.get(vb.id).nextDecisionAt = Infinity;
  ps.get(gb.id).nextDecisionAt = Infinity;
  match.tick(h.TICK_DT);
  assert.deepEqual([vb.alive, gb.alive], [false, false], 'a trade: both die');
  assert.deepEqual([vb.hp, gb.hp], [0, 0]);

  const seq = build({ resolution: 'sequential' });
  const [sv, , , sg] = seq.bearbots;
  sv.pos = { x: 500, y: 500 };
  sg.pos = { x: 520, y: 500 };
  sv.hp = 1;
  sg.hp = 1;
  for (const [a, b] of [[sv, sg], [sg, sv]]) {
    seq.pilotState.get(a.id).currentAction = { kind: 'attack', target: b.id };
    seq.pilotState.get(a.id).nextDecisionAt = Infinity;
  }
  seq.tick(h.TICK_DT);
  assert.deepEqual([sv.alive, sg.alive], [true, false], 'the frozen order: violet swings first and green never does');
});

test('simultaneous-1: a move lands at the end of the step, so a bot stepping into range does not hand the first swing to the other', () => {
  const match = build({ resolution: 'simultaneous-1' });
  const [vb, , , gb] = match.bearbots;
  const range = vb.attackRange;
  // just out of range; one bot's step this tick would bring the other into range
  vb.pos = { x: 500, y: 500 };
  gb.pos = { x: 500 + range + 1, y: 500 };
  for (const [a, b] of [[vb, gb], [gb, vb]]) {
    match.pilotState.get(a.id).currentAction = { kind: 'attack', target: b.id };
    match.pilotState.get(a.id).nextDecisionAt = Infinity;
  }
  match.tick(h.TICK_DT);
  assert.equal(vb.hp, vb.maxHp);
  assert.equal(gb.hp, gb.maxHp);
  assert.ok(Math.abs(d2(vb.pos, gb.pos) - (range + 1 - 2 * vb.moveSpeed * h.TICK_DT)) < 1e-9, 'both stepped');
});

test('the log records the resolution; replay applies it; a sequential log is written exactly as before', async () => {
  const SIDES = { violet: { name: 'ann', promptFile: 'ann.md', promptText: 'ann' }, green: { name: 'bo', promptFile: 'bo.md', promptText: 'bo' } };
  const mock = (opts) => h.runMatch({ seed: 7, sides: SIDES, callModelFor: (i) => h.mockCallModel(100 + i), cadenceSec: 2, backend: { kind: 'mock' }, flush, maxSimSec: 120, ...opts });
  assert.equal(h.DEFAULT_RESOLUTION, 'simultaneous-1');
  const fair = await mock({});
  assert.equal(fair.resolution, 'simultaneous-1');
  assert.ok((await h.verifyReplay(fair, flush)).ok);
  const seq = await mock({ resolution: 'sequential' });
  assert.equal('resolution' in seq, false, 'a sequential log has no field, like every log before it');
  assert.ok((await h.verifyReplay(seq, flush)).ok);
  // the field is what makes the replay right: dropping it replays the frozen order and diverges
  const { resolution: _, ...stripped } = fair;
  assert.equal((await h.verifyReplay(stripped, flush)).ok, false);
  // with the economy too (attribution wraps the replaced minion step; kill credit still adds up)
  const eco = await mock({ economy: 'eco-2', maxSimSec: 240 });
  assert.ok((await h.verifyReplay(eco, flush)).ok);
  const kills = eco.result.economy.bots.reduce((n, b) => n + b.kills, 0);
  const deaths = eco.result.economy.bots.reduce((n, b) => n + b.deaths, 0);
  assert.ok(kills <= deaths, `${kills} kills credited for ${deaths} deaths`);
  // every layer at once: the channelled recall and the river objective wrap `tick`, around this one
  const all = await mock({ economy: 'eco-2', objective: 'river-2', recall: 'recall-2', maxSimSec: 240 });
  assert.equal(all.resolution, 'simultaneous-1');
  assert.ok((await h.verifyReplay(all, flush)).ok);
});

test('attach rules: a fresh match only, before any other layer; names are checked', () => {
  assert.equal(h.resolveResolution(undefined), 'sequential');
  assert.throws(() => h.resolveResolution('simultaneous-9'), /unknown resolution "simultaneous-9"/);
  const ticked = build({ resolution: 'sequential' });
  ticked.tick(h.TICK_DT);
  assert.throws(() => h.attachResolution(ticked, 'simultaneous-1'), /fresh match/);
  const wrapped = build({ resolution: 'sequential' });
  h.attachEconomy(wrapped, h.ECO_2, [], h.TICK_DT);
  assert.throws(() => h.attachResolution(wrapped, 'simultaneous-1'), /before any other layer/);
  const twice = build({ resolution: 'simultaneous-1' });
  assert.throws(() => h.attachResolution(twice, 'simultaneous-1'), /already attached/);
  assert.equal(h.getResolution(twice), 'simultaneous-1');
  assert.equal(h.getResolution(wrapped), 'sequential');
});
