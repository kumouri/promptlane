/**
 * The economy layer (`src/economy.ts`, docs/economy-spec.md §3) — one test per rule, on matches
 * built by hand with pilots that do exactly what the test says, plus replay determinism on the
 * game's deterministic mock model. No server, no key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, flush, loadHeadless, loadMetrics } from './load.mjs';

const h = await loadHeadless();
const metrics = await loadMetrics();

const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];
const ECO = h.ECO_1;
const withDeath = (death, pools = ECO.gold.pools) => ({ ...ECO, name: 'eco-test', gold: { ...ECO.gold, death: { ...ECO.gold.death, ...death }, pools } });
const SIDES = {
  violet: { name: 'ann', promptFile: 'ann.md', promptText: 'ann' },
  green: { name: 'bo', promptFile: 'bo.md', promptText: 'bo' },
};
const mock = (opts = {}) => h.runMatch({ seed: 7, sides: SIDES, callModelFor: (i) => h.mockCallModel(100 + i), cadenceSec: 2, backend: { kind: 'mock' }, flush, ...opts });
const ecoLog = await mock({ economy: 'eco-1', buildFor: (i) => (i === 2 ? ['metronome', 'Amp', 'metronome'] : undefined) });
const plainLog = await mock({ maxSimSec: 120 });

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} != ${b}`);

/** A pvp-1 match whose pilots return `actions[i]`, with the economy attached. Nothing has ticked. */
function setup({ ruleset = ECO, builds = [] } = {}) {
  const actions = ROSTER.map(() => ({ kind: 'hold' }));
  const seen = ROSTER.map(() => null);
  const roster = ROSTER.map((s, i) => ({
    ...s,
    pilotKind: 'scripted',
    makePilot: () => ({
      decide: async (obs) => {
        seen[i] = obs;
        return actions[i];
      },
    }),
  }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  const spawns = match.bearbots.map((b) => ({ ...b.pos }));
  const eco = h.attachEconomy(match, ruleset, builds, h.TICK_DT);
  const step = async (n = 1) => {
    for (let k = 0; k < n; k++) {
      match.tick(h.TICK_DT);
      await flush();
    }
  };
  const tick = () => Math.round(match.clockSec / h.TICK_DT);
  return { match, eco, actions, seen, step, tick, bots: match.bearbots, spawns };
}

/** Step one tick at a time until `bot` is dead (at most `max` ticks). */
async function stepUntilDead(s, bot, max = 60) {
  for (let k = 0; k < max && bot.alive; k++) await s.step(1);
  assert.equal(bot.alive, false, 'died within the limit');
}

/**
 * Violet drums (0) kills green drums (3) on neutral ground at mid, violet keytar (1) standing
 * within the 250 assist radius; violet violin (2) and the rest of green are at their spawns.
 */
async function midKill(opts = {}, carried = 400) {
  const s = setup(opts);
  s.bots[0].pos = { x: 500, y: 500 };
  s.bots[3].pos = { x: 520, y: 500 };
  s.bots[1].pos = { x: 600, y: 560 };
  s.bots[3].hp = 1;
  s.eco.bots[3].atRisk = carried;
  s.actions[0] = { kind: 'attack', target: s.bots[3].id };
  await s.step(2); // tick 1 asks, tick 2 attacks
  return s;
}

// --- death and the two pools (§3.3) -----------------------------------------------------------------

test('default (Q2-A): half the victim\'s at-risk gold goes to the killer and assisters; kill, assist pool and first blood are paid', async () => {
  const s = await midKill();
  assert.equal(s.bots[3].alive, false);
  const death = s.eco.events.find((e) => e.kind === 'death');
  assert.deepEqual({ killer: death.killer, assisters: death.assisters, carried: death.carried, loss: death.loss, paid: death.paid }, { killer: 0, assisters: [1], carried: 400, loss: 200, paid: 200 });
  assert.equal(s.eco.bots[3].atRisk, 200);
  assert.equal(s.eco.bots[3].lost, 200);
  assert.deepEqual(
    [0, 1, 2].map((i) => ({ kill: s.eco.bots[i].earned.kill, fb: s.eco.bots[i].earned['first-blood'], assist: s.eco.bots[i].earned.assist, drop: s.eco.bots[i].earned.drop })),
    [
      { kill: 200, fb: 100, assist: 0, drop: 100 },
      { kill: 0, fb: 0, assist: 100, drop: 100 },
      { kill: 0, fb: 0, assist: 0, drop: 0 },
    ],
    'the violin was too far away to assist',
  );
  assert.deepEqual([0, 1, 2].map((i) => s.eco.bots[i].xp), [60, 60, 0], 'kill XP to killer and assister');
});

test('first blood is paid once', async () => {
  const s = await midKill();
  s.bots[4].pos = { x: 520, y: 520 };
  s.bots[4].hp = 1;
  s.actions[0] = { kind: 'attack', target: s.bots[4].id };
  await stepUntilDead(s, s.bots[4]);
  assert.equal(s.eco.bots[0].earned['first-blood'], 100);
  assert.equal(s.eco.bots[0].earned.kill, 400);
});

test('the drop splits equally among killer and assisters, remainder to the killer; the payout share is a knob', async () => {
  const s = await midKill({}, 301); // loss 150, two recipients
  assert.deepEqual([s.eco.bots[0].earned.drop, s.eco.bots[1].earned.drop], [75, 75]);
  const odd = await midKill({}, 302); // loss 151
  assert.deepEqual([odd.eco.bots[0].earned.drop, odd.eco.bots[1].earned.drop], [76, 75]);
  const half = await midKill({ ruleset: withDeath({ toKillers: 0.5 }) }, 400); // loss 200, paid 100, 100 vanishes
  const ev = half.eco.events.find((e) => e.kind === 'death');
  assert.deepEqual([ev.loss, ev.paid], [200, 100]);
  assert.deepEqual([half.eco.bots[0].earned.drop, half.eco.bots[1].earned.drop], [50, 50]);
  assert.equal(half.eco.bots[3].atRisk, 200);
});

test('Dota-like preset: passive gold is safe, the loss is net worth / 40 out of the at-risk pool, and it vanishes', async () => {
  const dota = withDeath({ lossOfAtRisk: 0, lossOfNetWorth: 0.025, toKillers: 0 }, { safeSources: ['passive'] });
  const s = setup({ ruleset: dota });
  await s.step(40); // 2 s of passive
  assert.deepEqual([s.eco.bots[0].atRisk, s.eco.bots[0].safe], [0, 1], 'passive went to the safe pool');
  s.eco.bots[3].atRisk = 400;
  s.eco.bots[3].safe = 100;
  s.eco.bots[3].items = ['road-case']; // 300
  s.bots[3].pos = { x: 520, y: 500 }; // away from its shop
  await s.step(1); // its +35 % max hp lands first (and lifts hp with it)
  s.bots[0].pos = { x: 500, y: 500 };
  s.bots[3].hp = 1;
  s.actions[0] = { kind: 'attack', target: s.bots[3].id };
  await stepUntilDead(s, s.bots[3], 30); // dies before the next passive coin at tick 80
  const ev = s.eco.events.find((e) => e.kind === 'death');
  assert.equal(ev.loss, Math.floor(0.025 * (400 + 100 + 300)), 'net worth 800 → loss 20');
  assert.equal(ev.paid, 0);
  assert.equal(s.eco.bots[3].atRisk, 380);
  assert.equal(s.eco.bots[3].safe, 100, 'the safe pool is never touched');
  assert.equal(s.eco.bots[0].earned.drop, 0);
  assert.equal(s.eco.bots[0].earned.kill, 200, 'kill gold is separate from the loss');
});

test('League-like preset: nothing is lost on death', async () => {
  const s = await midKill({ ruleset: withDeath({ lossOfAtRisk: 0 }) });
  const ev = s.eco.events.find((e) => e.kind === 'death');
  assert.deepEqual([ev.loss, ev.paid], [0, 0]);
  assert.equal(s.eco.bots[3].atRisk, 400);
  assert.equal(s.eco.bots[0].earned.kill, 200);
});

test('the death loss can only come out of the at-risk pool', async () => {
  const rules = withDeath({ lossOfAtRisk: 1, lossOfNetWorth: 1 });
  const s = setup({ ruleset: rules });
  s.eco.bots[3].atRisk = 50;
  s.eco.bots[3].safe = 500;
  assert.equal(s.eco.deathLoss(3), 50);
});

test('execution: killed by a tower with no enemy bearbot damage in the window pays nobody, and the loss vanishes', async () => {
  const s = setup();
  const tower = s.match.towers.find((t) => t.team === 'violet' && t.lane === 'mid' && t.tier === 2);
  s.bots[3].pos = { x: tower.pos.x + 30, y: tower.pos.y };
  s.bots[3].hp = 1;
  s.bots[1].pos = { x: tower.pos.x + 60, y: tower.pos.y }; // close, but standing near is not a kill
  s.eco.bots[3].atRisk = 400;
  await s.step(1);
  assert.equal(s.bots[3].alive, false);
  const ev = s.eco.events.find((e) => e.kind === 'death');
  assert.deepEqual({ killer: ev.killer, assisters: ev.assisters, loss: ev.loss, paid: ev.paid }, { killer: null, assisters: [], loss: 200, paid: 0 });
  assert.equal(s.eco.bots[1].earned.assist + s.eco.bots[1].earned.drop + s.eco.bots[1].xp, 0);
  // The next credited kill is still first blood.
  s.bots[0].pos = { x: 500, y: 500 };
  s.bots[5].pos = { x: 520, y: 500 };
  s.bots[5].hp = 1;
  s.actions[0] = { kind: 'attack', target: s.bots[5].id };
  await stepUntilDead(s, s.bots[5]);
  assert.equal(s.eco.bots[0].earned['first-blood'], 100);
});

test('kill credit: the last enemy bearbot to hit within 10 s gets the kill even if a tower lands the blow; after 10 s it is an execution', async () => {
  for (const [waitSec, credited] of [[5, true], [11, false]]) {
    const s = setup();
    s.bots[0].pos = { x: 500, y: 500 };
    s.bots[3].pos = { x: 520, y: 500 };
    s.actions[0] = { kind: 'attack', target: s.bots[3].id };
    await s.step(2);
    assert.ok(s.bots[3].hp < 220, 'drums hit drums');
    s.actions[0] = { kind: 'hold' };
    await s.step(Math.round(waitSec / h.TICK_DT));
    const tower = s.match.towers.find((t) => t.team === 'violet' && t.lane === 'mid' && t.tier === 2);
    s.bots[3].pos = { x: tower.pos.x + 30, y: tower.pos.y };
    s.bots[3].hp = 1;
    await s.step(1);
    assert.equal(s.bots[3].alive, false);
    const ev = s.eco.events.find((e) => e.kind === 'death');
    assert.equal(ev.killer, credited ? 0 : null, `${waitSec} s after the hit`);
    assert.equal(s.eco.bots[0].earned.kill, credited ? 200 : 0);
  }
});

// --- respawn (§3.1) ---------------------------------------------------------------------------------

test('respawn: back at the lane spawn after 6 + 3 × level s, full hp, holding, cooldowns ready', async () => {
  const s = await midKill();
  const ev = s.eco.events.find((e) => e.kind === 'death');
  assert.equal(ev.respawnAtTick - ev.tick, (6 + 3 * 1) / h.TICK_DT, 'level 1: 9 s');
  s.bots[3].cooldowns.kick = 3;
  while (s.tick() < ev.respawnAtTick - 1) await s.step(1);
  assert.equal(s.bots[3].alive, false, 'still dead a tick before');
  const seenRespawning = s.seen[4].respawning;
  assert.deepEqual(seenRespawning.map((r) => r.id), [s.bots[3].id], 'its ally sees it respawning');
  await s.step(1);
  assert.equal(s.bots[3].alive, true);
  assert.deepEqual(s.bots[3].pos, s.spawns[3]);
  assert.equal(s.bots[3].hp, s.bots[3].maxHp);
  assert.equal(s.bots[3].cooldowns.kick, 0);
  assert.equal(s.bots[3].recalling, false);
  assert.equal(s.match.pilotState.get(s.bots[3].id).currentAction.kind, 'hold');
  assert.ok(s.eco.events.some((e) => e.kind === 'respawn' && e.bot === 3));
  await s.step(1);
  assert.ok(s.seen[3] && s.seen[3].clockSec >= ev.respawnAtTick * h.TICK_DT - 1, 'the revived bot is asked again');
});

test('the respawn timer grows with level: level 3 waits 15 s', async () => {
  const s = setup();
  s.eco.bots[3].xp = 200;
  await s.step(1);
  assert.equal(s.eco.bots[3].level, 3);
  s.bots[0].pos = { x: 500, y: 500 };
  s.bots[3].pos = { x: 520, y: 500 };
  s.bots[3].hp = 1;
  s.actions[0] = { kind: 'attack', target: s.bots[3].id };
  await stepUntilDead(s, s.bots[3]);
  const ev = s.eco.events.find((e) => e.kind === 'death');
  assert.equal(ev.respawnAtTick - ev.tick, 15 / h.TICK_DT);
});

// --- gold sources (§3.2) ----------------------------------------------------------------------------

test('passive gold: 0.5/s in whole coins to every bot, dead or alive', async () => {
  const s = setup();
  await s.step(39);
  assert.equal(s.eco.gold(0), 0);
  await s.step(1);
  assert.deepEqual(s.eco.bots.map((_, i) => s.eco.gold(i)), [1, 1, 1, 1, 1, 1]);
  await s.step(360);
  assert.deepEqual(s.eco.bots.map((_, i) => s.eco.gold(i)), [10, 10, 10, 10, 10, 10]);
});

test('a tower pays 100 to every bot on the team and 120 split among the bots near it, plus tower XP', async () => {
  const s = setup();
  const tower = s.match.towers.find((t) => t.team === 'green' && t.lane === 'top' && t.tier === 2);
  s.bots[0].pos = { x: tower.pos.x - 30, y: tower.pos.y };
  tower.hp = 1;
  s.actions[0] = { kind: 'attack', target: tower.id };
  await s.step(2);
  assert.equal(tower.alive, false);
  assert.deepEqual([0, 1, 2].map((i) => s.eco.bots[i].earned['tower-team']), [100, 100, 100]);
  assert.deepEqual([0, 1, 2].map((i) => s.eco.bots[i].earned['tower-local']), [120, 0, 0]);
  assert.equal(s.eco.bots[3].earned['tower-team'], 0);
  assert.equal(s.eco.bots[0].xp, 40);
});

test('minion last hits pay 15 to the bearbot that landed them, and minion deaths give XP to bearbots nearby', async () => {
  const log = await h.runMatch({ seed: 7, sides: SIDES, callModelFor: (i) => h.mockCallModel(100 + i), cadenceSec: 2, maxSimSec: 240, economy: 'eco-1', backend: { kind: 'mock' }, flush });
  const earned = log.result.economy.bots.map((b) => b.earned.minion);
  assert.ok(earned.some((g) => g > 0), 'somebody last-hit a minion');
  for (const g of earned) assert.equal(g % 15, 0);
  assert.ok(log.result.economy.bots.some((b) => b.xp > 0));
});

// --- shop, items and stats (§3.5–3.6) ----------------------------------------------------------------

test('the shop buys down the list at base, in order, as many as are affordable', async () => {
  const s = setup();
  s.eco.bots[0].atRisk = 650; // drums default: Road Case 300 → Bass Strings 350 → Metronome 350
  await s.step(1);
  assert.deepEqual(s.eco.bots[0].items, ['road-case', 'bass-strings']);
  assert.equal(s.eco.gold(0), 0);
  s.eco.bots[0].atRisk = 349;
  await s.step(1);
  assert.deepEqual(s.eco.bots[0].items, ['road-case', 'bass-strings'], 'saving: 349 < 350');
  s.eco.bots[0].atRisk = 350;
  await s.step(1);
  assert.deepEqual(s.eco.bots[0].items, ['road-case', 'bass-strings', 'metronome']);
  s.eco.bots[0].atRisk = 5000;
  await s.step(1);
  assert.equal(s.eco.bots[0].items.length, 3, 'three slots');
  assert.equal(s.eco.gold(0), 5000, 'full slots: gold just sits (and raises the bounty)');
  // An item already owned is passed over, never bought twice.
  s.eco.bots[3].items = ['road-case'];
  s.eco.bots[3].atRisk = 400;
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['road-case', 'bass-strings']);
  assert.equal(s.eco.bots[3].atRisk, 50);
});

test('the shop only works at your own base, and never skips an unaffordable item', async () => {
  const s = setup({ builds: [undefined, undefined, ['amp', 'road-case']] });
  s.bots[1].pos = { x: 500, y: 500 };
  s.eco.bots[1].atRisk = 1000;
  s.eco.bots[2].atRisk = 320; // Amp 350 first; Road Case 300 is not bought ahead of it
  await s.step(1);
  assert.deepEqual(s.eco.bots[1].items, [], 'not at base');
  assert.deepEqual(s.eco.bots[2].items, [], 'not skipped');
  s.eco.bots[2].atRisk = 100;
  s.eco.bots[2].safe = 300;
  await s.step(1);
  assert.deepEqual(s.eco.bots[2].items, ['amp']);
  assert.deepEqual([s.eco.bots[2].atRisk, s.eco.bots[2].safe], [0, 50], 'at-risk gold is spent first');
});

test('shopping lists: declared lists are cleaned, an empty one means the instrument default', () => {
  assert.deepEqual(h.resolveBuild(ECO, 'violin', ['amp', 'nope', 'amp', 'metronome', 'road-case', 'bass-strings']), ['amp', 'metronome', 'road-case']);
  assert.deepEqual(h.resolveBuild(ECO, 'keytar', []), ECO.defaultBuilds.keytar);
  assert.deepEqual(h.resolveBuild(ECO, 'drums', null), ['road-case', 'bass-strings', 'metronome']);
  assert.deepEqual(Object.keys(ECO.items), ['amp', 'road-case', 'bass-strings', 'metronome'], 'Q4: four items, no Tip Jar');
  assert.equal(ECO.shop.slots, 3);
});

test('stats stack: base × (1 + level bonus) × Π(1 + item modifier); hp moves with max hp', async () => {
  const s = setup({ builds: [['road-case', 'amp']] });
  s.eco.bots[0].atRisk = 650;
  await s.step(1);
  close(s.bots[0].maxHp, 220 * 1.35 * 0.85, 'drums Road Case + Amp');
  close(s.bots[0].hp, 220 * 1.35 * 0.85, 'was full, still full');
  close(s.bots[0].attackDamage, 8 * 1.35);
  close(s.bots[0].moveSpeed, 55 * 0.88);
  s.eco.bots[0].xp = 560;
  await s.step(1);
  assert.equal(s.eco.bots[0].level, 5);
  close(s.bots[0].maxHp, 220 * 1.32 * 1.35 * 0.85, 'level 5 adds +32 %');
  close(s.bots[0].attackDamage, 8 * 1.32 * 1.35);
  assert.equal(s.bots[0].attackRange, 40, 'range is never touched');
  // A bot with nothing gets its exact base values back.
  assert.deepEqual([s.bots[4].maxHp, s.bots[4].attackDamage, s.bots[4].moveSpeed, s.bots[4].attackCooldownSec], [140, 10, 60, 1.3]);
});

test('levels: the cumulative thresholds decide the level; +8 % hp and damage per level', async () => {
  const s = setup();
  s.eco.bots[1].xp = 199;
  await s.step(1);
  assert.equal(s.eco.bots[1].level, 2);
  s.eco.bots[1].xp = 200;
  await s.step(1);
  assert.equal(s.eco.bots[1].level, 3);
  close(s.bots[1].maxHp, 140 * 1.16);
  close(s.bots[1].attackDamage, 10 * 1.16);
});

test('Metronome: a cast cooldown is cut 30 %, basic attacks are 15 % slower', async () => {
  for (const owned of [false, true]) {
    const s = setup({ builds: [['metronome']] });
    if (owned) s.eco.bots[0].atRisk = 350;
    s.actions[0] = { kind: 'ability', ability: 'fill' }; // drums' self-centred slow, 10 s
    await s.step(2);
    close(s.bots[0].cooldowns.fill, owned ? 7 : 10, owned ? 'with' : 'without');
    close(s.bots[0].attackCooldownSec, owned ? 1.1 * 1.15 : 1.1);
    s.actions[0] = { kind: 'hold' };
    await s.step(1);
    close(s.bots[0].cooldowns.fill, (owned ? 7 : 10) - h.TICK_DT, 'cut once, then ticks down normally');
  }
});

test('Bass Strings heals 30 % of the damage dealt to enemy bearbots only', async () => {
  for (const owned of [false, true]) {
    const s = setup({ builds: [['bass-strings']] });
    if (owned) {
      s.eco.bots[0].atRisk = 350;
      await s.step(1);
      assert.deepEqual(s.eco.bots[0].items, ['bass-strings']);
    }
    s.bots[0].pos = { x: 500, y: 500 };
    s.bots[3].pos = { x: 520, y: 500 };
    s.bots[0].hp = 100;
    s.actions[0] = { kind: 'attack', target: s.bots[3].id };
    await s.step(14); // the next ask (≤ 0.5 s), then one hit; drums attack every 1.1 s
    assert.equal(s.bots[3].hp, 220 - 8, 'exactly one hit landed');
    close(s.bots[0].hp, owned ? 100 + 0.3 * 8 : 100);
  }
});

// --- what pilots see (§4.1) ----------------------------------------------------------------------------

test('the observation carries gold, bounty, level, items, the next item, the shop and who is respawning', async () => {
  const s = setup();
  s.eco.bots[0].atRisk = 340;
  s.eco.bots[0].xp = 230;
  await s.step(12); // the first ask came before the shop opened; this is the second
  const self = s.seen[0].self;
  assert.deepEqual(
    { gold: self.gold, goldAtRisk: self.goldAtRisk, deathLoss: self.deathLoss, deathPayout: self.deathPayout, bounty: self.bounty, level: self.level, xp: self.xp, xpToNext: self.xpToNext, items: self.items, slotsFree: self.slotsFree, nextItem: self.nextItem, atShop: self.atShop },
    { gold: 40, goldAtRisk: 40, deathLoss: 20, deathPayout: 20, bounty: 320, level: 3, xp: 230, xpToNext: 130, items: ['road-case'], slotsFree: 2, nextItem: { item: 'bass-strings', cost: 350 }, atShop: true },
    'bought Road Case at spawn with 300 of the 340',
  );
  assert.deepEqual(s.seen[0].shop.map((x) => x.item), ['amp', 'road-case', 'bass-strings', 'metronome']);
  assert.deepEqual(s.seen[0].respawning, []);
  assert.ok(s.seen[1].allies.every((a) => typeof a.level === 'number' && typeof a.gold === 'number' && Array.isArray(a.items)));
  // An enemy bearbot in sight shows its bounty, level and items.
  s.bots[3].pos = { x: s.bots[0].pos.x + 30, y: s.bots[0].pos.y };
  await s.step(20);
  const enemy = s.seen[0].visibleEnemies.find((v) => v.id === s.bots[3].id);
  assert.deepEqual([enemy.level, enemy.bounty, enemy.items], [1, 300, []]);
});

// --- logs and replay ------------------------------------------------------------------------------------



test('an eco-1 log records the whole ruleset and every bot\'s shopping list; a log without one has no economy field', () => {
  assert.equal(ecoLog.economy.ruleset.name, 'eco-1');
  assert.deepEqual(ecoLog.economy.ruleset, ECO);
  assert.equal(ecoLog.economy.builds.length, 6);
  assert.deepEqual(ecoLog.economy.builds[2], ['metronome'], 'cleaned: unknown key dropped, duplicate dropped');
  assert.deepEqual(ecoLog.economy.builds[0], ECO.defaultBuilds.drums);
  assert.ok(ecoLog.checkpoints.every((c) => JSON.parse(c.state).e.length === 6));
  assert.equal('economy' in plainLog, false);
  assert.equal('economy' in plainLog.result, false);
  assert.ok(plainLog.checkpoints.every((c) => !('e' in JSON.parse(c.state))));
  assert.equal(h.DEFAULT_ECONOMY, null, 'off until the Sun 10-04 gate');
  assert.throws(() => h.resolveEconomy('eco-9'), /unknown economy ruleset/);
  assert.equal(h.resolveEconomy('none'), null);
});

test('an eco-1 match: bots earn, buy, die more than once, drop gold and respawn', () => {
  const deathsPerBot = ecoLog.result.deaths.reduce((m, d) => m.set(d.bot, (m.get(d.bot) ?? 0) + 1), new Map());
  assert.ok([...deathsPerBot.values()].some((n) => n > 1), 'someone died twice');
  const eb = ecoLog.result.economy.bots;
  assert.ok(eb.every((b) => b.earned.passive === 300), '600 s × 0.5');
  assert.ok(eb.some((b) => b.items.length > 0));
  assert.ok(eb.some((b) => b.earned.drop > 0));
  assert.equal(eb.reduce((s, b) => s + b.deaths, 0), ecoLog.result.deaths.length);
});

test('replay determinism: an eco-1 log replay-verifies, a second run reproduces it, and tampering with the ruleset or builds diverges', async () => {
  const v = await h.verifyReplay(ecoLog, flush);
  assert.equal(v.ok, true);
  assert.equal(v.checkpointsCompared, ecoLog.checkpoints.length);
  const again = await mock({ economy: 'eco-1', buildFor: (i) => (i === 2 ? ['metronome'] : undefined) });
  assert.deepEqual(again.checkpoints, ecoLog.checkpoints);
  assert.deepEqual(again.result.economy, ecoLog.result.economy);

  const richerKills = structuredClone(ecoLog);
  richerKills.economy.ruleset.gold.kill = 201;
  assert.equal((await h.verifyReplay(richerKills, flush)).ok, false);
  const otherBuild = structuredClone(ecoLog);
  otherBuild.economy.builds[0] = ['amp'];
  assert.equal((await h.verifyReplay(otherBuild, flush)).ok, false);
  const { economy, ...stripped } = structuredClone(ecoLog);
  assert.ok(economy);
  assert.equal((await h.verifyReplay(stripped, flush)).ok, false, 'no economy: nobody respawns');
});

test('old logs replay unchanged: a committed pre-economy match log still verifies', async () => {
  const old = JSON.parse(await readFile(path.join(ROOT, 'runs', 'jam-sample-drums-vs-violin.json'), 'utf8'));
  assert.equal('economy' in old, false);
  const v = await h.verifyReplay(old, flush);
  assert.equal(v.ok, true);
  assert.equal(v.checkpointsCompared, old.checkpoints.length);
  assert.equal((await h.verifyReplay(plainLog, flush)).ok, true);
});

test('metrics: an eco-1 log is measured with respawns and the real ledger; a plain log keeps the proxy', async () => {
  const mm = await metrics.measureLog(ecoLog, flush);
  assert.equal(mm.replayOk, true);
  assert.equal(mm.deaths, ecoLog.result.deaths.length);
  assert.equal(mm.economy.ruleset, 'eco-1');
  assert.ok(mm.economy.respawns > 0 && mm.economy.respawns <= mm.deaths, 'every respawn follows a death');
  const earned = ecoLog.result.economy.bots.reduce((s, b) => s + Object.values(b.earned).reduce((x, y) => x + y, 0), 0);
  close(mm.goldPerMin.total * mm.durationMin, earned, 'gold is the ledger');
  close(mm.economy.goldPerMinBySource.passive, 30, '0.5/s');
  const vals = metrics.matchValues(mm);
  assert.equal(typeof vals.ecoPvpShareOfEarned, 'number');
  const plain = await metrics.measureLog(plainLog, flush);
  assert.equal(plain.economy, null);
  assert.equal(metrics.matchValues(plain).ecoGoldPerMinPerBot, null);
});
