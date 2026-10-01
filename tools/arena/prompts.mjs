/**
 * Prompt store for the arena (docs/arena-site-spec.md §3.2, ruling Q3): the entrants repo is the
 * record. Merged `entrants/<team>/pilot.md` files are polled from GitHub (`gh api`) on `main`,
 * hashed (sha256 of the text) and cached under `runs/arena/prompts/<team>/<hash>.md` so a
 * `{handle, hash}` PromptRef resolves without the network. A ladder "handle" is the entry's folder
 * name: one to three handles joined by `+`, lead first (`alice`, `alice+bob`). Scratch prompts are
 * validated with the entrants validator's rules (ported from `tools/validate_entry.py`; the port is
 * held to the vendored original by `test_teams.mjs`) and are never stored anywhere but the match
 * log that used them. Web submissions run the vendored original itself (`validator.mjs`).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const HANDLE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
export const TEAM_SEP = '+';
export const MAX_TEAM = 3; // one lead + up to two learners; a lead alone is a team of one

// The port speaks Python's regex dialect, not JavaScript's, where the two differ:
//  - whitespace is `str.isspace()` (Python's `\s` and `strip()`): \x1c-\x1f and \x85 are in, BOM is out;
//  - `re.MULTILINE` `^` starts a line after a newline only (JavaScript's also after a carriage return and U+2028/U+2029);
//  - `re.IGNORECASE` folds as `u` mode does ("ſ" is an "s");
//  - `$` also matches before one trailing "\n".
// test_teams.mjs runs the vendored validator on cases that sit on each of these edges.
const PY_WS = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const PY_BLANK_RE = new RegExp(`^[${PY_WS}]*$`);
const PY_FENCE_LINE_RE = new RegExp(`^[${PY_WS}]*(\`\`\`|~~~)`);
const URL_RE = /(https?:\/\/|www\.)/iu;
const PY_HANDLE_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*\n?$/;
const hasFence = (text) => text.split('\n').some((line) => PY_FENCE_LINE_RE.test(line));

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
  if (typeof text !== 'string' || PY_BLANK_RE.test(text)) {
    problems.push('file is empty');
    return problems;
  }
  const fence = hasFence(text);
  if (fence) problems.push('contains a code fence (``` or ~~~)');
  if (text.includes('```') && !fence) problems.push('contains ``` (code fences are not allowed)');
  if (URL_RE.test(text)) problems.push('contains a URL');
  return problems;
}

/** Python's `repr()` of a str, so messages read exactly like the validator's. */
function pyRepr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const named = { '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r', [q]: `\\${q}` };
  const hex = (c, w) => c.codePointAt(0).toString(16).padStart(w, '0');
  return q + s.replace(/[\\\t\n\r'"]|[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]|(?! )\p{Zs}/gu, (c) => {
    if (named[c]) return named[c];
    if (c === '"' || c === "'") return c;
    const cp = c.codePointAt(0);
    return cp <= 0xff ? `\\x${hex(c, 2)}` : cp <= 0xffff ? `\\u${hex(c, 4)}` : `\\U${hex(c, 8)}`;
  }) + q;
}

/**
 * Same rules, same messages as `validate_team_name` in the entrants validator: a folder name is
 * `<lead>`, `<lead>+<learner>` or `<lead>+<learner>+<learner>`, each a plausible handle, no handle
 * twice (case-insensitive). `_template` is exempt there and skipped by the sync here. Empty = valid.
 */
export function validateTeamName(name) {
  if (name === '_template') return [];
  const handles = String(name).split(TEAM_SEP);
  if (!handles.every((h) => PY_HANDLE_RE.test(h))) {
    return [`folder name ${pyRepr(String(name))} is not <lead-handle>[+<learner-handle>[+<learner-handle>]] (one to three handles joined by +, lead first; each handle: letters, digits, . _ -)`];
  }
  if (handles.length > MAX_TEAM) return [`folder name ${pyRepr(name)} names ${handles.length} handles; a team is at most ${MAX_TEAM} (one lead, up to two learners)`];
  if (new Set(handles.map((h) => h.toLowerCase())).size !== handles.length) return [`folder name ${pyRepr(name)} names the same handle twice; each teammate is listed once`];
  return [];
}

/** An entry folder the sync takes: a valid team name of strict handles, not `_template`. */
export function isTeamName(s) {
  return typeof s === 'string' && !s.startsWith('_') && s.split(TEAM_SEP).every(isHandle) && validateTeamName(s).length === 0;
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

/** Where the entrants validator lives in the entrants repo (validator.mjs compares it to the vendored copy). */
export const VALIDATOR_PATH = 'tools/validate_entry.py';

/**
 * List merged prompts on the entrants repo's ref: `[{handle, blobSha, commit, text}]`.
 * `known` maps blobSha → text so unchanged blobs are not re-fetched. The list also carries
 * `validatorBlobSha` (non-enumerable): the blob sha of `tools/validate_entry.py` on that commit.
 */
export async function fetchEntrantsFromGitHub({ repo, ref = 'main' }, known = new Map(), run = gh) {
  const commit = JSON.parse(await run([`repos/${repo}/commits/${ref}`])).sha;
  const tree = JSON.parse(await run([`repos/${repo}/git/trees/${commit}?recursive=1`]));
  const out = [];
  for (const entry of tree.tree ?? []) {
    const m = /^entrants\/([^/]+)\/pilot\.md$/.exec(entry.path);
    if (!m || entry.type !== 'blob') continue;
    const handle = m[1];
    if (!isTeamName(handle)) continue;
    let text = known.get(entry.sha);
    if (text === undefined) {
      const blob = JSON.parse(await run([`repos/${repo}/git/blobs/${entry.sha}`]));
      text = Buffer.from(blob.content, blob.encoding ?? 'base64').toString('utf8');
    }
    out.push({ handle, blobSha: entry.sha, commit, text });
  }
  const validator = (tree.tree ?? []).find((e) => e.path === VALIDATOR_PATH && e.type === 'blob');
  return Object.defineProperty(out, 'validatorBlobSha', { value: validator?.sha ?? null });
}

/** Git's blob sha1 of `text` (what `git hash-object` prints for a file with these bytes). */
export function gitBlobSha(text) {
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

/** A local `entrants/<handle>/pilot.md` tree (dev and CI): same shape, no network. */
export function fetchEntrantsFromDir(dir) {
  const root = path.join(dir, 'entrants');
  if (!existsSync(root)) return [];
  const out = [];
  for (const handle of readdirSync(root).sort()) {
    if (!isTeamName(handle)) continue;
    const f = path.join(root, handle, 'pilot.md');
    if (!existsSync(f) || !statSync(f).isFile()) continue;
    const text = readFileSync(f, 'utf8');
    out.push({ handle, blobSha: gitBlobSha(text), commit: 'local', text });
  }
  const v = path.join(dir, VALIDATOR_PATH);
  return Object.defineProperty(out, 'validatorBlobSha', { value: existsSync(v) ? gitBlobSha(readFileSync(v, 'utf8').replace(/\r\n/g, '\n')) : null });
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
