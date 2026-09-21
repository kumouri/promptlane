/**
 * Read-only behavioural diagnostic for the frozen `fable-v1-001` submission (claude-fable-5-1).
 * Usage: node acceptance/adapters/fable-v1-001.mjs CANDIDATE OUTPUT.json
 * CANDIDATE is a temporary execution copy of the submission with `npm ci` done; the frozen
 * submission itself is never read for execution. Writes only OUTPUT (refuses to overwrite).
 *
 * The submission's own `Sim`, `Match`, `ScriptedPilot`, `PromptPilot` and `mockModel` are imported
 * unchanged through Node's native TypeScript type stripping (no bundler, no rewrite). Nothing in the
 * game is patched; every intervention below is an external pilot or a caller-side loop.
 *
 * ARTIFICIAL SCHEDULER (disclosed): each simulated frame is `match.step()` (the submission's own
 * 50 ms tick plus its 10-tick pilot cadence) followed by a full event-loop flush (`setImmediate`),
 * so a pilot decision that resolves in the same frame is applied before the next tick. That is the
 * browser's behaviour at 1x speed (one step per animation frame); the browser at 4x/16x batches
 * several steps per frame with no flush between them, which this adapter does not reproduce.
 * Nothing here is a browser run, real HTTP timing, or human observation.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [candidateArg, outputArg] = process.argv.slice(2);
if (!candidateArg || !outputArg || process.argv.length !== 4) {
  console.error('Usage: node acceptance/adapters/fable-v1-001.mjs CANDIDATE OUTPUT.json');
  process.exit(2);
}
const candidate = path.resolve(candidateArg);
const output = path.resolve(outputArg);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const load = (relative) => import(pathToFileURL(path.join(candidate, relative)).href);

const { Sim, TICK_MS, TICKS_PER_SEC, MATCH_TICKS, formatClock } = await load('src/sim/sim.ts');
const { Match, DECIDE_PERIOD } = await load('src/match.ts');
const { ScriptedPilot, scriptedDecide } = await load('src/pilot/scripted.ts');
const { PromptPilot, OBS_START } = await load('src/pilot/prompt.ts');
const { mockModel } = await load('src/pilot/model.ts');
const { DEFAULT_BEARS } = await load('src/roster.ts');
const { KITS } = await load('src/sim/kits.ts');

// Team labels: the submission's index.html/render.ts present team A as VIOLET and B as GREEN.
const TEAM = { A: 'violet', B: 'green' };
const SEEDS = [1, 1, 42, 2, 3, 7];
const flush = () => new Promise((resolve) => setImmediate(resolve));
const clock = (tick) => Number((tick / TICKS_PER_SEC).toFixed(2));

// ---- normalized state --------------------------------------------------------------------------

function snapshot(sim) {
  const bears = sim.bears();
  return {
    tick: sim.tick,
    bots: bears.map((b) => [TEAM[b.team], b.instrument, +b.hp.toFixed(3), +b.pos.x.toFixed(3), +b.pos.y.toFixed(3), b.alive, b.recallTicks > 0]),
    minions: sim.units.filter((u) => u.kind === 'minion').map((m) => [TEAM[m.team], m.lane, +m.hp.toFixed(3), +m.pos.x.toFixed(3), +m.pos.y.toFixed(3), m.alive]),
    towers: sim.towers().map((t) => [TEAM[t.team], t.lane, t.tier, +t.hp.toFixed(3), t.alive]),
    nexuses: ['A', 'B'].map((t) => [TEAM[t], +sim.nexus(t).hp.toFixed(3), sim.nexus(t).alive]),
  };
}
const endState = (sim) => ({
  ...snapshot(sim),
  minions: undefined,
  result: sim.result && { winner: sim.result.winner && TEAM[sim.result.winner], reason: sim.result.reason, tick: sim.result.tick },
});
const normalizeEnd = (result) => (result.reason === 'nexus destroyed' ? 'nexus' : 'timeout');

// ---- one full match under the adapter scheduler ------------------------------------------------

async function playMatch(seed, makePilot, { maxTicks = MATCH_TICKS + 2, hooks = {} } = {}) {
  const config = { seed, bears: DEFAULT_BEARS };
  const match = new Match(config, makePilot);
  const sim = match.sim;
  const bears = () => sim.bears();
  const initial = { bearbots: bears().length, towers: sim.towers().length, nexuses: 2 };
  const trace = createHash('sha256');
  const side = () => ({ violet: 0, green: 0 });
  const stats = {
    deaths: side(), kills: side(), recallStarts: side(), recallCompletions: side(),
    firstBearbotDeath: null, deathsList: [], towerFalls: [], checkpoints: [],
    minionFirstSeen: {}, minionsSeen: 0, minionDeaths: 0, minionMoveSamples: 0, minionDamageTicks: 0, firstMinionAt: null,
    abilities: {},
  };
  const seenMinions = new Map();
  let prevMinions = new Map();
  let prevBots = bears().map((b) => ({ alive: b.alive, hp: b.hp, x: b.pos.x, y: b.pos.y, recalling: b.recallTicks > 0, cds: b.abilities.map((a) => a.cooldown) }));
  let ticks = 0;
  while (!match.over && ticks < maxTicks) {
    const beforeEnemies = sim.units.filter((u) => u.alive && (u.kind === 'bear' || u.kind === 'minion'))
      .map((u) => ({ u, hp: u.hp, x: u.pos.x, y: u.pos.y }));
    match.step();
    await flush();
    ticks++;
    const t = sim.tick;
    hooks.afterTick?.(match, t);
    // minions: spawn times per lane, movement, combat
    const nowMinions = new Map();
    for (const m of sim.units) {
      if (m.kind !== 'minion') continue;
      nowMinions.set(m.id, { hp: m.hp, x: m.pos.x, y: m.pos.y });
      if (!seenMinions.has(m.id)) {
        seenMinions.set(m.id, t);
        (stats.minionFirstSeen[m.lane] ??= []).push(t);
        if (stats.firstMinionAt === null) stats.firstMinionAt = clock(t);
      }
      const p = prevMinions.get(m.id);
      if (p) {
        if (p.x !== m.pos.x || p.y !== m.pos.y) stats.minionMoveSamples++;
        if (m.hp < p.hp) stats.minionDamageTicks++;
      }
    }
    for (const id of prevMinions.keys()) if (!nowMinions.has(id)) stats.minionDeaths++;
    prevMinions = nowMinions;
    // bearbots: deaths, recalls, ability casts
    bears().forEach((b, i) => {
      const prev = prevBots[i];
      const team = TEAM[b.team];
      if (prev.alive && !b.alive) {
        stats.deaths[team]++;
        if (stats.firstBearbotDeath === null) stats.firstBearbotDeath = { at: clock(t), clock: formatClock(t), team, instrument: b.instrument };
        if (stats.deathsList.length < 40) stats.deathsList.push({ at: clock(t), team, instrument: b.instrument });
      }
      const recalling = b.recallTicks > 0;
      if (!prev.recalling && recalling) stats.recallStarts[team]++;
      if (prev.recalling && !recalling && b.alive && Math.hypot(b.pos.x - prev.x, b.pos.y - prev.y) > 100) stats.recallCompletions[team]++;
      b.abilities.forEach((a, k) => {
        if (a.cooldown > prev.cds[k]) recordCast(stats.abilities, b, a, t, prev, beforeEnemies, sim);
      });
      prevBots[i] = { alive: b.alive, hp: b.hp, x: b.pos.x, y: b.pos.y, recalling, cds: b.abilities.map((x) => x.cooldown) };
    });
    for (const tw of sim.towers()) {
      if (!tw.alive && !stats.towerFalls.some((f) => f.team === TEAM[tw.team] && f.lane === tw.lane && f.tier === tw.tier)) {
        stats.towerFalls.push({ at: clock(t), clock: formatClock(t), team: TEAM[tw.team], lane: tw.lane, tier: tw.tier });
      }
    }
    if (t % (60 * TICKS_PER_SEC) === 0 || match.over) stats.checkpoints.push(checkpoint(sim));
    trace.update(JSON.stringify(snapshot(sim)));
  }
  for (const b of bears()) stats.kills[TEAM[b.team]] += b.kills;
  stats.minionsSeen = seenMinions.size;
  for (const lane of Object.keys(stats.minionFirstSeen)) {
    const waves = [...new Set(stats.minionFirstSeen[lane])].sort((a, b) => a - b);
    stats.minionFirstSeen[lane] = waves.slice(0, 8).map((w) => clock(w));
  }
  const result = sim.result;
  return {
    seed, initial, ticks, simulatedSeconds: clock(sim.tick), clock: formatClock(sim.tick), ended: match.over,
    end: result ? normalizeEnd(result) : 'unfinished', winner: result ? (result.winner ? TEAM[result.winner] : 'draw') : null,
    rawReason: result?.reason ?? null,
    firstBearbotDeath: stats.firstBearbotDeath, deaths: stats.deaths, kills: stats.kills,
    recallStarts: stats.recallStarts, recallCompletions: stats.recallCompletions,
    firstMinionAt: stats.firstMinionAt, minionWavesFirstSeen: stats.minionFirstSeen, minionsSeen: stats.minionsSeen,
    minionDeaths: stats.minionDeaths, minionMoveSamples: stats.minionMoveSamples, minionDamageTicks: stats.minionDamageTicks,
    towerFalls: stats.towerFalls, deathsList: stats.deathsList, checkpoints: stats.checkpoints,
    finalTowers: { violet: sim.towersStanding('A'), green: sim.towersStanding('B') },
    finalNexusHp: { violet: +sim.nexus('A').hp.toFixed(1), green: +sim.nexus('B').hp.toFixed(1) },
    abilities: stats.abilities,
    logEntries: sim.log.length, logSha256: sha256(JSON.stringify(sim.log)),
    normalizedStateTraceSha256: trace.digest('hex'), endStateSha256: sha256(JSON.stringify(endState(sim))),
    _match: match,
  };
}

function checkpoint(sim) {
  const alive = (team) => sim.bears().filter((b) => b.team === team && b.alive).length;
  return {
    clock: formatClock(sim.tick), towers: { violet: sim.towersStanding('A'), green: sim.towersStanding('B') },
    nexusHp: { violet: Math.round(sim.nexus('A').hp), green: Math.round(sim.nexus('B').hp) },
    aliveBots: { violet: alive('A'), green: alive('B') }, kills: { violet: sim.kills('A'), green: sim.kills('B') },
  };
}

/** Cast detected by the ability's cooldown counter jumping up; record repeat interval and a same-tick effect signature. */
function recordCast(store, caster, ability, t, prevCaster, beforeEnemies, sim) {
  const key = `${caster.instrument}/${ability.name}`;
  const def = KITS[caster.instrument].abilities.find((a) => a.name === ability.name);
  const entry = (store[key] ??= { instrument: caster.instrument, ability: ability.name, cooldownTicks: def?.cooldown ?? null, cooldownSeconds: def ? def.cooldown / TICKS_PER_SEC : null, casts: 0, minRepeatIntervalTicks: null, lastCastByBear: {}, firstEffects: [] });
  entry.casts++;
  const last = entry.lastCastByBear[caster.id];
  if (last !== undefined) entry.minRepeatIntervalTicks = Math.min(entry.minRepeatIntervalTicks ?? Infinity, t - last);
  entry.lastCastByBear[caster.id] = t;
  if (entry.firstEffects.length < 2) {
    const near = beforeEnemies.filter(({ u }) => u.team !== caster.team && Math.hypot(u.pos.x - caster.pos.x, u.pos.y - caster.pos.y) < 260);
    entry.firstEffects.push({
      at: clock(t), team: TEAM[caster.team],
      casterMovedUnits: +Math.hypot(caster.pos.x - prevCaster.x, caster.pos.y - prevCaster.y).toFixed(1),
      casterHasted: caster.hasteUntil > sim.tick,
      enemiesNear: near.length,
      enemiesDamaged: near.filter(({ u, hp }) => u.hp < hp).length,
      enemiesKilled: near.filter(({ u }) => !u.alive).length,
      enemyBearsSlowed: near.filter(({ u }) => u.kind === 'bear' && u.slowUntil > sim.tick).length,
      enemyBearsTaunted: near.filter(({ u }) => u.kind === 'bear' && u.tauntUntil > sim.tick && u.tauntTarget === caster.id).length,
      enemiesDisplacedOver20: near.filter(({ u, x, y }) => Math.hypot(u.pos.x - x, u.pos.y - y) > 20).length,
    });
  }
}

// ---- pilots used by the probes (external, allowed by the pilot contract) ----------------------

const scripted = () => new ScriptedPilot();
const holdPilot = () => ({ decide: async () => ({ kind: 'hold' }) });

// ---- 1. scripted runs --------------------------------------------------------------------------

const runs = [];
for (const seed of SEEDS) runs.push(await playMatch(seed, scripted));

// ---- 2. log-based replay of seed 1 -------------------------------------------------------------

function replayFromLog(seed, log) {
  const sim = new Sim({ seed, bears: DEFAULT_BEARS });
  const trace = createHash('sha256');
  let i = 0;
  while (!sim.result) {
    while (i < log.length && log[i].tick === sim.tick) {
      sim.setAction(log[i].bearId, log[i].action);
      i++;
    }
    sim.step();
    trace.update(JSON.stringify(snapshot(sim)));
  }
  return { traceSha256: trace.digest('hex'), endStateSha256: sha256(JSON.stringify(endState(sim))), applied: i, tick: sim.tick };
}
const original = runs[0];
const replayed = replayFromLog(1, original._match.sim.log);
const replay = {
  seed: 1, method: 'bare Sim re-stepped with the recorded action log applied at the recorded ticks (no pilots)',
  logEntries: original.logEntries, logSha256: original.logSha256, appliedEntries: replayed.applied,
  originalTraceSha256: original.normalizedStateTraceSha256, replayTraceSha256: replayed.traceSha256,
  originalEndStateSha256: original.endStateSha256, replayEndStateSha256: replayed.endStateSha256,
  traceEqual: original.normalizedStateTraceSha256 === replayed.traceSha256,
  endStateEqual: original.endStateSha256 === replayed.endStateSha256,
};

// ---- 3. mock PromptPilot path (violet keytar, mid) ---------------------------------------------

const persona = await readFile(path.join(candidate, 'prompts/pilots/keytar.md'), 'utf8');
let mockPilot = null;
const mockStats = { decisions: 0, parseErrors: 0, errorSamples: [], firstPrompt: null, firstReply: null, kinds: {} };
let lastSeenPrompt = '';
const mockRun = await playMatch(1, (bear) => {
  if (bear.team === 'A' && bear.instrument === 'keytar') return (mockPilot = new PromptPilot(persona, mockModel));
  return new ScriptedPilot();
}, {
  hooks: {
    afterTick: () => {
      if (!mockPilot || mockPilot.lastPrompt === lastSeenPrompt) return;
      lastSeenPrompt = mockPilot.lastPrompt;
      mockStats.decisions++;
      if (mockPilot.lastError) { mockStats.parseErrors++; if (mockStats.errorSamples.length < 5) mockStats.errorSamples.push(mockPilot.lastError); }
      if (!mockStats.firstPrompt) {
        mockStats.firstPrompt = { chars: lastSeenPrompt.length, startsWithPersona: lastSeenPrompt.startsWith(persona.trim().slice(0, 40)), containsObservation: lastSeenPrompt.includes(OBS_START), head: lastSeenPrompt.slice(0, 300) };
        mockStats.firstReply = mockPilot.lastReply;
      }
    },
  },
});
const mockBearId = mockRun._match.sim.bears().find((b) => b.team === 'A' && b.instrument === 'keytar').id;
for (const e of mockRun._match.sim.log) if (e.bearId === mockBearId) mockStats.kinds[e.action.kind] = (mockStats.kinds[e.action.kind] ?? 0) + 1;
const mockPath = {
  seed: 1, swapped: 'violet keytar (mid) -> PromptPilot(prompts/pilots/keytar.md, mockModel); others ScriptedPilot',
  personaSha256: sha256(persona), ...mockStats, loggedActionsForSwappedBear: Object.values(mockStats.kinds).reduce((a, b) => a + b, 0),
  end: mockRun.end, winner: mockRun.winner, clock: mockRun.clock, deaths: mockRun.deaths,
  sameEndStateAsAllScripted: mockRun.endStateSha256 === original.endStateSha256,
};

// ---- 4. delayed-reply probe (non-blocking pilot contract) --------------------------------------

const DELAY_TICKS = 60;
const asyncProbe = { delayTicks: DELAY_TICKS, delaySeconds: DELAY_TICKS / TICKS_PER_SEC, windows: [], asksWhilePending: 0, simulatedSeconds: 0 };
{
  let delayedBearId = null;
  const queue = [];
  let asked = 0;
  const delayedPilot = (bear) => ({
    decide: (obs) => {
      asked++;
      const decision = scriptedDecide(obs);
      return new Promise((resolve) => queue.push({ resolve, decision, askedTick: obs.tick, obsHp: obs.self.hp }));
    },
  });
  let window = null;
  const run = await playMatch(1, (bear) => {
    if (bear.team === 'A' && bear.instrument === 'keytar') { delayedBearId = bear.id; return delayedPilot(bear); }
    return new ScriptedPilot();
  }, {
    maxTicks: 120 * TICKS_PER_SEC,
    hooks: {
      afterTick: (match, t) => {
        const sim = match.sim;
        const bear = sim.unit(delayedBearId);
        if (queue.length && !window) {
          const q = queue[0];
          window = { askedTick: q.askedTick, askedClock: formatClock(q.askedTick), actionWhenAsked: JSON.stringify(bear.action), asksAtStart: asked, retainedTicks: 0, changedTicks: 0, minionsAtAsk: sim.units.filter((u) => u.kind === 'minion').length, bearPosAtAsk: { ...bear.pos } };
        }
        if (window && queue.length) {
          if (JSON.stringify(bear.action) === window.actionWhenAsked) window.retainedTicks++; else window.changedTicks++;
          window.asksDuringWait = asked - window.asksAtStart;
          if (t >= queue[0].askedTick + DELAY_TICKS) {
            const q = queue.shift();
            q.resolve(q.decision);
            window.releasedTick = t; window.releasedClock = formatClock(t); window.delayedDecision = JSON.stringify(q.decision);
            window.pendingRelease = true;
          }
        } else if (window && window.pendingRelease) {
          window.actionAfterRelease = JSON.stringify(bear.action);
          window.appliedAtTick = t;
          window.clockAdvancedDuringWait = t - window.askedTick;
          window.minionsAtRelease = sim.units.filter((u) => u.kind === 'minion').length;
          window.bearMovedDuringWait = +Math.hypot(bear.pos.x - window.bearPosAtAsk.x, bear.pos.y - window.bearPosAtAsk.y).toFixed(1);
          window.appliedDecisionMatches = window.actionAfterRelease === JSON.stringify(sim.unit(delayedBearId).action) && window.actionAfterRelease === window.delayedDecision;
          delete window.pendingRelease; delete window.bearPosAtAsk; delete window.asksAtStart;
          if (asyncProbe.windows.length < 4) asyncProbe.windows.push(window);
          window = null;
        }
      },
    },
  });
  asyncProbe.simulatedSeconds = run.simulatedSeconds;
  asyncProbe.totalAsks = asked;
  asyncProbe.decidePeriodTicks = DECIDE_PERIOD;
  asyncProbe.note = 'External pilot returns the scripted decision but resolves its promise only DELAY_TICKS later; the sim keeps stepping, the bear keeps its standing order, and the runner does not re-ask while a decision is pending.';
}

// ---- 5. timeout probes -------------------------------------------------------------------------

const allHold = await playMatch(1, holdPilot);
const asymClockCut = 60;
const asymmetric = await playMatch(1, (bear) => {
  if (bear.team === 'B') return holdPilot();
  const inner = new ScriptedPilot();
  return { decide: (obs) => (obs.tick / TICKS_PER_SEC < asymClockCut ? inner.decide(obs) : Promise.resolve({ kind: obs.self.atBase ? 'hold' : 'recall' })) };
});
const ceasefireCut = 300;
const ceasefire = await playMatch(1, () => {
  const inner = new ScriptedPilot();
  return { decide: (obs) => (obs.tick / TICKS_PER_SEC < ceasefireCut ? inner.decide(obs) : Promise.resolve({ kind: obs.self.atBase ? 'hold' : 'recall' })) };
});
const strip = ({ _match, checkpoints, abilities, deathsList, ...rest }) => rest;
const timeoutProbes = {
  note: 'External pilots only; no game code or timer changed. allHold: six pilots always answer hold. asymmetric: violet scripted until 60 s, then recall home and hold; green hold throughout. ceasefire: all six scripted until 300 s, then recall home and hold.',
  allHold: strip(allHold), asymmetric: { cutoverSeconds: asymClockCut, ...strip(asymmetric) }, ceasefire: { cutoverSeconds: ceasefireCut, ...strip(ceasefire) },
};

// ---- 6. pilot contract sample ------------------------------------------------------------------

const probeSim = new Sim({ seed: 1, bears: DEFAULT_BEARS });
for (let i = 0; i < 40 * TICKS_PER_SEC; i++) probeSim.step();
const sampleObs = probeSim.observe(probeSim.bears()[1]);
const { sanitizeAction } = await load('src/sim/sim.ts');
const pilotContract = {
  observationKeys: Object.keys(sampleObs), selfKeys: Object.keys(sampleObs.self),
  abilityKeys: Object.keys(sampleObs.self.abilities[0]), sampleClock: sampleObs.clock,
  observationJsonChars: JSON.stringify(sampleObs).length,
  vocabularyAccepted: ['move', 'attack', 'ability', 'recall', 'hold'].map((kind) => sanitizeAction({ kind, target: { x: 1, y: 2 }, ability: 'Chord' }).kind),
  unknownKindBecomes: sanitizeAction({ kind: 'dance' }).kind,
  scriptedRecallRule: 'src/pilot/scripted.ts: hp/maxHp < 0.25 and not at base -> recall (or move to base if an enemy is within 220)',
};

// ---- report ------------------------------------------------------------------------------------

async function importGraph(entries) {
  const files = {};
  const queue = [...entries];
  while (queue.length) {
    const rel = queue.shift();
    if (files[rel]) continue;
    const text = await readFile(path.join(candidate, rel), 'utf8');
    files[rel] = sha256(text);
    for (const m of text.matchAll(/from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
  }
  return Object.fromEntries(Object.entries(files).sort());
}
const sourceFiles = await importGraph(['src/sim/sim.ts', 'src/match.ts', 'src/pilot/scripted.ts', 'src/pilot/prompt.ts', 'src/pilot/model.ts', 'src/roster.ts', 'src/sim/kits.ts']);
sourceFiles['prompts/pilots/keytar.md'] = sha256(persona);

const report = {
  schema: 'promptlane-v1-behaviour-1',
  submission: 'fable-v1-001',
  captured_at: new Date().toISOString(),
  node: process.version,
  adapter_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  candidate_execution_copy: candidate,
  source_files_sha256: sourceFiles,
  tick: { ms: TICK_MS, perSecond: TICKS_PER_SEC, matchTicks: MATCH_TICKS, decideEveryTicks: DECIDE_PERIOD },
  scheduler: 'Match.step() at TICK_MS then a full setImmediate flush per simulated frame (browser 1x equivalent); pilots are the submission\'s own ScriptedPilot/PromptPilot+mockModel or disclosed external probe pilots',
  teams: { A: 'violet', B: 'green' },
  limitations: [
    'No browser rendering, user interaction, or real HTTP timing is exercised.',
    'Same-seed repeat equality is repeatability under this scheduler; the log-based replay entry is the replay evidence.',
    'Ability effect signatures are same-tick field reads on the submission\'s own state, not visual confirmation.',
    'Timeout and delayed-reply probes use external pilots, which the pilot contract allows; they are disclosed interventions, not default-settings matches.',
    'Results establish observed outcomes for these seeds on this specimen only.',
  ],
  seeds: SEEDS,
  scripted_runs: runs.map(strip),
  seed1_checkpoints: runs[0].checkpoints,
  seed1_deaths: runs[0].deathsList,
  same_seed_trace_equal: runs[0].normalizedStateTraceSha256 === runs[1].normalizedStateTraceSha256,
  same_seed_end_state_equal: runs[0].endStateSha256 === runs[1].endStateSha256,
  replay,
  mock_path: mockPath,
  async_probe: asyncProbe,
  timeout_probes: timeoutProbes,
  pilot_contract: pilotContract,
  abilities_seed1: Object.fromEntries(Object.entries(runs[0].abilities).map(([k, v]) => [k, { ...v, lastCastByBear: undefined }])),
  summary: {
    nexusKills: runs.filter((r) => r.end === 'nexus').length, matches: runs.length,
    distinctSeedNexusKills: [...new Set(SEEDS)].filter((s) => runs.find((r) => r.seed === s).end === 'nexus').length,
    distinctSeeds: new Set(SEEDS).size,
    firstDeathObservedInEveryMatch: runs.every((r) => r.firstBearbotDeath !== null),
  },
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  output,
  same_seed_trace_equal: report.same_seed_trace_equal,
  replay_trace_equal: replay.traceEqual,
  runs: runs.map(({ seed, end, winner, clock, firstBearbotDeath, deaths, recallStarts, minionsSeen }) =>
    ({ seed, end, winner, clock, firstDeath: firstBearbotDeath?.clock ?? null, deaths, recallStarts, minionsSeen })),
  mock: { decisions: mockPath.decisions, parseErrors: mockPath.parseErrors, end: mockPath.end, winner: mockPath.winner },
  timeout: { allHold: [allHold.end, allHold.winner, allHold.rawReason], asymmetric: [asymmetric.end, asymmetric.winner, asymmetric.rawReason], ceasefire: [ceasefire.end, ceasefire.winner, ceasefire.rawReason] },
}, null, 2));
