/**
 * The pvp-2 map (`src/mapVariant.ts` PVP_2_MAP, runs/pvp-2-2026-10-02.md): its scaled geometry
 * (`src/geometry.ts`), its speed boost (`src/homeguard.ts`) and its teleport (`src/teleport.ts`) —
 * one test per rule, on matches built by hand with pilots that do exactly what the test says, plus a
 * recorded match's replay and the guarantee that pvp-1 attaches none of it. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();
const P2 = h.PVP_2_MAP;
const S = P2.scale;
const HZ = Math.round(1 / h.TICK_DT);
const TP = P2.teleport;
const HG = P2.homeguard;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];

// A recorded pvp-2 match, played before any test registers (a hand-built match takes entity ids from
// the sim's global counter, which would break the replay's id remap if it ran in the middle).
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
/** Teleports to its own lane's outer tower once it is ready and away from it, fights what it sees, else walks up. */
const teleporter = () => ({
  async decide(obs) {
    const foe = obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    const mine = obs.teleport.towers.find((t) => t.lane === obs.self.lane && t.tier === 2) ?? obs.teleport.towers[0];
    let action;
    if (obs.self.hp < obs.self.maxHp / 2) action = { kind: 'recall' };
    else if (foe) action = { kind: 'attack', target: foe.id };
    else if (mine && (obs.teleport.ready || obs.teleport.channel) && obs.clockSec > 60) action = { kind: 'ability', ability: 'teleport', target: mine.id };
    else action = { kind: 'move', target: { x: 665, y: 665 } };
    return { reply: JSON.stringify(action), action };
  },
});
const recorded = await h.runMatch({
  seed: 9, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: teleporter, cadenceSec: 1, backend: { kind: 'scripted' }, flush,
  map: 'pvp-2', resolution: 'simultaneous-1', recall: 'recall-2', economy: 'eco-3-late', objective: 'river-2-set10', finale: 'final-chorus-1', maxSimSec: 240,
});

/** A match on `map` whose pilots answer `act[i]` (default hold), with its map rules and recall-2 attached. Nothing has ticked. */
function setup({ map = 'pvp-2', economy = false } = {}) {
  const act = ROSTER.map(() => ({ kind: 'hold' }));
  const roster = ROSTER.map((s, i) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async (obs) => ((seen[i] = obs), act[i]) }) }));
  const seen = ROSTER.map(() => null);
  const variant = h.resolveMap(map);
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, variant);
  h.attachResolution(match, 'simultaneous-1');
  const rules = h.attachMapRules(match, variant, 'simultaneous-1');
  const recall = h.attachRecall(match, h.RECALL_2, h.TICK_DT);
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
  const force = (i, action) => (match.pilotState.get(match.bearbots[i].id).currentAction = action);
  return { match, ...rules, recall, eco, act, seen, tick, step, stepTo, place, force, bots: match.bearbots };
}

const tower = (match, team, lane, tier) => match.towers.find((t) => t.team === team && t.lane === lane && t.tier === tier);

// --- geometry -------------------------------------------------------------------------------------

test('pvp-2 is opt-in and pvp-1 stays the default; pvp-1 registers no geometry and no map rules', () => {
  assert.equal(h.DEFAULT_MAP.name, 'pvp-1');
  assert.equal(h.resolveMap('pvp-2'), P2);
  assert.deepEqual(P2.towerFractions, [0.16, 0.35]);
  assert.deepEqual(P2.laneTowerFractions, { mid: [0.16, 0.375] });
  assert.equal(S, 1.33);
  assert.deepEqual(TP, { name: 'teleport-1', channelSec: 5, cooldownSec: 90, landOffset: 40 });
  assert.deepEqual(HG, { name: 'homeguard-1', speedMult: 1.5, baseRadius: 200 });
  const s = setup({ map: 'pvp-1' });
  assert.equal(s.homeguard, null);
  assert.equal(s.teleport, null);
  assert.equal(h.mapGeometry(s.match).scale, 1);
  assert.deepEqual({ ...s.match.nexuses[0].pos }, { x: 100, y: 900 });
});

test('a scaled map needs the simultaneous-1 resolution', () => {
  const match = new h.Match(1, ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async () => ({ kind: 'hold' }) }) })));
  h.applyMapVariant(match, P2);
  assert.throws(() => h.attachMapRules(match, P2, 'sequential'), /simultaneous-1/);
});

test('everything stands on the world x1.33: nexuses, towers at their lane fractions, bots at 0.08 down their lane', () => {
  const s = setup();
  const geo = h.mapGeometry(s.match);
  assert.equal(geo.scale, S);
  assert.deepEqual({ ...s.match.nexuses.find((n) => n.team === 'violet').pos }, { x: 100 * S, y: 900 * S });
  assert.deepEqual({ ...s.match.nexuses.find((n) => n.team === 'green').pos }, { x: 900 * S, y: 100 * S });
  // mid's outer towers: 0.375 of the way along the scaled diagonal from each base
  const vMid = tower(s.match, 'violet', 'mid', 2).pos;
  assert.ok(near(vMid.x, (100 + 0.375 * 800) * S) && near(vMid.y, (900 - 0.375 * 800) * S), JSON.stringify(vMid));
  // top's outer tower: 0.35 of a 2128-unit L lane = 744.8 up the first leg
  const vTop = tower(s.match, 'violet', 'top', 2).pos;
  assert.ok(near(vTop.x, 133) && near(vTop.y, 1197 - 0.35 * 1600 * S), JSON.stringify(vTop));
  const gTop1 = tower(s.match, 'green', 'top', 1).pos;
  assert.ok(near(gTop1.y, 133) && near(gTop1.x, 1197 - 0.16 * 1600 * S), JSON.stringify(gTop1));
  for (const t of s.match.towers) assert.equal(t.attackRange, 160);
  // violet drums spawns 0.08 up the top lane: 170.24 from its base
  assert.ok(near(s.bots[0].pos.x, 133) && near(s.bots[0].pos.y, 1197 - 0.08 * 1600 * S));
});

test('the coverage geometry: a neutral stretch between front towers in every lane, and a blank behind them', () => {
  const cov = Object.fromEntries(h.laneCoverage(P2).map((c) => [c.lane, c]));
  assert.ok(near(cov.mid.length, 1131.37 * S, 0.1));
  assert.ok(cov.mid.neutralLength > 40 && cov.mid.neutralLength < 70, `mid neutral ${cov.mid.neutralLength}`);
  for (const lane of ['top', 'bottom']) {
    assert.ok(cov[lane].neutralLength > 250, `${lane} neutral ${cov[lane].neutralLength}`);
    assert.ok(cov[lane].innerGapLength > 70, `${lane} inner gap ${cov[lane].innerGapLength}`);
  }
  assert.ok(cov.mid.innerGapLength > 0 && cov.mid.innerGapLength < 10, `mid inner gap ${cov.mid.innerGapLength}`);
  // pvp-1 has no blank behind its outer towers
  for (const c of h.laneCoverage(h.PVP_MAP)) assert.equal(c.innerGapLength, 0, c.lane);
});

test('minion waves spawn at the scaled lane ends and walk the scaled lanes', async () => {
  const s = setup();
  await s.stepTo(30 * HZ + 1);
  const geo = h.mapGeometry(s.match);
  assert.equal(s.match.minions.length, 18);
  for (const m of s.match.minions) {
    const base = geo.base[m.team];
    assert.ok(Math.hypot(m.pos.x - base.x, m.pos.y - base.y) < 60, `${m.id} spawned at ${JSON.stringify(m.pos)}`);
  }
  await s.stepTo(45 * HZ);
  for (const m of s.match.minions) {
    const p = h.pointAlongPath(geo.lanePaths[m.lane], m.pathT);
    assert.ok(near(m.pos.x, p.x, 1e-9) && near(m.pos.y, p.y, 1e-9), `${m.id} is on its scaled lane`);
  }
});

// --- the speed boost ------------------------------------------------------------------------------

test('a bot that has been in base moves 1.5x as fast, and pilots see it', async () => {
  const s = setup();
  await s.step();
  assert.equal(s.homeguard.on[0], true);
  assert.equal(s.bots[0].moveSpeed, 55 * HG.speedMult);
  await s.stepTo(HZ); // the next poll (every 0.5 s) sees it
  assert.equal(s.seen[0].self.speedBoost, true);
});

test('the boost ends on damage, and on entering the river; back in base it comes back', async () => {
  const s = setup();
  await s.step();
  // bot 0 walks off: still boosted outside base
  s.place(0, { x: 400, y: 900 });
  await s.step();
  assert.equal(s.homeguard.on[0], true);
  // a hit ends it
  s.place(5, { x: 420, y: 900 });
  s.bots[5].attackTimer = 0;
  s.force(5, { kind: 'attack', target: s.bots[0].id });
  await s.step();
  assert.equal(s.homeguard.on[0], false);
  assert.equal(s.bots[0].moveSpeed, 55);
  s.force(5, { kind: 'hold' });
  // back to base: on again; then into the river: off
  s.place(0, h.mapGeometry(s.match).base.violet);
  await s.step();
  assert.equal(s.homeguard.on[0], true);
  s.place(0, { x: 600, y: 600 });
  await s.step();
  assert.equal(s.homeguard.on[0], false);
  const sum = s.homeguard.summary();
  assert.equal(sum.bots[0].damage, 1);
  assert.equal(sum.bots[0].river, 1);
});

test('the boost multiplies with the economy: items and the boost both apply', async () => {
  const s = setup({ economy: true });
  await s.step();
  assert.equal(s.bots[0].moveSpeed, 55 * 1.5);
});

// --- the teleport ---------------------------------------------------------------------------------

test('a teleport channels 5 s standing still, then lands 40 units from the tower toward home; cooldown 90 s from the landing', async () => {
  const s = setup();
  const tw = tower(s.match, 'violet', 'mid', 2);
  s.place(0, { x: 300, y: 1000 });
  s.act[0] = { kind: 'ability', ability: 'teleport', target: tw.id };
  await s.step();
  await s.step();
  const start = s.teleport.events.find((e) => e.kind === 'start' && e.bot === 0);
  assert.ok(start, 'channel started');
  const at = { ...s.bots[0].pos };
  await s.stepTo(start.tick + TP.channelSec * HZ - 2);
  assert.deepEqual({ ...s.bots[0].pos }, at, 'stands still while channelling');
  await s.stepTo(start.tick + TP.channelSec * HZ - 1);
  const home = h.mapGeometry(s.match).base.violet;
  const d = Math.hypot(home.x - tw.pos.x, home.y - tw.pos.y);
  assert.ok(near(s.bots[0].pos.x, tw.pos.x + ((home.x - tw.pos.x) * 40) / d), JSON.stringify(s.bots[0].pos));
  assert.ok(near(s.bots[0].pos.y, tw.pos.y + ((home.y - tw.pos.y) * 40) / d));
  assert.ok(s.teleport.events.some((e) => e.kind === 'arrive' && e.bot === 0));
  // the cooldown is 90 s from the landing; asking again meanwhile does nothing
  s.act[0] = { kind: 'ability', ability: 'teleport', target: tower(s.match, 'violet', 'top', 2).id };
  await s.stepTo(s.tick() + HZ); // past the next poll
  assert.equal(s.teleport.channel[0], null);
  assert.ok(s.seen[0].teleport.cooldownSec > 88 && !s.seen[0].teleport.ready, JSON.stringify(s.seen[0].teleport));
});

test('another action, a recall, the bot dying or the tower falling cancels the channel; damage does not', async () => {
  const s = setup();
  const tw = tower(s.match, 'violet', 'mid', 2);
  const go = { kind: 'ability', ability: 'teleport', target: tw.id };
  s.place(0, { x: 300, y: 1000 });
  s.force(0, go);
  s.act[0] = go;
  await s.step();
  // damage does not cancel
  s.place(5, { x: 320, y: 1000 });
  s.bots[5].attackTimer = 0;
  s.force(5, { kind: 'attack', target: s.bots[0].id });
  await s.step();
  s.force(5, { kind: 'hold' });
  assert.ok(s.teleport.channel[0], 'still channelling after a hit');
  // a move cancels
  s.force(0, { kind: 'move', target: { x: 300, y: 900 } });
  s.act[0] = { kind: 'move', target: { x: 300, y: 900 } };
  await s.step();
  assert.equal(s.teleport.channel[0], null);
  assert.ok(s.teleport.events.some((e) => e.kind === 'action' && e.bot === 0));
  // a recall cancels
  s.force(0, go);
  s.act[0] = go;
  await s.step();
  assert.ok(s.teleport.channel[0]);
  s.force(0, { kind: 'recall' });
  s.act[0] = { kind: 'recall' };
  await s.step();
  assert.equal(s.teleport.channel[0], null);
  assert.ok(s.teleport.events.some((e) => e.kind === 'recall' && e.bot === 0));
  // a teleport cancels the recall's channel
  assert.equal(s.recall.channelling(0), true);
  s.force(0, go);
  s.act[0] = go;
  await s.step();
  assert.equal(s.recall.channelling(0), false);
  assert.ok(s.teleport.channel[0]);
  // the tower falling cancels
  tw.hp = 0;
  tw.alive = false;
  await s.step();
  assert.equal(s.teleport.channel[0], null);
  assert.ok(s.teleport.events.some((e) => e.kind === 'tower' && e.bot === 0));
});

test('a teleport aims only at a standing tower of the bot\'s own team', async () => {
  const s = setup();
  const enemyTower = tower(s.match, 'green', 'mid', 2);
  s.force(0, { kind: 'ability', ability: 'teleport', target: enemyTower.id });
  s.act[0] = { kind: 'ability', ability: 'teleport', target: enemyTower.id };
  await s.step();
  await s.step();
  assert.equal(s.teleport.channel[0], null);
  assert.equal(s.teleport.events.length, 0);
});

test('every pilot sees every teleport in progress, both teams\', and its own team\'s towers map-wide', async () => {
  const s = setup();
  const tw = tower(s.match, 'violet', 'bottom', 2);
  s.force(0, { kind: 'ability', ability: 'teleport', target: tw.id });
  s.act[0] = { kind: 'ability', ability: 'teleport', target: tw.id };
  s.place(4, { x: tw.pos.x + 100, y: tw.pos.y });
  await s.stepTo(HZ);
  const greenView = s.seen[3];
  assert.equal(greenView.teleports.length, 1);
  assert.equal(greenView.teleports[0].id, s.bots[0].id);
  assert.equal(greenView.teleports[0].tower, tw.id);
  assert.equal(greenView.teleports[0].lane, 'bottom');
  assert.ok(greenView.teleports[0].leftSec > 3 && greenView.teleports[0].leftSec < 5);
  const violetView = s.seen[1];
  assert.equal(violetView.teleport.towers.length, 6);
  assert.equal(violetView.teleport.towers.find((t) => t.id === tw.id).enemyBearbots, 1);
  assert.equal(s.seen[0].teleport.channel.tower, tw.id);
});

// --- a recorded match -----------------------------------------------------------------------------

test('a recorded pvp-2 match records its map, teleports and boosts, and replays exactly', async () => {
  assert.equal(recorded.map.name, 'pvp-2');
  assert.equal(recorded.map.scale, S);
  assert.ok(recorded.result.teleport.bots.some((b) => b.arrive > 0), JSON.stringify(recorded.result.teleport.bots));
  assert.ok(recorded.result.homeguard.bots.every((b) => b.boostedTicks > 0));
  const v = await h.verifyReplay(recorded, flush);
  assert.equal(v.ok, true, JSON.stringify(v));
});
