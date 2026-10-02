/**
 * The late game (docs/late-game-economy-spec.md, ruleset `eco-3-late`): shopping-list expansion,
 * recipes and upgrades bought by the real shop, the tier-2 and tier-3 stat lines and passives,
 * levels 6–8, what pilots see, the late-game metrics, and proof that every older ruleset and every
 * checked-in log is untouched. Matches are built by hand with scripted pilots, or run on the game's
 * deterministic mock model. No server, no key, no model call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, flush, loadHeadless, loadMetrics } from './load.mjs';

const h = await loadHeadless();
const metrics = await loadMetrics();

const LATE = h.ECO_3_LATE;
const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];
const SIDES = {
  violet: { name: 'ann', promptFile: 'ann.md', promptText: 'ann' },
  green: { name: 'bo', promptFile: 'bo.md', promptText: 'bo' },
};
const NO_BUILDS = ROSTER.map(() => []);
const RECIPES = { backline: 'wall-of-sound', 'click-track': 'arpeggiator', 'fuzz-pedal': 'feedback', 'tour-bus': 'headliner' };
const TIER1 = ['amp', 'road-case', 'bass-strings', 'metronome'];

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg ?? ''} ${a} != ${b}`);
const mock = (opts = {}) => h.runMatch({ seed: 7, sides: SIDES, callModelFor: (i) => h.mockCallModel(100 + i), cadenceSec: 2, backend: { kind: 'mock' }, flush, ...opts });
const sha256 = (text) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const readJson = async (rel) => JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));

// The stand-in full match (spec §6's "$0 check"), run before any test is registered: node:test
// starts a test as soon as it is registered, and two matches running interleaved share the sim's
// entity id counter, so a match made alongside a running test would not replay.
const lateLog = await mock({ economy: 'eco-3-late' });

/** A pvp-1 match whose pilots return `actions[i]`, with the economy attached. Nothing has ticked. */
function setup({ ruleset = LATE, builds = [] } = {}) {
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
  const eco = h.attachEconomy(match, ruleset, builds, h.TICK_DT);
  const step = async (n = 1) => {
    for (let k = 0; k < n; k++) {
      match.tick(h.TICK_DT);
      await flush();
    }
  };
  const tick = () => Math.round(match.clockSec / h.TICK_DT);
  return { match, eco, actions, seen, step, tick, bots: match.bearbots };
}

/** Step until bot `i`'s pilot is asked again, so `seen[i]` reflects the state set before. */
async function nextAsk(s, i, max = 40) {
  const before = s.seen[i];
  for (let k = 0; k < max && s.seen[i] === before; k++) await s.step(1);
  assert.notEqual(s.seen[i], before, 'asked again within the limit');
  return s.seen[i];
}

async function stepUntilDead(s, bot, max = 60) {
  for (let k = 0; k < max && bot.alive; k++) await s.step(1);
  assert.equal(bot.alive, false, 'died within the limit');
}

const buys = (s, bot) => s.eco.events.filter((e) => e.kind === 'buy' && e.bot === bot);

/**
 * `resolveBuild` exactly as it was before recipes (`git show 5bf2e11:src/economy.ts`): unknown and
 * repeated items dropped, cut to the slot count, the instrument default when nothing is left.
 */
function oldResolveBuild(ruleset, instrument, declared) {
  const clean = [];
  for (const key of declared ?? []) {
    if (Object.hasOwn(ruleset.items, key) && !clean.includes(key)) clean.push(key);
  }
  const build = clean.length ? clean : ruleset.defaultBuilds[instrument] ?? [];
  return build.slice(0, ruleset.shop.slots);
}

// --- shopping-list expansion (§2.5) --------------------------------------------------------------------

test('expansion: every case in build_expansion_cases.json (shared with the Python mirror)', async () => {
  const fixture = await readJson('tools/match/build_expansion_cases.json');
  const ruleset = h.resolveEconomy(fixture.ruleset);
  assert.equal(ruleset, LATE);
  assert.ok(fixture.cases.length >= 10);
  for (const c of fixture.cases) {
    const rules = c.planSteps === undefined ? ruleset : { ...ruleset, shop: { ...ruleset.shop, planSteps: c.planSteps } };
    const { plan, notes } = h.expandBuild(rules, c.instrument, c.declared);
    assert.deepEqual(plan, c.plan, `${c.name}: plan`);
    assert.deepEqual(notes.map((n) => [n.kind, n.key]), c.notes, `${c.name}: notes`);
    assert.deepEqual(h.resolveBuild(rules, c.instrument, c.declared), c.plan, `${c.name}: resolveBuild is the plan`);
  }
});

test('expansion: the deepest plan is 9 steps, inside the 10-step cut (spec §2.5)', () => {
  assert.equal(LATE.shop.planSteps, 10);
  // Two tier-3 items and a tier-1 item fill the three slots: 4 + 4 + 1 steps, and nothing fits after.
  const deepest = ['tour-bus', 'headliner', 'backline', 'wall-of-sound', 'amp'];
  const { plan, notes } = h.expandBuild(LATE, 'violin', deepest);
  assert.deepEqual(plan, ['road-case', 'metronome', 'tour-bus', 'headliner', 'road-case', 'bass-strings', 'backline', 'wall-of-sound', 'amp']);
  assert.deepEqual(notes.map((n) => n.kind), ['parts-added', 'parts-added']);
  const more = h.expandBuild(LATE, 'violin', [...deepest, 'metronome', 'click-track']);
  assert.deepEqual(more.plan, plan, 'nothing more fits');
  assert.deepEqual(more.notes.slice(2).map((n) => [n.kind, n.key]), [['no-slot', 'metronome'], ['parts-missing', 'click-track']]);
  assert.equal(more.notes.some((n) => n.kind === 'cut'), false);
});

// --- recipes and upgrades through the real shop (§2.1) ------------------------------------------------

test('every recipe and upgrade: bought by the shop for its step cost, parts consumed, the new item in the first part\'s slot', async () => {
  for (const [recipe, upgrade] of Object.entries(RECIPES)) {
    const [a, b] = LATE.items[recipe].from;
    const other = TIER1.find((k) => k !== a && k !== b);
    const s = setup({ builds: [[a, other, b, recipe, upgrade]] });
    assert.ok(s.eco.atShop(0));
    const tier1 = LATE.items[a].cost + LATE.items[other].cost + LATE.items[b].cost;
    s.eco.bots[0].atRisk = tier1;
    await s.step(1);
    assert.deepEqual(s.eco.bots[0].items, [a, other, b], `${recipe}: three tier-1 items`);
    assert.equal(s.eco.gold(0), 0);
    assert.ok(buys(s, 0).every((e) => !('consumed' in e)), 'a tier-1 buy carries no `consumed`');

    s.eco.bots[0].atRisk = 250;
    await s.step(1);
    assert.deepEqual(s.eco.bots[0].items, [recipe, other], `${recipe} takes ${a}'s slot, ${b} leaves`);
    assert.equal(s.eco.gold(0), 0, `${recipe}: debited 250, not its total`);
    assert.deepEqual(buys(s, 0).at(-1), { tick: s.tick(), kind: 'buy', bot: 0, item: recipe, cost: 250, consumed: [a, b] });

    s.eco.bots[0].atRisk = 400;
    await s.step(1);
    assert.deepEqual(s.eco.bots[0].items, [upgrade, other], `${upgrade} replaces ${recipe} in place`);
    assert.equal(s.eco.gold(0), 0, `${upgrade}: debited 400`);
    assert.deepEqual(buys(s, 0).at(-1), { tick: s.tick(), kind: 'buy', bot: 0, item: upgrade, cost: 400, consumed: [recipe] });
    assert.equal(s.eco.netWorth(0), h.totalCost(LATE, upgrade) + LATE.items[other].cost);
  }
});

test('a recipe frees a slot and the next tier-1 item is bought in the same visit', async () => {
  const s = setup({ builds: [['road-case', 'bass-strings', 'metronome', 'backline', 'amp']] });
  s.eco.bots[0].atRisk = 1000;
  await s.step(1);
  assert.deepEqual(s.eco.bots[0].items, ['road-case', 'bass-strings', 'metronome']);
  s.eco.bots[0].atRisk = 600; // Backline 250 + Amp 350
  await s.step(1);
  assert.deepEqual(s.eco.bots[0].items, ['backline', 'metronome', 'amp']);
  assert.equal(s.eco.gold(0), 0);
  assert.deepEqual(buys(s, 0).slice(-2).map((e) => [e.item, e.cost, e.tick]), [['backline', 250, 2], ['amp', 350, 2]]);
});

test('a tier-1 step with no free slot is never bought, and the shop does not skip past it', async () => {
  // Not a plan expandBuild would make (it drops the Metronome): the shop's own rule, fed directly.
  const s = setup({ builds: [undefined, undefined, ['amp', 'bass-strings', 'road-case', 'metronome', 'fuzz-pedal']] });
  assert.ok(s.eco.atShop(2));
  s.eco.bots[2].atRisk = 1000 + 5000;
  await s.step(3);
  assert.deepEqual(s.eco.bots[2].items, ['amp', 'bass-strings', 'road-case'], 'Metronome has no slot; Fuzz Pedal behind it is not bought');
  assert.equal(s.eco.gold(2), 5000);
  assert.equal(s.eco.nextItem(2), null, 'a step that cannot be taken ends the list');
});

test('saving: not enough gold buys nothing, exactly the cost buys it, and nothing behind it is bought first', async () => {
  const s = setup({ builds: [undefined, undefined, undefined, ['road-case', 'bass-strings', 'backline', 'wall-of-sound', 'amp']] });
  s.eco.bots[3].atRisk = 650;
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['road-case', 'bass-strings']);
  s.eco.bots[3].atRisk = 249;
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['road-case', 'bass-strings'], '249 < 250');
  s.eco.bots[3].atRisk = 250;
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['backline']);
  s.eco.bots[3].atRisk = 399; // Amp (350) is affordable but sits behind Wall of Sound (400)
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['backline'], 'saving for the upgrade');
  s.eco.bots[3].atRisk = 400;
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['wall-of-sound']);
  s.eco.bots[3].atRisk = 350;
  await s.step(1);
  assert.deepEqual(s.eco.bots[3].items, ['wall-of-sound', 'amp']);
  assert.equal(s.eco.gold(3), 0);
});

// --- stat lines and passives (§2.2, §2.4) ---------------------------------------------------------------

/** Drums (bot 0) holding `items`, stats derived: 220 hp, 8 damage, 55 speed, 1.1 s attacks at base. */
async function drumsWith(items, ruleset = LATE) {
  const s = setup({ ruleset, builds: NO_BUILDS });
  s.eco.bots[0].items = [...items];
  await s.step(1);
  return s;
}

test('tier-2 stat lines: Backline, Click Track, Fuzz Pedal, Tour Bus', async () => {
  const expect = {
    backline: { maxHp: 220 * 1.5, attackDamage: 8, moveSpeed: 55 * 0.88, attackCooldownSec: 1.1 },
    'click-track': { maxHp: 220 * 0.85, attackDamage: 8 * 1.5, moveSpeed: 55, attackCooldownSec: 1.1 * 1.15 },
    'fuzz-pedal': { maxHp: 220 * 0.85, attackDamage: 8 * 1.5, moveSpeed: 55, attackCooldownSec: 1.1 },
    'tour-bus': { maxHp: 220 * 1.5, attackDamage: 8, moveSpeed: 55 * 0.88, attackCooldownSec: 1.1 * 1.15 },
  };
  for (const [item, stats] of Object.entries(expect)) {
    const s = await drumsWith([item]);
    for (const [k, v] of Object.entries(stats)) close(s.bots[0][k], v, `${item} ${k}`);
    close(s.bots[0].hp, s.bots[0].maxHp, `${item}: was full, still full`);
  }
});

test('tier-3 stat lines: Wall of Sound +80 % hp, Arpeggiator\'s faster attacks replace the Metronome\'s slower ones', async () => {
  const expect = {
    'wall-of-sound': { maxHp: 220 * 1.8, attackDamage: 8, moveSpeed: 55 * 0.88, attackCooldownSec: 1.1 },
    arpeggiator: { maxHp: 220 * 0.85, attackDamage: 8 * 1.5, moveSpeed: 55, attackCooldownSec: 1.1 * 0.75 },
    feedback: { maxHp: 220 * 0.85, attackDamage: 8 * 1.5, moveSpeed: 55, attackCooldownSec: 1.1 },
    headliner: { maxHp: 220 * 1.5, attackDamage: 8, moveSpeed: 55 * 0.88, attackCooldownSec: 1.1 * 1.15 },
  };
  for (const [item, stats] of Object.entries(expect)) {
    const s = await drumsWith([item]);
    for (const [k, v] of Object.entries(stats)) close(s.bots[0][k], v, `${item} ${k}`);
  }
  // Two tier-3 items stack like any two items.
  const both = await drumsWith(['wall-of-sound', 'arpeggiator']);
  close(both.bots[0].maxHp, 220 * 1.8 * 0.85);
  close(both.bots[0].attackCooldownSec, 1.1 * 0.75);
});

test('ability cooldowns are cut 35 % by Click Track, Tour Bus, Arpeggiator and Headliner, and not by Backline', async () => {
  for (const [item, cut] of [['click-track', 0.35], ['tour-bus', 0.35], ['arpeggiator', 0.35], ['headliner', 0.35], ['backline', 0]]) {
    const s = await drumsWith([item]);
    s.actions[0] = { kind: 'ability', ability: 'fill' }; // drums' self-centred slow, 10 s
    await nextAsk(s, 0);
    await s.step(1); // the cast
    close(s.bots[0].cooldowns.fill, 10 * (1 - cut), item);
    await s.step(1);
    close(s.bots[0].cooldowns.fill, 10 * (1 - cut) - h.TICK_DT, `${item}: cut once, then ticks down normally`);
  }
});

test('lifesteal on enemy bearbots: Backline and Fuzz Pedal 40 %, Feedback 70 %', async () => {
  for (const [item, share, dmg] of [['backline', 0.4, 8], ['fuzz-pedal', 0.4, 12], ['feedback', 0.7, 12]]) {
    const s = await drumsWith([item]);
    s.bots[0].pos = { x: 500, y: 500 };
    s.bots[3].pos = { x: 520, y: 500 };
    s.bots[0].hp = 100;
    s.actions[0] = { kind: 'attack', target: s.bots[3].id };
    await s.step(14); // the next ask (≤ 0.5 s), then one hit; drums attack every 1.1 s
    close(s.bots[3].hp, 220 - dmg, `${item}: exactly one hit`);
    close(s.bots[0].hp, 100 + share * dmg, item);
  }
});

test('Headliner regenerates 2 % of max hp a second while alive, capped at max hp, and not while dead', async () => {
  const s = await drumsWith(['headliner']);
  const max = 220 * 1.5;
  close(s.bots[0].maxHp, max);
  s.bots[0].hp = 100;
  await s.step(20); // 1 s at the spawn, nothing else touches it
  close(s.bots[0].hp, 100 + 0.02 * max * 1, 'one second of regeneration');
  s.bots[0].hp = max - 0.1;
  await s.step(1);
  assert.equal(s.bots[0].hp, max, 'capped at max hp');
  await s.step(5);
  assert.equal(s.bots[0].hp, max);

  // A dead Headliner bot does not regenerate.
  s.eco.bots[3].items = ['headliner'];
  s.bots[0].pos = { x: 500, y: 500 };
  s.bots[3].pos = { x: 520, y: 500 };
  await s.step(1);
  s.bots[3].hp = 1;
  s.actions[0] = { kind: 'attack', target: s.bots[3].id };
  await stepUntilDead(s, s.bots[3]);
  const hpDead = s.bots[3].hp;
  await s.step(20);
  assert.equal(s.bots[3].hp, hpDead, 'no regeneration while dead');
});

test('no regeneration without Headliner: tier-1 items under eco-3 and eco-3-late', async () => {
  for (const ruleset of [h.ECO_3, LATE]) {
    const s = await drumsWith(['road-case', 'bass-strings', 'metronome'], ruleset);
    s.bots[0].hp = 100;
    await s.step(20);
    assert.equal(s.bots[0].hp, 100, ruleset.name);
  }
});

// --- total cost and net worth (§7.1) ---------------------------------------------------------------------

test('totalCost sums the tree; netWorth uses it; a tier-1 ruleset\'s netWorth is unchanged', async () => {
  const want = { amp: 350, 'road-case': 300, 'bass-strings': 350, metronome: 350, backline: 900, 'click-track': 950, 'fuzz-pedal': 950, 'tour-bus': 900, 'wall-of-sound': 1300, arpeggiator: 1350, feedback: 1350, headliner: 1300 };
  assert.deepEqual(Object.fromEntries(Object.keys(LATE.items).map((k) => [k, h.totalCost(LATE, k)])), want);
  for (const k of Object.keys(h.ECO_3.items)) assert.equal(h.totalCost(h.ECO_3, k), h.ECO_3.items[k].cost, `eco-3 ${k}`);

  const s = setup({ builds: NO_BUILDS });
  s.eco.bots[0].atRisk = 40;
  s.eco.bots[0].safe = 2;
  s.eco.bots[0].items = ['wall-of-sound', 'arpeggiator', 'amp'];
  assert.equal(s.eco.netWorth(0), 42 + 1300 + 1350 + 350);
  const old = setup({ ruleset: h.ECO_3, builds: NO_BUILDS });
  old.eco.bots[0].atRisk = 400;
  old.eco.bots[0].items = ['road-case', 'amp'];
  assert.equal(old.eco.netWorth(0), 400 + 300 + 350);
});

// --- levels (§3) -----------------------------------------------------------------------------------------

test('levels 6–8 at 710 / 860 / 1010 XP, +8 % hp and damage a level up to +56 %', async () => {
  assert.deepEqual(LATE.xp.thresholds, [0, 80, 200, 360, 560, 710, 860, 1010]);
  const s = setup({ builds: NO_BUILDS });
  for (const [xp, level] of [[559, 4], [560, 5], [709, 5], [710, 6], [859, 6], [860, 7], [1009, 7], [1010, 8], [5000, 8]]) {
    s.eco.bots[1].xp = xp;
    s.eco.bots[1].level = 1; // level-ups only rise; start from 1 so every row is read fresh
    await s.step(1);
    assert.equal(s.eco.bots[1].level, level, `${xp} XP`);
    close(s.bots[1].maxHp, 140 * (1 + 0.08 * (level - 1)), `${xp} XP: max hp`);
    close(s.bots[1].attackDamage, 10 * (1 + 0.08 * (level - 1)), `${xp} XP: damage`);
  }
  close(s.bots[1].maxHp, 140 * 1.56, 'level 8: +56 %');
});

test('xpToNext: 150 at level 5 (560 XP), null at level 8', async () => {
  const s = setup({ builds: NO_BUILDS });
  s.eco.bots[1].xp = 560;
  await s.step(1);
  let self = (await nextAsk(s, 1)).self;
  assert.deepEqual([self.level, self.xp, self.xpToNext], [5, 560, 150]);
  s.eco.bots[1].xp = 900;
  await s.step(1);
  self = (await nextAsk(s, 1)).self;
  assert.deepEqual([self.level, self.xpToNext], [7, 110]);
  s.eco.bots[1].xp = 1010;
  await s.step(1);
  self = (await nextAsk(s, 1)).self;
  assert.deepEqual([self.level, self.xpToNext], [8, null], 'the highest level');
});

test('the respawn timer stays 6 + 3 × level: level 8 waits 30 s', async () => {
  const s = setup({ builds: NO_BUILDS });
  s.eco.bots[3].xp = 1010;
  await s.step(1);
  assert.equal(s.eco.bots[3].level, 8);
  s.bots[0].pos = { x: 500, y: 500 };
  s.bots[3].pos = { x: 520, y: 500 };
  s.bots[3].hp = 1;
  s.actions[0] = { kind: 'attack', target: s.bots[3].id };
  await stepUntilDead(s, s.bots[3]);
  const ev = s.eco.events.find((e) => e.kind === 'death');
  assert.equal(ev.respawnAtTick - ev.tick, 30 / h.TICK_DT);
});

// --- what pilots see (§7.3) ------------------------------------------------------------------------------

test('eco-3-late observation: nextItem and shop carry tier and from; a tier-2 item takes one slot; allies and enemies show tier-2/3 keys', async () => {
  const s = setup();
  let self = (await nextAsk(s, 0)).self;
  assert.deepEqual(self.nextItem, { item: 'road-case', cost: 300, tier: 1 }, 'a tier-1 step has no `from`');
  s.eco.bots[0].atRisk = 1000;
  await s.step(1);
  self = (await nextAsk(s, 0)).self;
  assert.deepEqual([self.items, self.slotsFree], [['road-case', 'bass-strings', 'metronome'], 0]);
  assert.deepEqual(self.nextItem, { item: 'backline', cost: 250, tier: 2, from: ['road-case', 'bass-strings'] });
  s.eco.bots[0].atRisk = 250;
  await s.step(1);
  self = (await nextAsk(s, 0)).self;
  assert.deepEqual([self.items, self.slotsFree], [['backline', 'metronome'], 1], 'Backline is one slot');
  assert.deepEqual(self.nextItem, { item: 'amp', cost: 350, tier: 1 });
  s.eco.bots[0].atRisk = 350;
  await s.step(1);
  self = (await nextAsk(s, 0)).self;
  assert.deepEqual(self.nextItem, { item: 'wall-of-sound', cost: 400, tier: 3, from: ['backline'] });

  const shop = s.seen[0].shop;
  assert.equal(shop.length, 12);
  assert.deepEqual(
    shop,
    Object.entries(LATE.items).map(([item, def]) => ({ item, cost: def.cost, tier: def.tier, ...(def.from ? { from: def.from } : {}) })),
  );
  assert.deepEqual(shop.filter((x) => x.tier === 2).map((x) => x.item), ['backline', 'click-track', 'fuzz-pedal', 'tour-bus']);
  assert.deepEqual(shop.filter((x) => x.tier === 3).map((x) => x.item), ['wall-of-sound', 'arpeggiator', 'feedback', 'headliner']);

  s.eco.bots[1].items = ['arpeggiator'];
  s.eco.bots[3].items = ['feedback', 'amp'];
  s.bots[3].pos = { x: s.bots[0].pos.x + 30, y: s.bots[0].pos.y };
  const obs = await nextAsk(s, 0);
  assert.deepEqual(obs.allies.find((a) => a.id === s.bots[1].id).items, ['arpeggiator']);
  assert.deepEqual(obs.visibleEnemies.find((v) => v.id === s.bots[3].id).items, ['feedback', 'amp']);
});

test('eco-3 observation: nextItem and every shop entry are exactly {item, cost}, as before recipes', async () => {
  const s = setup({ ruleset: h.ECO_3 });
  s.eco.bots[0].atRisk = 300;
  await s.step(1);
  const obs = await nextAsk(s, 0);
  assert.deepEqual(obs.self.nextItem, { item: 'bass-strings', cost: 350 });
  assert.deepEqual(obs.shop, Object.entries(h.ECO_3.items).map(([item, def]) => ({ item, cost: def.cost })));
  assert.ok(obs.shop.every((x) => Object.keys(x).length === 2));
});

// --- every older ruleset and log, untouched (§7.1) -----------------------------------------------------

test('resolveBuild under eco-1, eco-2 and eco-3 is exactly the pre-recipe rule', () => {
  const inputs = [
    undefined,
    null,
    [],
    ['nope'],
    ['amp'],
    ['amp', 'amp', 'amp'],
    ['amp', 'nope', 'amp', 'metronome', 'road-case', 'bass-strings'],
    ['metronome', 'Amp', 'metronome'],
    ['bass-strings', 'road-case', 'metronome', 'amp'],
    ['backline', 'wall-of-sound'], // late-game keys mean nothing here
    ['road-case', 'backline', 'amp'],
  ];
  for (const ruleset of [h.ECO_1, h.ECO_2, h.ECO_3]) {
    assert.equal(h.hasRecipes(ruleset), false, ruleset.name);
    for (const inst of ['drums', 'keytar', 'violin']) {
      for (const declared of inputs) {
        assert.deepEqual(h.resolveBuild(ruleset, inst, declared), oldResolveBuild(ruleset, inst, declared), `${ruleset.name} ${inst} ${JSON.stringify(declared)}`);
      }
    }
  }
  assert.equal(h.hasRecipes(LATE), true);
});

test('the older ruleset files are byte-identical to the spec\'s base (5bf2e11), and ECO_3 is eco-3.json', async () => {
  // sha256 of each file at 5bf2e11 (`git show 5bf2e11:<path> | sha256sum`), line endings as in git.
  const pinned = {
    'src/economy/eco-1.json': 'b1373270a164d97c4182db1b02c0345ca9914318d6fc4398acfe0055b4e42dcb',
    'src/economy/eco-2.json': '09598db994d0d39b9c74ebfce48af46898e7cee5134ae49244d7974bd5ba5a66',
    'src/economy/eco-3.json': '77c15fab87af49c272bca4d33bcb8ff5afd9bcf3454f1020dad85c30b6960a63',
    'src/economy/respawn-1.json': 'a8e907b22ab892f7f21c2b4e213712ea56666c18479de135032094298689b1ad',
  };
  for (const [rel, hash] of Object.entries(pinned)) assert.equal(sha256(await readFile(path.join(ROOT, rel), 'utf8')), hash, rel);
  assert.deepEqual(h.ECO_3, await readJson('src/economy/eco-3.json'));
  assert.deepEqual(h.ECO_2, await readJson('src/economy/eco-2.json'));
  assert.deepEqual(h.ECO_1, await readJson('src/economy/eco-1.json'));
  assert.deepEqual(h.RESPAWN_ONLY, await readJson('src/economy/respawn-1.json'));
});

test('compiled pilot schemas still load, and their builds resolve under eco-3 as before (and unchanged under eco-3-late)', async () => {
  const files = (await readdir(path.join(ROOT, 'prompts', 'pilots'))).filter((f) => f.endsWith('.schemas.json'));
  assert.ok(files.length >= 8);
  let builds = 0;
  for (const f of files) {
    const schemas = await readJson(path.join('prompts', 'pilots', f));
    for (const inst of ['drums', 'keytar', 'violin']) {
      assert.ok(schemas[inst], `${f}: ${inst}`);
      const build = schemas[inst].build;
      if (!Array.isArray(build)) continue;
      builds++;
      assert.deepEqual(h.resolveBuild(h.ECO_3, inst, build), oldResolveBuild(h.ECO_3, inst, build), `${f} ${inst}`);
      // A schema compiled under eco-3 declares three tier-1 items, a valid plan as it stands (spec §7.4).
      assert.deepEqual(h.expandBuild(LATE, inst, build), { plan: build, notes: [] }, `${f} ${inst} under eco-3-late`);
    }
  }
  assert.ok(builds >= 12, 'the -eco schemas declare builds');
});

test('every checked-in match log under runs/ still replay-verifies (with and without an economy)', async () => {
  const files = (await readdir(path.join(ROOT, 'runs'))).filter((f) => f.endsWith('.json')).sort();
  const kinds = { economy: 0, plain: 0 };
  for (const f of files) {
    const log = await readJson(path.join('runs', f));
    if (!(Array.isArray(log?.checkpoints) && Array.isArray(log.decisions) && typeof log.seed === 'number')) continue;
    kinds[log.economy ? 'economy' : 'plain'] += 1;
    const v = await h.verifyReplay(log, flush);
    assert.equal(v.ok, true, `${f} diverged at tick ${v.firstDivergenceTick}`);
    assert.equal(v.checkpointsCompared, log.checkpoints.length, f);
  }
  assert.ok(kinds.economy > 0 && kinds.plain > 0, `both kinds checked: ${JSON.stringify(kinds)}`);
});

test('a full eco-3 mock match replay-verifies and records eco-3 exactly', async () => {
  const log = await mock({ economy: 'eco-3' });
  assert.deepEqual(log.economy.ruleset, h.ECO_3);
  assert.deepEqual(log.economy.builds, ROSTER.map((s) => h.ECO_3.defaultBuilds[s.instrument]));
  assert.ok(log.checkpoints.every((c) => JSON.parse(c.state).e.every(([, , , items]) => items.split('+').filter(Boolean).length <= 3)));
  assert.equal((await h.verifyReplay(log, flush)).ok, true);
});

// --- registry (§7.1) -----------------------------------------------------------------------------------

test('eco-3-late is eco-3 plus thresholds, planSteps, item tiers and abbrs, 8 new items and the default ladders', () => {
  assert.equal(h.resolveEconomy('eco-3-late'), LATE);
  assert.equal(h.ECONOMY_RULESETS['eco-3-late'], LATE);
  assert.equal(h.DEFAULT_ECONOMY, null, 'off until the gate');
  const { name, xp, shop, items, defaultBuilds, ...rest } = LATE;
  const { name: n3, xp: xp3, shop: shop3, items: items3, defaultBuilds: db3, ...rest3 } = h.ECO_3;
  assert.equal(name, 'eco-3-late');
  assert.deepEqual(rest, rest3, 'respawn, gold and credit unchanged');
  const { thresholds, ...xpRest } = xp;
  const { thresholds: th3, ...xpRest3 } = xp3;
  assert.deepEqual(xpRest, xpRest3);
  assert.deepEqual(thresholds.slice(0, th3.length), th3, 'levels 1–5 unchanged');
  assert.deepEqual(shop, { ...shop3, planSteps: 10 });

  const tier1 = Object.keys(items3);
  assert.deepEqual(Object.keys(items).slice(0, 4), tier1);
  for (const k of tier1) {
    const { tier, abbr, ...def } = items[k];
    assert.deepEqual(def, items3[k], `${k}: name, cost, gives, givesUp and mods unchanged`);
    assert.equal(tier, 1);
    assert.match(abbr, /^[A-Z][a-z]$/);
  }
  const added = Object.keys(items).filter((k) => !tier1.includes(k));
  assert.deepEqual(added, ['backline', 'click-track', 'fuzz-pedal', 'tour-bus', 'wall-of-sound', 'arpeggiator', 'feedback', 'headliner']);
  for (const k of added) {
    const it = items[k];
    assert.equal(it.cost, it.tier === 2 ? 250 : 400, k);
    assert.equal(it.from.length, it.tier === 2 ? 2 : 1, k);
    assert.ok(it.from.every((p) => h.itemTier(LATE, p) === it.tier - 1), `${k} is made from tier-${it.tier - 1} items`);
  }
  assert.deepEqual(new Set(Object.values(items).map((it) => it.abbr)).size, 12, 'every abbr distinct');

  for (const inst of ['drums', 'keytar', 'violin']) {
    assert.deepEqual(defaultBuilds[inst].slice(0, 3), db3[inst], `${inst}: eco-3's first three`);
    assert.deepEqual(h.expandBuild(LATE, inst, defaultBuilds[inst]), { plan: defaultBuilds[inst], notes: [] }, `${inst}: the ladder is already a plan`);
    assert.deepEqual(h.resolveBuild(LATE, inst, null), defaultBuilds[inst]);
  }
});

// --- full matches under eco-3-late (§7.6) ----------------------------------------------------------------

/** Walk a bot's plan from an empty inventory, as the shop does, for its first `n` steps. */
function walkPlan(plan, n) {
  const inv = [];
  for (const key of plan.slice(0, n)) {
    const parts = LATE.items[key].from ?? [];
    if (!parts.length) inv.push(key);
    else {
      inv[inv.indexOf(parts[0])] = key;
      for (const p of parts.slice(1)) inv.splice(inv.indexOf(p), 1);
    }
  }
  return inv;
}

test('a full eco-3-late mock match runs to the end, records the ruleset and expanded ladders, and replay-verifies', async () => {
  assert.equal(lateLog.result.durationSec, 600);
  assert.deepEqual(lateLog.economy.ruleset, LATE);
  assert.deepEqual(lateLog.economy.builds, ROSTER.map((s) => LATE.defaultBuilds[s.instrument]));
  const v = await h.verifyReplay(lateLog, flush);
  assert.equal(v.ok, true);
  assert.equal(v.checkpointsCompared, lateLog.checkpoints.length);

  // The mock bots get rich enough to climb: every bot's items are a step of its ladder, recipes and upgrades were bought.
  const bots = lateLog.result.economy.bots;
  bots.forEach((b, i) => {
    const plan = lateLog.economy.builds[i];
    const steps = [...Array(plan.length + 1).keys()].filter((n) => JSON.stringify(walkPlan(plan, n)) === JSON.stringify(b.items));
    assert.ok(steps.length > 0, `bot ${i}'s items ${b.items} are a point on its ladder`);
  });
  assert.ok(bots.some((b) => b.items.some((k) => h.itemTier(LATE, k) === 3)), 'someone holds a tier-3 item');
  assert.ok(bots.some((b) => b.items.length === 2 && b.items.every((k) => h.itemTier(LATE, k) === 3)), 'someone finished its ladder: two tier-3 items');
  assert.ok(bots.some((b) => b.level > 5), 'someone got past the old level cap');
  assert.ok(bots.every((b) => b.level <= 8));
});

test('tampering with an eco-3-late log\'s plan or a recipe price diverges the replay', async () => {
  const otherPlan = structuredClone(lateLog);
  otherPlan.economy.builds[2] = ['amp', 'bass-strings', 'road-case'];
  assert.equal((await h.verifyReplay(otherPlan, flush)).ok, false);
  const dearer = structuredClone(lateLog);
  dearer.economy.ruleset.items['fuzz-pedal'].cost = 300;
  assert.equal((await h.verifyReplay(dearer, flush)).ok, false);
});

test('metrics on the eco-3-late stand-in: item value, unspent gold, tier times and level at 8:00', async () => {
  const mm = await metrics.measureLog(lateLog, flush);
  assert.equal(mm.replayOk, true);
  const e = mm.economy;
  const bots = lateLog.result.economy.bots;
  assert.deepEqual(e.itemsAtEnd, bots.map((b) => b.items.length), 'still a count');
  assert.deepEqual(e.itemValueAtEnd, bots.map((b) => b.items.reduce((s, k) => s + h.totalCost(LATE, k), 0)));
  assert.deepEqual(e.unspentAtEnd, bots.map((b) => b.gold));
  bots.forEach((b, i) => {
    const top = Math.max(...b.items.map((k) => h.itemTier(LATE, k)), 0);
    // No selling: a bot holding a tier-2 or tier-3 item bought a tier-2 item, and a tier-3 one after it.
    if (top >= 2) assert.ok(e.tier2At[i] !== null && e.tier2At[i] > 0 && e.tier2At[i] <= 600, `bot ${i} tier2At`);
    if (top === 3) assert.ok(e.tier3At[i] !== null && e.tier3At[i] > e.tier2At[i], `bot ${i} tier3At after tier2At`);
    if (e.tier3At[i] === null) assert.ok(b.items.every((k) => h.itemTier(LATE, k) < 3));
  });
  // Level at 8:00, read independently off the 8:00 checkpoint's XP.
  const at480 = JSON.parse(lateLog.checkpoints.find((c) => c.tick === 480 / h.TICK_DT).state).e.map(([, , xp]) => LATE.xp.thresholds.filter((x) => xp >= x).length);
  assert.deepEqual(e.levelAt480, at480);
  assert.ok(e.levelAt480.every((lv, i) => lv <= bots[i].level));

  const vals = metrics.matchValues(mm);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const median = (xs) => {
    const v = [...xs].sort((a, b) => a - b);
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  };
  close(vals.ecoItemValuePerBot, mean(e.itemValueAtEnd));
  assert.equal(vals.ecoUnspentAtEnd, median(e.unspentAtEnd));
  assert.equal(vals.ecoUnspentAtEndViolet, median(e.unspentAtEnd.slice(0, 3)));
  assert.equal(vals.ecoUnspentAtEndGreen, median(e.unspentAtEnd.slice(3)));
  assert.equal(vals.ecoTier2AtSec, median(e.tier2At.filter((x) => x !== null)));
  assert.equal(vals.ecoTier3AtSec, median(e.tier3At.filter((x) => x !== null)));
  close(vals.ecoLevelAt480, mean(at480));
});

/** The rich match's ledger: 100 start gold plus 300 s at 10 a second, and nothing else. */
const GOLD_ONLY_PASSIVE = (b) => Object.entries(b.earned).every(([k, v]) => (k === 'passive' ? v === 100 + 3000 : v === 0));

test('metrics, exact: rich scripted bots holding at their shops buy the whole ladder on schedule', async () => {
  // 10 gold a second and nothing else: every bot stays at its spawn (inside the shop radius) and buys
  // down its ladder as the passive gold arrives. Every ladder's running total is 300/350 … 2,650, so
  // each step lands on the first tick its bot holds that much (100 start gold + floor(tick / 2)).
  const rich = { ...LATE, name: 'eco-3-late-rich', gold: { ...LATE.gold, passivePerSec: 10 } };
  const hold = { decide: async () => ({ reply: '{"kind":"hold"}', action: { kind: 'hold' } }) };
  const log = await h.runMatch({
    seed: 7,
    sides: SIDES,
    callModelFor: () => async () => '{"kind":"hold"}',
    decisionPilotFor: () => hold,
    cadenceSec: 2,
    economy: rich,
    maxSimSec: 300,
    backend: { kind: 'mock' },
    flush,
  });
  assert.equal((await h.verifyReplay(log, flush)).ok, true);
  const bots = log.result.economy.bots;
  assert.ok(bots.every(GOLD_ONLY_PASSIVE), 'no gold but passive');
  assert.deepEqual(bots.map((b) => b.items), [
    ['wall-of-sound', 'arpeggiator'],
    ['arpeggiator', 'wall-of-sound'],
    ['feedback', 'headliner'],
    ['wall-of-sound', 'arpeggiator'],
    ['arpeggiator', 'wall-of-sound'],
    ['feedback', 'headliner'],
  ]);
  // Gold needed before the first tier-2 step is 1,250 and before the first tier-3 step 2,000, for every ladder.
  const secAt = (total) => (2 * (total - 100) * h.TICK_DT);
  const mm = await metrics.measureLog(log, flush);
  assert.equal(mm.replayOk, true);
  assert.deepEqual(mm.economy.tier2At, bots.map(() => secAt(1250)));
  assert.deepEqual(mm.economy.tier3At, bots.map(() => secAt(2000)));
  assert.deepEqual(mm.economy.itemValueAtEnd, bots.map(() => 2650));
  assert.deepEqual(mm.economy.unspentAtEnd, bots.map((b) => 100 + 3000 - 2650));
  assert.deepEqual(mm.economy.levelAt480, bots.map(() => null), 'ended at 5:00');
  const vals = metrics.matchValues(mm);
  assert.deepEqual([vals.ecoTier2AtSec, vals.ecoTier3AtSec, vals.ecoItemValuePerBot, vals.ecoLevelAt480], [secAt(1250), secAt(2000), 2650, null]);
});

test('metrics on logs without recipes or without an economy: tier times null, new keys null', async () => {
  const eco3 = await mock({ economy: 'eco-3', maxSimSec: 120 });
  const mm = await metrics.measureLog(eco3, flush);
  assert.deepEqual(mm.economy.tier2At, [null, null, null, null, null, null]);
  assert.deepEqual(mm.economy.tier3At, [null, null, null, null, null, null]);
  assert.deepEqual(mm.economy.levelAt480, [null, null, null, null, null, null], 'ended before 8:00');
  assert.deepEqual(mm.economy.itemValueAtEnd, eco3.result.economy.bots.map((b) => b.items.reduce((s, k) => s + h.ECO_3.items[k].cost, 0)));
  const vals = metrics.matchValues(mm);
  assert.deepEqual([vals.ecoTier2AtSec, vals.ecoTier3AtSec, vals.ecoLevelAt480], [null, null, null]);
  assert.equal(typeof vals.ecoUnspentAtEnd, 'number');

  const plain = await metrics.measureLog(await mock({ maxSimSec: 60 }), flush);
  const pv = metrics.matchValues(plain);
  for (const k of ['ecoItemValuePerBot', 'ecoUnspentAtEnd', 'ecoUnspentAtEndViolet', 'ecoUnspentAtEndGreen', 'ecoTier2AtSec', 'ecoTier3AtSec', 'ecoLevelAt480']) assert.equal(pv[k], null, k);
});
