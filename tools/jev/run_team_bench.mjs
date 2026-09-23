#!/usr/bin/env node
/**
 * Head-to-head, real sim matches for the Jev-vs-qwen32b model test
 * (`docs/jev-vs-qwen32b-intent.md`, `runs/jev-vs-qwen32b-*.md`). Both sides play the SAME intent
 * document's cascade -- qwen/qwen3-32b (OpenRouter, `openrouter-qwen32b` in
 * `tools/arena/config.example.json`) through the game's own frozen `PromptPilot` reading
 * `prompts/pilots/team-qwen.md`; Jev (Cloudflare Workers AI) through `tools/jev/team_rules.py` via
 * `jevTeamTracingPilot` (`tools/match/jevTeamPilot.ts`) -- so a difference in outcome traces to the
 * model, not the rules. Sibling to `run_house_bench.mjs`; the two differences that matter here:
 * jam-shape defaults (cadence 2, 600 s, not the quick 180 s/cadence 4 shape) and side-swapping
 * (which team plays violet/green alternates match to match, so map asymmetry cancels out over a
 * pair rather than always favoring one side).
 *
 * Start both backends first:
 *   python tools/model_server.py --backend openrouter --model qwen/qwen3-32b --port 8789 \
 *       --provider DeepInfra --concurrency 6 --price-in-per-m 0.08 --price-out-per-m 0.28 \
 *       --daily-budget-usd 5
 *   python tools/jev/team_server.py --port 8799 --budget-usd 1.00
 *
 *   node tools/jev/run_team_bench.mjs --matches 10 --out runs/jev-vs-qwen32b-2026-09-23.json
 *
 * Writes one JSON file: `{matches: [...MatchLog], summary: {...}}`.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { flush, httpCallModel, loadHeadless, probeBackend } from '../match/load.mjs';

const DEFAULT_JEV_ENDPOINT = 'http://127.0.0.1:8799/';
const DEFAULT_QWEN_ENDPOINT = 'http://127.0.0.1:8789/';
const TEAM_QWEN_PROMPT = 'prompts/pilots/team-qwen.md';

function parseArgs(argv) {
  const args = {
    matches: 10,
    cadence: 2,
    maxSimSec: 600,
    seedStart: 1,
    jevEndpoint: process.env.JEV_ENDPOINT ?? DEFAULT_JEV_ENDPOINT,
    qwenEndpoint: process.env.QWEN_ENDPOINT ?? DEFAULT_QWEN_ENDPOINT,
    out: 'runs/jev-vs-qwen32b.json',
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

/** Real (non-cached, non-failed) action kind counts -- attack/ability/recall/move/hold -- per
 * side, straight from the log's own decisions, no reconstruction needed. */
function actionKindCounts(decisions) {
  const counts = { move: 0, attack: 0, ability: 0, recall: 0, hold: 0 };
  for (const d of decisions) {
    if (d.cached || !d.action) continue;
    if (d.action.kind in counts) counts[d.action.kind] += 1;
  }
  return counts;
}

// docs/jev-vs-qwen32b-intent.md's per-instrument recall threshold, as a fraction of maxHp --
// mirrors tools/jev/team_rules.py's RECALL_THRESHOLD_FRAC (single source there; duplicated here
// only because this compliance check reads the pilot's own `reply` JSON, not the Python module).
const RECALL_THRESHOLD_FRAC = { drums: 0.2, keytar: 0.35, violin: 0.35 };

/** Low-hp-recall compliance for whichever side is playing Jev this match: does `bucket ===
 * 'recall'` exactly when hp/maxHp is below that instrument's threshold -- using the REAL hp/maxHp
 * `tools/match/jevTeamPilot.ts::jevTeamTracingPilot` reports (ground truth, not self-reported). */
function jevRecallCompliance(decisions) {
  let situations = 0;
  let compliant = 0;
  for (const d of decisions) {
    if (d.cached || !d.reply) continue;
    let parsed;
    try {
      parsed = JSON.parse(d.reply);
    } catch {
      continue;
    }
    if (typeof parsed.hp !== 'number' || typeof parsed.maxHp !== 'number' || !parsed.bucket || !parsed.instrument) continue;
    const threshold = RECALL_THRESHOLD_FRAC[parsed.instrument];
    if (threshold === undefined) continue;
    const shouldRecall = parsed.hp / parsed.maxHp < threshold;
    situations += 1;
    if (shouldRecall === (parsed.bucket === 'recall')) compliant += 1;
  }
  return { situations, compliant, rate: situations ? compliant / situations : null };
}

function summarizeSide(logs, sideOf) {
  const decisions = logs.flatMap((log, i) => log.decisions.filter((d) => sideOf(log, i) === 'violet' ? d.bot < 3 : d.bot >= 3));
  const real = decisions.filter((d) => !d.cached);
  const msValues = real.filter((d) => typeof d.ms === 'number').map((d) => d.ms);
  let calls = 0, parseErrors = 0, callErrors = 0, deaths = 0, towersLost = 0;
  logs.forEach((log, i) => {
    const team = sideOf(log, i);
    calls += log.result.stats[team].calls;
    parseErrors += log.result.stats[team].parseErrors;
    callErrors += log.result.stats[team].callErrors;
    deaths += log.result.stats[team].deaths;
    towersLost += log.result.stats[team].towersLost;
  });
  return {
    calls,
    decision_failures: { parseErrors, callErrors, total: parseErrors + callErrors },
    latency: latencyStats(msValues),
    deaths,
    towersLost,
    actionKindCounts: actionKindCounts(real),
  };
}

export function summarize(logs, jevSideOf) {
  const qwenSideOf = (log, i) => (jevSideOf(log, i) === 'violet' ? 'green' : 'violet');
  const wins = { jev: 0, qwen: 0, draw: 0 };
  const nexusKills = { jev: 0, qwen: 0 };
  logs.forEach((log, i) => {
    const jevTeam = jevSideOf(log, i);
    if (log.result.winner === null) wins.draw += 1;
    else if (log.result.winner === jevTeam) wins.jev += 1;
    else wins.qwen += 1;
    if (log.result.endReason === 'nexus') {
      if (log.result.winner === jevTeam) nexusKills.jev += 1;
      else nexusKills.qwen += 1;
    }
  });
  const jevDecisions = logs.flatMap((log, i) => log.decisions.filter((d) => (jevSideOf(log, i) === 'violet' ? d.bot < 3 : d.bot >= 3)));
  return {
    matches: logs.length,
    wins,
    nexusKills,
    jev: { ...summarizeSide(logs, jevSideOf), lowHpRecallCompliance: jevRecallCompliance(jevDecisions.filter((d) => !d.cached)) },
    qwen: summarizeSide(logs, qwenSideOf),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(args.matches > 0)) throw new Error('--matches must be positive');
  const headless = await loadHeadless();
  const qwenText = await readFile(TEAM_QWEN_PROMPT, 'utf8');
  const qwenProbe = await probeBackend(args.qwenEndpoint);
  const qwenCall = httpCallModel(args.qwenEndpoint, args.timeout);
  const jevHealthRes = await fetch(new URL('/health', args.jevEndpoint));
  const jevHealth = jevHealthRes.ok ? await jevHealthRes.json() : null;

  console.error(
    `jev-vs-qwen32b: ${args.matches} matches, cadence=${args.cadence}s maxSimSec=${args.maxSimSec} ` +
      `jev=${args.jevEndpoint} (${jevHealth?.model ?? '?'}) qwen=${args.qwenEndpoint} (${qwenProbe.health?.model ?? '?'})`,
  );

  const logs = [];
  const jevSides = [];
  for (let m = 0; m < args.matches; m++) {
    const seed = args.seedStart + m;
    const jevTeam = m % 2 === 0 ? 'violet' : 'green'; // swap sides each match so map asymmetry cancels
    jevSides.push(jevTeam);
    const sides = {
      violet: { name: jevTeam === 'violet' ? 'jev-team' : 'qwen32b-team', promptFile: TEAM_QWEN_PROMPT, promptText: qwenText },
      green: { name: jevTeam === 'green' ? 'jev-team' : 'qwen32b-team', promptFile: TEAM_QWEN_PROMPT, promptText: qwenText },
    };
    const started = Date.now();
    const log = await headless.runMatch({
      seed,
      sides,
      callModelFor: () => qwenCall,
      decisionPilotFor: (botIndex, team, currentTick) =>
        team === jevTeam ? headless.jevTeamTracingPilot({ endpoint: args.jevEndpoint, timeoutSec: args.timeout }, currentTick) : undefined,
      cadenceSec: args.cadence,
      maxSimSec: args.maxSimSec,
      backend: {
        violet: jevTeam === 'violet' ? { kind: 'jev-http', endpoint: args.jevEndpoint, health: jevHealth } : qwenProbe,
        green: jevTeam === 'green' ? { kind: 'jev-http', endpoint: args.jevEndpoint, health: jevHealth } : qwenProbe,
      },
      flush,
      onProgress: (p) => console.error(`  t=${Math.round(p.clockSec)}s calls=${p.calls} wall=${Math.round(p.elapsedMs / 1000)}s`),
    });
    logs.push(log);
    const wall = Math.round((Date.now() - started) / 1000);
    console.error(
      `  match ${m + 1}/${args.matches} seed=${seed} jev=${jevTeam} winner=${log.result.winner ?? 'draw'} by=${log.result.endReason ?? 'unfinished'} ` +
        `duration=${log.result.durationSec}s violet_calls=${log.result.stats.violet.calls} green_calls=${log.result.stats.green.calls} wall=${wall}s`,
    );
  }

  const summary = summarize(logs, (_log, i) => jevSides[i]);
  console.log(JSON.stringify(summary, null, 2));

  await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await writeFile(args.out, JSON.stringify({ matches: logs, jevSides, summary }) + '\n');
  console.error(`wrote ${logs.length} match logs + summary to ${args.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`jev-vs-qwen32b: ${err.stack ?? err.message}`);
      process.exit(2);
    },
  );
}
