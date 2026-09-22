import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractPage, REPLY_INSTRUCTION } from './pages/contract.mjs';
import { HANDLE_RE } from './prompts.mjs';

/**
 * `/contract` hand-copies prose from the frozen v1 specimen (`src/types.ts`,
 * `src/pilots/promptPilot.ts` — never patched, see `runs/historical-v1.md`) because that source
 * is TypeScript and the page is plain JS rendered at request time. These tests read the frozen
 * files (read-only) and fail if the page's copy has drifted from them.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const promptPilotSrc = readFileSync(path.join(ROOT, 'src', 'pilots', 'promptPilot.ts'), 'utf8');
const typesSrc = readFileSync(path.join(ROOT, 'src', 'types.ts'), 'utf8');

test('REPLY_INSTRUCTION matches the literal PromptPilot.buildPrompt sends', () => {
  const m = promptPilotSrc.match(/'(Reply with ONLY[\s\S]*?)'/);
  assert.ok(m, 'expected a `Reply with ONLY…` literal in promptPilot.ts — has buildPrompt changed shape?');
  assert.equal(REPLY_INSTRUCTION, m[1]);
});

test('the contract page quotes the reply instruction and every valid action kind', () => {
  const html = contractPage({ user: { email: 'a@b.com', organizer: false } });
  assert.ok(html.includes(REPLY_INSTRUCTION.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
  const m = promptPilotSrc.match(/VALID_KINDS: ActionKind\[\] = \[([^\]]*)\]/);
  assert.ok(m, 'expected VALID_KINDS in promptPilot.ts');
  const kinds = m[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(kinds, ['move', 'attack', 'ability', 'recall', 'hold']);
  for (const kind of kinds) assert.ok(html.includes(`<code>${kind}</code>`), `contract page is missing action kind ${kind}`);
});

test('the contract page names every Observation field from types.ts', () => {
  const html = contractPage({ user: { email: 'a@b.com', organizer: false } });
  const block = typesSrc.slice(typesSrc.indexOf('interface Observation'), typesSrc.indexOf('export type ActionKind'));
  assert.ok(block.includes('clockSec'), 'sanity check on the slice bounds');
  const fields = ['clockSec', 'self', 'allies', 'visibleEnemies', 'nearbyMinions', 'nearbyTowers', 'id', 'team', 'lane', 'instrument', 'pos', 'hp', 'maxHp', 'moveSpeed', 'cooldowns'];
  for (const f of fields) {
    assert.ok(block.includes(f), `types.ts Observation no longer has ${f} — is this test's field list stale?`);
    assert.ok(html.includes(`<code>${f}</code>`), `contract page is missing Observation field ${f}`);
  }
});

test('the contract page names every Action reply field from types.ts', () => {
  const html = contractPage({ user: { email: 'a@b.com', organizer: false } });
  const block = typesSrc.slice(typesSrc.indexOf('interface Action '), typesSrc.indexOf('interface Pilot'));
  for (const f of ['kind', 'target', 'ability']) {
    assert.ok(block.includes(f), `types.ts Action no longer has ${f} — is this test's field list stale?`);
    assert.ok(html.includes(`<code>${f}</code>`), `contract page is missing Action field ${f}`);
  }
});

test('the contract page states the entrants handle pattern in force', () => {
  const html = contractPage({ user: { email: 'a@b.com', organizer: false } });
  assert.ok(html.includes(HANDLE_RE.source.replace(/&/g, '&amp;')), 'contract page handle pattern does not match prompts.mjs HANDLE_RE');
});

test('/contract needs no GitHub fetch: renders from static content and injected user only', () => {
  const html = contractPage({ user: null });
  assert.ok(html.includes('The prompt contract'));
  assert.ok(html.includes('entrants/&lt;your-handle&gt;/pilot.md') || html.includes('entrants/<your-handle>/pilot.md'));
});
