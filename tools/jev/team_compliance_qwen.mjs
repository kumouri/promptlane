#!/usr/bin/env node
/**
 * Live qwen32b half of the offline intent-compliance check (`docs/jev-vs-qwen32b-intent.md`).
 * Reads the same scenario corpus `team_compliance_scenarios.py` built (ground truth from THIS
 * intent's cascade, not from what the original logs' model did), builds a synthetic `Observation`
 * from each scenario's worksheet fields, sends it through the real `team-qwen.md` prompt via the
 * exact prompt the game itself builds (`REPLY_INSTRUCTION`, reused from
 * `tools/arena/pages/contract.mjs` so this isn't a second, drifting copy of that literal), calls
 * the running qwen32b HTTP backend for real, parses the real reply, and classifies it into the same
 * six buckets Jev's side is scored against.
 *
 * WHAT'S SYNTHESIZED, same limitation as the Python side (`team_compliance_scenarios.py`'s module
 * docstring): the checked-in logs never captured a foe's own hp, so a present bearbot foe is given
 * a placeholder hp equal to its own maxHp (full health) -- this makes violin's "foe below 50% hp"
 * condition read as false here, for both models, an equal and documented limitation, not an
 * advantage to either side.
 *
 * Start the qwen32b backend first (see tools/jev/run_team_bench.mjs's header), then:
 *   node tools/jev/team_compliance_qwen.mjs --scenarios runs/jev-vs-qwen32b-scenarios.json \
 *       --out runs/jev-vs-qwen32b-compliance-qwen.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { REPLY_INSTRUCTION } from '../arena/pages/contract.mjs';

const TEAM_QWEN_PROMPT = 'prompts/pilots/team-qwen.md';
const DEFAULT_ENDPOINT = process.env.QWEN_ENDPOINT ?? 'http://127.0.0.1:8789/';

const MAX_HP = { drums: 220, keytar: 140, violin: 150 };
const HOME = { violet: { x: 100, y: 900 }, green: { x: 900, y: 100 } };
const ABILITY_NAME = { drums: 'kick', keytar: 'chord', violin: 'staccato' };
const VALID_KINDS = ['move', 'attack', 'ability', 'recall', 'hold'];

function parseAction(reply) {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!VALID_KINDS.includes(parsed.kind)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Sibling to tools/jev/team_rules.py's `bucket_for_action` -- same six buckets, same logic, kept
 * here in JS only because this half of the check never leaves Node. */
function bucketForAction(action, foe, tower, team) {
  if (!action) return null;
  if (action.kind === 'recall') return 'recall';
  if (action.kind === 'ability') return 'ability';
  if (action.kind === 'attack') {
    if (action.target === foe && foe) return 'attack_foe';
    if (action.target === tower && tower) return 'attack_tower';
    return null;
  }
  if (action.kind === 'move') {
    const home = HOME[team];
    const t = action.target;
    if (t && typeof t === 'object' && home && t.x === home.x && t.y === home.y) return 'go_home';
    return 'ride_wave';
  }
  return null;
}

function syntheticObservation(s) {
  const maxHp = MAX_HP[s.instrument];
  const enemies = [];
  if (s.foe) {
    if (s.foe_is_bearbot) {
      const foeMaxHp = 150; // unknown real instrument; violin (150) picked as a neutral middle value
      enemies.push({ id: s.foe, pos: { x: 40, y: 40 }, hp: foeMaxHp, maxHp: foeMaxHp, kind: 'bearbot' });
    } else {
      enemies.push({ id: s.foe, pos: { x: 40, y: 40 }, hp: 40, maxHp: 60, kind: 'minion' });
    }
  }
  if (s.tower) enemies.push({ id: s.tower, pos: { x: 60, y: 60 }, hp: 900, maxHp: 900, kind: 'tower' });
  const nearbyMinions = Array.from({ length: s.wave }, (_, i) => ({
    id: `${s.team}-minion-synth-${i}`,
    team: s.team,
    pos: { x: 10 + i, y: 10 + i },
    hp: 60,
    maxHp: 60,
  }));
  return {
    clockSec: s.clock_sec,
    self: {
      id: `${s.team}-${s.instrument}`,
      team: s.team,
      lane: s.instrument === 'drums' ? 'top' : s.instrument === 'keytar' ? 'mid' : 'bottom',
      instrument: s.instrument,
      pos: { x: 20, y: 20 },
      hp: s.hp,
      maxHp,
      moveSpeed: 60,
      cooldowns: { [ABILITY_NAME[s.instrument]]: s.cd },
    },
    allies: [],
    visibleEnemies: enemies,
    nearbyMinions,
    nearbyTowers: [],
  };
}

function buildPrompt(promptText, obs) {
  return [promptText.trim(), '', REPLY_INSTRUCTION, '', 'OBSERVATION:', JSON.stringify(obs)].join('\n');
}

async function callModel(endpoint, prompt, timeoutSec) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(timeoutSec * 1000),
  });
  if (!res.ok) throw new Error(`pilot endpoint responded ${res.status}`);
  const data = await res.json();
  return typeof data === 'string' ? data : (data.reply ?? JSON.stringify(data));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function parseArgs(argv) {
  const args = { scenarios: 'runs/jev-vs-qwen32b-scenarios.json', out: 'runs/jev-vs-qwen32b-compliance-qwen.json', endpoint: DEFAULT_ENDPOINT, timeout: 60, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--scenarios': args.scenarios = next(); break;
      case '--out': args.out = next(); break;
      case '--endpoint': args.endpoint = next(); break;
      case '--timeout': args.timeout = Number(next()); break;
      case '--limit': args.limit = Number(next()); break;
      default: throw new Error(`unknown option ${a}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const promptText = await readFile(TEAM_QWEN_PROMPT, 'utf8');
  let scenarios = JSON.parse(await readFile(args.scenarios, 'utf8'));
  if (args.limit) scenarios = scenarios.slice(0, args.limit);

  let agree = 0;
  const disagreements = [];
  const latencies = [];
  let parseFailures = 0;
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const obs = syntheticObservation(s);
    const prompt = buildPrompt(promptText, obs);
    // One stalled upstream request shouldn't abort a 263-call run: retry up to twice, and time
    // only the attempt that answered.
    let reply;
    let started;
    for (let attempt = 1; ; attempt++) {
      started = Date.now();
      try {
        reply = await callModel(args.endpoint, prompt, args.timeout);
        break;
      } catch (err) {
        if (attempt >= 3) throw err;
        console.error(`  scenario ${i}: ${err.name ?? 'error'} on attempt ${attempt}, retrying`);
      }
    }
    latencies.push(Date.now() - started);
    const action = parseAction(reply);
    if (!action) parseFailures += 1;
    const predicted = bucketForAction(action, s.foe, s.tower, s.team);
    if (predicted === s.ground_truth_bucket) agree += 1;
    // Keep the raw reply: `predicted: null` alone can't tell "qwen chose hold" from "qwen attacked
    // an id this scorer doesn't recognise" from "the reply wasn't JSON".
    else disagreements.push({ source_file: s.source_file, tick: s.tick, instrument: s.instrument, predicted, actual: s.ground_truth_bucket, reply });
    if ((i + 1) % 50 === 0) console.error(`  ${i + 1}/${scenarios.length}`);
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null;
  const report = {
    model: 'qwen/qwen3-32b (OpenRouter)',
    n: scenarios.length,
    overall_agreement_rate: scenarios.length ? agree / scenarios.length : null,
    parse_failures: parseFailures,
    disagreements,
    latency: {
      mean_sec: mean === null ? null : mean / 1000,
      p50_sec: (() => { const v = percentile(sorted, 0.5); return v === null ? null : v / 1000; })(),
      p90_sec: (() => { const v = percentile(sorted, 0.9); return v === null ? null : v / 1000; })(),
    },
  };
  console.log(JSON.stringify(report, null, 2));
  await writeFile(args.out, JSON.stringify(report, null, 2) + '\n');
  console.error(`wrote ${args.out}`);
}

main().catch((err) => {
  console.error(`team_compliance_qwen: ${err.stack ?? err.message}`);
  process.exit(2);
});
