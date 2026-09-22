/**
 * Phase B on the mock model, no GPU: the live stream (SSE, backlog, Last-Event-ID, a queued
 * match that starts while someone is watching, the synthesized stream of a finished log being
 * identical to the live one) and the jam-day bracket end to end over HTTP — create from the
 * ladder, pre-run a held round, hide it from a non-organizer, reveal, play the final live,
 * rule, re-run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LiveHub, LiveStream, eventsFromLog, parseSse, sseFrame } from './live.mjs';
import { accessArena, fixture, json, quiet } from './testkit.mjs';
import { createArena } from './server.mjs';

test('LiveStream: ids are positions, backlog then follow, nothing after end', () => {
  const s = new LiveStream('m');
  const seen = [];
  s.push('meta', { seed: 1 });
  s.push('decision', { tick: 1 });
  const off = s.subscribe((e) => seen.push(e), 1);
  assert.deepEqual(seen.map((e) => e.id), [2], 'Last-Event-ID 1 → only id 2 from the backlog');
  s.push('round', { tick: 1 });
  assert.equal(seen.length, 2);
  off();
  s.push('checkpoint', {});
  assert.equal(seen.length, 2, 'unsubscribed');
  s.end({ status: 'finished' });
  assert.equal(s.push('late', {}), null);
  assert.equal(s.events.at(-1).event, 'end');
  const late = [];
  s.subscribe((e) => late.push(e.event));
  assert.deepEqual(late, ['meta', 'decision', 'round', 'checkpoint', 'end'], 'a late joiner on an ended stream gets everything');
});

test('LiveHub: whenOpen fires on open; close ends an unfinished stream', () => {
  const hub = new LiveHub();
  let got = null;
  const cancel = hub.whenOpen('x', (s) => (got = s));
  assert.equal(hub.get('x'), null);
  const s = hub.open('x');
  assert.equal(got, s);
  cancel();
  hub.close('x');
  assert.equal(hub.get('x'), null);
  assert.equal(s.ended, true);
  assert.deepEqual(s.events.at(-1), { id: 1, event: 'end', data: { status: 'gone' } });
});

test('sseFrame / parseSse round-trip, comments ignored, data may span lines', () => {
  const text = ': hello\n\n' + sseFrame({ id: 1, event: 'meta', data: { a: 1 } }) + sseFrame({ id: 2, event: 'end', data: { status: 'finished' } }) + 'event: raw\ndata: {"x":\ndata: 2}\n\n';
  assert.deepEqual(parseSse(text), [
    { id: 1, event: 'meta', data: { a: 1 } },
    { id: 2, event: 'end', data: { status: 'finished' } },
    { id: null, event: 'raw', data: { x: 2 } },
  ]);
});

test('eventsFromLog: per tick decisions → round → death → checkpoint; result and end last', () => {
  const log = {
    seed: 7, tickDt: 0.05, cadenceSec: 2, idBase: 3, backend: { kind: 'mock' }, createdAt: 't',
    sides: { violet: { name: 'a' }, green: { name: 'b' } },
    decisions: [
      { tick: 1, bot: 0, action: null },
      { tick: 1, bot: 1, action: null },
      { tick: 100, bot: 0, action: null, cached: true },
      { tick: 300, bot: 2, action: null },
    ],
    checkpoints: [{ tick: 0, state: 's0' }, { tick: 100, state: 's100' }, { tick: 200, state: 's200' }, { tick: 300, state: 's300' }],
    result: { winner: null, endReason: null, ticks: 350, deaths: [{ tick: 150, bot: 4 }, { tick: 300, bot: 5 }], stats: {} },
  };
  const ev = eventsFromLog(log, { status: 'finished' });
  assert.deepEqual(ev.map((e) => e.id), ev.map((_, i) => i + 1));
  assert.deepEqual(
    ev.map((e) => `${e.event}${e.data?.tick !== undefined ? '@' + e.data.tick : ''}`),
    ['meta', 'checkpoint@0', 'decision@1', 'decision@1', 'round@1', 'decision@100', 'round@100', 'checkpoint@100', 'death@150', 'checkpoint@200', 'decision@300', 'round@300', 'death@300', 'checkpoint@300', 'result', 'end'],
  );
  assert.deepEqual(ev[4].data, { tick: 1, asks: 2 });
  assert.deepEqual(ev[0].data.sides, log.sides);
  assert.equal(ev[0].data.finished, true);
});

/** Fetch an SSE endpoint to its end (the server closes the response after `end`). */
async function sse(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  return { status: res.status, events: res.status === 200 ? parseSse(text) : [], text };
}

test('e2e: live stream of a match watched from the queue, identical to the synthesized stream of its log', async () => {
  const f = fixture({ tweak: (c) => { c.tournament.placementSeeds = [7]; c.tournament.maxSimSec = 60; c.tournament.quick.maxSimSec = 70; /* past one sim-minute so a progress event fires */ } });
  const arena = await createArena({ config: f.config, dataDir: f.data, devUser: 'dev@example.com', log: quiet, sync: true });
  try {
    const base = await arena.listen(0);
    await arena.queue.waitForIdle(60000);
    arena.queue.pause('test');
    const prompt = readFileSync(path.join(f.entrants, 'entrants', 'alice', 'pilot.md'), 'utf8');
    const sub = await json(`${base}api/tests`, { method: 'POST', body: JSON.stringify({ handle: 'bob', source: 'scratch', prompt, opponent: 'alice', kind: 'quick' }) });
    assert.equal(sub.status, 202);
    const id = sub.body.id;

    // Two watchers open the live view while the match is still queued; a third joins mid-way.
    const watcherA = sse(`${base}api/matches/${id}/events`);
    const watcherB = sse(`${base}api/matches/${id}/events`);
    await new Promise((r) => setTimeout(r, 50));
    arena.queue.resume('test');
    let lateJoiner = null;
    const midway = new Promise((resolve) => {
      const t = setInterval(() => {
        const s = arena.live.get(id);
        if (s && s.events.length > 20) {
          clearInterval(t);
          lateJoiner = sse(`${base}api/matches/${id}/events`, { 'last-event-id': '10' });
          resolve();
        }
      }, 5);
    });
    await midway;
    const [a, b, late] = await Promise.all([watcherA, watcherB, lateJoiner]);
    await arena.queue.waitForIdle(60000);

    assert.equal(a.status, 200);
    assert.equal(a.events[0].event, 'waiting');
    assert.equal(a.events[0].data.status, 'queued');
    assert.equal(a.events[1].event, 'meta');
    assert.equal(a.events[1].data.sides.violet.name, 'bob (scratch)');
    assert.equal(a.events[1].data.cadenceSec, 4);
    assert.equal(a.events.at(-1).event, 'end');
    assert.equal(a.events.at(-1).data.status, 'finished');
    assert.ok(a.events.at(-1).data.verify.checkpointsCompared > 0, 'end carries the verify outcome');
    assert.equal(a.events.at(-2).event, 'result');
    assert.equal(a.events.at(-2).data.endReason, null, 'a quick test stops early');
    assert.deepEqual(a.events.map((e) => e.event), b.events.map((e) => e.event), 'two browsers see the same stream');
    assert.ok(late.events.every((e) => e.id > 10), 'Last-Event-ID honoured');
    assert.deepEqual(late.events.at(-1).event, 'end');
    assert.equal(late.events.length, a.events.length - 1 - 10, 'late joiner: everything after id 10 (no waiting frame)');

    const rounds = a.events.filter((e) => e.event === 'round').map((e) => e.data.tick);
    assert.ok(rounds.length > 0 && rounds.every((t, i) => i === 0 || t > rounds[i - 1]), 'rounds are strictly increasing ticks');
    const decisions = a.events.filter((e) => e.event === 'decision');
    const logFile = path.join(f.data, 'logs', `${id}.json`);
    const log = JSON.parse(readFileSync(logFile, 'utf8'));
    assert.equal(decisions.length, log.decisions.length, 'every decision streamed, cached ones included');
    assert.ok(a.events.some((e) => e.event === 'checkpoint'));
    assert.ok(a.events.some((e) => e.event === 'progress'));

    // A finished match streams the same thing, synthesized from its log (minus wall-clock progress).
    const after = await sse(`${base}api/matches/${id}/events`);
    const strip = (evs) => evs.filter((e) => !['waiting', 'progress', 'end'].includes(e.event)).map((e) => ({ event: e.event, data: e.event === 'meta' ? { ...e.data, finished: undefined } : e.data }));
    assert.equal(after.events[0].data.finished, true, 'a synthesized stream says so, so the browser plays it at the chosen speed');
    assert.equal(a.events[1].data.finished, undefined);
    assert.deepEqual(strip(after.events), strip(a.events), 'live stream ≡ eventsFromLog(log)');
    assert.deepEqual(after.events.at(-1).data.status, 'finished');
    assert.ok(after.events.every((e, i) => e.id === i + 1));

    // A late joiner with Last-Event-ID on a finished match gets only the tail; an unknown id is 404.
    const tail = await sse(`${base}api/matches/${id}/events`, { 'last-event-id': String(after.events.length - 3) });
    assert.deepEqual(tail.events.map((e) => e.event), [after.events.at(-3).event, 'result', 'end']);
    assert.equal((await fetch(`${base}api/matches/nope/events`)).status, 404);
    assert.ok(existsSync(logFile));
  } finally {
    await arena.close();
    f.cleanup();
  }
});

test('e2e: bracket — create from the ladder, pre-run a held round, hide it, reveal, play the final, rule, re-run', async () => {
  const carol = readFileSync(path.join(process.cwd(), 'prompts', 'pilots', 'keytar.md'), 'utf8') + '\nStay in lane.\n';
  const f = fixture({ handles: { alice: 'keytar.md', bob: 'violin.md', carol }, tweak: (c) => { c.tournament.placementSeeds = [7]; c.tournament.maxSimSec = 60; } });
  const { arena, organizer, as } = await accessArena(f);
  const spectator = as('spec@inrhythm.com');
  try {
    const base = await arena.listen(0);
    await arena.sync();
    await arena.queue.waitForIdle(120000);
    const ladder = (await json(`${base}api/ladder`, { headers: organizer })).body.rows;
    assert.equal(ladder.length, 3);

    // Only the organizer may create one; the id must be new; fewer than two entrants is refused.
    assert.equal((await json(`${base}api/brackets`, { method: 'POST', body: JSON.stringify({ id: 'jam' }), headers: spectator })).status, 403);
    assert.equal((await json(`${base}api/brackets`, { method: 'POST', body: JSON.stringify({ id: 'ladder' }), headers: organizer })).status, 409);
    assert.equal((await json(`${base}api/brackets`, { method: 'POST', body: JSON.stringify({ id: 'Bad Id' }), headers: organizer })).status, 400);
    const created = await json(`${base}api/brackets`, { method: 'POST', body: JSON.stringify({ id: 'jam', name: 'Jam', backend: 'mock', cadenceSec: 2, maxSimSec: 60, preRunRounds: 1, seedBase: 99 }), headers: organizer });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const v0 = created.body.bracket;
    assert.equal(v0.size, 4);
    assert.deepEqual(v0.seeds.map((s) => s.handle), ladder.map((r) => r.handle), 'seeded in ladder order');
    assert.deepEqual(v0.rounds.map((r) => r.name), ['Semi-finals', 'Final']);
    assert.equal(v0.rounds[0].slots[0].status, 'bye');
    assert.equal(v0.rounds[0].slots[1].status, 'ready');
    assert.equal((await json(`${base}api/brackets`, { method: 'POST', body: JSON.stringify({ id: 'jam' }), headers: organizer })).status, 409, 'same id twice');

    // Pre-run the semis (round 1). It is held: the spectator sees no result, no match, no log, no stream.
    const run1 = await json(`${base}api/brackets/jam/rounds/1/run`, { method: 'POST', body: '{}', headers: organizer });
    assert.equal(run1.status, 200, JSON.stringify(run1.body));
    assert.equal(run1.body.ids.length, 1);
    const m1 = run1.body.ids[0];
    assert.match(m1, /^jam-\d{8}-001$/);
    assert.equal((await json(`${base}api/brackets/jam/rounds/1/run`, { method: 'POST', body: '{}', headers: organizer })).body.ids.length, 0, 'already queued: nothing new');
    await arena.queue.waitForIdle(120000);
    const org = (await json(`${base}api/brackets/jam`, { headers: organizer })).body;
    assert.equal(org.rounds[0].slots[1].status, 'done');
    assert.ok(org.rounds[0].slots[1].winner === 2 || org.rounds[0].slots[1].winner === 3);
    assert.ok(org.rounds[0].held);
    assert.equal(org.rounds[1].slots[0].status, 'ready', 'the final is ready for the organizer');
    const spec = (await json(`${base}api/brackets/jam`, { headers: spectator })).body;
    assert.equal(spec.rounds[0].slots[1].status, 'held');
    assert.equal(spec.rounds[0].slots[1].winner, null);
    assert.equal(spec.rounds[0].slots[1].current, null);
    assert.equal(spec.rounds[1].slots[0].status, 'hidden', 'the final pairing would give the semi away');
    assert.equal(spec.rounds[1].slots[0].seedA, null);
    assert.equal(spec.champion, null);
    assert.equal((await json(`${base}api/matches/${m1}`, { headers: spectator })).status, 403);
    assert.equal((await fetch(`${base}logs/${m1}.json`, { headers: spectator })).status, 403);
    assert.equal((await fetch(`${base}api/matches/${m1}/events`, { headers: spectator })).status, 403);
    assert.equal((await fetch(`${base}matches/${m1}`, { headers: spectator })).status, 403);
    const list = (await json(`${base}api/matches`, { headers: spectator })).body;
    assert.equal(list.held, 1);
    assert.ok(!list.jobs.some((j) => j.id === m1), 'held match is not in the public list');
    assert.ok((await (await fetch(`${base}matches`, { headers: spectator })).text()).includes('held until the organizer reveals'));
    assert.ok((await (await fetch(`${base}bracket`, { headers: spectator })).text()).includes('revealed on jam day'));
    assert.equal((await json(`${base}api/matches/${m1}`, { headers: organizer })).status, 200, 'the organizer sees it');
    assert.equal((await fetch(`${base}logs/${m1}.json`, { headers: organizer })).status, 200);

    // Jam day: reveal, then everyone sees the semi and the final pairing.
    assert.equal((await json(`${base}api/brackets/jam/rounds/2/reveal`, { method: 'POST', body: '{}', headers: organizer })).status, 400, 'the final is not a held round');
    assert.equal((await json(`${base}api/brackets/jam/rounds/1/reveal`, { method: 'POST', body: '{}', headers: organizer })).status, 200);
    const revealed = (await json(`${base}api/brackets/jam`, { headers: spectator })).body;
    assert.equal(revealed.rounds[0].slots[1].status, 'done');
    assert.equal(revealed.rounds[0].slots[1].winner, org.rounds[0].slots[1].winner);
    assert.equal(revealed.rounds[1].slots[0].status, 'ready');
    assert.equal(revealed.rounds[1].slots[0].a, 1);
    assert.equal((await json(`${base}api/matches/${m1}`, { headers: spectator })).status, 200);
    assert.equal((await sse(`${base}api/matches/${m1}/events`, spectator)).events.at(-1).data.status, 'finished');
    assert.equal((await json(`${base}api/matches`, { headers: spectator })).body.held, 0);

    // The final, live: a spectator is on the stream before it starts.
    arena.queue.pause('test');
    const run2 = await json(`${base}api/brackets/jam/rounds/2/run`, { method: 'POST', body: '{}', headers: organizer });
    assert.equal(run2.body.ids.length, 1);
    const m2 = run2.body.ids[0];
    const watching = sse(`${base}api/matches/${m2}/events`, spectator);
    await new Promise((r) => setTimeout(r, 50));
    arena.queue.resume('test');
    await arena.queue.waitForIdle(120000);
    const stream = await watching;
    assert.equal(stream.events[0].event, 'waiting');
    assert.equal(stream.events[1].event, 'meta');
    assert.equal(stream.events[1].data.backend.arenaBackend, 'mock', 'the tournament backend is in the stream header and the log');
    assert.equal(stream.events.at(-1).data.status, 'finished');
    const fin = (await json(`${base}api/brackets/jam`, { headers: spectator })).body;
    assert.equal(fin.rounds[1].slots[0].status, 'done');
    assert.ok(fin.champion, 'a champion');
    const jobs = (await json(`${base}api/matches`, { headers: organizer })).body.jobs.filter((j) => j.kind === 'bracket');
    assert.equal(jobs.length, 2);
    for (const j of jobs) {
      assert.equal(j.status, 'finished');
      assert.equal(j.ranked, false, 'bracket matches do not move the ladder');
      assert.equal(j.backend.id, 'mock');
      assert.equal(j.cadenceSec, 2);
      assert.ok(j.verify.checkpointsCompared > 0, 'verified before it counted');
      assert.equal(j.bracket.tournamentId, 'jam');
      const log = JSON.parse(readFileSync(path.join(f.data, 'logs', `${j.id}.json`), 'utf8'));
      assert.equal(log.backend.arenaBackend, 'mock', 'backend recorded in the match log');
      assert.ok(log.result.ticks >= 1200 && log.result.ticks <= 1202, 'a 60 s match');
    }
    assert.notEqual(jobs[0].seed, jobs[1].seed);

    // A ruling overrides; a re-run queues a new match on a new seed for the same slot.
    const other = fin.rounds[1].slots[0].winner === fin.rounds[1].slots[0].a ? fin.rounds[1].slots[0].b : fin.rounds[1].slots[0].a;
    assert.equal((await json(`${base}api/brackets/jam/slots/2/0/ruling`, { method: 'POST', body: JSON.stringify({ winner: 9, reason: 'x' }), headers: organizer })).status, 400);
    assert.equal((await json(`${base}api/brackets/jam/slots/2/0/ruling`, { method: 'POST', body: JSON.stringify({ winner: other, reason: 'test ruling' }), headers: organizer })).status, 200);
    const ruled = (await json(`${base}api/brackets/jam`, { headers: spectator })).body;
    assert.equal(ruled.rounds[1].slots[0].status, 'ruled');
    assert.equal(ruled.champion.seed, other);
    assert.equal((await json(`${base}api/brackets/jam/slots/2/0/ruling`, { method: 'POST', body: '{}', headers: spectator })).status, 403);
    const rerun = await json(`${base}api/brackets/jam/slots/2/0/rerun`, { method: 'POST', body: '{}', headers: organizer });
    assert.equal(rerun.status, 200, JSON.stringify(rerun.body));
    const rj = (await json(`${base}api/matches/${rerun.body.id}`, { headers: organizer })).body;
    assert.equal(rj.bracket.rerun, 1);
    assert.notEqual(rj.seed, jobs[1].seed);
    assert.equal(rj.priority, 'bracket');
    arena.queue.cancel(rerun.body.id, 'test');

    // Pages render for both roles; the bracket page shows the champion and the seeds.
    for (const [name, headers] of [['organizer', organizer], ['spectator', spectator]]) {
      for (const p of ['bracket', 'bracket/jam', 'matches', `matches/${m1}`]) {
        const res = await fetch(`${base}${p}`, { headers });
        assert.equal(res.status, 200, `${name} ${p}`);
      }
      const html = await (await fetch(`${base}bracket`, { headers })).text();
      assert.ok(html.includes('Elysium'));
      assert.ok(html.includes('wins Jam'), `${name} sees the champion`);
      assert.ok(html.includes('?replay=') && html.includes('speed=4'), `${name} sees the 4× replay links`);
    }
    assert.ok((await (await fetch(`${base}admin`, { headers: organizer })).text()).includes('Create bracket from the ladder'));
    assert.equal((await fetch(`${base}bracket/nope`, { headers: organizer })).status, 404);
    const rows = readFileSync(path.join(f.data, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((r) => r.type);
    for (const t of ['bracket', 'bracket-reveal', 'ruling']) assert.ok(rows.includes(t), t);
  } finally {
    await arena.close();
    f.cleanup();
  }
});
