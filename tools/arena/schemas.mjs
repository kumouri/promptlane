/**
 * The ladder's compile step on Jev (docs/arena-site-spec.md §9): an entrant's prose becomes the rule
 * cascade Jev plays through the same `tools/jev/compile.py` the three entrant doors run
 * (docs/entrant-compile-preview.md), once per prompt and compiler.
 *
 * A compile is sampled -- the same prose can compile to different rules -- so the ladder compiles a
 * prompt ONCE and every match it plays uses that one result: its placements, its tests and its
 * bracket matches all play the same rules, and a restart does not re-roll them. The cache is on disk,
 * `runs/arena/schemas/<prompt sha256>.<compiler version>.json`, keyed by:
 *   - the prompt's content hash (`prompts.mjs hashPrompt`) -- not the handle, so two entrants (or a
 *     scratch test of merged prose) with the same text share one compile;
 *   - the compiler version: a hash of the translator's source files plus the compile backend and
 *     model. Changing the translator, or the model it runs on, is a new compiler, and every prompt
 *     compiles again on its next match. Nothing older is deleted; it is simply no longer read.
 *
 * Only a compile in which all three instruments produced a schema is cached. A failure throws
 * `CompileFailed`, which the queue turns into a visible `failed` match (and one retry) -- never a
 * fallback to a text-model pilot.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COMPILE_DEFAULTS, spawnCompile } from './compile.mjs';
import { hashPrompt } from './prompts.mjs';

/** The files whose content decides what a prose prompt compiles to (compile.py and what it imports). */
export const COMPILER_FILES = ['compile.py', 'translator.py', 'scenarios.py', 'number_normalize.py', 'ground_truth.py', 'llm_backends.py'];

export class CompileFailed extends Error {}

/**
 * 12 hex chars over the compiler's source files, backend and model. Line endings are normalised, so a
 * CRLF checkout (core.autocrlf) and an LF one agree.
 */
export function compilerVersion(root, cfg, read = (f) => readFileSync(f)) {
  const h = createHash('sha256');
  for (const f of COMPILER_FILES) {
    h.update(f + '\0');
    h.update(read(path.join(root, 'tools', 'jev', f)).toString('utf8').replace(/\r\n/g, '\n'));
    h.update('\0');
  }
  h.update(`${cfg.backend}\0${cfg.model ?? ''}`);
  return h.digest('hex').slice(0, 12);
}

/** `{drums, keytar, violin}` from one compiled prompt, or a CompileFailed naming what went wrong. */
export function schemasFromCompile(prompt) {
  const out = {};
  const bad = [];
  for (const inst of ['drums', 'keytar', 'violin']) {
    const e = prompt?.instruments?.[inst];
    if (e?.ok && e.schema) out[inst] = e.schema;
    else bad.push(`${inst}: ${e?.error ?? 'not compiled'}`);
  }
  if (bad.length) throw new CompileFailed(`compile failed — ${bad.join('; ')}`);
  return out;
}

/**
 * @param opts.dir      runs/arena/schemas
 * @param opts.root     the repo (for compile.py and the version hash)
 * @param opts.config   `config.compile` (backend, model, python, timeoutSec, maxTokensPerCompile)
 * @param opts.run      test seam: `(text) => Promise<{exitCode, data}>`, compile.py's JSON
 * @param opts.version  test seam: the compiler version
 */
export class SchemaCache {
  constructor({ dir, root, config = {}, run, version }) {
    this.dir = dir;
    this.cfg = { ...COMPILE_DEFAULTS, ...config };
    this.version = version ?? compilerVersion(root, this.cfg);
    this.run = run ?? spawnCompile({ root, cfg: this.cfg });
    this.inFlight = new Map();
  }

  fileFor(hash) {
    return path.join(this.dir, `${hash}.${this.version}.json`);
  }

  /**
   * The schemas `text` plays, compiling it if this compiler has not yet. Resolves to
   * `{schemas, hash, compilerVersion, cached, backend, usage}`; rejects with CompileFailed.
   */
  async schemasFor(text) {
    const hash = hashPrompt(text);
    const f = this.fileFor(hash);
    if (existsSync(f)) {
      const c = JSON.parse(readFileSync(f, 'utf8'));
      return { schemas: c.schemas, hash, compilerVersion: this.version, cached: true, backend: c.backend, usage: null };
    }
    if (!this.inFlight.has(hash)) {
      const p = this.compile(text, hash, f).finally(() => this.inFlight.delete(hash));
      this.inFlight.set(hash, p);
    }
    return this.inFlight.get(hash);
  }

  async compile(text, hash, f) {
    let out;
    try {
      out = await this.run(text);
    } catch (err) {
      throw new CompileFailed(`compile failed — ${err.message ?? err}`);
    }
    const prompt = out.data?.prompts?.[0];
    const schemas = schemasFromCompile(prompt);
    const usage = out.data?.usage ?? null;
    const record = { hash, compilerVersion: this.version, compiledAt: new Date().toISOString(), backend: out.data?.backend ?? null, usage, schemas, markdown: prompt.markdown ?? null };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(`${f}.tmp`, JSON.stringify(record) + '\n');
    renameSync(`${f}.tmp`, f);
    return { schemas, hash, compilerVersion: this.version, cached: false, backend: record.backend, usage };
  }
}
