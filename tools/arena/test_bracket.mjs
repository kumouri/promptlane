/**
 * Jam-day bracket (spec §3.5, rulings Q6/Q7/Q9): seeding and byes, the full-draw tie order, and
 * the ledger fold that turns bracket/queued/finished/ruling/reveal rows into the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bracketMatchSeed, bracketPlan, bracketWinner, roundName, seedOrder, towerHpByTeam } from './rating.mjs';
import { bracketIds, bracketView, fold, isHeld } from './ledger.mjs';

test('seedOrder: 1 and 2 can only meet in the final; 1 plays the bottom seed', () => {
  assert.deepEqual(seedOrder(1), [1]);
  assert.deepEqual(seedOrder(2), [1, 2]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(16).slice(0, 4), [1, 16, 8, 9]);
  assert.throws(() => seedOrder(6), /power of two/);
});

test('bracketPlan: byes go to the top seeds; slot k of round r is fed by 2k, 2k+1', () => {
  const e = (n) => Array.from({ length: n }, (_, i) => ({ handle: `h${i + 1}`, hash: `x${i + 1}`, elo: 1200 - i * 10 }));
  assert.throws(() => bracketPlan(e(1)), /at least two/);
  const two = bracketPlan(e(2));
  assert.equal(two.size, 2);
  assert.deepEqual(two.rounds, [[{ a: 1, b: 2 }]]);
  const three = bracketPlan(e(3));
  assert.equal(three.size, 4);
  assert.deepEqual(three.rounds[0], [{ a: 1, b: null }, { a: 2, b: 3 }]);
  assert.equal(three.rounds.length, 2);
  const five = bracketPlan(e(5));
  assert.equal(five.size, 8);
  assert.deepEqual(five.rounds[0], [{ a: 1, b: null }, { a: 4, b: 5 }, { a: 2, b: null }, { a: 3, b: null }]);
  assert.equal(five.rounds.length, 3);
  assert.deepEqual(five.seeds[0], { seed: 1, handle: 'h1', hash: 'x1', elo: 1200 });
  const eight = bracketPlan(e(8));
  assert.ok(eight.rounds[0].every((s) => s.a !== null && s.b !== null), 'a full field has no byes');
});

test('roundName and bracketMatchSeed', () => {
  assert.deepEqual([1, 2, 3, 4].map((r) => roundName(r, 4)), ['Round 1', 'Quarter-finals', 'Semi-finals', 'Final']);
  assert.equal(roundName(1, 1), 'Final');
  assert.equal(bracketMatchSeed(2026, 1, 0), 2126);
  assert.notEqual(bracketMatchSeed(2026, 1, 0, 1), bracketMatchSeed(2026, 1, 0));
  assert.notEqual(bracketMatchSeed(2026, 2, 0), bracketMatchSeed(2026, 1, 1));
});

test('towerHpByTeam reads the checkpoint t array by parity (violet, green per lane and tier)', () => {
  assert.deepEqual(towerHpByTeam([10, 20, 1, 2, 100, 0]), { violet: 111, green: 22 });
  assert.deepEqual(towerHpByTeam(undefined), { violet: 0, green: 0 });
});

test('bracketWinner: the sim result first, then deaths → tower hp → errors → seed (Q7)', () => {
  const stats = (v, g) => ({ violet: { deaths: v.d ?? 0, parseErrors: v.p ?? 0, callErrors: v.c ?? 0 }, green: { deaths: g.d ?? 0, parseErrors: g.p ?? 0, callErrors: g.c ?? 0 } });
  const seeds = { violet: 3, green: 6 };
  assert.deepEqual(bracketWinner({ result: { winner: 'green', endReason: 'nexus', stats: stats({}, {}) } }, seeds), { winner: 'green', by: 'nexus' });
  assert.deepEqual(bracketWinner({ result: { winner: 'violet', endReason: 'timeout', stats: stats({ d: 9 }, {}) } }, seeds), { winner: 'violet', by: 'timeout' });
  const draw = (v, g, final) => bracketWinner({ result: { winner: null, endReason: 'timeout', stats: stats(v, g) }, final }, seeds);
  assert.deepEqual(draw({ d: 1 }, { d: 2 }), { winner: 'violet', by: 'deaths' });
  assert.deepEqual(draw({ d: 2 }, { d: 1 }), { winner: 'green', by: 'deaths' });
  assert.deepEqual(draw({ d: 1 }, { d: 1 }, { towers: [50, 60, 0, 0, 0, 0] }), { winner: 'green', by: 'towerHp' });
  assert.deepEqual(draw({ d: 1, p: 3 }, { d: 1, c: 1 }, { towers: [5, 5] }), { winner: 'green', by: 'errors' });
  assert.deepEqual(draw({}, {}, { towers: [] }), { winner: 'violet', by: 'seed' }, 'level on everything: the higher seed advances');
  assert.deepEqual(bracketWinner({ result: { winner: null, endReason: 'timeout', stats: stats({}, {}) }, final: null }, { violet: 6, green: 3 }), { winner: 'green', by: 'seed' });
});

/** A three-entrant bracket through the fold, row by row. */
function rows3() {
  return [
    {
      ts: '2026-10-01T22:00:00Z',
      type: 'bracket',
      tournamentId: 'jam',
      name: 'Jam',
      backend: 'mock',
      cadenceSec: 2,
      maxSimSec: 600,
      preRunRounds: 1,
      seedBase: 2026,
      size: 4,
      seeds: [
        { seed: 1, handle: 'ann', hash: 'a', elo: 1100 },
        { seed: 2, handle: 'bo', hash: 'b', elo: 1050 },
        { seed: 3, handle: 'cy', hash: 'c', elo: 990 },
      ],
      rounds: [[{ a: 1, b: null }, { a: 2, b: 3 }], [{ a: null, b: null }]],
    },
  ];
}

const queuedRow = (id, ts, round, slot, seeds, sides) => ({ ts, type: 'queued', id, tournamentId: 'jam', kind: 'bracket', priority: 'bracket', sides, seed: 1, backendId: 'mock', cadenceSec: 2, maxSimSec: 600, quick: false, ranked: false, bracket: { tournamentId: 'jam', round, slot, seeds, rerun: 0 } });
const finishedRow = (id, ts, winner, extra = {}) => ({ ts, type: 'finished', id, kind: 'bracket', result: { winner, endReason: winner ? 'nexus' : 'timeout', durationSec: 600, ticks: 12000, deaths: 0, stats: { violet: { deaths: 0, parseErrors: 0, callErrors: 0 }, green: { deaths: 0, parseErrors: 0, callErrors: 0 } } }, final: { towers: [] }, verify: { checkpointsCompared: 120 }, ...extra });

test('bracketView: byes advance, a lone seed waits, round 2 fills from winners, champion at the end', () => {
  const rows = rows3();
  let v = bracketView(fold(rows), 'jam');
  assert.equal(v.size, 4);
  assert.deepEqual(v.rounds.map((r) => r.name), ['Semi-finals', 'Final']);
  const [r1, r2] = v.rounds;
  assert.equal(r1.slots[0].status, 'bye');
  assert.equal(r1.slots[0].winner, 1);
  assert.equal(r1.slots[1].status, 'ready');
  assert.equal(r2.slots[0].status, 'waiting', 'ann is through but the other feeder has not played');
  assert.equal(r2.slots[0].a, 1);
  assert.equal(r2.slots[0].b, null);
  assert.equal(v.champion, null);
  assert.ok(r1.held, 'round 1 is pre-run and not yet revealed');

  rows.push(queuedRow('jam-20261001-001', '2026-10-01T22:01:00Z', 1, 1, { violet: 2, green: 3 }, { violet: { handle: 'bo', hash: 'b' }, green: { handle: 'cy', hash: 'c' } }));
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[0].slots[1].status, 'queued');
  assert.ok(isHeld(fold(rows), fold(rows).jobs.get('jam-20261001-001')));

  rows.push({ ts: '2026-10-01T22:02:00Z', type: 'started', id: 'jam-20261001-001', attempt: 1 });
  rows.push(finishedRow('jam-20261001-001', '2026-10-01T22:30:00Z', 'green'));
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[0].slots[1].status, 'done');
  assert.equal(v.rounds[0].slots[1].winner, 3, 'cy (green) won');
  assert.equal(v.rounds[0].slots[1].by, 'nexus');
  assert.equal(v.rounds[1].slots[0].status, 'ready');
  assert.deepEqual([v.rounds[1].slots[0].a, v.rounds[1].slots[0].b], [1, 3], 'higher seed first');

  rows.push({ ts: '2026-10-02T15:00:00Z', type: 'bracket-reveal', tournamentId: 'jam', round: 1, by: 'c@x' });
  assert.equal(bracketView(fold(rows), 'jam').rounds[0].held, false);
  assert.ok(!isHeld(fold(rows), fold(rows).jobs.get('jam-20261001-001')));

  rows.push(queuedRow('jam-20261002-001', '2026-10-02T16:00:00Z', 2, 0, { violet: 1, green: 3 }, { violet: { handle: 'ann', hash: 'a' }, green: { handle: 'cy', hash: 'c' } }));
  rows.push({ ts: '2026-10-02T16:01:00Z', type: 'started', id: 'jam-20261002-001', attempt: 1 });
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[1].slots[0].status, 'started');
  assert.ok(!v.rounds[1].held, 'the final is live, never held');
  rows.push(finishedRow('jam-20261002-001', '2026-10-02T16:30:00Z', null));
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[1].slots[0].by, 'seed', 'a full draw with nothing else to separate them: the higher seed');
  assert.equal(v.champion.handle, 'ann');
  assert.deepEqual(bracketIds(fold(rows)), ['jam']);
});

test('bracketView: a void or timed-out slot needs a re-run; the latest job is current; a ruling overrides', () => {
  const rows = rows3();
  rows.push(queuedRow('jam-20261001-001', '2026-10-01T22:01:00Z', 1, 1, { violet: 2, green: 3 }, { violet: { handle: 'bo', hash: 'b' }, green: { handle: 'cy', hash: 'c' } }));
  rows.push({ ts: '2026-10-01T22:02:00Z', type: 'started', id: 'jam-20261001-001', attempt: 1 });
  rows.push({ ts: '2026-10-01T23:00:00Z', type: 'timed-out', id: 'jam-20261001-001', reason: 'wall-clock cap' });
  let v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[0].slots[1].status, 'needs-rerun');
  rows.push({ ...queuedRow('jam-20261001-002', '2026-10-01T23:01:00Z', 1, 1, { violet: 2, green: 3 }, { violet: { handle: 'bo', hash: 'b' }, green: { handle: 'cy', hash: 'c' } }), bracket: { tournamentId: 'jam', round: 1, slot: 1, seeds: { violet: 2, green: 3 }, rerun: 1 } });
  rows.push({ ts: '2026-10-01T23:02:00Z', type: 'started', id: 'jam-20261001-002', attempt: 1 });
  rows.push(finishedRow('jam-20261001-002', '2026-10-01T23:30:00Z', 'violet'));
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[0].slots[1].current.id, 'jam-20261001-002');
  assert.equal(v.rounds[0].slots[1].winner, 2);
  assert.equal(v.rounds[0].slots[1].jobs.length, 2);
  rows.push({ ts: '2026-10-01T23:40:00Z', type: 'void', id: 'jam-20261001-002', reason: 'model server died', by: 'c@x' });
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[0].slots[1].status, 'needs-rerun');
  assert.equal(v.rounds[0].slots[1].winner, null);
  rows.push({ ts: '2026-10-01T23:41:00Z', type: 'ruling', tournamentId: 'jam', round: 1, slot: 1, winner: 3, reason: 'bo conceded', by: 'c@x' });
  v = bracketView(fold(rows), 'jam');
  assert.equal(v.rounds[0].slots[1].status, 'ruled');
  assert.equal(v.rounds[0].slots[1].winner, 3);
  assert.equal(v.rounds[0].slots[1].ruling.reason, 'bo conceded');
  assert.equal(v.rounds[1].slots[0].b, 3);
});
