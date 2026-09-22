/**
 * Live match streams (docs/arena-site-spec.md §3.4): the in-memory event log of every running
 * match, fanned out over SSE. The stream *is* the match log's own content in arrival order —
 * `meta` (the header), then `decision` / `round` / `checkpoint` / `death` / `progress` as the
 * runner fires them, then `result`, then `end` once the ledger has its terminal row. Ids are the
 * 1-based position in the backlog, so `Last-Event-ID` is an array offset and a late joiner or a
 * reconnecting `EventSource` gets exactly what it missed.
 *
 * A finished match has no stream in memory; `eventsFromLog()` derives the identical sequence
 * from its log file (minus `progress`, which is wall-clock), so `?live=<id>` works for any match
 * and the browser has one driver, not two.
 */
export class LiveStream {
  constructor(id) {
    this.id = id;
    /** [{id, event, data}] — id is the 1-based index */
    this.events = [];
    this.subscribers = new Set();
    this.ended = false;
  }

  push(event, data) {
    if (this.ended) return null;
    const e = { id: this.events.length + 1, event, data };
    this.events.push(e);
    for (const fn of this.subscribers) fn(e);
    return e;
  }

  /** `end` is always the last event; nothing is accepted after it. */
  end(data) {
    const e = this.push('end', data);
    this.ended = true;
    return e;
  }

  /** Replay the backlog after `lastId`, then follow. Returns an unsubscribe. */
  subscribe(fn, lastId = 0) {
    for (const e of this.events) if (e.id > lastId) fn(e);
    if (this.ended) return () => {};
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}

export class LiveHub {
  constructor() {
    /** matchId → LiveStream, for matches that are running (or just finished, until the ledger row) */
    this.streams = new Map();
    /** matchId → Set<fn> waiting for a stream that has not opened yet (queued match) */
    this.waiting = new Map();
  }

  open(id) {
    const s = new LiveStream(id);
    this.streams.set(id, s);
    const w = this.waiting.get(id);
    if (w) {
      this.waiting.delete(id);
      for (const fn of w) fn(s);
    }
    return s;
  }

  get(id) {
    return this.streams.get(id) ?? null;
  }

  /** Drop a finished stream; late joiners read the log file instead. */
  close(id) {
    const s = this.streams.get(id);
    if (s && !s.ended) s.end({ status: 'gone' });
    this.streams.delete(id);
  }

  /** Called back with the stream when `open(id)` happens; returns a cancel. */
  whenOpen(id, fn) {
    let set = this.waiting.get(id);
    if (!set) {
      set = new Set();
      this.waiting.set(id, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }
}

/** The `meta` payload: the log header the browser needs to build the match before any decision. */
export function metaOf(log) {
  return { seed: log.seed, tickDt: log.tickDt, cadenceSec: log.cadenceSec, idBase: log.idBase, backend: log.backend, sides: log.sides, createdAt: log.createdAt };
}

/**
 * The same event sequence the runner would have streamed, derived from a finished log. Per tick
 * the runner's order is decisions → round → deaths → checkpoint, and a `round` fires for every
 * tick that had at least one ask (cached asks included); a tick with no asks still carries its
 * deaths and checkpoint.
 */
export function eventsFromLog(log, end = { status: 'finished' }) {
  const out = [];
  const push = (event, data) => out.push({ id: out.length + 1, event, data });
  push('meta', { ...metaOf(log), finished: true });
  const deathsByTick = new Map();
  for (const d of log.result.deaths) {
    if (!deathsByTick.has(d.tick)) deathsByTick.set(d.tick, []);
    deathsByTick.get(d.tick).push(d);
  }
  const checkpointsByTick = new Map(log.checkpoints.map((c) => [c.tick, c]));
  const extras = [...new Set([...deathsByTick.keys(), ...checkpointsByTick.keys()])].sort((x, y) => x - y);
  let extrasIdx = 0;
  const emitExtras = (tick) => {
    for (const d of deathsByTick.get(tick) ?? []) push('death', d);
    const c = checkpointsByTick.get(tick);
    if (c) push('checkpoint', c);
  };
  const flushExtrasBefore = (tick) => {
    while (extrasIdx < extras.length && extras[extrasIdx] < tick) emitExtras(extras[extrasIdx++]);
  };
  let i = 0;
  while (i < log.decisions.length) {
    const tick = log.decisions[i].tick;
    flushExtrasBefore(tick);
    let asks = 0;
    for (; i < log.decisions.length && log.decisions[i].tick === tick; i++, asks++) push('decision', log.decisions[i]);
    push('round', { tick, asks });
    if (extras[extrasIdx] === tick) emitExtras(extras[extrasIdx++]);
  }
  flushExtrasBefore(Infinity);
  push('result', log.result);
  push('end', end);
  return out;
}

/** One SSE frame. */
export function sseFrame(e) {
  return `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

export function sseHead(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': elysium live\n\n');
}

/**
 * Follow `source` on an SSE response whose head is already written. `source` is a `LiveStream`
 * (backlog after `Last-Event-ID`, then live) or an array of events (sent, then the response
 * ends). A comment every `keepAliveMs` keeps the tunnel from idling the socket out.
 */
export function sseFollow(req, res, source, { keepAliveMs = 15000 } = {}) {
  const lastId = Number(req.headers['last-event-id'] ?? 0) || 0;
  const send = (e) => {
    if (res.writableEnded) return;
    res.write(sseFrame(e));
    if (e.event === 'end') res.end();
  };
  if (Array.isArray(source)) {
    for (const e of source) if (e.id > lastId) send(e);
    if (!res.writableEnded) res.end();
    return;
  }
  const unsubscribe = source.subscribe(send, lastId);
  const ka = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, keepAliveMs);
  ka.unref?.();
  const done = () => {
    clearInterval(ka);
    unsubscribe();
  };
  res.on('close', done);
  res.on('finish', done);
}

/** Head + follow. */
export function serveSse(req, res, source, opts) {
  sseHead(res);
  sseFollow(req, res, source, opts);
}

/** Minimal SSE parser for tests and scripts: text → [{id, event, data}]. */
export function parseSse(text) {
  const out = [];
  for (const block of text.split('\n\n')) {
    const e = { id: null, event: 'message', data: '' };
    let any = false;
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      const field = i < 0 ? line : line.slice(0, i);
      const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
      if (field === 'id') e.id = Number(value);
      else if (field === 'event') e.event = value;
      else if (field === 'data') e.data += (e.data ? '\n' : '') + value;
      else continue;
      any = true;
    }
    if (any) out.push({ ...e, data: e.data ? JSON.parse(e.data) : null });
  }
  return out;
}
