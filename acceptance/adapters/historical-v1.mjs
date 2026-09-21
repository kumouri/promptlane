/**
 * Read-only diagnostic for the ORIGINAL specimen, not a generic acceptance adapter.
 * Usage: node acceptance/adapters/historical-v1.mjs CANDIDATE OUTPUT.json
 * Requires the specimen's installed esbuild (a Vite dependency). Writes only OUTPUT.
 * Deliberately runs private tick() with microtasks settled between ticks; this is a
 * disclosed simulated scheduler, NOT proof of browser timing or log-based replay.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [candidateArg, outputArg] = process.argv.slice(2);
if (!candidateArg || !outputArg || process.argv.length !== 4) {
  console.error('Usage: node acceptance/adapters/historical-v1.mjs CANDIDATE OUTPUT.json');
  process.exit(2);
}
const candidate = path.resolve(candidateArg);
const output = path.resolve(outputArg);
const requireCandidate = createRequire(path.join(candidate, 'package.json'));
const { build } = requireCandidate('esbuild');
const source = (relative) => JSON.stringify(path.join(candidate, relative).replaceAll('\\', '/'));
const contents = `
import { Match, TICK_DT } from ${source('src/sim/match.ts')};
import { ScriptedPilot } from ${source('src/pilots/scriptedPilot.ts')};
import { createHash } from 'node:crypto';

export async function probe(seed) {
  const roster = ['violet', 'green'].flatMap(team =>
    [['top', 'drums'], ['mid', 'keytar'], ['bottom', 'violin']].map(([lane, instrument]) =>
      ({ team, lane, instrument, pilotKind: 'scripted', makePilot: () => new ScriptedPilot() })));
  const match = new Match(seed, roster);
  if (typeof match.tick !== 'function') throw new Error('Unsupported historical implementation');
  const initial = { bearbots: match.bearbots.length, towers: match.towers.length, nexuses: match.nexuses.length };
  const minionsSeen = new Set();
  const recalls = [];
  const deaths = [];
  let recallStarts = 0, completedHeals = 0, firstMinionAt = null, ticks = 0;
  const trace = createHash('sha256');
  for (; ticks < Math.ceil(600 / TICK_DT) + 2 && !match.ended; ticks++) {
    const before = match.bearbots.map(b => ({ alive: b.alive, recalling: b.recalling, hp: b.hp, x: b.pos.x, y: b.pos.y }));
    match.tick(TICK_DT);
    // Flush the scripted pilot's Promise chain exactly once per simulated frame.
    await new Promise(resolve => setImmediate(resolve));
    for (const minion of match.minions) minionsSeen.add(minion.id);
    if (firstMinionAt === null && match.minions.length) firstMinionAt = match.clockSec;
    match.bearbots.forEach((b, i) => {
      const prev = before[i];
      if (prev.alive && !b.alive) deaths.push({ at: match.clockSec, team: b.team, instrument: b.instrument });
      if (!prev.recalling && b.recalling) {
        recallStarts++;
        if (recalls.length < 6) recalls.push({
          at: match.clockSec, team: b.team, instrument: b.instrument, hp: b.hp,
          distanceMovedThisTick: Math.hypot(b.pos.x - prev.x, b.pos.y - prev.y)
        });
      }
      if (prev.recalling && !b.recalling && b.hp > prev.hp) completedHeals++;
    });
    trace.update(JSON.stringify({
      clock: match.clockSec,
      bots: match.bearbots.map(b => [b.team, b.instrument, b.hp, b.pos.x, b.pos.y, b.alive, b.recalling]),
      minions: match.minions.map(m => [m.team, m.lane, m.hp, m.pos.x, m.pos.y, m.alive]),
      towers: match.towers.map(t => [t.team, t.lane, t.hp, t.alive]),
      nexuses: match.nexuses.map(n => [n.team, n.hp, n.alive])
    }));
  }
  return {
    seed, initial, ticks, simulatedSeconds: match.clockSec, ended: match.ended,
    winner: match.winner, endReason: match.endReason, firstMinionAt, minionsSeen: minionsSeen.size,
    deaths, recallStarts, completedHeals, firstRecallSamples: recalls,
    finalTowers: match.towers.map(t => ({ team: t.team, lane: t.lane, tier: t.tier, hp: t.hp, alive: t.alive })),
    finalNexuses: match.nexuses.map(n => ({ team: n.team, hp: n.hp, alive: n.alive })),
    normalizedStateTraceSha256: trace.digest('hex')
  };
}
`;

const bundle = await build({
  stdin: { contents, resolveDir: candidate, sourcefile: 'historical-diagnostic.ts', loader: 'ts' },
  absWorkingDir: candidate,
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  metafile: true,
  logLevel: 'silent',
});
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = {};
for (const relative of Object.keys(bundle.metafile.inputs)) {
  if (relative === 'historical-diagnostic.ts') continue;
  files[relative.replaceAll('\\', '/')] = sha256(await readFile(path.resolve(candidate, relative)));
}
const adapterSha256 = sha256(await readFile(fileURLToPath(import.meta.url)));
const { probe } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const runs = [];
for (const seed of [1, 1, 42]) runs.push(await probe(seed));
const report = {
  schema: 'promptlane-historical-diagnostic-1',
  captured_at: new Date().toISOString(),
  adapter_sha256: adapterSha256,
  source_files_sha256: files,
  scheduler: 'Direct private tick at TICK_DT; setImmediate flush of scripted decisions between ticks',
  limitations: [
    'Historical implementation only; not a requirement for cleanroom module layout.',
    'No browser rendering, user interaction, or real HTTP timing is exercised.',
    'Same-seed state traces under this scheduler are not log-based replay evidence.',
    'Results establish observed outcomes for these seeds, not a universal recall diagnosis.',
  ],
  runs,
  same_seed_trace_equal: runs[0].normalizedStateTraceSha256 === runs[1].normalizedStateTraceSha256,
  baseline_nexus_kill_observed: runs.some(run => run.endReason === 'nexus'),
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  output,
  same_seed_trace_equal: report.same_seed_trace_equal,
  runs: runs.map(({ seed, endReason, winner, deaths, recallStarts, minionsSeen }) =>
    ({ seed, endReason, winner, deaths: deaths.length, recallStarts, minionsSeen })),
}, null, 2));
