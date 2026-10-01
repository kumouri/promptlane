import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  DEFAULT_HOUSE_FILES, DEFAULT_HOUSE_TIER, HOUSE_TIERS, HOUSE_TIERS_ECO, HOUSE_TIER_ECO_SCHEMAS, HOUSE_TIER_SCHEMAS, bundleHouse, candidateFiles, candidateLabel, houseCandidates,
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

/** A checked-in {violet, green} pair bundles from disk, and its green side is its violet side with the team literals swapped. */
function assertMirroredPair(pair, root, label) {
  const bundle = bundleHouse(pair, root);
  const violet = houseTextForSide(bundle, 'violet');
  const green = houseTextForSide(bundle, 'green');
  assert.ok(violet.startsWith('You are a VIOLET bearbot'), label);
  assert.ok(green.startsWith('You are a GREEN bearbot'), label);
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
  assert.equal(towerIds(swapped), towerIds(violet), `${label}: green is violet with the team literals swapped`);
}

test('tiers: every checked-in pair exists, bundles, and its sides differ only in team literals', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const [tier, pair] of Object.entries(HOUSE_TIERS)) {
    assert.deepEqual(pickHouse(houseCandidates({ tier }), root), pair, tier);
    assertMirroredPair(pair, root, tier);
  }
});

test('economy: a tier (or the default) plays its economy-aware version; no economy changes nothing', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const tier of Object.keys(HOUSE_TIERS)) {
    assert.deepEqual(houseCandidates({ tier }), [HOUSE_TIERS[tier]], `${tier} without an economy`);
    assert.deepEqual(houseCandidates({ tier }, 'eco-2'), [HOUSE_TIERS_ECO[tier]], `${tier} with an economy`);
    assert.deepEqual(pickHouse(houseCandidates({ tier }, 'eco-2'), root), HOUSE_TIERS_ECO[tier], `${tier} eco files exist`);
  }
  assert.equal(houseCandidates({}), DEFAULT_HOUSE_FILES);
  assert.deepEqual(houseCandidates({}, 'eco-2'), [HOUSE_TIERS_ECO.medium, ...DEFAULT_HOUSE_FILES]);
  assert.deepEqual(houseCandidates({ files: ['prompts/pilots/drums.md'] }, 'eco-2'), ['prompts/pilots/drums.md'], 'an explicit list is taken as written');
  // the match CLI's shorthand
  assert.equal(houseSpecFile('house', 'violet'), PAIR.violet);
  assert.equal(houseSpecFile('house', 'green', 'eco-2'), 'prompts/pilots/house-eco-green.md');
  assert.equal(houseSpecFile('house:hard', 'violet', 'eco-2'), 'prompts/pilots/house-hard-eco.prose.md');
  assert.equal(houseSpecFile('house:hard', 'green', 'eco-2'), 'prompts/pilots/house-hard-eco.prose.md', 'prose has no team literals: one file for both sides');
  assert.equal(houseSpecFile('house:easy', 'green', null), 'prompts/pilots/house-easy-green.md');
  assertMirroredPair(HOUSE_TIERS_ECO.medium, root, 'medium eco');
});

test('economy: the eco medium worksheet declares gold, next and home before the original five keys', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const violet = houseTextForSide(bundleHouse(HOUSE_TIERS_ECO.medium, root), 'violet');
  assert.match(violet, /"gold": self\.gold/);
  assert.match(violet, /"next": self\.nextItem\.cost, or null when self\.nextItem is null/);
  assert.match(violet, /"home": self\.atShop/);
  assert.match(violet, /The object starts with "hp","gold","next","home","wave","tower","foe","cd","stand"\./);
  // recall-2: step out of an enemy tower's reach before the shopping recall's channel
  assert.match(violet, /\n4\. you can afford your next item \(gold is next or more\), no enemy bearbot or minion is in sight and an enemy tower is in sight -> get out of reach before you shop: "kind":"move","target":\{"x":100,"y":900\}/);
  assert.match(violet, /\n5\. you can afford your next item \(gold is next or more\) and no enemy is in sight -> go home to shop: "kind":"recall"/);
  // the plain medium's Bandstand rule (PR #53), word for word, in the same place
  const plain = houseTextForSide(bundleHouse(HOUSE_TIERS.medium, root), 'violet');
  const standRule = (s) => s.replaceAll('\r\n', '\n').split('\n').find((l) => l.startsWith('3. stand is "open"'));
  assert.ok(standRule(plain));
  assert.equal(standRule(violet), standRule(plain));
});

test('economy: the eco tiers play exactly the plain tiers\' Bandstand rules, right after the low-hp recall', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const tier of ['easy', 'medium', 'hard']) {
    const plain = loadHouseSchemas(HOUSE_TIER_SCHEMAS[tier], root).schemas;
    const eco = loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS[tier], root).schemas;
    for (const inst of ['drums', 'keytar', 'violin']) {
      const stand = (s) => s[inst].rules.filter((r) => r.action_target_selector === 'bandstand');
      assert.deepEqual(stand(eco), stand(plain), `${tier} ${inst}`);
      // rules 1-2 are the low-hp pair (out of reach, then recall)
      assert.deepEqual(eco[inst].rules.slice(2, 2 + stand(plain).length), stand(plain), `${tier} ${inst}: right after the recall`);
    }
  }
});

test('economy: each eco tier has checked-in compiled schemas that buy deliberately', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  for (const tier of Object.keys(HOUSE_TIERS_ECO)) {
    const file = houseSchemasFile({}, HOUSE_TIERS_ECO[tier]);
    assert.equal(file, HOUSE_TIER_ECO_SCHEMAS[tier], tier);
    assert.equal(houseSchemasFile({ tier }, HOUSE_TIERS_ECO[tier]), HOUSE_TIER_ECO_SCHEMAS[tier]);
    const { schemas } = loadHouseSchemas(file, root);
    for (const [inst, s] of Object.entries(schemas)) {
      const label = `${tier} ${inst}`;
      assert.equal(s.instrument, inst, label);
      // every tier declares a shopping list in its prose, and it compiled
      assert.ok(Array.isArray(s.build) && s.build.length === 3, `${label}: a declared three-item build`);
      const recalls = s.rules.filter((r) => r.action_kind === 'recall');
      // easy shops only when it is home anyway (low-hp recall, respawn); medium and hard also recall to shop.
      // Hard's "carrying 300 with a stronger enemy in sight" leaves on foot: an enemy in sight would break a recall-2 channel.
      assert.equal(recalls.length, { easy: 1, medium: 2, hard: 2 }[tier], `${label}: recall rules`);
      const afterStand = 2 + s.rules.filter((r) => r.action_target_selector === 'bandstand').length;
      if (tier !== 'easy') {
        assert.equal(s.rules[afterStand].action_target_selector, 'home', `${label}: the shopping trip first leaves reach, right after the low-hp pair and the Bandstand rules`);
        assert.equal(s.rules[afterStand + 1].action_kind, 'recall', `${label}: then the shopping recall`);
      }
    }
    if (tier === 'hard') {
      for (const s of Object.values(schemas)) assert.ok(s.rules.some((r) => r.action_target_selector === 'highest_bounty_enemy'), `hard ${s.instrument} hunts the carrier`);
    }
  }
  // the non-economy tiers are untouched: still no build, still their own files
  for (const tier of Object.keys(HOUSE_TIERS)) assert.equal(houseSchemasFile({ tier }, HOUSE_TIERS[tier]), HOUSE_TIER_SCHEMAS[tier]);
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
    // rules 1-2: the low-hp pair (out of reach, then recall; the recall-2 tests below)
    assert.match(medium[0], /^1\. hp less than 75 and an enemy bearbot, minion or tower is in sight -> get out of reach before you recall: /);
    assert.match(medium[1], /^2\. hp less than 75 and no enemy is in sight -> "kind":"recall"$/);
    assert.equal(medium[2], `3. stand is "open", foe is null or a minion, and hp is more than 50% of self.maxHp -> go to the Bandstand: ${MOVE_TO_STAND}`);
    assert.equal(medium.filter((l) => l.includes('bandstand.pos')).length, 1);
    assert.match(medium.at(-1), /^9\. otherwise wait for the next wave at home/);
    const hard = ruleLines(sideText(HOUSE_TIERS.hard[side]));
    assert.match(hard[0], /^1\. hp less than 65% of self\.maxHp, and tower, foe or creep is not null -> get out of reach before you recall: /);
    assert.match(hard[1], /^2\. hp less than 65% of self\.maxHp -> "kind":"recall"$/);
    assert.deepEqual(hard.slice(2, 5), [
      `3. stand is "open", foe is null and hp is more than 50% of self.maxHp -> go to the Bandstand: ${MOVE_TO_STAND}`,
      `4. stand is "open", contested is true or standBar is less than 0, and hp is more than 40% of self.maxHp -> go to the Bandstand: ${MOVE_TO_STAND}`,
      `5. stand is "upcoming", standIn is 10 or less and standDist is less than 400 -> go to the Bandstand: ${MOVE_TO_STAND}`,
    ]);
    assert.equal(hard.filter((l) => l.includes('bandstand.pos')).length, 3);
    assert.match(hard.at(-1), /^13\. otherwise wait for the next wave at home/);
    // Every Bandstand rule names a stand status, so a match without the objective (stand null) never matches one.
    for (const l of [...medium, ...hard].filter((r) => r.includes('bandstand.pos'))) assert.match(l, /^\d+\. stand is "(open|upcoming)"/);
  }
});

// recall-2 (docs/economy-spec.md §9.10) is a 4 s channel any hit breaks, so no tier recalls into reach:
// every recall rule sits right after a move home that fires on the same trigger while an enemy is in sight.
const schemaFiles = () => [...Object.values(HOUSE_TIER_SCHEMAS), ...Object.values(HOUSE_TIER_ECO_SCHEMAS)];
const isMoveHome = (r) => r.action_kind === 'move' && r.action_target_selector === 'home';

test('recall-2: every tier\'s compiled cascade steps out of reach before each recall', () => {
  for (const file of schemaFiles()) {
    const { schemas } = loadHouseSchemas(file, ROOT);
    for (const [inst, s] of Object.entries(schemas)) {
      const label = `${file} ${inst}`;
      assert.ok(isMoveHome(s.rules[0]), `${label}: rule 1 leaves on low hp`);
      assert.equal(s.rules[1].action_kind, 'recall', `${label}: rule 2 recalls on low hp`);
      s.rules.forEach((r, i) => {
        if (r.action_kind !== 'recall') return;
        assert.ok(i > 0 && isMoveHome(s.rules[i - 1]), `${label}: recall rule ${i + 1} follows a move home`);
        assert.match(r.condition, /\bno\b/i, `${label}: recall rule ${i + 1} asks that no enemy is in sight`);
      });
    }
  }
});

test('recall-2: the side files leave reach before each recall, and no example recalls with an enemy in sight', () => {
  for (const pair of [...Object.values(HOUSE_TIERS), HOUSE_TIERS_ECO.medium]) {
    for (const side of ['violet', 'green']) {
      const lines = ruleLines(sideText(pair[side]));
      const home = side === 'violet' ? '{"x":100,"y":900}' : '{"x":900,"y":100}';
      lines.forEach((l, i) => {
        if (!l.endsWith('"kind":"recall"')) return;
        assert.ok(i > 0 && lines[i - 1].includes(`get out of reach before you`) && lines[i - 1].endsWith(`"kind":"move","target":${home}`), `${pair[side]}: ${l}`);
        assert.match(l, /no enemy is in sight -> |^\d+\. hp less than \d+(% of self\.maxHp)? -> /, `${pair[side]}: ${l}`);
      });
      // every example reply that recalls has nothing hostile in its worksheet
      for (const ex of sideText(pair[side]).split('\n').filter((x) => x.startsWith('{"hp"'))) {
        const ws = JSON.parse(ex);
        if (ws.kind === 'recall') for (const k of ['tower', 'foe', 'creep']) assert.ok(ws[k] == null, `${pair[side]}: ${ex}`);
      }
    }
  }
});

// Hard leaves at 65 % of its max hp (drums 143, keytar 91, violin 97.5), not a flat 90: walking out under
// recall-2, 90 hp left hard drums dying in the lane (runs/bandstand-4-2026-10-01.md derives the number).
test('hard: the low-hp trigger is 65 % of max hp in the prose, both compiled cascades and both side files', () => {
  for (const file of ['prompts/pilots/house-hard.prose.md', 'prompts/pilots/house-hard-eco.prose.md']) {
    const prose = sideText(file).replace(/\s+/g, ' ');
    assert.match(prose, /When your hp is below 65% of your max hp and an enemy minion, enemy tower or enemy bearbot is in sight, move back home\. When your hp is below 65% of your max hp and no enemy is in sight, recall home to heal\./, file);
    assert.doesNotMatch(prose, /below 90/, file);
  }
  for (const file of [HOUSE_TIER_SCHEMAS.hard, HOUSE_TIER_ECO_SCHEMAS.hard]) {
    for (const [inst, s] of Object.entries(loadHouseSchemas(file, ROOT).schemas)) {
      for (const r of s.rules.slice(0, 2)) {
        assert.match(r.condition, /\bhp below 65% of its max hp\b/, `${file} ${inst}: ${r.condition}`);
        assert.doesNotMatch(r.condition, /\b90\b/, `${file} ${inst}: ${r.condition}`);
      }
    }
  }
  for (const side of ['violet', 'green']) {
    const home = side === 'violet' ? '{"x":100,"y":900}' : '{"x":900,"y":100}';
    // every example that does not head home has hp above 65 % of the largest max (drums, 220), so it holds on every instrument
    for (const ex of sideText(HOUSE_TIERS.hard[side]).split('\n').filter((x) => x.startsWith('{"hp"'))) {
      const ws = JSON.parse(ex);
      if (ws.kind === 'recall' || (ws.kind === 'move' && JSON.stringify(ws.target) === home)) continue;
      assert.ok(ws.hp >= 0.65 * 220, `${side}: ${ex}`);
    }
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
