import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELO_K, ELO_START, PLACEMENT_SEEDS, eloUpdate, expectedScore, placementPlan, scoreOf } from './rating.mjs';

test('expected score is symmetric and ½ at equal ratings', () => {
  assert.equal(expectedScore(1000, 1000), 0.5);
  assert.ok(Math.abs(expectedScore(1200, 1000) + expectedScore(1000, 1200) - 1) < 1e-12);
  assert.ok(Math.abs(expectedScore(1400, 1000) - 0.9090909) < 1e-6);
});

test('a win at equal ratings moves both sides by K/2', () => {
  const { a, b } = eloUpdate(1000, 1000, 1);
  assert.equal(a, 1000 + ELO_K / 2);
  assert.equal(b, 1000 - ELO_K / 2);
});

test('a draw at equal ratings moves nobody; a draw against a stronger side gains', () => {
  assert.deepEqual(eloUpdate(1000, 1000, 0.5), { a: 1000, b: 1000 });
  const { a, b } = eloUpdate(1000, 1200, 0.5);
  assert.ok(a > 1000 && b < 1200);
});

test('the house bot is pinned: it never moves, the entrant still does', () => {
  const { a, b } = eloUpdate(1000, ELO_START, 0, { fixedB: true });
  assert.equal(b, ELO_START);
  assert.equal(a, 1000 - ELO_K / 2);
  const r = eloUpdate(ELO_START, 1100, 1, { fixedA: true });
  assert.equal(r.a, ELO_START);
  assert.ok(r.b < 1100);
});

test('scoreOf reads the log result', () => {
  assert.equal(scoreOf({ winner: 'violet' }, 'violet'), 1);
  assert.equal(scoreOf({ winner: 'violet' }, 'green'), 0);
  assert.equal(scoreOf({ winner: null }, 'green'), 0.5);
});

test('placements: three seeds 7/11/42, sides alternating violet, green, violet', () => {
  const house = { handle: 'house', hash: 'h', house: true };
  const plan = placementPlan({ handle: 'alice', hash: 'a1' }, { house });
  assert.deepEqual(PLACEMENT_SEEDS, [7, 11, 42]);
  assert.deepEqual(
    plan.map((p) => p.seed),
    [7, 11, 42],
  );
  assert.deepEqual(plan[0].sides, { violet: { handle: 'alice', hash: 'a1' }, green: house });
  assert.deepEqual(plan[1].sides, { violet: house, green: { handle: 'alice', hash: 'a1' } });
  assert.deepEqual(plan[2].sides, { violet: { handle: 'alice', hash: 'a1' }, green: house });
  assert.throws(() => placementPlan({ handle: 'x', hash: 'y' }), /house/);
});
