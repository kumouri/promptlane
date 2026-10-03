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
// The economy-aware medium's worksheet pair: the house's medium until 2026-10-02, kept for measure_economy.mjs.
const ECO_WORKSHEET = { violet: 'prompts/pilots/house-eco-violet.md', green: 'prompts/pilots/house-eco-green.md' };

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
  assert.equal(houseSpecFile('house', 'green', 'eco-2'), 'prompts/pilots/house-medium-eco.prose.md', 'medium is prose since 2026-10-02: one file for both sides');
  assert.equal(houseSpecFile('house:hard', 'violet', 'eco-2'), 'prompts/pilots/house-hard-eco.prose.md');
  assert.equal(houseSpecFile('house:hard', 'green', 'eco-2'), 'prompts/pilots/house-hard-eco.prose.md', 'prose has no team literals: one file for both sides');
  assert.equal(houseSpecFile('house:easy', 'green', null), 'prompts/pilots/house-easy-green.md');
  assertMirroredPair(ECO_WORKSHEET, root, 'the worksheet medium (measure_economy.mjs)');
});

test('economy: the worksheet eco medium declares gold, next and home before the original five keys', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const violet = houseTextForSide(bundleHouse(ECO_WORKSHEET, root), 'violet');
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

test('economy: easy plays exactly the plain tier\'s Bandstand rules; medium and hard none', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  // runs/siege-fact-medium-bar-2026-10-02.md: medium stays with its wave; on the stand-in, the Bandstand
  // right after the low-hp pair (old medium's place) cost hard its margin over medium. Hard is medium's
  // cascade plus one rule since runs/hard-above-medium-2026-10-02.md §3, so it has none either.
  for (const tier of ['medium', 'hard']) {
    for (const s of Object.values(loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS[tier], root).schemas)) {
      assert.ok(!s.rules.some((r) => r.action_target_selector === 'bandstand'), `${tier} ${s.instrument}: no Bandstand rule`);
    }
  }
  const plain = loadHouseSchemas(HOUSE_TIER_SCHEMAS.easy, root).schemas;
  const eco = loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.easy, root).schemas;
  for (const inst of ['drums', 'keytar', 'violin']) {
    const stand = (s) => s[inst].rules.filter((r) => r.action_target_selector === 'bandstand');
    assert.deepEqual(stand(eco), stand(plain), `easy ${inst}`);
    // rules 1-2 are the low-hp pair (out of reach, then recall)
    assert.deepEqual(eco[inst].rules.slice(2, 2 + stand(plain).length), stand(plain), `easy ${inst}: right after the recall`);
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
      // every tier declares a shopping list in its prose, and it compiled: the full late-game ladder
      assert.ok(Array.isArray(s.build) && s.build.length === 8, `${label}: a declared eight-step ladder`);
      assert.equal(s.economy, 'eco-3-late', `${label}: the build is checked against the late-game ruleset`);
      const recalls = s.rules.filter((r) => r.action_kind === 'recall');
      // Every tier recalls to shop. Easy only out of every enemy's sight, and it never walks home to shop
      // (runs/better-bots-2026-10-02.md); medium and hard first walk out of a tower's or minion's reach.
      // Hard's "carrying 300 with a stronger enemy in sight" leaves on foot: an enemy in sight would break a recall-2 channel.
      assert.equal(recalls.length, { easy: 2, medium: 2, hard: 2 }[tier], `${label}: recall rules`);
      // the first rule after the low-hp pair that isn't a Bandstand rule
      const afterStand = 2 + s.rules.slice(2).findIndex((r) => r.action_target_selector !== 'bandstand');
      if (tier === 'medium' || tier === 'hard') {
        // the shopping walk out of reach, then the shopping recall; the pair may come before the low-hp pair
        const walk = s.rules.findIndex((r) => /afford/.test(r.condition) && r.action_target_selector === 'home' && r.action_kind === 'move');
        assert.ok(walk >= 0, `${label}: the shopping trip first leaves reach`);
        assert.equal(s.rules[walk + 1].action_kind, 'recall', `${label}: then the shopping recall`);
        assert.match(s.rules[walk + 1].condition, /afford/, label);
      } else {
        assert.equal(s.rules[afterStand].action_kind, 'recall', `${label}: the shopping recall, right after the low-hp pair`);
        assert.match(s.rules[afterStand].condition, /afford the next item/, label);
        assert.match(s.rules[afterStand].condition, /no enem(y|ies)/, `${label}: only with no enemy in reach of the channel`);
      }
    }
  }
  // the non-economy tiers are untouched: still no build, still their own files
  for (const tier of Object.keys(HOUSE_TIERS)) assert.equal(houseSchemasFile({ tier }, HOUSE_TIERS[tier]), HOUSE_TIER_SCHEMAS[tier]);
});

test('late game: every eco tier climbs a full ladder under eco-3-late and plays its old three items under eco-3', async () => {
  const h = await loadHeadless();
  const late = h.resolveEconomy('eco-3-late');
  const eco3 = h.resolveEconomy('eco-3');
  const OLD_THREE = {
    easy: { drums: ['road-case', 'metronome', 'amp'], keytar: ['road-case', 'metronome', 'amp'], violin: ['road-case', 'metronome', 'amp'] },
    medium: { drums: ['road-case', 'bass-strings', 'metronome'], keytar: ['metronome', 'amp', 'road-case'], violin: ['amp', 'bass-strings', 'road-case'] },
    hard: { drums: ['road-case', 'bass-strings', 'metronome'], keytar: ['metronome', 'amp', 'road-case'], violin: ['amp', 'bass-strings', 'road-case'] }, // medium's ladder (runs/hard-above-medium-2026-10-02.md §3)
  };
  for (const tier of Object.keys(HOUSE_TIERS_ECO)) {
    for (const [inst, s] of Object.entries(loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS[tier], ROOT).schemas)) {
      const label = `${tier} ${inst}`;
      const { plan, notes } = h.expandBuild(late, inst, s.build);
      assert.deepEqual(plan, s.build, `${label}: the ladder is a plan as written`);
      assert.deepEqual(notes, [], label);
      assert.deepEqual(s.build.map((k) => h.itemTier(late, k)), [1, 1, 1, 2, 1, 3, 2, 3], `${label}: three items, a recipe, the fourth item, its upgrade, the second recipe and its upgrade`);
      assert.deepEqual(h.resolveBuild(eco3, inst, s.build), OLD_THREE[tier][inst], `${label}: under eco-3 the old three items, as before`);
      // Feedback + Wall of Sound heals 110 % of PvP damage (late-game spec §11); no house ladder holds both
      assert.ok(!(s.build.includes('feedback') && s.build.includes('wall-of-sound')), `${label}: not the uncapped lifesteal stack`);
    }
  }
  // medium is the default ladder, byte for byte
  for (const [inst, s] of Object.entries(loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.medium, ROOT).schemas)) assert.deepEqual(s.build, late.defaultBuilds[inst], `medium ${inst}`);
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
        // Easy's shopping recall (runs/better-bots-2026-10-02.md) has no walk home in front: with an enemy
        // in sight easy doesn't shop at all. Every other recall leaves reach first on the same trigger.
        const easyShop = /house-easy-eco/.test(file) && /afford/.test(r.condition);
        assert.ok(easyShop || (i > 0 && isMoveHome(s.rules[i - 1])), `${label}: recall rule ${i + 1} follows a move home`);
        assert.match(r.condition, /\bno\b/i, `${label}: recall rule ${i + 1} asks that no enemy is in sight`);
      });
    }
  }
});

test('recall-2: the side files leave reach before each recall, and no example recalls with an enemy in sight', () => {
  for (const pair of [...Object.values(HOUSE_TIERS), ECO_WORKSHEET]) {
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
// The economy-aware hard, the one the Jam plays, leaves at 50 % since 2026-10-02 (the next test).
test('hard: the low-hp trigger is 65 % of max hp in the plain prose, its compiled cascade and both side files', () => {
  const prose = sideText('prompts/pilots/house-hard.prose.md').replace(/\s+/g, ' ');
  assert.match(prose, /When your hp is below 65% of your max hp and an enemy minion, enemy tower or enemy bearbot is in sight, move back home\. When your hp is below 65% of your max hp and no enemy is in sight, recall home to heal\./);
  assert.doesNotMatch(prose, /below 90/);
  for (const [inst, s] of Object.entries(loadHouseSchemas(HOUSE_TIER_SCHEMAS.hard, ROOT).schemas)) {
    for (const r of s.rules.slice(0, 2)) {
      assert.match(r.condition, /\bhp below 65% of its max hp\b/, `${inst}: ${r.condition}`);
      assert.doesNotMatch(r.condition, /\b90\b/, `${inst}: ${r.condition}`);
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

// The economy-aware hard is the push-lane medium plus one rule (2026-10-02, runs/hard-above-medium-2026-10-02.md
// §3). #90's push-lane medium beat the old hard on Jev; the old hard with a weakened-tower rule still lost
// to it (§2). So hard plays medium's cascade, rule object for rule object, and finishes what its wave has
// worn down: an enemy tower in sight under 150 hp, right after the shopping pair. Its earlier shapes (the
// siege and 480-second rules of runs/better-bots-2026-10-02.md, hunting the carrier, punishing divers,
// the Bandstand) are in git history and in the run files that measured them.
test('hard (eco): medium`s cascade rule for rule, plus a weakened-tower rule after the shopping pair', () => {
  const prose = sideText(HOUSE_TIERS_ECO.hard).replace(/\s+/g, ' ');
  const medProse = sideText(HOUSE_TIERS_ECO.medium).replace(/\s+/g, ' ');
  assert.match(prose, /^You are the house band's hard bearbot/);
  assert.match(prose, /Take a weakened tower\. If an enemy tower in sight has less than 150 hp, attack the nearest enemy tower\./);
  // everything after the intro is medium's prose, word for word, plus the one new paragraph
  const body = (p) => p.slice(p.indexOf('A bearbot that dies'));
  assert.equal(body(prose).replace(' Take a weakened tower. If an enemy tower in sight has less than 150 hp, attack the nearest enemy tower.', ''), body(medProse));
  const medium = loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.medium, ROOT).schemas;
  for (const [inst, s] of Object.entries(loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.hard, ROOT).schemas)) {
    const label = `hard-eco ${inst}`;
    const m = medium[inst];
    assert.equal(s.vocab, 'vocab-2', label);
    const weak = s.rules[4];
    assert.match(weak.condition, /enemy tower in sight.*less than 150 hp/, `${label}: the weakened-tower rule, right after the shopping pair`);
    assert.deepEqual([weak.action_kind, weak.action_target_selector], ['attack', 'nearest_tower'], label);
    assert.equal(s.rules[3].action_kind, 'recall', `${label}: the shopping recall comes just before it`);
    assert.deepEqual(s.rules.filter((r) => r !== weak), m.rules, `${label}: every other rule is medium's, in medium's order`);
    assert.deepEqual(s.default_action, m.default_action, label);
    assert.deepEqual(s.build, m.build, `${label}: medium's ladder`);
    assert.equal(s.economy, m.economy, label);
  }
});

// runs/siege-fact-medium-bar-2026-10-02.md: the placement bar moved to vocab-2 prose with the habits that
// decided runs/better-bots-2026-10-02.md, so a plain siege entrant no longer clears it 5-1. Each instrument's
// cascade is one compile, taken whole (§1.2's screen); this pins what the screen checked.
test('medium (eco, vocab-2): the placement bar shops, closes out at 480 s, steps out of tower fire, sieges with its wave', () => {
  const prose = sideText(HOUSE_TIERS_ECO.medium).replace(/\s+/g, ' ');
  assert.match(prose, /so if it is more than 480 seconds into the match and you can see an enemy tower, attack the nearest enemy tower\./);
  assert.match(prose, /If an enemy tower will shoot you, fall back to your own tower\./);
  assert.match(prose, /Siege with your wave\. If you are inside an enemy tower's range and that tower has your own minions in its range to shoot first, attack the nearest enemy tower\./);
  assert.match(prose, /keytar only: If your ability is ready and an enemy bearbot is in sight, use your primary ability on the nearest enemy bearbot\./);
  // §4: the idle sentence pushes the lane (hard-eco's words), so the 480 s rush has an enemy tower in sight
  assert.match(prose, /Your fallback, when none of the above applies, is to push down your lane toward the enemy base\./);
  assert.doesNotMatch(prose, /outermost standing tower/);
  assert.doesNotMatch(prose, /Bandstand/);
  const sel = (r) => `${r.action_kind} ${r.action_target_selector}`;
  const PRIMARY = { drums: 'kick', keytar: 'chord', violin: 'staccato' };
  for (const [inst, s] of Object.entries(loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.medium, ROOT).schemas)) {
    const label = `medium-eco ${inst}`;
    assert.equal(s.vocab, 'vocab-2', label);
    const at = (pred, what) => {
      const i = s.rules.findIndex(pred);
      assert.ok(i >= 0, `${label}: ${what}`);
      return i;
    };
    const late = at((r) => /480/.test(r.condition) && sel(r) === 'attack nearest_tower', 'the 480-second rule');
    const shoot = at((r) => /enemy tower shoot/.test(r.condition) && sel(r) === 'move own_tower', 'out of a tower\'s fire');
    const siege = at((r) => /inside an enemy tower's range/.test(r.condition) && /own minions/.test(r.condition) && sel(r) === 'attack nearest_tower', 'the siege rule');
    const ability = at((r) => r.action_kind === 'ability' && r.action_ability === PRIMARY[inst], 'its own ability');
    const fight = at((r) => sel(r) === 'attack nearest_enemy_bearbot' && r.action_kind === 'attack', 'fight the nearest bearbot');
    const minion = at((r) => sel(r) === 'attack nearest_enemy_minion', 'then the nearest minion');
    const wave = at((r) => sel(r) === 'move nearby_minion', 'walk with the wave');
    assert.deepEqual([late, shoot, siege, ability, fight, minion, wave], [late, shoot, siege, ability, fight, minion, wave].slice().sort((a, b) => a - b), `${label}: in the prose's order`);
    assert.equal(s.rules[ability].action_target_selector, inst === 'keytar' ? 'nearest_enemy_bearbot' : 'lowest_hp_enemy', label);
    assert.ok(!s.rules.some((r) => r.action_target_selector === 'nearest_ally'), `${label}: the wave, never an ally`);
    assert.equal(s.rules.filter((r) => r.action_target_selector === 'home' || r.action_kind === 'recall').length, 4, `${label}: home only for low hp and shopping`);
    assert.equal(s.default_action.target_selector, 'push_lane', `${label}: pushes its lane when idle`);
    assert.ok(!s.rules.some((r) => r.action_target_selector === 'own_front_tower'), `${label}: never waits at its own front tower`);
  }
});

// runs/bots-push-to-base-2026-10-02.md: once an enemy inner tower is down the base tower can be hit, and its
// fall wins. Medium, hard and the siege entrant go for it right after stepping out of a tower's fire (so a
// tower with no minion of theirs to shoot still turns them back); easy never takes a tower, so never.
test('push to base (eco): medium, hard and the siege entrant attack the enemy base tower once it can be hit, after the fall-back; easy never', () => {
  const PUSH = /if the enemy base tower can be hit, attack the enemy base tower\./;
  const ENTRANT_PUSH = /when the enemy base tower can be hit, I attack the enemy base tower\./;
  const entrant = JSON.parse(readFileSync(path.join(ROOT, 'prompts/pilots/sample-entrant-siege.schemas.json'), 'utf8'));
  const entrantProse = readFileSync(path.join(ROOT, 'prompts/pilots/sample-entrant-siege.prose.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(entrantProse, ENTRANT_PUSH);
  const bots = {
    medium: [sideText(HOUSE_TIERS_ECO.medium), loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.medium, ROOT).schemas, PUSH],
    hard: [sideText(HOUSE_TIERS_ECO.hard), loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.hard, ROOT).schemas, PUSH],
    entrant: [entrantProse, entrant, ENTRANT_PUSH],
  };
  const medium = bots.medium[1];
  for (const [bot, [prose, schemas, sentence]] of Object.entries(bots)) {
    const flat = prose.replace(/\s+/g, ' ');
    assert.match(flat, sentence, `${bot}: the prose says it`);
    assert.ok(flat.search(/fall back to (your|my) own tower/) < flat.search(sentence), `${bot}: after the fall-back sentence`);
    for (const inst of ['drums', 'keytar', 'violin']) {
      const s = schemas[inst];
      const label = `${bot} ${inst}`;
      const push = s.rules.filter((r) => r.action_target_selector === 'enemy_base_tower');
      assert.equal(push.length, 1, `${label}: one push rule`);
      const i = s.rules.indexOf(push[0]);
      assert.equal(push[0].action_kind, 'attack', label);
      assert.match(push[0].condition, /^can the enemy base tower be hit/, `${label}: asks what vocab-2 states, not "can this bot hit it"`);
      assert.match(s.rules[i - 1].condition, /will an enemy tower shoot/, `${label}: right after the fall-back`);
      assert.match(s.rules[i + 1].condition, /inside an enemy tower's range/, `${label}: right before the siege`);
      assert.ok(s.rules.slice(0, i).some((r) => /480/.test(r.condition)), `${label}: the 8:00 close-out stays above it`);
      assert.equal(s.map, 'pvp-1-hp300-base700', `${label}: records the map its rule was compiled for`);
      if (bot === 'hard') assert.deepEqual(push[0], medium[inst].rules.find((r) => r.action_target_selector === 'enemy_base_tower'), `${label}: medium's rule object`);
    }
  }
  const easy = loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.easy, ROOT).schemas;
  assert.doesNotMatch(sideText(HOUSE_TIERS_ECO.easy), /base tower/);
  for (const s of Object.values(easy)) assert.ok(!s.rules.some((r) => r.action_target_selector === 'enemy_base_tower') && !('map' in s));
});

test('easy (eco, vocab-2): holds its lane at its own tower instead of leaving at the sight of an enemy tower', () => {
  const prose = sideText(HOUSE_TIERS_ECO.easy).replace(/\s+/g, ' ');
  assert.match(prose, /If you are inside an enemy tower's range, fall back to your own tower\./);
  assert.match(prose, /Your fallback, when none of the above applies, is to hold your lane at your own tower/);
  assert.doesNotMatch(prose, /If you can see an enemy tower or the enemy nexus, move back home/);
  // runs/better-bots-2026-10-02.md: easy spends its gold, out of every enemy's sight
  assert.match(prose, /When you can afford the next item on your shopping list and no enemy is in sight, recall home to buy it\./);
  assert.doesNotMatch(prose, /You never go home just to shop/);
  for (const [inst, s] of Object.entries(loadHouseSchemas(HOUSE_TIER_ECO_SCHEMAS.easy, ROOT).schemas)) {
    const label = `easy-eco ${inst}`;
    assert.equal(s.vocab, 'vocab-2', label);
    assert.deepEqual(s.rules.slice(2).map((r) => `${r.action_kind} ${r.action_target_selector}`),
      ['recall none', 'move own_tower', 'attack nearest_enemy_bearbot', 'attack nearest_enemy_minion'], label);
    assert.match(s.rules[3].condition, /inside an enemy tower's range/, label);
    assert.deepEqual(s.default_action, { kind: 'move', ability: null, target_selector: 'own_front_tower' }, `${label}: holds at its outer tower`);
    assert.ok(!s.rules.some((r) => r.action_kind === 'ability'), `${label}: still no abilities`);
  }
  // the plain easy (no economy, qwen side files) is still the vocab-1 tier
  for (const s of Object.values(loadHouseSchemas(HOUSE_TIER_SCHEMAS.easy, ROOT).schemas)) assert.equal(s.vocab, undefined);
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
