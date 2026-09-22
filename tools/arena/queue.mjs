/**
 * Match orchestrator (docs/arena-site-spec.md §3.1): one worker per backend, priority classes
 * (organizer > bracket > placement > test, FIFO within a class), a wall-clock cap per job, and
 * verify-then-commit — every finished log is re-simulated with `verifyReplay` before it is
 * written as `runs/arena/logs/<id>.json` and counted by a `finished` row. A diverged log is kept
 * as `<id>.diverged.json`, voided, and re-queued once.
 *
 * The queue is the ledger: `queued`/`started`/terminal rows. On restart anything `queued` or
 * `started` without a terminal row runs again; only wall time is lost.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { flush, httpCallModel, probeBackend, backendLabel } from '../match/load.mjs';
import { nextMatchId, queued as queuedJobs } from './ledger.mjs';
import { houseTextForSide } from './house.mjs';
import { shortHash } from './prompts.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function wallCapMs({ maxSimSec, cadenceSec, avgSecPerCall }) {
  const rounds = maxSimSec / cadenceSec;
  const expectedSec = rounds * 6 * (avgSecPerCall ?? 0.9);
  return Math.max(60, 3 * expectedSec) * 1000;
}

/** Tower and nexus hp from the last checkpoint, for the match page and the tie order. */
export function finalFromLog(log) {
  const last = log.checkpoints[log.checkpoints.length - 1];
  if (!last) return null;
  try {
    const st = JSON.parse(last.state);
    return { tick: last.tick, towers: st.t, nexus: st.n };
  } catch {
    return null;
  }
}

export class Queue {
  /**
   * @param opts.ledger      Ledger
   * @param opts.backends    { id: {kind:'mock'|'http', endpoint?, model?, avgSecPerCall?, timeoutSec?} }
   * @param opts.headless    the bundle from `loadHeadless()`
   * @param opts.dataDir     runs/arena
   * @param opts.promptStore PromptStore
   * @param opts.house       { handle, hash, file }
   * @param opts.hooks       test seams: `afterRun(log, job)` may replace the log before verify;
   *                         `callModelFor(job)` replaces the adapter; `wallCapMs` overrides the cap
   */
  constructor({ ledger, backends, headless, dataDir, promptStore, house, log = console, hooks = {} }) {
    this.ledger = ledger;
    this.backends = backends;
    this.headless = headless;
    this.dataDir = dataDir;
    this.logsDir = path.join(dataDir, 'logs');
    this.scratchDir = path.join(dataDir, 'scratch');
    this.promptStore = promptStore;
    this.house = house;
    this.log = log;
    this.hooks = hooks;
    /** id → { startedAt, progress } for jobs in flight */
    this.running = new Map();
    this.stopped = false;
    this.wakers = new Set();
    this.workers = [];
  }

  get state() {
    return this.ledger.state();
  }

  get paused() {
    return this.state.paused;
  }

  /** Append a `queued` row. `scratchText` is kept in a side file until the job ends. */
  enqueue(job) {
    const state = this.state;
    const id = nextMatchId(state, job.tournamentId);
    const { scratchText, ...rest } = job;
    if (scratchText !== undefined) {
      mkdirSync(this.scratchDir, { recursive: true });
      writeFileSync(path.join(this.scratchDir, `${id}.md`), scratchText);
    }
    this.ledger.append({ type: 'queued', id, ...rest });
    this.wake();
    return id;
  }

  cancel(id, reason) {
    const j = this.state.jobs.get(id);
    if (!j || j.status !== 'queued') return false;
    this.ledger.append({ type: 'cancelled', id, reason });
    this.forgetScratch(id);
    return true;
  }

  pause(by) {
    if (!this.paused) this.ledger.append({ type: 'paused', by });
  }

  resume(by) {
    if (this.paused) this.ledger.append({ type: 'resumed', by });
    this.wake();
  }

  wake() {
    for (const w of this.wakers) w();
    this.wakers.clear();
  }

  /** Resolves on the next enqueue/resume or after `ms`, whichever is first. */
  sleepUntilWoken(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.wakers.delete(resolve);
        resolve();
      }, ms);
      this.wakers.add(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  /** Start one worker per backend. Recovery is implicit: `started` jobs fold back to runnable. */
  start() {
    for (const j of this.state.jobs.values()) {
      if (j.status === 'started') this.log.warn(`arena: ${j.id} was running when the arena stopped; it will run again`);
    }
    for (const backendId of Object.keys(this.backends)) {
      this.workers.push(this.worker(backendId));
    }
  }

  async stop() {
    this.stopped = true;
    this.wake();
    await Promise.allSettled(this.workers);
  }

  nextFor(backendId) {
    return queuedJobs(this.state, this.running).find((j) => j.backendId === backendId);
  }

  /** True when nothing is queued for any configured backend and nothing is running. */
  idle() {
    return this.running.size === 0 && queuedJobs(this.state, this.running).filter((j) => this.backends[j.backendId]).length === 0;
  }

  async waitForIdle(timeoutMs = 60000) {
    const t0 = Date.now();
    while (!this.idle()) {
      if (Date.now() - t0 > timeoutMs) throw new Error('queue did not go idle in time');
      await sleep(50);
    }
  }

  async worker(backendId) {
    const backend = this.backends[backendId];
    while (!this.stopped) {
      if (this.paused) {
        await this.sleepUntilWoken(5000);
        continue;
      }
      const job = this.nextFor(backendId);
      if (!job) {
        await this.sleepUntilWoken(5000);
        continue;
      }
      let probe = { kind: 'mock' };
      if (backend.kind === 'http') {
        try {
          probe = await probeBackend(backend.endpoint);
        } catch (err) {
          this.log.warn(`arena: backend ${backendId} unreachable (${err.message}); retrying in 30 s`);
          await this.sleepUntilWoken(30000);
          continue;
        }
      }
      await this.runJob(job, backend, probe);
    }
  }

  resolveSide(ref, id, side) {
    if (ref.scratch) {
      const f = path.join(this.scratchDir, `${id}.md`);
      if (!existsSync(f)) throw new Error('scratch prompt text is gone (arena restarted?) — submit it again');
      return { name: `${ref.handle} (scratch)`, promptFile: 'scratch', promptText: readFileSync(f, 'utf8') };
    }
    const stored = this.promptStore.read(ref.handle, ref.hash);
    // The house may be a per-side pair stored as one bundle; the side plays its own half.
    const promptText = ref.house ? houseTextForSide(stored, side) : stored;
    const promptFile = ref.house ? this.house.file : `entrants/${ref.handle}/pilot.md@${shortHash(ref.hash)}`;
    return { name: ref.handle, promptFile, promptText };
  }

  forgetScratch(id) {
    const f = path.join(this.scratchDir, `${id}.md`);
    if (existsSync(f)) rmSync(f);
  }

  async runJob(job, backend, probe) {
    const { id } = job;
    const attempt = (job.attempt ?? 0) + 1;
    const startedAt = Date.now();
    this.running.set(id, { startedAt, progress: null });
    this.ledger.append({ type: 'started', id, attempt });
    const ac = new AbortController();
    let timer = null;
    try {
      const sides = { violet: this.resolveSide(job.sides.violet, id, 'violet'), green: this.resolveSide(job.sides.green, id, 'green') };
      let callModelFor;
      let logBackend;
      if (backend.kind === 'mock') {
        logBackend = { kind: 'mock', arenaBackend: job.backendId, model: backend.model ?? 'mock' };
        callModelFor = (i) => this.headless.mockCallModel(100 + i);
      } else {
        logBackend = { ...probe, arenaBackend: job.backendId, model: probe.health?.model ?? backend.model };
        const call = httpCallModel(backend.endpoint, backend.timeoutSec ?? 60);
        callModelFor = () => call;
      }
      if (this.hooks.callModelFor) callModelFor = this.hooks.callModelFor(job);
      const capMs = this.hooks.wallCapMs ?? wallCapMs({ maxSimSec: job.maxSimSec, cadenceSec: job.cadenceSec, avgSecPerCall: backend.avgSecPerCall });
      timer = setTimeout(() => ac.abort(), capMs);
      this.log.info(
        `arena: ${id} start ${sides.violet.name} vs ${sides.green.name} seed=${job.seed} cadence=${job.cadenceSec} ` +
          `max=${job.maxSimSec}s backend=${backendLabel(logBackend)} cap=${Math.round(capMs / 1000)}s`,
      );
      let log = await this.headless.runMatch({
        seed: job.seed,
        sides,
        callModelFor,
        cadenceSec: job.cadenceSec,
        maxSimSec: job.maxSimSec,
        backend: logBackend,
        flush,
        signal: ac.signal,
        onProgress: (p) => {
          const r = this.running.get(id);
          if (r) r.progress = p;
        },
      });
      clearTimeout(timer);
      const wallMs = Date.now() - startedAt;
      if (this.hooks.afterRun) log = (await this.hooks.afterRun(log, job)) ?? log;
      mkdirSync(this.logsDir, { recursive: true });
      if (ac.signal.aborted) {
        writeFileSync(path.join(this.logsDir, `${id}.json`), JSON.stringify(log) + '\n');
        this.ledger.append({ type: 'timed-out', id, wallMs, reason: `wall-clock cap ${Math.round(capMs / 1000)}s` });
        this.log.warn(`arena: ${id} timed out after ${Math.round(wallMs / 1000)}s`);
        return;
      }
      const v = await this.headless.verifyReplay(log, flush);
      if (!v.ok) {
        writeFileSync(path.join(this.logsDir, `${id}.diverged.json`), JSON.stringify(log) + '\n');
        this.ledger.append({
          type: 'void',
          id,
          by: 'arena',
          reason: `replay diverged at tick ${v.firstDivergenceTick ?? 'end'}`,
          divergenceTick: v.firstDivergenceTick,
          verify: v,
        });
        this.log.warn(`arena: ${id} REPLAY DIVERGED (tick ${v.firstDivergenceTick}); voided`);
        if (!job.retryOf) {
          const { id: _id, status, attempt: _a, createdAt, startedAt: _s, ...copy } = job;
          const scratchSide = [job.sides.violet, job.sides.green].find((s) => s.scratch);
          const scratchText = scratchSide ? readFileSync(path.join(this.scratchDir, `${id}.md`), 'utf8') : undefined;
          const retryId = this.enqueue({ ...copy, retryOf: id, scratchText });
          this.log.warn(`arena: ${id} re-queued once as ${retryId}`);
        }
        return;
      }
      writeFileSync(path.join(this.logsDir, `${id}.json`), JSON.stringify(log) + '\n');
      const { deaths, ...result } = log.result;
      this.ledger.append({
        type: 'finished',
        id,
        kind: job.kind,
        quick: !!job.quick,
        ranked: !!job.ranked,
        seed: job.seed,
        cadenceSec: job.cadenceSec,
        maxSimSec: job.maxSimSec,
        sides: job.sides,
        requestedBy: job.requestedBy ?? null,
        backend: { id: job.backendId, model: logBackend.model, label: backendLabel(logBackend) },
        result: { ...result, deaths: deaths.length },
        final: finalFromLog(log),
        verify: { checkpointsCompared: v.checkpointsCompared, ticks: v.ticks },
        wallMs,
      });
      this.log.info(`arena: ${id} done winner=${log.result.winner ?? 'draw'} by=${log.result.endReason ?? 'unfinished'} wall=${Math.round(wallMs / 1000)}s verified=${v.checkpointsCompared} checkpoints`);
    } catch (err) {
      if (timer) clearTimeout(timer);
      this.ledger.append({ type: 'failed', id, error: String(err?.message ?? err) });
      this.log.error(`arena: ${id} failed: ${err?.stack ?? err}`);
    } finally {
      this.running.delete(id);
      this.forgetScratch(id);
    }
  }
}
