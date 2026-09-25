#!/usr/bin/env node
/**
 * Combines several `run_team_bench.mjs` output files into one summary, so a run split across
 * restarts (a token refresh, a host crash, one match per tool call) is scored as one run by the
 * SAME `summarize()` the bench itself uses -- not a second, drifting copy of the scoring.
 *
 * A match is dropped, and listed under `excluded` with the reason, when more than
 * `OUTAGE_FRACTION` of its Jev-side calls failed at the transport (`stats[jevSide].callErrors`):
 * that match measured an outage (e.g. an expired Workers AI token, which fails every call), not the
 * model. An isolated failed call (the pilot holds for that one decision) is kept -- the qwen side
 * carries the same risk and is never excluded for it. Later files win over earlier ones for the
 * same seed, so a clean re-run replaces a damaged original. Match logs themselves (the `decisions`
 * arrays) are not copied -- they stay in the source files; the output carries only per-match
 * results plus the combined summary.
 *
 *   node tools/jev/merge_team_bench.mjs --out runs/jev-vs-qwen32b-combined.json \
 *       runs/jev-vs-qwen32b-2026-09-23.json runs/jev-vs-qwen32b-seed2-3.json ...
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { summarize } from './run_team_bench.mjs';

export const OUTAGE_FRACTION = 0.1;

export function mergeRuns(runs) {
  const bySeed = new Map();
  const excluded = [];
  for (const { file, data } of runs) {
    data.matches.forEach((log, i) => {
      const jevSide = data.jevSides[i];
      const { callErrors: errors, calls } = log.result.stats[jevSide];
      if (errors > OUTAGE_FRACTION * calls) {
        excluded.push({ file, seed: log.seed, jevSide, reason: `${errors} jev-side call errors` });
        return;
      }
      bySeed.set(log.seed, { file, log, jevSide });
    });
  }
  const kept = [...bySeed.values()].sort((a, b) => a.log.seed - b.log.seed);
  const summary = summarize(kept.map((k) => k.log), (_log, i) => kept[i].jevSide);
  const matches = kept.map(({ file, log, jevSide }) => ({
    file,
    seed: log.seed,
    createdAt: log.createdAt,
    jevSide,
    winner: log.result.winner === null ? 'draw' : log.result.winner === jevSide ? 'jev' : 'qwen',
    endReason: log.result.endReason,
    durationSec: log.result.durationSec,
    stats: { jev: log.result.stats[jevSide], qwen: log.result.stats[jevSide === 'violet' ? 'green' : 'violet'] },
  }));
  return { matches, excluded, summary };
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  if (outIdx < 0 || !argv[outIdx + 1]) throw new Error('--out <file> is required');
  const out = argv[outIdx + 1];
  const files = argv.filter((_, i) => i !== outIdx && i !== outIdx + 1);
  if (files.length === 0) throw new Error('give at least one run_team_bench output file');
  const runs = [];
  for (const file of files) runs.push({ file, data: JSON.parse(await readFile(file, 'utf8')) });
  const merged = mergeRuns(runs);
  await writeFile(out, JSON.stringify(merged, null, 2) + '\n');
  console.log(JSON.stringify(merged.summary, null, 2));
  console.error(`kept ${merged.matches.length} matches, excluded ${merged.excluded.length}; wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`merge_team_bench: ${err.stack ?? err.message}`);
    process.exit(2);
  });
}
