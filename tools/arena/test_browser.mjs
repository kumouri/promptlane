/**
 * The browser's driver (`src/live.ts`), run in Node against a real mock log: fed the exact event
 * sequence the arena streams, the `Ticker` must never step past the last completed round, must
 * reach the log's final tick with every checkpoint equal, and must stop on a tampered checkpoint.
 * Replay mode at a fixed speed must pace itself. `LivePacer` (docs/render-spec.md §8) is the
 * live-mode fix for the "freeze then teleport" bug: it must still burst (Infinity) while
 * genuinely behind, but meter the release once caught up instead of bursting every newly-
 * unlocked tick — this is the "logic, not drawing" part of render phase 1. `src/sim/` is bundled
 * unchanged, as ever.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { ROOT, flush, loadHeadless } from '../match/load.mjs';
import { eventsFromLog } from './live.mjs';

async function loadLive() {
  const bundle = await build({ entryPoints: [path.join(ROOT, 'src', 'live.ts')], absWorkingDir: ROOT, bundle: true, write: false, format: 'esm', platform: 'node', target: 'node20', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
}

const headless = await loadHeadless();
const live = await loadLive();
const { LiveFeed, Ticker, DivergenceCheck, buildMatch, LivePacer } = live;

const sides = (a, b) => ({ violet: { name: a, promptFile: 'x', promptText: `${a}. Reply with JSON.` }, green: { name: b, promptFile: 'y', promptText: `${b}. Reply with JSON.` } });
const tickOf = (m) => Math.round(m.clockSec / 0.05);
const frame = () => new Promise((r) => setImmediate(r));

async function mockLog(maxSimSec = 90, seed = 7) {
  return headless.runMatch({ seed, sides: sides('ann', 'bo'), callModelFor: (i) => headless.mockCallModel(100 + i), cadenceSec: 2, maxSimSec, backend: { kind: 'mock' }, flush });
}

test('live: events arriving over time, the sim trails the last round and lands on the log, no divergence', async () => {
  const log = await mockLog(90);
  assert.ok(log.decisions.length > 100 && log.checkpoints.length > 10);
  const events = eventsFromLog(log, { status: 'finished' });
  const feed = new LiveFeed();
  const check = new DivergenceCheck(feed, 100);
  feed.onCheckpoint = (t, s) => check.onCheckpoint(t, s);
  let built = null;
  let ticker = null;
  let maxLead = 0;
  let traces = 0;
  const onTick = () => {
    check.afterTick(built.match);
    maxLead = Math.max(maxLead, tickOf(built.match) - feed.lastRoundTick);
    return check.divergedAt === null;
  };
  // deliver in bursts of varying size with the ticker running between bursts, like SSE tasks
  let i = 0;
  let burst = 1;
  while (i < events.length) {
    for (let k = 0; k < burst && i < events.length; k++, i++) {
      const e = events[i];
      feed.apply({ event: e.event, data: e.data });
      if (e.event === 'meta' && !ticker) {
        built = buildMatch(feed, () => traces++);
        ticker = new Ticker(built.match, built.asks, { limit: () => feed.limitTick, speed: () => Infinity, finished: () => !!feed.end, onTick, frame });
      }
    }
    burst = (burst * 7) % 23 + 1;
    await frame();
    await frame();
    if (built) assert.ok(tickOf(built.match) <= Math.max(feed.lastRoundTick, 0), `never ahead of the server: tick ${tickOf(built.match)} > round ${feed.lastRoundTick}`);
  }
  await ticker.done;
  assert.equal(maxLead, 0, 'the sim never stepped past the last completed round');
  assert.equal(tickOf(built.match), log.result.ticks, 'reached the log\'s final tick');
  assert.equal(check.divergedAt, null);
  assert.equal(check.compared, log.checkpoints.length, 'every checkpoint compared, whichever side arrived first');
  assert.equal(built.match.ended, false, 'an unfinished (quick) log does not end the sim');
  assert.ok(traces > 0, 'the side panel got replies');
  assert.equal(feed.decisions, log.decisions.length);
});

test('live: a tampered checkpoint shows as divergence and stops the driver', async () => {
  const log = await mockLog(60);
  const events = eventsFromLog(log);
  const bad = events.find((e) => e.event === 'checkpoint' && e.data.tick === 600);
  bad.data = { tick: 600, state: '{"tampered":1}' };
  const feed = new LiveFeed();
  const check = new DivergenceCheck(feed, 100);
  feed.onCheckpoint = (t, s) => check.onCheckpoint(t, s);
  for (const e of events) feed.apply({ event: e.event, data: e.data });
  const built = buildMatch(feed);
  const ticker = new Ticker(built.match, built.asks, { limit: () => feed.limitTick, speed: () => Infinity, finished: () => !!feed.end, onTick: () => { check.afterTick(built.match); return check.divergedAt === null; }, frame });
  await ticker.done;
  assert.equal(check.divergedAt, 600);
  assert.equal(tickOf(built.match), 600, 'stopped at the divergence');
});

test('replay: a finished log at 16× paces itself by the clock and ends with the sim\'s own verdict', async () => {
  const log = await mockLog(600, 11);
  const feed = LiveFeed.fromLog(log);
  assert.equal(feed.meta.finished, true);
  assert.equal(feed.limitTick, log.result.endReason === null ? log.result.ticks : Infinity);
  const built = buildMatch(feed);
  const check = new DivergenceCheck(feed, 100);
  let fakeNow = 0;
  const perFrame = [];
  let last = 0;
  const ticker = new Ticker(built.match, built.asks, {
    limit: () => feed.limitTick,
    speed: () => 16,
    finished: () => true,
    now: () => fakeNow,
    frame: async () => {
      perFrame.push(tickOf(built.match) - last);
      last = tickOf(built.match);
      fakeNow += 100; // 100 ms per frame at 16× = 1.6 sim-seconds = 32 ticks
      await frame();
    },
    onTick: () => {
      check.afterTick(built.match);
      return check.divergedAt === null;
    },
  });
  await ticker.done;
  assert.equal(check.divergedAt, null);
  assert.equal(tickOf(built.match), log.result.ticks);
  assert.equal(built.match.winner, log.result.winner);
  assert.equal(built.match.endReason, log.result.endReason);
  assert.ok(perFrame.slice(1, -1).every((n) => n <= 33), `at most 32 ticks per 100 ms frame at 16×: ${perFrame.slice(0, 8)}`);
  assert.ok(perFrame.length >= log.result.ticks / 32 - 1, 'took the frames it should');
});

test('LivePacer: exactly one round behind is not yet "genuinely behind"; more than one round is real catch-up (Infinity)', () => {
  const pacer = new LivePacer({ cadenceSec: 2, getCurrentTick: () => 0, now: () => 0 });
  pacer.onRound(40); // cadenceSec 2 / TICK_DT 0.05 = 40 ticks per round
  assert.notEqual(pacer.speed(), Infinity, 'exactly one round behind: still metered, not a burst');
  pacer.onRound(81);
  assert.equal(pacer.speed(), Infinity, 'more than one round behind: real, unmetered catch-up');
});

test('LivePacer: once caught up, releases at a finite, conservatively-seeded speed — never bursts the whole round at once', () => {
  let tick = 0;
  const pacer = new LivePacer({ cadenceSec: 2, getCurrentTick: () => tick, now: () => 0 });
  pacer.onRound(40);
  tick = 40; // the sim has fully caught up to the first round
  assert.equal(pacer.speed(), 1, 'seed: release one round (40 ticks = 2 sim-sec) over one full cadence (2 real-sec) = speed 1, before any real gap is known');
});

test('LivePacer: backlog-burst round arrivals (near-zero real gaps while still catching up) do not corrupt the pace estimate', () => {
  let tick = 0;
  let now = 0;
  const pacer = new LivePacer({ cadenceSec: 2, getCurrentTick: () => tick, now: () => now });
  // A reconnect: five rounds of history arrive back-to-back in ~0ms of wall time while the sim
  // (tick 0) is still far behind every one of them. None of these gaps are real pacing signal.
  for (let r = 1; r <= 5; r++) pacer.onRound(r * 40);
  tick = 200; // caught all the way up to the last backlog round
  assert.equal(pacer.speed(), 1, 'burst gaps left the seeded estimate untouched');

  // Now genuinely live: rounds arrive roughly every 900 ms of real time, in line with
  // docs/render-spec.md §2's measured ≈2.5×-slower-than-real-time cadence-2 pace.
  for (let r = 6; r <= 15; r++) {
    now += 900;
    tick += 40; // the ticker consumes the previous round's ticks before the next one lands
    pacer.onRound(r * 40);
  }
  const releasedOverMs = (40 * 0.05 * 1000) / pacer.speed();
  assert.ok(Math.abs(releasedOverMs - 900) < 100, `learned pace releases one round over ~900ms once caught up, not a burst: ${releasedOverMs}ms`);
});
