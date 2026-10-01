/**
 * Teams on the web (docs/arena-runbook.md §1d): validation parity with the entrants repo's own
 * check, the cutoff, who may edit what, escaping of entrant prose, the teams pages, and the write
 * path into the entrants repo (a local tree here; a fake `gh api` for the GitHub kind). Mock model,
 * Access mode with a fake JWKS, no network. Needs Python (the validator is run as itself).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT } from '../match/load.mjs';
import { EntrantsConflict, githubWriter } from './entrants_writer.mjs';
import { fetchEntrantsFromDir, gitBlobSha, isTeamName, validatePromptText, validateTeamName } from './prompts.mjs';
import { SUBMISSION_DEFAULTS, fmtCutoff } from './teams.mjs';
import { accessArena, fixture, json } from './testkit.mjs';
import { VENDORED_VALIDATOR, vendoredValidatorSha } from './validator.mjs';

const PY = process.platform === 'win32' ? 'python' : 'python3';
const ch = (cp) => String.fromCodePoint(cp);
const LF = (s) => s.replace(/\r\n/g, '\n'); // a CRLF checkout's pilots; the web commits LF
const KEYTAR = LF(readFileSync(path.join(ROOT, 'prompts', 'pilots', 'keytar.md'), 'utf8'));
const VIOLIN = LF(readFileSync(path.join(ROOT, 'prompts', 'pilots', 'violin.md'), 'utf8'));
const CUTOFF = Date.parse('2026-10-16T05:00:00Z');

/** Texts on every edge of the rules, including where Python's regex dialect and JavaScript's part ways. */
const TEXTS = [
  ['a real pilot', KEYTAR],
  ['empty', ''],
  ['whitespace only', '  \n\t\n'],
  ['only a BOM (not whitespace to Python)', ch(0xfeff)],
  ['only NEL (whitespace to Python)', ch(0x85)],
  ['only an information separator', ch(0x1c) + '\n'],
  ['a fenced block', 'Do this:\n```\nattack\n```\n'],
  ['an indented tilde fence', 'Rules\n  ~~~\nx\n'],
  ['inline triple backticks', 'Never write ``` in a reply.'],
  ['a tilde fence after a lone CR', 'line one\r~~~ not a fence to Python'],
  ['backticks after a lone CR', 'line one\r``` still backticks'],
  ['a tilde fence after U+2028', 'a' + ch(0x2028) + '~~~'],
  ['a tilde fence indented with NEL', ch(0x85) + '~~~'],
  ['an https URL', 'see https://example.com'],
  ['a bare www', 'go to www.example.com'],
  ['an uppercase scheme', 'HTTP://EXAMPLE'],
  ['a long-s scheme (Python folds it to s)', 'http' + ch(0x17f) + '://x'],
  ['HTML in the prose', '<script>alert(1)</script> and </textarea>'],
  ['unicode prose', 'Le batteur ' + ch(0x2615) + ' attaque à 40 %.'],
  ['CRLF line endings', 'Push mid.\r\nRetreat at 20%.\r\n'],
];

const NAMES = ['alice', 'alice+bob', 'alice+bob+carol', 'a+b+c+d', 'alice+Alice', 'al ice', '-x', 'x+', '+x', '', "o'brien", 'a"b', `a'b"c`, 'a\\b',
  'x' + ch(0) + 'y', 'caf' + ch(0xe9), 'a' + ch(0xa0) + 'b', 'a' + ch(0x200b) + 'b', 'a' + ch(0x1f600) + 'b', 'alice\n', 'alice\n+bob', '_template'];

/** The vendored validator's own functions, through Python. */
function pyFunctions(cases) {
  const code = 'import json, sys; sys.path.insert(0, sys.argv[1]); import validate_entry as v; cases = json.loads(sys.stdin.read()); print(json.dumps([[v.validate_team_name(c["name"]), v.validate_text(c["text"])] for c in cases]))';
  const r = spawnSync(PY, ['-c', code, path.dirname(VENDORED_VALIDATOR)], { input: JSON.stringify(cases), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

/** The GitHub check, as the entrants repo's CI runs it: the validator script on an entry folder. */
function githubCheck(team, text) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gh-check-'));
  try {
    mkdirSync(path.join(dir, 'entrants', team), { recursive: true });
    writeFileSync(path.join(dir, 'entrants', team, 'pilot.md'), text, 'utf8');
    const r = spawnSync(PY, [VENDORED_VALIDATOR, path.join(dir, 'entrants', team)], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    return { ok: r.status === 0, problems: r.stdout.split(/\r?\n/).filter((l) => l.startsWith('     - ')).map((l) => l.slice(7)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const post = (base, p, headers, body) => json(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) });
async function form(url, headers, fields) {
  const res = await fetch(url, { method: 'POST', redirect: 'manual', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
  return { status: res.status, text: await res.text(), location: res.headers.get('location') };
}
const html = async (url, headers) => (await fetch(url, { headers })).text();
const pilotFile = (f, folder) => path.join(f.entrants, 'entrants', folder, 'pilot.md');

async function withArena(opts, fn) {
  const f = fixture({ handles: opts.handles ?? {}, tweak: (c) => { c.submissions = { ...(opts.submissions ?? {}) }; } });
  const a = await accessArena(f, { hooks: opts.hooks });
  try {
    const base = await a.arena.listen(0);
    if (opts.paused) a.arena.queue.pause('test');
    await fn({ f, base, ...a });
  } finally {
    await a.arena.close();
    f.cleanup();
  }
}

// --- one source of truth -----------------------------------------------------------------------

test('the vendored validator is byte-for-byte the entrants repo file its README pins', () => {
  const readme = readFileSync(path.join(path.dirname(VENDORED_VALIDATOR), 'README.md'), 'utf8');
  const pinned = /blob `([0-9a-f]{40})`/.exec(readme)?.[1];
  assert.ok(pinned, 'entrants_validator/README.md names the upstream blob sha');
  assert.equal(vendoredValidatorSha(), pinned, 'the vendored copy changed without re-pinning it (or vice versa)');
});

test("the sync's JS port of the rules says exactly what the vendored validator says, edge cases included", () => {
  const cases = [...NAMES.map((name) => ({ name, text: 'x' })), ...TEXTS.map(([, text]) => ({ name: 'alice', text }))];
  const py = pyFunctions(cases);
  cases.forEach((c, i) => {
    assert.deepEqual(validateTeamName(c.name), py[i][0], `team name ${JSON.stringify(c.name)}`);
    assert.deepEqual(validatePromptText(c.text), py[i][1], `text ${JSON.stringify(c.text.slice(0, 40))}`);
  });
});

test('web parity: the web refuses what the GitHub check refuses and accepts what it accepts, with its words', async () => {
  await withArena({ paused: true, submissions: { perUserPerMinute: 1000, perUserPerDay: 1000 } }, async ({ f, base, as }) => {
    const alice = as('alice@inrhythm.com');
    assert.equal((await post(base, 'api/team/create', alice, { handle: 'alice' })).status, 200);
    let blob = '';
    let accepted = 0;
    for (const [label, text] of TEXTS) {
      const gh = githubCheck('alice', text);
      const r = await post(base, 'api/team/submit', alice, { prompt: text, base: blob });
      if (gh.ok) {
        assert.equal(r.status, 201, `${label}: the GitHub check accepts it, the web said ${r.status} ${JSON.stringify(r.body)}`);
        assert.equal(readFileSync(pilotFile(f, 'alice'), 'utf8'), text.replace(/\r\n/g, '\n'), `${label}: committed as submitted`);
        blob = r.body.blobSha;
        accepted += 1;
      } else {
        assert.equal(r.status, 422, `${label}: the GitHub check refuses it (${gh.problems.join('; ')}), the web said ${r.status}`);
        assert.deepEqual(r.body.problems, gh.problems, `${label}: same problems, same words`);
      }
    }
    assert.ok(accepted >= 5 && accepted < TEXTS.length, 'the corpus has both verdicts');
  });
});

test('a folder name the validator refuses cannot be made on the web either', async () => {
  await withArena({ paused: true }, async ({ base, as }) => {
    for (const handle of ['al ice', '-x', 'a+b', 'x'.repeat(40)]) {
      const r = await post(base, 'api/team/create', as('x@inrhythm.com'), { handle });
      assert.equal(r.status, 400, `${handle} → ${r.status}`);
    }
    assert.equal(githubCheck('a+a', 'x').ok, false);
    const lead = as('a@inrhythm.com');
    const { body } = await post(base, 'api/team/create', lead, { handle: 'a' });
    const r = await post(base, 'api/team/join', as('a2@inrhythm.com'), { handle: 'A', code: body.team.joinCode });
    assert.equal(r.status, 409, 'A is a, case-insensitively — the validator refuses a+A');
  });
});

// --- cutoff ----------------------------------------------------------------------------------------

test('cutoff: midnight Central at the end of Thu 15 Oct by default; refused server-side from that instant', async () => {
  assert.equal(SUBMISSION_DEFAULTS.cutoff, '2026-10-16T05:00:00Z');
  assert.equal(fmtCutoff(SUBMISSION_DEFAULTS.cutoff), 'Fri, Oct 16, 2026, 12:00 AM CT');
  let clock = CUTOFF - 60_000;
  await withArena({ paused: true, hooks: { now: () => clock } }, async ({ f, base, as }) => {
    const alice = as('alice@inrhythm.com');
    const created = await post(base, 'api/team/create', alice, { handle: 'alice' });
    assert.equal(created.status, 200);
    assert.equal((await post(base, 'api/team/submit', alice, { prompt: KEYTAR, base: '' })).status, 201, 'a minute before: accepted');
    assert.equal((await json(`${base}api/teams`, { headers: alice })).body.open, true);

    clock = CUTOFF;
    const late = await post(base, 'api/team/submit', alice, { prompt: VIOLIN, base: gitBlobSha(KEYTAR) });
    assert.equal(late.status, 403);
    assert.match(late.body.error, /submissions closed at Fri, Oct 16, 2026, 12:00 AM CT/);
    assert.equal(readFileSync(pilotFile(f, 'alice'), 'utf8'), KEYTAR, 'nothing written');
    assert.equal((await post(base, 'api/team/create', as('bob@inrhythm.com'), { handle: 'bob' })).status, 403, 'no new teams');
    assert.equal((await post(base, 'api/team/join', as('bob@inrhythm.com'), { handle: 'bob', code: created.body.team.joinCode })).status, 403, 'no joins');
    assert.equal((await json(`${base}api/teams`, { headers: alice })).body.open, false);
    const page = await html(`${base}team`, alice);
    assert.match(page, /Submissions closed/);
    assert.ok(!page.includes('action="/team/submit"'), 'no submit form after the cutoff');
    assert.ok(page.includes(KEYTAR.split('\n')[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')), 'the frozen pilot is still shown');
  });
});

// --- who may edit ------------------------------------------------------------------------------------

test("authz: only a team's members can submit for it; joining needs the code; no squatting on a handle or a GitHub entry", async () => {
  await withArena({ paused: true, handles: { 'zed+yan': 'keytar.md' } }, async ({ f, base, as, organizer, arena }) => {
    await arena.sync();
    const alice = as('alice@inrhythm.com');
    const bob = as('bob@inrhythm.com');
    const { body } = await post(base, 'api/team/create', alice, { handle: 'alice' });
    const code = body.team.joinCode;
    assert.match(code, /^[A-Z2-9]{10}$/);

    let r = await post(base, 'api/team/submit', bob, { prompt: VIOLIN, base: '' });
    assert.equal(r.status, 403, 'not on a team');
    assert.equal((await post(base, 'api/team/submit', organizer, { prompt: VIOLIN, base: '' })).status, 403, 'the organizer is not a member either');
    assert.equal((await post(base, 'api/team/join', bob, { handle: 'bob', code: 'WRONGCODE2' })).status, 404);

    const carol = as('carol@inrhythm.com');
    await post(base, 'api/team/create', carol, { handle: 'carol' });
    r = await post(base, 'api/team/submit', carol, { team: body.team.teamId, prompt: VIOLIN, base: '' });
    assert.equal(r.status, 403, "naming someone else's team");
    assert.equal(existsSync(pilotFile(f, 'alice')), false);

    assert.equal((await post(base, 'api/team/create', as('eve@inrhythm.com'), { handle: 'alice' })).status, 409, "someone else's handle");
    r = await post(base, 'api/team/create', as('mallory@inrhythm.com'), { handle: 'zed' });
    assert.equal(r.status, 409, 'a handle a GitHub entry names');
    assert.match(r.body.error, /ask the organizer to link it/);

    assert.equal((await post(base, 'api/team/join', bob, { handle: 'bob', code: code.toLowerCase() })).status, 200, 'codes are case-insensitive');
    assert.equal((await post(base, 'api/team/join', as('dave@inrhythm.com'), { handle: 'dave', code })).status, 409, 'a third member is the organizer’s to assign');
    assert.equal((await post(base, 'api/team/submit', bob, { prompt: VIOLIN, base: '' })).status, 201, 'the learner can submit');
    assert.equal(readFileSync(pilotFile(f, 'alice+bob'), 'utf8'), VIOLIN);

    // A GitHub-only team is read-only here until the organizer links it.
    assert.equal((await post(base, 'api/teams', alice, { leadEmail: 'zed@inrhythm.com', leadHandle: 'zed' })).status, 403, 'organizer only');
    r = await post(base, 'api/teams', organizer, { leadEmail: 'zed@inrhythm.com', leadHandle: 'zed', learnerEmail: 'yan@inrhythm.com', learnerHandle: 'yan' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.linked, true);
    const zedSees = (await json(`${base}api/teams/${encodeURIComponent('zed+yan')}`, { headers: as('zed@inrhythm.com') })).body;
    assert.equal(zedSees.source, 'web');
    r = await post(base, 'api/team/submit', as('yan@inrhythm.com'), { prompt: VIOLIN, base: zedSees.current.blobSha });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(readFileSync(pilotFile(f, 'zed+yan'), 'utf8'), VIOLIN);

    // A cross-site form post riding the Access cookie is refused before anything happens.
    const x = await form(`${base}team/submit`, { ...alice, origin: 'https://evil.example' }, { prompt: KEYTAR, base: '' });
    assert.equal(x.status, 403);
    assert.equal(readFileSync(pilotFile(f, 'alice+bob'), 'utf8'), VIOLIN);
  });
});

// --- escaping ----------------------------------------------------------------------------------------

test('entrant prose is data: escaped on the team page, in the textarea and in a conflict', async () => {
  const evil = '<script>alert("x")</script>\n</textarea><img src=x onerror=alert(1)>\n"quotes" & \'apos\'\n';
  await withArena({ paused: true }, async ({ base, as }) => {
    const alice = as('alice@inrhythm.com');
    await post(base, 'api/team/create', alice, { handle: 'alice' });
    assert.equal((await post(base, 'api/team/submit', alice, { prompt: evil, base: '' })).status, 201);
    const escaped = '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\n&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;';
    for (const page of [await html(`${base}teams/alice`, as('bob@inrhythm.com')), await html(`${base}team`, alice)]) {
      assert.ok(!page.includes('<script>alert'), 'no live script');
      assert.ok(!page.includes('<img src=x'), 'no live tag');
      assert.ok(page.includes(escaped), 'shown as text');
    }
    assert.equal((await html(`${base}team`, alice)).split('</textarea>').length, 2, 'the prose cannot close the textarea');
  });
});

// --- the pages -------------------------------------------------------------------------------------

test('teams view: GitHub and web teams, roles, status, ladder standing, matches with replay links; emails for the organizer only', async () => {
  await withArena({ handles: { 'zed+yan': 'keytar.md' } }, async ({ f, base, as, organizer, arena }) => {
    await arena.sync();
    await arena.queue.waitForIdle(60000);
    const alice = as('alice@inrhythm.com');
    await post(base, 'api/team/create', alice, { handle: 'alice' });

    const list = (await json(`${base}api/teams`, { headers: as('viewer@inrhythm.com') })).body;
    assert.deepEqual(list.teams.map((t) => t.folder), ['zed+yan', 'alice'], 'ranked teams first');
    const [zy, al] = list.teams;
    assert.deepEqual(zy.members, [{ handle: 'zed', role: 'lead' }, { handle: 'yan', role: 'learner' }]);
    assert.equal(zy.source, 'github');
    assert.equal(zy.status, 'on the ladder');
    assert.equal(zy.standing.rank, 1);
    assert.equal(zy.standing.matches, 3);
    assert.equal(al.status, 'not submitted yet');
    assert.equal(al.standing, null);
    assert.ok(!JSON.stringify(list).includes('@'), 'no email reaches a non-organizer');
    assert.ok(!JSON.stringify(list).includes(arena.ledger.state().teams.values().next().value.joinCode), 'nor a join code');
    const asOrg = (await json(`${base}api/teams`, { headers: organizer })).body;
    assert.equal(asOrg.teams[1].members[0].email, 'alice@inrhythm.com');

    const page = await html(`${base}teams`, as('viewer@inrhythm.com'));
    assert.ok(page.includes('href="/teams/zed%2Byan"'));
    assert.ok(!page.includes('alice@inrhythm.com'));

    const d = (await json(`${base}api/teams/zed%2Byan`, { headers: as('viewer@inrhythm.com') })).body;
    assert.equal(d.current.text, readFileSync(pilotFile(f, 'zed+yan'), 'utf8'));
    assert.equal(d.compile.state, 'n/a', 'the mock ladder compiles nothing');
    assert.equal(d.matches.length, 3);
    assert.equal(d.joinCode, null);
    const detail = await html(`${base}teams/zed%2Byan`, as('viewer@inrhythm.com'));
    for (const j of d.matches) assert.ok(detail.includes(`/play/?replay=/logs/${j.id}.json`), `replay link for ${j.id}`);
    assert.equal((await fetch(`${base}teams/nobody`, { headers: as('viewer@inrhythm.com') })).status, 404);
  });
});

// --- the write path --------------------------------------------------------------------------------

test('lifecycle: submit commits and places; a join moves the entry to lead+learner; a stale edit is a conflict, not an overwrite', async () => {
  await withArena({ submissions: { perUserPerMinute: 100 } }, async ({ f, base, as, arena }) => {
    const alice = as('alice@inrhythm.com');
    const bob = as('bob@inrhythm.com');
    const { body } = await post(base, 'api/team/create', alice, { handle: 'alice' });
    let r = await post(base, 'api/team/submit', alice, { prompt: KEYTAR, base: '' });
    assert.equal(r.status, 201);
    assert.equal(r.body.folder, 'alice');
    assert.equal(readFileSync(pilotFile(f, 'alice'), 'utf8'), KEYTAR);
    assert.ok(arena.ledger.state().prompts.has('alice'), 'the sync ran on the write');
    await arena.queue.waitForIdle(60000);
    assert.equal((await json(`${base}api/ladder`, { headers: alice })).body.rows[0].matches, 3, 'placed like a merged pull request');

    r = await post(base, 'api/team/join', bob, { handle: 'bob', code: body.team.joinCode });
    assert.equal(r.status, 200);
    assert.deepEqual({ from: r.body.moved.from, to: r.body.moved.to }, { from: 'alice', to: 'alice+bob' });
    assert.equal(readFileSync(pilotFile(f, 'alice+bob'), 'utf8'), KEYTAR);
    assert.equal(existsSync(path.join(f.entrants, 'entrants', 'alice')), false, 'the old folder is gone');
    await arena.queue.waitForIdle(60000);
    const ladder = (await json(`${base}api/ladder`, { headers: alice })).body.rows;
    assert.deepEqual(ladder.map((x) => [x.handle, x.matches]), [['alice+bob', 3]], 'the old entry left the ladder; the new one placed');

    // A pull request lands on the same file while bob has the page open.
    const seen = (await json(`${base}api/teams/alice%2Bbob`, { headers: bob })).body.current.blobSha;
    writeFileSync(pilotFile(f, 'alice+bob'), VIOLIN);
    r = await post(base, 'api/team/submit', bob, { prompt: 'Push mid, never retreat.\n', base: seen });
    assert.equal(r.status, 409);
    assert.equal(r.body.conflict.currentText, VIOLIN, 'the conflict carries what the repo has now');
    assert.equal(readFileSync(pilotFile(f, 'alice+bob'), 'utf8'), VIOLIN, 'nothing overwritten');
    const page = await form(`${base}team/submit`, bob, { prompt: 'Push mid, never retreat.\n', base: seen });
    assert.equal(page.status, 409);
    assert.match(page.text, /changed since you loaded this page/);
    assert.ok(page.text.includes('Push mid, never retreat.'), 'the draft survives in the form');
    assert.ok(page.text.includes(`name="base" value="${r.body.conflict.currentBlobSha}"`), 'the form now replaces the current version');
    r = await post(base, 'api/team/submit', bob, { prompt: 'Push mid, never retreat.\n', base: r.body.conflict.currentBlobSha });
    assert.equal(r.status, 201);
    assert.equal(readFileSync(pilotFile(f, 'alice+bob'), 'utf8'), 'Push mid, never retreat.\n');

    // The browser form: a submit renders the result on the page.
    const ok = await form(`${base}team/submit`, alice, { prompt: KEYTAR, base: gitBlobSha('Push mid, never retreat.\n') });
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Submitted\./);
    assert.match(ok.text, /The entrants validator passed it/);
  });
});

test('limits: per-person rate limit (429 with Retry-After) and the size cap (413)', async () => {
  await withArena({ paused: true }, async ({ base, as }) => {
    const alice = as('alice@inrhythm.com');
    await post(base, 'api/team/create', alice, { handle: 'alice' });
    const big = 'Push mid. '.repeat(4000);
    let r = await post(base, 'api/team/submit', alice, { prompt: big, base: '' });
    assert.equal(r.status, 413);
    assert.match(r.body.error, /32 KB.*pull request/);
    assert.equal((await post(base, 'api/team/submit', alice, { prompt: KEYTAR, base: '' })).status, 201);
    assert.equal((await post(base, 'api/team/submit', alice, { prompt: VIOLIN, base: gitBlobSha(KEYTAR) })).status, 201);
    const res = await fetch(`${base}api/team/submit`, { method: 'POST', headers: { ...alice, 'content-type': 'application/json' }, body: JSON.stringify({ prompt: KEYTAR, base: gitBlobSha(VIOLIN) }) });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    r = await post(base, 'api/team/join', as('bob@inrhythm.com'), { handle: 'bob', code: 'NOPE' });
    for (let i = 0; i < 5; i++) r = await post(base, 'api/team/join', as('bob@inrhythm.com'), { handle: 'bob', code: 'NOPE' });
    assert.equal(r.status, 429, 'guessing join codes is rate-limited');
  });
});

test('validator drift: a different validate_entry.py in the entrants repo pauses web submissions; the same one does not', async () => {
  await withArena({ paused: true }, async ({ f, base, as }) => {
    const alice = as('alice@inrhythm.com');
    await post(base, 'api/team/create', alice, { handle: 'alice' });
    mkdirSync(path.join(f.entrants, 'tools'), { recursive: true });
    writeFileSync(path.join(f.entrants, 'tools', 'validate_entry.py'), readFileSync(VENDORED_VALIDATOR, 'utf8').replace(/\r\n/g, '\n') + '\n# changed\n');
    const r = await post(base, 'api/team/submit', alice, { prompt: KEYTAR, base: '' });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /validator changed upstream/);
    writeFileSync(path.join(f.entrants, 'tools', 'validate_entry.py'), readFileSync(VENDORED_VALIDATOR, 'utf8').replace(/\r\n/g, '\n'));
    assert.equal((await post(base, 'api/team/submit', alice, { prompt: KEYTAR, base: '' })).status, 201);
  });
});

test('githubWriter: one tree, one commit, a fast-forward ref update; prose only on stdin; conflicts refuse; a moved ref retries', async () => {
  const calls = [];
  let headSha = 'c1';
  let moveOnce = true;
  const files = { 'entrants/alice/pilot.md': 'b-old', 'tools/validate_entry.py': 'v1' };
  const run = async (args, body) => {
    calls.push({ args, body });
    const p = args[args.length - 1];
    if (p === 'repos/o/r/commits/main') return JSON.stringify({ sha: headSha, commit: { tree: { sha: `t-${headSha}` } } });
    if (p === `repos/o/r/git/trees/${headSha}?recursive=1`) return JSON.stringify({ tree: Object.entries(files).map(([path, sha]) => ({ path, sha, type: 'blob' })) });
    if (p === 'repos/o/r/git/trees') return JSON.stringify({ sha: 'tree-new' });
    if (p === 'repos/o/r/git/commits') return JSON.stringify({ sha: 'commit-new' });
    if (p === 'repos/o/r/git/refs/heads/main') {
      if (moveOnce) {
        moveOnce = false;
        headSha = 'c2';
        throw new Error('gh: Update is not a fast forward (HTTP 422)');
      }
      return '{}';
    }
    throw new Error(`unexpected ${p}`);
  };
  const w = githubWriter({ repo: 'o/r', ref: 'main' }, { run });
  const head = await w.head();
  assert.equal(head.validatorBlobSha, 'v1');
  const text = 'Prose with "quotes"; $(rm -rf /) and `ticks`\n';
  const out = await w.write({ put: { 'entrants/alice+bob/pilot.md': { text } }, remove: ['entrants/alice/pilot.md'], expect: { 'entrants/alice/pilot.md': 'b-old', 'entrants/alice+bob/pilot.md': null }, message: 'm', base: head });
  assert.equal(out.commit, 'commit-new');
  assert.equal(out.blobs['entrants/alice+bob/pilot.md'], gitBlobSha(text));
  for (const c of calls) assert.ok(!c.args.some((a) => a.includes('Prose')), 'prose never on the command line');
  const trees = calls.filter((c) => c.args.includes('repos/o/r/git/trees'));
  assert.equal(trees.length, 2, 'retried once after the ref moved');
  assert.deepEqual(trees[1].body, { base_tree: 't-c2', tree: [{ path: 'entrants/alice+bob/pilot.md', mode: '100644', type: 'blob', content: text }, { path: 'entrants/alice/pilot.md', mode: '100644', type: 'blob', sha: null }] });
  assert.deepEqual(calls.filter((c) => c.args.includes('repos/o/r/git/commits'))[1].body, { message: 'm', tree: 'tree-new', parents: ['c2'] });
  assert.deepEqual(calls.at(-1).body, { sha: 'commit-new', force: false }, 'never forced');

  files['entrants/alice/pilot.md'] = 'b-merged-meanwhile';
  await assert.rejects(w.write({ put: { 'entrants/alice/pilot.md': { text } }, expect: { 'entrants/alice/pilot.md': 'b-old' }, message: 'm' }), EntrantsConflict);
});

test('sync: team folders are entries, a folder the validator refuses is skipped', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-teams-'));
  try {
    for (const name of ['alice', 'alice+bob', 'c+d+e', 'a+a', 'w+x+y+z', '_template', 'bad name']) {
      mkdirSync(path.join(dir, 'entrants', name), { recursive: true });
      writeFileSync(path.join(dir, 'entrants', name, 'pilot.md'), 'x');
    }
    assert.deepEqual(fetchEntrantsFromDir(dir).map((e) => e.handle), ['alice', 'alice+bob', 'c+d+e']);
    assert.equal(fetchEntrantsFromDir(dir).validatorBlobSha, null);
    for (const ok of ['alice', 'alice+bob', 'a.b+c_d+e-f']) assert.ok(isTeamName(ok), ok);
    for (const bad of ['_template', 'a+A', 'a++b', 'alice\n', '', 'a/b']) assert.ok(!isTeamName(bad), JSON.stringify(bad));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
