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
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const pair = (stem) => ({ violet: `prompts/pilots/${stem}-violet.md`, green: `prompts/pilots/${stem}-green.md` });

export const HOUSE_TIERS = { easy: pair('house-easy'), medium: pair('house'), hard: pair('house-hard') };
export const DEFAULT_HOUSE_TIER = 'medium';

export const DEFAULT_HOUSE_FILES = [HOUSE_TIERS[DEFAULT_HOUSE_TIER], 'prompts/pilots/house.md', 'prompts/pilots/drums.md'];

/** A tier's {violet, green} pair; throws on an unknown tier name. */
export function tierPair(tier) {
  if (!Object.hasOwn(HOUSE_TIERS, tier)) throw new Error(`house tier must be one of ${Object.keys(HOUSE_TIERS).join(', ')}, got ${JSON.stringify(tier)}`);
  return HOUSE_TIERS[tier];
}

/**
 * The match CLI's shorthand: `house` or `house:<tier>` → that tier's file for `side` (so the house
 * plays its own side's literals wherever it is placed); any other string is not a house spec → null.
 */
export function houseSpecFile(spec, side) {
  const m = /^house(?::(.*))?$/.exec(spec);
  return m ? tierPair(m[1] ?? DEFAULT_HOUSE_TIER)[side] : null;
}

/**
 * `config.house` → its candidate list. `tier` names exactly one pair (no silent fallback: a missing
 * tier file fails startup); `files` is the explicit list; neither is the default list. Both is an error.
 */
export function houseCandidates(house = {}) {
  const tier = house?.tier ?? null;
  const files = house?.files ?? null;
  if (tier !== null && files !== null) throw new Error('config.house: set tier or files, not both');
  if (tier !== null) return [tierPair(tier)];
  return files ?? DEFAULT_HOUSE_FILES;
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
