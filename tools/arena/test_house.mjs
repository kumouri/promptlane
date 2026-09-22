import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DEFAULT_HOUSE_FILES, bundleHouse, candidateFiles, candidateLabel, houseTextForSide, pickHouse } from './house.mjs';

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
