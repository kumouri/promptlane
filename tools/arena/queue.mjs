/**
 * Match orchestrator (docs/arena-site-spec.md §3.1): one worker per backend, priority classes
 * (organizer > bracket > placement > test, FIFO within a class), a wall-clock cap per job, and
 * verify-then-commit — every finished log is re-simulated with `verifyReplay` before it is
 * written as `runs/arena/logs/<id>.json` and counted by a `finished` row. A diverged log is kept
 * as `<id>.diverged.json`, voided, and re-queued once.
 *
 * The queue is the ledger: `queued`/`started`/terminal rows. On restart anything `queued` or
 * `started` without a terminal row runs again; only wall time is lost.
 *
 * Phase B: every running job also feeds a `LiveStream` (`live.mjs`) from the runner's callbacks,
 * which is what `GET /api/matches/<id>/events` fans out.
 *
 * Jev (docs/arena-site-spec.md §9): a job whose backend has `kind: "jev-schema-http"` plays BOTH sides
 * as compiled rule cascades on Jev through `tools/jev/schema_server.py` -- an entrant's prose compiled
 * once per prompt and compiler (`schemas.mjs`), the house its tier's checked-in schemas. There is no
 * text-model path in such a match: a side with no schemas fails the job. A compile failure, Jev
 * leaving too many decisions unanswered, or the per-match spend cap ends the job `failed` with the
 * reason on the match page; the first two are re-queued once. Every Jev match records its calls,
 * tokens, USD and which door answered (`typesafe` / `workers-ai`) in its log (`backend.jev`) and on
 * its terminal ledger row (`jev`); the day's total gates new matches (`dailyBudgetUsd`).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { flush, httpCallModel, probeBackend, backendLabel } from '../match/load.mjs';
import { jevSpentToday, nextMatchId, queued as queuedJobs } from './ledger.mjs';
import { houseTextForSide } from './house.mjs';
import { metaOf } from './live.mjs';
import { shortHash } from './prompts.mjs';
import { CompileFailed } from './schemas.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function wallCapMs({ maxSimSec, cadenceSec, avgSecPerCall }) {
  const rounds = maxSimSec / cadenceSec;
  const expectedSec = rounds * 6 * (avgSecPerCall ?? 0.9);
  return Math.max(60, 3 * expectedSec) * 1000;
}

/**
 * Limits for a `jev-schema-http` backend; each can be set on the backend's config entry (null turns
 * that one off).
 *   dailyBudgetUsd           no new match starts once the day's (Central) Jev spend on this backend reaches it
 *   maxUsdPerMatch           a match is stopped and failed (not retried) once its own spend reaches it
 *   maxUnansweredRate        a side with more unanswered decisions than this fraction fails the match
 *   maxConsecutiveUnanswered this many unanswered decisions in a row (any bot) stops the match early
 */
export const JEV_DEFAULTS = { dailyBudgetUsd: 5, maxUsdPerMatch: 0.25, maxUnansweredRate: 0.05, maxConsecutiveUnanswered: 30 };

export const isJevBackend = (backend) => backend?.kind === 'jev-schema-http';

/** Counts one Jev match's decisions, spend and doors; asks for an abort past its limits. */
export class JevMeter {
  constructor(limits, abort) {
    this.limits = limits;
    this.abort = abort;
    this.calls = 0;
    this.unanswered = { violet: 0, green: 0 };
    this.tokensIn = 0;
    this.costUsd = 0;
    this.doors = {};
    this.consecutive = 0;
    this.lastError = null;
  }

  wrap(team, pilot) {
    return {
      decide: async (obs) => {
        const d = await pilot.decide(obs);
        this.record(team, d);
        return d;
      },
    };
  }

  record(team, d) {
    this.calls += 1;
    if (d.usage) {
      this.consecutive = 0;
      this.tokensIn += d.usage.tokensIn;
      this.costUsd += d.usage.costUsd;
      this.doors[d.usage.door] = (this.doors[d.usage.door] ?? 0) + 1;
    } else if (d.action === null) {
      this.unanswered[team] += 1;
      this.consecutive += 1;
      this.lastError = d.reply;
      if (this.limits.maxConsecutiveUnanswered != null && this.consecutive >= this.limits.maxConsecutiveUnanswered) {
        this.abort('unanswered', `Jev stopped answering: ${this.consecutive} decisions in a row went unanswered (last: ${d.reply.slice(0, 160)})`);
      }
    }
    if (this.limits.maxUsdPerMatch != null && this.costUsd >= this.limits.maxUsdPerMatch) {
      this.abort('spend', `per-match Jev spend cap reached: $${this.costUsd.toFixed(4)} of $${this.limits.maxUsdPerMatch}`);
    }
  }

  summary() {
    return { calls: this.calls, unanswered: { ...this.unanswered }, tokensIn: this.tokensIn, costUsd: Math.round(this.costUsd * 1e6) / 1e6, doors: { ...this.doors } };
  }
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
   * @param opts.backends    { id: {kind:'mock'|'http'|'jev-schema-http', endpoint?, model?, avgSecPerCall?, timeoutSec?,
   *                         ...JEV_DEFAULTS keys on a Jev backend} }
   * @param opts.headless    the bundle from `loadHeadless()`
   * @param opts.dataDir     runs/arena
   * @param opts.promptStore PromptStore
   * @param opts.house       { handle, hash, file, backend?, schemas?, schemasFile?, schemasHash? } --
   *                         `schemas` is what the house plays on a Jev backend; `backend` names a `kind: "jev-http"`
   *                         entry in `opts.backends` that plays the house side only (see
   *                         `decisionPilotFor` below); unset by default
   * @param opts.schemaCache SchemaCache (`schemas.mjs`) — compiles entrant prose for Jev backends
   * @param opts.map         map variant name for every match (`tournament.map`); unset = the runner's DEFAULT_MAP
   * @param opts.objective   river objective name for every match (`tournament.objective`, e.g. `river-1` or
   *                         `none`); unset = the runner's DEFAULT_OBJECTIVE
   * @param opts.recall      recall rule name for every match (`tournament.recall`, e.g. `recall-2` or
   *                         `none`); unset = the runner's DEFAULT_RECALL (the specimen's 3x run home)
   * @param opts.finale      finale name for every match (`tournament.finale`, e.g. `final-chorus-1` or
   *                         `none`); unset = the runner's DEFAULT_FINALE (none: play to 10:00)
   * @param opts.towerAggro  tower aggro rule name for every match (`tournament.towerAggro`, e.g. `aggro-1`
   *                         or `none`); unset = the runner's DEFAULT_TOWER_AGGRO (the specimen's towers)
   * @param opts.live        LiveHub (optional) — running jobs stream their events into it
   * @param opts.economy     economy ruleset name for every match (`tournament.economy`, src/economy.ts);
   *                         null/unset = none (the default until the go/no-go gate)
   * @param opts.hooks       test seams: `afterRun(log, job)` may replace the log before verify;
   *                         `callModelFor(job)` replaces the adapter; `wallCapMs` overrides the cap
   */
  constructor({ ledger, backends, headless, dataDir, promptStore, house, schemaCache = null, map = null, live = null, economy = null, objective = null, recall = null, finale = null, towerAggro = null, log = console, hooks = {} }) {
    this.ledger = ledger;
    this.backends = backends;
    this.headless = headless;
    this.dataDir = dataDir;
    this.logsDir = path.join(dataDir, 'logs');
    this.scratchDir = path.join(dataDir, 'scratch');
    this.promptStore = promptStore;
    this.house = house;
    this.schemaCache = schemaCache;
    this.map = map;
    this.objective = objective;
    this.recall = recall;
    this.finale = finale;
    this.towerAggro = towerAggro;
    this.live = live;
    this.economy = economy;
    this.log = log;
    this.hooks = hooks;
    /** id → { startedAt, progress } for jobs in flight */
    this.running = new Map();
    this.stopped = false;
    this.wakers = new Set();
    this.workers = [];
    /** backendId → {reason, since}: why its worker is holding queued matches (shown on /matches) */
    this.holds = new Map();
  }

  /** Record (or clear, with null) why `backendId`'s worker is not starting matches; logs each change once. */
  hold(backendId, reason) {
    const prev = this.holds.get(backendId);
    if (!reason) {
      if (prev) this.log.info(`arena: backend ${backendId} is starting matches again`);
      this.holds.delete(backendId);
      return;
    }
    if (prev?.reason === reason) return;
    this.holds.set(backendId, { reason, since: new Date().toISOString() });
    this.log.warn(`arena: backend ${backendId} holding queued matches: ${reason}`);
  }

  /**
   * Why a Jev backend must not start a match now (wrong server, one too old for the targeting rule,
   * its own cap, today's budget), or null.
   */
  jevHoldReason(backendId, backend, health) {
    if (health?.backend !== 'jev-schema') {
      return `${backend.endpoint} is not a Jev schema server (its /health says backend=${JSON.stringify(health?.backend ?? null)}); start python tools/jev/schema_server.py there`;
    }
    const unsupported =
      this.headless.targetingUnsupported(health, this.headless.DEFAULT_TARGETING) ??
      // entrants compile under the default vocabulary (tools/jev/compile.py --vocab); the house is vocab-1
      this.headless.vocabUnsupported(health, [this.headless.DEFAULT_VOCAB]);
    if (unsupported) return `${backend.endpoint}: ${unsupported}`;
    if (health.budget_usd != null && health.cost_usd >= health.budget_usd) {
      return `the schema server's own --budget-usd $${health.budget_usd} is spent; restart it to reset`;
    }
    const cap = backend.dailyBudgetUsd === undefined ? JEV_DEFAULTS.dailyBudgetUsd : backend.dailyBudgetUsd;
    const spent = jevSpentToday(this.state, backendId);
    if (cap != null && spent >= cap) return `daily Jev budget reached: $${spent.toFixed(4)} of $${cap} today (Central Time); queued matches start again tomorrow or when dailyBudgetUsd is raised`;
    return null;
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
      if (isJevBackend(backend)) {
        let why;
        try {
          probe = { ...(await probeBackend(backend.endpoint)), kind: 'jev-schema-http' };
          why = this.jevHoldReason(backendId, backend, probe.health);
        } catch {
          why = `Jev schema server not reachable at ${backend.endpoint}; retrying every 30 s`;
        }
        if (why) {
          this.hold(backendId, why);
          await this.sleepUntilWoken(30000);
          continue;
        }
        this.hold(backendId, null);
      }
      await this.runJob(job, backend, probe);
    }
  }

  /**
   * SHADOW ONLY as of 2026-09-23 (runs/jev-house-bot-2026-09-23.md): `undefined` unless
   * `config.house.backend` names a `kind: "jev-http"` backend (validated in `server.mjs::
   * loadConfig`), in which case the house-playing side of `job` -- and only that side -- decides
   * through Jev instead of `job.backendId`'s text-prompt model. The other side keeps its normal
   * `callModelFor`/`PromptPilot` path via `headless.ts`'s fallback when this returns `undefined` for
   * a bot index. Text-model backends only: on a `jev-schema-http` backend both sides play compiled
   * schemas (`runJob`), and neither this nor `house.backend` is consulted.
   */
  decisionPilotFor(job) {
    const houseFor = this.houseJevPilotFor(job);
    const practiceFor = this.practicePilotFor(job);
    if (!houseFor && !practiceFor) return undefined;
    return (botIndex, team, currentTick) => practiceFor?.(botIndex, team, currentTick) ?? houseFor?.(botIndex, team, currentTick);
  }

  houseJevPilotFor(job) {
    const backendId = this.house?.backend;
    const backend = backendId ? this.backends[backendId] : null;
    if (!backend) return undefined;
    const houseSide = job.sides.violet?.house ? 'violet' : job.sides.green?.house ? 'green' : null;
    if (!houseSide) return undefined;
    let pilot = null;
    return (botIndex, team, currentTick) => {
      if (team !== houseSide) return undefined;
      pilot ??= this.headless.jevTracingPilot({ endpoint: backend.endpoint, timeoutSec: backend.timeoutSec }, currentTick);
      return pilot;
    };
  }

  /**
   * Compile panel practice match (docs/entrant-compile-preview.md): the side marked `practice`
   * decides through Jev on the rules its prose compiled to (`job.practice.schemas`, one per
   * instrument) via `tools/jev/schema_server.py`, instead of the text prompt it carries for display.
   */
  practicePilotFor(job) {
    if (!job.practice) return undefined;
    const backend = this.backends[job.practice.backend];
    if (!backend) throw new Error(`practice backend ${job.practice.backend} is not configured`);
    const side = job.sides.violet?.practice ? 'violet' : job.sides.green?.practice ? 'green' : null;
    if (!side) return undefined;
    const pilot = this.headless.jevSchemaTracingPilot({ endpoint: backend.endpoint, timeoutSec: backend.timeoutSec, schemas: job.practice.schemas, map: this.map });
    return (botIndex, team) => (team === side ? pilot : undefined);
  }

  /**
   * The shopping list a bot buys in an economy match: the `build` its side's compiled schema carries
   * (a Jev match's schemas, or a practice side's own compile), else undefined = the instrument default.
   */
  buildFor(job, sides, botIndex) {
    const team = botIndex < 3 ? 'violet' : 'green';
    const schemas = sides[team]?.schemas ?? (job.sides[team]?.practice ? job.practice?.schemas : undefined);
    return schemas?.[['drums', 'keytar', 'violin'][botIndex % 3]]?.build;
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

  /**
   * The compiled schemas `team` plays on Jev, and where they came from: the practice job's own
   * compile, the house's checked-in tier schemas, or the entrant's prose through the compile cache.
   */
  async schemasForSide(job, team, side) {
    const ref = job.sides[team];
    if (ref.practice && job.practice?.schemas) {
      return { schemas: job.practice.schemas, source: { kind: 'practice', compiledWith: job.practice.compiledWith ?? null } };
    }
    if (ref.house) {
      if (!this.house?.schemas) throw new Error('the house has no compiled schemas to play on Jev (config.house.schemas / tier)');
      return { schemas: this.house.schemas, source: { kind: 'house', file: this.house.schemasFile, hash: this.house.schemasHash } };
    }
    if (!this.schemaCache) throw new Error('no schema cache: this arena cannot compile prose for Jev');
    const c = await this.schemaCache.schemasFor(side.promptText);
    return {
      schemas: c.schemas,
      source: { kind: 'compiled', promptHash: c.hash, compilerVersion: c.compilerVersion, cached: c.cached, compiledWith: c.backend, ...(c.usage ? { compileUsage: c.usage } : {}) },
    };
  }

  /** Re-queue a failed or voided job once, as a new match id (`retryOf`); a retry is never retried. */
  requeueOnce(job, id) {
    if (job.retryOf) return null;
    const { id: _id, status, attempt: _a, createdAt, startedAt: _s, ...copy } = job;
    const scratchSide = [job.sides.violet, job.sides.green].find((s) => s.scratch);
    const f = path.join(this.scratchDir, `${id}.md`);
    const scratchText = scratchSide && existsSync(f) ? readFileSync(f, 'utf8') : undefined;
    if (scratchSide && scratchText === undefined) return null;
    const retryId = this.enqueue({ ...copy, retryOf: id, scratchText });
    this.log.warn(`arena: ${id} re-queued once as ${retryId}`);
    return retryId;
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
    const stream = this.live?.open(id) ?? null;
    const ac = new AbortController();
    let abortWhy = null;
    const abort = (why, reason) => {
      if (abortWhy) return;
      abortWhy = { why, reason };
      ac.abort();
    };
    let timer = null;
    let ended = null;
    let meter = null;
    try {
      const sides = { violet: this.resolveSide(job.sides.violet, id, 'violet'), green: this.resolveSide(job.sides.green, id, 'green') };
      let callModelFor;
      let logBackend;
      let jevPilotFor = null;
      if (isJevBackend(backend)) {
        const limits = { ...JEV_DEFAULTS, ...pick(backend, Object.keys(JEV_DEFAULTS)) };
        const compile = {};
        for (const team of ['violet', 'green']) {
          const { schemas, source } = await this.schemasForSide(job, team, sides[team]);
          sides[team] = { ...sides[team], schemas, schemaSource: source };
          compile[team] = source;
        }
        meter = new JevMeter(limits, abort);
        meter.compile = compile;
        logBackend = { ...probe, arenaBackend: job.backendId, model: probe.health?.model ?? backend.model, jevBackend: probe.health?.jev_backend ?? null };
        callModelFor = (i) => {
          throw new Error(`bearbot ${i} has no compiled schema; a Jev match never falls back to a text model`);
        };
        const pilots = {};
        jevPilotFor = (_botIndex, team) =>
          (pilots[team] ??= meter.wrap(team, this.headless.jevSchemaTracingPilot({ endpoint: backend.endpoint, timeoutSec: backend.timeoutSec, schemas: sides[team].schemas, map: this.map })));
      } else if (backend.kind === 'mock') {
        logBackend = { kind: 'mock', arenaBackend: job.backendId, model: backend.model ?? 'mock' };
        callModelFor = (i) => this.headless.mockCallModel(100 + i);
      } else {
        logBackend = { ...probe, arenaBackend: job.backendId, model: probe.health?.model ?? backend.model };
        const call = httpCallModel(backend.endpoint, backend.timeoutSec ?? 60);
        callModelFor = () => call;
      }
      if (this.hooks.callModelFor && !jevPilotFor) callModelFor = this.hooks.callModelFor(job);
      const decisionPilotFor = jevPilotFor ?? (this.hooks.decisionPilotFor ? this.hooks.decisionPilotFor(job) : this.decisionPilotFor(job));
      const avgSecPerCall = Math.max(backend.avgSecPerCall ?? 0.9, job.practice ? this.backends[job.practice.backend]?.avgSecPerCall ?? 0.9 : 0);
      const capMs = this.hooks.wallCapMs ?? wallCapMs({ maxSimSec: job.maxSimSec, cadenceSec: job.cadenceSec, avgSecPerCall });
      timer = setTimeout(() => abort('wall', `wall-clock cap ${Math.round(capMs / 1000)}s`), capMs);
      this.log.info(
        `arena: ${id} start ${sides.violet.name} vs ${sides.green.name} seed=${job.seed} cadence=${job.cadenceSec} ` +
          `max=${job.maxSimSec}s backend=${backendLabel(logBackend)} cap=${Math.round(capMs / 1000)}s`,
      );
      let log = await this.headless.runMatch({
        seed: job.seed,
        sides,
        callModelFor,
        decisionPilotFor,
        cadenceSec: job.cadenceSec,
        maxSimSec: job.maxSimSec,
        economy: this.economy ?? 'none',
        buildFor: (i) => this.buildFor(job, sides, i),
        backend: logBackend,
        // the schema pilots resolve targets under the runner's default rule (jevSchemaPilot.ts)
        ...(isJevBackend(backend) || job.practice ? { targeting: this.headless.DEFAULT_TARGETING } : {}),
        ...(this.map ? { map: this.map } : {}),
        ...(this.objective ? { objective: this.objective } : {}),
        ...(this.recall ? { recall: this.recall } : {}),
        ...(this.finale ? { finale: this.finale } : {}),
        ...(this.towerAggro ? { towerAggro: this.towerAggro } : {}),
        flush,
        signal: ac.signal,
        onProgress: (p) => {
          const r = this.running.get(id);
          if (r) r.progress = p;
          stream?.push('progress', p);
        },
        onStart: (l) => stream?.push('meta', metaOf(l)),
        onDecision: (d) => stream?.push('decision', d),
        onRound: (r) => stream?.push('round', r),
        onCheckpoint: (c) => stream?.push('checkpoint', c),
        onDeath: (d) => stream?.push('death', d),
      });
      clearTimeout(timer);
      const wallMs = Date.now() - startedAt;
      if (this.hooks.afterRun) log = (await this.hooks.afterRun(log, job)) ?? log;
      const jev = meter ? { ...meter.summary(), compile: meter.compile } : null;
      if (jev) log.backend = { ...log.backend, jev: meter.summary() };
      stream?.push('result', log.result);
      mkdirSync(this.logsDir, { recursive: true });
      if (ac.signal.aborted) {
        writeFileSync(path.join(this.logsDir, `${id}.json`), JSON.stringify(log) + '\n');
        const { why, reason } = abortWhy ?? { why: 'wall', reason: `wall-clock cap ${Math.round(capMs / 1000)}s` };
        if (why === 'wall') {
          this.ledger.append({ type: 'timed-out', id, wallMs, reason, ...(jev ? { jev } : {}) });
          ended = { status: 'timed-out', reason };
          this.log.warn(`arena: ${id} timed out after ${Math.round(wallMs / 1000)}s`);
          return;
        }
        this.ledger.append({ type: 'failed', id, error: reason, wallMs, ...(jev ? { jev } : {}) });
        ended = { status: 'failed', reason };
        this.log.warn(`arena: ${id} failed: ${reason}`);
        if (why === 'unanswered') this.requeueOnce(job, id);
        return;
      }
      if (jev) {
        const { maxUnansweredRate } = { ...JEV_DEFAULTS, ...pick(backend, ['maxUnansweredRate']) };
        const over = ['violet', 'green'].filter((t) => {
          const st = log.result.stats[t];
          return maxUnansweredRate != null && st.calls > 0 && st.callErrors / st.calls > maxUnansweredRate;
        });
        if (over.length) {
          writeFileSync(path.join(this.logsDir, `${id}.json`), JSON.stringify(log) + '\n');
          const reason =
            `Jev left too many decisions unanswered: ${over.map((t) => `${t} ${log.result.stats[t].callErrors} of ${log.result.stats[t].calls}`).join(', ')}` +
            ` (limit ${(maxUnansweredRate * 100).toFixed(0)}%)${meter.lastError ? `; last: ${meter.lastError.slice(0, 160)}` : ''}`;
          this.ledger.append({ type: 'failed', id, error: reason, wallMs, jev });
          ended = { status: 'failed', reason };
          this.log.warn(`arena: ${id} failed: ${reason}`);
          this.requeueOnce(job, id);
          return;
        }
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
          ...(jev ? { jev } : {}),
        });
        this.log.warn(`arena: ${id} REPLAY DIVERGED (tick ${v.firstDivergenceTick}); voided`);
        ended = { status: 'void', reason: `replay diverged at tick ${v.firstDivergenceTick ?? 'end'}` };
        this.requeueOnce(job, id);
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
        ...(jev ? { jev } : {}),
      });
      ended = { status: 'finished', verify: { checkpointsCompared: v.checkpointsCompared, ticks: v.ticks } };
      const jevNote = jev ? ` jev=$${jev.costUsd.toFixed(4)} doors=${JSON.stringify(jev.doors)}` : '';
      this.log.info(`arena: ${id} done winner=${log.result.winner ?? 'draw'} by=${log.result.endReason ?? 'unfinished'} wall=${Math.round(wallMs / 1000)}s verified=${v.checkpointsCompared} checkpoints${jevNote}`);
    } catch (err) {
      if (timer) clearTimeout(timer);
      const error = String(err?.message ?? err);
      this.ledger.append({ type: 'failed', id, error, ...(meter ? { jev: { ...meter.summary(), compile: meter.compile } } : {}) });
      ended = { status: 'failed', reason: error };
      if (err instanceof CompileFailed) {
        this.log.warn(`arena: ${id} failed: ${error}`);
        this.requeueOnce(job, id);
      } else {
        this.log.error(`arena: ${id} failed: ${err?.stack ?? err}`);
      }
    } finally {
      this.running.delete(id);
      this.forgetScratch(id);
      if (stream) {
        stream.end(ended ?? { status: 'failed', reason: 'no terminal row' });
        this.live.close(id);
      }
    }
  }
}

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
}
