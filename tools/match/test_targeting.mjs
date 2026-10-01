/**
 * The targeting rule (`tools/jev/target_resolve.py`), driven from the real sim. Both sides walk home,
 * then ride "the nearest allied minion" (`nearby_minion`, the house's push-with-the-wave rule),
 * with every target resolved by the Python resolver itself. At the fountain all three lanes'
 * minions are the same distance away. Under `first-min` floating-point noise broke that tie, and
 * the two sides took different lanes (runs/bandstand-4-2026-10-01.md). Under `own-lane-1` each bot
 * heads down its own lane, and the match stays its own mirror image.
 *
 * #56's mirror test can't see this: its scripted pilot never targets a minion. Bandstand 4's probe
 * couldn't either: it mirrored one observation, floats and all. Here each side gets the observation
 * the sim really hands it.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flush, loadHeadless } from './load.mjs';

const h = await loadHeadless();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

const ROSTER = [
  { team: 'violet', lane: 'top', instrument: 'drums' },
  { team: 'violet', lane: 'mid', instrument: 'keytar' },
  { team: 'violet', lane: 'bottom', instrument: 'violin' },
  { team: 'green', lane: 'top', instrument: 'drums' },
  { team: 'green', lane: 'mid', instrument: 'keytar' },
  { team: 'green', lane: 'bottom', instrument: 'violin' },
];
const BASE = h.BASE;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segDist(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The lane whose path (src/sim/map.ts) runs nearest `p`. */
const laneOf = (p) =>
  Object.entries(h.LANE_PATHS)
    .map(([lane, path]) => [Math.min(...path.slice(1).map((b, i) => segDist(p, path[i], b))), lane])
    .sort((a, b) => a[0] - b[0])[0][1];

/** One `python tools/jev/target_resolve.py` process: one JSON request a line, one reply a line. */
function resolver() {
  const child = spawn(PYTHON, [path.join(ROOT, 'tools', 'jev', 'target_resolve.py')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
  const replies = [];
  createInterface({ input: child.stdout }).on('line', (line) => replies.shift()(JSON.parse(line)));
  const inflight = new Set();
  return {
    resolve(selector, observation, targeting) {
      const reply = new Promise((res) => replies.push(res));
      child.stdin.write(JSON.stringify({ selector, observation, targeting }) + '\n');
      const settled = reply.then(() => inflight.delete(settled));
      inflight.add(settled);
      return reply.then((r) => {
        if (r.error) throw new Error(r.error);
        return r.target;
      });
    },
    /** Every asked target answered, so both sides' decisions land on the same tick. */
    async idle() {
      while (inflight.size) await Promise.all([...inflight]);
    },
    close: () => child.stdin.end(),
  };
}

const r = resolver();
after(() => r.close());

/** Walk home; once there, ride the nearest allied minion. Each bot's first ride target is noted. */
const ridePilot = (targeting, rides) => () => {
  let home = false;
  let rode = false;
  return {
    decide: async (obs) => {
      // the sim's own arrival: a move stops within 1 unit of its target (src/sim/match.ts stepToward)
      if (!home && d2(obs.self.pos, BASE[obs.self.team]) >= 1) return { kind: 'move', target: BASE[obs.self.team] };
      home = true;
      const target = await r.resolve('nearby_minion', obs, targeting);
      if (target && !rode) rides.push({ team: obs.self.team, lane: obs.self.lane, to: laneOf(target), target });
      rode ||= Boolean(target);
      return target ? { kind: 'move', target } : { kind: 'hold' };
    },
  };
};

/** One team's bots and minions, as the other team would see them in a mirror ((x, y) -> (y, x)). */
function sideState(match, team, mirror) {
  const p = (pos) => (mirror ? [pos.y, pos.x] : [pos.x, pos.y]).map((v) => Math.round(v * 1e6) / 1e6);
  return {
    bots: match.bearbots.filter((b) => b.team === team).map((b) => [b.lane, ...p(b.pos), b.hp, b.alive]),
    minions: match.minions.filter((m) => m.team === team && m.alive).map((m) => [m.lane, ...p(m.pos), m.hp].join(' ')).sort(),
  };
}

async function rideMatch(targeting, seconds = 60) {
  const rides = [];
  const roster = ROSTER.map((s) => ({ ...s, pilotKind: 'scripted', makePilot: ridePilot(targeting, rides) }));
  const match = new h.Match(1, roster);
  h.applyMapVariant(match, h.resolveMap('pvp-1'));
  h.attachResolution(match, h.resolveResolution('simultaneous-1'));
  let firstAsymmetricTick = null;
  for (let t = 1; t <= seconds / h.TICK_DT && !match.ended; t++) {
    match.tick(h.TICK_DT);
    await r.idle();
    await flush();
    if (firstAsymmetricTick === null && JSON.stringify(sideState(match, 'violet', false)) !== JSON.stringify(sideState(match, 'green', true))) {
      firstAsymmetricTick = t;
    }
  }
  const lanesBy = (team) => Object.fromEntries(rides.filter((x) => x.team === team).map((x) => [x.lane, x.to]));
  return { match, rides, firstAsymmetricTick, violet: lanesBy('violet'), green: lanesBy('green') };
}

test('first-min: from the fountain the tie goes to float noise, and the two sides ride different lanes', async () => {
  const m = await rideMatch('first-min');
  assert.equal(m.rides.length, 6, 'every bot reached its fountain and saw its wave');
  assert.notDeepEqual(m.violet, m.green, 'the lanes the two sides take are not each other\'s mirror');
  assert.notEqual(m.firstAsymmetricTick, null, 'the mirror breaks');
});

test('own-lane-1: from the fountain every bot heads down its own lane, and the match stays its own mirror image', async () => {
  const m = await rideMatch('own-lane-1');
  assert.equal(m.rides.length, 6, 'every bot reached its fountain and saw its wave');
  assert.deepEqual(m.violet, { top: 'top', mid: 'mid', bottom: 'bottom' });
  assert.deepEqual(m.green, m.violet);
  for (const ride of m.rides) {
    const start = h.pointAlongPath(h.LANE_PATHS[ride.lane], ride.team === 'violet' ? 0.08 : 0.92);
    assert.ok(d2(ride.target, start) < 1e-6, `${ride.team} ${ride.lane} heads for its lane start, the spot the match spawned it`);
  }
  assert.equal(m.firstAsymmetricTick, null);
});
