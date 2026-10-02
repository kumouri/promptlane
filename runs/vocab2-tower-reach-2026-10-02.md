# vocab-2 tower reach: "attack their tower" reaches the tower Jev was told about — 2026-10-02

**Question.** PR #81 ([`runs/jev-recheck-vocab2-2026-10-02.md`](https://github.com/kumouri/promptlane/blob/runs/jev-recheck-vocab2-2026-10-02/runs/jev-recheck-vocab2-2026-10-02.md)
§2.2) found that 40.7 % of the vocab-2 sample entrant's decisions on Jev were "attack `nearest_tower`"
with no target, so the bot stood still. vocab-2's description lists enemy towers out to `nearbyTowers`'
radius (about 390), but the resolver only took towers from `visibleEnemies` (260). The bot parked 260 to
390 units from the tower while its wave walked on.
- **Ruled:** Ceryce, via Margo's recommendation ("Do it"). Fix the target side so "attack their tower"
  does what vocab-2 told the entrant. The attack target reads the same tower list vocab-2 describes,
  and a tower that is out of attack range is walked to, not stood still at. Don't shrink what vocab-2
  describes. vocab-1 stays byte-identical. Say whether the house tiers change, with numbers.
- **Budget:** $1.50 hard stop on Jev (PR #81's identical block cost $0.722).

## 1. Method (written and committed before the first real match)

**The fix** (`tools/jev/target_resolve.py`, this branch). Under `vocab-2`, `nearest_tower` picks the
nearest of every enemy tower or nexus the description lists. That is `visibleEnemies`' towers and
nexus (vocab-1's pool), plus the alive enemy towers in `vocab.tower_facts`. That function is the one
the description's tower lines read, so the resolver and the description share one list and one range.
The sim's `attack` already walks to a target that is out of reach (`src/sim/match.ts`
`approachAndAttack`), so nothing else changes. `src/` is not touched. Under `vocab-1`,
`nearest_tower` reads `visibleEnemies` as before. The tests:
- `tools/jev/test_vocab.py`: the vocab-1 goldens are unchanged. Every vocab-1 selector under vocab-2
  still matches its golden, except that `nearest_tower` may now also reach a listed tower beyond 260.
  There are unit cases at 300 units (the tower is chosen; vocab-1 gives none) and at 220 (both
  vocabularies pick the same tower).
- `tools/match/test_vocab.mjs` plays the real sim with targets from the Python resolver. A drums bot
  300 units from green's outer top tower walks up and hits it under vocab-2, and stands still under
  vocab-1. At 200 units, both vocabularies play the same.

**Do the house tiers change? Checked at $0, before any match.** A tier can only change if its schema
is `vocab-2` and names `nearest_tower`.

| tier (`prompts/pilots/`) | vocab | `nearest_tower` rules | changes? |
|---|---|---:|---|
| `house-easy`, `house-medium`, `house-hard`, `house-medium-eco` | vocab-1 | 1 an instrument | no (vocab-1 path, golden-tested) |
| `house-easy-eco` | vocab-2 | 0 | no (no rule it can reach) |
| `house-hard-eco` | vocab-2 | 2 an instrument | **yes** |

To size hard-eco's change, PR #79's 30 hard-eco matches
([`data-vocab-house-tiers-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab-house-tiers-2026-10-02))
were replayed. Each "attack `nearest_tower`" decision was then re-resolved with the fixed resolver on
the same observation. This is a per-decision count, not a replay of what would have happened next.

| hard-eco, PR #79's 30 matches | count |
|---|---:|
| decisions | 24,190 |
| attack `nearest_tower` | 3,629 |
| … with no target as played (it stood still) | **2,625** (10.9 % of all decisions, 72 % of tower attacks) |
| … which the fixed resolver now targets | 2,625 (all of them) |
| … which had a target and keep the same one | 1,004 |
| distance to the tower now targeted | median 343 (260–390) |

So hard-eco was parked by the same gap: about one decision in nine. That may be part of why PR #79
saw hard-eco stall against medium. With the fix, those decisions walk to the tower. How that plays out
in matches (towers, results against medium) is **not** measured here. That would be a separate Jev
block (see §3).

The same re-resolve on PR #81's logs: 2,111 of entrant2's 2,113 tower attacks had no target, and the
fixed resolver targets all 2,111 (median 370 units away).

**The Jev re-check.** This is PR #81's block, unchanged except for the code.
- **Code:** `develop` at `00a7d34` plus this branch's fix.
- **entrant2:** the same compiled schema PR #81 played
  (`runs/jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json` on #81's branch,
  sha256 `3f48cb48…c2bce1`), not recompiled, so the resolver is the only change. It is passed from
  outside the repo, and every log records it whole.
- **Easy:** `house:easy` with `prompts/pilots/house-easy-eco.schemas.json`.
- **Backend:** Jev on one private `tools/jev/schema_server.py` on `:8971`, `--budget-usd 1.50`,
  started from this worktree. The live arena is not touched.
- **Smoke, free:** `--stub` on `:8972`, 120 s at seed 7, both pairings, before the real block.
- **Lines (every match):** `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall
  recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`, full 600 s.
- **The sample:** easy–entrant2 and entrant2–easy at seeds 3, 7 and 11. That's 6 matches, 4 at a
  time, in PR #81's order, with PR #81's runner repointed. It stops launching once the projected spend
  passes $1.40, and the server stops at $1.50. No match is added or replayed after a result is seen.
  A match that crashes before it finishes is retried once.

**What is reported** (the baseline is PR #81's 6 matches, scored by the same tools):
1. **Did it push?** Enemy towers fallen, entrant2's structure damage a match, results, and entrant2's
   alive time on the opponent's half and in its own towers' range.
2. **Parked decisions.** The share of entrant2's decisions that were "attack `nearest_tower`" with
   no target (was 40.7 %), and the share of decisions after which the bot didn't move before its next
   one.
3. **D6 line 8**, exactly as PR #79 registered it: all 6 finish and replay-verify, 0 server errors, 0
   parse errors, and each of easy's four new actions is chosen at least once.
4. **Spend,** by the server's ledger.

Jev is not deterministic (PR #37), so a seed doesn't replay PR #81's match. The comparison is over the
6 matches as a block.
