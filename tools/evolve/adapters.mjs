/**
 * The real dependencies `runGeneration` is handed outside the tests. Each one is existing tooling,
 * called the way its own users call it, so the harness measures exactly what the Jam will run:
 *
 *   compile    `tools/arena/compile.mjs::spawnCompile` — the Elysium panel's runner of
 *              `tools/jev/compile.py --stdin --format json` (door B of the entrant preview)
 *   playMatch  `node tools/match/cli.mjs` (`npm run match`) with both sides' compiled schemas on
 *              `tools/jev/schema_server.py` — the Jam's own shape (ruling 2026-09-25)
 *   mutate     `tools/evolve/mutate.py` over `tools/jev/llm_backends.py` (claude / ollama /
 *              openrouter), prompt on stdin, one JSON outcome on stdout
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPILE_DEFAULTS, spawnCompile } from '../arena/compile.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function run(cmd, args, { input = null, timeoutMs = 0, cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    const err = [];
    const timer = timeoutMs ? setTimeout(() => child.kill(), timeoutMs) : null;
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
    child.stdin.end(input ?? '', 'utf8');
  });
}

export function makeCompile(campaign) {
  const cfg = {
    ...COMPILE_DEFAULTS,
    backend: campaign.compile.backend,
    model: campaign.compile.model,
    maxTokensPerCompile: campaign.compile.maxTokensPerCompile,
  };
  const runner = spawnCompile({ root: ROOT, cfg });
  return async (text) => (await runner(text)).data;
}

/** Wall-clock cap per match: the arena's own rule of thumb (queue.mjs), 3x the expected time. */
export function matchWallCapMs(shape, avgSecPerRound = 1.5) {
  return Math.max(120, 3 * (shape.maxSimSec / shape.cadenceSec) * avgSecPerRound) * 1000;
}

/** Repo-relative (forward slashes) when under the repo, so a log never records a machine path. */
export function repoPath(p) {
  const rel = path.relative(ROOT, p);
  return rel.startsWith('..') || path.isAbsolute(rel) ? p : rel.split(path.sep).join('/');
}

export function makePlayMatch(campaign) {
  return async ({ violet, green, seed, shape, out }) => {
    const args = [
      path.join(ROOT, 'tools', 'match', 'cli.mjs'),
      '--a', repoPath(violet.prosePath), '--a-schemas', repoPath(violet.compiledPath), '--name-a', violet.id,
      '--b', repoPath(green.prosePath), '--b-schemas', repoPath(green.compiledPath), '--name-b', green.id,
      '--jev-schema', campaign.jevSchemaEndpoint,
      '--seed', String(seed),
      '--cadence', String(shape.cadenceSec),
      '--timeout', String(campaign.matchTimeoutSec),
      '--out', out,
      '--quiet',
    ];
    if (shape.maxSimSec < 600) args.push('--max-sim-sec', String(shape.maxSimSec));
    const r = await run(process.execPath, args, { timeoutMs: matchWallCapMs(shape) });
    if (r.code !== 0) throw new Error(`match failed (exit ${r.code ?? r.signal}): ${(r.stderr || r.stdout).trim().split('\n').pop()}`);
    return JSON.parse(await readFile(out, 'utf8'));
  };
}

export function makeMutate(campaign) {
  const m = campaign.mutation;
  return async ({ parentText, focus, diagnostics, avoid }) => {
    const args = [path.join(ROOT, 'tools', 'evolve', 'mutate.py'), '--backend', m.backend, '--attempts', String(m.attempts),
      '--max-sentence-changes', String(m.maxSentenceChanges), '--max-total-tokens', String(m.maxTotalTokens)];
    if (m.model) args.push('--model', m.model);
    const input = JSON.stringify({ parent: parentText, focus, diagnostics, avoid });
    const r = await run(PYTHON, args, { input, timeoutMs: 15 * 60_000 });
    const line = r.stdout.trim().split('\n').pop();
    try {
      return JSON.parse(line);
    } catch {
      return { ok: false, error: `mutate.py exit ${r.code}: ${(r.stderr || r.stdout).trim().split('\n').pop() ?? 'no output'}` };
    }
  };
}

export function realDeps(campaign) {
  return { compile: makeCompile(campaign), playMatch: makePlayMatch(campaign), mutate: makeMutate(campaign) };
}
