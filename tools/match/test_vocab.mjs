/**
 * The shared vocabulary (tools/jev/vocab.py, docs/vocabulary-spec.md) against the real sim:
 *   - the Python mirrors of the TypeScript (map variants, attack ranges, vocabulary names) agree;
 *   - every checked-in match log still replays to the same checkpoints (§5.1: nothing in stage A can
 *     move a replay, and this proves it on the logs we have);
 *   - a real match, one side on vocab-2 schemas naming every new target and the other on a vocab-1
 *     schema, played through the real `schema_server.py --stub` (seeded random answers, $0): every
 *     ask is answered in the schema's own vocabulary, every new target resolves, and the log replays;
 *   - a schema pilot holds rather than play a vocab-2 schema on a server too old to know it;
 *   - `fight_samples.mjs` (the fight verdict's calibration data) reads every bearbot's hp.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { flush, loadHeadless } from './load.mjs';
import { samplesFromLog } from './fight_samples.mjs';

const h = await loadHeadless();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const dir = mkdtempSync(path.join(tmpdir(), 'vocab-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function python(code) {
  return JSON.parse(execFileSync(PYTHON, ['-c', code], { cwd: path.join(ROOT, 'tools', 'jev'), encoding: 'utf8' }));
}

function checkedInLogs() {
  return execFileSync('git', ['ls-files', 'runs/*.json'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((f) => {
      try {
        const log = JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
        return Array.isArray(log?.checkpoints) && Array.isArray(log?.decisions) ? { f, log } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

test('the Python mirrors match the TypeScript: maps, attack ranges, vocabulary names', () => {
  const py = python('import json, vocab; print(json.dumps({"maps": vocab.MAPS, "range": vocab.ATTACK_RANGE, "vocabs": vocab.VOCABS, "default": vocab.DEFAULT_VOCAB, "legacy": vocab.LEGACY_VOCAB}))');
  const maps = Object.fromEntries(Object.values(h.MAP_VARIANTS).map((m) => [m.name, [m.towerRange, m.towerFractions]]));
  assert.deepEqual(py.maps, maps);
  assert.deepEqual(py.range, Object.fromEntries(Object.entries(h.INSTRUMENTS).map(([k, v]) => [k, v.attackRange])));
  assert.deepEqual(py.vocabs, [...h.VOCABS]);
  assert.equal(py.default, h.DEFAULT_VOCAB);
  assert.equal(py.legacy, h.VOCAB_1);
});

test('every checked-in match log replays to the same checkpoints and result', async () => {
  const logs = checkedInLogs();
  assert.ok(logs.length >= 17, `found ${logs.length} logs`);
  for (const { f, log } of logs) {
    const v = await h.verifyReplay(log, flush);
    assert.ok(v.ok, `${f}: first divergence at tick ${v.firstDivergenceTick}`);
  }
});

/** `python tools/jev/schema_server.py --stub --port 0`; resolves to its endpoint once it is listening. */
function stubServer() {
  const child = spawn(PYTHON, [path.join(ROOT, 'tools', 'jev', 'schema_server.py'), '--stub', '--port', '0', '--budget-usd', '-1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  after(() => child.kill());
  return new Promise((resolve, reject) => {
    createInterface({ input: child.stdout }).on('line', (line) => {
      const m = line.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) resolve(m[0]);
    });
    child.on('exit', (code) => reject(new Error(`schema_server.py exited ${code}`)));
  });
}

const rule = (id, condition, kind, selector) => ({ id, condition, criteria_true: 'yes', criteria_false: 'no', action_kind: kind, action_ability: null, action_target_selector: selector });
const POSITION = new Set(['own_tower', 'own_front_tower', 'nearest_ally']);
const V2 = {
  drums: [rule('hold', 'is this bot under its own tower?', 'move', 'own_tower'), rule('punish', 'is an enemy bearbot under its tower?', 'attack', 'tower_diver')],
  keytar: [rule('focus', 'is this bot\'s side stronger here?', 'attack', 'nearest_enemy_bearbot'), rule('group', 'is this bot\'s side weaker here?', 'move', 'nearest_ally')],
  violin: [rule('farm', 'is an enemy minion in its attack range?', 'attack', 'nearest_enemy_minion'), rule('front', 'will an enemy tower shoot it?', 'move', 'own_front_tower')],
};

function vocab2Schemas() {
  return Object.fromEntries(Object.entries(V2).map(([inst, rules]) => [inst, {
    pilot_file: 'entrants/v2/pilot.md', instrument: inst, rules, default_action: { kind: 'move', ability: null, target_selector: 'push_lane' }, vocab: 'vocab-2',
  }]));
}

function vocab1Schemas() {
  return Object.fromEntries(['drums', 'keytar', 'violin'].map((inst) => [inst, {
    pilot_file: 'entrants/v1/pilot.md', instrument: inst, rules: [rule('near', 'is an enemy near?', 'attack', 'nearest_enemy')],
    default_action: { kind: 'move', ability: null, target_selector: 'push_lane' },
  }]));
}

function cli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'match', 'cli.mjs'), ...args], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('a real match on the stub schema server: vocab-2 targets resolve, vocab-1 plays alongside, the log replays', async () => {
  const endpoint = await stubServer();
  const health = await (await fetch(endpoint + 'health')).json();
  assert.deepEqual(health.vocabs, ['vocab-1', 'vocab-2']);
  writeFileSync(path.join(dir, 'v2.json'), JSON.stringify(vocab2Schemas()));
  writeFileSync(path.join(dir, 'v1.json'), JSON.stringify(vocab1Schemas()));
  const out = path.join(dir, 'match.json');
  const prose = path.join(ROOT, 'prompts', 'pilots', 'drums.md');
  const r = await cli(['--a', prose, '--a-schemas', path.join(dir, 'v2.json'), '--b', prose, '--b-schemas', path.join(dir, 'v1.json'),
    '--jev-schema', endpoint, '--seed', '7', '--cadence', '2', '--max-sim-sec', '150', '--out', out, '--quiet']);
  assert.equal(r.code, 0, r.out);
  const log = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(log.sides.violet.schemas.drums.vocab, 'vocab-2', 'the log keeps each schema, vocab key included');
  assert.equal(log.sides.green.schemas.drums.vocab, undefined);
  const asked = log.decisions.filter((d) => !d.cached);
  assert.ok(asked.length > 100);
  const errors = asked.filter((d) => d.reply?.startsWith('[pilot error'));
  assert.deepEqual(errors.map((d) => d.reply), [], 'no ask failed');
  const fired = new Map();
  for (const d of asked.filter((x) => x.bot < 3)) {
    const { rule: id } = JSON.parse(d.reply);
    if (!id) continue;
    const sel = Object.values(V2).flat().find((x) => x.id === id).action_target_selector;
    fired.set(sel, (fired.get(sel) ?? 0) + 1);
    if (POSITION.has(sel)) assert.equal(typeof d.action.target?.x, 'number', `${sel} resolves to a position`);
    else if (d.action.target !== undefined) assert.equal(typeof d.action.target, 'string', `${sel} resolves to an id`);
  }
  for (const sel of ['own_tower', 'own_front_tower', 'nearest_ally']) assert.ok(fired.get(sel) > 0, `${sel} fired: ${JSON.stringify([...fired])}`);
  const v = await cli(['--verify', out]);
  assert.equal(v.code, 0, v.out);
});

test('a schema pilot holds rather than play a vocab-2 schema on a server too old to echo it', async () => {
  let echo = null;
  const srv = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ action: { kind: 'hold' }, rule: null, answers: {}, ms: 1, targeting: 'own-lane-1', ...(echo ? { vocab: echo } : {}) }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  after(() => srv.close());
  const endpoint = `http://127.0.0.1:${srv.address().port}/`;
  const obs = { self: { instrument: 'drums' } };
  const v2 = h.jevSchemaTracingPilot({ endpoint, schemas: vocab2Schemas() });
  const v1 = h.jevSchemaTracingPilot({ endpoint, schemas: vocab1Schemas() });
  let d = await v2.decide(obs);
  assert.equal(d.action, null);
  assert.match(d.reply, /played the schema under vocab-1, not its own vocab-2; restart tools\/jev\/schema_server\.py/);
  assert.deepEqual((await v1.decide(obs)).action, { kind: 'hold' }, 'a vocab-1 schema plays on an old server as it always did');
  echo = 'vocab-2';
  assert.deepEqual((await v2.decide(obs)).action, { kind: 'hold' });
  assert.equal(h.vocabUnsupported({ vocabs: ['vocab-1'] }, ['vocab-1', 'vocab-2']), 'the schema server plays vocab-1 only, not vocab-2; restart tools/jev/schema_server.py from this checkout');
  assert.equal(h.vocabUnsupported({}, ['vocab-1']), null, 'a server that lists nothing plays vocab-1');
  assert.deepEqual(h.vocabsOf({ ...vocab1Schemas(), keytar: vocab2Schemas().keytar }), ['vocab-1', 'vocab-2']);
});

test('fight_samples: every bearbot in a sampled fight has its hp read back 5 s later', async () => {
  const { log } = checkedInLogs().find(({ f }) => f.includes('economy-p1-smoke') && f.includes('m3'));
  const rows = await samplesFromLog(h, log, { everySec: 2, horizonSec: 5 });
  assert.ok(rows.length > 20, `${rows.length} samples`);
  for (const r of rows) {
    assert.ok(r.obs.visibleEnemies.some((e) => e.kind === 'bearbot'));
    for (const id of [r.obs.self.id, ...r.obs.allies.map((a) => a.id)]) assert.equal(typeof r.future[id], 'number', id);
    assert.deepEqual(r.map?.name, 'pvp-1');
  }
});
