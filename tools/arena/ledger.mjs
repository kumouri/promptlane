/**
 * Append-only ledger (`runs/arena/ledger.jsonl`) and the folds that derive everything else from
 * it: prompt index, handle claims, queue state, quota, standings. Nothing is ever edited; a wrong
 * click is undone by another row (docs/arena-site-spec.md §3.3).
 *
 * Row types (all carry `ts`): `tournament`, `house`, `claim`, `prompt-seen`, `queued`, `started`,
 * `finished`, `void`, `timed-out`, `failed`, `cancelled`, `paused`, `resumed`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ELO_START, eloUpdate, scoreOf } from './rating.mjs';

export class Ledger {
  constructor(file) {
    this.file = file;
    this.rows = [];
    this.listeners = new Set();
  }

  load() {
    this.rows = [];
    if (!existsSync(this.file)) return this;
    const text = readFileSync(this.file, 'utf8');
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        this.rows.push(JSON.parse(t));
      } catch {
        throw new Error(`ledger ${this.file}: unparsable line: ${t.slice(0, 80)}`);
      }
    }
    return this;
  }

  /** Append one row (adds `ts` if missing); returns the row as written. */
  append(row) {
    const full = { ts: new Date().toISOString(), ...row };
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(full) + '\n');
    this.rows.push(full);
    for (const fn of this.listeners) fn(full);
    return full;
  }

  onAppend(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The fold, cached until the next append. */
  state() {
    if (!this._state || this._stateRows !== this.rows.length) {
      this._state = fold(this.rows);
      this._stateRows = this.rows.length;
    }
    return this._state;
  }
}

export const TERMINAL = new Set(['finished', 'void', 'timed-out', 'failed', 'cancelled']);

/** Fold every row into the current state. Pure; safe to call on any prefix of the ledger. */
export function fold(rows) {
  const s = {
    tournament: null,
    house: null,
    /** email → handle */
    claims: new Map(),
    /** handle → email */
    handles: new Map(),
    /** handle → latest {hash, commit, blobSha, seenAt} */
    prompts: new Map(),
    /** "handle:hash" */
    seenHashes: new Set(),
    /** matchId → job */
    jobs: new Map(),
    /** matchIds in queued order */
    order: [],
    paused: false,
    /** finished rows in order (void is applied by `voided`) */
    finished: [],
    voided: new Set(),
    seqByPrefix: new Map(),
  };
  for (const r of rows) {
    switch (r.type) {
      case 'tournament':
        s.tournament = r.tournament;
        break;
      case 'house':
        s.house = { handle: r.handle, hash: r.hash, file: r.file };
        break;
      case 'claim': {
        const prev = s.claims.get(r.email);
        if (prev) s.handles.delete(prev);
        const other = s.handles.get(r.handle);
        if (other) s.claims.delete(other);
        s.claims.set(r.email, r.handle);
        s.handles.set(r.handle, r.email);
        break;
      }
      case 'prompt-seen':
        s.prompts.set(r.handle, { hash: r.hash, commit: r.commit, blobSha: r.blobSha, seenAt: r.ts });
        s.seenHashes.add(`${r.handle}:${r.hash}`);
        break;
      case 'queued': {
        const { ts, type, ...job } = r;
        s.jobs.set(r.id, { ...job, createdAt: ts, status: 'queued', attempt: 0 });
        s.order.push(r.id);
        const prefix = r.id.slice(0, r.id.lastIndexOf('-'));
        const seq = Number(r.id.slice(r.id.lastIndexOf('-') + 1));
        s.seqByPrefix.set(prefix, Math.max(s.seqByPrefix.get(prefix) ?? 0, seq));
        break;
      }
      case 'started': {
        const j = s.jobs.get(r.id);
        if (j) Object.assign(j, { status: 'started', startedAt: r.ts, attempt: r.attempt ?? j.attempt + 1 });
        break;
      }
      case 'finished': {
        const j = s.jobs.get(r.id);
        if (j) {
          Object.assign(j, {
            status: 'finished',
            finishedAt: r.ts,
            result: r.result,
            final: r.final,
            backend: r.backend,
            verify: r.verify,
            wallMs: r.wallMs,
          });
        }
        s.finished.push(r);
        break;
      }
      case 'void': {
        const j = s.jobs.get(r.id);
        if (j) Object.assign(j, { status: 'void', finishedAt: r.ts, reason: r.reason, by: r.by });
        s.voided.add(r.id);
        break;
      }
      case 'timed-out':
      case 'failed':
      case 'cancelled': {
        const j = s.jobs.get(r.id);
        if (j) Object.assign(j, { status: r.type, finishedAt: r.ts, reason: r.reason ?? r.error });
        break;
      }
      case 'paused':
        s.paused = true;
        break;
      case 'resumed':
        s.paused = false;
        break;
      default:
        break;
    }
  }
  return s;
}

/** `YYYY-MM-DD` in Central Time; quotas are per CT day (§5.2). */
export function dayCT(ts = new Date()) {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** `<tournament>-<yyyymmdd>-<seq>`: human-readable in a URL and in a Slack message (§3.3). */
export function nextMatchId(state, tournamentId, now = new Date()) {
  const prefix = `${tournamentId}-${dayCT(now).replace(/-/g, '')}`;
  const seq = (state.seqByPrefix.get(prefix) ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

/** Tests a handle has used today (quick/full) and how many are still queued or running. */
export function quotaUsed(state, handle, day = dayCT()) {
  const used = { quick: 0, full: 0, active: 0 };
  for (const j of state.jobs.values()) {
    if (j.kind !== 'test' || j.requestedBy?.handle !== handle) continue;
    if (j.status === 'cancelled') continue;
    if (j.status === 'queued' || j.status === 'started') used.active += 1;
    if (dayCT(j.createdAt) !== day) continue;
    if (j.quick) used.quick += 1;
    else used.full += 1;
  }
  return used;
}

/** Placement jobs for `handle` that have not started yet — superseded when a new hash arrives. */
export function pendingPlacements(state, handle) {
  const out = [];
  for (const j of state.jobs.values()) {
    if (j.kind !== 'placement' || j.status !== 'queued') continue;
    const entrant = ['violet', 'green'].map((t) => j.sides[t]).find((ref) => !ref.house);
    if (entrant?.handle === handle) out.push(j);
  }
  return out;
}

function emptyRecord() {
  return { w: 0, d: 0, l: 0 };
}

function bump(rec, score) {
  if (score === 1) rec.w += 1;
  else if (score === 0) rec.l += 1;
  else rec.d += 1;
}

/**
 * The ladder: one row per handle with a merged prompt, ranked by Elo. Only `ranked` finished
 * matches that were not voided count; scratch and quick tests never do; the house bot is a fixed
 * 1000 and does not appear.
 */
export function standings(state) {
  const houseHandle = state.house?.handle ?? 'house';
  const rows = new Map();
  const rowFor = (handle) => {
    let r = rows.get(handle);
    if (!r) {
      r = {
        handle,
        elo: ELO_START,
        current: emptyRecord(),
        allTime: emptyRecord(),
        nexusKills: 0,
        timeoutWins: 0,
        draws: 0,
        calls: 0,
        parseErrors: 0,
        matches: 0,
        lastMatchId: null,
        hash: state.prompts.get(handle)?.hash ?? null,
      };
      rows.set(handle, r);
    }
    return r;
  };
  for (const handle of state.prompts.keys()) rowFor(handle);

  const isHouse = (ref) => !!ref.house || ref.handle === houseHandle;
  for (const m of state.finished) {
    if (!m.ranked || state.voided.has(m.id)) continue;
    const sides = ['violet', 'green'].map((team) => ({ team, ref: m.sides[team] }));
    const ratings = sides.map(({ ref }) => (isHouse(ref) ? ELO_START : rowFor(ref.handle).elo));
    const next = eloUpdate(ratings[0], ratings[1], scoreOf(m.result, 'violet'), {
      fixedA: isHouse(sides[0].ref),
      fixedB: isHouse(sides[1].ref),
    });
    const nextBy = { violet: next.a, green: next.b };
    for (const { team, ref } of sides) {
      if (isHouse(ref)) continue;
      const r = rowFor(ref.handle);
      const score = scoreOf(m.result, team);
      r.elo = nextBy[team];
      bump(r.allTime, score);
      if (ref.hash === r.hash) bump(r.current, score);
      if (score === 1 && m.result.endReason === 'nexus') r.nexusKills += 1;
      if (score === 1 && m.result.endReason === 'timeout') r.timeoutWins += 1;
      if (score === 0.5) r.draws += 1;
      const st = m.result.stats?.[team];
      if (st) {
        r.calls += st.calls;
        r.parseErrors += st.parseErrors + st.callErrors;
      }
      r.matches += 1;
      r.lastMatchId = m.id;
    }
  }
  const out = [...rows.values()].map((r) => ({
    ...r,
    elo: Math.round(r.elo),
    eloExact: r.elo,
    parseErrorRate: r.calls ? r.parseErrors / r.calls : 0,
  }));
  out.sort((a, b) => b.eloExact - a.eloExact || a.handle.localeCompare(b.handle));
  return out.map((r, i) => ({ rank: i + 1, ...r }));
}

const PRIORITY = { organizer: 0, bracket: 1, placement: 2, test: 3 };

/**
 * Jobs still to run, highest priority class first, FIFO within a class. A `started` job that is
 * not in `running` was interrupted by a restart and is runnable again (§3.1 crash recovery).
 */
export function queued(state, running = new Set()) {
  return state.order
    .map((id) => state.jobs.get(id))
    .filter((j) => j.status === 'queued' || (j.status === 'started' && !running.has(j.id)))
    .sort((a, b) => (PRIORITY[a.priority] ?? 9) - (PRIORITY[b.priority] ?? 9) || a.createdAt.localeCompare(b.createdAt));
}
