/**
 * Unit tests for the evolution harness. No model, no compiler, no match runner, no network: every
 * dependency `runGeneration` takes is a fake here, and the logs are synthetic. What is pinned:
 * seeds are deterministic, scoring follows the Jam's tie order, a generation runs end to end, a
 * crash anywhere resumes without redoing finished work, two stores with the same config come out
 * identical, and the epoch's promotion test replaces (or joins) the opponents only when it passes.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { bootstrapCI, eloFold, fitnessOf, jamScore, promotionDecision, summarizeSide } from './fitness.mjs';
import { diagnosticsFor, epochSeeds, initCampaign, matchKey, pairings, runGeneration, sentences } from './generation.mjs';
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

test('summarizeSide: counts real decisions, fired rules per instrument, descriptors', () => {
  const s = summarizeSide(fakeLog({ kinds: ['attack', 'ability', 'recall', 'move'] }), 'violet');
  assert.equal(s.realDecisions, 12); // 3 bots x 4, cached ones skipped
  assert.deepEqual(s.kinds, { move: 3, attack: 3, ability: 3, recall: 3, hold: 0 });
  assert.deepEqual(s.rules.drums, { r1: 1, default: 3 });
  assert.equal(s.descriptors.aggression, 0.5);
  assert.equal(s.descriptors.recallRate, 0.25);
  assert.ok(s.descriptors.spread > 0);
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
function fakeDeps({ failPlayAfter = Infinity, mutateReply = null, compileOpts = {} } = {}) {
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
