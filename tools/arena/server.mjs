#!/usr/bin/env node
/**
 * Elysium — the promptlane arena (docs/arena-site-spec.md §6, docs/arena-runbook.md). Phase A: the
 * pre-jam ladder. Phase B: the live view (`GET /api/matches/<id>/events`, SSE) and the jam-day
 * bracket (`/bracket`, `/api/brackets/…`).
 *
 * Canonical host is `elysium.<zone>` (ruling Q16); a request arriving with Host `arena.<zone>` is
 * answered 301 → `https://elysium.<zone>` before anything else (`hostRedirect`). Paths and code
 * identifiers (`tools/arena/`, `runs/arena/`) keep the old word — paths are not the name.
 *
 *   node tools/arena/server.mjs --dev-user you@example.com            # local, no Access, organizer
 *   ARENA_ACCESS_AUD=… ARENA_ACCESS_TEAM=… node tools/arena/server.mjs  # behind Cloudflare Access
 *
 * One process, standard library only: HTTP + server-rendered pages, the match queue running the
 * headless runner in-process, the append-only ledger, and the entrants-repo poller. Always binds
 * 127.0.0.1 — the only way in from outside is the Cloudflare Tunnel, and role comes from the
 * Access JWT alone (`auth.mjs`). Static: the Vite build under `/play/` (replays), logs under
 * `/logs/`, the logo under `/assets/logo/`.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadHeadless, resultLine } from '../match/load.mjs';
import { AuthError, makeAuth } from './auth.mjs';
import { DEFAULT_HOUSE_FILES, bundleHouse, candidateLabel, pickHouse } from './house.mjs';
import { Ledger, bracketIds, bracketView, dayCT, isHeld, pendingPlacements, queued as queuedJobs, quotaUsed, standings } from './ledger.mjs';
import { LiveHub, eventsFromLog, serveSse, sseFollow, sseFrame, sseHead } from './live.mjs';
import { PromptStore, hashPrompt, isHandle, makeEntrantsSource, validatePromptText } from './prompts.mjs';
import { Queue } from './queue.mjs';
import { bracketMatchSeed, bracketPlan, placementPlan } from './rating.mjs';
import { adminPage } from './pages/admin.mjs';
import { bracketPage } from './pages/bracket.mjs';
import { homePage } from './pages/home.mjs';
import { ladderPage } from './pages/ladder.mjs';
import { esc, page } from './pages/layout.mjs';
import { matchPage, matchesPage } from './pages/matches.mjs';
import { testPage } from './pages/test.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG = path.join(HERE, 'config.example.json');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function makeLog(quiet) {
  const stamp = () => new Date().toISOString().slice(11, 19);
  return {
    info: (m) => !quiet && console.error(`${stamp()} ${m}`),
    warn: (m) => console.error(`${stamp()} WARN ${m}`),
    error: (m) => console.error(`${stamp()} ERROR ${m}`),
  };
}

export function loadConfig(file, overrides = {}) {
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  if (overrides.backend) cfg.tournament.backend = overrides.backend;
  if (overrides.entrantsDir) cfg.entrants = { kind: 'dir', path: overrides.entrantsDir, syncIntervalSec: cfg.entrants?.syncIntervalSec ?? 60 };
  if (overrides.organizerEmail) cfg.organizerEmail = overrides.organizerEmail;
  if (!cfg.backends[cfg.tournament.backend]) throw new Error(`tournament backend ${cfg.tournament.backend} is not in config.backends`);
  return cfg;
}

/** Read up to 64 KB of body; JSON or form-encoded → plain object. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new HttpError(413, 'body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const ct = req.headers['content-type'] ?? '';
      try {
        if (ct.includes('application/json')) resolve(raw ? JSON.parse(raw) : {});
        else resolve(Object.fromEntries(new URLSearchParams(raw)));
      } catch {
        reject(new HttpError(400, 'bad request body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json' };

function sendFile(res, file, { cache = 'no-cache' } = {}) {
  const st = statSync(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache });
  res.end(readFileSync(file));
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj) + '\n');
}

function redirect(res, to) {
  res.writeHead(303, { Location: to });
  res.end();
}

/**
 * Ruling Q16: `elysium.<zone>` is canonical and `arena.<zone>` redirects to it. The Cloudflare-side
 * redirect rule (runbook §2) normally answers first; this is the same answer from the origin in
 * case a request on the old host reaches it (a tunnel ingress still pointing here). Returns the
 * absolute URL to send a 301 to, or null when the host is already right.
 */
export function hostRedirect(host, url) {
  const m = /^arena\.([^:/]+)(:\d+)?$/i.exec(String(host ?? '').trim());
  if (!m) return null;
  return `https://elysium.${m[1].toLowerCase()}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Under `root` and no `..` — the only path check static serving needs. */
function safeJoin(root, rel) {
  const p = path.normalize(path.join(root, rel));
  if (!p.startsWith(root + path.sep) && p !== root) return null;
  return p;
}

/**
 * Build the arena. Returns `{ server, queue, ledger, sync, listen, close }`; `listen(port)`
 * resolves to the bound URL. Everything is injectable for the tests.
 */
export async function createArena({
  config,
  dataDir,
  devUser,
  accessAud = process.env.ARENA_ACCESS_AUD,
  accessTeam = process.env.ARENA_ACCESS_TEAM,
  organizerEmail = process.env.ARENA_ORGANIZER_EMAIL,
  fetchJson,
  sync: syncEnabled = true,
  hooks = {},
  log = makeLog(false),
  distDir = path.join(ROOT, 'dist'),
}) {
  const auth = makeAuth({ aud: accessAud, team: accessTeam, organizerEmail: organizerEmail ?? config.organizerEmail, devUser, fetchJson });
  const ledger = new Ledger(path.join(dataDir, 'ledger.jsonl')).load();
  const promptStore = new PromptStore(path.join(dataDir, 'prompts'));
  const tournament = config.tournament;
  const backends = config.backends;

  // House bot (Q13): the first candidate whose files exist — a {violet, green} pair (house-*.md,
  // one prompt per side) or a single file (house.md, then drums.md). See house.mjs.
  const houseHandle = config.house?.handle ?? 'house';
  const houseCandidate = pickHouse(config.house?.files ?? DEFAULT_HOUSE_FILES, ROOT);
  if (!houseCandidate) throw new Error('no house prompt found (config.house.files)');
  const houseFile = candidateLabel(houseCandidate);
  const houseText = bundleHouse(houseCandidate, ROOT);
  const houseHash = promptStore.save(houseHandle, houseText);
  if (ledger.state().house?.hash !== houseHash || ledger.state().house?.file !== houseFile) {
    ledger.append({ type: 'house', handle: houseHandle, hash: houseHash, file: houseFile });
  }
  const house = { handle: houseHandle, hash: houseHash, file: houseFile };
  const houseRef = { handle: houseHandle, hash: houseHash, house: true };
  log.info(`arena: house bot loaded from ${houseFile} (${houseHash.slice(0, 8)})`);

  if (JSON.stringify(ledger.state().tournament) !== JSON.stringify(tournament)) ledger.append({ type: 'tournament', tournament });

  const headless = await loadHeadless();
  const live = new LiveHub();
  const queue = new Queue({ ledger, backends, headless, dataDir, promptStore, house, live, log, hooks });

  // --- entrants sync ------------------------------------------------------------------------
  const source = makeEntrantsSource(config.entrants);
  const syncInfo = { describe: source.describe, lastAt: null, lastError: null, intervalSec: config.entrants.syncIntervalSec ?? 60 };
  let syncing = null;
  const sync = () => {
    if (syncing) return syncing;
    syncing = (async () => {
      try {
        const list = await source.fetch();
        const state = ledger.state();
        for (const e of list) {
          const problems = validatePromptText(e.text);
          if (problems.length) {
            log.warn(`arena: entrants/${e.handle}/pilot.md is invalid (${problems.join('; ')}); ignored`);
            continue;
          }
          const hash = hashPrompt(e.text);
          if (state.seenHashes.has(`${e.handle}:${hash}`)) continue;
          promptStore.save(e.handle, e.text);
          ledger.append({ type: 'prompt-seen', handle: e.handle, hash, commit: e.commit, blobSha: e.blobSha });
          for (const j of pendingPlacements(ledger.state(), e.handle)) queue.cancel(j.id, `superseded by ${hash.slice(0, 8)}`);
          const plan = placementPlan({ handle: e.handle, hash }, { seeds: tournament.placementSeeds, house: houseRef });
          const ids = plan.map((p) =>
            queue.enqueue({
              tournamentId: tournament.id,
              kind: 'placement',
              priority: 'placement',
              sides: p.sides,
              seed: p.seed,
              backendId: tournament.backend,
              cadenceSec: tournament.cadenceSec,
              maxSimSec: tournament.maxSimSec ?? 600,
              quick: false,
              ranked: true,
              requestedBy: null,
            }),
          );
          log.info(`arena: new prompt ${e.handle}@${hash.slice(0, 8)} → placements ${ids.join(', ')}`);
        }
        syncInfo.lastAt = new Date().toISOString();
        syncInfo.lastError = null;
      } catch (err) {
        syncInfo.lastError = String(err.message ?? err);
        log.warn(`arena: entrants sync failed: ${syncInfo.lastError}`);
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  };

  // --- test submission ----------------------------------------------------------------------
  function submitTest(user, body) {
    const state = ledger.state();
    const handle = String(body.handle ?? '').trim();
    if (!isHandle(handle)) throw new HttpError(400, 'handle must be letters, digits, . _ - (your GitHub login)');
    const holder = state.handles.get(handle);
    if (holder && holder !== user.email && !user.organizer) throw new HttpError(409, `handle ${handle} is already claimed by someone else — ask the organizer`);
    if (state.claims.get(user.email) !== handle) ledger.append({ type: 'claim', email: user.email, handle, by: user.email });

    const quick = body.kind !== 'full';
    const source = body.source === 'merged' ? 'merged' : 'scratch';
    let mine;
    let scratchText;
    if (source === 'merged') {
      const p = state.prompts.get(handle);
      if (!p) throw new HttpError(400, `no merged prompt for ${handle} yet — paste a scratch prompt, or merge entrants/${handle}/pilot.md`);
      mine = { handle, hash: p.hash };
    } else {
      scratchText = String(body.prompt ?? '').replace(/\r\n/g, '\n');
      const problems = validatePromptText(scratchText);
      if (problems.length) throw new HttpError(400, `prompt rejected: ${problems.join('; ')}`);
      mine = { scratch: true, handle };
    }
    let opponent;
    const opp = String(body.opponent ?? 'house');
    if (opp === 'house' || opp === houseHandle) opponent = houseRef;
    else {
      const p = state.prompts.get(opp);
      if (!p) throw new HttpError(400, `${opp} has no merged prompt to play against`);
      opponent = { handle: opp, hash: p.hash };
    }
    if (!user.organizer) {
      const used = quotaUsed(state, handle, dayCT());
      if (used.active >= 1) throw new HttpError(429, 'you already have a test queued or running — one at a time');
      const limit = quick ? tournament.quota.quick : tournament.quota.full;
      const n = quick ? used.quick : used.full;
      if (n >= limit) throw new HttpError(429, `daily quota reached: ${n}/${limit} ${quick ? 'quick' : 'full'} tests today (Central Time)`);
    }
    const id = queue.enqueue({
      tournamentId: tournament.id,
      kind: 'test',
      priority: 'test',
      sides: { violet: mine, green: opponent },
      seed: quick ? tournament.quick.seed ?? 7 : tournament.placementSeeds[0],
      backendId: tournament.backend,
      cadenceSec: quick ? tournament.quick.cadenceSec : tournament.cadenceSec,
      maxSimSec: quick ? tournament.quick.maxSimSec : tournament.maxSimSec ?? 600,
      quick,
      ranked: !quick && source === 'merged',
      requestedBy: { email: user.email, handle },
      scratchText,
    });
    return { id, position: positionOf(id) };
  }

  function positionOf(id) {
    const list = queuedJobs(ledger.state(), queue.running);
    const i = list.findIndex((j) => j.id === id);
    return i < 0 ? 0 : i + 1;
  }

  function jobView(j) {
    const { ...v } = j;
    if (v.sides) v.sides = Object.fromEntries(Object.entries(v.sides).map(([t, ref]) => [t, ref.scratch ? { scratch: true, handle: ref.handle } : ref]));
    return v;
  }

  function userFor(identity) {
    return { ...identity, handle: ledger.state().claims.get(identity.email) ?? null };
  }

  /**
   * Q9: a pre-run bracket round is held — its matches are invisible to everyone but the organizer
   * until the round is revealed, because even "who plays in round 2" gives away round 1.
   */
  function heldFrom(state, job, user) {
    return !user.organizer && isHeld(state, job);
  }
  function visibleJobs(state, user) {
    return [...state.jobs.values()].filter((j) => !heldFrom(state, j, user));
  }
  function heldCount(state, user) {
    return user.organizer ? 0 : [...state.jobs.values()].filter((j) => isHeld(state, j)).length;
  }
  function requireVisible(state, job, user) {
    if (!job) throw new HttpError(404, 'no such match');
    if (heldFrom(state, job, user)) throw new HttpError(403, 'this match is a pre-run bracket match, held until the organizer reveals the round on jam day');
    return job;
  }
  /** The bracket as a non-organizer may see it: held rounds lose their results, later rounds their names. */
  function publicBracket(view, user) {
    if (!view || user.organizer) return view;
    const firstHeld = view.rounds.find((r) => r.held)?.round ?? Infinity;
    const rounds = view.rounds.map((r) => ({
      ...r,
      slots: r.slots.map((slot) => {
        if (r.round > firstHeld) return { ...slot, a: null, b: null, seedA: null, seedB: null, jobs: [], current: null, ruling: null, winner: null, by: null, status: 'hidden' };
        if (r.held && slot.status !== 'bye' && slot.status !== 'waiting') return { ...slot, jobs: [], current: null, ruling: null, winner: null, by: null, status: slot.status === 'ready' ? 'ready' : 'held' };
        return slot;
      }),
    }));
    return { ...view, rounds, champion: firstHeld === Infinity ? view.champion : null };
  }

  function enqueueSlot(view, slot, user, rerun = 0) {
    return queue.enqueue({
      tournamentId: view.tournamentId,
      kind: 'bracket',
      priority: 'bracket',
      sides: { violet: { handle: slot.seedA.handle, hash: slot.seedA.hash }, green: { handle: slot.seedB.handle, hash: slot.seedB.hash } },
      seed: bracketMatchSeed(view.seedBase, slot.round, slot.slot, rerun),
      backendId: view.backend,
      cadenceSec: view.cadenceSec,
      maxSimSec: view.maxSimSec,
      quick: false,
      ranked: false,
      requestedBy: { email: user.email, handle: null },
      bracket: { tournamentId: view.tournamentId, round: slot.round, slot: slot.slot, seeds: { violet: slot.a, green: slot.b }, rerun },
    });
  }

  function createBracket(user, body) {
    const state = ledger.state();
    const id = String(body.id ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(id)) throw new HttpError(400, 'tournament id: lowercase letters, digits, dashes');
    if (id === tournament.id || state.brackets.has(id)) throw new HttpError(409, `tournament ${id} already exists`);
    const backend = String(body.backend ?? tournament.backend);
    if (!backends[backend]) throw new HttpError(400, `unknown backend ${backend}`);
    const num = (k, dflt, min) => {
      const v = body[k] === undefined || body[k] === '' ? dflt : Number(body[k]);
      if (!Number.isFinite(v) || v < min) throw new HttpError(400, `${k} must be a number ≥ ${min}`);
      return v;
    };
    const cadenceSec = num('cadenceSec', 2, 0.5);
    const maxSimSec = num('maxSimSec', 600, 30);
    const preRunRounds = num('preRunRounds', 2, 0);
    const seedBase = num('seedBase', 2026, 0);
    const top = body.top === undefined || body.top === '' ? Infinity : num('top', Infinity, 2);
    const rows = standings(state).filter((r) => r.hash).slice(0, top);
    let plan;
    try {
      plan = bracketPlan(rows.map((r) => ({ handle: r.handle, hash: r.hash, elo: r.elo })));
    } catch (err) {
      throw new HttpError(400, err.message);
    }
    ledger.append({ type: 'bracket', tournamentId: id, name: String(body.name ?? '').trim() || id, backend, cadenceSec, maxSimSec, preRunRounds, seedBase, size: plan.size, seeds: plan.seeds, rounds: plan.rounds, by: user.email });
    log.info(`arena: bracket ${id} created: ${plan.seeds.length} seeds in a field of ${plan.size}, backend=${backend} cadence=${cadenceSec}`);
    return bracketView(ledger.state(), id);
  }

  // --- router -------------------------------------------------------------------------------
  async function handle(req, res) {
    const to = hostRedirect(req.headers.host, req.url);
    if (to) {
      res.writeHead(301, { Location: to, 'Cache-Control': 'public, max-age=86400' });
      return res.end();
    }
    const url = new URL(req.url, 'http://arena');
    const p = url.pathname;
    const method = req.method;

    // Static assets that need no identity to be useful and leak nothing: the logo.
    if (method === 'GET' && p.startsWith('/assets/')) {
      const rel = p.slice('/assets/'.length);
      const fromDist = safeJoin(path.join(distDir, 'assets'), rel);
      if (fromDist && existsSync(fromDist) && statSync(fromDist).isFile()) return sendFile(res, fromDist, { cache: 'public, max-age=31536000, immutable' });
      const fromRepo = safeJoin(path.join(ROOT, 'assets', 'logo'), rel.replace(/^logo\//, ''));
      if (rel.startsWith('logo/') && fromRepo && existsSync(fromRepo) && statSync(fromRepo).isFile()) return sendFile(res, fromRepo, { cache: 'public, max-age=86400' });
      throw new HttpError(404, 'not found');
    }

    const identity = await auth.identify(req);
    const user = userFor(identity);

    if (method === 'GET' && p === '/api/me') return sendJson(res, user);
    if (method === 'GET' && p === '/') {
      const state = ledger.state();
      const q = queuedJobs(state, queue.running);
      return sendHtml(res, homePage({
        user,
        tournament,
        house,
        backend: { id: tournament.backend, ...backends[tournament.backend] },
        counts: { entrants: state.prompts.size, finished: state.finished.length, queued: q.length, running: queue.running.size },
      }));
    }
    if (p === '/test' && method === 'GET') {
      const state = ledger.state();
      return sendHtml(res, testPage({
        user,
        tournament,
        handles: [...state.prompts.keys()],
        myPrompt: user.handle ? state.prompts.get(user.handle) : null,
        quota: user.handle ? quotaUsed(state, user.handle) : { quick: 0, full: 0, active: 0 },
        flash: url.searchParams.get('err') ? { ok: false, text: url.searchParams.get('err') } : null,
      }));
    }
    if (p === '/test' && method === 'POST') {
      const body = await readBody(req);
      try {
        const { id } = submitTest(user, body);
        return redirect(res, `/matches/${id}`);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const state = ledger.state();
        const handleTyped = isHandle(String(body.handle ?? '')) ? String(body.handle) : user.handle;
        return sendHtml(res, testPage({
          user,
          tournament,
          handles: [...state.prompts.keys()],
          myPrompt: handleTyped ? state.prompts.get(handleTyped) : null,
          quota: handleTyped ? quotaUsed(state, handleTyped) : { quick: 0, full: 0, active: 0 },
          flash: { ok: false, text: err.message },
          draft: body,
        }), err.status);
      }
    }
    if (p === '/api/tests' && method === 'POST') {
      const body = await readBody(req);
      const out = submitTest(user, body);
      return sendJson(res, out, 202);
    }
    if (p === '/ladder' && method === 'GET') {
      const state = ledger.state();
      const placing = new Set(queuedJobs(state, queue.running).concat([...state.jobs.values()].filter((j) => j.status === 'started')).filter((j) => j.kind === 'placement').flatMap((j) => [j.sides.violet, j.sides.green].filter((r) => !r.house).map((r) => r.handle)));
      return sendHtml(res, ladderPage({ user, rows: standings(state), house, placing }));
    }
    if (p === '/api/ladder' && method === 'GET') return sendJson(res, { tournament: tournament.id, house, rows: standings(ledger.state()) });
    if (p === '/matches' && method === 'GET') {
      const state = ledger.state();
      const visible = (j) => !heldFrom(state, j, user);
      const q = queuedJobs(state, queue.running).filter(visible);
      const running = [...queue.running.keys()].map((id) => state.jobs.get(id)).filter((j) => j && visible(j)).map((j) => ({ ...j, progress: queue.running.get(j.id)?.progress ?? null }));
      const recent = visibleJobs(state, user).filter((j) => j.status !== 'queued' && !queue.running.has(j.id)).sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt)).slice(0, 50);
      return sendHtml(res, matchesPage({ user, queue: q, running, recent, paused: state.paused, held: heldCount(state, user) }));
    }
    if (p === '/api/matches' && method === 'GET') {
      const state = ledger.state();
      const visible = (j) => !heldFrom(state, j, user);
      return sendJson(res, {
        paused: state.paused,
        running: [...queue.running.keys()].filter((id) => visible(state.jobs.get(id))),
        queued: queuedJobs(state, queue.running).filter(visible).map((j) => j.id),
        held: heldCount(state, user),
        jobs: visibleJobs(state, user).map(jobView),
      });
    }
    let m = /^\/api\/matches\/([A-Za-z0-9._-]+)\/events$/.exec(p);
    if (m && method === 'GET') {
      const state = ledger.state();
      const job = requireVisible(state, state.jobs.get(m[1]), user);
      const stream = live.get(job.id);
      if (stream) return serveSse(req, res, stream);
      if (job.status === 'queued' || job.status === 'started') {
        // not started yet (or waiting to re-run after a restart): hold the socket, attach when it opens
        sseHead(res);
        res.write(sseFrame({ id: 0, event: 'waiting', data: { status: job.status, position: positionOf(job.id) } }));
        const ka = setInterval(() => !res.writableEnded && res.write(': keep-alive\n\n'), 15000);
        ka.unref?.();
        const cancel = live.whenOpen(job.id, (s) => {
          clearInterval(ka);
          sseFollow(req, res, s);
        });
        res.on('close', () => {
          clearInterval(ka);
          cancel();
        });
        return;
      }
      const f = [path.join(queue.logsDir, `${job.id}.json`), path.join(queue.logsDir, `${job.id}.diverged.json`)].find((x) => existsSync(x));
      if (!f) throw new HttpError(404, `no log for ${job.id} (${job.status})`);
      const logObj = JSON.parse(readFileSync(f, 'utf8'));
      return serveSse(req, res, eventsFromLog(logObj, { status: job.status, reason: job.reason ?? null, verify: job.verify ?? null }));
    }
    m = /^\/(api\/)?matches\/([A-Za-z0-9._-]+)$/.exec(p);
    if (m && method === 'GET') {
      const state = ledger.state();
      const job = requireVisible(state, state.jobs.get(m[2]), user);
      if (m[1]) return sendJson(res, { ...jobView(job), live: queue.running.get(job.id) ?? null });
      let resultText = '';
      if (job.status === 'finished') {
        const f = path.join(queue.logsDir, `${job.id}.json`);
        if (existsSync(f)) resultText = resultLine(JSON.parse(readFileSync(f, 'utf8')));
      }
      return sendHtml(res, matchPage({ user, job, live: queue.running.get(job.id), resultText, position: positionOf(job.id) }));
    }
    m = /^\/logs\/([A-Za-z0-9._-]+\.json)$/.exec(p);
    if (m && method === 'GET') {
      const state = ledger.state();
      requireVisible(state, state.jobs.get(m[1].replace(/(\.diverged)?\.json$/, '')), user);
      const f = safeJoin(queue.logsDir, m[1]);
      if (!f || !existsSync(f)) throw new HttpError(404, 'no such log');
      return sendFile(res, f, { cache: 'public, max-age=3600' });
    }
    if (method === 'GET' && (p === '/play' || p.startsWith('/play/'))) {
      const index = path.join(distDir, 'index.html');
      if (!existsSync(index)) return sendHtml(res, page({ title: 'Replay', path: '/play', user, body: '<h1>Replay viewer not built</h1><p>Run <code>npm run build</code> on the arena host, then reload.</p>' }), 503);
      const rel = p === '/play' || p === '/play/' ? 'index.html' : p.slice('/play/'.length);
      const f = safeJoin(distDir, rel);
      if (f && existsSync(f) && statSync(f).isFile()) return sendFile(res, f);
      return sendFile(res, index);
    }

    // --- bracket (Phase B) ---------------------------------------------------------------------
    m = /^\/bracket(?:\/([a-z0-9-]+))?$/.exec(p);
    if (m && method === 'GET') {
      const state = ledger.state();
      const ids = bracketIds(state);
      const id = m[1] ?? ids[0];
      if (m[1] && !state.brackets.has(m[1])) throw new HttpError(404, 'no such bracket');
      const view = id ? publicBracket(bracketView(state, id), user) : null;
      return sendHtml(res, bracketPage({ user, view, others: ids.filter((x) => x !== id), flash: url.searchParams.get('msg') ? { ok: true, text: url.searchParams.get('msg') } : null }));
    }
    if (p === '/api/brackets' && method === 'GET') {
      const state = ledger.state();
      return sendJson(res, { brackets: bracketIds(state).map((id) => publicBracket(bracketView(state, id), user)) });
    }
    m = /^\/api\/brackets\/([a-z0-9-]+)$/.exec(p);
    if (m && method === 'GET') {
      const view = bracketView(ledger.state(), m[1]);
      if (!view) throw new HttpError(404, 'no such bracket');
      return sendJson(res, publicBracket(view, user));
    }

    // --- organizer ---------------------------------------------------------------------------
    if (p === '/admin' || p.startsWith('/api/queue/') || p === '/api/sync' || p === '/api/void' || p === '/api/claims' || /^\/api\/matches\/[^/]+\/cancel$/.test(p) || p.startsWith('/api/brackets')) {
      if (!user.organizer) throw new HttpError(403, 'organizer only');
      const state = ledger.state();
      if (p === '/admin' && method === 'GET') {
        return sendHtml(res, adminPage({
          user,
          paused: state.paused,
          sync: syncInfo,
          claims: state.claims,
          prompts: state.prompts,
          queue: queuedJobs(state, queue.running),
          running: [...queue.running.keys()],
          backends,
          ladder: standings(state).filter((r) => r.hash),
          brackets: bracketIds(state),
          tournament,
          flash: url.searchParams.get('msg') ? { ok: true, text: url.searchParams.get('msg') } : null,
        }));
      }
      if (method !== 'POST') throw new HttpError(405, 'method not allowed');
      const body = await readBody(req);
      const wantsJson = (req.headers.accept ?? '').includes('application/json') || (req.headers['content-type'] ?? '').includes('json');
      const done = (msg, to = '/admin', extra = {}) => (wantsJson ? sendJson(res, { ok: true, msg, ...extra }) : redirect(res, `${to}?msg=${encodeURIComponent(msg)}`));
      if (p === '/api/brackets') {
        const view = createBracket(user, body);
        return done(`bracket ${view.tournamentId} created: ${view.seeds.length} seeds, ${view.rounds.length} rounds`, `/bracket/${view.tournamentId}`, { bracket: view });
      }
      const br = /^\/api\/brackets\/([a-z0-9-]+)\/(rounds\/(\d+)\/(run|reveal)|slots\/(\d+)\/(\d+)\/(rerun|ruling))$/.exec(p);
      if (br) {
        const view = bracketView(state, br[1]);
        if (!view) throw new HttpError(404, 'no such bracket');
        const to = `/bracket/${view.tournamentId}`;
        if (br[3]) {
          const round = view.rounds[Number(br[3]) - 1];
          if (!round) throw new HttpError(404, 'no such round');
          if (br[4] === 'run') {
            const ids = round.slots.filter((s) => s.status === 'ready').map((s) => enqueueSlot(view, s, user));
            const waiting = round.slots.filter((s) => s.status === 'waiting').length;
            return done(`${round.name}: ${ids.length} match${ids.length === 1 ? '' : 'es'} queued${waiting ? `, ${waiting} slot${waiting === 1 ? '' : 's'} still waiting on the previous round` : ''}`, to, { ids });
          }
          if (round.round > view.preRunRounds) throw new HttpError(400, 'only pre-run rounds are held');
          if (!round.held) return done(`${round.name} is already revealed`, to);
          ledger.append({ type: 'bracket-reveal', tournamentId: view.tournamentId, round: round.round, by: user.email });
          return done(`${round.name} revealed`, to);
        }
        const slot = view.rounds[Number(br[5]) - 1]?.slots[Number(br[6])];
        if (!slot) throw new HttpError(404, 'no such slot');
        if (slot.a === null || slot.b === null) throw new HttpError(400, 'that slot has no two players yet');
        if (br[7] === 'rerun') {
          if (!['done', 'needs-rerun', 'ruled', 'ready'].includes(slot.status)) throw new HttpError(400, `slot is ${slot.status}; cancel or wait first`);
          const id = enqueueSlot(view, slot, user, slot.jobs.length);
          return done(`${id} queued as a re-run of round ${slot.round} slot ${slot.slot + 1}`, to, { id });
        }
        const winner = Number(body.winner);
        if (winner !== slot.a && winner !== slot.b) throw new HttpError(400, "winner must be one of the slot's two seeds");
        ledger.append({ type: 'ruling', tournamentId: view.tournamentId, round: slot.round, slot: slot.slot, winner, reason: String(body.reason ?? 'organizer ruling'), by: user.email });
        return done(`round ${slot.round} slot ${slot.slot + 1}: seed #${winner} advances by ruling`, to);
      }
      if (p === '/api/queue/pause') { queue.pause(user.email); return done('queue paused'); }
      if (p === '/api/queue/resume') { queue.resume(user.email); return done('queue resumed'); }
      if (p === '/api/sync') { await sync(); return done(syncInfo.lastError ? `sync failed: ${syncInfo.lastError}` : 'synced'); }
      if (p === '/api/void') {
        const id = String(body.id ?? '');
        const job = state.jobs.get(id);
        if (!job) throw new HttpError(404, 'no such match');
        if (job.status !== 'finished') throw new HttpError(400, `match is ${job.status}, not finished`);
        ledger.append({ type: 'void', id, reason: String(body.reason ?? 'organizer'), by: user.email });
        return done(`${id} voided`);
      }
      if (p === '/api/claims') {
        const email = String(body.email ?? '').toLowerCase();
        const h = String(body.handle ?? '');
        if (!email.includes('@') || !isHandle(h)) throw new HttpError(400, 'email and handle required');
        ledger.append({ type: 'claim', email, handle: h, by: user.email });
        return done(`${email} → ${h}`);
      }
      const c = /^\/api\/matches\/([^/]+)\/cancel$/.exec(p);
      if (c) {
        if (!queue.cancel(c[1], `cancelled by ${user.email}`)) throw new HttpError(400, 'only a queued match can be cancelled');
        return done(`${c[1]} cancelled`);
      }
    }
    throw new HttpError(404, 'not found');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError || err instanceof AuthError ? err.status : 500;
      if (status === 500) log.error(`arena: ${req.method} ${req.url}: ${err.stack ?? err}`);
      const wantsJson = req.url.startsWith('/api/') || (req.headers.accept ?? '').includes('application/json');
      if (wantsJson) return sendJson(res, { error: err.message }, status);
      return sendHtml(res, page({ title: `${status}`, path: '', user: null, body: `<h1>${status}</h1><p>${esc(err.message)}</p>` }), status);
    });
  });

  let timer = null;
  return {
    server,
    queue,
    ledger,
    live,
    house,
    sync,
    auth,
    async listen(port = 8790) {
      queue.start();
      if (syncEnabled) {
        await sync();
        timer = setInterval(sync, syncInfo.intervalSec * 1000);
        timer.unref();
      }
      await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', () => resolve()).once('error', reject));
      const { port: bound } = server.address();
      return `http://127.0.0.1:${bound}/`;
    },
    async close() {
      if (timer) clearInterval(timer);
      await queue.stop();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function parseArgs(argv) {
  const a = { config: DEFAULT_CONFIG, port: 8790, data: path.join(ROOT, 'runs', 'arena'), sync: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${k} needs a value`);
      return argv[++i];
    };
    switch (k) {
      case '--config': a.config = next(); break;
      case '--port': a.port = Number(next()); break;
      case '--data': a.data = next(); break;
      case '--dev-user': a.devUser = next(); break;
      case '--backend': a.backend = next(); break;
      case '--entrants-dir': a.entrantsDir = next(); break;
      case '--no-sync': a.sync = false; break;
      case '-h': case '--help': a.help = true; break;
      default: throw new Error(`unknown option ${k}`);
    }
  }
  return a;
}

const USAGE = `usage: node tools/arena/server.mjs [options]
  --config FILE       arena config (default tools/arena/config.example.json; copy it to runs/arena/config.json)
  --port N            listen port on 127.0.0.1 (default 8790)
  --data DIR          ledger, logs, prompt cache (default runs/arena)
  --dev-user EMAIL    dev mode: no Access, every request is this organizer (refused when ARENA_ACCESS_AUD is set)
  --backend ID        override the tournament backend (e.g. mock)
  --entrants-dir DIR  read entrants/<handle>/pilot.md from a local tree instead of GitHub
  --no-sync           do not poll the entrants repo
env: ARENA_ACCESS_AUD, ARENA_ACCESS_TEAM, ARENA_ORGANIZER_EMAIL (Access mode — see docs/arena-runbook.md)`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (process.env.ARENA_ACCESS_AUD && args.devUser) throw new Error('--dev-user cannot be combined with ARENA_ACCESS_AUD');
  const config = loadConfig(args.config, { backend: args.backend, entrantsDir: args.entrantsDir });
  const log = makeLog(false);
  const arena = await createArena({ config, dataDir: args.data, devUser: args.devUser, sync: args.sync, log });
  const url = await arena.listen(args.port);
  log.info(`arena: listening on ${url} (${arena.auth.describe})`);
  log.info(`arena: tournament ${config.tournament.id} backend=${config.tournament.backend} data=${args.data}`);
  const stop = async () => {
    log.info('arena: stopping (in-flight match is abandoned and will re-run on restart)');
    await arena.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return new Promise(() => {});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`arena: ${err.message}`);
    process.exit(2);
  });
}
