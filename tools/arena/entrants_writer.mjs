/**
 * Writes a team's `entrants/<team>/pilot.md` into the entrants repo -- the one record (docs/arena-runbook.md
 * §1d). A web submission becomes a commit on the same ref the sync polls, so the sync, the ladder,
 * the repo's `validate` check and its history all see it exactly as they see a merged pull request.
 *
 * `config.entrants` picks the kind, the same key the sync reads:
 *   - `gh`:  the Git Data API through `gh api` (the credential the sync already uses): read the ref's
 *            commit and tree, write one tree (the new pilot.md, and on a team rename the old one's
 *            removal), one commit, then move the ref -- fast-forward only, never forced;
 *   - `dir`: the same against a local `entrants/` tree (dev and CI).
 *
 * Every write states what it expects to replace (`expect`: path → blob sha, or null for "nothing
 * there"). If the ref holds anything else at one of those paths -- a pull request merged since the
 * page was loaded -- the write is refused with EntrantsConflict and nothing is committed. If the
 * ref moves between the read and the update (an unrelated merge), the write re-reads and tries
 * again, re-checking `expect` each time.
 *
 * Prose never touches a shell or a command line: `gh` gets an argv array, and the JSON body
 * (which carries the text) goes to it on stdin.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { VALIDATOR_PATH, gitBlobSha } from './prompts.mjs';

export class EntrantsConflict extends Error {
  constructor(message, { path: p, currentBlobSha, expectedBlobSha }) {
    super(message);
    this.status = 409;
    this.path = p;
    this.currentBlobSha = currentBlobSha;
    this.expectedBlobSha = expectedBlobSha;
  }
}

export class EntrantsWriteError extends Error {
  constructor(message) {
    super(message);
    this.status = 502;
  }
}

export const pilotPath = (folder) => `entrants/${folder}/pilot.md`;

/** `gh api <args>`; `body` (an object) goes to stdin as JSON. Rejects with gh's last stderr line. */
export function ghApi(args, body) {
  return new Promise((resolve, reject) => {
    const argv = ['api', ...args, ...(body === undefined ? [] : ['--input', '-'])];
    const child = spawn('gh', argv, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => reject(new EntrantsWriteError(`gh could not start (${e.message})`)));
    child.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(out).toString('utf8'));
      const stderr = Buffer.concat(err).toString('utf8').trim();
      const e = new Error(stderr.split('\n').pop() || `gh exited ${code}`);
      e.stdout = Buffer.concat(out).toString('utf8');
      reject(e);
    });
    child.stdin.end(body === undefined ? '' : JSON.stringify(body), 'utf8');
  });
}

function checkExpect(files, expect) {
  for (const [p, want] of Object.entries(expect ?? {})) {
    const have = files.get(p) ?? null;
    if (have !== (want ?? null)) {
      throw new EntrantsConflict(
        have === null
          ? `${p} is no longer in the entrants repo — it was removed since you loaded the page`
          : want === null
            ? `${p} already exists in the entrants repo — someone wrote it since you loaded the page`
            : `${p} changed in the entrants repo since you loaded the page (a pull request was merged, or a teammate submitted)`,
        { path: p, currentBlobSha: have, expectedBlobSha: want ?? null },
      );
    }
  }
}

/** The GitHub kind. `run(args, body?)` is the `gh api` seam (tests pass a fake). */
export function githubWriter({ repo, ref = 'main' }, { run = ghApi, retries = 2 } = {}) {
  const get = async (p) => JSON.parse(await run([p]));
  async function head() {
    const c = await get(`repos/${repo}/commits/${ref}`);
    const tree = await get(`repos/${repo}/git/trees/${c.sha}?recursive=1`);
    const files = new Map();
    let validatorBlobSha = null;
    for (const e of tree.tree ?? []) {
      if (e.type !== 'blob') continue;
      if (/^entrants\/[^/]+\/pilot\.md$/.test(e.path)) files.set(e.path, e.sha);
      if (e.path === VALIDATOR_PATH) validatorBlobSha = e.sha;
    }
    return { commit: c.sha, tree: c.commit?.tree?.sha ?? tree.sha, files, validatorBlobSha };
  }
  return {
    describe: `github ${repo}@${ref}`,
    head,
    async readBlob(sha) {
      const b = await get(`repos/${repo}/git/blobs/${sha}`);
      return Buffer.from(b.content, b.encoding ?? 'base64').toString('utf8');
    },
    /**
     * One commit: `put` path → {text} or {blobSha} (reuse a blob: a rename), `remove` paths. Resolves
     * to `{commit, blobs: {path: blobSha}}`.
     */
    async write({ put, remove = [], expect, message, base }) {
      let h = base ?? (await head());
      for (let attempt = 0; ; attempt++) {
        checkExpect(h.files, expect);
        try {
          const entries = [
            ...Object.entries(put).map(([p, v]) => (v.blobSha ? { path: p, mode: '100644', type: 'blob', sha: v.blobSha } : { path: p, mode: '100644', type: 'blob', content: v.text })),
            ...remove.filter((p) => h.files.has(p)).map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
          ];
          const tree = JSON.parse(await run(['--method', 'POST', `repos/${repo}/git/trees`], { base_tree: h.tree, tree: entries }));
          const commit = JSON.parse(await run(['--method', 'POST', `repos/${repo}/git/commits`], { message, tree: tree.sha, parents: [h.commit] }));
          await run(['--method', 'PATCH', `repos/${repo}/git/refs/heads/${ref}`], { sha: commit.sha, force: false });
          // A blob's sha is git's hash of its bytes, so the new one is known without another call.
          const blobs = Object.fromEntries(Object.entries(put).map(([p, v]) => [p, v.blobSha ?? gitBlobSha(v.text)]));
          return { commit: commit.sha, blobs };
        } catch (err) {
          if (err instanceof EntrantsConflict) throw err;
          const msg = String(err.message ?? err);
          // The ref moved under us (422 "Update is not a fast forward"): re-read, re-check, retry.
          if (/fast.?forward/i.test(msg) && attempt < retries) {
            h = await head();
            continue;
          }
          throw new EntrantsWriteError(`GitHub refused the commit: ${msg}`);
        }
      }
    },
  };
}

/** The local-directory kind: `<dir>/entrants/<team>/pilot.md`, no git. */
export function dirWriter({ path: dir }) {
  function head() {
    const files = new Map();
    const root = path.join(dir, 'entrants');
    if (existsSync(root)) {
      for (const name of readdirSync(root)) {
        const f = path.join(root, name, 'pilot.md');
        if (existsSync(f) && statSync(f).isFile()) files.set(pilotPath(name), gitBlobSha(readFileSync(f, 'utf8')));
      }
    }
    const v = path.join(dir, VALIDATOR_PATH);
    return { commit: 'local', tree: null, files, validatorBlobSha: existsSync(v) ? gitBlobSha(readFileSync(v, 'utf8').replace(/\r\n/g, '\n')) : null };
  }
  const file = (p) => path.join(dir, ...p.split('/'));
  return {
    describe: `dir ${dir}`,
    async head() {
      return head();
    },
    async readBlob(sha) {
      for (const [p, s] of head().files) if (s === sha) return readFileSync(file(p), 'utf8');
      throw new EntrantsWriteError(`blob ${sha} is not in ${dir}`);
    },
    async write({ put, remove = [], expect }) {
      const h = head();
      checkExpect(h.files, expect);
      const blobs = {};
      const texts = {};
      for (const [p, v] of Object.entries(put)) texts[p] = v.text ?? readFileSync(file([...h.files].find(([, s]) => s === v.blobSha)[0]), 'utf8');
      for (const [p, text] of Object.entries(texts)) {
        mkdirSync(path.dirname(file(p)), { recursive: true });
        writeFileSync(file(p), text, 'utf8');
        blobs[p] = gitBlobSha(text);
      }
      for (const p of remove) {
        if (!h.files.has(p) || put[p]) continue;
        unlinkSync(file(p));
        try {
          rmdirSync(path.dirname(file(p)));
        } catch {
          // not empty: leave the folder
        }
      }
      return { commit: 'local', blobs };
    },
  };
}

export function makeEntrantsWriter(cfg, opts = {}) {
  if (cfg.kind === 'dir') return dirWriter(cfg);
  if (cfg.kind === 'gh') return githubWriter(cfg, opts);
  throw new Error(`unknown entrants source kind ${cfg.kind}`);
}
