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
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_HOUSE_FILES = [
  { violet: 'prompts/pilots/house-violet.md', green: 'prompts/pilots/house-green.md' },
  'prompts/pilots/house.md',
  'prompts/pilots/drums.md',
];

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
