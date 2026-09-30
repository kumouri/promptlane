/**
 * Scoring for the evolution harness (docs/prompt-evolution-spec.md §3–§4). Nothing here invents a
 * rating rule: a match is scored by the Jam's own advancement order (`rating.mjs::bracketWinner`,
 * ruling Q7) and Elo is the arena's (`rating.mjs::eloUpdate`, K 32, the bar fixed at 1000 the way
 * the house bot is). What this file adds is the statistics the arena never needed: seed-paired
 * means with a bootstrap interval, the promotion test, and behaviour descriptors read off the logs.
 */
import { ELO_START, bracketWinner, eloUpdate } from '../arena/rating.mjs';
import { finalFromLog } from '../arena/queue.mjs';
import { mulberry32 } from './seeds.mjs';

const BOTS = { violet: [0, 1, 2], green: [3, 4, 5] }; // src/replay.ts JAM_ROSTER order
const INSTRUMENT_OF_BOT = ['drums', 'keytar', 'violin', 'drums', 'keytar', 'violin'];
const other = (team) => (team === 'violet' ? 'green' : 'violet');

/**
 * 1 / 0.5 / 0 for `team`: the sim's result, then the bracket's tie order (fewer deaths, then more
 * tower hp). The bracket's last two tiebreaks are deliberately NOT used: fewer parse/call errors
 * measures the backend, not the prompt, and "higher ladder seed" is a coin — both score ½ here.
 */
export function jamScore(log, team) {
  const final = finalFromLog(log);
  const r = bracketWinner({ result: log.result, final }, { violet: 1, green: 2 });
  if (r.by === 'errors' || r.by === 'seed') return { score: 0.5, by: 'draw' };
  return { score: r.winner === team ? 1 : 0, by: r.by };
}

function parseReply(reply) {
  if (typeof reply !== 'string' || !reply.startsWith('{')) return null;
  try {
    return JSON.parse(reply);
  } catch {
    return null;
  }
}

/**
 * What one side did in one match: the score, the sim's stats, which compiled rule fired how often
 * per instrument (jevSchemaPilot's reply is `{rule, action, answers, ms}`), and descriptors —
 *   aggression: share of real decisions that are attack or ability,
 *   recallRate: share that are recall,
 *   spread:     mean pairwise distance between the side's living bearbots over the checkpoints
 *               (small = the band moves together).
 * Descriptors are recorded for every genome but select nothing in v0 (spec §6, proposal a).
 */
export function summarizeSide(log, team) {
  const { score, by } = jamScore(log, team);
  const kinds = { move: 0, attack: 0, ability: 0, recall: 0, hold: 0 };
  const rules = { drums: {}, keytar: {}, violin: {} };
  let real = 0;
  let errors = 0;
  for (const d of log.decisions) {
    if (d.cached || !BOTS[team].includes(d.bot)) continue;
    real += 1;
    const kind = d.action?.kind ?? 'hold';
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    if (d.action === null) errors += 1;
    const parsed = parseReply(d.reply);
    if (parsed && 'rule' in parsed) {
      const inst = INSTRUMENT_OF_BOT[d.bot];
      const rule = parsed.rule ?? 'default';
      rules[inst][rule] = (rules[inst][rule] ?? 0) + 1;
    }
  }
  let spreadSum = 0;
  let spreadN = 0;
  for (const c of log.checkpoints) {
    let st;
    try {
      st = JSON.parse(c.state);
    } catch {
      continue;
    }
    const alive = BOTS[team].map((i) => st.b[i]).filter((b) => b && b[3] === 1);
    if (alive.length < 2) continue;
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        sum += Math.hypot(alive[i][1] - alive[j][1], alive[i][2] - alive[j][2]);
        pairs += 1;
      }
    }
    spreadSum += sum / pairs;
    spreadN += 1;
  }
  const s = log.result.stats;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return {
    score,
    by,
    winner: log.result.winner,
    endReason: log.result.endReason,
    durationSec: log.result.durationSec,
    deaths: s[team].deaths,
    foeDeaths: s[other(team)].deaths,
    towersLost: s[team].towersLost,
    foeTowersLost: s[other(team)].towersLost,
    realDecisions: real,
    nullActions: errors, // decisions that held because the call or the parse failed
    callErrors: s[team].callErrors ?? 0,
    kinds,
    rules,
    descriptors: {
      aggression: real ? r3((kinds.attack + kinds.ability) / real) : null,
      recallRate: real ? r3(kinds.recall / real) : null,
      spread: spreadN ? Math.round(spreadSum / spreadN) : null,
    },
  };
}

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Percentile bootstrap of the mean over paired units (one unit = one seed, both sides averaged),
 * seeded so the interval is reproducible. With fewer than 2 units there is no interval.
 */
export function bootstrapCI(units, { confidence = 0.95, resamples = 2000, seed = 1 } = {}) {
  const n = units.length;
  const m = mean(units);
  if (n < 2) return { mean: m, lo: null, hi: null, n };
  const rng = mulberry32(seed);
  const means = [];
  for (let b = 0; b < resamples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += units[Math.floor(rng() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  const tail = (1 - confidence) / 2;
  const at = (q) => means[Math.min(resamples - 1, Math.max(0, Math.floor(q * resamples)))];
  return { mean: m, lo: at(tail), hi: at(1 - tail), n };
}

/**
 * A candidate's fitness from its match results: `results` is a list of
 * `{seed, opponent, side, score}`. Units are per seed (mean over both sides and every opponent), so
 * the interval is over the thing that is actually random — the seed — and the two sides of a seed
 * are never counted as independent evidence.
 */
export function fitnessOf(results, { confidence = 0.95, bootstrapSeed = 1 } = {}) {
  const bySeed = new Map();
  for (const r of results) {
    if (!bySeed.has(r.seed)) bySeed.set(r.seed, []);
    bySeed.get(r.seed).push(r.score);
  }
  const seeds = [...bySeed.keys()].sort((a, b) => a - b);
  const units = seeds.map((s) => mean(bySeed.get(s)));
  const ci = bootstrapCI(units, { confidence, seed: bootstrapSeed });
  const wins = results.filter((r) => r.score === 1).length;
  const losses = results.filter((r) => r.score === 0).length;
  return { ...ci, matches: results.length, wins, draws: results.length - wins - losses, losses };
}

/**
 * The pre-registered promotion test (spec §5): promote only if the lower bound of the interval is
 * above ½ with at least `minSeeds` paired seeds. Returns the decision and why.
 */
export function promotionDecision(fit, { minSeeds = 16, threshold = 0.5 } = {}) {
  if (fit.n < minSeeds) return { promote: false, reason: `only ${fit.n} paired seed(s); the rule needs ${minSeeds}` };
  if (fit.lo === null || !(fit.lo > threshold)) {
    return { promote: false, reason: `lower bound ${fit.lo?.toFixed(3) ?? 'n/a'} is not above ${threshold}` };
  }
  return { promote: true, reason: `lower bound ${fit.lo.toFixed(3)} > ${threshold} over ${fit.n} seeds` };
}

/**
 * The arena's Elo, folded over one generation's matches in their deterministic plan order: every
 * candidate starts at 1000 and the opponents are pinned at 1000, exactly as a new ladder entrant
 * is placed against the fixed house bar. Reported next to the mean; the mean decides (v0).
 */
export function eloFold(matches, opponents) {
  const pinned = new Set(opponents);
  const rating = new Map();
  const get = (id) => rating.get(id) ?? ELO_START;
  for (const m of matches) {
    const { a, b } = eloUpdate(get(m.violet), get(m.green), m.violetScore, {
      fixedA: pinned.has(m.violet),
      fixedB: pinned.has(m.green),
    });
    rating.set(m.violet, a);
    rating.set(m.green, b);
  }
  return Object.fromEntries([...rating].map(([id, r]) => [id, Math.round(r * 10) / 10]));
}

/** Descriptor averages over a genome's matches (nulls skipped). */
export function meanDescriptors(summaries) {
  const out = {};
  for (const key of ['aggression', 'recallRate', 'spread']) {
    const xs = summaries.map((s) => s.descriptors[key]).filter((x) => x !== null && x !== undefined);
    out[key] = xs.length ? Math.round(mean(xs) * 1000) / 1000 : null;
  }
  return out;
}

/** Rule-fire counts summed over a genome's matches, per instrument — the mutation's diagnostic. */
export function sumRules(summaries) {
  const out = { drums: {}, keytar: {}, violin: {} };
  for (const s of summaries) {
    for (const [inst, counts] of Object.entries(s.rules)) {
      for (const [rule, n] of Object.entries(counts)) out[inst][rule] = (out[inst][rule] ?? 0) + n;
    }
  }
  return out;
}
