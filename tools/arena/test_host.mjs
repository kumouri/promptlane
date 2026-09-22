/** Ruling Q16: `arena.<zone>` → 301 `https://elysium.<zone>`; everything else untouched. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostRedirect } from './server.mjs';

test('hostRedirect: arena.<zone> → elysium.<zone>, path and query kept, port dropped', () => {
  assert.equal(hostRedirect('arena.example.com', '/ladder?x=1'), 'https://elysium.example.com/ladder?x=1');
  assert.equal(hostRedirect('ARENA.Example.com:8790', '/'), 'https://elysium.example.com/');
  assert.equal(hostRedirect('arena.kumouri.dev', 'play/?live=x'), 'https://elysium.kumouri.dev/play/?live=x');
});

test('hostRedirect: canonical, loopback, missing and look-alike hosts are left alone', () => {
  for (const h of ['elysium.example.com', '127.0.0.1:8790', 'localhost', '', undefined, 'arena', 'notarena.example.com', 'arena.', 'xarena.example.com']) {
    assert.equal(hostRedirect(h, '/'), null, String(h));
  }
});
