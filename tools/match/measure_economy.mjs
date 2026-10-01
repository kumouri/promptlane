#!/usr/bin/env node
/**
 * The economy's pre-registered measurement (docs/economy-spec.md §6): four conditions × two
 * pairings × twelve seeds = 96 Jam-shape matches on Jev, every one written to its own log, then
 * measured with `npm run metrics`.
 *
 *   python tools/jev/schema_server.py --port 8851 --budget-usd 9.50      # the Jev backend, separately
 *   node tools/match/measure_economy.mjs --jev-schema http://127.0.0.1:8851/ --date 2026-10-03
 *   node tools/match/measure_economy.mjs --date 2026-10-03 --dry-run       # print the plan only
 *
 * | condition | ruleset (`--economy`) | prompts |
 * |---|---|---|
 * | A  | none       | today's: house medium, house hard, the economy-blind sample entrant |
 * | R  | respawn-1  | today's (respawn only: no gold, no levels, no economy in the observation) |
 * | B0 | eco-2      | today's (default builds; nobody shops on purpose) |
 * | B1 | eco-2      | economy-aware: the eco house tiers and the eco sample entrant |
 *
 * Pairings: house medium (violet) vs house hard (green), and house medium (violet) vs the sample
 * entrant (green). The side names stay `medium` / `hard` / `entrant` in EVERY condition, because
 * `metrics` pairs matches on side names and seed.
 *
 * Runs seed by seed (a seed's eight matches back to back, so the pairs share a backend window), one
 * match at a time by default (the Jev token-renewal history argues against parallel runs; `--parallel 2`
 * is what the slice used). A log that already exists is skipped, so an interrupted run resumes by
 * running the same command again. At the end it prints the two `npm run metrics` commands.
 *
 * `--recall recall-2` plays every match with the channelled recall (src/recall.ts, docs/economy-spec.md
 * §9.10) instead of the specimen's 3x run. Without it the plan is exactly the one above. Use a new
 * `--date` for such a run, so its logs never mix with a run on the specimen recall.
 *
 * Every match plays the tick resolution `--resolution` names (src/resolution.ts; default
 * simultaneous-1, the runner's DEFAULT_RESOLUTION). A date whose existing logs were played under
 * another one (every log written before the option existed is `sequential`) refuses to resume
 * rather than mix the two: pass `--resolution sequential` to finish such a run as it started.
 * `--targeting` (tools/jev/target_resolve.py; default own-lane-1) works the same way, and a log
 * written before that option existed is `first-min`.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** The seeds the economy slice used (runs/economy-slice-2026-09-30.md), so B0/A can be compared with it. */
export const SEEDS = [7, 11, 42, 101, 3, 5, 13, 17, 23, 29, 31, 37];

const P = 'prompts/pilots/';
const SIDE_FILES = {
  plain: {
    medium: { prompt: `${P}house-violet.md`, schemas: `${P}house-medium.schemas.json` },
    hard: { prompt: `${P}house-hard.prose.md`, schemas: `${P}house-hard.schemas.json` },
    entrant: { prompt: `${P}sample-entrant.prose.md`, schemas: `${P}sample-entrant.schemas.json` },
  },
  eco: {
    medium: { prompt: `${P}house-eco-violet.md`, schemas: `${P}house-medium-eco.schemas.json` },
    hard: { prompt: `${P}house-hard-eco.prose.md`, schemas: `${P}house-hard-eco.schemas.json` },
    entrant: { prompt: `${P}sample-entrant-eco.prose.md`, schemas: `${P}sample-entrant-eco.schemas.json` },
  },
};

export const CONDITIONS = {
  A: { economy: 'none', prompts: 'plain' },
  R: { economy: 'respawn-1', prompts: 'plain' },
  B0: { economy: 'eco-2', prompts: 'plain' },
  B1: { economy: 'eco-2', prompts: 'eco' },
};
export const PAIRINGS = { hard: ['medium', 'hard'], entrant: ['medium', 'entrant'] };

/** Mirrors DEFAULT_RESOLUTION in src/resolution.ts (a test holds them equal). */
export const DEFAULT_RESOLUTION = 'simultaneous-1';
/** Mirrors DEFAULT_TARGETING in tools/match/jevSchemaPilot.ts (a test holds them equal). */
export const DEFAULT_TARGETING = 'own-lane-1';

export const logFile = (date, condition, pairing, seed) => `runs/economy-measure-${date}-${condition}-medium-vs-${pairing}-seed${seed}.json`;

/** Every match of the plan, seed-major, as the `npm run match` arguments that play it. */
export function planMeasurement({ date, jevSchema = 'http://127.0.0.1:8851/', seeds = SEEDS, conditions = Object.keys(CONDITIONS), pairings = Object.keys(PAIRINGS), recall = null, resolution = DEFAULT_RESOLUTION, targeting = DEFAULT_TARGETING }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) throw new Error('--date YYYY-MM-DD is required (it names the logs)');
  const jobs = [];
  for (const seed of seeds) {
    for (const pairing of pairings) {
      if (!PAIRINGS[pairing]) throw new Error(`unknown pairing ${pairing} (known: ${Object.keys(PAIRINGS).join(', ')})`);
      for (const condition of conditions) {
        const c = CONDITIONS[condition];
        if (!c) throw new Error(`unknown condition ${condition} (known: ${Object.keys(CONDITIONS).join(', ')})`);
        const [a, b] = PAIRINGS[pairing].map((side) => ({ name: side, ...SIDE_FILES[c.prompts][side] }));
        const out = logFile(date, condition, pairing, seed);
        const args = [
          '--a', a.prompt, '--a-schemas', a.schemas, '--name-a', a.name,
          '--b', b.prompt, '--b-schemas', b.schemas, '--name-b', b.name,
          '--jev-schema', jevSchema, '--map', 'pvp-1', '--cadence', '2', '--seed', String(seed),
          '--economy', c.economy, '--resolution', resolution, '--targeting', targeting, '--out', out, '--quiet',
          ...(recall ? ['--recall', recall] : []),
        ];
        jobs.push({ seed, pairing, condition, out, args });
      }
    }
  }
  return jobs;
}

/**
 * Refuse to add matches under `resolution` to a plan whose existing logs were played under another
 * (`readLog(out)` returns a parsed log, or null when there is none). A log without the field is
 * sequential, the frozen sim's own order.
 */
export function checkResolution(jobs, resolution, readLog) {
  for (const j of jobs) {
    const log = readLog(j.out);
    if (!log) continue;
    const played = log.resolution ?? 'sequential';
    if (played !== resolution) {
      throw new Error(`${j.out} was played under resolution ${played}, not ${resolution}: pass --resolution ${played} to finish this run, or use a new --date`);
    }
  }
}

/** Likewise for the targeting rule. A log without the field is `first-min`. */
export function checkTargeting(jobs, targeting, readLog) {
  for (const j of jobs) {
    const log = readLog(j.out);
    if (!log) continue;
    const played = log.targeting ?? 'first-min';
    if (played !== targeting) {
      throw new Error(`${j.out} was played under targeting ${played}, not ${targeting}: pass --targeting ${played} to finish this run, or use a new --date`);
    }
  }
}

/** The two metrics runs §6.2 reads: everything paired against A, and B1 paired against B0. */
export function metricsCommands(date) {
  const g = (c) => `--group ${c} runs/economy-measure-${date}-${c}-*.json`;
  return [
    `npm run metrics -- ${['A', 'R', 'B0', 'B1'].map(g).join(' ')} --json runs/economy-measure-${date}-metrics.json --md runs/economy-measure-${date}-metrics.md`,
    `npm run metrics -- ${['B0', 'B1'].map(g).join(' ')} --md runs/economy-measure-${date}-b1-vs-b0.md`,
  ];
}

function parseArgs(argv) {
  const args = { parallel: 1, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    const list = () => next().split(',').map((s) => s.trim()).filter(Boolean);
    switch (a) {
      case '--date': args.date = next(); break;
      case '--jev-schema': args.jevSchema = next(); break;
      case '--seeds': args.seeds = list().map(Number); break;
      case '--conditions': args.conditions = list(); break;
      case '--pairings': args.pairings = list(); break;
      case '--parallel': args.parallel = Number(next()); break;
      case '--recall': args.recall = next(); break;
      case '--resolution': args.resolution = next(); break;
      case '--targeting': args.targeting = next(); break;
      case '--dry-run': args.dryRun = true; break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  return args;
}

function runOne(job) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, 'cli.mjs'), ...job.args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, line: out.trim() }));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobs = planMeasurement(args);
  const readLog = (out) => {
    const file = path.join(ROOT, out);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };
  checkResolution(jobs, args.resolution ?? DEFAULT_RESOLUTION, readLog);
  checkTargeting(jobs, args.targeting ?? DEFAULT_TARGETING, readLog);
  const todo = jobs.filter((j) => !existsSync(path.join(ROOT, j.out)));
  console.log(`economy measurement ${args.date}: ${jobs.length} matches planned, ${jobs.length - todo.length} already logged, ${todo.length} to run`);
  if (args.dryRun) {
    for (const j of todo) console.log(`npm run match -- ${j.args.join(' ')}`);
  } else {
    if (!args.jevSchema) throw new Error('--jev-schema <schema_server URL> is required (or --dry-run)');
    if (!(args.parallel >= 1)) throw new Error('--parallel must be 1 or more');
    let next = 0;
    let failed = 0;
    const worker = async () => {
      while (next < todo.length) {
        const job = todo[next++];
        const started = Date.now();
        const { code, line } = await runOne(job);
        if (code !== 0) failed += 1;
        console.log(`[${new Date().toISOString()}] ${job.condition} ${job.pairing} seed ${job.seed} exit ${code} ${Math.round((Date.now() - started) / 1000)}s ${line}`);
      }
    };
    await Promise.all(Array.from({ length: args.parallel }, worker));
    if (failed) {
      console.log(`${failed} match(es) failed; run the same command again to retry them`);
      process.exitCode = 1;
    }
  }
  console.log('\nthen measure:');
  for (const c of metricsCommands(args.date)) console.log(`  ${c}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`measure_economy: ${err.message}`);
    process.exit(2);
  });
}
