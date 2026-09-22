/**
 * Ladder rating and placement scheduling for the pre-jam ladder (docs/arena-site-spec.md §3.5,
 * rulings Q4/Q5/Q14/Q15). Pure functions; the ledger fold in `ledger.mjs` calls them.
 *
 * Elo: start 1000, K = 32, draw = 0.5. Both sides of every ranked match update, except the house
 * bot, which is a fixed 1000 that never moves. A revised prompt keeps its Elo and re-places.
 */

export const ELO_START = 1000;
export const ELO_K = 32;
export const PLACEMENT_SEEDS = [7, 11, 42];

/** Probability that a rating `ra` beats `rb`. */
export function expectedScore(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/**
 * One match's update. `scoreA` is 1 (A won), 0.5 (draw) or 0. `fixedA` / `fixedB` pin a side
 * (the house bot). Returns the two new ratings, unrounded; the fold rounds for display only.
 */
export function eloUpdate(ra, rb, scoreA, { k = ELO_K, fixedA = false, fixedB = false } = {}) {
  const ea = expectedScore(ra, rb);
  const eb = 1 - ea;
  const scoreB = 1 - scoreA;
  return {
    a: fixedA ? ra : ra + k * (scoreA - ea),
    b: fixedB ? rb : rb + k * (scoreB - eb),
  };
}

/** Score for `team` from a log's `result`: nexus kill or timeout tiebreak → 1/0, `winner: null` → ½. */
export function scoreOf(result, team) {
  if (result.winner === null || result.winner === undefined) return 0.5;
  return result.winner === team ? 1 : 0;
}

/**
 * The placement matches a newly seen merged prompt gets: one per seed against the house bot,
 * sides alternating starting on violet (Q15). Everyone gets the same three, so the ladder is
 * comparable before anyone plays anyone.
 */
export function placementPlan({ handle, hash }, { seeds = PLACEMENT_SEEDS, house } = {}) {
  if (!house) throw new Error('placementPlan needs the house PromptRef');
  return seeds.map((seed, i) => {
    const entrant = { handle, hash };
    const violetIsEntrant = i % 2 === 0;
    return {
      seed,
      sides: violetIsEntrant ? { violet: entrant, green: house } : { violet: house, green: entrant },
    };
  });
}

// --- jam day: single elimination (spec §3.5, rulings Q6/Q7/Q9) ------------------------------------

/**
 * Bracket positions for a field of `size` (a power of two), as seed numbers: 1 plays `size`,
 * 2 plays `size-1`, … arranged so that 1 and 2 can only meet in the final (size 8 →
 * 1,8,4,5,2,7,3,6). Byes are the seed numbers above the real field, which lands them on the top
 * seeds exactly as Q6 wants.
 */
export function seedOrder(size) {
  if (size < 1 || (size & (size - 1)) !== 0) throw new Error(`bracket size must be a power of two, got ${size}`);
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) next.push(s, n + 1 - s);
    order = next;
  }
  return order;
}

/**
 * Plan a single-elimination bracket from the ladder: `entrants` in ladder order (rank 1 first),
 * each `{handle, hash, elo}`; the merged hash is pinned here so a later merge never changes who
 * plays. Returns `{size, seeds, rounds}` where `rounds[0]` pairs seed numbers (`null` = bye) and
 * later rounds are empty slots the fold fills from winners. Slot `k` of round `r` is fed by slots
 * `2k` and `2k+1` of round `r-1`.
 */
export function bracketPlan(entrants) {
  const n = entrants.length;
  if (n < 2) throw new Error('a bracket needs at least two entrants with a merged prompt');
  const size = 2 ** Math.ceil(Math.log2(n));
  const seeds = entrants.map((e, i) => ({ seed: i + 1, handle: e.handle, hash: e.hash, elo: e.elo }));
  const order = seedOrder(size);
  const round1 = [];
  for (let k = 0; k < size / 2; k++) {
    const a = order[2 * k];
    const b = order[2 * k + 1];
    round1.push({ a: a <= n ? a : null, b: b <= n ? b : null });
  }
  const rounds = [round1];
  for (let slots = size / 4; slots >= 1; slots /= 2) rounds.push(Array.from({ length: slots }, () => ({ a: null, b: null })));
  return { size, seeds, rounds };
}

/** Round names for a bracket with `total` rounds, final last. */
export function roundName(round, total) {
  const fromEnd = total - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round ${round}`;
}

/**
 * Tower hp per team from a checkpoint's `t` array. `towerSpawns()` in the frozen `src/sim/map.ts`
 * pushes, per lane and tier, the violet tower then the green one, so team is index parity.
 */
export function towerHpByTeam(towers) {
  const hp = { violet: 0, green: 0 };
  (towers ?? []).forEach((v, i) => {
    hp[i % 2 === 0 ? 'violet' : 'green'] += Number(v) || 0;
  });
  return hp;
}

/**
 * Who advances from a finished bracket match. The sim's own result first (nexus kill, or the
 * timeout tiebreak by towers then nexus hp); for a full draw (`winner: null`) the ruled order
 * (Q7): fewer deaths → more tower hp left → fewer parse+call errors → the higher ladder seed.
 * `seeds` is `{violet: seedNo, green: seedNo}`; seeds are distinct so this always resolves.
 * Returns `{winner: team, by}`.
 */
export function bracketWinner({ result, final }, seeds) {
  if (result.winner) return { winner: result.winner, by: result.endReason ?? 'result' };
  const pick = (v, g, by, lowerWins) => {
    if (v === g) return null;
    const violetWins = lowerWins ? v < g : v > g;
    return { winner: violetWins ? 'violet' : 'green', by };
  };
  const s = result.stats ?? {};
  const deaths = pick(s.violet?.deaths ?? 0, s.green?.deaths ?? 0, 'deaths', true);
  if (deaths) return deaths;
  const hp = towerHpByTeam(final?.towers);
  const towers = pick(hp.violet, hp.green, 'towerHp', false);
  if (towers) return towers;
  const errs = (t) => (s[t]?.parseErrors ?? 0) + (s[t]?.callErrors ?? 0);
  const errors = pick(errs('violet'), errs('green'), 'errors', true);
  if (errors) return errors;
  return { winner: seeds.violet < seeds.green ? 'violet' : 'green', by: 'seed' };
}

/** The runner seed for a bracket slot: distinct per slot, and per re-run. */
export function bracketMatchSeed(seedBase, round, slot, rerun = 0) {
  return seedBase + round * 100 + slot + rerun * 10000;
}
