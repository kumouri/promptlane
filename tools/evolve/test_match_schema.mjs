/**
 * `npm run match` in the Jam's shape — both sides' compiled schemas on a schema server — and the
 * harness's real `playMatch` adapter on top of it. The schema server is an in-process fake on
 * 127.0.0.1 answering the `tools/jev/schema_server.py` wire contract, so no model is called; the
 * match runner, the sim, the log and `--verify` are the real ones.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT, makeObserve, makePlayMatch, repoPath } from './adapters.mjs';
import { loadHeadless } from '../match/load.mjs';
import { summarizeSide } from './fitness.mjs';

const CLI = path.join(ROOT, 'tools', 'match', 'cli.mjs');
let server;
let endpoint;
let dir;
let asked = 0;

/** Answers like schema_server.py: the first rule fires when the bearbot sees an enemy. */
function decide(body) {
  const rule = body.schema.rules[0];
  const obs = body.observation;
  const foe = obs.visibleEnemies?.[0];
  if (foe) return { action: { kind: 'attack', target: foe.id }, rule: rule.id, answers: { [rule.id]: 1 }, ms: 1 };
  return { action: { kind: 'move', target: { x: 1000, y: 100 } }, rule: null, answers: { [rule.id]: 0 }, ms: 1 };
}

function schemas(tag) {
  const out = {};
  for (const inst of ['drums', 'keytar', 'violin']) {
    out[inst] = { instrument: inst, pilot_file: `${tag}.md`, rules: [{ id: 'r1', condition: 'an enemy is visible', action_kind: 'attack', action_target_selector: 'nearest_enemy' }], default_action: { kind: 'move' } };
  }
  return out;
}

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'evolve-match-'));
  server = createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, backend: 'jev-schema', model: 'fake-jev' }));
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      asked += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(decide(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${server.address().port}/`;
  copyFileSync(path.join(ROOT, 'prompts', 'pilots', 'drums.md'), path.join(dir, 'a.md'));
  copyFileSync(path.join(ROOT, 'prompts', 'pilots', 'keytar.md'), path.join(dir, 'b.md'));
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify(schemas('a')));
  // side B as compile.py --format json output, the other accepted shape
  const instruments = Object.fromEntries(Object.entries(schemas('b')).map(([k, v]) => [k, { instrument: k, ok: true, schema: v }]));
  writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ version: 1, prompts: [{ name: 'b.md', instruments }] }));
});

after(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Async on purpose: spawnSync would block the event loop, and with it the fake server the child calls. */
function cli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('npm run match: both sides on compiled schemas, logged and replay-verified', async () => {
  const out = path.join(dir, 'm.json');
  const r = await cli(['--a', path.join(dir, 'a.md'), '--a-schemas', path.join(dir, 'a.json'), '--b', path.join(dir, 'b.md'), '--b-schemas', path.join(dir, 'b.json'),
    '--jev-schema', endpoint, '--seed', '7', '--cadence', '4', '--max-sim-sec', '40', '--out', out, '--quiet']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /RESULT .*backend=jev-schema\/fake-jev/);
  const log = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(log.sides.violet.schemas.drums.pilot_file, 'a.md');
  assert.equal(log.sides.green.schemas.violin.pilot_file, 'b.md');
  assert.ok(log.sides.violet.promptText.includes('drums'), 'the prose stays the side prompt text');
  const real = log.decisions.filter((d) => !d.cached);
  assert.ok(real.length >= 6 * 5, `only ${real.length} real decisions`);
  assert.ok(real.every((d) => JSON.parse(d.reply).action), 'every real decision came from the schema server');
  assert.equal(log.result.stats.violet.callErrors + log.result.stats.green.callErrors, 0);
  const v = await cli(['--verify', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /^VERIFY ok/);
});

test('npm run match: schema flags are checked', async () => {
  const noEndpoint = await cli(['--a', path.join(dir, 'a.md'), '--a-schemas', path.join(dir, 'a.json'), '--b', path.join(dir, 'b.md'), '--model', 'mock']);
  assert.equal(noEndpoint.status, 2);
  assert.match(noEndpoint.stderr, /need --jev-schema/);
  writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ drums: schemas('x').drums }));
  const incomplete = await cli(['--a', path.join(dir, 'a.md'), '--a-schemas', path.join(dir, 'bad.json'), '--b', path.join(dir, 'b.md'), '--b-schemas', path.join(dir, 'b.json'), '--jev-schema', endpoint]);
  assert.equal(incomplete.status, 2);
  assert.match(incomplete.stderr, /no compiled schema for keytar/);
});

test('repoPath: logs record repo-relative paths, never a machine path inside the repo', () => {
  assert.equal(repoPath(path.join(ROOT, 'runs', 'evolve', 'c', 'genomes', 'x.md')), 'runs/evolve/c/genomes/x.md');
  const outside = path.join(tmpdir(), 'y.md');
  assert.equal(repoPath(outside), outside);
});

test('harness playMatch adapter: runs the CLI and the log summarises', async () => {
  const before = asked;
  const play = makePlayMatch({ jevSchemaEndpoint: endpoint, matchTimeoutSec: 10 });
  const log = await play({
    violet: { id: 'aaa', prosePath: path.join(dir, 'a.md'), compiledPath: path.join(dir, 'a.json') },
    green: { id: 'bbb', prosePath: path.join(dir, 'b.md'), compiledPath: path.join(dir, 'b.json') },
    seed: 11,
    shape: { cadenceSec: 4, maxSimSec: 40 },
    out: path.join(dir, 'adapter.json'),
  });
  assert.ok(asked > before);
  assert.equal(log.sides.violet.name, 'aaa');
  const s = summarizeSide(log, 'violet');
  assert.ok(s.realDecisions > 0);
  assert.ok(s.rules.drums.r1 > 0 || s.rules.drums.default > 0);
  assert.ok([0, 0.5, 1].includes(s.score));
  assert.equal(log.resolution, undefined, 'a shape without a resolution keeps the sequential order it was cached under');
});

test('harness observe adapter: a replay recovers what each pilot saw, and the descriptors read it', async () => {
  const log = JSON.parse(readFileSync(path.join(dir, 'adapter.json'), 'utf8'));
  const observations = await makeObserve()(log);
  assert.ok(observations, 'the replay matched its checkpoints');
  assert.equal(observations.length, log.decisions.length);
  assert.ok(observations.every((o) => o && o.self.maxHp > 0), 'every decision, cached or not, has its observation');
  assert.ok(observations.every((o, i) => o.self.team === (log.decisions[i].bot < 3 ? 'violet' : 'green')), 'aligned with the log');
  const s = summarizeSide(log, 'violet', observations);
  assert.equal(typeof s.descriptors.aggression, 'number');
  assert.equal(typeof s.descriptors.caution, 'number');
  const tampered = { ...log, checkpoints: log.checkpoints.map((c, i) => (i === 0 ? { ...c, state: '{}' } : c)) };
  assert.equal(await makeObserve()(tampered), null, 'a replay that diverges describes nothing');
});

test('a schema pilot that cannot connect says why, not just "fetch failed"', async () => {
  const { jevSchemaTracingPilot } = await loadHeadless();
  const closed = createServer();
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
  const { port } = closed.address();
  await new Promise((resolve) => closed.close(resolve));
  const pilot = jevSchemaTracingPilot({ endpoint: `http://127.0.0.1:${port}/`, schemas: schemas('x'), timeoutSec: 10 });
  const { action, reply } = await pilot.decide({ self: { instrument: 'drums' } });
  assert.equal(action, null, 'a transport failure holds');
  assert.match(reply, /^\[pilot error: fetch failed <- ECONNREFUSED\]$/);
});
