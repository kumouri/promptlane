/**
 * The compile panel (door B, docs/entrant-compile-preview.md): the markdown renderer, the rate
 * limiter, the HTTP endpoints, the real `python tools/jev/compile.py` child process (against a fake
 * Ollama on 127.0.0.1 — no model, no spend), and a practice match in which a compiled schema plays
 * through a fake schema server on the mock model. No network beyond 127.0.0.1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../match/load.mjs';
import { RateLimiter, makeCompiler, practiceSchemas, spawnCompile, COMPILE_DEFAULTS } from './compile.mjs';
import { renderMarkdown } from './pages/compile.mjs';
import { createArena } from './server.mjs';
import { fixture, json, quiet } from './testkit.mjs';

const DRUMS = readFileSync(path.join(ROOT, 'prompts', 'pilots', 'drums.md'), 'utf8');
const ABILITIES = { drums: ['kick', 'fill'], keytar: ['chord', 'glissando'], violin: ['staccato', 'solo'] };

function schemaFor(instrument) {
  const [primary] = ABILITIES[instrument];
  return {
    pilot_file: 'pilot.md',
    instrument,
    rules: [
      { id: 'low_hp', condition: "is this bot's hp below a quarter of its max?", criteria_true: 'hp < 25%', criteria_false: 'hp >= 25%', action_kind: 'recall', action_ability: null, action_target_selector: 'none' },
      { id: 'enemy_close', condition: 'is an enemy bearbot within reach?', criteria_true: 'yes', criteria_false: 'no', action_kind: 'ability', action_ability: primary, action_target_selector: 'nearest_enemy' },
    ],
    default_action: { kind: 'move', ability: null, target_selector: 'push_lane' },
    validation_notes: [],
  };
}

/** What compile.py --format json prints, trimmed to what the arena reads. */
function fakeCompileOutput(ok = true) {
  const instruments = {};
  for (const inst of ['drums', 'keytar', 'violin']) {
    instruments[inst] = ok || inst !== 'violin'
      ? { instrument: inst, ok: true, labels: 'auto', schema: schemaFor(inst), dropped: [], unmatched_rules: [],
          markdown: `# Transparency report: \`pilot.md\` -> Jev decision schema (${inst})\n\n| # | Condition | Then |\n|---|---|---|\n| 1 | is hp < 25%? | **recall** home |\n\n> <script>alert(1)</script>\n` }
      : { instrument: inst, ok: false, labels: 'auto', error: 'the translator could not produce a valid schema for violin: nope' };
  }
  return { exitCode: ok ? 0 : 1, data: { version: 1, backend: 'fake:model', cap_tokens: 20000, usage: { calls: 3, total_tokens: 4500, cost_usd: 0, wall_seconds: 0.1 }, prompts: [{ name: 'pilot.md', sha256: 'x', markdown: '# x', instruments }] } };
}

// --- renderer ---------------------------------------------------------------------------------

test('renderMarkdown: escapes prose before adding markup, renders the report subset', () => {
  const html = renderMarkdown(
    '# Title `x`\n\nText with **bold** and *it*.\n\n| # | Condition | Then |\n|---|---|---|\n| 1 | a < b? | **recall** home |\n\n- **From your prose:**\n  > quoted <b>line</b>\n\n> <img src=x onerror=alert(1)>\n\n---\n',
  );
  assert.ok(html.includes('<h2>Title <code>x</code></h2>'));
  assert.ok(html.includes('<b>bold</b>') && html.includes('<i>it</i>'));
  assert.ok(html.includes('<td>a &lt; b?</td>'));
  assert.ok(html.includes('<blockquote>quoted &lt;b&gt;line&lt;/b&gt;</blockquote>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img'), 'no raw HTML from the prose survives');
  assert.ok(html.includes('<hr>'));
});

test('renderMarkdown: a real checked-in transparency run renders without raw markup leaking', () => {
  const md = readFileSync(path.join(ROOT, 'runs', 'jev-translator-transparency-keytar-2026-09-23.md'), 'utf8');
  const html = renderMarkdown(md);
  assert.equal((html.match(/<table>/g) ?? []).length, 1);
  assert.ok((html.match(/<h4>/g) ?? []).length >= 5, 'one h4 per rule');
  assert.ok(!/\*\*|^\| /m.test(html), 'no unrendered bold or table rows');
});

// --- rate limiter -------------------------------------------------------------------------------

test('RateLimiter: per-minute, per-day per IP, global per day, and a new Central day resets', () => {
  let t = Date.parse('2026-09-25T15:00:00Z');
  const rl = new RateLimiter({ perIpPerMinute: 2, perIpPerDay: 3, globalPerDay: 4 }, () => t);
  rl.take('a');
  rl.take('a');
  assert.throws(() => rl.take('a'), (e) => e.status === 429 && /a minute/.test(e.message) && e.retryAfterSec > 0);
  t += 61_000;
  rl.take('a');
  assert.throws(() => rl.take('a'), (e) => e.status === 429 && /daily limit/.test(e.message));
  rl.take('b');
  assert.throws(() => rl.take('c'), (e) => e.status === 429 && /budget for today/.test(e.message));
  assert.deepEqual(rl.usage('a'), { today: 3, perIpPerDay: 3 });
  t += 24 * 3600_000;
  rl.take('a');
  assert.equal(rl.usage('a').today, 1);
});

test('makeCompiler: validation and busy refusals do not spend quota; results are cached by id', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const c = makeCompiler({ config: { perIpPerMinute: 5, perIpPerDay: 5 }, run: async () => { await gate; return fakeCompileOutput(); } });
  await assert.rejects(c.compile('see https://evil.example', 'ip'), (e) => e.status === 400);
  await assert.rejects(c.compile('   ', 'ip'), (e) => e.status === 400);
  await assert.rejects(c.compile('x'.repeat(17 * 1024), 'ip'), (e) => e.status === 413);
  const first = c.compile(DRUMS, 'ip');
  await assert.rejects(c.compile(DRUMS, 'ip'), (e) => e.status === 503);
  release();
  const { id, result } = await first;
  assert.equal(c.limiter.usage('ip').today, 1, 'only the compile that ran counted');
  assert.equal(c.get(id).text, DRUMS.replace(/\r\n/g, '\n'));
  assert.equal(Object.keys(practiceSchemas(result)).length, 3);
  assert.equal(practiceSchemas(fakeCompileOutput(false).data.prompts[0]), null, 'one failed instrument → no practice');
});

// --- the real compile.py child process, against a fake Ollama ------------------------------------

test('spawnCompile: runs tools/jev/compile.py for real and parses its JSON (fake Ollama on 127.0.0.1)', async () => {
  const calls = [];
  const ollama = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { prompt } = JSON.parse(body);
      const inst = /The bot plays (\w+)\./.exec(prompt)[1];
      calls.push(inst);
      const s = schemaFor(inst);
      const reply = JSON.stringify({
        rules: s.rules.map((r) => ({ id: r.id, condition: r.condition, criteria: { true: r.criteria_true, false: r.criteria_false }, action: { kind: r.action_kind, ability: r.action_ability, target_selector: r.action_target_selector } })),
        default_action: s.default_action,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ response: reply, prompt_eval_count: 900, eval_count: 250 }));
    });
  });
  await new Promise((r) => ollama.listen(0, '127.0.0.1', r));
  const prevHost = process.env.OLLAMA_HOST;
  process.env.OLLAMA_HOST = `127.0.0.1:${ollama.address().port}`;
  try {
    const run = spawnCompile({ root: ROOT, cfg: { ...COMPILE_DEFAULTS, backend: 'ollama' } });
    const { exitCode, data } = await run('Recall when you are below a quarter health. Use your first ability the instant an enemy bearbot is close.\n\nBe loud.\n');
    assert.equal(exitCode, 0);
    assert.equal(data.backend, 'ollama:qwen3.5:9b');
    assert.equal(data.usage.calls, 3);
    assert.equal(data.usage.total_tokens, 3 * 1150);
    assert.equal(data.cap_tokens, COMPILE_DEFAULTS.maxTokensPerCompile);
    const p = data.prompts[0];
    assert.deepEqual(Object.keys(p.instruments), ['drums', 'keytar', 'violin']);
    assert.ok(p.instruments.keytar.markdown.includes('use **chord** targeting'));
    assert.ok(p.instruments.drums.markdown.includes('> Be loud.'), 'voice line quoted under Dropped');
    assert.deepEqual(calls.sort(), ['drums', 'keytar', 'violin']);
  } finally {
    if (prevHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = prevHost;
    await new Promise((r) => ollama.close(r));
  }
});

// --- HTTP endpoints + practice match --------------------------------------------------------------

async function schemaServer() {
  const seen = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { schema, observation } = JSON.parse(body);
      seen.push(schema.instrument);
      assert.equal(schema.instrument, observation.self.instrument, 'each bearbot plays its own instrument’s schema');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ action: { kind: 'move', target: { x: 900, y: 100 } }, rule: null, answers: { low_hp: 0.1, enemy_close: 0.2 }, ms: 1 }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, seen, endpoint: `http://127.0.0.1:${srv.address().port}/` };
}

test('HTTP: /compile page, /api/compile limits with Retry-After, practice match plays the compiled schema on the practice backend', async () => {
  const js = await schemaServer();
  const f = fixture({
    handles: {},
    tweak: (cfg) => {
      cfg.backends['jev-schema'] = { kind: 'jev-schema-http', endpoint: js.endpoint, avgSecPerCall: 0.01, timeoutSec: 5 };
      cfg.compile = { ...cfg.compile, practiceBackend: 'jev-schema', perIpPerMinute: 2, perIpPerDay: 10 };
    },
  });
  const arena = await createArena({ config: f.config, dataDir: f.data, devUser: 'dev@example.com', log: quiet, sync: false, hooks: { compileRun: async () => fakeCompileOutput() } });
  try {
    const base = await arena.listen(0);
    const page = await fetch(`${base}compile`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('Compile your prose') && html.includes('href="/compile" class="here"'));
    assert.ok(!/OPENROUTER|api[_-]?key/i.test(html), 'nothing about the backend key reaches the browser');

    const ok = await json(`${base}api/compile`, { method: 'POST', body: JSON.stringify({ prompt: DRUMS }) });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.practice, true);
    assert.deepEqual(Object.keys(ok.body.instruments), ['drums', 'keytar', 'violin']);

    const form = await fetch(`${base}compile`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ prompt: DRUMS }) });
    assert.equal(form.status, 200);
    const formHtml = await form.text();
    assert.ok(formHtml.includes('drums — 2 rules'));
    assert.ok(formHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !formHtml.includes('<script>alert'), 'report text is escaped');
    assert.ok(formHtml.includes('Run a quick practice match vs the house bot'));

    const limited = await fetch(`${base}api/compile`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ prompt: DRUMS }) });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.match((await limited.json()).error, /a minute/);

    // Practice: the cached compile's schemas play violet through the practice backend.
    const expired = await json(`${base}api/compile/practice`, { method: 'POST', body: JSON.stringify({ compileId: 'nope', handle: 'carol' }) });
    assert.equal(expired.status, 410);
    const sub = await json(`${base}api/compile/practice`, { method: 'POST', body: JSON.stringify({ compileId: ok.body.compileId, handle: 'carol' }) });
    assert.equal(sub.status, 202, JSON.stringify(sub.body));
    const queued = (await json(`${base}api/matches/${sub.body.id}`)).body;
    assert.deepEqual(queued.practice, { backend: 'jev-schema', compiledWith: 'fake:model', instruments: ['drums', 'keytar', 'violin'] }, 'schemas stay server-side');
    assert.equal(queued.quick, true);
    assert.equal(queued.ranked, false);

    await arena.queue.waitForIdle(60000);
    const m = (await json(`${base}api/matches/${sub.body.id}`)).body;
    assert.equal(m.status, 'finished', JSON.stringify(m));
    assert.ok(m.verify.checkpointsCompared > 0, 'the practice match replays like any other');
    const log = await (await fetch(`${base}logs/${sub.body.id}.json`)).json();
    assert.equal(log.sides.violet.name, 'carol (scratch)');
    const violetReplies = log.decisions.filter((d) => (d.reply ?? '').includes('"rule"'));
    assert.ok(violetReplies.length > 0, 'violet decided through the schema server');
    assert.deepEqual([...new Set(js.seen)].sort(), ['drums', 'keytar', 'violin']);

    const again = await json(`${base}api/compile/practice`, { method: 'POST', body: JSON.stringify({ compileId: ok.body.compileId, handle: 'carol' }) });
    assert.equal(again.status, 202, 'a second practice run is another quick test against the quota');
  } finally {
    await arena.close();
    await new Promise((r) => js.srv.close(r));
    f.cleanup();
  }
});

test('HTTP: no practice backend configured → the panel compiles but refuses practice', async () => {
  const f = fixture({ handles: {} });
  const arena = await createArena({ config: f.config, dataDir: f.data, devUser: 'dev@example.com', log: quiet, sync: false, hooks: { compileRun: async () => fakeCompileOutput() } });
  try {
    const base = await arena.listen(0);
    const ok = await json(`${base}api/compile`, { method: 'POST', body: JSON.stringify({ prompt: DRUMS }) });
    assert.equal(ok.body.practice, false);
    const sub = await json(`${base}api/compile/practice`, { method: 'POST', body: JSON.stringify({ compileId: ok.body.compileId, handle: 'dave' }) });
    assert.equal(sub.status, 404);
  } finally {
    await arena.close();
    f.cleanup();
  }
});
