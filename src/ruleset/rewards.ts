/**
 * The hook between the river objective and the economy (docs/economy-spec.md §9.5). Neither layer
 * imports the other. The objective pays gold and XP only through a `RewardSink` registered on the
 * match, and only the economy registers one, so:
 *
 * - **objective without economy** (the map-only game): no sink, so a capture pays the Encore and
 *   nothing else;
 * - **economy without objective**: the sink is registered and never called;
 * - **both**: the economy calls `setRewardSink(match, sink)` in its attach, and each capture pays
 *   `bandstand-team` gold to every bot of the capturing team (alive or dead), `bandstand-local`
 *   gold split among the capturers, and XP to each capturer. Amounts come from the objective's
 *   ruleset (`src/objective/river-1.json`, `economy` block); where the gold lands (at-risk or safe
 *   pool) is the economy's own rule (`pools.safeSources` in eco-1.json).
 *
 * Attach order does not matter: the sink is looked up at the moment of each capture.
 */
import type { Match } from '../sim/match';

/** Ledger keys for Bandstand gold, as §9.5 names them. */
export type BandstandGoldSource = 'bandstand-team' | 'bandstand-local';

export interface RewardSink {
  /** Pay `amount` gold to bot `botIndex` (index into `match.bearbots`) on sim tick `tick`. */
  gold(botIndex: number, amount: number, source: BandstandGoldSource, tick: number): void;
  /** Grant `amount` XP to bot `botIndex` on sim tick `tick`. */
  xp(botIndex: number, amount: number, source: 'bandstand', tick: number): void;
}

const sinkOf = new WeakMap<Match, RewardSink>();

/** Called by the economy layer when it attaches to a match. */
export function setRewardSink(match: Match, sink: RewardSink): void {
  sinkOf.set(match, sink);
}

/** The match's reward sink, if an economy registered one. */
export function rewardSinkOf(match: Match): RewardSink | undefined {
  return sinkOf.get(match);
}
