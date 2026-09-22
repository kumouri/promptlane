/**
 * Prompt store for the arena (docs/arena-site-spec.md §3.2, ruling Q3): the entrants repo is the
 * record. Merged `entrants/<handle>/pilot.md` files are polled from GitHub (`gh api`) on `main`,
 * hashed (sha256 of the text) and cached under `runs/arena/prompts/<handle>/<hash>.md` so a
 * `{handle, hash}` PromptRef resolves without the network. Scratch prompts are validated with
 * the entrants validator's rules (ported from `tools/validate_entry.py`) and are never stored
 * anywhere but the match log that used them.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const HANDLE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const FENCE_RE = /^\s*(```|~~~)/m;
const URL_RE = /(https?:\/\/|www\.)/i;

export function isHandle(s) {
  return typeof s === 'string' && s.length <= 39 && HANDLE_RE.test(s);
}

/**
 * Same rules, same messages as `validate_text` in the entrants validator: non-empty, no code
 * fences, no URLs. There is no line or byte cap (ruling 2026-09-22: "one file, no code fences, no
 * URLs"); what bounds an oversized prompt is the model's context window — see
 * docs/arena-site-spec.md §5.1. Empty list = valid.
 */
export function validatePromptText(text) {
  const problems = [];
  if (typeof text !== 'string' || !text.trim()) {
    problems.push('file is empty');
    return problems;
  }
  if (FENCE_RE.test(text)) problems.push('contains a code fence (``` or ~~~)');
  if (text.includes('```') && !FENCE_RE.test(text)) problems.push('contains ``` (code fences are not allowed)');
  if (URL_RE.test(text)) problems.push('contains a URL');
  return problems;
}

export function hashPrompt(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function shortHash(hash) {
  return hash ? hash.slice(0, 8) : '—';
}

/** Content-addressed cache of merged prompt texts. */
export class PromptStore {
  constructor(dir) {
    this.dir = dir;
  }

  file(handle, hash) {
    return path.join(this.dir, handle, `${hash}.md`);
  }

  has(handle, hash) {
    return existsSync(this.file(handle, hash));
  }

  save(handle, text) {
    const hash = hashPrompt(text);
    const f = this.file(handle, hash);
    if (!existsSync(f)) {
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, text);
    }
    return hash;
  }

  read(handle, hash) {
    const f = this.file(handle, hash);
    if (!existsSync(f)) throw new Error(`prompt ${handle}@${shortHash(hash)} is not in the store`);
    return readFileSync(f, 'utf8');
  }
}

async function gh(args) {
  const { stdout } = await execFileP('gh', ['api', ...args], { maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  return stdout;
}

/**
 * List merged prompts on the entrants repo's ref: `[{handle, blobSha, commit, text}]`.
 * `known` maps blobSha → text so unchanged blobs are not re-fetched.
 */
export async function fetchEntrantsFromGitHub({ repo, ref = 'main' }, known = new Map(), run = gh) {
  const commit = JSON.parse(await run([`repos/${repo}/commits/${ref}`])).sha;
  const tree = JSON.parse(await run([`repos/${repo}/git/trees/${commit}?recursive=1`]));
  const out = [];
  for (const entry of tree.tree ?? []) {
    const m = /^entrants\/([^/]+)\/pilot\.md$/.exec(entry.path);
    if (!m || entry.type !== 'blob') continue;
    const handle = m[1];
    if (handle.startsWith('_') || !isHandle(handle)) continue;
    let text = known.get(entry.sha);
    if (text === undefined) {
      const blob = JSON.parse(await run([`repos/${repo}/git/blobs/${entry.sha}`]));
      text = Buffer.from(blob.content, blob.encoding ?? 'base64').toString('utf8');
    }
    out.push({ handle, blobSha: entry.sha, commit, text });
  }
  return out;
}

/** A local `entrants/<handle>/pilot.md` tree (dev and CI): same shape, no network. */
export function fetchEntrantsFromDir(dir) {
  const root = path.join(dir, 'entrants');
  if (!existsSync(root)) return [];
  const out = [];
  for (const handle of readdirSync(root).sort()) {
    if (handle.startsWith('_') || !isHandle(handle)) continue;
    const f = path.join(root, handle, 'pilot.md');
    if (!existsSync(f) || !statSync(f).isFile()) continue;
    const text = readFileSync(f, 'utf8');
    const blobSha = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
    out.push({ handle, blobSha, commit: 'local', text });
  }
  return out;
}

/** Pick the source from config: `{kind:'gh', repo, ref}` or `{kind:'dir', path}`. */
export function makeEntrantsSource(cfg) {
  if (cfg.kind === 'dir') return { describe: `dir ${cfg.path}`, fetch: async () => fetchEntrantsFromDir(cfg.path) };
  if (cfg.kind === 'gh') {
    const known = new Map();
    return {
      describe: `github ${cfg.repo}@${cfg.ref ?? 'main'}`,
      fetch: async () => {
        const list = await fetchEntrantsFromGitHub(cfg, known);
        for (const e of list) known.set(e.blobSha, e.text);
        return list;
      },
    };
  }
  throw new Error(`unknown entrants source kind ${cfg.kind}`);
}
