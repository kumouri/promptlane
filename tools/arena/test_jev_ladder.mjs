/**
 * Jev as the ladder's backend (docs/arena-site-spec.md §9): entrant prose → compile (once per prompt
 * hash + compiler version) → schemas → a fake `schema_server.py` on 127.0.0.1, the house on its tier's
 * checked-in schemas, both sides metered. Outages, compile failures and spend caps must show as
 * failed matches or visible holds, never as a quiet fallback to a text model. No network beyond
 * 127.0.0.1, no model, no spend.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from '../match/load.mjs';
import { jevSpentToday } from './ledger.mjs';
import { hashPrompt } from './prompts.mjs';
import { CompileFailed, SchemaCache, compilerVersion } from './schemas.mjs';
import { createArena } from './server.mjs';
import { fixture, json, quiet } from './testkit.mjs';

const ABILITIES = { drums: ['kick', 'fill'], keytar: ['chord', 'glissando'], violin: ['staccato', 'solo'] };

function schemaFor(instrument, pilotFile = 'pilot.md') {
  return {
    pilot_file: pilotFile,
    instrument,
    rules: [{ id: 'enemy_close', condition: 'is an enemy bearbot within reach?', criteria_true: 'yes', criteria_false: 'no', action_kind: 'ability', action_ability: ABILITIES[instrument][0], action_target_selector: 'nearest_enemy' }],
    default_action: { kind: 'move', ability: null, target_selector: 'push_lane' },
    validation_notes: [],
  };
}

/** compile.py --format json, trimmed; `failInstrument` makes that one fail to compile. */
function compileOutput({ failInstrument = null } = {}) {
  const instruments = {};
  for (const inst of ['drums', 'keytar', 'violin']) {
    instruments[inst] = inst === failInstrument
      ? { instrument: inst, ok: false, error: `the translator could not produce a valid schema for ${inst}: nope` }
      : { instrument: inst, ok: true, schema: schemaFor(inst, 'entrants/x/pilot.md'), markdown: `# ${inst}` };
  }
  return { exitCode: failInstrument ? 1 : 0, data: { version: 1, backend: 'fake:qwen', usage: { calls: 3, total_tokens: 4500, cost_usd: 0.0006 }, prompts: [{ name: 'pilot.md', markdown: '# x', instruments }] } };
}

/**
 * A fake schema_server.py. `answer(n, body)` → undefined (a normal 200), or `{status, error}`.
 * Every reply names a door: every 4th answered call is "workers-ai", the rest "typesafe", and echoes
 * the targeting rule the request named and the schema's own vocabulary, as the real server does.
 */
async function fakeJev({ answer = () => undefined, costUsd = 0.00002, health = {} } = {}) {
  const seen = { posts: 0, pilotFiles: new Set(), instruments: new Set(), targeting: new Set(), vocab: new Set(), maps: new Set() };
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET') {
        res.end(JSON.stringify({ ok: true, backend: 'jev-schema', model: 'fake-jev', jev_backend: 'typesafe', cost_usd: 0, budget_usd: 3, targeting: ['first-min', 'own-lane-1'], vocabs: ['vocab-1', 'vocab-2'], ...health }));
        return;
      }
      seen.posts += 1;
      const { schema, observation, targeting, vocab, map } = JSON.parse(body);
      seen.targeting.add(targeting);
      assert.equal(vocab, schema.vocab ?? 'vocab-1', 'every ask names the schema its own vocabulary');
      seen.vocab.add(vocab);
      seen.maps.add(JSON.stringify(map));
      seen.pilotFiles.add(schema.pilot_file);
      seen.instruments.add(schema.instrument);
      assert.equal(schema.instrument, observation.self.instrument);
      const bad = answer(seen.posts, schema);
      if (bad) {
        res.statusCode = bad.status;
        res.end(JSON.stringify({ error: bad.error }));
        return;
      }
      const door = seen.posts % 4 === 0 ? 'workers-ai' : 'typesafe';
      res.end(JSON.stringify({ action: { kind: 'move', target: { x: 500, y: 500 } }, rule: null, answers: { enemy_close: 0.2 }, ms: 1, door, tokens_in: 500, cost_usd: costUsd, targeting: targeting ?? 'first-min', vocab: schema.vocab ?? 'vocab-1' }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, seen, endpoint: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise((r) => srv.close(r)) };
}

/** A server that must never be asked anything: stands in for the qwen9b model server. */
async function tripwire() {
  const hits = [];
  const srv = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.end('{}');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { hits, endpoint: `http://127.0.0.1:${srv.address().port}/`, close: () => new Promise((r) => srv.close(r)) };
}

/** A Jev-ladder arena: short matches so the suite stays fast; compiles go through `compileRun`. */
async function jevArena({ endpoint, handles = { alice: 'keytar.md' }, compileRun = async () => compileOutput(), backend = {}, qwenEndpoint, tweak } = {}) {
  const f = fixture({
    handles,
    tweak: (cfg) => {
      cfg.tournament.backend = 'jev-schema';
      cfg.tournament.maxSimSec = 30;
      cfg.tournament.cadenceSec = 4;
      cfg.tournament.quick = { maxSimSec: 20, cadenceSec: 4, seed: 7 };
      cfg.backends['jev-schema'] = { ...cfg.backends['jev-schema'], endpoint, avgSecPerCall: 0.01, timeoutSec: 5, ...backend };
      if (qwenEndpoint) cfg.backends.qwen9b = { ...cfg.backends.qwen9b, endpoint: qwenEndpoint };
      tweak?.(cfg);
    },
  });
  const compiles = [];
  const arena = await createArena({
    config: f.config,
    dataDir: f.data,
    devUser: 'dev@example.com',
    log: quiet,
    sync: false,
    hooks: {
      compilerVersion: 'testver',
      ladderCompileRun: async (text) => {
        compiles.push(text);
        return compileRun(text, compiles.length);
      },
    },
  });
  const base = await arena.listen(0);
  return { f, arena, base, compiles, cleanup: async () => { await arena.close(); f.cleanup(); } };
}

const jobs = (arena) => [...arena.ledger.state().jobs.values()];

// --- the compile cache ------------------------------------------------------------------------

test('SchemaCache: one compile per prompt hash + compiler version, on disk; a failure caches nothing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-schemas-'));
  try {
    let runs = 0;
    let fail = false;
    const run = async () => {
      runs += 1;
      return compileOutput({ failInstrument: fail ? 'violin' : null });
    };
    const a = new SchemaCache({ dir, run, version: 'v1' });
    const first = await a.schemasFor('Prose A.');
    assert.equal(first.cached, false);
    assert.deepEqual(Object.keys(first.schemas), ['drums', 'keytar', 'violin']);
    assert.equal(first.hash, hashPrompt('Prose A.'));
    assert.ok(existsSync(path.join(dir, `${first.hash}.v1.json`)));
    const again = await new SchemaCache({ dir, run, version: 'v1' }).schemasFor('Prose A.');
    assert.equal(again.cached, true, 'a restart reads the disk, it does not re-sample the compile');
    assert.deepEqual(again.schemas, first.schemas);
    assert.equal(runs, 1);
    const [p, q] = [a.schemasFor('Prose B.'), a.schemasFor('Prose B.')];
    await Promise.all([p, q]);
    assert.equal(runs, 2, 'two asks at once share one compile');
    await new SchemaCache({ dir, run, version: 'v2' }).schemasFor('Prose A.');
    assert.equal(runs, 3, 'a new compiler version compiles again');
    fail = true;
    await assert.rejects(a.schemasFor('Prose C.'), (err) => err instanceof CompileFailed && /violin: the translator could not/.test(err.message));
    assert.ok(!readdirSync(dir).some((n) => n.startsWith(hashPrompt('Prose C.'))), 'a failed compile is not cached');
    await assert.rejects(new SchemaCache({ dir, run: async () => { throw new Error('compiler backend unavailable: refused'); }, version: 'v1' }).schemasFor('Prose D.'), CompileFailed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compilerVersion: changes with the translator source, the backend and the model', () => {
  const files = (extra = '') => (f) => Buffer.from(path.basename(f) + extra);
  const base = compilerVersion('/r', { backend: 'ollama', model: null }, files());
  assert.match(base, /^[0-9a-f]{12}$/);
  assert.equal(compilerVersion('/r', { backend: 'ollama', model: null }, files()), base);
  assert.notEqual(compilerVersion('/r', { backend: 'openrouter', model: null }, files()), base);
  assert.notEqual(compilerVersion('/r', { backend: 'ollama', model: 'qwen3.5:27b' }, files()), base);
  assert.notEqual(compilerVersion('/r', { backend: 'ollama', model: null }, files('edited')), base);
  const crlf = (f) => Buffer.from(`${path.basename(f)}\r\nline\r\n`);
  const lf = (f) => Buffer.from(`${path.basename(f)}\nline\n`);
  assert.equal(compilerVersion('/r', { backend: 'ollama' }, crlf), compilerVersion('/r', { backend: 'ollama' }, lf), 'line endings do not matter');
  assert.match(compilerVersion(ROOT, { backend: 'ollama', model: null }), /^[0-9a-f]{12}$/, 'the real files hash');
});

// --- the ladder on Jev ------------------------------------------------------------------------

test('Jev ladder: placements compile the prose once, both sides play schemas on Jev, spend and doors are on the ledger and in the log; qwen is never asked', async () => {
  const jev = await fakeJev();
  const qwen = await tripwire();
  const t = await jevArena({ endpoint: jev.endpoint, qwenEndpoint: qwen.endpoint });
  try {
    await t.arena.sync();
    await t.arena.queue.waitForIdle(60000);
    const placed = jobs(t.arena).filter((j) => j.kind === 'placement');
    assert.equal(placed.length, 3);
    assert.deepEqual(placed.map((j) => j.status), ['finished', 'finished', 'finished'], JSON.stringify(placed.map((j) => j.reason)));
    assert.equal(t.compiles.length, 1, 'three placements, one compile');
    assert.deepEqual([...jev.seen.instruments].sort(), ['drums', 'keytar', 'violin']);
    assert.deepEqual([...jev.seen.pilotFiles].sort(), ['entrants/x/pilot.md', 'prompts/pilots/house-violet.md'], 'the entrant plays its compile, the house plays house-medium.schemas.json');
    assert.deepEqual(qwen.hits, [], 'nothing ever asked the text-model server');
    assert.deepEqual([...jev.seen.targeting], ['own-lane-1'], 'every ask names the default targeting rule');
    assert.deepEqual([...jev.seen.maps], [JSON.stringify({ name: 'pvp-1', towerRange: 160, towerFractions: [0.16, 0.3] })], 'every ask names the match map');
    assert.deepEqual([...jev.seen.vocab], ['vocab-1'], 'the house file and this fake compile carry no vocab key: vocab-1');

    const j = placed[0];
    assert.ok(j.jev.calls > 0);
    assert.ok(j.jev.costUsd > 0);
    assert.ok(j.jev.doors.typesafe > 0 && j.jev.doors['workers-ai'] > 0, 'which door answered is counted per match');
    assert.deepEqual(j.jev.unanswered, { violet: 0, green: 0 });
    const entrantSide = j.sides.violet.house ? 'green' : 'violet';
    assert.equal(j.jev.compile[entrantSide].kind, 'compiled');
    assert.equal(j.jev.compile[entrantSide].compilerVersion, 'testver');
    assert.equal(j.jev.compile[entrantSide === 'violet' ? 'green' : 'violet'].kind, 'house');
    assert.equal(placed.filter((p) => p.jev.compile[p.sides.violet.house ? 'green' : 'violet'].cached).length, 2, 'later placements read the cache');

    const log = JSON.parse(readFileSync(path.join(t.f.data, 'logs', `${j.id}.json`), 'utf8'));
    assert.equal(log.backend.arenaBackend, 'jev-schema');
    assert.equal(log.backend.jevBackend, 'typesafe');
    assert.deepEqual(log.backend.jev.doors, j.jev.doors, 'the log records which door played');
    assert.equal(log.map.name, 'pvp-1');
    assert.equal(log.targeting, 'own-lane-1', 'the log records the targeting rule its schemas played');
    assert.deepEqual(Object.keys(log.sides[entrantSide].schemas), ['drums', 'keytar', 'violin']);
    assert.equal(log.sides[entrantSide].schemaSource.kind, 'compiled');
    assert.ok(log.decisions.some((d) => (d.reply ?? '').includes('"door":"workers-ai"')));

    const spent = jevSpentToday(t.arena.ledger.state(), 'jev-schema');
    assert.ok(Math.abs(spent - placed.reduce((s, p) => s + p.jev.costUsd, 0)) < 1e-9, 'the day total is the sum of the matches');
    const ladder = (await json(`${t.base}api/ladder`)).body.rows;
    assert.equal(ladder.find((r) => r.handle === 'alice').matches, 3, 'Jev matches are ranked like any other');
    const page = await (await fetch(`${t.base}matches/${j.id}`)).text();
    assert.match(page, /Jev: \d+ decisions · \$0\.\d{4} · answered by typesafe \d+, workers-ai \d+/);
  } finally {
    await t.cleanup();
    await jev.close();
    await qwen.close();
  }
});

test('Jev ladder: a compile failure fails the match visibly, retries once, and plays nothing', async () => {
  const jev = await fakeJev();
  const t = await jevArena({ endpoint: jev.endpoint, compileRun: async () => compileOutput({ failInstrument: 'violin' }) });
  try {
    const sub = await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules. Recall when low.', kind: 'quick' }) });
    assert.equal(sub.status, 202, JSON.stringify(sub.body));
    await t.arena.queue.waitForIdle(30000);
    const all = jobs(t.arena);
    const first = all.find((x) => x.id === sub.body.id);
    assert.equal(first.status, 'failed');
    assert.match(first.reason, /compile failed — violin: the translator could not produce a valid schema/);
    const retry = all.filter((x) => x.retryOf === first.id);
    assert.equal(retry.length, 1, 're-queued once');
    assert.equal(retry[0].status, 'failed');
    assert.equal(all.filter((x) => x.retryOf === retry[0].id).length, 0, 'a retry is not retried');
    assert.equal(t.compiles.length, 2);
    assert.equal(jev.seen.posts, 0, 'nothing was played');
    const page = await (await fetch(`${t.base}matches/${first.id}`)).text();
    assert.match(page, /failed — compile failed — violin/);
  } finally {
    await t.cleanup();
    await jev.close();
  }
});

test('Jev ladder: Jev going dark mid-match stops it early as failed (re-queued once), never a quiet hold-out', async () => {
  const jev = await fakeJev({ answer: (n) => (n > 40 ? { status: 502, error: 'workers-ai fallback failed: 500' } : undefined) });
  const t = await jevArena({ endpoint: jev.endpoint });
  try {
    const id = t.arena.queue.enqueue({
      tournamentId: 'ladder', kind: 'test', priority: 'test', seed: 7, backendId: 'jev-schema', cadenceSec: 4, maxSimSec: 600, quick: false, ranked: false,
      sides: { violet: { scratch: true, handle: 'zed' }, green: { handle: 'house', hash: t.arena.house.hash, house: true } },
      scratchText: 'Zed rules.',
    });
    await t.arena.queue.waitForIdle(60000);
    const all = jobs(t.arena);
    const j = all.find((x) => x.id === id);
    assert.equal(j.status, 'failed');
    assert.match(j.reason, /Jev stopped answering: 30 decisions in a row went unanswered \(last: \[pilot error: jev-schema endpoint responded 502/);
    assert.equal(j.jev.unanswered.violet + j.jev.unanswered.green >= 30, true);
    const log = JSON.parse(readFileSync(path.join(t.f.data, 'logs', `${id}.json`), 'utf8'));
    assert.ok(log.result.ticks < 1000, 'stopped long before the 600 s it was asked to play');
    const retry = all.find((x) => x.retryOf === id);
    assert.equal(retry?.status, 'failed', 'the one retry met the same outage');
    assert.equal(all.filter((x) => x.status === 'finished').length, 0, 'nothing counted');
  } finally {
    await t.cleanup();
    await jev.close();
  }
});

test('Jev ladder: a side with more unanswered decisions than maxUnansweredRate fails the match', async () => {
  const jev = await fakeJev({ answer: (n) => (n % 5 === 0 ? { status: 502, error: 'timeout' } : undefined) });
  const t = await jevArena({ endpoint: jev.endpoint });
  try {
    const sub = await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    await t.arena.queue.waitForIdle(30000);
    const j = jobs(t.arena).find((x) => x.id === sub.body.id);
    assert.equal(j.status, 'failed');
    assert.match(j.reason, /Jev left too many decisions unanswered: violet \d+ of \d+, green \d+ of \d+ \(limit 5%\)/);
    assert.ok(existsSync(path.join(t.f.data, 'logs', `${j.id}.json`)), 'the log is kept to look at');
    assert.equal(jobs(t.arena).filter((x) => x.retryOf === j.id).length, 1);
  } finally {
    await t.cleanup();
    await jev.close();
  }
});

test('Jev ladder: the per-match spend cap stops a match (no retry); the daily budget holds new ones, visibly', async () => {
  const jev = await fakeJev({ costUsd: 0.01 });
  const t = await jevArena({ endpoint: jev.endpoint, backend: { maxUsdPerMatch: 0.05, dailyBudgetUsd: 0.08 } });
  try {
    const a = await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    await t.arena.queue.waitForIdle(30000);
    const j = jobs(t.arena).find((x) => x.id === a.body.id);
    assert.equal(j.status, 'failed');
    assert.match(j.reason, /per-match Jev spend cap reached: \$0\.0\d+ of \$0\.05/);
    assert.equal(jobs(t.arena).filter((x) => x.retryOf === j.id).length, 0, 'a spend cap is not retried');
    assert.ok(j.jev.costUsd >= 0.05 && j.jev.costUsd < 0.08, 'stopped within a round of the cap');

    // Another failed-by-cap match puts today's total over 0.08: the next match is held, not run.
    const b = await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'yan', prompt: 'Yan rules.', kind: 'quick' }) });
    await t.arena.queue.waitForIdle(30000);
    assert.ok(jevSpentToday(t.arena.ledger.state(), 'jev-schema') >= 0.08);
    const c = await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'wes', prompt: 'Wes rules.', kind: 'quick' }) });
    const deadline = Date.now() + 10000;
    while (!t.arena.queue.holds.has('jev-schema') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.match(t.arena.queue.holds.get('jev-schema')?.reason ?? '', /daily Jev budget reached: \$0\.\d+ of \$0\.08 today/);
    assert.equal(jobs(t.arena).find((x) => x.id === c.body.id).status, 'queued', 'held, still in line');
    const m = (await json(`${t.base}api/matches`)).body;
    assert.match(m.holds['jev-schema'].reason, /daily Jev budget/);
    assert.match(await (await fetch(`${t.base}matches`)).text(), /Backend <code>jev-schema<\/code> is not starting matches/);
    assert.ok(b.body.id);
  } finally {
    await t.cleanup();
    await jev.close();
  }
});

test('Jev ladder: an unreachable server, or a text-model server on the Jev port, holds the queue visibly', async () => {
  const dead = await fakeJev();
  const deadEndpoint = dead.endpoint;
  await dead.close();
  const t = await jevArena({ endpoint: deadEndpoint });
  try {
    const sub = await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    const deadline = Date.now() + 10000;
    while (!t.arena.queue.holds.has('jev-schema') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.match(t.arena.queue.holds.get('jev-schema').reason, /Jev schema server not reachable at/);
    assert.equal(jobs(t.arena).find((x) => x.id === sub.body.id).status, 'queued');
  } finally {
    await t.cleanup();
  }
  const qwenLike = await fakeJev({ health: { backend: 'ollama', model: 'qwen3.5:9b' } });
  const u = await jevArena({ endpoint: qwenLike.endpoint });
  try {
    await json(`${u.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    const deadline = Date.now() + 10000;
    while (!u.arena.queue.holds.has('jev-schema') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.match(u.arena.queue.holds.get('jev-schema').reason, /is not a Jev schema server .*backend="ollama"/);
    assert.equal(qwenLike.seen.posts, 0, 'a text-model server is never played as Jev');
  } finally {
    await u.cleanup();
    await qwenLike.close();
  }
  // a schema server from before the targeting rule (no `targeting` in /health) resolves first-min only
  const old = await fakeJev({ health: { targeting: undefined } });
  const o = await jevArena({ endpoint: old.endpoint });
  try {
    await json(`${o.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    const deadline = Date.now() + 10000;
    while (!o.arena.queue.holds.has('jev-schema') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.match(o.arena.queue.holds.get('jev-schema').reason, /resolves targets under first-min only, not own-lane-1; restart tools\/jev\/schema_server\.py/);
    assert.equal(old.seen.posts, 0, 'nothing is played on the old rule by mistake');
  } finally {
    await o.cleanup();
    await old.close();
  }
  // one from before vocabularies (no `vocabs` in /health) plays vocab-1 only, and entrants compile vocab-2
  const preVocab = await fakeJev({ health: { vocabs: undefined } });
  const v = await jevArena({ endpoint: preVocab.endpoint });
  try {
    await json(`${v.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    const deadline = Date.now() + 10000;
    while (!v.arena.queue.holds.has('jev-schema') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.match(v.arena.queue.holds.get('jev-schema').reason, /plays vocab-1 only, not vocab-2; restart tools\/jev\/schema_server\.py/);
    assert.equal(preVocab.seen.posts, 0, 'no entrant schema is played under the old words');
  } finally {
    await v.cleanup();
    await preVocab.close();
  }
});

test('Jev ladder: refuses to start with a house that has no compiled schemas; the qwen ladder still starts with one', async () => {
  const f = fixture({ handles: {}, tweak: (cfg) => {
    cfg.tournament.backend = 'jev-schema';
    cfg.house = { handle: 'house', files: ['prompts/pilots/drums.md'] };
  } });
  try {
    await assert.rejects(createArena({ config: f.config, dataDir: f.data, devUser: 'd@x', log: quiet, sync: false }), /is Jev, and the house \(prompts\/pilots\/drums\.md\) has no compiled schemas/);
    f.config.tournament.backend = 'mock';
    const arena = await createArena({ config: f.config, dataDir: f.data, devUser: 'd@x', log: quiet, sync: false });
    assert.equal(arena.house.schemas, undefined);
    await arena.close();
  } finally {
    f.cleanup();
  }
});

test('Jev ladder: house.schemas plays a named file; the ledger house row records it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-house-schemas-'));
  const jev = await fakeJev();
  const file = path.join(dir, 'h.json');
  writeFileSync(file, JSON.stringify(Object.fromEntries(['drums', 'keytar', 'violin'].map((i) => [i, schemaFor(i, 'custom-house')]))));
  const t = await jevArena({ endpoint: jev.endpoint, tweak: (cfg) => (cfg.house = { ...cfg.house, schemas: path.relative(ROOT, file) }) });
  try {
    assert.equal(t.arena.ledger.state().house.schemasFile, path.relative(ROOT, file));
    await json(`${t.base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'zed', prompt: 'Zed rules.', kind: 'quick' }) });
    await t.arena.queue.waitForIdle(30000);
    assert.ok(jev.seen.pilotFiles.has('custom-house'));
  } finally {
    await t.cleanup();
    await jev.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
