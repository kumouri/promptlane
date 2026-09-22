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
