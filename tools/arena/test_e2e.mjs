/**
 * Headless end-to-end on the mock model: an entrant's merged prompt appears → three placements
 * run and verify → a scratch quick test is submitted over HTTP → it finishes → the ladder and
 * the pages show it. No GPU, no network, no Access (dev mode) — plus one Access-mode server that
 * must refuse a request with no token.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from '../match/load.mjs';
import { DEFAULT_CONFIG, createArena, loadConfig } from './server.mjs';

const quiet = { info() {}, warn() {}, error(m) { console.error(m); } };

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-e2e-'));
  const entrants = path.join(dir, 'repo');
  mkdirSync(path.join(entrants, 'entrants', 'alice'), { recursive: true });
  writeFileSync(path.join(entrants, 'entrants', 'alice', 'pilot.md'), readFileSync(path.join(ROOT, 'prompts', 'pilots', 'keytar.md'), 'utf8'));
  const config = loadConfig(DEFAULT_CONFIG, { backend: 'mock', entrantsDir: entrants });
  return { dir, entrants, config, data: path.join(dir, 'data'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function json(url, init) {
  const res = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
  return { status: res.status, body: await res.json() };
}

test('e2e: merged prompt → placements → scratch quick test over HTTP → ladder and pages', async () => {
  const f = fixture();
  const arena = await createArena({ config: f.config, dataDir: f.data, devUser: 'dev@example.com', log: quiet, sync: true });
  try {
    const base = await arena.listen(0);
    assert.equal(arena.house.file, 'prompts/pilots/house-violet.md + prompts/pilots/house-green.md', 'the per-side house pair is the first candidate');

    // The startup sync saw alice and queued three placements; wait for them.
    await arena.queue.waitForIdle(60000);
    let ladder = (await json(`${base}api/ladder`)).body;
    assert.equal(ladder.rows.length, 1);
    assert.equal(ladder.rows[0].handle, 'alice');
    assert.equal(ladder.rows[0].matches, 3, 'three placements counted');
    assert.deepEqual(ladder.rows[0].allTime.w + ladder.rows[0].allTime.d + ladder.rows[0].allTime.l, 3);
    const placements = (await json(`${base}api/matches`)).body.jobs.filter((j) => j.kind === 'placement');
    assert.deepEqual(placements.map((j) => j.seed), [7, 11, 42]);
    assert.deepEqual(placements.map((j) => (j.sides.violet.handle === 'alice' ? 'violet' : 'green')), ['violet', 'green', 'violet']);
    assert.ok(placements.every((j) => j.status === 'finished' && j.ranked && !j.quick));

    // A second sync with the same content does nothing.
    await arena.sync();
    assert.equal((await json(`${base}api/matches`)).body.jobs.length, 3);

    // Submit a scratch quick test as "bob" against the house bot.
    const prompt = readFileSync(path.join(ROOT, 'prompts', 'pilots', 'violin.md'), 'utf8');
    const sub = await json(`${base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'bob', source: 'scratch', prompt, opponent: 'house', kind: 'quick' }) });
    assert.equal(sub.status, 202, JSON.stringify(sub.body));
    assert.match(sub.body.id, /^ladder-\d{8}-004$/);
    assert.equal((await json(`${base}api/me`)).body.handle, 'bob', 'handle recorded at submit');

    await arena.queue.waitForIdle(60000);
    const m = (await json(`${base}api/matches/${sub.body.id}`)).body;
    assert.equal(m.status, 'finished');
    assert.equal(m.quick, true);
    assert.equal(m.ranked, false);
    assert.equal(m.result.endReason, null, 'a quick test stops at 3 sim-minutes');
    assert.equal(m.result.ticks, 3600);
    assert.equal(m.cadenceSec, 4);
    assert.equal(m.backend.id, 'mock');
    assert.ok(m.verify.checkpointsCompared > 0, 'verified before it counted');
    assert.ok(!('text' in m.sides.violet), 'scratch text never leaves the log');

    const logRes = await fetch(`${base}logs/${sub.body.id}.json`);
    assert.equal(logRes.status, 200);
    const log = await logRes.json();
    assert.equal(log.schema, 'promptlane-match-log-1');
    assert.equal(log.sides.violet.name, 'bob (scratch)');
    assert.equal(log.sides.green.name, 'house');
    assert.ok(log.sides.green.promptText.startsWith('You are a GREEN bearbot'), 'the house on green plays house-green.md');
    assert.ok(!log.sides.green.promptText.includes('<!-- house side:'), 'the log holds one side, not the bundle');

    ladder = (await json(`${base}api/ladder`)).body;
    assert.equal(ladder.rows.length, 1, 'scratch never reaches the ladder');

    // Pages render for an entrant and the organizer alike (dev user is organizer).
    for (const p of ['', 'test', 'ladder', 'matches', `matches/${sub.body.id}`, 'admin']) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 200, p);
      const html = await res.text();
      assert.ok(html.includes('· Elysium</title>'), p);
      if (p === 'ladder') assert.ok(html.includes('alice'));
      if (p.startsWith('matches/')) assert.ok(html.includes(`?replay=/logs/${sub.body.id}.json`), 'match page links the replay');
    }
    assert.equal((await fetch(`${base}assets/logo/jamobair-logo-transparent.png`)).status, 200);
    assert.equal((await fetch(`${base}logs/../ledger.jsonl`)).status, 404);
    assert.equal((await fetch(`${base}nope`)).status, 404);

    // Q16: `arena.<zone>` is a 301 to `elysium.<zone>`, same path and query, before identity.
    const { request } = await import('node:http');
    const onOldHost = (pathname) =>
      new Promise((resolve, reject) => {
        const u = new URL(base);
        request({ host: u.hostname, port: u.port, path: pathname, headers: { host: 'arena.example.com' } }, (r) => {
          r.resume();
          resolve({ status: r.statusCode, location: r.headers.location });
        }).on('error', reject).end();
      });
    assert.deepEqual(await onOldHost('/ladder?x=1'), { status: 301, location: 'https://elysium.example.com/ladder?x=1' });
    assert.deepEqual(await onOldHost('/'), { status: 301, location: 'https://elysium.example.com/' });

    // Form post works too and redirects to the match page.
    const form = await fetch(`${base}test`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ handle: 'bob', source: 'scratch', prompt: 'Hold. Reply with JSON.', opponent: 'house', kind: 'quick' }) });
    assert.equal(form.status, 303);
    assert.match(form.headers.get('location'), /^\/matches\/ladder-/);
    await arena.queue.waitForIdle(60000);

    // Validation and quota refusals come back as clear errors.
    const bad = await json(`${base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'bob', source: 'scratch', prompt: 'see http://x', kind: 'quick' }) });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /URL/);
    const noMerged = await json(`${base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'bob', source: 'merged', kind: 'quick' }) });
    assert.equal(noMerged.status, 400);
    assert.match(noMerged.body.error, /no merged prompt/);
    const badHandle = await json(`${base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'a b', source: 'scratch', prompt: 'x', kind: 'quick' }) });
    assert.equal(badHandle.status, 400);

    // Organizer: void the first placement; the ladder re-derives with two matches.
    const first = placements[0].id;
    const voided = await json(`${base}api/void`, { method: 'POST', body: JSON.stringify({ id: first, reason: 'e2e' }) });
    assert.equal(voided.status, 200);
    ladder = (await json(`${base}api/ladder`)).body;
    assert.equal(ladder.rows[0].matches, 2);
    assert.equal((await json(`${base}api/matches/${first}`)).body.status, 'void');

    // Merged-prompt test as alice, full length → ranked; counts once finished.
    await json(`${base}api/claims`, { method: 'POST', body: JSON.stringify({ email: 'dev@example.com', handle: 'alice' }) });
    const full = await json(`${base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'alice', source: 'merged', opponent: 'house', kind: 'full' }) });
    assert.equal(full.status, 202, JSON.stringify(full.body));
    await arena.queue.waitForIdle(60000);
    const fj = (await json(`${base}api/matches/${full.body.id}`)).body;
    assert.equal(fj.ranked, true);
    assert.equal(fj.result.endReason, 'timeout');
    assert.equal((await json(`${base}api/ladder`)).body.rows[0].matches, 3);

    // Pause/resume round-trip through the API.
    assert.equal((await json(`${base}api/queue/pause`, { method: 'POST', body: '{}' })).status, 200);
    assert.equal((await json(`${base}api/matches`)).body.paused, true);
    assert.equal((await json(`${base}api/queue/resume`, { method: 'POST', body: '{}' })).status, 200);
    assert.equal((await json(`${base}api/matches`)).body.paused, false);

    // The ledger is the whole story.
    const rows = readFileSync(path.join(f.data, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const types = rows.map((r) => r.type);
    for (const t of ['house', 'tournament', 'prompt-seen', 'queued', 'started', 'finished', 'claim', 'void', 'paused', 'resumed']) assert.ok(types.includes(t), t);
  } finally {
    await arena.close();
    f.cleanup();
  }
});

// Access-mode arena with a fake JWKS, so a non-organizer entrant can be exercised over HTTP.
async function accessArena(f) {
  const { generateKeyPairSync, createSign } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const AUD = 'c'.repeat(64);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (email) => {
    const now = Math.floor(Date.now() / 1000);
    const input = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64({ aud: [AUD], iss: 'https://team.cloudflareaccess.com', email, exp: now + 300 })}`;
    return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
  };
  const arena = await createArena({
    config: f.config,
    dataDir: f.data,
    accessAud: AUD,
    accessTeam: 'team',
    organizerEmail: 'ceryce@inrhythm.com',
    fetchJson: async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }),
    log: quiet,
    sync: false,
  });
  return { arena, token };
}

test('e2e: quota over HTTP — one at a time, then 6 quick per day, then 429', async () => {
  const f = fixture();
  const { arena, token } = await accessArena(f);
  try {
    const base = await arena.listen(0);
    const as = (email) => ({ 'cf-access-jwt-assertion': token(email) });
    const body = (i, kind = 'quick') => JSON.stringify({ handle: 'carol', source: 'scratch', prompt: `Prompt ${i}. Reply with JSON.`, kind });
    const post = (i, email = 'carol@inrhythm.com', kind) => json(`${base}api/tests`, { method: 'POST', body: body(i, kind), headers: as(email) });

    arena.queue.pause('e2e');
    assert.equal((await post(0)).status, 202);
    const second = await post(1);
    assert.equal(second.status, 429);
    assert.match(second.body.error, /one at a time/);
    const other = await post(1, 'dave@inrhythm.com');
    assert.equal(other.status, 409, 'carol is claimed by someone else');
    arena.queue.resume('e2e');
    await arena.queue.waitForIdle(60000);

    for (let i = 1; i < 6; i++) {
      assert.equal((await post(i)).status, 202, `quick test ${i + 1}`);
      await arena.queue.waitForIdle(60000);
    }
    const seventh = await post(6);
    assert.equal(seventh.status, 429);
    assert.match(seventh.body.error, /daily quota reached: 6\/6 quick/);
    const full = await post(7, 'carol@inrhythm.com', 'full');
    assert.equal(full.status, 202, 'full tests are a separate budget');
    await arena.queue.waitForIdle(120000);
    assert.equal((await fetch(`${base}admin`, { headers: as('carol@inrhythm.com') })).status, 403);
    assert.equal((await fetch(`${base}admin`, { headers: as('ceryce@inrhythm.com') })).status, 200);
  } finally {
    await arena.close();
    f.cleanup();
  }
});

test('e2e: Access mode refuses a request with no token, accepts a signed one', async () => {
  const f = fixture();
  const { arena, token } = await accessArena(f);
  try {
    const base = await arena.listen(0);
    assert.equal(arena.auth.mode, 'access');
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await json(`${base}api/ladder`)).status, 401);
    assert.equal((await fetch(`${base}assets/logo/jamobair-logo-transparent.png`)).status, 200, 'the logo is the one thing served without identity');
    const t = token('x@inrhythm.com');
    const me = await json(`${base}api/me`, { headers: { 'cf-access-jwt-assertion': t } });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body, { email: 'x@inrhythm.com', organizer: false, mode: 'access', handle: null });
    assert.equal((await fetch(`${base}admin`, { headers: { 'cf-access-jwt-assertion': t } })).status, 403, 'not the organizer');
    assert.equal((await fetch(`${base}api/me`, { headers: { 'cf-access-jwt-assertion': t.slice(0, -3) + 'xyz' } })).status, 401);
  } finally {
    await arena.close();
    f.cleanup();
  }
});
