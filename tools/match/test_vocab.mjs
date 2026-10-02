/**
 * The shared vocabulary (tools/jev/vocab.py, docs/vocabulary-spec.md) against the real sim:
 *   - the Python mirrors of the TypeScript (map variants, attack ranges, vocabulary names) agree;
 *   - every checked-in match log still replays to the same checkpoints (§5.1: nothing in stage A can
 *     move a replay, and this proves it on the logs we have);
 *   - a real match, one side on vocab-2 schemas naming every new target and the other on a vocab-1
 *     schema, played through the real `schema_server.py --stub` (seeded random answers keyed on each
 *     request, $0): every ask is answered in the schema's own vocabulary, every new target resolves,
 *     the log replays, and the same seed plays the same match again;
 *   - a schema pilot holds rather than play a vocab-2 schema on a server too old to know it;
 *   - vocab-2 reach: "attack the enemy tower" walks to a tower the description lists (§8.2), and an
 *     ability aimed beyond its range walks toward its target (§8.3); vocab-1 stands still as before;
 *   - `fight_samples.mjs` (the fight verdict's calibration data) reads every bearbot's hp.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { flush, loadHeadless } from './load.mjs';
import { samplesFromLog } from './fight_samples.mjs';

const h = await loadHeadless();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const dir = mkdtempSync(path.join(tmpdir(), 'vocab-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function python(code) {
  return JSON.parse(execFileSync(PYTHON, ['-c', code], { cwd: path.join(ROOT, 'tools', 'jev'), encoding: 'utf8' }));
}

function checkedInLogs() {
  return execFileSync('git', ['ls-files', 'runs/*.json'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((f) => {
      try {
        const log = JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
        return Array.isArray(log?.checkpoints) && Array.isArray(log?.decisions) ? { f, log } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

test('the Python mirrors match the TypeScript: maps, attack ranges, vocabulary names', () => {
  const py = python('import json, vocab; print(json.dumps({"maps": vocab.MAPS, "range": vocab.ATTACK_RANGE, "vocabs": vocab.VOCABS, "default": vocab.DEFAULT_VOCAB, "legacy": vocab.LEGACY_VOCAB}))');
  const maps = Object.fromEntries(Object.values(h.MAP_VARIANTS).map((m) => [m.name, [m.towerRange, m.towerFractions]]));
  assert.deepEqual(py.maps, maps);
  assert.deepEqual(py.range, Object.fromEntries(Object.entries(h.INSTRUMENTS).map(([k, v]) => [k, v.attackRange])));
  assert.deepEqual(py.vocabs, [...h.VOCABS]);
  assert.equal(py.default, h.DEFAULT_VOCAB);
  assert.equal(py.legacy, h.VOCAB_1);
});

test('every checked-in match log replays to the same checkpoints and result', async () => {
  const logs = checkedInLogs();
  assert.ok(logs.length >= 17, `found ${logs.length} logs`);
  for (const { f, log } of logs) {
    const v = await h.verifyReplay(log, flush);
    assert.ok(v.ok, `${f}: first divergence at tick ${v.firstDivergenceTick}`);
  }
});

/** `python tools/jev/schema_server.py --stub --port 0`; resolves to its endpoint once it is listening. */
function stubServer() {
  const child = spawn(PYTHON, [path.join(ROOT, 'tools', 'jev', 'schema_server.py'), '--stub', '--port', '0', '--budget-usd', '-1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  after(() => child.kill());
  return new Promise((resolve, reject) => {
    createInterface({ input: child.stdout }).on('line', (line) => {
      const m = line.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) resolve(m[0]);
    });
    child.on('exit', (code) => reject(new Error(`schema_server.py exited ${code}`)));
  });
}

const rule = (id, condition, kind, selector) => ({ id, condition, criteria_true: 'yes', criteria_false: 'no', action_kind: kind, action_ability: null, action_target_selector: selector });
const POSITION = new Set(['own_tower', 'own_front_tower', 'nearest_ally']);
const V2 = {
  drums: [rule('hold', 'is this bot under its own tower?', 'move', 'own_tower'), rule('punish', 'is an enemy bearbot under its tower?', 'attack', 'tower_diver')],
  keytar: [rule('focus', 'is this bot\'s side stronger here?', 'attack', 'nearest_enemy_bearbot'), rule('group', 'is this bot\'s side weaker here?', 'move', 'nearest_ally')],
  violin: [rule('farm', 'is an enemy minion in its attack range?', 'attack', 'nearest_enemy_minion'), rule('front', 'will an enemy tower shoot it?', 'move', 'own_front_tower')],
};

function vocab2Schemas() {
  return Object.fromEntries(Object.entries(V2).map(([inst, rules]) => [inst, {
    pilot_file: 'entrants/v2/pilot.md', instrument: inst, rules, default_action: { kind: 'move', ability: null, target_selector: 'push_lane' }, vocab: 'vocab-2',
  }]));
}

function vocab1Schemas() {
  return Object.fromEntries(['drums', 'keytar', 'violin'].map((inst) => [inst, {
    pilot_file: 'entrants/v1/pilot.md', instrument: inst, rules: [rule('near', 'is an enemy near?', 'attack', 'nearest_enemy')],
    default_action: { kind: 'move', ability: null, target_selector: 'push_lane' },
  }]));
}

function cli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'match', 'cli.mjs'), ...args], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('close', (code) => resolve({ code, out }));
  });
}

test('a real match on the stub schema server: vocab-2 targets resolve, vocab-1 plays alongside, the log replays', async () => {
  const endpoint = await stubServer();
  const health = await (await fetch(endpoint + 'health')).json();
  assert.deepEqual(health.vocabs, ['vocab-1', 'vocab-2']);
  writeFileSync(path.join(dir, 'v2.json'), JSON.stringify(vocab2Schemas()));
  writeFileSync(path.join(dir, 'v1.json'), JSON.stringify(vocab1Schemas()));
  const out = path.join(dir, 'match.json');
  const prose = path.join(ROOT, 'prompts', 'pilots', 'drums.md');
  const play = (to) => cli(['--a', prose, '--a-schemas', path.join(dir, 'v2.json'), '--b', prose, '--b-schemas', path.join(dir, 'v1.json'),
    '--jev-schema', endpoint, '--seed', '7', '--cadence', '2', '--max-sim-sec', '150', '--out', to, '--quiet']);
  const r = await play(out);
  assert.equal(r.code, 0, r.out);
  const log = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(log.sides.violet.schemas.drums.vocab, 'vocab-2', 'the log keeps each schema, vocab key included');
  assert.equal(log.sides.green.schemas.drums.vocab, undefined);
  const asked = log.decisions.filter((d) => !d.cached);
  assert.ok(asked.length > 100);
  const errors = asked.filter((d) => d.reply?.startsWith('[pilot error'));
  assert.deepEqual(errors.map((d) => d.reply), [], 'no ask failed');
  const fired = new Map();
  for (const d of asked.filter((x) => x.bot < 3)) {
    const { rule: id } = JSON.parse(d.reply);
    if (!id) continue;
    const sel = Object.values(V2).flat().find((x) => x.id === id).action_target_selector;
    fired.set(sel, (fired.get(sel) ?? 0) + 1);
    if (POSITION.has(sel)) assert.equal(typeof d.action.target?.x, 'number', `${sel} resolves to a position`);
    else if (d.action.target !== undefined) assert.equal(typeof d.action.target, 'string', `${sel} resolves to an id`);
  }
  for (const sel of ['own_tower', 'own_front_tower', 'nearest_ally']) assert.ok(fired.get(sel) > 0, `${sel} fired: ${JSON.stringify([...fired])}`);
  const v = await cli(['--verify', out]);
  assert.equal(v.code, 0, v.out);
  // The stub's six asks a round arrive in any order; its answers must not depend on that, or this
  // match plays differently every run and the counts above are luck (a selector fired 0 times on CI).
  const again = path.join(dir, 'again.json');
  assert.equal((await play(again)).code, 0);
  const played = (l) => l.decisions.filter((d) => !d.cached).map((d) => ({ tick: d.tick, bot: d.bot, answers: JSON.parse(d.reply).answers, action: d.action }))
    .sort((a, b) => a.tick - b.tick || a.bot - b.bot);
  assert.deepEqual(played(JSON.parse(readFileSync(again, 'utf8'))), played(log), 'the same seed on the stub plays the same match');
});

test('a schema pilot holds rather than play a vocab-2 schema on a server too old to echo it', async () => {
  let echo = null;
  const srv = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ action: { kind: 'hold' }, rule: null, answers: {}, ms: 1, targeting: 'own-lane-1', ...(echo ? { vocab: echo } : {}) }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  after(() => srv.close());
  const endpoint = `http://127.0.0.1:${srv.address().port}/`;
  const obs = { self: { instrument: 'drums' } };
  const v2 = h.jevSchemaTracingPilot({ endpoint, schemas: vocab2Schemas() });
  const v1 = h.jevSchemaTracingPilot({ endpoint, schemas: vocab1Schemas() });
  let d = await v2.decide(obs);
  assert.equal(d.action, null);
  assert.match(d.reply, /played the schema under vocab-1, not its own vocab-2; restart tools\/jev\/schema_server\.py/);
  assert.deepEqual((await v1.decide(obs)).action, { kind: 'hold' }, 'a vocab-1 schema plays on an old server as it always did');
  echo = 'vocab-2';
  assert.deepEqual((await v2.decide(obs)).action, { kind: 'hold' });
  assert.equal(h.vocabUnsupported({ vocabs: ['vocab-1'] }, ['vocab-1', 'vocab-2']), 'the schema server plays vocab-1 only, not vocab-2; restart tools/jev/schema_server.py from this checkout');
  assert.equal(h.vocabUnsupported({}, ['vocab-1']), null, 'a server that lists nothing plays vocab-1');
  assert.deepEqual(h.vocabsOf({ ...vocab1Schemas(), keytar: vocab2Schemas().keytar }), ['vocab-1', 'vocab-2']);
});

/** One `python tools/jev/target_resolve.py` process: one JSON request a line, one reply a line. */
function resolver() {
  const child = spawn(PYTHON, [path.join(ROOT, 'tools', 'jev', 'target_resolve.py')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
  after(() => child.stdin.end());
  const replies = [];
  createInterface({ input: child.stdout }).on('line', (line) => replies.shift()(JSON.parse(line)));
  return (req) => new Promise((res, rej) => {
    replies.push((r) => (r.error ? rej(new Error(r.error)) : res(r.target)));
    child.stdin.write(JSON.stringify(req) + '\n');
  });
}

/**
 * The tower-reach gap (runs/jev-recheck-vocab2-2026-10-02.md §2.2): violet's top drums stands `gap`
 * units in front of green's top outer tower and plays "attack the nearest enemy tower" every
 * decision, its target resolved by the Python resolver under `vocab`. Everyone else holds.
 */
async function towerAttack(vocab, gap, seconds = 8) {
  const resolve = resolver();
  const map = h.resolveMap('pvp-1');
  const targets = [];
  let asking = null;
  const hold = () => ({ decide: async () => ({ kind: 'hold' }) });
  const attacker = () => ({
    decide: async (obs) => {
      asking = resolve({ selector: 'nearest_tower', observation: obs, targeting: 'own-lane-1', vocab, map });
      const target = await asking;
      targets.push(target);
      return target ? { kind: 'attack', target } : { kind: 'hold' };
    },
  });
  const roster = ['violet', 'green'].flatMap((team) => [['top', 'drums'], ['mid', 'keytar'], ['bottom', 'violin']].map(([lane, instrument]) => ({
    team, lane, instrument, pilotKind: 'scripted', makePilot: team === 'violet' && lane === 'top' ? attacker : hold,
  })));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, map);
  const bot = match.bearbots.find((b) => b.team === 'violet' && b.lane === 'top');
  const tower = match.towers.filter((t) => t.team === 'green' && t.lane === 'top').sort((a, b) => a.pos.x - b.pos.x)[0];
  bot.pos = { x: tower.pos.x - gap, y: tower.pos.y };
  const start = { ...bot.pos };
  for (let t = 1; t <= seconds / h.TICK_DT && !match.ended; t++) {
    match.tick(h.TICK_DT);
    // the asked target lands before the next tick, so both vocabularies decide on the same ticks
    while (asking) {
      const was = asking;
      await was;
      if (asking === was) asking = null;
    }
    await flush();
  }
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return { tower, targets, moved: d(bot.pos, start), left: d(bot.pos, tower.pos), towerDamage: tower.maxHp - tower.hp, reach: bot.attackRange };
}

test('vocab-2 "attack the enemy tower" reaches the towers its description lists: from 300 units out the bot walks up and hits it', async () => {
  const v2 = await towerAttack('vocab-2', 300);
  assert.ok(v2.targets.length > 0);
  assert.deepEqual([...new Set(v2.targets)], [v2.tower.id], 'every decision targets the tower');
  assert.ok(v2.left <= v2.reach, `ends in attack range (${v2.left.toFixed(1)} from the tower)`);
  assert.ok(v2.towerDamage > 0, 'and hits it');
  // vocab-1 never described that tower, so its rule never fires there; the resolver gives no target
  const v1 = await towerAttack('vocab-1', 300);
  assert.deepEqual([...new Set(v1.targets)], [null]);
  assert.ok(v1.moved < 1, 'with no target the bot stands still');
});

test('vocab-2 "attack the enemy tower" under 260 units resolves as vocab-1 does', async () => {
  const [v2, v1] = [await towerAttack('vocab-2', 200, 2), await towerAttack('vocab-1', 200, 2)];
  // entity ids count on across matches, so each is checked against its own match's tower
  assert.deepEqual([...new Set(v2.targets)], [v2.tower.id]);
  assert.deepEqual([...new Set(v1.targets)], [v1.tower.id]);
  assert.equal(v2.targets.length, v1.targets.length);
  assert.ok(v2.moved > 1);
  assert.equal(v2.moved, v1.moved);
  assert.equal(v2.towerDamage, v1.towerDamage);
});

test('approachOutOfRange: an ability aimed beyond the sim\'s range for it becomes a move to the target', () => {
  const range = Object.fromEntries(Object.values(h.INSTRUMENTS).flatMap((d) => d.abilities.map((a) => [a.name, a.range])));
  const obs = (instrument, gap, kind = 'bearbot') => ({
    self: { id: 'bearbot-1', instrument, pos: { x: 100, y: 500 }, cooldowns: {} },
    allies: [], nearbyMinions: [], nearbyTowers: [],
    visibleEnemies: [{ id: 'e-9', pos: { x: 100 + gap, y: 500 }, hp: 50, maxHp: 100, kind }],
  });
  const cast = (ability, target = 'e-9') => ({ kind: 'ability', ability, target });
  for (const [instrument, ability] of [['keytar', 'chord'], ['violin', 'staccato'], ['drums', 'kick']]) {
    const r = range[ability];
    assert.deepEqual(h.approachOutOfRange(cast(ability), obs(instrument, r)), cast(ability), `${ability} at exactly its range casts`);
    assert.deepEqual(h.approachOutOfRange(cast(ability), obs(instrument, r + 1)), { kind: 'move', target: { x: 101 + r, y: 500 } }, `${ability} beyond it walks`);
  }
  // a point target (chord's aoe can be aimed at one) is measured the same way
  assert.deepEqual(h.approachOutOfRange(cast('chord', { x: 100, y: 700 }), obs('keytar', 0)), { kind: 'move', target: { x: 100, y: 700 } });
  // range 0 never checks one; an unlisted target, no target, or not an ability is the sim's as before
  for (const [instrument, ability] of [['drums', 'fill'], ['keytar', 'glissando'], ['violin', 'solo']]) {
    assert.equal(range[ability], 0);
    assert.deepEqual(h.approachOutOfRange(cast(ability), obs(instrument, 250)), cast(ability));
  }
  assert.deepEqual(h.approachOutOfRange(cast('chord', 'e-404'), obs('keytar', 250)), cast('chord', 'e-404'));
  assert.deepEqual(h.approachOutOfRange({ kind: 'ability', ability: 'chord' }, obs('keytar', 250)), { kind: 'ability', ability: 'chord' });
  assert.deepEqual(h.approachOutOfRange({ kind: 'attack', target: 'e-9' }, obs('keytar', 250)), { kind: 'attack', target: 'e-9' });
});

/**
 * The ability-reach gap (runs/vocab2-ability-range-2026-10-02.md): violet's keytar stands `gap` units
 * from green's keytar, away from every lane and tower, and a schema server answers every ask with
 * "chord the enemy bearbot". The real schema pilot plays it under `vocab`; everyone else holds.
 */
async function chordAt(vocab, gap, seconds = 6) {
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const ask = JSON.parse(body);
      const foe = ask.observation.visibleEnemies.find((e) => e.kind === 'bearbot');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ action: { kind: 'ability', ability: 'chord', ...(foe ? { target: foe.id } : {}) }, rule: 'chord', answers: {}, ms: 1, targeting: ask.targeting, vocab: ask.vocab }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const pilot = h.jevSchemaTracingPilot({ endpoint: `http://127.0.0.1:${srv.address().port}/`, schemas: vocab === 'vocab-2' ? vocab2Schemas() : vocab1Schemas() });
  const played = [];
  let asking = null;
  const hold = () => ({ decide: async () => ({ kind: 'hold' }) });
  const caster = () => ({
    decide: async (obs) => {
      asking = pilot.decide(obs);
      const { action } = await asking;
      played.push(action.kind);
      return action;
    },
  });
  const roster = ['violet', 'green'].flatMap((team) => [['top', 'drums'], ['mid', 'keytar'], ['bottom', 'violin']].map(([lane, instrument]) => ({
    team, lane, instrument, pilotKind: 'scripted', makePilot: team === 'violet' && instrument === 'keytar' ? caster : hold,
  })));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  const bot = match.bearbots.find((b) => b.team === 'violet' && b.instrument === 'keytar');
  const foe = match.bearbots.find((b) => b.team === 'green' && b.instrument === 'keytar');
  // the top-left jungle: 165 from the top lane, 212 from mid, no tower within 300
  const off = gap / 2 / Math.SQRT2;
  bot.pos = { x: 350 - off, y: 350 + off };
  foe.pos = { x: 350 + off, y: 350 - off };
  const start = { ...bot.pos };
  let casts = 0;
  for (let t = 1; t <= seconds / h.TICK_DT && !match.ended; t++) {
    const before = bot.cooldowns.chord;
    match.tick(h.TICK_DT);
    if (bot.cooldowns.chord > before) casts += 1;
    while (asking) {
      const was = asking;
      await was;
      if (asking === was) asking = null;
    }
    await flush();
  }
  srv.close();
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return { played, casts, moved: d(bot.pos, start), left: d(bot.pos, foe.pos), range: h.INSTRUMENTS.keytar.abilities.find((a) => a.name === 'chord').range };
}

test('vocab-2 "chord the enemy" from 240 units out: the keytar walks into chord\'s range and casts; vocab-1 stands still as before', async () => {
  const v2 = await chordAt('vocab-2', 240);
  assert.ok(v2.played.includes('move') && v2.played.includes('ability'), JSON.stringify(v2.played));
  assert.ok(v2.left <= v2.range, `ends in chord's range (${v2.left.toFixed(1)} from the target)`);
  assert.ok(v2.casts > 0, 'and casts it');
  const v1 = await chordAt('vocab-1', 240);
  assert.deepEqual([...new Set(v1.played)], ['ability'], 'vocab-1 plays the server\'s action as it comes');
  assert.ok(v1.moved < 1, 'and stands still');
  assert.equal(v1.casts, 0, 'casting nothing');
});

test('vocab-2 "chord the enemy" inside its range plays as vocab-1 does', async () => {
  const [v2, v1] = [await chordAt('vocab-2', 150, 2), await chordAt('vocab-1', 150, 2)];
  assert.deepEqual([...new Set(v2.played)], ['ability']);
  assert.deepEqual(v2.played, v1.played);
  assert.equal(v2.casts, 1);
  assert.equal(v1.casts, 1);
  assert.equal(v2.moved, 0);
  assert.equal(v1.moved, 0);
});

test('fight_samples: every bearbot in a sampled fight has its hp read back 5 s later', async () => {
  const { log } = checkedInLogs().find(({ f }) => f.includes('economy-p1-smoke') && f.includes('m3'));
  const rows = await samplesFromLog(h, log, { everySec: 2, horizonSec: 5 });
  assert.ok(rows.length > 20, `${rows.length} samples`);
  for (const r of rows) {
    assert.ok(r.obs.visibleEnemies.some((e) => e.kind === 'bearbot'));
    for (const id of [r.obs.self.id, ...r.obs.allies.map((a) => a.id)]) assert.equal(typeof r.future[id], 'number', id);
    assert.deepEqual(r.map?.name, 'pvp-1');
  }
});
