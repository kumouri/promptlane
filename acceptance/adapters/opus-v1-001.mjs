/**
 * Read-only behavioural diagnostic for the frozen `opus-v1-001` submission (claude-opus-5).
 * Usage: node acceptance/adapters/opus-v1-001.mjs CANDIDATE OUTPUT.json
 * CANDIDATE is a temporary execution copy of the submission with `npm ci` done; the frozen
 * submission itself is never read for execution. Writes only OUTPUT (refuses to overwrite).
 *
 * The submission's own `World`, `PilotRunner`, `settle`, `ScriptedPilot`, `PromptPilot`,
 * `mockCallModel` and `observe` are imported unchanged through Node's native TypeScript type
 * stripping (no bundler, no rewrite). Nothing in the game is patched; every intervention below is
 * an external pilot or a caller-side loop.
 *
 * ARTIFICIAL SCHEDULER (disclosed): each simulated frame is `world.step()` (the submission's own
 * 50 ms tick), `runner.onTick(world)` (its 10-tick pilot cadence) and then the submission's own
 * `settle()` (six microtask turns) so an already-resolved pilot decision lands before the next
 * tick. That is exactly the loop the submission's browser `frame()` and `scripts/sim.ts` run; the
 * browser additionally bounds steps per animation frame, which does not change tick order.
 * Scripted pilots receive `world.rng.fork(100 + index)` as the browser does. Nothing here is a
 * browser run, real HTTP timing, or human observation.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [candidateArg, outputArg] = process.argv.slice(2);
if (!candidateArg || !outputArg || process.argv.length !== 4) {
  console.error('Usage: node acceptance/adapters/opus-v1-001.mjs CANDIDATE OUTPUT.json');
  process.exit(2);
}
const candidate = path.resolve(candidateArg);
const output = path.resolve(outputArg);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const load = (relative) => import(pathToFileURL(path.join(candidate, relative)).href);

const { World, TPS, MATCH_TICKS, fmtClock } = await load('src/sim/world.ts');
const { PilotRunner, settle, sanitizeAction, DECIDE_EVERY_TICKS } = await load('src/pilots/runner.ts');
const { ScriptedPilot } = await load('src/pilots/scripted.ts');
const { PromptPilot } = await load('src/pilots/prompt.ts');
const { mockCallModel, OBS_START } = await load('src/pilots/adapters.ts');
const { observe } = await load('src/pilots/observe.ts');
const { KITS } = await load('src/sim/instruments.ts');

const TICK_MS = 1000 / TPS;
const SEEDS = [1, 1, 42, 2, 3, 7];
const clock = (tick) => Number((tick / TPS).toFixed(2));
const MOCK_BOT = 'violet-keytar';

// ---- normalized state --------------------------------------------------------------------------

function snapshot(world) {
  return {
    tick: world.tick,
    bots: world.bots.map((b) => [b.team, b.instrument, +b.hp.toFixed(3), +b.pos.x.toFixed(3), +b.pos.y.toFixed(3), b.alive, b.recallUntil >= 0]),
    minions: world.minions.map((m) => [m.team, m.lane, +m.hp.toFixed(3), +m.pos.x.toFixed(3), +m.pos.y.toFixed(3), m.alive]),
    towers: world.towers.map((t) => [t.team, t.lane, t.tier, +t.hp.toFixed(3), t.alive]),
    nexuses: ['violet', 'green'].map((t) => [t, +world.nexus[t].hp.toFixed(3), world.nexus[t].alive]),
  };
}
const endState = (world) => ({
  ...snapshot(world),
  minions: undefined,
  result: world.winner && { winner: world.winner, reason: world.winReason, tick: world.tick },
});
const normalizeEnd = (world) => (world.winReason === 'nexus destroyed' ? 'nexus' : 'timeout');

// ---- one full match under the adapter scheduler ------------------------------------------------

async function playMatch(seed, makePilot, { maxTicks = MATCH_TICKS + 2, hooks = {} } = {}) {
  const world = new World(seed);
  const runner = new PilotRunner();
  world.bots.forEach((b, i) => runner.setPilot(b.id, makePilot(b, i, world)));
  const initial = { bearbots: world.bots.length, towers: world.towers.length, nexuses: 2 };
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
  const cds = (b) => KITS[b.instrument].abilities.map((a) => b.cooldowns[a.name] ?? 0);
  let prevBots = world.bots.map((b) => ({ alive: b.alive, hp: b.hp, x: b.pos.x, y: b.pos.y, recalling: b.recallUntil >= 0, cds: cds(b) }));
  let ticks = 0;
  while (!world.winner && ticks < maxTicks) {
    const beforeEnemies = [...world.bots, ...world.minions].filter((u) => u.alive).map((u) => ({ u, hp: u.hp, x: u.pos.x, y: u.pos.y }));
    world.step();
    runner.onTick(world);
    await settle();
    ticks++;
    const t = world.tick;
    hooks.afterTick?.(world, runner, t);
    const nowMinions = new Map();
    for (const m of world.minions) {
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
    world.bots.forEach((b, i) => {
      const prev = prevBots[i];
      if (prev.alive && !b.alive) {
        stats.deaths[b.team]++;
        if (stats.firstBearbotDeath === null) stats.firstBearbotDeath = { at: clock(t), clock: fmtClock(t), team: b.team, instrument: b.instrument };
        if (stats.deathsList.length < 40) stats.deathsList.push({ at: clock(t), team: b.team, instrument: b.instrument });
      }
      const recalling = b.recallUntil >= 0;
      if (!prev.recalling && recalling) stats.recallStarts[b.team]++;
      if (prev.recalling && !recalling && b.alive && Math.hypot(b.pos.x - prev.x, b.pos.y - prev.y) > 100) stats.recallCompletions[b.team]++;
      const now = cds(b);
      now.forEach((ready, k) => {
        if (ready > prev.cds[k]) recordCast(stats.abilities, b, KITS[b.instrument].abilities[k], t, prev, beforeEnemies, world);
      });
      prevBots[i] = { alive: b.alive, hp: b.hp, x: b.pos.x, y: b.pos.y, recalling, cds: now };
    });
    for (const tw of world.towers) {
      if (!tw.alive && !stats.towerFalls.some((f) => f.team === tw.team && f.lane === tw.lane && f.tier === tw.tier)) {
        stats.towerFalls.push({ at: clock(t), clock: fmtClock(t), team: tw.team, lane: tw.lane, tier: tw.tier });
      }
    }
    if (t % (60 * TPS) === 0 || world.winner) stats.checkpoints.push(checkpoint(world));
    trace.update(JSON.stringify(snapshot(world)));
  }
  for (const b of world.bots) stats.kills[b.team] += b.kills;
  stats.minionsSeen = seenMinions.size;
  for (const lane of Object.keys(stats.minionFirstSeen)) {
    const waves = [...new Set(stats.minionFirstSeen[lane])].sort((a, b) => a - b);
    stats.minionFirstSeen[lane] = waves.slice(0, 8).map((w) => clock(w));
  }
  return {
    seed, initial, ticks, simulatedSeconds: clock(world.tick), clock: fmtClock(world.tick), ended: !!world.winner,
    end: world.winner ? normalizeEnd(world) : 'unfinished', winner: world.winner ?? null, rawReason: world.winReason || null,
    firstBearbotDeath: stats.firstBearbotDeath, deaths: stats.deaths, kills: stats.kills,
    recallStarts: stats.recallStarts, recallCompletions: stats.recallCompletions,
    firstMinionAt: stats.firstMinionAt, minionWavesFirstSeen: stats.minionFirstSeen, minionsSeen: stats.minionsSeen,
    minionDeaths: stats.minionDeaths, minionMoveSamples: stats.minionMoveSamples, minionDamageTicks: stats.minionDamageTicks,
    towerFalls: stats.towerFalls, deathsList: stats.deathsList, checkpoints: stats.checkpoints,
    finalTowers: { violet: world.towersAlive('violet'), green: world.towersAlive('green') },
    finalNexusHp: { violet: +world.nexus.violet.hp.toFixed(1), green: +world.nexus.green.hp.toFixed(1) },
    abilities: stats.abilities,
    logEntries: world.log.length, logSha256: sha256(JSON.stringify(world.log)),
    normalizedStateTraceSha256: trace.digest('hex'), endStateSha256: sha256(JSON.stringify(endState(world))),
    _world: world, _runner: runner,
  };
}

function checkpoint(world) {
  const alive = (team) => world.bots.filter((b) => b.team === team && b.alive).length;
  return {
    clock: fmtClock(world.tick), towers: { violet: world.towersAlive('violet'), green: world.towersAlive('green') },
    nexusHp: { violet: Math.round(world.nexus.violet.hp), green: Math.round(world.nexus.green.hp) },
    aliveBots: { violet: alive('violet'), green: alive('green') }, kills: { ...world.kills },
  };
}

/** Cast detected by the ability's ready-tick moving forward; record repeat interval and a same-tick effect signature. */
function recordCast(store, caster, def, t, prevCaster, beforeEnemies, world) {
  const key = `${caster.instrument}/${def.name}`;
  const entry = (store[key] ??= { instrument: caster.instrument, ability: def.name, cooldownTicks: Math.round(def.cooldown * TPS), cooldownSeconds: def.cooldown, casts: 0, minRepeatIntervalTicks: null, lastCastByBear: {}, firstEffects: [] });
  entry.casts++;
  const last = entry.lastCastByBear[caster.id];
  if (last !== undefined) entry.minRepeatIntervalTicks = Math.min(entry.minRepeatIntervalTicks ?? Infinity, t - last);
  entry.lastCastByBear[caster.id] = t;
  if (entry.firstEffects.length < 2) {
    const near = beforeEnemies.filter(({ u }) => u.team !== caster.team && Math.hypot(u.pos.x - caster.pos.x, u.pos.y - caster.pos.y) < 260);
    entry.firstEffects.push({
      at: clock(t), team: caster.team,
      casterMovedUnits: +Math.hypot(caster.pos.x - prevCaster.x, caster.pos.y - prevCaster.y).toFixed(1),
      casterHasted: caster.fx.hasteUntil > world.tick,
      enemiesNear: near.length,
      enemiesDamaged: near.filter(({ u, hp }) => u.hp < hp).length,
      enemiesKilled: near.filter(({ u }) => !u.alive).length,
      enemyBearsSlowed: near.filter(({ u }) => u.kind === 'bearbot' && u.fx.slowUntil > world.tick).length,
      enemyBearsTaunted: near.filter(({ u }) => u.kind === 'bearbot' && u.fx.tauntedBy === caster.id && u.fx.tauntUntil > world.tick).length,
      enemiesDisplacedOver20: near.filter(({ u, x, y }) => Math.hypot(u.pos.x - x, u.pos.y - y) > 20).length,
    });
  }
}

// ---- pilots used by the probes (external, allowed by the pilot contract) ----------------------

const scripted = (bot, i, world) => new ScriptedPilot(world.rng.fork(100 + i));
const holdPilot = () => ({ label: 'probe-hold', decide: async () => ({ kind: 'hold' }) });

// ---- 1. scripted runs --------------------------------------------------------------------------

const runs = [];
for (const seed of SEEDS) runs.push(await playMatch(seed, scripted));

// ---- 2. log-based replay of seed 1 -------------------------------------------------------------

function replayFromLog(seed, log) {
  const world = new World(seed);
  const bots = new Map(world.bots.map((b) => [b.id, b]));
  const trace = createHash('sha256');
  let i = 0;
  while (!world.winner) {
    world.step();
    while (i < log.length && log[i].tick === world.tick) {
      world.setAction(bots.get(log[i].id), log[i].action);
      i++;
    }
    trace.update(JSON.stringify(snapshot(world)));
  }
  return { traceSha256: trace.digest('hex'), endStateSha256: sha256(JSON.stringify(endState(world))), applied: i, tick: world.tick };
}
const original = runs[0];
const replayed = replayFromLog(1, original._world.log);
const replay = {
  seed: 1, method: 'bare World re-stepped with the recorded action log applied at the recorded ticks (no pilots)',
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
let seenCalls = 0;
const mockRun = await playMatch(1, (bot, i, world) => {
  if (bot.id === MOCK_BOT) return (mockPilot = new PromptPilot(persona, mockCallModel, 'Prompt · mock'));
  return scripted(bot, i, world);
}, {
  hooks: {
    afterTick: () => {
      if (!mockPilot || mockPilot.calls === seenCalls) return;
      seenCalls = mockPilot.calls;
      mockStats.decisions++;
      if (mockPilot.lastError) { mockStats.parseErrors++; if (mockStats.errorSamples.length < 5) mockStats.errorSamples.push(mockPilot.lastError); }
      if (!mockStats.firstPrompt) {
        mockStats.firstPrompt = { chars: mockPilot.lastPrompt.length, startsWithPersona: mockPilot.lastPrompt.startsWith(persona.trim().slice(0, 40)), containsObservation: mockPilot.lastPrompt.includes(OBS_START), head: mockPilot.lastPrompt.slice(0, 300) };
        mockStats.firstReply = mockPilot.lastReply;
      }
    },
  },
});
for (const e of mockRun._world.log) if (e.id === MOCK_BOT) mockStats.kinds[e.action.kind] = (mockStats.kinds[e.action.kind] ?? 0) + 1;
const mockPath = {
  seed: 1, swapped: `${MOCK_BOT} (mid) -> PromptPilot(prompts/pilots/keytar.md, mockCallModel); others ScriptedPilot`,
  personaSha256: sha256(persona), ...mockStats, loggedActionsForSwappedBear: Object.values(mockStats.kinds).reduce((a, b) => a + b, 0),
  end: mockRun.end, winner: mockRun.winner, clock: mockRun.clock, deaths: mockRun.deaths,
  sameEndStateAsAllScripted: mockRun.endStateSha256 === original.endStateSha256,
};

// ---- 4. delayed-reply probe (non-blocking pilot contract) --------------------------------------

const DELAY_TICKS = 60;
const asyncProbe = { delayTicks: DELAY_TICKS, delaySeconds: DELAY_TICKS / TPS, windows: [], simulatedSeconds: 0 };
{
  const queue = [];
  let asked = 0;
  const delayedPilot = (bot, i, world) => {
    const inner = scripted(bot, i, world);
    return {
      label: 'probe-delayed',
      decide: async (obs) => {
        asked++;
        const decision = await inner.decide(obs);
        return new Promise((resolve) => queue.push({ resolve, decision, askedTick: obs.tick }));
      },
    };
  };
  let window = null;
  const run = await playMatch(1, (bot, i, world) => (bot.id === MOCK_BOT ? delayedPilot(bot, i, world) : scripted(bot, i, world)), {
    maxTicks: 120 * TPS,
    hooks: {
      afterTick: (world, runner, t) => {
        const bot = world.bots.find((b) => b.id === MOCK_BOT);
        if (queue.length && !window) {
          const q = queue[0];
          window = { askedTick: q.askedTick, askedClock: fmtClock(q.askedTick), actionWhenAsked: JSON.stringify(bot.action), asksAtStart: asked, retainedTicks: 0, changedTicks: 0, minionsAtAsk: world.minions.length, bearPosAtAsk: { ...bot.pos } };
        }
        if (window && queue.length) {
          if (JSON.stringify(bot.action) === window.actionWhenAsked) window.retainedTicks++; else window.changedTicks++;
          window.asksDuringWait = asked - window.asksAtStart;
          if (t >= queue[0].askedTick + DELAY_TICKS) {
            const q = queue.shift();
            q.resolve(q.decision);
            window.releasedTick = t; window.releasedClock = fmtClock(t); window.delayedDecision = JSON.stringify(q.decision);
            window.pendingRelease = true;
          }
        } else if (window && window.pendingRelease) {
          window.actionAfterRelease = JSON.stringify(bot.action);
          window.appliedAtTick = t;
          window.clockAdvancedDuringWait = t - window.askedTick;
          window.minionsAtRelease = world.minions.length;
          window.bearMovedDuringWait = +Math.hypot(bot.pos.x - window.bearPosAtAsk.x, bot.pos.y - window.bearPosAtAsk.y).toFixed(1);
          window.appliedDecisionMatches = window.actionAfterRelease === JSON.stringify(sanitizeAction(JSON.parse(window.delayedDecision)));
          delete window.pendingRelease; delete window.bearPosAtAsk; delete window.asksAtStart;
          if (asyncProbe.windows.length < 4) asyncProbe.windows.push(window);
          window = null;
        }
      },
    },
  });
  asyncProbe.simulatedSeconds = run.simulatedSeconds;
  asyncProbe.totalAsks = asked;
  asyncProbe.decidePeriodTicks = DECIDE_EVERY_TICKS;
  asyncProbe.note = 'External pilot returns the scripted decision but resolves its promise only DELAY_TICKS later; the sim keeps stepping, the bear keeps its standing order, and the runner does not re-ask while a decision is pending.';
}

// ---- 5. timeout probes -------------------------------------------------------------------------

const allHold = await playMatch(1, holdPilot);
const asymClockCut = 60;
const asymmetric = await playMatch(1, (bot, i, world) => {
  if (bot.team === 'green') return holdPilot();
  const inner = scripted(bot, i, world);
  return { label: 'probe-cutover', decide: (obs) => (obs.tick / TPS < asymClockCut ? inner.decide(obs) : Promise.resolve({ kind: obs.self.atBase ? 'hold' : 'recall' })) };
});
const ceasefireCut = 300;
const ceasefire = await playMatch(1, (bot, i, world) => {
  const inner = scripted(bot, i, world);
  return { label: 'probe-ceasefire', decide: (obs) => (obs.tick / TPS < ceasefireCut ? inner.decide(obs) : Promise.resolve({ kind: obs.self.atBase ? 'hold' : 'recall' })) };
});
const strip = ({ _world, _runner, checkpoints, abilities, deathsList, ...rest }) => rest;
const timeoutProbes = {
  note: 'External pilots only; no game code or timer changed. allHold: six pilots always answer hold. asymmetric: violet scripted until 60 s, then recall home and hold; green hold throughout. ceasefire: all six scripted until 300 s, then recall home and hold.',
  allHold: strip(allHold), asymmetric: { cutoverSeconds: asymClockCut, ...strip(asymmetric) }, ceasefire: { cutoverSeconds: ceasefireCut, ...strip(ceasefire) },
};

// ---- 6. pilot contract sample ------------------------------------------------------------------

const probeWorld = new World(1);
for (let i = 0; i < 40 * TPS; i++) probeWorld.step();
const sampleObs = observe(probeWorld, probeWorld.bots[1]);
const pilotContract = {
  observationKeys: Object.keys(sampleObs), selfKeys: Object.keys(sampleObs.self),
  abilityKeys: Object.keys(sampleObs.self.abilities[0]), sampleClock: sampleObs.clock,
  observationJsonChars: JSON.stringify(sampleObs).length,
  vocabularyAccepted: ['move', 'attack', 'ability', 'recall', 'hold'].map((kind) => sanitizeAction({ kind, target: { x: 1, y: 2 }, ability: 'Chord' }).kind),
  unknownKindBecomes: sanitizeAction({ kind: 'dance' }).kind,
  scriptedRecallRule: 'src/pilots/scripted.ts: hp/maxHp < 0.25 and not at base -> recall; keeps recalling while recalling and below 60%',
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
const sourceFiles = await importGraph(['src/sim/world.ts', 'src/pilots/runner.ts', 'src/pilots/scripted.ts', 'src/pilots/prompt.ts', 'src/pilots/adapters.ts', 'src/pilots/observe.ts', 'src/sim/instruments.ts']);
sourceFiles['prompts/pilots/keytar.md'] = sha256(persona);

const report = {
  schema: 'promptlane-v1-behaviour-1',
  submission: 'opus-v1-001',
  captured_at: new Date().toISOString(),
  node: process.version,
  adapter_sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  candidate_execution_copy: candidate,
  source_files_sha256: sourceFiles,
  tick: { ms: TICK_MS, perSecond: TPS, matchTicks: MATCH_TICKS, decideEveryTicks: DECIDE_EVERY_TICKS },
  scheduler: 'world.step(); runner.onTick(world); await settle() per simulated frame, identical to the submission\'s browser frame() and scripts/sim.ts; pilots are the submission\'s own ScriptedPilot(world.rng.fork(100+i))/PromptPilot+mockCallModel or disclosed external probe pilots',
  teams: { violet: 'violet', green: 'green' },
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
