import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadHeadless } from '../match/load.mjs';
import { Ledger } from './ledger.mjs';
import { PromptStore } from './prompts.mjs';
import { Queue, finalFromLog, wallCapMs } from './queue.mjs';

const quiet = { info() {}, warn() {}, error() {} };
const headless = await loadHeadless();

function setup(hooks = {}, { backends, house: houseOverrides } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-queue-'));
  const ledger = new Ledger(path.join(dir, 'ledger.jsonl')).load();
  const promptStore = new PromptStore(path.join(dir, 'prompts'));
  const houseText = 'House. Reply with one JSON action.';
  const houseHash = promptStore.save('house', houseText);
  const aliceHash = promptStore.save('alice', 'Alice. Reply with one JSON action.');
  const house = { handle: 'house', hash: houseHash, file: 'prompts/pilots/drums.md', ...houseOverrides };
  ledger.append({ type: 'house', handle: house.handle, hash: house.hash, file: house.file });
  const queue = new Queue({
    ledger,
    backends: backends ?? { mock: { kind: 'mock', avgSecPerCall: 0.001 } },
    headless,
    dataDir: dir,
    promptStore,
    house,
    log: quiet,
    hooks,
  });
  const job = (extra = {}) => ({
    tournamentId: 'ladder',
    kind: 'test',
    priority: 'test',
    sides: { violet: { handle: 'alice', hash: aliceHash }, green: { handle: 'house', hash: houseHash, house: true } },
    seed: 7,
    backendId: 'mock',
    cadenceSec: 4,
    maxSimSec: 30,
    quick: true,
    ranked: false,
    requestedBy: { email: 'a@x', handle: 'alice' },
    ...extra,
  });
  return { dir, ledger, queue, job, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('wallCapMs is 3× expected with a 60 s floor', () => {
  assert.equal(wallCapMs({ maxSimSec: 600, cadenceSec: 2, avgSecPerCall: 0.9 }), 3 * 300 * 6 * 0.9 * 1000);
  assert.equal(wallCapMs({ maxSimSec: 180, cadenceSec: 4, avgSecPerCall: 0.001 }), 60000);
});

test('finalFromLog reads towers and nexus hp from the last checkpoint', () => {
  assert.equal(finalFromLog({ checkpoints: [] }), null);
  assert.deepEqual(finalFromLog({ checkpoints: [{ tick: 100, state: JSON.stringify({ b: [], t: [1, 2], n: [3, 4], m: 0 }) }] }), { tick: 100, towers: [1, 2], nexus: [3, 4] });
});

test('a verified match writes the log and a finished row; the scratch file is gone afterwards', async () => {
  const { dir, ledger, queue, job, cleanup } = setup();
  try {
    queue.start();
    const id = queue.enqueue(job({ sides: { violet: { scratch: true, handle: 'zed' }, green: job().sides.green }, scratchText: 'Zed. Reply with one JSON action.' }));
    assert.ok(existsSync(path.join(dir, 'scratch', `${id}.md`)));
    await queue.waitForIdle(30000);
    const j = ledger.state().jobs.get(id);
    assert.equal(j.status, 'finished');
    assert.equal(j.result.endReason, null, 'quick test stops early');
    assert.equal(j.result.ticks, 600);
    assert.ok(j.verify.checkpointsCompared >= 6);
    const log = JSON.parse(readFileSync(path.join(dir, 'logs', `${id}.json`), 'utf8'));
    assert.equal(log.schema, 'promptlane-match-log-1');
    assert.equal(log.sides.violet.name, 'zed (scratch)');
    assert.equal(log.sides.violet.promptText, 'Zed. Reply with one JSON action.');
    assert.equal(log.backend.arenaBackend, 'mock');
    assert.ok(!existsSync(path.join(dir, 'scratch', `${id}.md`)), 'scratch text is not kept past the match');
    const v = await headless.verifyReplay(log);
    assert.ok(v.ok, 'the written log re-verifies from disk');
  } finally {
    await queue.stop();
    cleanup();
  }
});

test('replay-verify gate: a diverged log is voided, kept as .diverged.json, and re-queued exactly once', async () => {
  let tamper = 2;
  const { dir, ledger, queue, job, cleanup } = setup({
    afterRun(log) {
      if (tamper-- > 0) {
        log.checkpoints[log.checkpoints.length - 1].state = '{"tampered":true}';
      }
      return log;
    },
  });
  try {
    queue.start();
    const id = queue.enqueue(job());
    await queue.waitForIdle(30000);
    const s = ledger.state();
    const first = s.jobs.get(id);
    assert.equal(first.status, 'void');
    assert.match(first.reason, /replay diverged/);
    assert.ok(existsSync(path.join(dir, 'logs', `${id}.diverged.json`)));
    assert.ok(!existsSync(path.join(dir, 'logs', `${id}.json`)), 'a diverged log is never written as a countable log');
    const retries = [...s.jobs.values()].filter((j) => j.retryOf === id);
    assert.equal(retries.length, 1, 're-queued once');
    assert.equal(retries[0].status, 'void', 'second attempt was tampered too');
    assert.equal([...s.jobs.values()].filter((j) => j.retryOf === retries[0].id).length, 0, 'a retry is not retried again');
    assert.equal(s.finished.length, 0, 'nothing counted');
  } finally {
    await queue.stop();
    cleanup();
  }
});

test('wall-clock cap: a slow backend is aborted, the log is kept, and the job is timed-out (not counted)', async () => {
  const { dir, ledger, queue, job, cleanup } = setup({
    wallCapMs: 150,
    callModelFor: () => async () => {
      await new Promise((r) => setTimeout(r, 40));
      return '{"kind":"hold"}';
    },
  });
  try {
    queue.start();
    const id = queue.enqueue(job({ maxSimSec: 600 }));
    await queue.waitForIdle(30000);
    const j = ledger.state().jobs.get(id);
    assert.equal(j.status, 'timed-out');
    assert.match(j.reason, /wall-clock cap/);
    assert.ok(existsSync(path.join(dir, 'logs', `${id}.json`)), 'what there is can still be watched');
    const log = JSON.parse(readFileSync(path.join(dir, 'logs', `${id}.json`), 'utf8'));
    assert.equal(log.result.endReason, null);
    assert.ok(log.result.ticks < 12000);
    assert.equal(ledger.state().finished.length, 0);
  } finally {
    await queue.stop();
    cleanup();
  }
});

test('pause stops new starts; resume continues; priority order is honoured', async () => {
  const { ledger, queue, job, cleanup } = setup();
  try {
    queue.pause('org');
    queue.start();
    const t = queue.enqueue(job());
    const p = queue.enqueue(job({ kind: 'placement', priority: 'placement', quick: false, ranked: true, maxSimSec: 30 }));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(ledger.state().jobs.get(t).status, 'queued');
    assert.equal(queue.running.size, 0);
    queue.resume('org');
    await queue.waitForIdle(30000);
    const s = ledger.state();
    assert.equal(s.jobs.get(t).status, 'finished');
    assert.equal(s.jobs.get(p).status, 'finished');
    assert.ok(s.jobs.get(p).startedAt <= s.jobs.get(t).startedAt, 'placement ran before the test');
    assert.equal(s.jobs.get(p).id > s.jobs.get(t).id, true, 'even though it was queued later');
  } finally {
    await queue.stop();
    cleanup();
  }
});

test('decisionPilotFor: undefined unless house.backend names a configured backend with a house side in the job', () => {
  const { queue, job, cleanup } = setup();
  try {
    assert.equal(queue.decisionPilotFor(job()), undefined, 'house.backend unset -> today\'s default, unchanged');
  } finally {
    cleanup();
  }
});

test('Jev house bot (SHADOW ONLY, runs/jev-house-bot-2026-09-23.md): house.backend routes only the house side through jev-http; the entrant side is unaffected', async () => {
  const calls = [];
  const stub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      calls.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ bucket: 'go_home', rule: 2, answers: { q2_tower_no_wave_go_home: 0.9 }, ms: 3.1 }));
    });
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const port = stub.address().port;
  const { dir, ledger, queue, job, cleanup } = setup(
    {},
    {
      backends: {
        mock: { kind: 'mock', avgSecPerCall: 0.001 },
        'jev-house': { kind: 'jev-http', endpoint: `http://127.0.0.1:${port}/`, timeoutSec: 5 },
      },
      house: { backend: 'jev-house' },
    },
  );
  try {
    queue.start();
    const id = queue.enqueue(job());
    await queue.waitForIdle(30000);
    assert.equal(ledger.state().jobs.get(id).status, 'finished');
    const log = JSON.parse(readFileSync(path.join(dir, 'logs', `${id}.json`), 'utf8'));
    const houseDecisions = log.decisions.filter((d) => d.bot >= 3 && !d.cached);
    const entrantDecisions = log.decisions.filter((d) => d.bot < 3 && !d.cached);
    assert.ok(houseDecisions.length > 0, 'the house (green) side made at least one real call');
    assert.ok(entrantDecisions.length > 0, 'the entrant (violet) side made at least one real call');
    for (const d of houseDecisions) {
      const parsed = JSON.parse(d.reply);
      assert.equal(parsed.bucket, 'go_home');
      assert.deepEqual(d.action, { kind: 'move', target: { x: 900, y: 100 } }, 'green home per src/sim/map.ts BASE.green');
    }
    for (const d of entrantDecisions) {
      assert.doesNotMatch(d.reply, /"bucket"/, 'the entrant side never touches the jev-house stub');
    }
    assert.ok(calls.length > 0, 'the stub actually received worksheet POSTs');
    assert.ok('hp' in calls[0] && 'instrument' in calls[0] && 'team' in calls[0], 'the worksheet shape reaches the stub');
    assert.equal(calls[0].team, 'green');
  } finally {
    await queue.stop();
    cleanup();
    await new Promise((resolve) => stub.close(resolve));
  }
});

test('a missing prompt fails the job cleanly and the worker moves on', async () => {
  const { ledger, queue, job, cleanup } = setup();
  try {
    queue.start();
    const bad = queue.enqueue(job({ sides: { violet: { handle: 'ghost', hash: 'nope' }, green: job().sides.green } }));
    const ok = queue.enqueue(job());
    await queue.waitForIdle(30000);
    assert.equal(ledger.state().jobs.get(bad).status, 'failed');
    assert.match(ledger.state().jobs.get(bad).reason, /not in the store/);
    assert.equal(ledger.state().jobs.get(ok).status, 'finished');
  } finally {
    await queue.stop();
    cleanup();
  }
});
