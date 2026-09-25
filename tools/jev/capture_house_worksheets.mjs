#!/usr/bin/env node
/**
 * Captures REAL live worksheets -- `tools/match/jevPilot.ts::extractWorksheet` over real sim
 * `Observation`s, foe kind and hp included -- for the rule-3 intent check
 * (`tools/jev/jam_readiness_report.py offline`). The offline harness's logs never carried the foe's
 * kind/hp, so they can't score house-violet.md's real rule 3; these can. No model, no cost.
 *
 * How: both sides are the Jev house pilot pointed at a local stub that records each POSTed worksheet
 * and answers 503, so `jevTracingPilot` falls back to `decideByRules` -- both teams play
 * house-violet.md's/house-green.md's rules exactly, in code. The worksheets are therefore the
 * states a perfectly rule-following house bot actually reaches, at the real jam shape by default.
 *
 *   node tools/jev/capture_house_worksheets.mjs --seeds 1-6 --out runs/jev-jam-readiness-worksheets-2026-09-25.json
 */
import http from 'node:http';
import { writeFile } from 'node:fs/promises';
import { flush, loadHeadless } from '../match/load.mjs';

function parseArgs(argv) {
  const args = { seeds: [1, 2, 3, 4, 5, 6], cadence: 2, maxSimSec: 600, out: 'runs/jev-jam-readiness-worksheets.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--seeds') {
      const [lo, hi] = next().split('-').map(Number);
      args.seeds = Array.from({ length: (hi ?? lo) - lo + 1 }, (_, k) => lo + k);
    } else if (a === '--cadence') args.cadence = Number(next());
    else if (a === '--max-sim-sec') args.maxSimSec = Number(next());
    else if (a === '--out') args.out = next();
    else throw new Error(`unknown option ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const headless = await loadHeadless();
  let seed = null;
  const worksheets = [];
  const stub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      worksheets.push({ seed, ...JSON.parse(raw) });
      res.writeHead(503).end('{"error":"capture stub"}');
    });
  });
  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${stub.address().port}/`;
  const origError = console.error;
  console.error = (...a) => (String(a[0]).includes('!!! FALLBACK') ? undefined : origError(...a)); // expected: every call "falls back"
  try {
    for (const s of args.seeds) {
      seed = s;
      const side = { name: 'rules', promptFile: 'n/a', promptText: '' };
      const log = await headless.runMatch({
        seed: s,
        sides: { violet: side, green: side },
        callModelFor: () => async () => '',
        decisionPilotFor: (_i, _team, currentTick) => headless.jevTracingPilot({ endpoint, timeoutSec: 5 }, currentTick),
        cadenceSec: args.cadence,
        maxSimSec: args.maxSimSec,
        backend: { kind: 'capture-stub' },
        flush,
      });
      origError(`seed ${s}: ${log.result.winner ?? 'draw'} by ${log.result.endReason ?? 'timeout'} at ${log.result.durationSec}s; ${worksheets.length} worksheets so far`);
    }
  } finally {
    console.error = origError;
    stub.close();
  }
  await writeFile(args.out, JSON.stringify({ cadenceSec: args.cadence, maxSimSec: args.maxSimSec, seeds: args.seeds, worksheets }) + '\n');
  console.error(`wrote ${worksheets.length} worksheets to ${args.out}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err.stack ?? err.message);
    process.exit(2);
  },
);
