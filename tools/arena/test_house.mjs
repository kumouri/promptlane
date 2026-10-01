import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  DEFAULT_HOUSE_FILES, DEFAULT_HOUSE_TIER, HOUSE_TIERS, HOUSE_TIER_SCHEMAS, bundleHouse, candidateFiles, candidateLabel, houseCandidates,
  houseSchemasFile, houseSpecFile, houseTextForSide, loadHouseSchemas, pickHouse,
} from './house.mjs';
import { DEFAULT_CONFIG, loadConfig } from './server.mjs';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { loadHeadless } from '../match/load.mjs';

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

// The Bandstand (docs/economy-spec.md §9.7): worksheet keys and rules per tier, in the side files.
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TIER_KEYS = {
  easy: ['hp', 'tower', 'foe', 'wave'],
  medium: ['hp', 'wave', 'tower', 'foe', 'cd', 'stand'],
  hard: ['hp', 'wave', 'tower', 'towerteam', 'foe', 'foehp', 'creep', 'cd', 'stand', 'standIn', 'standDist', 'standBar', 'contested'],
};
const MOVE_TO_STAND = '"kind":"move","target":{"x":<bandstand.pos.x>,"y":<bandstand.pos.y>}';
const sideText = (file) => readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n');
const ruleLines = (text) => text.split('\n').filter((l) => /^\d+\. /.test(l));

test('Bandstand: each tier pins its worksheet keys in the closing line and in every example reply', () => {
  for (const [tier, pair] of Object.entries(HOUSE_TIERS)) {
    for (const side of ['violet', 'green']) {
      const text = sideText(pair[side]);
      const starts = /The object starts with ((?:"\w+",?)+)\./.exec(text);
      assert.ok(starts, `${tier} ${side}: closing line`);
      assert.deepEqual(JSON.parse(`[${starts[1]}]`), TIER_KEYS[tier], `${tier} ${side}: closing line keys`);
      const examples = text.split('\n').filter((l) => l.startsWith('{"hp"'));
      assert.ok(examples.length >= 3, `${tier} ${side}: examples`);
      for (const ex of examples) assert.deepEqual(Object.keys(JSON.parse(ex)).slice(0, TIER_KEYS[tier].length), TIER_KEYS[tier], ex);
      for (const key of TIER_KEYS[tier].filter((k) => k.startsWith('stand') || k === 'contested')) {
        // Described like the other keys: what to read, then ", else null" (no bandstand block).
        assert.match(text, new RegExp(`^  "${key}": [^\\n]*(?:\\n {10,}[^\\n]*)*bandstand, else null$`, 'm'), `${tier} ${side}: ${key} described`);
      }
    }
  }
});

test('Bandstand: easy has no rule; medium has one and hard three, right after the low-hp recall', () => {
  for (const side of ['violet', 'green']) {
    const easy = sideText(HOUSE_TIERS.easy[side]);
    assert.doesNotMatch(easy, /bandstand|stand/i, 'easy stays easy');
    const medium = ruleLines(sideText(HOUSE_TIERS.medium[side]));
    assert.match(medium[0], /^1\. hp less than 75 -> "kind":"recall"$/);
    assert.equal(medium[1], `2. stand is "open", foe is null or a minion, and hp is more than 50% of self.maxHp -> go to the Bandstand: ${MOVE_TO_STAND}`);
    assert.equal(medium.filter((l) => l.includes('bandstand.pos')).length, 1);
    assert.match(medium.at(-1), /^8\. otherwise wait for the next wave at home/);
    const hard = ruleLines(sideText(HOUSE_TIERS.hard[side]));
    assert.match(hard[0], /^1\. hp less than 90 -> "kind":"recall"$/);
    assert.deepEqual(hard.slice(1, 4), [
      `2. stand is "open", foe is null and hp is more than 50% of self.maxHp -> go to the Bandstand: ${MOVE_TO_STAND}`,
      `3. stand is "open", contested is true or standBar is less than 0, and hp is more than 40% of self.maxHp -> go to the Bandstand: ${MOVE_TO_STAND}`,
      `4. stand is "upcoming", standIn is 10 or less and standDist is less than 400 -> go to the Bandstand: ${MOVE_TO_STAND}`,
    ]);
    assert.equal(hard.filter((l) => l.includes('bandstand.pos')).length, 3);
    assert.match(hard.at(-1), /^12\. otherwise wait for the next wave at home/);
    // Every Bandstand rule names a stand status, so a match without the objective (stand null) never matches one.
    for (const l of [...medium, ...hard].filter((r) => r.includes('bandstand.pos'))) assert.match(l, /^\d+\. stand is "(open|upcoming)"/);
  }
});

// The Jev house pilot (tools/match/jevPilot.ts) against a local stub of house_server.py.
const PRE_BANDSTAND_BODY_KEYS = ['hp', 'wave', 'tower', 'foe', 'foeKind', 'foeHp', 'cd', 'instrument', 'team', 'tick', 'clockSec'];
const STAND_POS = { x: 300, y: 300 };

function observation({ hp = 120, maxHp = 140, instrument = 'keytar', enemies = [], bandstand = null } = {}) {
  const obs = {
    clockSec: 90,
    self: { id: 'bb-1', team: 'violet', lane: 'mid', instrument, pos: { x: 400, y: 600 }, hp, maxHp, moveSpeed: 60, cooldowns: { chord: 2, staccato: 2, kick: 2 } },
    allies: [],
    visibleEnemies: enemies,
    nearbyMinions: [{ id: 'mn-1', team: 'violet', pos: { x: 420, y: 580 }, hp: 60, maxHp: 60 }],
    nearbyTowers: [],
  };
  if (!bandstand) return obs;
  obs.self.encoreSec = 0;
  obs.bandstand = { site: 'top-side', pos: STAND_POS, radius: 60, status: bandstand, opensInSec: bandstand === 'open' ? null : 8, progress: 0, contested: false, alliesOn: 0, selfOn: false };
  return obs;
}

/** A stub jev-house server: records each worksheet; answers `respond(body)` or 503 (-> decideByRules). */
async function withStub(respond, fn) {
  const bodies = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      const answer = respond?.(body);
      if (answer) res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(answer));
      else res.writeHead(503).end('{"error":"stub"}');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { jevTracingPilot } = await loadHeadless();
  const pilot = jevTracingPilot({ endpoint: `http://127.0.0.1:${server.address().port}/`, timeoutSec: 5 }, () => 42);
  const origError = console.error;
  console.error = () => {}; // every 503 is an expected "!!! FALLBACK" line
  try {
    return await fn(pilot, bodies);
  } finally {
    console.error = origError;
    server.close();
  }
}

test('Jev house pilot: without the objective the worksheet and decisions are exactly the pre-Bandstand ones', async () => {
  await withStub(null, async (pilot, bodies) => {
    const d = await pilot.decide(observation());
    assert.deepEqual(Object.keys(bodies[0]), PRE_BANDSTAND_BODY_KEYS);
    assert.deepEqual(d.action, { kind: 'move', target: { x: 420, y: 580 } }, 'rule 6: ride with the wave');
    const reply = JSON.parse(d.reply.replace(/^\[jev-fallback: [^\]]*\] /, ''));
    assert.equal(reply.rule, 6);
    assert.ok(!('stand' in reply) && !('maxHp' in reply));
  });
});

test('Jev house pilot: medium Bandstand rule -- stand open, no enemy bearbot, hp above half -> move to bandstand.pos', async () => {
  await withStub(null, async (pilot, bodies) => {
    const open = await pilot.decide(observation({ bandstand: 'open' }));
    assert.deepEqual(Object.keys(bodies[0]), [...PRE_BANDSTAND_BODY_KEYS, 'stand', 'maxHp']);
    assert.equal(bodies[0].stand, 'open');
    assert.equal(bodies[0].maxHp, 140);
    assert.deepEqual(open.action, { kind: 'move', target: STAND_POS });
    assert.equal(JSON.parse(open.reply.replace(/^\[jev-fallback: [^\]]*\] /, '')).rule, 8);
    // A minion foe does not stop it (keytar, cd 2: no ability).
    const minion = await pilot.decide(observation({ bandstand: 'open', enemies: [{ id: 'mn-9', pos: { x: 410, y: 590 }, hp: 30, maxHp: 60, kind: 'minion' }] }));
    assert.deepEqual(minion.action, { kind: 'move', target: STAND_POS });
    // Each condition, broken alone, falls through to the pre-Bandstand cascade.
    for (const status of ['closed', 'upcoming', 'done']) {
      assert.deepEqual((await pilot.decide(observation({ bandstand: status }))).action, { kind: 'move', target: { x: 420, y: 580 } }, status);
    }
    const bearbot = await pilot.decide(observation({ bandstand: 'open', enemies: [{ id: 'bb-5', pos: { x: 450, y: 600 }, hp: 130, maxHp: 140, kind: 'bearbot' }] }));
    assert.deepEqual(bearbot.action, { kind: 'attack', target: 'bb-5' });
    const halfHp = await pilot.decide(observation({ bandstand: 'open', instrument: 'drums', hp: 110, maxHp: 220 }));
    assert.deepEqual(halfHp.action, { kind: 'move', target: { x: 420, y: 580 } }, 'exactly half is not above half');
  });
});

test('Jev house pilot: a "bandstand" bucket from the server resolves to the bandstand position', async () => {
  await withStub(() => ({ bucket: 'bandstand', rule: 8, answers: {}, ms: 1 }), async (pilot) => {
    const d = await pilot.decide(observation({ bandstand: 'open' }));
    assert.deepEqual(d.action, { kind: 'move', target: STAND_POS });
    assert.equal(JSON.parse(d.reply).stand, 'open');
    // No bandstand in the observation: rule 7's move home, never a hold.
    assert.deepEqual((await pilot.decide(observation())).action, { kind: 'move', target: { x: 100, y: 900 } });
  });
});
