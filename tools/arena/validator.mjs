/**
 * The entrants validator, run as itself (docs/arena-runbook.md §1d). A web submission is checked by
 * `entrants_validator/validate_entry.py` -- a byte-for-byte copy of jamobair-entrants'
 * `tools/validate_entry.py`, the file its `validate` CI check runs -- called on a temp
 * `entrants/<team>/pilot.md`, exactly as that check calls it on a pull request. There is no second
 * set of rules to drift: the web refuses what the pull-request check refuses and accepts what it
 * accepts.
 *
 * The copy is pinned, not fetched: anyone who can merge to the entrants repo could otherwise run code
 * on the arena host. Instead the arena compares the copy's git blob sha with the upstream file's on
 * the commit it is about to write onto (and on every sync), and refuses web submissions while they
 * differ -- fail closed until the organizer re-vendors (entrants_validator/README.md).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitBlobSha } from './prompts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VENDORED_VALIDATOR = path.join(HERE, 'entrants_validator', 'validate_entry.py');

/** Blob sha of the vendored copy as git stores it (LF), whatever the checkout's line endings. */
export function vendoredValidatorSha(file = VENDORED_VALIDATOR) {
  return gitBlobSha(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
}

export class ValidatorUnavailable extends Error {}

// validate_entry(folder) from the vendored module, its problems as JSON on stdout. argv: folder, module dir.
const RUN = 'import json, sys; from pathlib import Path; sys.path.insert(0, sys.argv[2]); import validate_entry as v; print(json.dumps(v.validate_entry(Path(sys.argv[1]))))';

/**
 * Problems the entrants validator finds with `entrants/<team>/pilot.md` holding `text` (empty =
 * valid). The bytes written are the bytes that would be committed. Rejects with
 * ValidatorUnavailable when Python can't run it.
 */
export async function runEntrantsValidator({ team, text, python = process.platform === 'win32' ? 'python' : 'python3', timeoutMs = 20000, file = VENDORED_VALIDATOR }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'arena-validate-'));
  try {
    const folder = path.join(dir, 'entrants', team);
    try {
      mkdirSync(folder, { recursive: true });
    } catch (err) {
      return [`folder name ${JSON.stringify(team)} cannot be created as a folder (${err.code ?? err.message})`];
    }
    writeFileSync(path.join(folder, 'pilot.md'), text, 'utf8');
    const out = await new Promise((resolve, reject) => {
      const child = spawn(python, ['-c', RUN, folder, path.dirname(file)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' } });
      const so = [];
      const se = [];
      const timer = setTimeout(() => child.kill(), timeoutMs);
      child.stdout.on('data', (c) => so.push(c));
      child.stderr.on('data', (c) => se.push(c));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new ValidatorUnavailable(`the entrants validator could not start (${e.message})`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new ValidatorUnavailable(`the entrants validator failed (exit ${code}): ${Buffer.concat(se).toString('utf8').trim().split('\n').pop()}`));
        resolve(Buffer.concat(so).toString('utf8'));
      });
    });
    const problems = JSON.parse(out);
    if (!Array.isArray(problems)) throw new ValidatorUnavailable('the entrants validator returned something unexpected');
    return problems.map(String);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
