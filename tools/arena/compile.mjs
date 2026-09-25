/**
 * Elysium's compile panel, server side (door B of `docs/entrant-compile-preview.md`): an entrant
 * pastes prose, the arena runs `tools/jev/compile.py` — door A's code, the same file the PR bot
 * runs — and shows the transparency view. The model call happens in that child process with the
 * arena's own environment (`$OPENROUTER_API_KEY` for the hosted backend); nothing about the backend
 * or its key ever reaches the browser, which only sees the rendered view.
 *
 * Limits, all per `config.compile` (defaults below), all in memory — a restart forgets them, which
 * is the same posture as the queue's `running` map, and fine while the arena binds 127.0.0.1:
 *   - per client IP: `perIpPerMinute` compiles in any rolling minute, `perIpPerDay` per Central day;
 *   - everyone: `globalPerDay` per Central day, `maxConcurrent` compiles at once (503 past that);
 *   - per compile: `maxTokensPerCompile`, passed to compile.py as its hard token cap.
 * The client IP is the socket address unless `ipHeader` names a header set by a proxy you trust —
 * behind the Cloudflare Tunnel every request arrives from 127.0.0.1, so set `"cf-connecting-ip"`
 * there or every visitor shares one bucket.
 *
 * A finished compile is kept (`cacheSize`, `cacheTtlMin`) under a random id, so "run a practice
 * match" plays exactly the schemas the entrant just read, not a fresh (sampled) translation.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { dayCT } from './ledger.mjs';
import { validatePromptText } from './prompts.mjs';

export const COMPILE_DEFAULTS = {
  enabled: true,
  backend: 'ollama',
  model: null,
  python: process.platform === 'win32' ? 'python' : 'python3',
  timeoutSec: 240,
  maxTokensPerCompile: 20000,
  maxPromptBytes: 16 * 1024,
  perIpPerMinute: 3,
  perIpPerDay: 20,
  globalPerDay: 400,
  maxConcurrent: 1,
  ipHeader: null,
  cacheSize: 200,
  cacheTtlMin: 120,
  practiceBackend: null,
};

export class CompileError extends Error {
  constructor(status, message, retryAfterSec = null) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Rolling-minute and per-Central-day counters, per key plus one global day counter. */
export class RateLimiter {
  constructor({ perIpPerMinute, perIpPerDay, globalPerDay }, now = () => Date.now()) {
    this.limits = { perIpPerMinute, perIpPerDay, globalPerDay };
    this.now = now;
    this.recent = new Map(); // ip -> [ms timestamps within the last minute]
    this.days = new Map(); // `${day}|${ip}` -> count ; `${day}|*` -> global count
  }

  /** Throws `CompileError(429)` when `ip` may not compile now; otherwise records the use. */
  take(ip) {
    const t = this.now();
    const day = dayCT(new Date(t));
    const recent = (this.recent.get(ip) ?? []).filter((x) => t - x < 60_000);
    const { perIpPerMinute, perIpPerDay, globalPerDay } = this.limits;
    if (recent.length >= perIpPerMinute) {
      const retry = Math.ceil((60_000 - (t - recent[0])) / 1000);
      throw new CompileError(429, `slow down: ${perIpPerMinute} compiles a minute — try again in ${retry} s`, retry);
    }
    const mine = this.days.get(`${day}|${ip}`) ?? 0;
    if (mine >= perIpPerDay) throw new CompileError(429, `daily limit reached: ${perIpPerDay} compiles per day (Central Time) from one address`);
    const all = this.days.get(`${day}|*`) ?? 0;
    if (all >= globalPerDay) throw new CompileError(429, `the arena's compile budget for today is used up (${globalPerDay}) — the local command still works`);
    recent.push(t);
    this.recent.set(ip, recent);
    this.days.set(`${day}|${ip}`, mine + 1);
    this.days.set(`${day}|*`, all + 1);
    for (const k of this.days.keys()) if (!k.startsWith(`${day}|`)) this.days.delete(k);
  }

  usage(ip) {
    const day = dayCT(new Date(this.now()));
    return { today: this.days.get(`${day}|${ip}`) ?? 0, perIpPerDay: this.limits.perIpPerDay };
  }
}

/** The client address a request is limited under. */
export function clientIp(req, ipHeader) {
  if (ipHeader) {
    const v = req.headers[ipHeader.toLowerCase()];
    if (typeof v === 'string' && v.trim()) return v.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Default runner: `python tools/jev/compile.py --stdin --format json …`, prose on stdin. */
export function spawnCompile({ root, cfg }) {
  return (text) =>
    new Promise((resolve, reject) => {
      const args = [
        path.join(root, 'tools', 'jev', 'compile.py'),
        '--stdin', '--name', 'pilot.md', '--format', 'json',
        '--backend', cfg.backend, '--max-total-tokens', String(cfg.maxTokensPerCompile),
      ];
      if (cfg.model) args.push('--model', cfg.model);
      const child = spawn(cfg.python, args, { cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      const out = [];
      const err = [];
      const timer = setTimeout(() => child.kill(), cfg.timeoutSec * 1000);
      child.stdout.on('data', (c) => out.push(c));
      child.stderr.on('data', (c) => err.push(c));
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new CompileError(503, `compiler could not start (${e.message})`));
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(out).toString('utf8');
        const stderr = Buffer.concat(err).toString('utf8').trim();
        if (signal) return reject(new CompileError(504, `compile took longer than ${cfg.timeoutSec} s and was stopped`));
        if (code === 2 || !stdout.trim()) return reject(new CompileError(503, `compiler backend unavailable: ${stderr.split('\n').pop() || `exit ${code}`}`));
        try {
          resolve({ exitCode: code, data: JSON.parse(stdout) });
        } catch {
          reject(new CompileError(502, 'compiler returned something that is not JSON'));
        }
      });
      child.stdin.end(text, 'utf8');
    });
}

export function makeCompiler({ config = {}, root, run, now = () => Date.now() } = {}) {
  const cfg = { ...COMPILE_DEFAULTS, ...config };
  const limiter = new RateLimiter(cfg, now);
  const runner = run ?? spawnCompile({ root, cfg });
  const cache = new Map(); // id -> { at, text, result }
  let inFlight = 0;

  function prune() {
    const cutoff = now() - cfg.cacheTtlMin * 60_000;
    for (const [id, v] of cache) if (v.at < cutoff) cache.delete(id);
    while (cache.size > cfg.cacheSize) cache.delete(cache.keys().next().value);
  }

  return {
    cfg,
    limiter,
    /** Validate, rate-limit, run compile.py, cache. Resolves to `{ id, result }`. */
    async compile(rawText, ip) {
      if (!cfg.enabled) throw new CompileError(404, 'the compile panel is turned off on this arena');
      const text = String(rawText ?? '').replace(/\r\n/g, '\n');
      const problems = validatePromptText(text);
      if (problems.length) throw new CompileError(400, `prompt rejected: ${problems.join('; ')}`);
      if (Buffer.byteLength(text, 'utf8') > cfg.maxPromptBytes) throw new CompileError(413, `prompt is over ${cfg.maxPromptBytes / 1024} KB`);
      if (inFlight >= cfg.maxConcurrent) throw new CompileError(503, 'the compiler is busy with someone else’s prose — try again in a few seconds', 10);
      limiter.take(ip);
      inFlight += 1;
      try {
        const { exitCode, data } = await runner(text);
        const prompt = data.prompts?.[0];
        if (!prompt) throw new CompileError(502, 'compiler returned no result');
        const result = { backend: data.backend, capTokens: data.cap_tokens, usage: data.usage, exitCode, ...prompt };
        const id = randomBytes(9).toString('base64url');
        prune();
        cache.set(id, { at: now(), text, result });
        return { id, result };
      } finally {
        inFlight -= 1;
      }
    },
    /** A cached compile, or null once it has aged out. */
    get(id) {
      prune();
      return cache.get(String(id ?? '')) ?? null;
    },
  };
}

/** The compiled schemas a practice match needs, or null when any instrument failed to compile. */
export function practiceSchemas(result) {
  const out = {};
  for (const [inst, e] of Object.entries(result.instruments ?? {})) {
    if (!e.ok) return null;
    out[inst] = e.schema;
  }
  return Object.keys(out).length === 3 ? out : null;
}
