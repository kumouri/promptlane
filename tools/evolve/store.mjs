/**
 * The population store: one directory per campaign, plain JSON and Markdown, every write atomic
 * (temp file + rename) so a crash never leaves a half-written file that a resume would trust.
 *
 *   campaign.json               the pre-registered config (written once by `init`, never edited)
 *   state.json                  where the campaign is: next generation, epoch, opponents, survivors
 *   genomes/<id>.md             a prompt's prose (the genome); <id> = first 12 hex of its sha256
 *   genomes/<id>.json           its lineage: parent, generation, the one change that made it
 *   compiled/<id>.json          `compile.py --format json` output for it (the phenotype Jev plays)
 *   mutations/<slot>.json       a mutation's outcome, keyed by its deterministic slot id
 *   matches/<key>.json          the match log `npm run match` wrote (replayable, --verify-able)
 *   matches/<key>.result.json   that match's summary (score, stats, behaviour descriptors)
 *   gen-<n>.json                generation n: plan, progress phase, ranking, promotion decision
 *
 * Content addressing is what makes resume cheap: a genome's id is its hash, a match's key is a hash
 * of (both genome ids, seed, sides, shape), so "has this been done?" is "does the file exist?".
 * The default location, `runs/evolve/<name>/`, is git-ignored (`/runs/*\/`) like every per-run
 * directory; results worth keeping are written as flat files directly under `runs/`.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from './seeds.mjs';

export const STORE_VERSION = 1;

export function genomeId(prose) {
  return sha256(normalizeProse(prose)).slice(0, 12);
}

/** CRLF → LF and one trailing newline, so the same prose always hashes the same. */
export function normalizeProse(prose) {
  return String(prose).replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
}

export class Store {
  constructor(dir) {
    this.dir = path.resolve(dir);
  }

  path(...parts) {
    return path.join(this.dir, ...parts);
  }

  exists(...parts) {
    return existsSync(this.path(...parts));
  }

  readJson(rel, fallback = undefined) {
    const file = this.path(rel);
    if (!existsSync(file)) {
      if (fallback !== undefined) return fallback;
      throw new Error(`store: missing ${file}`);
    }
    return JSON.parse(readFileSync(file, 'utf8'));
  }

  readText(rel) {
    return readFileSync(this.path(rel), 'utf8');
  }

  writeText(rel, text) {
    const file = this.path(rel);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, file);
    return file;
  }

  writeJson(rel, data) {
    return this.writeText(rel, JSON.stringify(data, null, 1) + '\n');
  }

  // --- genomes ---------------------------------------------------------------------------------

  /** Save a genome (idempotent: the same prose is the same id and the first lineage record wins). */
  addGenome(prose, meta) {
    const text = normalizeProse(prose);
    const id = genomeId(text);
    if (!this.exists('genomes', `${id}.md`)) this.writeText(`genomes/${id}.md`, text);
    if (!this.exists('genomes', `${id}.json`)) this.writeJson(`genomes/${id}.json`, { id, sha256: sha256(text), ...meta });
    return id;
  }

  genomeText(id) {
    return this.readText(`genomes/${id}.md`);
  }

  genomeMeta(id) {
    return this.readJson(`genomes/${id}.json`);
  }

  genomePath(id) {
    return this.path('genomes', `${id}.md`);
  }

  compiledPath(id) {
    return this.path('compiled', `${id}.json`);
  }
}
