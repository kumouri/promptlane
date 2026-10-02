/**
 * The house bot's prompt files (spec §3.5, ruling Q13).
 *
 * `config.house.files` is an ordered list of candidates. A candidate is either one file — the same
 * prompt drives both sides — or a `{violet, green}` pair, one prompt per side: the ruled test model
 * (`qwen3.5:9b`) cannot compare an observation field against its own team, so the stronger house
 * prompt carries its team as a literal and comes as `house-violet.md` / `house-green.md`
 * (`runs/house-prompt-2026-09-21.md`). The first candidate whose files all exist wins.
 *
 * A pair is stored in the prompt store as ONE text (both files behind side markers) under one
 * hash, so the ledger's `house` row, the placement plan and the Elo fold keep their single house
 * ref; the queue splits the side it needs out when it builds a job, and the match log's
 * `promptText` is the side's own text, as for any pilot.
 *
 * Tiers (`runs/house-tiers-2026-09-30.md`): three house pairs that differ by strategy, not stats --
 * easy (defend, recall early), medium (today's wave-rider, the placement bar), hard (towers with the
 * wave, finish low-hp bearbots). `config.house.tier` picks one instead of `files`; unset, the house
 * is medium exactly as before, so the fixed-1000 placement bar does not move.
 *
 * On Jev (a `jev-schema-http` tournament backend, docs/arena-site-spec.md §9) the house plays its
 * tier's COMPILED schemas, `prompts/pilots/house-<tier>.schemas.json` -- the cascades the tiers were
 * measured with on Jev (`runs/house-tiers-2026-09-30.md`), checked in and fixed, so the placement bar
 * is not re-sampled on every restart. `config.house.schemas` names another file instead.
 *
 * Under an economy (`tournament.economy`, `npm run match --economy`) each tier plays its
 * ECONOMY-AWARE version instead (docs/economy-spec.md §4.4, §13.2): the same strategy plus a declared
 * shopping list and, for medium and hard, a recall-to-shop rule (hard also spends before a losing
 * fight and hunts the enemy worth the most gold). All three are prose (`house-<tier>-eco.prose.md`),
 * one file for both sides, and their compiles are `house-<tier>-eco.schemas.json`. Medium moved from its
 * worksheet pair (`house-eco-{violet,green}.md`) to vocab-2 prose on 2026-10-02, so the placement bar
 * plays the siege habits a plain entrant does (runs/siege-fact-medium-bar-2026-10-02.md); the worksheet
 * pair and its compile (`house-medium-eco-worksheet.schemas.json`) stay for `measure_economy.mjs`.
 * With no economy, nothing here changes.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const pair = (stem) => ({ violet: `prompts/pilots/${stem}-violet.md`, green: `prompts/pilots/${stem}-green.md` });

export const HOUSE_TIERS = { easy: pair('house-easy'), medium: pair('house'), hard: pair('house-hard') };
export const DEFAULT_HOUSE_TIER = 'medium';
/** The economy-aware tiers: a {violet, green} pair or one prose file for both sides. */
export const HOUSE_TIERS_ECO = {
  easy: 'prompts/pilots/house-easy-eco.prose.md',
  medium: 'prompts/pilots/house-medium-eco.prose.md',
  hard: 'prompts/pilots/house-hard-eco.prose.md',
};
/** Each tier's prose compiled for Jev ({drums, keytar, violin}; `npm run match --a-schemas` shape). */
export const HOUSE_TIER_SCHEMAS = Object.fromEntries(Object.keys(HOUSE_TIERS).map((t) => [t, `prompts/pilots/house-${t}.schemas.json`]));
export const HOUSE_TIER_ECO_SCHEMAS = Object.fromEntries(Object.keys(HOUSE_TIERS_ECO).map((t) => [t, `prompts/pilots/house-${t}-eco.schemas.json`]));
const INSTRUMENTS = ['drums', 'keytar', 'violin'];

export const DEFAULT_HOUSE_FILES = [HOUSE_TIERS[DEFAULT_HOUSE_TIER], 'prompts/pilots/house.md', 'prompts/pilots/drums.md'];

/** A tier's {violet, green} pair; throws on an unknown tier name. */
export function tierPair(tier) {
  if (!Object.hasOwn(HOUSE_TIERS, tier)) throw new Error(`house tier must be one of ${Object.keys(HOUSE_TIERS).join(', ')}, got ${JSON.stringify(tier)}`);
  return HOUSE_TIERS[tier];
}

/** A tier's candidate: its pair, or under an economy (any non-null `economy`) its economy-aware candidate. */
export function tierCandidate(tier, economy = null) {
  const plain = tierPair(tier);
  return economy == null ? plain : HOUSE_TIERS_ECO[tier];
}

/**
 * The match CLI's shorthand: `house` or `house:<tier>` → that tier's file for `side` (so the house
 * plays its own side's literals wherever it is placed; under an economy, the tier's economy-aware
 * file); any other string is not a house spec → null.
 */
export function houseSpecFile(spec, side, economy = null) {
  const m = /^house(?::(.*))?$/.exec(spec);
  if (!m) return null;
  const candidate = tierCandidate(m[1] ?? DEFAULT_HOUSE_TIER, economy);
  return typeof candidate === 'string' ? candidate : candidate[side];
}

/**
 * `config.house` → its candidate list. `tier` names exactly one pair (no silent fallback: a missing
 * tier file fails startup); `files` is the explicit list; neither is the default list. Both is an error.
 * Under an economy (`tournament.economy` non-null) a tier, or the default, is its economy-aware
 * candidate; an explicit `files` list is taken as written.
 */
export function houseCandidates(house = {}, economy = null) {
  const tier = house?.tier ?? null;
  const files = house?.files ?? null;
  if (tier !== null && files !== null) throw new Error('config.house: set tier or files, not both');
  if (tier !== null) return [tierCandidate(tier, economy)];
  if (files) return files;
  return economy == null ? DEFAULT_HOUSE_FILES : [tierCandidate(DEFAULT_HOUSE_TIER, economy), ...DEFAULT_HOUSE_FILES];
}

const SIDES = ['violet', 'green'];
const mark = (side) => `<!-- house side: ${side} -->\n`;

/** Files a candidate names, in side order for a pair. */
export function candidateFiles(candidate) {
  if (typeof candidate === 'string') return [candidate];
  if (candidate && SIDES.every((s) => typeof candidate[s] === 'string')) return SIDES.map((s) => candidate[s]);
  throw new Error(`config.house.files: a candidate is a file path or {violet, green}, got ${JSON.stringify(candidate)}`);
}

/** Display label for a candidate: the file, or `a + b` for a pair. */
export function candidateLabel(candidate) {
  return candidateFiles(candidate).join(' + ');
}

/** The first candidate whose files all exist under `root`, or null. */
export function pickHouse(candidates, root, exists = existsSync) {
  return candidates.find((c) => candidateFiles(c).every((f) => exists(path.join(root, f)))) ?? null;
}

/** One text for the prompt store: the file itself, or both sides of a pair behind markers. */
export function bundleHouse(candidate, root, read = (f) => readFileSync(f, 'utf8')) {
  const files = candidateFiles(candidate);
  if (files.length === 1) return read(path.join(root, files[0]));
  return SIDES.map((side, i) => mark(side) + read(path.join(root, files[i]))).join('\n');
}

/**
 * The schema file the house plays on Jev: `house.schemas` if set, else the tier (plain or
 * economy-aware) whose candidate is the picked one (so a `files` list whose first pair is medium's
 * still finds medium's schemas), else null -- a single-file house (`house.md`, `drums.md`) has no
 * checked-in compile.
 */
export function houseSchemasFile(house = {}, candidate = null) {
  if (house?.schemas) return house.schemas;
  if (!candidate) return null;
  const same = (c) => (typeof c === 'string' || typeof candidate === 'string' ? c === candidate : c.violet === candidate.violet && c.green === candidate.green);
  const tier = Object.keys(HOUSE_TIERS).find((t) => same(HOUSE_TIERS[t]));
  if (tier) return HOUSE_TIER_SCHEMAS[tier];
  const ecoTier = Object.keys(HOUSE_TIERS_ECO).find((t) => same(HOUSE_TIERS_ECO[t]));
  return ecoTier ? HOUSE_TIER_ECO_SCHEMAS[ecoTier] : null;
}

/** `{schemas: {drums, keytar, violin}, hash}` from a schema file; throws unless all three are there. */
export function loadHouseSchemas(file, root, read = (f) => readFileSync(f, 'utf8')) {
  const text = read(path.join(root, file));
  const schemas = JSON.parse(text);
  const missing = INSTRUMENTS.filter((i) => !Array.isArray(schemas?.[i]?.rules));
  if (missing.length) throw new Error(`house schemas ${file}: no compiled schema for ${missing.join(', ')}`);
  return { schemas: Object.fromEntries(INSTRUMENTS.map((i) => [i, schemas[i]])), hash: createHash('sha256').update(text).digest('hex') };
}

/** The prompt text the given side plays: the bundle's half, or an unbundled text unchanged. */
export function houseTextForSide(text, side) {
  if (!SIDES.includes(side)) throw new Error(`side must be violet or green, got ${side}`);
  if (!text.startsWith(mark('violet'))) return text;
  const greenAt = text.indexOf('\n' + mark('green'));
  if (greenAt < 0) throw new Error('house bundle has a violet side but no green side');
  const violet = text.slice(mark('violet').length, greenAt);
  const green = text.slice(greenAt + 1 + mark('green').length);
  return side === 'violet' ? violet : green;
}
