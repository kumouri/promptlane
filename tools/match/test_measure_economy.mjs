/** The §6 measurement plan (`measure_economy.mjs`): the 96 matches, their files and their pairing keys. No server. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONDITIONS, DEFAULT_RESOLUTION, DEFAULT_TARGETING, PAIRINGS, SEEDS, checkResolution, checkTargeting, metricsCommands, planMeasurement } from './measure_economy.mjs';
import { loadHeadless } from './load.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const arg = (job, flag) => job.args[job.args.indexOf(flag) + 1];

test('the plan is §6.1: 4 conditions × 2 pairings × 12 seeds, one log each', () => {
  const jobs = planMeasurement({ date: '2026-10-03' });
  assert.equal(jobs.length, 96);
  assert.equal(new Set(jobs.map((j) => j.out)).size, 96);
  assert.deepEqual(Object.keys(CONDITIONS), ['A', 'R', 'B0', 'B1']);
  assert.deepEqual(Object.keys(PAIRINGS), ['hard', 'entrant']);
  assert.deepEqual(SEEDS, [7, 11, 42, 101, 3, 5, 13, 17, 23, 29, 31, 37], 'the slice seeds');
  // seed-major: a seed's eight matches run back to back
  assert.deepEqual(jobs.slice(0, 8).map((j) => j.seed), new Array(8).fill(7));
  assert.ok(jobs.every((j) => arg(j, '--map') === 'pvp-1' && arg(j, '--cadence') === '2'));
});

test('each condition plays its ruleset and its prompts; every file it names exists', () => {
  const jobs = planMeasurement({ date: '2026-10-03', seeds: [7] });
  const by = (c, p) => jobs.find((j) => j.condition === c && j.pairing === p);
  assert.deepEqual(['A', 'R', 'B0', 'B1'].map((c) => arg(by(c, 'hard'), '--economy')), ['none', 'respawn-1', 'eco-2', 'eco-2']);
  for (const c of ['A', 'R', 'B0']) assert.equal(arg(by(c, 'hard'), '--b-schemas'), 'prompts/pilots/house-hard.schemas.json', c);
  assert.equal(arg(by('B1', 'hard'), '--a-schemas'), 'prompts/pilots/house-medium-eco.schemas.json');
  assert.equal(arg(by('B1', 'hard'), '--b-schemas'), 'prompts/pilots/house-hard-eco.schemas.json');
  assert.equal(arg(by('B1', 'entrant'), '--b-schemas'), 'prompts/pilots/sample-entrant-eco.schemas.json');
  assert.equal(arg(by('A', 'entrant'), '--b-schemas'), 'prompts/pilots/sample-entrant.schemas.json');
  for (const j of jobs) {
    for (const flag of ['--a', '--a-schemas', '--b', '--b-schemas']) assert.ok(existsSync(path.join(ROOT, arg(j, flag))), `${j.condition} ${flag} ${arg(j, flag)}`);
  }
});

test('side names are the same in every condition, so metrics pairs them by seed', () => {
  const jobs = planMeasurement({ date: '2026-10-03' });
  for (const pairing of Object.keys(PAIRINGS)) {
    const names = new Set(jobs.filter((j) => j.pairing === pairing).map((j) => `${arg(j, '--name-a')}|${arg(j, '--name-b')}`));
    assert.deepEqual([...names], [`medium|${pairing}`]);
  }
});

test('--recall is opt-in: without it the plan is unchanged, with it every match carries it', () => {
  const plain = planMeasurement({ date: '2026-10-03', seeds: [7] });
  assert.ok(plain.every((j) => !j.args.includes('--recall')));
  const channelled = planMeasurement({ date: '2026-10-03', seeds: [7], recall: 'recall-2' });
  assert.ok(channelled.every((j) => arg(j, '--recall') === 'recall-2'));
  assert.deepEqual(channelled.map((j) => j.args.slice(0, -2)), plain.map((j) => j.args));
});

test('a subset plan, the metrics commands, and bad input', () => {
  assert.equal(planMeasurement({ date: '2026-10-03', conditions: ['B1'], pairings: ['hard'], seeds: [7, 11] }).length, 2);
  const [all, b1] = metricsCommands('2026-10-03');
  assert.match(all, /--group A runs\/economy-measure-2026-10-03-A-\*\.json --group R .* --group B0 .* --group B1 /);
  assert.match(b1, /^npm run metrics -- --group B0 .* --group B1 /);
  assert.throws(() => planMeasurement({}), /--date YYYY-MM-DD is required/);
  assert.throws(() => planMeasurement({ date: '2026-10-03', conditions: ['C'] }), /unknown condition C/);
  assert.throws(() => planMeasurement({ date: '2026-10-03', pairings: ['easy'] }), /unknown pairing easy/);
});

test('every match names its tick resolution, and a run never mixes two', async () => {
  const headless = await loadHeadless();
  assert.equal(DEFAULT_RESOLUTION, headless.DEFAULT_RESOLUTION, 'the plan default follows src/resolution.ts');
  const jobs = planMeasurement({ date: '2026-10-03', seeds: [7] });
  assert.ok(jobs.every((j) => arg(j, '--resolution') === 'simultaneous-1'));
  const old = planMeasurement({ date: '2026-10-03', seeds: [7], resolution: 'sequential' });
  assert.ok(old.every((j) => arg(j, '--resolution') === 'sequential'));
  // the first job's log exists and was written before the field (sequential)
  const readLog = (out) => (out === jobs[0].out ? { schema: 'promptlane-match-log-1' } : null);
  assert.throws(() => checkResolution(jobs, 'simultaneous-1', readLog), /played under resolution sequential, not simultaneous-1: pass --resolution sequential/);
  assert.doesNotThrow(() => checkResolution(old, 'sequential', readLog));
  assert.doesNotThrow(() => checkResolution(jobs, 'simultaneous-1', (out) => (out === jobs[0].out ? { resolution: 'simultaneous-1' } : null)));
});

test('every match names its targeting rule, and a run never mixes two', async () => {
  const headless = await loadHeadless();
  assert.equal(DEFAULT_TARGETING, headless.DEFAULT_TARGETING, 'the plan default follows jevSchemaPilot.ts');
  const jobs = planMeasurement({ date: '2026-10-03', seeds: [7] });
  assert.ok(jobs.every((j) => arg(j, '--targeting') === 'own-lane-1'));
  const old = planMeasurement({ date: '2026-10-03', seeds: [7], targeting: 'first-min' });
  assert.ok(old.every((j) => arg(j, '--targeting') === 'first-min'));
  // the first job's log exists and was written before the field (first-min)
  const readLog = (out) => (out === jobs[0].out ? { schema: 'promptlane-match-log-1', resolution: 'simultaneous-1' } : null);
  assert.throws(() => checkTargeting(jobs, 'own-lane-1', readLog), /played under targeting first-min, not own-lane-1: pass --targeting first-min/);
  assert.doesNotThrow(() => checkTargeting(old, 'first-min', readLog));
  assert.doesNotThrow(() => checkTargeting(jobs, 'own-lane-1', (out) => (out === jobs[0].out ? { targeting: 'own-lane-1' } : null)));
});
