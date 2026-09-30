#!/usr/bin/env node
/**
 * promptlane jam match runner — entrant vs entrant, headless, against a real model.
 *
 *   npm run match -- --a entrants/alice/pilot.md --b entrants/bob/pilot.md --seed 7 --out runs/alice-vs-bob.json
 *   npm run match -- --a prompts/pilots/drums.md --b prompts/pilots/keytar.md --model mock --out artifacts/smoke.json
 *   npm run match -- --verify runs/alice-vs-bob.json
 *   npm run match -- --a alice.md --a-schemas alice.compiled.json --b bob.md --b-schemas bob.compiled.json \
 *       --jev-schema http://127.0.0.1:8797/ --seed 7 --out runs/alice-vs-bob-jev.json
 *
 * Side A is violet, side B is green. Each side's prompt drives all three of its bearbots
 * (drums top, keytar mid, violin bottom) through the game's own `PromptPilot`, talking to the model
 * through the game's HTTP adapter contract (`POST {prompt}` → `{reply}`), served by
 * `tools/model_server.py`. The sim in `src/` is bundled unchanged; see headless.ts for lockstep.
 *
 * The Jam's own shape (ruling 2026-09-25: entrants run on Jev) is `--a-schemas`/`--b-schemas` plus
 * `--jev-schema`: that side's bearbots decide on the rule cascade its prose compiled to
 * (`tools/jev/compile.py`), asked of Jev by `tools/jev/schema_server.py` through
 * `jevSchemaPilot.ts` — the same pilot the arena's practice match uses. `--a`/`--b` still name the
 * prose, which the log keeps as the side's prompt text.
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
  --max-sim-sec SEC   stop early at this sim clock (quick test: 180); the log says "unfinished"
  --name-a / --name-b display names (default: entrant folder or file stem)
  --a-schemas FILE    side A plays its COMPILED prose on Jev: compile.py --format json output, or
  --b-schemas FILE    {"drums":…,"keytar":…,"violin":…}; needs --jev-schema
  --jev-schema URL    tools/jev/schema_server.py endpoint for the schema sides (the Jam backend)
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
      case '--max-sim-sec': args.maxSimSec = Number(next()); break;
      case '--name-a': args.nameA = next(); break;
      case '--name-b': args.nameB = next(); break;
      case '--a-schemas': args.aSchemas = next(); break;
      case '--b-schemas': args.bSchemas = next(); break;
      case '--jev-schema': args.jevSchema = next(); break;
      case '--verify': args.verify = next(); break;
      case '--quiet': args.quiet = true; break;
      case '-h': case '--help': args.help = true; break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  return args;
}

const INSTRUMENTS = ['drums', 'keytar', 'violin'];

/**
 * One schema per instrument from a `--a-schemas`/`--b-schemas` file: either `compile.py --format
 * json` output (first prompt; every instrument must have compiled, as for the arena's practice
 * match) or a bare `{drums, keytar, violin}` map.
 */
function schemasFromJson(data, file = 'schemas') {
  const entries = data?.prompts?.[0]?.instruments;
  const out = {};
  for (const inst of INSTRUMENTS) {
    const s = entries ? (entries[inst]?.ok ? entries[inst].schema : null) : data?.[inst];
    if (!s || !Array.isArray(s.rules)) throw new Error(`${file}: no compiled schema for ${inst}`);
    out[inst] = s;
  }
  return out;
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
  if (args.maxSimSec !== undefined && !(args.maxSimSec > 0)) throw new Error('--max-sim-sec must be a positive number');

  const sides = {
    violet: { name: args.nameA ?? nameFromPath(args.a), promptFile: args.a, promptText: await readFile(args.a, 'utf8') },
    green: { name: args.nameB ?? nameFromPath(args.b), promptFile: args.b, promptText: await readFile(args.b, 'utf8') },
  };
  const outFile = args.out ?? path.join('runs', `${sides.violet.name}-vs-${sides.green.name}-seed${args.seed}.json`);

  const schemaFiles = { violet: args.aSchemas, green: args.bSchemas };
  const schemas = {};
  for (const team of ['violet', 'green']) {
    if (!schemaFiles[team]) continue;
    schemas[team] = schemasFromJson(JSON.parse(await readFile(schemaFiles[team], 'utf8')), schemaFiles[team]);
    sides[team].schemaFile = schemaFiles[team];
    sides[team].schemas = schemas[team];
  }
  const schemaTeams = Object.keys(schemas);
  if (schemaTeams.length && !args.jevSchema) throw new Error('--a-schemas/--b-schemas need --jev-schema <schema_server URL>');
  if (args.jevSchema && !schemaTeams.length) throw new Error('--jev-schema needs --a-schemas and/or --b-schemas');
  const jevBackend = args.jevSchema ? await probeBackend(args.jevSchema) : null;
  const decisionPilotFor = jevBackend
    ? (_i, team) =>
        schemas[team] ? headless.jevSchemaTracingPilot({ endpoint: args.jevSchema, timeoutSec: args.timeout, schemas: schemas[team] }) : undefined
    : undefined;

  let backend;
  let callModelFor;
  if (schemaTeams.length === 2) {
    backend = jevBackend; // no prompt side: nothing asks the model server
    callModelFor = () => {
      throw new Error('unreachable: every bearbot plays a compiled schema');
    };
  } else if (args.model === 'mock') {
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
  if (jevBackend && backend !== jevBackend) backend = { ...backend, jevSchema: jevBackend };

  if (!args.quiet) {
    console.error(`match: ${sides.violet.name} (violet) vs ${sides.green.name} (green) seed=${args.seed} cadence=${args.cadence}s backend=${backendLabel(backend)}`);
  }
  const started = Date.now();
  const log = await headless.runMatch({
    seed: args.seed,
    sides,
    callModelFor,
    decisionPilotFor,
    cadenceSec: args.cadence,
    maxSimSec: args.maxSimSec,
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
