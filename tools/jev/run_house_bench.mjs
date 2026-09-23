#!/usr/bin/env node
/**
 * Head-to-head, real sim matches: the Jev house bot (violet, `tools/jev/house_server.py`, shadow
 * only) vs today's qwen3.5:9b house bot (green, `tools/model_server.py --backend ollama`, exactly
 * what `tools/arena/config.example.json`'s `tournament.backend: "qwen9b"` already uses in
 * production). Both sides play house-violet.md/house-green.md's identical seven-rule table --
 * Jev through `tools/jev/{client,rules,serializer}.py` via `jevTracingPilot`
 * (`tools/match/jevPilot.ts`), qwen through the game's own frozen `PromptPilot`
 * (`src/pilots/promptPilot.ts`) -- so a difference in outcome traces to the model, not the rules.
 *
 * Start both backends first:
 *   python tools/model_server.py --backend ollama --model qwen3.5:9b --port 8797
 *   python tools/jev/house_server.py --port 8798 --budget-usd 1.00
 *
 *   node tools/jev/run_house_bench.mjs --matches 20 --out runs/jev-house-bench-2026-09-23.json
 *
 * Writes one JSON file: `{matches: [...MatchLog], summary: {...}}` -- see `summarize()` below for
 * exactly what's aggregated (win rate, decision latency mean/p50/p90, decision failures, and each
 * side's low-hp-recall compliance rate, matching `runs/house-prompt-2026-09-21.md`'s methodology).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { flush, httpCallModel, loadHeadless, probeBackend } from '../match/load.mjs';

const DEFAULT_JEV_ENDPOINT = 'http://127.0.0.1:8798/';
const DEFAULT_QWEN_ENDPOINT = 'http://127.0.0.1:8797/';

function parseArgs(argv) {
  const args = {
    matches: 20,
    cadence: 2,
    maxSimSec: 180,
    seedStart: 1,
    jevEndpoint: process.env.JEV_ENDPOINT ?? DEFAULT_JEV_ENDPOINT,
    qwenEndpoint: process.env.QWEN_ENDPOINT ?? DEFAULT_QWEN_ENDPOINT,
    out: 'runs/jev-house-bench.json',
    timeout: 60,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--matches': args.matches = Number(next()); break;
      case '--cadence': args.cadence = Number(next()); break;
      case '--max-sim-sec': args.maxSimSec = Number(next()); break;
      case '--seed-start': args.seedStart = Number(next()); break;
      case '--jev-endpoint': args.jevEndpoint = next(); break;
      case '--qwen-endpoint': args.qwenEndpoint = next(); break;
      case '--out': args.out = next(); break;
      case '--timeout': args.timeout = Number(next()); break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  return args;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function latencyStats(msValues) {
  const sorted = [...msValues].sort((a, b) => a - b);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
  return {
    n: sorted.length,
    mean_sec: mean === null ? null : Math.round((mean / 1000) * 1000) / 1000,
    p50_sec: (() => {
      const v = percentile(sorted, 0.5);
      return v === null ? null : Math.round((v / 1000) * 1000) / 1000;
    })(),
    p90_sec: (() => {
      const v = percentile(sorted, 0.9);
      return v === null ? null : Math.round((v / 1000) * 1000) / 1000;
    })(),
  };
}

/** Low-hp-recall compliance: parse each real decision's `reply` for a self-reported/ground-truth
 * `hp`, and check whether the side actually recalled whenever hp was below the 75 threshold --
 * same rule, same 75 cutoff as house-violet.md/house-green.md's rule 1 and
 * `runs/house-prompt-2026-09-21.md`'s own compliance measurement. `bucket === 'recall'` (Jev) and
 * `kind === 'recall'` (qwen, self-reported JSON) are both checked since the two sides log
 * differently-shaped reply JSON. */
function recallCompliance(decisions) {
  let situations = 0;
  let compliant = 0;
  for (const d of decisions) {
    if (d.cached || !d.reply) continue;
    let parsed;
    try {
      parsed = JSON.parse(d.reply);
    } catch {
      continue; // not a parseable worksheet reply (e.g. a `[pilot error: ...]` string) -- excluded, not miscounted
    }
    if (typeof parsed.hp !== 'number') continue;
    if (parsed.hp >= 75) continue;
    situations += 1;
    const recalled = parsed.bucket === 'recall' || parsed.kind === 'recall';
    if (recalled) compliant += 1;
  }
  return { situations, compliant, rate: situations ? compliant / situations : null };
}

function summarizeSide(logs, team) {
  const decisions = logs.flatMap((log) => log.decisions.filter((d) => (team === 'violet' ? d.bot < 3 : d.bot >= 3)));
  const real = decisions.filter((d) => !d.cached);
  const msValues = real.filter((d) => typeof d.ms === 'number').map((d) => d.ms);
  const calls = logs.reduce((sum, log) => sum + log.result.stats[team].calls, 0);
  const parseErrors = logs.reduce((sum, log) => sum + log.result.stats[team].parseErrors, 0);
  const callErrors = logs.reduce((sum, log) => sum + log.result.stats[team].callErrors, 0);
  const deaths = logs.reduce((sum, log) => sum + log.result.stats[team].deaths, 0);
  const towersLost = logs.reduce((sum, log) => sum + log.result.stats[team].towersLost, 0);
  return {
    calls,
    decision_failures: { parseErrors, callErrors, total: parseErrors + callErrors },
    latency: latencyStats(msValues),
    deaths,
    towersLost,
    lowHpRecallCompliance: recallCompliance(real),
  };
}

export function summarize(logs) {
  const wins = { violet: 0, green: 0, draw: 0 };
  for (const log of logs) {
    if (log.result.winner === 'violet') wins.violet += 1;
    else if (log.result.winner === 'green') wins.green += 1;
    else wins.draw += 1;
  }
  return {
    matches: logs.length,
    wins,
    winRate: { violet: wins.violet / logs.length, green: wins.green / logs.length, draw: wins.draw / logs.length },
    jevHouse: summarizeSide(logs, 'violet'),
    qwenHouse: summarizeSide(logs, 'green'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(args.matches > 0 && args.matches <= 20)) throw new Error('--matches must be 1..20 (task budget)');
  const headless = await loadHeadless();
  const [violetText, greenText] = await Promise.all([
    readFile('prompts/pilots/house-violet.md', 'utf8'),
    readFile('prompts/pilots/house-green.md', 'utf8'),
  ]);
  const qwenProbe = await probeBackend(args.qwenEndpoint);
  const qwenCall = httpCallModel(args.qwenEndpoint, args.timeout);
  const jevHealthRes = await fetch(new URL('/health', args.jevEndpoint));
  const jevHealth = jevHealthRes.ok ? await jevHealthRes.json() : null;

  console.error(
    `jev-house-bench: ${args.matches} matches, cadence=${args.cadence}s maxSimSec=${args.maxSimSec} ` +
      `jev=${args.jevEndpoint} (${jevHealth?.model ?? '?'}) qwen=${args.qwenEndpoint} (${qwenProbe.health?.model ?? '?'})`,
  );

  const logs = [];
  for (let m = 0; m < args.matches; m++) {
    const seed = args.seedStart + m;
    const sides = {
      violet: { name: 'jev-house', promptFile: 'prompts/pilots/house-violet.md', promptText: violetText },
      green: { name: 'qwen-house', promptFile: 'prompts/pilots/house-green.md', promptText: greenText },
    };
    const started = Date.now();
    const log = await headless.runMatch({
      seed,
      sides,
      callModelFor: () => qwenCall,
      decisionPilotFor: (botIndex, team, currentTick) =>
        team === 'violet' ? headless.jevTracingPilot({ endpoint: args.jevEndpoint, timeoutSec: args.timeout }, currentTick) : undefined,
      cadenceSec: args.cadence,
      maxSimSec: args.maxSimSec,
      backend: { violet: { kind: 'jev-http', endpoint: args.jevEndpoint, health: jevHealth }, green: qwenProbe },
      flush,
    });
    logs.push(log);
    const wall = Math.round((Date.now() - started) / 1000);
    console.error(
      `  match ${m + 1}/${args.matches} seed=${seed} winner=${log.result.winner ?? 'draw'} by=${log.result.endReason ?? 'unfinished'} ` +
        `duration=${log.result.durationSec}s jev_calls=${log.result.stats.violet.calls} qwen_calls=${log.result.stats.green.calls} wall=${wall}s`,
    );
  }

  const summary = summarize(logs);
  console.log(JSON.stringify(summary, null, 2));

  await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await writeFile(args.out, JSON.stringify({ matches: logs, summary }) + '\n');
  console.error(`wrote ${logs.length} match logs + summary to ${args.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`jev-house-bench: ${err.stack ?? err.message}`);
      process.exit(2);
    },
  );
}
