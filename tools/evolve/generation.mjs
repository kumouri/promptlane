/**
 * One generation of the prompt-evolution loop, end to end and resumable
 * (docs/prompt-evolution-spec.md §2, §7). The loop is Ceryce's design (2026-09-30 01:10 CT):
 * generate prompts, translate them through Jev's compiler, play games, pick the best, make single
 * changes, test again; at the end of each epoch the opponents become the prompt that just won.
 *
 *   plan     parents = last generation's survivors; one slot per child, each with a seeded focus
 *   mutate   each slot: ONE change to its parent (deps.mutate), saved before anything else happens
 *   compile  every new genome through compile.py (deps.compile) — the phenotype Jev actually plays
 *   play     every candidate vs every current opponent, on the epoch's seeds, both sides
 *   rate     seed-paired mean score + bootstrap interval (decides), arena Elo (reported)
 *   select   the top `population.parents` survive (parents compete with their children)
 *   epoch    on the epoch's last generation: the best non-opponent plays held-out seeds, and
 *            joins the opponents (hall of fame, the last `hallOfFameCap` champions; the default)
 *            or replaces them ('latest') only if it passes the pre-registered promotion test
 *
 * Every step persists before the next starts and every artifact is content-addressed (store.mjs),
 * so killing the process anywhere and running it again redoes nothing that finished: no second
 * mutation call for a slot, no second compile, no second match.
 *
 * `deps` (adapters.mjs has the real ones; the tests pass fakes, so no model is ever called):
 *   mutate({parentText, focus, diagnostics, avoid, slot})  -> {ok, prose?, change?, error?, usage?}
 *   compile(text, {id})                                     -> compile.py JSON (`prompts[0].instruments`)
 *   playMatch({violet, green, seed, shape, out})           -> match log (and writes it to `out`)
 *   observe(log)                                            -> one observation per log decision, from a
 *                                                              replay (optional: without it the hp/vision
 *                                                              descriptors are null)
 */
import { validatePromptText } from '../arena/prompts.mjs';
import { CampaignStop, DEFAULT_BUDGET } from './budget.mjs';
import { eloFold, fitnessOf, meanDescriptors, promotionDecision, summarizeSide, sumRules } from './fitness.mjs';
import { deriveSeed, pick, sha256 } from './seeds.mjs';
import { STORE_VERSION } from './store.mjs';

export const INSTRUMENTS = ['drums', 'keytar', 'violin'];

/** What a single change may be about; each child slot gets one, seeded, so siblings differ. */
export const MUTATION_FOCI = [
  'change one numeric threshold (an hp level, a distance, a count)',
  'swap the priority of two existing rules',
  'add one rule for a situation the prose does not cover yet',
  'delete the one rule that is pulling its weight least',
  'make one vague sentence concrete: name the exact condition and the exact action',
  'change when one ability is used',
];

/** The campaign defaults: the Jam's own match shape and backends. `init` writes them once. */
export const DEFAULT_CAMPAIGN = {
  version: STORE_VERSION,
  seed: 1,
  // The ruleset is part of the shape: every match plays it explicitly (`--map`, `--economy`,
  // `--objective`) and the cache key hashes it, so a later change to the runner's defaults can't leak
  // into a campaign or reuse a match played under other rules. `map` mirrors DEFAULT_MAP
  // (src/mapVariant.ts; a test holds them equal); `economy` and `objective` are none until the
  // go/no-go gate (src/economy.ts DEFAULT_ECONOMY, src/objective.ts DEFAULT_OBJECTIVE); `resolution`
  // mirrors DEFAULT_RESOLUTION (src/resolution.ts), `targeting` DEFAULT_TARGETING and `vocab`
  // DEFAULT_VOCAB (tools/match/jevSchemaPilot.ts): the vocabulary every genome compiles under
  // (adapters.mjs campaignVocab; a campaign without it is vocab-1).
  shape: { cadenceSec: 2, maxSimSec: 600, map: 'pvp-1', economy: 'none', objective: 'none', resolution: 'simultaneous-1', targeting: 'own-lane-1', vocab: 'vocab-2' },
  evaluation: { seedsPerEpoch: 4 },
  population: { parents: 2, childrenPerParent: 2 },
  // hall of fame capped at the last 3 champions: ruled 2026-09-30 01:50 CT (spec §10 Q2)
  epoch: { generations: 3, opponents: 'hall-of-fame', hallOfFameCap: 3, promotionSeeds: 16, confidence: 0.95 },
  // No token caps on either (Ceryce, 2026-10-02 17:59 CT). A campaign stored with maxTotalTokens or
  // maxTokensPerCompile keeps the key, and nothing reads it.
  mutation: { backend: 'claude', model: null, maxSentenceChanges: 3, attempts: 3 },
  compile: { backend: 'openrouter', model: null },
  // the campaign's own schema_server.py, never the arena's 8797 (spec §7): its /health is the Jev ledger
  jevSchemaEndpoint: 'http://127.0.0.1:8813/',
  // the spend caps and the blackout, enforced by budget.mjs (ruled 2026-09-30 01:50 and 03:07 CT)
  budget: DEFAULT_BUDGET,
  matchTimeoutSec: 30,
};

function mergeDeep(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? mergeDeep(base[k], v) : v;
  }
  return out;
}

/**
 * Create a campaign: pre-registered config, the seed genomes, and the starting state. You start by
 * trying to beat a prompt (Ceryce's loop). With `opponentPrompts`, those are the first opponents
 * and are never evolved: the seed prompts are the lineage, the only parents (a single-archetype
 * lineage run as its own campaign, spec §6). Without them the first seed prompt is the first
 * opponent and also a parent.
 */
export function initCampaign(store, { name, overrides = {}, seedPrompts, opponentPrompts = [] }) {
  if (store.exists('campaign.json')) throw new Error(`a campaign already exists in ${store.dir}`);
  if (!seedPrompts?.length) throw new Error('init needs at least one seed prompt');
  const campaign = mergeDeep(DEFAULT_CAMPAIGN, overrides);
  campaign.name = name;
  campaign.createdAt = new Date().toISOString();
  if (!['latest', 'hall-of-fame'].includes(campaign.epoch.opponents)) throw new Error('epoch.opponents is "latest" or "hall-of-fame"');
  const cap = campaign.epoch.hallOfFameCap;
  if (cap !== null && cap !== undefined && !(Number.isInteger(cap) && cap >= 1)) throw new Error('epoch.hallOfFameCap is a whole number >= 1, or null for no cap');
  const add = (operator, what) => ({ file, text }) => {
    const problems = validatePromptText(text);
    if (problems.length) throw new Error(`${what} ${file}: ${problems.join('; ')}`);
    return store.addGenome(text, { parent: null, generation: null, operator, source: file });
  };
  const unique = [...new Set(seedPrompts.map(add('seed', 'seed prompt')))];
  const opponents = [...new Set(opponentPrompts.map(add('opponent', 'opponent prompt')))];
  const both = opponents.filter((id) => unique.includes(id));
  if (both.length) throw new Error(`a prompt can't be both a seed and an opponent: ${both.join(', ')}`);
  campaign.seedGenomes = unique;
  if (opponents.length) campaign.opponentGenomes = opponents;
  const first = opponents.length ? opponents : [unique[0]];
  store.writeJson('campaign.json', campaign);
  store.writeJson('state.json', {
    generation: 0,
    epoch: 0,
    opponents: first,
    survivors: unique,
    champions: first.map((id) => ({ id, epoch: 0, generation: null, reason: opponents.length ? 'the first opponent, never evolved' : 'seed: the first opponent' })),
  });
  return { campaign, ids: unique, opponents: first };
}

export function epochSeeds(campaign, epoch) {
  return Array.from({ length: campaign.evaluation.seedsPerEpoch }, (_, i) => deriveSeed(campaign.seed, 'epoch', epoch, 'seed', i));
}

export function promotionSeeds(campaign, epoch) {
  return Array.from({ length: campaign.epoch.promotionSeeds }, (_, i) => deriveSeed(campaign.seed, 'promotion', epoch, 'seed', i));
}

/** The frozen specimen sim (`src/sim/*`, hashes in runs/historical-v1.md). A new sim is a new name. */
export const SIM_VERSION = 'specimen-v1';

/**
 * The cache key of one match. A campaign whose shape names its ruleset (every campaign created
 * since the economy) hashes the sim, map and economy too, so a match played under one ruleset is
 * never reused under another; one whose shape also names the river objective (every campaign
 * created since the Bandstand) hashes that as well, and so does one that names a recall rule
 * (`shape.recall`, src/recall.ts), a finale (`shape.finale`, src/finale.ts), or a tower aggro rule
 * (`shape.towerAggro`, src/towerAggro.ts). A campaign created before any of them keeps the key it always
 * had, so its cache stays valid; its matches still play the runner's defaults, except the tick
 * resolution. A shape that names its resolution (every campaign created since
 * `src/resolution.ts`) hashes it; one that doesn't was cached under the frozen sim's sequential
 * order and keeps playing it (`makePlayMatch` passes `--resolution sequential`), so a cached match
 * and a fresh one under the same key are always played the same way. The targeting rule
 * (`shape.targeting`, tools/jev/target_resolve.py) works the same way: hashed when named, and a
 * shape that doesn't name one keeps playing `first-min` (`--targeting first-min`). So does the
 * vocabulary (`shape.vocab`, tools/jev/vocab.py): hashed when named, and a shape that doesn't name
 * one compiles under vocab-1, so an existing campaign's keys and genomes don't move.
 */
export function matchKey({ violet, green, seed, shape }) {
  const parts = [violet, green, seed, shape.cadenceSec, shape.maxSimSec];
  if (shape.map !== undefined || shape.economy !== undefined) {
    parts.push(`sim=${SIM_VERSION}`, `map=${shape.map ?? 'default'}`, `economy=${shape.economy ?? 'default'}`);
  }
  if (shape.objective !== undefined) parts.push(`objective=${shape.objective}`);
  if (shape.recall !== undefined) parts.push(`recall=${shape.recall}`);
  if (shape.finale !== undefined) parts.push(`finale=${shape.finale}`);
  if (shape.towerAggro !== undefined) parts.push(`towerAggro=${shape.towerAggro}`);
  if (shape.resolution !== undefined) parts.push(`resolution=${shape.resolution}`);
  if (shape.targeting !== undefined) parts.push(`targeting=${shape.targeting}`);
  if (shape.vocab !== undefined) parts.push(`vocab=${shape.vocab}`);
  return sha256(parts.join('|')).slice(0, 16);
}

/** Both sides of every seed, the candidate first as violet: the plan order is the fold order. */
export function pairings(candidate, opponents, seeds, shape) {
  const out = [];
  for (const opponent of opponents) {
    if (opponent === candidate) continue;
    for (const seed of seeds) {
      for (const side of ['violet', 'green']) {
        const violet = side === 'violet' ? candidate : opponent;
        const green = side === 'violet' ? opponent : candidate;
        out.push({ key: matchKey({ violet, green, seed, shape }), candidate, opponent, side, seed, violet, green });
      }
    }
  }
  return out;
}

function planGeneration(campaign, state) {
  const g = state.generation;
  const slots = [];
  state.survivors.forEach((parent, pi) => {
    for (let k = 0; k < campaign.population.childrenPerParent; k++) {
      const id = `g${g}-p${pi}-c${k}`;
      slots.push({ id, parent, focus: pick(MUTATION_FOCI, campaign.seed, 'focus', g, id) });
    }
  });
  return {
    version: STORE_VERSION,
    generation: g,
    epoch: state.epoch,
    phase: 'planned',
    parents: [...state.survivors],
    opponents: [...state.opponents],
    seeds: epochSeeds(campaign, state.epoch),
    shape: { ...campaign.shape },
    slots,
  };
}

/** Sentences of prose, for the "one change" check and the diagnostics. */
export function sentences(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Text the mutator reads about a parent: how it did last generation and which of its compiled
 * rules actually fired. v0's crude stand-in for the rubric (spec §6, proposal c).
 */
export function diagnosticsFor(store, parentId, generation) {
  const lines = [];
  const prev = generation > 0 ? store.readJson(`gen-${generation - 1}.json`, null) : null;
  const row = prev?.ranking?.find((r) => r.id === parentId);
  if (row && row.fitness.matches > 0) {
    const f = row.fitness;
    lines.push(
      `Last generation vs the current opponent: ${f.wins} won, ${f.draws} drawn, ${f.losses} lost over ${f.matches} matches ` +
        `(mean score ${f.mean.toFixed(2)}). Own bearbot deaths ${row.deaths}, enemy deaths ${row.foeDeaths}, ` +
        `own towers lost ${row.towersLost}, enemy towers taken ${row.foeTowersLost}.`,
    );
    const k = row.kinds;
    const total = Object.values(k).reduce((a, b) => a + b, 0) || 1;
    lines.push(`Decisions: ${Object.entries(k).map(([n, v]) => `${n} ${Math.round((100 * v) / total)}%`).join(', ')}.`);
  } else {
    lines.push('No games played yet for this prompt: pick the change from reading the prose.');
  }
  if (store.exists('compiled', `${parentId}.json`)) {
    const compiled = store.readJson(`compiled/${parentId}.json`);
    const entries = compiled.prompts?.[0]?.instruments ?? {};
    for (const inst of INSTRUMENTS) {
      const schema = entries[inst]?.schema;
      if (!schema) continue;
      const fired = row?.rules?.[inst] ?? {};
      lines.push(`${inst}: the prose compiled to these rules (first match wins)${row ? ', with how often each fired' : ''}:`);
      for (const r of schema.rules) {
        if (r.type === 'guard') {
          // a guard always routes to one of its branches; only its top-level question is listed here
          lines.push(`  - ${r.id}: guard -- if ${r.condition} -> its yes-rules, else its no-rules`);
          continue;
        }
        // a vocab-2 AND rule (tools/jev/translator.py AND NODE) has "all", its questions, and no "condition"
        const condition = Array.isArray(r.all) ? r.all.map((q) => q.condition).join(' AND ') : r.condition;
        lines.push(`  - ${r.id}: if ${condition} -> ${r.action_kind}${r.action_ability ? ` ${r.action_ability}` : ''}${row ? ` (fired ${fired[r.id] ?? 0}x)` : ''}`);
      }
      lines.push(`  - otherwise -> ${schema.default_action?.kind ?? 'hold'}${row ? ` (fired ${fired.default ?? 0}x)` : ''}`);
    }
  }
  return lines.join('\n');
}

function validateChild(parentText, outcome) {
  if (!outcome?.ok) return outcome?.error ?? 'mutator returned no prose';
  if (typeof outcome.prose !== 'string' || !outcome.prose.trim()) return 'empty prose';
  const problems = validatePromptText(outcome.prose);
  if (problems.length) return `prompt rejected: ${problems.join('; ')}`;
  if (outcome.prose.replace(/\s+/g, ' ').trim() === parentText.replace(/\s+/g, ' ').trim()) return 'no change';
  return null;
}

function schemasComplete(data) {
  const entries = data?.prompts?.[0]?.instruments ?? {};
  const missing = INSTRUMENTS.filter((i) => !entries[i]?.ok);
  return missing.length ? `did not compile: ${missing.map((i) => `${i} (${entries[i]?.error ?? 'absent'})`).join('; ')}` : null;
}

async function playAll(store, deps, plan, shape, log) {
  const rows = [];
  for (const m of plan) {
    const resultRel = `matches/${m.key}.result.json`;
    let result = store.readJson(resultRel, null);
    if (!result) {
      log(`  match ${m.key}: ${m.violet} (violet) vs ${m.green} (green) seed ${m.seed}`);
      const matchLog = await deps.playMatch({
        violet: { id: m.violet, prosePath: store.genomePath(m.violet), compiledPath: store.compiledPath(m.violet) },
        green: { id: m.green, prosePath: store.genomePath(m.green), compiledPath: store.compiledPath(m.green) },
        seed: m.seed,
        shape,
        out: store.path('matches', `${m.key}.json`),
      });
      const observations = deps.observe ? await deps.observe(matchLog) : null;
      const v = summarizeSide(matchLog, 'violet', observations);
      const g = summarizeSide(matchLog, 'green', observations);
      result = { key: m.key, violet: m.violet, green: m.green, seed: m.seed, shape, violetScore: v.score, sides: { violet: v, green: g } };
      store.writeJson(resultRel, result);
      log(`    -> violet ${v.score} (${v.by}), deaths ${v.deaths}-${g.deaths}, towers lost ${v.towersLost}-${g.towersLost}`);
    }
    rows.push({ ...m, result, mine: result.sides[m.side] });
  }
  return rows;
}

function rankingRow(id, rows, opponents, elo, confidence, g) {
  const mine = rows.filter((r) => r.candidate === id);
  const fitness = opponents.includes(id) && !mine.length
    ? { mean: 0.5, lo: null, hi: null, n: 0, matches: 0, wins: 0, draws: 0, losses: 0, note: 'is the opponent (½ by definition)' }
    : fitnessOf(mine.map((r) => ({ seed: r.seed, opponent: r.opponent, side: r.side, score: r.mine.score })), {
        confidence,
        bootstrapSeed: deriveSeed('bootstrap', g, id),
      });
  const sum = (k) => mine.reduce((a, r) => a + (r.mine[k] ?? 0), 0);
  const kinds = { move: 0, attack: 0, ability: 0, recall: 0, hold: 0 };
  for (const r of mine) for (const [k, v] of Object.entries(r.mine.kinds)) kinds[k] = (kinds[k] ?? 0) + v;
  return {
    id,
    fitness,
    elo: elo[id] ?? null,
    deaths: sum('deaths'),
    foeDeaths: sum('foeDeaths'),
    towersLost: sum('towersLost'),
    foeTowersLost: sum('foeTowersLost'),
    callErrors: sum('callErrors'),
    kinds,
    rules: sumRules(mine.map((r) => r.mine)),
    descriptors: meanDescriptors(mine.map((r) => r.mine)),
  };
}

function nextStateFrom(state, gen, campaign) {
  const next = { ...state, generation: gen.generation + 1, survivors: gen.survivors };
  if (gen.promotion) {
    next.epoch = state.epoch + 1;
    if (gen.promotion.promote) {
      next.opponents = campaign.epoch.opponents === 'latest'
        ? [gen.promotion.id]
        : [...state.opponents, gen.promotion.id].slice(-(campaign.epoch.hallOfFameCap ?? Infinity));
      next.champions = [...state.champions, { id: gen.promotion.id, epoch: next.epoch, generation: gen.generation, reason: gen.promotion.reason }];
    }
  }
  return next;
}

/** Run (or resume) the campaign's next generation. Returns the finished generation record. */
export async function runGeneration(store, deps, { log = () => {} } = {}) {
  const campaign = store.readJson('campaign.json');
  const state = store.readJson('state.json');
  const g = state.generation;
  const genRel = `gen-${g}.json`;
  const gen = store.readJson(genRel, null) ?? planGeneration(campaign, state);
  const save = () => store.writeJson(genRel, gen);
  save();
  log(`generation ${g} (epoch ${gen.epoch}): ${gen.parents.length} parent(s), ${gen.slots.length} slot(s), opponents ${gen.opponents.join(', ')}, seeds ${gen.seeds.join(', ')}`);

  // mutate -- one saved outcome per slot, so a resume never asks the model twice
  const made = [];
  for (const slot of gen.slots) {
    if (slot.child || slot.failed) {
      if (slot.child) made.push(slot.change);
      continue;
    }
    const parentText = store.genomeText(slot.parent);
    const mutRel = `mutations/${slot.id}.json`;
    let outcome = store.readJson(mutRel, null);
    if (!outcome) {
      log(`  mutate ${slot.id} from ${slot.parent}: ${slot.focus}`);
      try {
        outcome = await deps.mutate({ parentText, focus: slot.focus, diagnostics: diagnosticsFor(store, slot.parent, g), avoid: made.filter(Boolean), slot: slot.id });
      } catch (err) {
        if (err instanceof CampaignStop) throw err; // a refused call is not a failed mutation
        outcome = { ok: false, error: `mutator failed: ${err.message}` };
      }
      store.writeJson(mutRel, outcome);
    }
    const problem = validateChild(parentText, outcome);
    if (problem) {
      slot.failed = problem;
    } else {
      const child = store.addGenome(outcome.prose, { parent: slot.parent, generation: g, slot: slot.id, operator: 'llm-single-change', focus: slot.focus, change: outcome.change ?? null });
      if (gen.parents.includes(child) || gen.slots.some((s) => s !== slot && s.child === child)) slot.failed = `duplicate of ${child}`;
      else {
        slot.child = child;
        slot.change = outcome.change ?? null;
        made.push(slot.change);
      }
    }
    log(slot.failed ? `    x ${slot.id}: ${slot.failed}` : `    ${slot.id} -> ${slot.child}: ${slot.change ?? '(no description)'}`);
    save();
  }

  // compile -- the phenotype; a genome that doesn't compile on all three instruments can't play
  const everyone = [...new Set([...gen.parents, ...gen.slots.filter((s) => s.child).map((s) => s.child), ...gen.opponents])];
  gen.compileFailures = gen.compileFailures ?? {};
  for (const id of everyone) {
    if (store.exists('compiled', `${id}.json`) || gen.compileFailures[id]) continue;
    log(`  compile ${id}`);
    let data;
    try {
      data = await deps.compile(store.genomeText(id), { id });
    } catch (err) {
      if (err instanceof CampaignStop) throw err; // nor a failed compile
      gen.compileFailures[id] = err.message;
      save();
      continue;
    }
    const problem = schemasComplete(data);
    if (problem) gen.compileFailures[id] = problem;
    else store.writeJson(`compiled/${id}.json`, data);
    save();
  }
  const playable = (id) => store.exists('compiled', `${id}.json`);
  gen.opponentsPlayable = gen.opponents.filter(playable);
  if (!gen.opponentsPlayable.length) throw new Error(`no opponent compiled: ${JSON.stringify(gen.compileFailures)}`);
  gen.candidates = everyone.filter((id) => playable(id) && (gen.parents.includes(id) || gen.slots.some((s) => s.child === id)));
  gen.phase = 'compiled';
  save();

  // play
  const plan = gen.candidates.flatMap((c) => pairings(c, gen.opponentsPlayable, gen.seeds, gen.shape));
  gen.matchKeys = plan.map((m) => m.key);
  log(`  play ${plan.length} match(es)`);
  const rows = await playAll(store, deps, plan, gen.shape, log);
  gen.phase = 'played';
  save();

  // rate + select
  const elo = eloFold(rows.map((r) => ({ violet: r.violet, green: r.green, violetScore: r.result.violetScore })), gen.opponentsPlayable);
  gen.ranking = gen.candidates
    .map((id) => rankingRow(id, rows, gen.opponentsPlayable, elo, campaign.epoch.confidence, g))
    .sort((a, b) => b.fitness.mean - a.fitness.mean || (b.elo ?? 1000) - (a.elo ?? 1000) || a.id.localeCompare(b.id));
  gen.survivors = gen.ranking.slice(0, campaign.population.parents).map((r) => r.id);
  gen.phase = 'rated';
  save();

  // epoch boundary: the pre-registered promotion test on held-out seeds
  if ((g + 1) % campaign.epoch.generations === 0 && !gen.promotion) {
    const best = gen.ranking.find((r) => !gen.opponentsPlayable.includes(r.id));
    if (!best) {
      gen.promotion = { id: null, promote: false, reason: 'no candidate other than the opponents' };
    } else {
      const seeds = promotionSeeds(campaign, gen.epoch);
      log(`  epoch ${gen.epoch} ends: promotion test for ${best.id} on ${seeds.length} held-out seed(s)`);
      const pRows = await playAll(store, deps, pairings(best.id, gen.opponentsPlayable, seeds, gen.shape), gen.shape, log);
      const fit = fitnessOf(pRows.map((r) => ({ seed: r.seed, opponent: r.opponent, side: r.side, score: r.mine.score })), {
        confidence: campaign.epoch.confidence,
        bootstrapSeed: deriveSeed('promotion', g, best.id),
      });
      const decision = promotionDecision(fit, { minSeeds: campaign.epoch.promotionSeeds });
      gen.promotion = { id: best.id, seeds, fitness: fit, ...decision, matches: pRows.map((r) => r.key) };
    }
    log(`  promotion: ${gen.promotion.promote ? 'PROMOTED' : 'not promoted'} ${gen.promotion.id ?? ''} -- ${gen.promotion.reason}`);
  }
  gen.phase = 'done';
  gen.nextState = nextStateFrom(state, gen, campaign);
  save();
  store.writeJson('state.json', gen.nextState);
  return gen;
}
