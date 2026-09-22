#!/usr/bin/env node
/**
 * promptlane jam match runner — entrant vs entrant, headless, against a real model.
 *
 *   npm run match -- --a entrants/alice/pilot.md --b entrants/bob/pilot.md --seed 7 --out runs/alice-vs-bob.json
 *   npm run match -- --a prompts/pilots/drums.md --b prompts/pilots/keytar.md --model mock --out artifacts/smoke.json
 *   npm run match -- --verify runs/alice-vs-bob.json
 *
 * Side A is violet, side B is green. Each side's prompt drives all three of its bearbots
 * (drums top, keytar mid, violin bottom) through the game's own `PromptPilot`, talking to the model
 * through the game's HTTP adapter contract (`POST {prompt}` → `{reply}`), served by
 * `tools/model_server.py`. The sim in `src/` is bundled unchanged; see headless.ts for lockstep.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backendLabel, flush, httpCallModel, loadHeadless, probeBackend, resultLine } from './load.mjs';

const DEFAULT_ENDPOINT = process.env.PILOT_ENDPOINT ?? 'http://127.0.0.1:8787/';

const USAGE = `usage: npm run match -- --a <pilot.md> --b <pilot.md> [options]
       npm run match -- --verify <log.json>

options:
  --seed N            match seed (default 7)
  --out FILE          where to write the match log (default runs/<a>-vs-<b>-seed<N>.json)
  --endpoint URL      model server URL implementing the game's HTTP adapter contract
                      (default $PILOT_ENDPOINT or ${DEFAULT_ENDPOINT})
  --model mock        use the game's deterministic key-free mock instead of a server
  --cadence SEC       sim-seconds between real model calls per bearbot (default 2; the game's own
                      polling rate is 0.5 — see README "Run a jam match" for the cost trade-off)
  --timeout SEC       per-call HTTP timeout; a timed-out call counts as hold (default 60)
  --name-a / --name-b display names (default: entrant folder or file stem)
  --quiet             no progress lines`;

function parseArgs(argv) {
  const args = { seed: 7, cadence: 2, timeout: 60, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '--a': args.a = next(); break;
      case '--b': args.b = next(); break;
      case '--seed': args.seed = Number(next()); break;
      case '--out': args.out = next(); break;
      case '--endpoint': args.endpoint = next(); break;
      case '--model': args.model = next(); break;
      case '--cadence': args.cadence = Number(next()); break;
      case '--timeout': args.timeout = Number(next()); break;
      case '--name-a': args.nameA = next(); break;
      case '--name-b': args.nameB = next(); break;
      case '--verify': args.verify = next(); break;
      case '--quiet': args.quiet = true; break;
      case '-h': case '--help': args.help = true; break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  return args;
}

/** `entrants/alice/pilot.md` → alice; `prompts/pilots/drums.md` → drums. */
function nameFromPath(file) {
  const parsed = path.parse(path.resolve(file));
  return parsed.name === 'pilot' ? path.basename(parsed.dir) : parsed.name;
}

async function verify(args, headless) {
  const log = JSON.parse(await readFile(args.verify, 'utf8'));
  const v = await headless.verifyReplay(log, flush);
  if (v.ok) {
    console.log(`VERIFY ok ${args.verify}: ${v.checkpointsCompared} checkpoints, ${v.ticks} ticks, winner=${v.winner ?? 'draw'} by=${v.endReason}`);
    return 0;
  }
  console.log(
    `VERIFY DIVERGED ${args.verify}: first mismatch at tick ${v.firstDivergenceTick ?? 'n/a'}; ` +
      `replay ended winner=${v.winner ?? 'draw'} by=${v.endReason} after ${v.ticks} ticks ` +
      `(log said ${log.result.winner ?? 'draw'} by=${log.result.endReason} after ${log.result.ticks})`,
  );
  return 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const headless = await loadHeadless();
  if (args.verify) return verify(args, headless);
  if (!args.a || !args.b) {
    console.error(USAGE);
    return 2;
  }
  if (!Number.isFinite(args.seed)) throw new Error('--seed must be a number');
  if (!(args.cadence >= 0.5)) throw new Error('--cadence must be >= 0.5 (the game asks every 0.5 s)');

  const sides = {
    violet: { name: args.nameA ?? nameFromPath(args.a), promptFile: args.a, promptText: await readFile(args.a, 'utf8') },
    green: { name: args.nameB ?? nameFromPath(args.b), promptFile: args.b, promptText: await readFile(args.b, 'utf8') },
  };
  const outFile = args.out ?? path.join('runs', `${sides.violet.name}-vs-${sides.green.name}-seed${args.seed}.json`);

  let backend;
  let callModelFor;
  if (args.model === 'mock') {
    backend = { kind: 'mock' };
    callModelFor = (i) => headless.mockCallModel(100 + i);
  } else if (args.model) {
    throw new Error(`--model only accepts "mock"; pick the real model on the server (tools/model_server.py --model …)`);
  } else {
    const endpoint = args.endpoint ?? DEFAULT_ENDPOINT;
    backend = await probeBackend(endpoint);
    const call = httpCallModel(endpoint, args.timeout);
    callModelFor = () => call;
  }

  if (!args.quiet) {
    console.error(`match: ${sides.violet.name} (violet) vs ${sides.green.name} (green) seed=${args.seed} cadence=${args.cadence}s backend=${backendLabel(backend)}`);
  }
  const started = Date.now();
  const log = await headless.runMatch({
    seed: args.seed,
    sides,
    callModelFor,
    cadenceSec: args.cadence,
    backend,
    flush,
    onProgress: args.quiet
      ? undefined
      : (p) => console.error(`  t=${Math.round(p.clockSec)}s calls=${p.calls} wall=${Math.round(p.elapsedMs / 1000)}s`),
  });

  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await writeFile(outFile, JSON.stringify(log) + '\n');
  if (!args.quiet) console.error(`  wall time ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(resultLine(log, outFile));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`match: ${err.message}`);
    process.exit(2);
  },
);
