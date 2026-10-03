/**
 * Bearbot damage to structures × k (`src/structureDamage.ts`, a map variant's `botStructureDamage`;
 * runs/tower-tune-2026-10-02.md): a bot's attack and ability on an enemy tower, base tower or nexus land
 * k times, and nothing else changes. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();

const BASE_MAP = 'pvp-1-hp300-base700';
const K = 1.33;
const amplified = { ...h.resolveMap(BASE_MAP), name: 'test-sd133', botStructureDamage: K };
const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];
const SIDES = {
  violet: { name: 'a', promptFile: 'a.md', promptText: 'a' },
  green: { name: 'b', promptFile: 'b.md', promptText: 'b' },
};
const BASE = { violet: { x: 100, y: 900 }, green: { x: 900, y: 100 } };
const other = (t) => (t === 'violet' ? 'green' : 'violet');
/** Violet walks the lane toward green's base and hits what is in sight; green holds. eco-3 respawns violet. */
const pusher = (_i, team) => ({
  async decide(obs) {
    if (team === 'green') return { reply: '{"kind":"hold"}', action: { kind: 'hold' } };
    const towers = obs.visibleEnemies.filter((e) => e.kind === 'tower');
    const foe = towers[0] ?? obs.visibleEnemies.find((e) => e.kind === 'bearbot') ?? obs.visibleEnemies[0];
    const action = foe ? { kind: 'attack', target: foe.id } : { kind: 'move', target: BASE[other(obs.self.team)] };
    return { reply: JSON.stringify(action), action };
  },
});
const scripted = (map) =>
  h.runMatch({ seed: 5, sides: SIDES, callModelFor: () => h.mockCallModel(1), decisionPilotFor: pusher, cadenceSec: 1, backend: { kind: 'scripted' }, flush, economy: 'eco-3', resolution: 'simultaneous-1', map });

// Played before any test is registered (test_base_tower.mjs: hand-built matches take entity ids out of a recording).
const onAmplified = await scripted(amplified);
const onPlain = await scripted(BASE_MAP);

function built(variant, resolution = 'simultaneous-1') {
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: () => ({ decide: async () => ({ kind: 'hold' }) }) }));
  const match = new h.Match(1, roster);
  const v = typeof variant === 'string' ? h.resolveMap(variant) : variant;
  h.applyMapVariant(match, v);
  h.attachResolution(match, h.resolveResolution(resolution));
  h.attachMapRules(match, v, resolution);
  return match;
}
const outer = (m, team, lane = 'top') => m.towers.find((t) => t.team === team && t.lane === lane && t.tier === 2);
const botOf = (m, team, lane = 'top') => m.bearbots.find((b) => b.team === team && b.lane === lane);
/** Put `bot` right next to `target` with its attack ready, and swing once (the sim's own approachAndAttack). */
function swing(m, bot, target) {
  bot.pos = { x: target.pos.x + 1, y: target.pos.y };
  bot.attackTimer = 0;
  m.approachAndAttack(bot, target, bot.moveSpeed, h.TICK_DT);
}

test('the tuned base-tower maps are opt-in, named by their numbers, and otherwise their parent map', () => {
  const strip = ({ name, towerHp, baseTower, botStructureDamage, ...rest }) => rest;
  const cases = [
    ['pvp-1-hp200-400-base600', 'pvp-1-hp300-base700', [400, 200], 600, undefined],
    ['pvp-1-hp300-base700-sd133', 'pvp-1-hp300-base700', [500, 300], 700, 1.33],
    ['pvp-2-hp260-560-base810', 'pvp-2-hp400-base950', [560, 260], 810, undefined],
    ['pvp-2-hp400-base950-sd133', 'pvp-2-hp400-base950', [700, 400], 950, 1.33],
  ];
  for (const [name, parent, towerHp, baseHp, k] of cases) {
    const v = h.resolveMap(name);
    assert.equal(v.name, name);
    assert.deepEqual(v.towerHp, towerHp, name);
    assert.deepEqual(v.baseTower, { ...h.resolveMap(parent).baseTower, hp: baseHp }, name);
    assert.equal(v.botStructureDamage, k, name);
    assert.deepEqual(strip(v), strip(h.resolveMap(parent)), `${name}: ${parent}'s layout and layers`);
  }
  assert.equal(h.DEFAULT_MAP.name, 'pvp-1');
  assert.equal(h.resolveMap('pvp-1-hp300-base700').botStructureDamage, undefined, 'the parent map is unchanged');
});

test('a bot`s attack on an enemy tower lands k times; on a minion or a bearbot it lands once', () => {
  const m = built(amplified);
  const bot = botOf(m, 'violet');
  const tower = outer(m, 'green');
  swing(m, bot, tower);
  assert.ok(Math.abs(tower.hp - (300 - K * bot.attackDamage)) < 1e-9, `tower at ${tower.hp}`);
  const foe = botOf(m, 'green');
  const before = foe.hp;
  swing(m, bot, foe);
  assert.equal(foe.hp, before - bot.attackDamage, 'a bearbot takes the plain hit');
});

test('an ability on a structure lands k times too (the keytar`s AoE burst)', () => {
  const m = built(amplified);
  const bot = botOf(m, 'violet', 'mid');
  const tower = outer(m, 'green', 'mid');
  const burst = h.INSTRUMENTS.keytar.abilities.find((a) => a.effect === 'aoe-burst');
  bot.pos = { x: tower.pos.x + 1, y: tower.pos.y };
  bot.cooldowns[burst.name] = 0;
  m.tryUseAbility(bot, { kind: 'ability', ability: burst.name, target: tower.id });
  assert.ok(Math.abs(tower.hp - (300 - K * burst.damage)) < 1e-9, `tower at ${tower.hp}`);
});

test('without the field, or at 1, nothing is attached and a hit is the sim`s own', () => {
  for (const v of [BASE_MAP, { ...amplified, botStructureDamage: 1 }]) {
    const m = built(v);
    assert.equal(Object.prototype.hasOwnProperty.call(m, 'approachAndAttack'), false);
    const bot = botOf(m, 'violet');
    const tower = outer(m, 'green');
    swing(m, bot, tower);
    assert.equal(tower.hp, 300 - bot.attackDamage);
  }
  assert.throws(() => built({ ...amplified, botStructureDamage: 0 }), /positive/);
});

test('a multiplied hit that crosses 0 kills the tower, under either resolution', () => {
  for (const resolution of ['sequential', 'simultaneous-1']) {
    const m = built(amplified, resolution);
    const bot = botOf(m, 'violet');
    const tower = outer(m, 'green');
    tower.hp = bot.attackDamage * 1.2; // one plain hit leaves it standing, one × 1.33 doesn't
    if (resolution === 'sequential') {
      swing(m, bot, tower);
    } else {
      // under simultaneous-1 a death is noted in the bearbot step and resolved at its end
      bot.pos = { x: tower.pos.x + 1, y: tower.pos.y };
      bot.attackTimer = 0;
      m.pilotState.get(bot.id).currentAction = { kind: 'attack', target: tower.id };
      m.updateBearbots(h.TICK_DT);
    }
    assert.equal(tower.alive, false, resolution);
  }
});

test('attribution hears one hit of k times the damage (the economy and the metrics tool see the same)', () => {
  const m = built(amplified);
  const hits = [];
  h.attachAttribution(m, (hit) => hits.push(hit));
  const bot = botOf(m, 'violet');
  const tower = outer(m, 'green');
  swing(m, bot, tower);
  assert.equal(hits.length, 1);
  assert.ok(Math.abs(hits[0].dmg - K * bot.attackDamage) < 1e-9);
});

test('a protected base tower still shrugs off a multiplied hit', () => {
  const m = built(amplified);
  const base = m.towers.find((t) => t.team === 'green' && h.isBaseTower(t));
  swing(m, botOf(m, 'violet', 'mid'), base);
  assert.ok(base.hp < 700);
  m.tick(h.TICK_DT);
  assert.equal(base.hp, 700);
});

test('a played match records the multiplier in its map, replays exactly, and towers fall sooner than on the plain map', async () => {
  assert.equal(onAmplified.map.botStructureDamage, K);
  const v = await h.verifyReplay(onAmplified, flush);
  assert.equal(v.ok, true, `diverged at ${v.firstDivergenceTick}`);
  const { botStructureDamage: _k, ...plainMap } = onAmplified.map;
  const without = await h.verifyReplay({ ...onAmplified, map: plainMap }, flush);
  assert.equal(without.ok, false, 'the same decisions without the multiplier diverge');
  assert.ok(onAmplified.result.ticks <= onPlain.result.ticks, `${onAmplified.result.ticks} vs ${onPlain.result.ticks}`);
});
