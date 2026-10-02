/**
 * The data behind the fight verdict's calibration (docs/vocabulary-spec.md §4.1 A3, §7 D4), with no
 * model call: replay recorded match logs through the unchanged sim (`verifyReplay`'s observation
 * hook), and at every decision where a bot sees an enemy bearbot, write what it saw and every
 * bearbot's hp `--horizon-sec` later. `tools/jev/calibrate_fight.py` scores the verdict on it.
 *
 * Every bearbot's hp at a tick comes from that tick's observations: each bot sees its own hp and
 * every living ally map-wide, so one observation per team covers all six. A bot nobody on its team
 * reports at a tick where its team was observed is dead (hp 0).
 *
 * Sampled every `--every-sec` of asks (one ask round is 0.5 s).
 *
 *   node tools/match/fight_samples.mjs --out samples.jsonl [--every-sec 2] [--horizon-sec 5] <log.json | dir> ...
 *
 * A directory is searched recursively for match logs; a log that doesn't replay is skipped and counted.
 */
import { createWriteStream, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { flush, loadHeadless } from './load.mjs';

const TICK_HZ = 20; // src/sim/match.ts

function parseArgs(argv) {
  const args = { out: null, everySec: 2, horizonSec: 5, inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--every-sec') args.everySec = Number(argv[++i]);
    else if (a === '--horizon-sec') args.horizonSec = Number(argv[++i]);
    else args.inputs.push(a);
  }
  if (!args.out || !args.inputs.length) throw new Error('usage: fight_samples.mjs --out FILE [--every-sec N] [--horizon-sec N] <log|dir> ...');
  return args;
}

function* jsonFiles(p) {
  if (statSync(p).isDirectory()) {
    for (const name of readdirSync(p)) if (name !== 'node_modules' && name !== '.git') yield* jsonFiles(path.join(p, name));
  } else if (p.endsWith('.json')) yield p;
}

function readLog(file) {
  try {
    const log = JSON.parse(readFileSync(file, 'utf8'));
    return log && Array.isArray(log.checkpoints) && Array.isArray(log.decisions) ? log : null;
  } catch {
    return null;
  }
}

/** Every bearbot's hp at each observed tick, per team: `tick -> team -> Map(id -> hp)`. */
function hpByTick(seen) {
  const out = new Map();
  for (const { tick, obs } of seen) {
    const teams = out.get(tick) ?? new Map();
    const ids = teams.get(obs.self.team) ?? new Map();
    ids.set(obs.self.id, obs.self.hp);
    for (const a of obs.allies) ids.set(a.id, a.hp);
    teams.set(obs.self.team, ids);
    out.set(tick, teams);
  }
  return out;
}

export async function samplesFromLog(h, log, { everySec = 2, horizonSec = 5 } = {}) {
  const seen = [];
  const v = await h.verifyReplay(log, flush, (decision, obs) => seen.push({ tick: decision.tick, obs }));
  if (!v.ok) return null;
  const hp = hpByTick(seen);
  // Asks land every 0.5 s from tick 1 (1, 12, 22, ...), so sample by ask round, and read "later"
  // from the round nearest `horizonSec` on.
  const rounds = [...hp.keys()].sort((a, b) => a - b);
  const roundOf = new Map(rounds.map((t, i) => [t, i]));
  const every = Math.max(1, Math.round(everySec * 2));
  const horizon = Math.round(horizonSec * TICK_HZ);
  const laterTick = (tick) => {
    let best = null;
    for (const t of rounds) if (Math.abs(t - (tick + horizon)) <= TICK_HZ / 4 && (best === null || Math.abs(t - tick - horizon) < Math.abs(best - tick - horizon))) best = t;
    return best;
  };
  const out = [];
  for (const { tick, obs } of seen) {
    if (roundOf.get(tick) % every !== 0 || !obs.visibleEnemies.some((e) => e.kind === 'bearbot')) continue;
    const at = laterTick(tick);
    const later = at === null ? null : hp.get(at);
    if (!later) continue;
    const enemyTeam = obs.self.team === 'violet' ? 'green' : 'violet';
    const ids = [obs.self.id, ...obs.allies.map((a) => a.id), ...obs.visibleEnemies.filter((e) => e.kind === 'bearbot').map((e) => e.id)];
    const future = {};
    let known = true;
    for (const id of ids) {
      const team = id === obs.self.id || obs.allies.some((a) => a.id === id) ? obs.self.team : enemyTeam;
      const reports = later.get(team);
      if (!reports) known = false;
      else future[id] = reports.get(id) ?? 0;
    }
    if (known) out.push({ tick, map: log.map ?? null, obs, future });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const h = await loadHeadless();
  const out = createWriteStream(args.out);
  let logs = 0;
  let skipped = 0;
  let rows = 0;
  for (const input of args.inputs) {
    for (const file of jsonFiles(input)) {
      const log = readLog(file);
      if (!log) continue;
      const samples = await samplesFromLog(h, log, args);
      if (!samples) {
        skipped += 1;
        continue;
      }
      logs += 1;
      for (const s of samples) out.write(JSON.stringify({ log: path.basename(file), ...s }) + '\n');
      rows += samples.length;
    }
  }
  await new Promise((r) => out.end(r));
  console.log(JSON.stringify({ logs, skipped, rows, out: args.out }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
