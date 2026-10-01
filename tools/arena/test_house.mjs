import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  DEFAULT_HOUSE_FILES, DEFAULT_HOUSE_TIER, HOUSE_TIERS, HOUSE_TIER_SCHEMAS, bundleHouse, candidateFiles, candidateLabel, houseCandidates,
  houseSchemasFile, houseSpecFile, houseTextForSide, loadHouseSchemas, pickHouse,
} from './house.mjs';
import { DEFAULT_CONFIG, loadConfig } from './server.mjs';

const PAIR = { violet: 'prompts/pilots/house-violet.md', green: 'prompts/pilots/house-green.md' };

test('candidates: a file or a {violet, green} pair, nothing else', () => {
  assert.deepEqual(candidateFiles('a.md'), ['a.md']);
  assert.deepEqual(candidateFiles(PAIR), [PAIR.violet, PAIR.green]);
  assert.equal(candidateLabel(PAIR), 'prompts/pilots/house-violet.md + prompts/pilots/house-green.md');
  assert.throws(() => candidateFiles({ violet: 'only.md' }), /candidate is a file path or \{violet, green\}/);
});

test('pickHouse: first candidate whose files ALL exist; a half-present pair is skipped', () => {
  const have = (files) => (f) => files.includes(path.basename(f));
  assert.deepEqual(pickHouse(DEFAULT_HOUSE_FILES, '/r', have(['house-violet.md', 'house-green.md', 'drums.md'])), PAIR);
  assert.equal(pickHouse(DEFAULT_HOUSE_FILES, '/r', have(['house-violet.md', 'drums.md'])), 'prompts/pilots/drums.md');
  assert.equal(pickHouse(DEFAULT_HOUSE_FILES, '/r', have(['house.md', 'drums.md'])), 'prompts/pilots/house.md');
  assert.equal(pickHouse(DEFAULT_HOUSE_FILES, '/r', have([])), null);
});

test('bundle round-trip: each side gets exactly its own file back; a single file passes through', () => {
  const texts = { 'house-violet.md': 'You are a VIOLET bearbot.\nline two\n', 'house-green.md': 'You are a GREEN bearbot.\n\nline three\n' };
  const read = (f) => texts[path.basename(f)];
  const bundle = bundleHouse(PAIR, '/r', read);
  assert.equal(houseTextForSide(bundle, 'violet'), texts['house-violet.md']);
  assert.equal(houseTextForSide(bundle, 'green'), texts['house-green.md']);
  assert.notEqual(bundle, texts['house-violet.md'], 'the stored text is the bundle, so its hash changes when either side changes');
  const single = bundleHouse('prompts/pilots/drums.md', '/r', () => 'drums text');
  assert.equal(houseTextForSide(single, 'violet'), 'drums text');
  assert.equal(houseTextForSide(single, 'green'), 'drums text');
  assert.throws(() => houseTextForSide(bundle, 'red'), /side must be violet or green/);
});

test('the checked-in pair really exists and bundles from disk', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  assert.deepEqual(pickHouse(DEFAULT_HOUSE_FILES, root), PAIR);
  const bundle = bundleHouse(PAIR, root);
  assert.ok(houseTextForSide(bundle, 'violet').startsWith('You are a VIOLET bearbot'));
  assert.ok(houseTextForSide(bundle, 'green').startsWith('You are a GREEN bearbot'));
});

test('tiers: the default is still medium, which is still the original pair', () => {
  assert.equal(DEFAULT_HOUSE_TIER, 'medium');
  assert.deepEqual(HOUSE_TIERS.medium, PAIR);
  assert.deepEqual(DEFAULT_HOUSE_FILES[0], PAIR);
  for (const unset of [undefined, null, {}, { tier: null, files: null }, { handle: 'house', backend: null }]) {
    assert.equal(houseCandidates(unset), DEFAULT_HOUSE_FILES);
  }
});

test('tiers: config.house.tier names exactly one pair; files still work; both or an unknown tier throw', () => {
  assert.deepEqual(houseCandidates({ tier: 'hard' }), [HOUSE_TIERS.hard]);
  assert.deepEqual(houseCandidates({ tier: 'easy', files: null }), [HOUSE_TIERS.easy]);
  assert.deepEqual(houseCandidates({ files: ['prompts/pilots/drums.md'] }), ['prompts/pilots/drums.md']);
  assert.throws(() => houseCandidates({ tier: 'hard', files: [PAIR] }), /set tier or files, not both/);
  assert.throws(() => houseCandidates({ tier: 'nightmare' }), /house tier must be one of easy, medium, hard/);
  // No silent fallback: a tier whose files are missing picks nothing (startup then fails).
  assert.equal(pickHouse(houseCandidates({ tier: 'hard' }), '/r', () => false), null);
});

test('tiers: --house-tier on the arena replaces the config files; an unknown tier fails at load', () => {
  assert.equal(loadConfig(DEFAULT_CONFIG).house.tier, 'medium', 'the example names the placement bar outright');
  const cfg = loadConfig(DEFAULT_CONFIG, { houseTier: 'easy' });
  assert.deepEqual(houseCandidates(cfg.house), [HOUSE_TIERS.easy]);
  assert.equal(cfg.house.handle, 'house');
  assert.throws(() => loadConfig(DEFAULT_CONFIG, { houseTier: 'bogus' }), /house tier must be one of/);
});

test('tiers: the match CLI shorthand gives each side its own file', () => {
  assert.equal(houseSpecFile('house', 'violet'), PAIR.violet);
  assert.equal(houseSpecFile('house:hard', 'green'), 'prompts/pilots/house-hard-green.md');
  assert.equal(houseSpecFile('house:easy', 'violet'), 'prompts/pilots/house-easy-violet.md');
  assert.equal(houseSpecFile('prompts/pilots/drums.md', 'violet'), null);
  assert.equal(houseSpecFile('entrants/house/pilot.md', 'violet'), null);
  assert.throws(() => houseSpecFile('house:', 'violet'), /house tier must be one of/);
});

test('tiers: every checked-in pair exists, bundles, and its sides differ only in team literals', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const [tier, pair] of Object.entries(HOUSE_TIERS)) {
    assert.deepEqual(pickHouse(houseCandidates({ tier }), root), pair, tier);
    const bundle = bundleHouse(pair, root);
    const violet = houseTextForSide(bundle, 'violet');
    const green = houseTextForSide(bundle, 'green');
    assert.ok(violet.startsWith('You are a VIOLET bearbot'), tier);
    assert.ok(green.startsWith('You are a GREEN bearbot'), tier);
    // Swap the team literals and the two base corners in the green file; it must read as violet
    // (example tower ids name an enemy tower, so they differ per side too -- compared as tw-N;
    // line endings follow the checkout's core.autocrlf, so they are not compared either).
    const towerIds = (s) => s.replaceAll('\r\n', '\n').replaceAll(/"tw-\d+"/g, '"tw-N"');
    const swapped = green
      .replace('GREEN bearbot', 'VIOLET bearbot')
      .replaceAll('"green"', '{OWN}')
      .replaceAll('"violet"', '"green"')
      .replaceAll('{OWN}', '"violet"')
      .replaceAll('a green minion', 'a violet minion')
      .replaceAll('{"x":900,"y":100}', '{HOME}')
      .replaceAll('{"x":100,"y":900}', '{"x":900,"y":100}')
      .replaceAll('{HOME}', '{"x":100,"y":900}');
    assert.equal(towerIds(swapped), towerIds(violet), `${tier}: green is violet with the team literals swapped`);
  }
});

test('Jev: each tier has checked-in compiled schemas, found from the tier, the picked pair, or house.schemas', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const tier of Object.keys(HOUSE_TIERS)) {
    assert.equal(houseSchemasFile({ tier }, HOUSE_TIERS[tier]), HOUSE_TIER_SCHEMAS[tier]);
    const { schemas, hash } = loadHouseSchemas(HOUSE_TIER_SCHEMAS[tier], root);
    assert.deepEqual(Object.keys(schemas), ['drums', 'keytar', 'violin'], tier);
    for (const [inst, s] of Object.entries(schemas)) assert.equal(s.instrument, inst, `${tier} ${inst}`);
    assert.match(hash, /^[0-9a-f]{64}$/);
  }
  // A `files` list whose picked candidate is medium's pair (the live config's shape) still finds medium.
  assert.equal(houseSchemasFile({ files: DEFAULT_HOUSE_FILES }, PAIR), 'prompts/pilots/house-medium.schemas.json');
  assert.equal(houseSchemasFile({}, 'prompts/pilots/drums.md'), null, 'a single-file house has no checked-in compile');
  assert.equal(houseSchemasFile({ schemas: 'x.json' }, PAIR), 'x.json');
  assert.throws(() => loadHouseSchemas('x.json', '/r', () => JSON.stringify({ drums: { rules: [] } })), /no compiled schema for keytar, violin/);
});
