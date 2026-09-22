import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Ledger, dayCT, fold, nextMatchId, pendingPlacements, queued, quotaUsed, standings } from './ledger.mjs';

const HOUSE = { handle: 'house', hash: 'hh', house: true };
const A = (hash = 'a1') => ({ handle: 'alice', hash });
const B = (hash = 'b1') => ({ handle: 'bob', hash });

let n = 0;
const ts = () => new Date(Date.UTC(2026, 8, 25, 12, 0, n++)).toISOString();
const q = (id, extra = {}) => ({ ts: ts(), type: 'queued', id, tournamentId: 'ladder', kind: 'placement', priority: 'placement', backendId: 'mock', seed: 7, quick: false, ranked: true, sides: { violet: A(), green: HOUSE }, ...extra });
const fin = (id, winner, extra = {}) => ({ ts: ts(), type: 'finished', id, ranked: true, sides: { violet: A(), green: HOUSE }, result: { winner, endReason: winner ? 'nexus' : 'timeout', stats: { violet: { calls: 10, parseErrors: 1, callErrors: 0 }, green: { calls: 10, parseErrors: 0, callErrors: 0 } } }, ...extra });

test('Ledger appends JSONL with a timestamp and reloads the same rows', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-ledger-'));
  try {
    const file = path.join(dir, 'sub', 'ledger.jsonl');
    const l = new Ledger(file).load();
    l.append({ type: 'paused', by: 'x' });
    l.append({ type: 'resumed', by: 'x' });
    assert.equal(readFileSync(file, 'utf8').split('\n').filter(Boolean).length, 2);
    const l2 = new Ledger(file).load();
    assert.equal(l2.rows.length, 2);
    assert.ok(l2.rows[0].ts);
    assert.equal(l2.state().paused, false);
    assert.equal(l2.state(), l2.state(), 'fold is cached until the next append');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claims: one handle per email, one email per handle, reassign moves it', () => {
  const s = fold([
    { ts: ts(), type: 'claim', email: 'a@x', handle: 'alice' },
    { ts: ts(), type: 'claim', email: 'b@x', handle: 'bob' },
    { ts: ts(), type: 'claim', email: 'c@x', handle: 'alice' },
  ]);
  assert.equal(s.claims.get('c@x'), 'alice');
  assert.equal(s.claims.has('a@x'), false);
  assert.equal(s.handles.get('alice'), 'c@x');
  assert.equal(s.handles.get('bob'), 'b@x');
});

test('job lifecycle folds to the right status; void marks and keeps the finished row', () => {
  const s = fold([q('m1'), { ts: ts(), type: 'started', id: 'm1' }, fin('m1', 'violet'), { ts: ts(), type: 'void', id: 'm1', reason: 'test' }, q('m2'), { ts: ts(), type: 'started', id: 'm2' }, { ts: ts(), type: 'failed', id: 'm2', error: 'boom' }, q('m3')]);
  assert.equal(s.jobs.get('m1').status, 'void');
  assert.equal(s.jobs.get('m2').status, 'failed');
  assert.equal(s.jobs.get('m2').reason, 'boom');
  assert.equal(s.jobs.get('m3').status, 'queued');
  assert.ok(s.voided.has('m1'));
  assert.equal(s.finished.length, 1);
});

test('nextMatchId is <tournament>-<yyyymmdd CT>-<seq> and continues after a reload', () => {
  const now = new Date('2026-09-25T03:30:00Z'); // 22:30 CT on the 24th
  assert.equal(nextMatchId(fold([]), 'ladder', now), 'ladder-20260924-001');
  const s = fold([q('ladder-20260924-001'), q('ladder-20260924-007')]);
  assert.equal(nextMatchId(s, 'ladder', now), 'ladder-20260924-008');
  assert.equal(dayCT('2026-09-25T04:59:00Z'), '2026-09-24');
  assert.equal(dayCT('2026-09-25T05:00:00Z'), '2026-09-25');
});

test('queued(): priority classes then FIFO, and an interrupted started job is runnable again', () => {
  const s = fold([
    q('t1', { kind: 'test', priority: 'test' }),
    q('p1'),
    q('t2', { kind: 'test', priority: 'test' }),
    { ts: ts(), type: 'started', id: 't1' },
    q('o1', { priority: 'organizer' }),
  ]);
  assert.deepEqual(
    queued(s).map((j) => j.id),
    ['o1', 'p1', 't1', 't2'],
    'started-but-not-running t1 is included',
  );
  assert.deepEqual(
    queued(s, new Set(['t1'])).map((j) => j.id),
    ['o1', 'p1', 't2'],
  );
});

test('quota is per handle per CT day, counts quick and full separately, ignores cancelled', () => {
  const day = '2026-09-25';
  const at = (h) => `2026-09-25T${String(h).padStart(2, '0')}:00:00Z`; // 13:00Z = 08:00 CT
  const rows = [];
  const tq = (id, hourZ, extra) => rows.push({ ...q(id, { kind: 'test', priority: 'test', requestedBy: { email: 'a@x', handle: 'alice' }, quick: true, ...extra }), ts: at(hourZ) });
  tq('a', 13);
  tq('b', 14);
  tq('c', 15, { quick: false });
  tq('d', 16);
  rows.push({ ts: at(16), type: 'cancelled', id: 'd' });
  tq('e', 3); // 22:00 CT the day before
  tq('f', 17, { requestedBy: { email: 'b@x', handle: 'bob' } });
  rows.push({ ts: at(17), type: 'started', id: 'a' });
  rows.push({ ...fin('a', null), ranked: false });
  const s = fold(rows);
  assert.deepEqual(quotaUsed(s, 'alice', day), { quick: 2, full: 1, active: 3 }, "b, c and yesterday's e are still queued");
  assert.deepEqual(quotaUsed(s, 'bob', day), { quick: 1, full: 0, active: 1 });
  assert.deepEqual(quotaUsed(s, 'alice', '2026-09-24'), { quick: 1, full: 0, active: 3 });
});

test('pendingPlacements finds only queued placements of that entrant', () => {
  const s = fold([q('p1'), q('p2', { sides: { violet: HOUSE, green: A() } }), q('p3', { sides: { violet: B(), green: HOUSE } }), { ts: ts(), type: 'started', id: 'p1' }]);
  assert.deepEqual(
    pendingPlacements(s, 'alice').map((j) => j.id),
    ['p2'],
  );
});

test('standings: Elo fold, house pinned, current vs all-time on revision, void excluded, scratch/quick never count', () => {
  const rows = [
    { ts: ts(), type: 'house', handle: 'house', hash: 'hh', file: 'prompts/pilots/drums.md' },
    { ts: ts(), type: 'prompt-seen', handle: 'alice', hash: 'a1', commit: 'c1' },
    { ts: ts(), type: 'prompt-seen', handle: 'bob', hash: 'b1', commit: 'c1' },
    fin('m1', 'violet'), // alice beats house: +16
    fin('m2', 'green', { sides: { violet: HOUSE, green: A() } }), // alice beats house from green
    fin('m3', 'green', { sides: { violet: A(), green: B() } }), // bob beats alice
    fin('m4', null, { sides: { violet: A(), green: B() } }), // draw
    fin('m5', 'violet', { ranked: false, sides: { violet: { scratch: true, handle: 'zed' }, green: HOUSE } }),
    fin('m6', 'violet', { ranked: false, quick: true }),
    fin('m7', 'violet', { sides: { violet: A(), green: HOUSE } }),
    { ts: ts(), type: 'void', id: 'm7', reason: 'oops' },
  ];
  let rowsA = standings(fold(rows));
  const alice = rowsA.find((r) => r.handle === 'alice');
  const bob = rowsA.find((r) => r.handle === 'bob');
  assert.ok(!rowsA.find((r) => r.handle === 'house'), 'house is not on the ladder');
  assert.ok(!rowsA.find((r) => r.handle === 'zed'), 'scratch handles are not on the ladder');
  assert.deepEqual(alice.allTime, { w: 2, d: 1, l: 1 });
  assert.deepEqual(alice.current, { w: 2, d: 1, l: 1 });
  assert.deepEqual(bob.allTime, { w: 1, d: 1, l: 0 });
  assert.equal(alice.nexusKills, 2);
  assert.equal(bob.nexusKills, 1);
  assert.equal(alice.draws, 1);
  assert.equal(alice.matches, 4, 'voided m7 does not count');
  assert.equal(alice.lastMatchId, 'm4');
  assert.ok(Math.abs(alice.parseErrorRate - 3 / 40) < 1e-9, 'violet in m1/m3/m4 (1 of 10 each), green in m2 (0 of 10)');
  // m1: alice 1016 (house pinned). m2: alice 1016+32*(1-E(1016,1000)) ≈ 1031.26.
  // m3: bob 1000 beats alice 1031.26: alice loses 32*E(1031,1000) ≈ 17.4 → 1013.8, bob → 1017.4.
  // m4: draw: alice slightly down, bob slightly up.
  assert.ok(bob.eloExact > alice.eloExact, 'bob beat alice and then drew');
  assert.equal(rowsA[0].rank, 1);
  assert.equal(rowsA[0].handle, 'bob');
  assert.equal(alice.elo, Math.round(alice.eloExact));

  // A revision: alice's current hash changes; her all-time stays, current resets, Elo kept.
  rowsA = standings(fold(rows.concat([{ ts: ts(), type: 'prompt-seen', handle: 'alice', hash: 'a2', commit: 'c2' }, fin('m8', 'violet', { sides: { violet: A('a2'), green: HOUSE } })])));
  const alice2 = rowsA.find((r) => r.handle === 'alice');
  assert.deepEqual(alice2.allTime, { w: 3, d: 1, l: 1 });
  assert.deepEqual(alice2.current, { w: 1, d: 0, l: 0 });
  assert.ok(alice2.eloExact > alice.eloExact, 'Elo carried over and grew');
});
