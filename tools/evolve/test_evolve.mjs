/**
 * Unit tests for the evolution harness. No model, no compiler, no match runner, no network: every
 * dependency `runGeneration` takes is a fake here, and the logs are synthetic. What is pinned:
 * seeds are deterministic, scoring follows the Jam's tie order, a generation runs end to end, a
 * crash anywhere resumes without redoing finished work, two stores with the same config come out
 * identical, and the epoch's promotion test replaces (or joins) the opponents only when it passes.
 */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { CampaignStop, DEFAULT_BUDGET, SPEND_FILE, assertMayContinue, epochCapUsd, guardDeps, spendTotals } from './budget.mjs';
import { awayWeight, bootstrapCI, eloFold, fitnessOf, jamScore, moveBearing, promotionDecision, summarizeSide, towardWeight } from './fitness.mjs';
import { DEFAULT_CAMPAIGN, diagnosticsFor, epochSeeds, initCampaign, matchKey, pairings, runGeneration, sentences } from './generation.mjs';
import { deriveSeed, mulberry32, pick } from './seeds.mjs';
import { Store, genomeId, normalizeProse } from './store.mjs';

// --- synthetic logs -------------------------------------------------------------------------------

function stats(deaths = 0, towersLost = 0, callErrors = 0) {
  return { calls: 10, cached: 0, parseErrors: 0, callErrors, avgMs: 5, deaths, towersLost };
}

/** A minimal match log: `winner`, deaths per side, tower hp per team (violet = even indices). */
function fakeLog({ winner = null, endReason = winner ? 'nexus' : 'timeout', deaths = [0, 0], towerHp = [1000, 1000], kinds = ['attack', 'move'], callErrors = [0, 0] } = {}) {
  const t = [];
  for (let i = 0; i < 12; i++) t.push(i % 2 === 0 ? towerHp[0] / 6 : towerHp[1] / 6);
  const b = [0, 1, 2, 3, 4, 5].map((i) => [100, 100 + i * 10, 900 - i * 10, 1, 0]);
  const decisions = [];
  for (let bot = 0; bot < 6; bot++) {
    kinds.forEach((kind, j) => decisions.push({ tick: j, bot, reply: JSON.stringify({ rule: j === 0 ? 'r1' : null, action: { kind } }), action: { kind }, ms: 1 }));
    decisions.push({ tick: 99, bot, action: { kind: 'move' }, cached: true });
  }
  return {
    decisions,
    checkpoints: [{ tick: 100, state: JSON.stringify({ b, t, n: [3000, 3000], m: 4 }) }],
    result: { winner, endReason, durationSec: 600, ticks: 12000, deaths: [], stats: { violet: stats(deaths[0], 0, callErrors[0]), green: stats(deaths[1], 0, callErrors[1]) } },
  };
}

test('seeds: deterministic, in range, label-sensitive', () => {
  assert.equal(deriveSeed(7, 'epoch', 0, 'seed', 0), deriveSeed(7, 'epoch', 0, 'seed', 0));
  assert.notEqual(deriveSeed(7, 'epoch', 0, 'seed', 0), deriveSeed(7, 'epoch', 0, 'seed', 1));
  for (let i = 0; i < 50; i++) {
    const s = deriveSeed('x', i);
    assert.ok(s >= 1 && s < 2 ** 31);
  }
  const a = mulberry32(3);
  const b = mulberry32(3);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(pick(['a', 'b', 'c'], 1, 'k'), pick(['a', 'b', 'c'], 1, 'k'));
});

test('store: genome id is a content hash of normalised prose', () => {
  assert.equal(genomeId('hello\r\nworld  \n\n'), genomeId('hello\nworld'));
  assert.equal(normalizeProse('a\r\nb   '), 'a\nb\n');
  assert.notEqual(genomeId('a'), genomeId('b'));
});

test('jamScore: sim result first, then fewer deaths, then tower hp; errors and seed are a draw', () => {
  assert.deepEqual(jamScore(fakeLog({ winner: 'violet' }), 'violet'), { score: 1, by: 'nexus' });
  assert.deepEqual(jamScore(fakeLog({ winner: 'violet' }), 'green'), { score: 0, by: 'nexus' });
  assert.deepEqual(jamScore(fakeLog({ deaths: [1, 2] }), 'violet'), { score: 1, by: 'deaths' });
  assert.deepEqual(jamScore(fakeLog({ towerHp: [900, 1000] }), 'violet'), { score: 0, by: 'towerHp' });
  assert.deepEqual(jamScore(fakeLog(), 'violet'), { score: 0.5, by: 'draw' });
  assert.deepEqual(jamScore(fakeLog({ callErrors: [3, 0] }), 'green'), { score: 0.5, by: 'draw' });
});

test('summarizeSide: counts real decisions, fired rules per instrument; no observations, no hp/vision descriptors', () => {
  const s = summarizeSide(fakeLog({ kinds: ['attack', 'ability', 'recall', 'move'] }), 'violet');
  assert.equal(s.realDecisions, 12); // 3 bots x 4, cached ones skipped
  assert.deepEqual(s.kinds, { move: 3, attack: 3, ability: 3, recall: 3, hold: 0 });
  assert.deepEqual(s.rules.drums, { r1: 1, default: 3 });
  assert.equal(s.descriptors.aggression, null);
  assert.equal(s.descriptors.caution, null);
  assert.ok(s.descriptors.spread > 0);
});

// --- descriptors (Ceryce's design, ruled 2026-09-30 02:08 CT) ----------------------------------------

/** An observation: the bot at (100, 100) with `hp` of 100, enemy bearbots in vision at `bears`. */
function obsAt(hp, bears = [], extra = {}) {
  return {
    clockSec: 0,
    self: { id: 'bb-1', team: 'violet', lane: 'top', instrument: 'drums', pos: { x: 100, y: 100 }, hp, maxHp: 100, moveSpeed: 1, cooldowns: {} },
    allies: [],
    visibleEnemies: [...bears.map(([x, y], i) => ({ id: `bb-${9 + i}`, pos: { x, y }, hp: 100, maxHp: 100, kind: 'bearbot' })), ...(extra.enemies ?? [])],
    nearbyMinions: [],
    nearbyTowers: [],
  };
}

test('descriptor weights: 1 on the easy side of half hp, doubling every 10 points past it', () => {
  for (const hp of [100, 80, 50]) assert.equal(towardWeight(hp), 1);
  assert.equal(towardWeight(40), 2);
  assert.equal(towardWeight(30), 4);
  assert.equal(towardWeight(0), 32);
  for (const hp of [0, 20, 50]) assert.equal(awayWeight(hp), 1);
  assert.equal(awayWeight(60), 2);
  assert.equal(awayWeight(100), 32);
  assert.ok(Math.abs(towardWeight(45) - Math.SQRT2) < 1e-12);
});

test("moveBearing: toward / away from the nearest enemy bearbot in the bot's own vision", () => {
  const move = (x, y) => ({ kind: 'move', target: { x, y } });
  const obs = obsAt(100, [[300, 100], [100, 900]]); // nearest bear due east
  assert.equal(moveBearing(obs, move(200, 100)), 'toward');
  assert.equal(moveBearing(obs, move(0, 100)), 'away');
  assert.equal(moveBearing(obs, move(100, 300)), null, 'square to the nearest bear: neither');
  assert.equal(moveBearing(obs, move(100, 100)), null, 'a move to where it stands goes nowhere');
  assert.equal(moveBearing(obs, { kind: 'move', target: 'bb-9' }), 'toward', 'an entity target resolves from the observation');
  assert.equal(moveBearing(obs, { kind: 'attack', target: 'bb-9' }), null, 'only moves have a bearing');
  const minionsOnly = obsAt(100, [], { enemies: [{ id: 'mn-1', pos: { x: 300, y: 100 }, hp: 50, maxHp: 50, kind: 'minion' }] });
  assert.equal(moveBearing(minionsOnly, move(200, 100)), null, 'no enemy BEARBOT in vision');
});

test('summarizeSide: aggression and caution are hp-weighted sums over real decisions', () => {
  const log = fakeLog({ kinds: ['attack', 'move', 'recall', 'move'] });
  const east = { x: 200, y: 100 };
  const west = { x: 0, y: 100 };
  // per bot: attack at 30% hp, move toward the bear at 100%, recall at 90%, move away at 60%
  const plan = [
    [obsAt(30, [[300, 100]]), null],
    [obsAt(100, [[300, 100]]), east],
    [obsAt(90, [[300, 100]]), null],
    [obsAt(60, [[300, 100]]), west],
  ];
  const observations = log.decisions.map((d, i) => {
    if (d.cached) return null;
    const [obs, target] = plan[i % 5];
    if (target) d.action = { kind: 'move', target };
    return obs;
  });
  const s = summarizeSide(log, 'violet', observations);
  assert.equal(s.realDecisions, 12);
  assert.deepEqual(s.moves, { toward: 3, away: 3 });
  // aggression: attack at 30% weighs 2^2 = 4, the toward move 1 -> 3 bots x 5 / 12
  assert.equal(s.descriptors.aggression, Math.round((15 / 12) * 1000) / 1000);
  // caution: recall at 90% weighs 2^4 = 16, the away move at 60% 2^1 = 2 -> 3 bots x 18 / 12
  assert.equal(s.descriptors.caution, 4.5);
});

test('bootstrapCI and fitnessOf: seeded, paired by seed, no interval below 2 seeds', () => {
  assert.deepEqual(bootstrapCI([1]), { mean: 1, lo: null, hi: null, n: 1 });
  const a = bootstrapCI([1, 0.5, 1, 0.5, 1], { seed: 9 });
  assert.deepEqual(a, bootstrapCI([1, 0.5, 1, 0.5, 1], { seed: 9 }));
  assert.ok(a.lo <= a.mean && a.mean <= a.hi);
  const fit = fitnessOf([
    { seed: 1, side: 'violet', score: 1 },
    { seed: 1, side: 'green', score: 0 },
    { seed: 2, side: 'violet', score: 1 },
    { seed: 2, side: 'green', score: 1 },
  ]);
  assert.equal(fit.n, 2); // two seeds, not four matches
  assert.equal(fit.mean, 0.75);
  assert.deepEqual([fit.wins, fit.draws, fit.losses], [3, 0, 1]);
});

test('promotionDecision: needs enough seeds and a lower bound above one half', () => {
  assert.equal(promotionDecision({ n: 3, lo: 0.9 }, { minSeeds: 8 }).promote, false);
  assert.equal(promotionDecision({ n: 8, lo: 0.5 }, { minSeeds: 8 }).promote, false);
  assert.equal(promotionDecision({ n: 8, lo: 0.56 }, { minSeeds: 8 }).promote, true);
});

test('eloFold: arena Elo with the opponents pinned at 1000', () => {
  const r = eloFold([{ violet: 'c', green: 'o', violetScore: 1 }, { violet: 'o', green: 'c', violetScore: 0 }], ['o']);
  assert.equal(r.o, 1000);
  assert.ok(r.c > 1030);
});

test('pairings: both sides of every seed, no self-play, stable keys', () => {
  const shape = { cadenceSec: 2, maxSimSec: 600 };
  const p = pairings('c', ['o', 'c'], [5, 6], shape);
  assert.equal(p.length, 4);
  assert.deepEqual(p.map((m) => [m.violet, m.green, m.seed]), [['c', 'o', 5], ['o', 'c', 5], ['c', 'o', 6], ['o', 'c', 6]]);
  assert.equal(p[0].key, matchKey({ violet: 'c', green: 'o', seed: 5, shape }));
  assert.notEqual(p[0].key, matchKey({ violet: 'c', green: 'o', seed: 5, shape: { cadenceSec: 4, maxSimSec: 180 } }));
});

test('matchKey covers the ruleset: map and economy change the key; a pre-ruleset shape keeps its old key', async () => {
  const legacy = { cadenceSec: 2, maxSimSec: 600 };
  const k = (shape) => matchKey({ violet: 'c', green: 'o', seed: 5, shape });
  assert.equal(k(legacy), createHash('sha256').update(['c', 'o', 5, 2, 600].join('|')).digest('hex').slice(0, 16), 'old campaigns keep their cache');
  const pvp = { ...legacy, map: 'pvp-1', economy: 'none' };
  assert.notEqual(k(pvp), k(legacy));
  assert.notEqual(k(pvp), k({ ...pvp, map: 'v1' }));
  assert.notEqual(k(pvp), k({ ...pvp, economy: 'eco-1' }));
  assert.notEqual(k({ ...pvp, economy: 'eco-2' }), k({ ...pvp, economy: 'eco-3' }), 'each preset is its own cache');
  assert.equal(k(pvp), k({ ...pvp }));
  const { loadHeadless } = await import('../match/load.mjs');
  const headless = await loadHeadless();
  assert.equal(DEFAULT_CAMPAIGN.shape.map, headless.DEFAULT_MAP.name, 'the campaign default follows DEFAULT_MAP');
  assert.equal(DEFAULT_CAMPAIGN.shape.economy, headless.DEFAULT_ECONOMY?.name ?? 'none');
  // The river objective: hashed when the shape names it; an economy-era shape keeps its key.
  const river = { ...pvp, objective: 'none' };
  assert.notEqual(k(river), k(pvp));
  assert.notEqual(k(river), k({ ...river, objective: 'river-1' }));
  assert.equal(DEFAULT_CAMPAIGN.shape.objective, headless.DEFAULT_OBJECTIVE?.name ?? 'none');
  // A recall rule likewise: hashed only when named, so every existing campaign keeps its key.
  assert.equal(k({ ...river, recall: undefined }), k(river));
  assert.notEqual(k({ ...river, recall: 'recall-2' }), k(river));
  assert.notEqual(k({ ...river, objective: 'river-2' }), k({ ...river, objective: 'river-1' }));
  // The tick resolution: hashed when the shape names it; an objective-era shape keeps its key.
  const resolved = { ...river, resolution: 'simultaneous-1' };
  assert.notEqual(k(resolved), k(river));
  assert.notEqual(k(resolved), k({ ...resolved, resolution: 'sequential' }));
  assert.equal(DEFAULT_CAMPAIGN.shape.resolution, headless.DEFAULT_RESOLUTION, 'the campaign default follows DEFAULT_RESOLUTION');
  // The targeting rule likewise: a campaign cached before it (campaign 2) keeps its key and plays first-min.
  assert.equal(k({ ...resolved, targeting: undefined }), k(resolved));
  assert.notEqual(k({ ...resolved, targeting: 'own-lane-1' }), k(resolved));
  assert.notEqual(k({ ...resolved, targeting: 'own-lane-1' }), k({ ...resolved, targeting: 'first-min' }));
  assert.equal(DEFAULT_CAMPAIGN.shape.targeting, headless.DEFAULT_TARGETING, 'the campaign default follows DEFAULT_TARGETING');
  // The vocabulary likewise: hashed when named, and a shape without it (campaign 2) keeps its key.
  const targeted = { ...resolved, targeting: 'own-lane-1' };
  assert.equal(k({ ...targeted, vocab: undefined }), k(targeted));
  assert.notEqual(k({ ...targeted, vocab: 'vocab-2' }), k(targeted));
  assert.notEqual(k({ ...targeted, vocab: 'vocab-2' }), k({ ...targeted, vocab: 'vocab-1' }));
  assert.equal(DEFAULT_CAMPAIGN.shape.vocab, headless.DEFAULT_VOCAB, 'the campaign default follows DEFAULT_VOCAB');
});

test('vocabulary pin: keys recorded before vocab-2 existed are unchanged, and a campaign without shape.vocab compiles vocab-1', async () => {
  const at = (shape) => matchKey({ violet: 'aaaa', green: 'bbbb', seed: 7, shape });
  // recorded from develop at eaf1b45: the default shape of the day, and campaign 2's own shape
  const before = { cadenceSec: 2, maxSimSec: 600, map: 'pvp-1', economy: 'none', objective: 'none', resolution: 'simultaneous-1', targeting: 'own-lane-1' };
  assert.equal(at(before), '2c99c3f7cee86c68');
  assert.equal(at({ ...before, economy: 'eco-2' }), '1d42e2b418a889d4');
  const campaign2 = { cadenceSec: 2, maxSimSec: 600, map: 'pvp-1', economy: 'eco-2', objective: 'none', resolution: 'simultaneous-1', recall: 'none' };
  assert.equal(at(campaign2), 'd830281b2b7c5359');
  const { campaignVocab } = await import('./adapters.mjs');
  assert.equal(campaignVocab({ shape: campaign2 }), 'vocab-1', 'campaign 2 stays on the words it was compiled in');
  assert.equal(campaignVocab({ shape: DEFAULT_CAMPAIGN.shape }), 'vocab-2', 'a new campaign compiles what entrants compile');
});

test('sentences: split on sentence ends and blank lines', () => {
  assert.deepEqual(sentences('One. Two!\n\nThree?  Four'), ['One.', 'Two!', 'Three?', 'Four']);
});

// --- whole generations on fakes ---------------------------------------------------------------------

const SEED_PROSE = 'You are a bearbot. Attack the nearest enemy. Recall when you are hurt.\n';

function tempStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'evolve-test-'));
  return { store: new Store(dir), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function compiledFor(text, { drop = null } = {}) {
  const instruments = {};
  for (const inst of ['drums', 'keytar', 'violin']) {
    instruments[inst] = inst === drop
      ? { instrument: inst, ok: false, error: 'the translator could not produce a valid schema' }
      : { instrument: inst, ok: true, schema: { instrument: inst, rules: [{ id: 'r1', condition: `(${text.length}) is an enemy near`, action_kind: 'attack' }], default_action: { kind: 'move' } } };
  }
  return { version: 1, backend: 'fake', usage: { calls: 3, total_tokens: 30, cost_usd: 0 }, prompts: [{ name: 'pilot.md', instruments }] };
}

/**
 * Fakes that make the game a pure function of the prose: a genome's "strength" is how many times
 * it says BRAVE; the stronger side wins by nexus, equal strength is a full draw. `calls` counts
 * every call so a resume can be checked for re-work.
 */
function fakeDeps({ failPlayAfter = Infinity, mutateReply = null, compileOpts = {}, observe = null } = {}) {
  const calls = { mutate: 0, compile: 0, play: 0 };
  const strength = (id, store) => (store.genomeText(id).match(/BRAVE/g) ?? []).length;
  return {
    calls,
    bind(store) {
      return {
        async mutate({ parentText, slot }) {
          calls.mutate += 1;
          if (mutateReply) return mutateReply(parentText, slot);
          const k = Number(slot.split('-c')[1]);
          return { ok: true, prose: parentText.trimEnd() + (k === 0 ? ' Be BRAVE.' : ' Be careful.') + '\n', change: `slot ${slot}` };
        },
        async compile(text) {
          calls.compile += 1;
          return compiledFor(text, compileOpts);
        },
        ...(observe ? { observe } : {}),
        async playMatch({ violet, green }) {
          if (calls.play >= failPlayAfter) throw new Error('simulated crash');
          calls.play += 1;
          const sv = strength(violet.id, store);
          const sg = strength(green.id, store);
          return fakeLog({ winner: sv > sg ? 'violet' : sg > sv ? 'green' : null });
        },
      };
    },
  };
}

const SMALL = { seed: 3, evaluation: { seedsPerEpoch: 2 }, population: { parents: 2, childrenPerParent: 2 }, epoch: { generations: 5, promotionSeeds: 2 } };

function stripTimes(gen) {
  return JSON.parse(JSON.stringify(gen));
}

test('runGeneration: one generation end to end on fakes', async () => {
  const { store, cleanup } = tempStore();
  try {
    const { ids } = initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const deps = fakeDeps();
    const gen = await runGeneration(store, deps.bind(store));
    assert.equal(gen.phase, 'done');
    assert.equal(gen.slots.length, 2); // one parent x two children
    assert.ok(gen.slots.every((s) => s.child));
    assert.equal(deps.calls.mutate, 2);
    assert.equal(deps.calls.compile, 3); // seed + two children
    assert.equal(deps.calls.play, 2 * 2 * 2); // two children x two seeds x two sides (the seed never plays itself)
    const brave = gen.slots[0].child;
    assert.equal(gen.ranking[0].id, brave);
    assert.equal(gen.ranking[0].fitness.mean, 1);
    assert.equal(gen.ranking[0].fitness.n, 2);
    assert.deepEqual(gen.survivors, [brave, ids[0]]);
    assert.deepEqual(gen.seeds, epochSeeds(store.readJson('campaign.json'), 0));
    const state = store.readJson('state.json');
    assert.equal(state.generation, 1);
    assert.deepEqual(state.survivors, gen.survivors);
    assert.deepEqual(state.opponents, [ids[0]]); // no epoch boundary yet
    assert.equal(store.genomeMeta(brave).parent, ids[0]);
    assert.match(diagnosticsFor(store, brave, 1), /1 won|won/);
  } finally {
    cleanup();
  }
});

test('opponent prompts: the opponent is played, never evolved; the seeds are the only lineage', async () => {
  const { store, cleanup } = tempStore();
  try {
    const opp = 'You are the opponent. Be BRAVE. Attack the nearest enemy.\n';
    const { ids, opponents } = initCampaign(store, {
      name: 't',
      overrides: SMALL,
      seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }],
      opponentPrompts: [{ file: 'opp.md', text: opp }],
    });
    assert.equal(opponents.length, 1);
    assert.notEqual(opponents[0], ids[0]);
    const state = store.readJson('state.json');
    assert.deepEqual(state.opponents, opponents);
    assert.deepEqual(state.survivors, ids, 'only the seed is a parent');
    assert.deepEqual(store.readJson('campaign.json').opponentGenomes, opponents);

    const deps = fakeDeps();
    const gen = await runGeneration(store, deps.bind(store));
    assert.deepEqual(gen.parents, ids);
    assert.ok(gen.slots.every((s) => s.parent === ids[0]));
    assert.ok(!gen.candidates.includes(opponents[0]));
    assert.equal(deps.calls.play, 3 * 2 * 2, 'the seed and its two children, each vs the opponent on 2 seeds x 2 sides');
    assert.ok(!gen.survivors.includes(opponents[0]));

    const other = tempStore();
    try {
      assert.throws(
        () => initCampaign(other.store, { name: 'x', seedPrompts: [{ file: 'a.md', text: opp }], opponentPrompts: [{ file: 'b.md', text: opp }] }),
        /both a seed and an opponent/,
      );
    } finally {
      other.cleanup();
    }
  } finally {
    cleanup();
  }
});

test('campaign 1 (ruled 2026-09-30 07:34-07:35 CT): the hard lineage vs the medium house tier initialises', () => {
  const { store, cleanup } = tempStore();
  try {
    const read = (rel) => ({ file: rel, text: readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8') });
    const { ids, opponents } = initCampaign(store, {
      name: 'campaign-1-hard',
      seedPrompts: [read('prompts/pilots/house-hard.prose.md')],
      opponentPrompts: [read('prompts/pilots/house-violet.md')],
    });
    assert.equal(ids.length, 1);
    assert.equal(store.genomeMeta(ids[0]).source, 'prompts/pilots/house-hard.prose.md');
    assert.equal(store.genomeMeta(opponents[0]).source, 'prompts/pilots/house-violet.md');
    assert.deepEqual(store.readJson('state.json').survivors, ids);
  } finally {
    cleanup();
  }
});

test('runGeneration: a crash mid-play resumes without re-mutating, re-compiling or replaying', async () => {
  const clean = tempStore();
  const crashy = tempStore();
  try {
    for (const { store } of [clean, crashy]) initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const reference = await runGeneration(clean.store, fakeDeps().bind(clean.store));

    const first = fakeDeps({ failPlayAfter: 3 });
    await assert.rejects(runGeneration(crashy.store, first.bind(crashy.store)), /simulated crash/);
    assert.equal(crashy.store.readJson('gen-0.json').phase, 'compiled');
    assert.equal(crashy.store.readJson('state.json').generation, 0);

    const second = fakeDeps();
    const resumed = await runGeneration(crashy.store, second.bind(crashy.store));
    assert.deepEqual(second.calls, { mutate: 0, compile: 0, play: 8 - 3 });
    assert.deepEqual(stripTimes(resumed.ranking), stripTimes(reference.ranking));
    assert.deepEqual(resumed.survivors, reference.survivors);

    const third = fakeDeps(); // a finished generation that crashed before state.json: re-run is pure bookkeeping
    crashy.store.writeJson('state.json', { ...crashy.store.readJson('state.json'), generation: 0 });
    await runGeneration(crashy.store, third.bind(crashy.store));
    assert.deepEqual(third.calls, { mutate: 0, compile: 0, play: 0 });
    assert.equal(crashy.store.readJson('state.json').generation, 1);
  } finally {
    clean.cleanup();
    crashy.cleanup();
  }
});

test('runGeneration: two stores with the same config and fakes plan and rank identically', async () => {
  const a = tempStore();
  const b = tempStore();
  try {
    const gens = [];
    for (const { store } of [a, b]) {
      initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
      gens.push(await runGeneration(store, fakeDeps().bind(store)));
    }
    assert.deepEqual(gens[0].slots, gens[1].slots);
    assert.deepEqual(gens[0].seeds, gens[1].seeds);
    assert.deepEqual(gens[0].matchKeys, gens[1].matchKeys);
    assert.deepEqual(gens[0].ranking, gens[1].ranking);
  } finally {
    a.cleanup();
    b.cleanup();
  }
});

test('runGeneration: invalid mutations and failed compiles are recorded, not played', async () => {
  const { store, cleanup } = tempStore();
  try {
    initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const deps = fakeDeps({
      mutateReply: (parentText, slot) =>
        slot.endsWith('c0') ? { ok: true, prose: parentText, change: 'nothing' } : { ok: true, prose: parentText + 'See https://example.com now.\n', change: 'a link' },
    });
    const gen = await runGeneration(store, deps.bind(store));
    assert.equal(gen.slots[0].failed, 'no change');
    assert.match(gen.slots[1].failed, /URL/);
    assert.deepEqual(gen.candidates, gen.parents);
    assert.equal(deps.calls.play, 0); // only the seed, which is the opponent: nothing to play
    assert.equal(gen.ranking[0].fitness.note, 'is the opponent (½ by definition)');
  } finally {
    cleanup();
  }
  const second = tempStore();
  try {
    initCampaign(second.store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    await assert.rejects(runGeneration(second.store, fakeDeps({ compileOpts: { drop: 'violin' } }).bind(second.store)), /no opponent compiled/);
    assert.match(Object.values(second.store.readJson('gen-0.json').compileFailures)[0], /violin/);
  } finally {
    second.cleanup();
  }
});

test('epoch boundary: the winner replaces the opponent only if it passes on held-out seeds', async () => {
  for (const mode of ['latest', 'hall-of-fame']) {
    const { store, cleanup } = tempStore();
    try {
      const { ids } = initCampaign(store, {
        name: 't',
        overrides: { ...SMALL, epoch: { generations: 1, promotionSeeds: 3, opponents: mode } },
        seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }],
      });
      const deps = fakeDeps();
      const gen = await runGeneration(store, deps.bind(store));
      const brave = gen.slots[0].child;
      assert.equal(gen.promotion.id, brave);
      assert.equal(gen.promotion.promote, true, gen.promotion.reason);
      assert.equal(gen.promotion.seeds.length, 3);
      assert.ok(gen.promotion.seeds.every((s) => !gen.seeds.includes(s)), 'held-out seeds are not the epoch seeds');
      const state = store.readJson('state.json');
      assert.equal(state.epoch, 1);
      assert.deepEqual(state.opponents, mode === 'latest' ? [brave] : [ids[0], brave]);
      assert.equal(state.champions.at(-1).id, brave);
    } finally {
      cleanup();
    }
  }
});

test('defaults carry the 2026-09-30 rulings: 4 screening / 16 promotion seeds, hall of fame capped at 3', () => {
  assert.equal(DEFAULT_CAMPAIGN.evaluation.seedsPerEpoch, 4);
  assert.equal(DEFAULT_CAMPAIGN.epoch.promotionSeeds, 16);
  assert.equal(DEFAULT_CAMPAIGN.epoch.opponents, 'hall-of-fame');
  assert.equal(DEFAULT_CAMPAIGN.epoch.hallOfFameCap, 3);
  const { store, cleanup } = tempStore();
  try {
    assert.throws(() => initCampaign(store, { name: 't', overrides: { epoch: { hallOfFameCap: 0 } }, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] }), /hallOfFameCap/);
  } finally {
    cleanup();
  }
});

test('hall of fame: the fourth champion pushes the oldest out of the opponents', async () => {
  const { store, cleanup } = tempStore();
  try {
    const { ids } = initCampaign(store, {
      name: 't',
      overrides: { ...SMALL, population: { parents: 1, childrenPerParent: 1 }, epoch: { generations: 1, promotionSeeds: 2 } },
      seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }],
    });
    const champions = [ids[0]];
    for (let e = 0; e < 3; e++) {
      const gen = await runGeneration(store, fakeDeps().bind(store)); // each child adds one BRAVE: it beats every champion
      assert.equal(gen.promotion.promote, true, gen.promotion.reason);
      champions.push(gen.promotion.id);
    }
    assert.deepEqual(store.readJson('state.json').opponents, champions.slice(-3));
    assert.equal(store.readJson('state.json').champions.length, 4, 'the champion record keeps everyone');
  } finally {
    cleanup();
  }
});

test('runGeneration: observations from deps.observe reach the ranking descriptors', async () => {
  const { store, cleanup } = tempStore();
  try {
    initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const observe = async (log) => log.decisions.map((d) => (d.cached ? null : obsAt(100, [[300, 100]])));
    const gen = await runGeneration(store, fakeDeps({ observe }).bind(store));
    const row = gen.ranking.find((r) => r.fitness.matches > 0);
    assert.equal(row.descriptors.aggression, 0.5); // fakeLog: an attack, then a move with no target, at full hp
    assert.equal(row.descriptors.caution, 0);
  } finally {
    cleanup();
  }
});

test('epoch boundary: a candidate that only draws is not promoted', async () => {
  const { store, cleanup } = tempStore();
  try {
    const { ids } = initCampaign(store, {
      name: 't',
      overrides: { ...SMALL, epoch: { generations: 1, promotionSeeds: 3 } },
      seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }],
    });
    const deps = fakeDeps({ mutateReply: (parentText, slot) => ({ ok: true, prose: parentText.trimEnd() + ` Variant ${slot}.\n`, change: slot }) });
    const gen = await runGeneration(store, deps.bind(store));
    assert.equal(gen.promotion.promote, false);
    assert.deepEqual(store.readJson('state.json').opponents, [ids[0]]);
  } finally {
    cleanup();
  }
});

// --- spend caps and the blackout (budget.mjs; ruled 2026-09-30 01:50 and 03:07 CT) ------------------

/** fakeDeps with prices: a mutation reports $0.01, a compile $0.002, a match moves a fake Jev meter $0.05. */
function pricedDeps(store, opts = {}) {
  const base = fakeDeps(opts);
  const inner = base.bind(store);
  const meter = { jev: 0, readable: true };
  return {
    calls: base.calls,
    meter,
    jevSpend: async () => (meter.readable ? meter.jev : null),
    deps: {
      ...inner,
      mutate: async (a) => ({ ...(await inner.mutate(a)), usage: { cost_usd: 0.01 } }),
      compile: async (t, o) => {
        const out = await inner.compile(t, o);
        return { ...out, usage: { ...out.usage, cost_usd: 0.002 } };
      },
      playMatch: async (a) => {
        const log = await inner.playMatch(a);
        meter.jev += 0.05;
        return log;
      },
    },
  };
}

const NOON = () => new Date('2026-10-01T17:00:00Z');
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('budget: every paid call is charged to spend.json, by epoch and by kind', async () => {
  const { store, cleanup } = tempStore();
  try {
    initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const p = pricedDeps(store);
    await runGeneration(store, guardDeps(store, store.readJson('campaign.json'), p.deps, { now: NOON, jevSpend: p.jevSpend }));
    const t = spendTotals(store);
    assert.equal(t.calls, 2 + 3 + 8);
    assert.ok(near(t.byKind.mutate, 0.02) && near(t.byKind.compile, 0.006) && near(t.byKind.match, 0.4), JSON.stringify(t.byKind));
    assert.ok(near(t.byEpoch[0], 0.426));
    assert.equal(t.pending, null);
  } finally {
    cleanup();
  }
});

test('budget: the epoch cap stops before the call that would pass it; nothing is recorded as failed; raising it resumes', async () => {
  const { store, cleanup } = tempStore();
  try {
    initCampaign(store, {
      name: 't',
      overrides: { ...SMALL, budget: { firstEpochCapUsd: 0.3, reserveUsd: { match: 0.05 } } },
      seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }],
    });
    const p = pricedDeps(store);
    const guarded = () => guardDeps(store, store.readJson('campaign.json'), p.deps, { now: NOON, jevSpend: p.jevSpend });
    await assert.rejects(runGeneration(store, guarded()), (err) => err instanceof CampaignStop && /epoch 0 has spent .* cap/.test(err.reason));
    assert.equal(p.calls.play, 5, 'after 5 matches epoch 0 has spent 0.026 + 5 x 0.05 = 0.276; a sixth (reserve 0.05) could reach 0.326');
    const gen = store.readJson('gen-0.json');
    assert.equal(gen.phase, 'compiled');
    assert.ok(gen.slots.every((s) => s.child && !s.failed));
    assert.deepEqual(gen.compileFailures, {});
    assert.equal(store.readJson('state.json').generation, 0);
    assert.ok(spendTotals(store).byEpoch[0] <= 0.3);

    const campaign = store.readJson('campaign.json');
    store.writeJson('campaign.json', { ...campaign, budget: { ...campaign.budget, firstEpochCapUsd: 15 } });
    const done = await runGeneration(store, guarded());
    assert.equal(done.phase, 'done');
    assert.equal(p.calls.play, 8, 'the resume plays only the matches that were refused');
    assert.equal(p.calls.mutate, 2);
  } finally {
    cleanup();
  }
});

test("budget: epoch 2's cap is what's left of the $25 after epoch 1, not another $15", () => {
  const { store, cleanup } = tempStore();
  try {
    const { campaign } = initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const budget = campaign.budget;
    const totals = (byEpoch) => ({ byEpoch: Object.fromEntries(byEpoch.map((v, e) => [e, v])) });
    assert.equal(epochCapUsd(budget, totals([]), 0), 15);
    assert.equal(epochCapUsd(budget, totals([9]), 1), 16);
    assert.ok(near(epochCapUsd(budget, totals([14.9]), 1), 10.1));

    const at = (epoch, byEpoch) => {
      store.writeJson('state.json', { ...store.readJson('state.json'), epoch });
      store.writeJson(SPEND_FILE, { entries: byEpoch.map((usd, e) => ({ kind: 'match', epoch: e, usd })), pending: null });
    };
    const now = NOON();
    at(1, [9, 15.8]); // past a flat $15, still inside the $16 epoch 1 left
    assert.doesNotThrow(() => assertMayContinue(store, campaign, { now, kind: 'mutate' }));
    at(1, [9, 15.9]);
    assert.throws(() => assertMayContinue(store, campaign, { now, kind: 'match' }), /\$24\.9000.*\$25\.0000 total cap/);
    at(1, [15, 0]); // epoch 1 took its whole $15: no epoch 2
    assert.throws(() => assertMayContinue(store, campaign, { now, kind: 'mutate' }), /no further epoch/);
  } finally {
    cleanup();
  }
});

test('budget: the total cap, the epoch-1 gate and the epoch limit', () => {
  const { store, cleanup } = tempStore();
  try {
    const { campaign } = initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const at = (epoch, byEpoch) => {
      store.writeJson('state.json', { ...store.readJson('state.json'), epoch });
      store.writeJson(SPEND_FILE, { entries: byEpoch.map((usd, e) => ({ kind: 'match', epoch: e, usd })), pending: null });
    };
    const now = NOON();
    at(0, [14.9]);
    assert.doesNotThrow(() => assertMayContinue(store, campaign, { now, kind: 'mutate' }));
    assert.throws(() => assertMayContinue(store, campaign, { now, kind: 'match' }), /epoch 0 has spent \$14\.9000.*\$15\.0000 cap/);
    at(1, [15]);
    assert.throws(() => assertMayContinue(store, campaign, { now }), /epoch 0 spent \$15\.0000, not under its \$15\.0000 cap, so no further epoch/);
    at(1, [14.9, 10]);
    assert.throws(() => assertMayContinue(store, campaign, { now, kind: 'match' }), /\$24\.9000.*\$25\.0000 total cap/);
    at(1, [14.9, 9]);
    assert.doesNotThrow(() => assertMayContinue(store, campaign, { now, kind: 'match' }));
    at(2, [5, 5]);
    assert.throws(() => assertMayContinue(store, campaign, { now }), /2 epoch\(s\) done/);
  } finally {
    cleanup();
  }
});

test('budget: nothing paid runs in the blackout, or starts where it could run into it', async () => {
  const { store, cleanup } = tempStore();
  try {
    const { campaign } = initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const wallMs = 1350 * 1000; // the Jam-shape match wall cap
    const check = (iso) => assertMayContinue(store, campaign, { now: new Date(iso), kind: 'match', wallMs });
    assert.doesNotThrow(() => check('2026-10-15T23:00:00-05:00'));
    assert.throws(() => check('2026-10-15T23:50:00-05:00'), /could still be running when the blackout starts/);
    assert.throws(() => check('2026-10-16T00:00:00-05:00'), /blackout/);
    assert.throws(() => check('2026-10-16T23:59:00-05:00'), /blackout/);
    assert.doesNotThrow(() => check('2026-10-17T00:00:00-05:00'));

    const p = pricedDeps(store);
    const inBlackout = guardDeps(store, campaign, p.deps, { now: () => new Date('2026-10-16T12:00:00-05:00'), jevSpend: p.jevSpend });
    await assert.rejects(runGeneration(store, inBlackout), CampaignStop);
    assert.deepEqual(p.calls, { mutate: 0, compile: 0, play: 0 });
    assert.equal(store.exists('mutations', 'g0-p0-c0.json'), false, 'a refused mutation leaves no outcome behind');
  } finally {
    cleanup();
  }
});

test('budget: unreadable Jev spend refuses the match; unknown costs and interrupted calls are charged the reserve', async () => {
  const { store, cleanup } = tempStore();
  try {
    const { campaign } = initCampaign(store, { name: 't', overrides: SMALL, seedPrompts: [{ file: 'seed.md', text: SEED_PROSE }] });
    const p = pricedDeps(store);
    const side = (id) => ({ id });
    p.meter.readable = false;
    await assert.rejects(guardDeps(store, campaign, p.deps, { now: NOON, jevSpend: p.jevSpend }).playMatch({ violet: side('a'), green: side('b'), seed: 1 }), /can't read the Jev spend/);
    assert.equal(p.calls.play, 0);

    p.meter.readable = true;
    p.meter.jev = 5;
    const restarted = { ...p.deps, playMatch: async () => { p.meter.jev = 0.01; return fakeLog(); } }; // the server came back at $0.01
    await guardDeps(store, campaign, restarted, { now: NOON, jevSpend: p.jevSpend }).playMatch({ violet: side('a'), green: side('b'), seed: 1 });
    const last = store.readJson(SPEND_FILE).entries.at(-1);
    assert.equal(last.measured, false);
    assert.equal(last.usd, DEFAULT_BUDGET.reserveUsd.match);

    const noUsage = { ...p.deps, mutate: async () => ({ ok: false, error: 'boom' }) };
    await guardDeps(store, campaign, noUsage, { now: NOON, jevSpend: p.jevSpend }).mutate({ slot: 's', parentText: 'x' });
    assert.equal(store.readJson(SPEND_FILE).entries.at(-1).usd, DEFAULT_BUDGET.reserveUsd.mutate);

    store.writeJson(SPEND_FILE, { ...store.readJson(SPEND_FILE), pending: { kind: 'compile', label: 'x', epoch: 0 } }); // died mid-compile
    const before = spendTotals(store).totalUsd;
    guardDeps(store, campaign, p.deps, { now: NOON, jevSpend: p.jevSpend });
    assert.ok(near(spendTotals(store).totalUsd - before, DEFAULT_BUDGET.reserveUsd.compile));
    assert.equal(spendTotals(store).pending, null);
  } finally {
    cleanup();
  }
});

test('defaults carry the budget rulings: $15 for epoch 1, $25 in all, two epochs, the moved blackout, a private Jev port', () => {
  const b = DEFAULT_CAMPAIGN.budget;
  assert.equal(b.firstEpochCapUsd, 15);
  assert.equal(b.totalCapUsd, 25);
  assert.equal(b.maxEpochs, 2);
  assert.equal(Date.parse(b.blackouts[0].start), Date.parse('2026-10-16T05:00:00Z'));
  assert.doesNotMatch(DEFAULT_CAMPAIGN.jevSchemaEndpoint, /:8797\//);
});
