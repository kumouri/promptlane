import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRuns } from './merge_team_bench.mjs';

const stats = (over = {}) => ({ calls: 10, cached: 0, parseErrors: 0, callErrors: 0, avgMs: 100, deaths: 0, towersLost: 0, ...over });

function match(seed, winner, { violet = {}, green = {} } = {}) {
  return {
    seed,
    createdAt: `2026-09-23T00:00:0${seed}Z`,
    decisions: [],
    result: { winner, endReason: 'timeout', durationSec: 600, stats: { violet: stats(violet), green: stats(green) } },
  };
}

test('drops matches whose Jev side had transport errors, and a later file replaces that seed', () => {
  const crashRun = {
    file: 'a.json',
    data: { jevSides: ['violet', 'green'], matches: [match(1, 'violet'), match(2, null, { green: { callErrors: 10 } })] },
  };
  const rerun = { file: 'b.json', data: { jevSides: ['green'], matches: [match(2, 'violet')] } };
  const merged = mergeRuns([crashRun, rerun]);

  assert.deepEqual(merged.excluded, [{ file: 'a.json', seed: 2, jevSide: 'green', reason: '10 jev-side call errors' }]);
  assert.deepEqual(merged.matches.map((m) => [m.seed, m.file, m.winner]), [[1, 'a.json', 'jev'], [2, 'b.json', 'qwen']]);
  assert.deepEqual(merged.summary.wins, { jev: 1, qwen: 1, draw: 0 });
});

test('an isolated Jev-side call error is kept, not treated as an outage', () => {
  const run = { file: 'a.json', data: { jevSides: ['green'], matches: [match(4, 'green', { green: { calls: 876, callErrors: 1 } })] } };
  const merged = mergeRuns([run]);
  assert.equal(merged.excluded.length, 0);
  assert.equal(merged.matches[0].winner, 'jev');
});

test('qwen-side errors do not exclude a match', () => {
  const run = { file: 'a.json', data: { jevSides: ['violet'], matches: [match(1, null, { green: { callErrors: 3 } })] } };
  const merged = mergeRuns([run]);
  assert.equal(merged.excluded.length, 0);
  assert.equal(merged.matches[0].stats.qwen.callErrors, 3);
});
