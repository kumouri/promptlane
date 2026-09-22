import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_BYTES, MAX_LINES, PromptStore, fetchEntrantsFromDir, fetchEntrantsFromGitHub, hashPrompt, isHandle, makeEntrantsSource, validatePromptText } from './prompts.mjs';

// The same cases the entrants validator's own tests cover (tools/validate_entry.py).
test('validatePromptText: the entrants validator rules, verbatim', () => {
  assert.deepEqual(validatePromptText('You are a bearbot.\nReply with JSON.\n'), []);
  assert.deepEqual(validatePromptText(''), ['file is empty']);
  assert.deepEqual(validatePromptText('   \n\n'), ['file is empty']);
  assert.deepEqual(validatePromptText(Array(MAX_LINES).fill('x').join('\n') + '\n'), [], 'exactly 40 lines is fine');
  assert.deepEqual(validatePromptText(Array(MAX_LINES + 1).fill('x').join('\n')), [`${MAX_LINES + 1} lines; the limit is ${MAX_LINES}`]);
  assert.deepEqual(validatePromptText('y'.repeat(MAX_BYTES + 1)), [`${MAX_BYTES + 1} bytes; the limit is ${MAX_BYTES} (4 KB)`]);
  assert.deepEqual(validatePromptText('é'.repeat(MAX_BYTES / 2 + 1)), [`${MAX_BYTES + 2} bytes; the limit is ${MAX_BYTES} (4 KB)`], 'bytes, not characters');
  assert.deepEqual(validatePromptText('a\n```json\n{}\n```'), ['contains a code fence (``` or ~~~)']);
  assert.deepEqual(validatePromptText('a\n  ~~~\nb'), ['contains a code fence (``` or ~~~)']);
  assert.deepEqual(validatePromptText('inline ``` here'), ['contains ``` (code fences are not allowed)']);
  assert.deepEqual(validatePromptText('see http://example.com'), ['contains a URL']);
  assert.deepEqual(validatePromptText('see HTTPS://example.com'), ['contains a URL']);
  assert.deepEqual(validatePromptText('see www.example.com'), ['contains a URL']);
  assert.deepEqual(validatePromptText('a\n```\nhttp://x'), ['contains a code fence (``` or ~~~)', 'contains a URL']);
  assert.deepEqual(validatePromptText('line one\r\nline two\r\n'), []);
});

test('isHandle matches the entrants folder rule', () => {
  for (const ok of ['alice', 'Bob_2', 'c.d-e', '_x', '9lives']) assert.ok(isHandle(ok), ok);
  for (const bad of ['', '-x', '.x', 'a b', 'a/b', 'a@b', 'x'.repeat(40), null, 7]) assert.ok(!isHandle(bad), String(bad));
});

test('hashPrompt is sha256 of the utf-8 text', () => {
  assert.equal(hashPrompt('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('PromptStore is content-addressed and idempotent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-prompts-'));
  try {
    const s = new PromptStore(dir);
    const h = s.save('alice', 'hello');
    assert.equal(h, hashPrompt('hello'));
    assert.equal(s.save('alice', 'hello'), h);
    assert.ok(s.has('alice', h));
    assert.equal(s.read('alice', h), 'hello');
    assert.throws(() => s.read('alice', 'nope'), /not in the store/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fetchEntrantsFromDir reads entrants/<handle>/pilot.md, skipping _template and bad handles', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-entrants-'));
  try {
    for (const [h, text] of [['alice', 'A'], ['_template', 'T'], ['bad handle', 'B'], ['bob', 'B2']]) {
      mkdirSync(path.join(dir, 'entrants', h), { recursive: true });
      writeFileSync(path.join(dir, 'entrants', h, 'pilot.md'), text);
    }
    mkdirSync(path.join(dir, 'entrants', 'empty'));
    const list = fetchEntrantsFromDir(dir);
    assert.deepEqual(
      list.map((e) => [e.handle, e.text]),
      [
        ['alice', 'A'],
        ['bob', 'B2'],
      ],
    );
    assert.equal(list[0].blobSha, '8c7e5a667f1b771847fe88c01c3de34413a1b220', 'git blob sha of "A"');
    assert.equal(makeEntrantsSource({ kind: 'dir', path: dir }).describe, `dir ${dir}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fetchEntrantsFromGitHub walks the tree on the ref and fetches only unknown blobs', async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args[0]);
    const p = args[0];
    if (p === 'repos/o/r/commits/main') return JSON.stringify({ sha: 'c0ffee' });
    if (p === 'repos/o/r/git/trees/c0ffee?recursive=1') {
      return JSON.stringify({
        tree: [
          { path: 'entrants/alice/pilot.md', type: 'blob', sha: 'b1' },
          { path: 'entrants/_template/pilot.md', type: 'blob', sha: 'b2' },
          { path: 'entrants/bob/pilot.md', type: 'blob', sha: 'b3' },
          { path: 'entrants/bob/notes.md', type: 'blob', sha: 'b4' },
          { path: 'README.md', type: 'blob', sha: 'b5' },
        ],
      });
    }
    if (p === 'repos/o/r/git/blobs/b3') return JSON.stringify({ content: Buffer.from('Bob prompt').toString('base64'), encoding: 'base64' });
    throw new Error(`unexpected ${p}`);
  };
  const known = new Map([['b1', 'Alice prompt']]);
  const list = await fetchEntrantsFromGitHub({ repo: 'o/r', ref: 'main' }, known, run);
  assert.deepEqual(
    list.map((e) => [e.handle, e.text, e.commit, e.blobSha]),
    [
      ['alice', 'Alice prompt', 'c0ffee', 'b1'],
      ['bob', 'Bob prompt', 'c0ffee', 'b3'],
    ],
  );
  assert.deepEqual(calls, ['repos/o/r/commits/main', 'repos/o/r/git/trees/c0ffee?recursive=1', 'repos/o/r/git/blobs/b3']);
});
