# vocab-2 tower reach: "attack their tower" reaches the tower Jev was told about — 2026-10-02

**Question.** PR #81 ([`runs/jev-recheck-vocab2-2026-10-02.md`](jev-recheck-vocab2-2026-10-02.md)
§2.2) found that 40.7 % of the vocab-2 sample entrant's decisions on Jev were "attack `nearest_tower`"
with no target, so the bot stood still. vocab-2's description lists enemy towers out to `nearbyTowers`'
radius (about 390), but the resolver only took towers from `visibleEnemies` (260). The bot parked 260 to
390 units from the tower while its wave walked on.
- **Ruled:** Ceryce, via Margo's recommendation ("Do it"). Fix the target side so "attack their tower"
  does what vocab-2 told the entrant. The attack target reads the same tower list vocab-2 describes,
  and a tower that is out of attack range is walked to, not stood still at. Don't shrink what vocab-2
  describes. vocab-1 stays byte-identical. Say whether the house tiers change, with numbers.
- **Budget:** $1.50 hard stop on Jev (PR #81's identical block cost $0.722).

## Verdict

*§1 was committed before the first real match (`b490448`). The verdict, §2 and §3 came after.*

- **The fix does what was ruled. The entrant still doesn't take a tower, and the next blocker is its
  own prose.**
  1. **Parked tower attacks: 40.6 % of decisions → 0 %.** All 388 of entrant2's "attack
     `nearest_tower`" decisions had a target. Standing still from one decision to the next fell from
     47.6 % to 19.2 %, and none of that 19.2 % follows a tower attack (it was 2,105).
  2. **It pushes now, but it doesn't take a tower.** Structure damage rose from 17 to **195 a match**
     (a tower has 900 hp). Time on the opponent's half went from 5.1 % to 24.4 %, and inside an enemy
     tower's range from 1.1 % to 12.0 %. No tower fell, and all 6 matches were draws at 10:00.
  3. **The new cost: entrant2 dies 19.8 times a match (was 1.5).** 95 of the 119 deaths were tower
     shots, and 113 happened under an enemy tower while entrant2 was playing its own "recall when
     low" rule. The wave dies to the tower first, the bot takes fire, starts the recall-2 channel
     where it stands, and dies there. That is the entrant's prose doing what it says (§3.1), not the
     resolver.
  4. **D6 line 8: FAIL, on the same sub-line as PR #79 and PR #81.** 6 of 6 finish and replay-verify,
     with 0 server errors and 0 parse errors. Easy's `own_tower` was chosen 0 times, because easy still
     never stands in an enemy tower's range.
  5. **Spend: $0.690** of the $1.50 stop. That's 9,840 requests, 0 errors and 0 failovers.
- **House tiers: only hard-eco changes** (§1, at $0). In PR #79's 30 matches, 2,625 of its 24,190
  decisions (10.9 %) were tower attacks with no target. The fix now walks every one of them to the
  tower. Easy, medium and hard (both rulesets) and easy-eco can't change. How the hard-eco change plays
  out in matches isn't measured (§3.2).

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

## 2. Result

**The run** went as written. The block started at 14:54:53 UTC and the last match finished at 15:03:23.
All 6 played in plan order. The spend guard never fired, and nothing was retried, added or dropped.
TypeSafe answered every call: 9,840 requests, 0 errors, 0 failovers. All 6 logs replay-verify.

| | PR #81 | now |
|---|---:|---:|
| matches, decided | 6, 0 | 6, 0 (all level at 10:00) |
| enemy towers fallen | 0 | 0 |
| entrant2 structure damage a match | 17 | **195** |
| entrant2 deaths a match | 1.50 | **19.83** |
| entrant2 alive time in own towers' range | 82.7 % | 60.3 % |
| entrant2 alive time in an enemy tower's range | 1.1 % | 12.0 % |
| entrant2 alive time on the opponent's half | 5.1 % | **24.4 %** |
| entrant2 alive time at its fountain | 3.9 % | 13.0 % |
| easy deaths | 0 | 0 |
| spend | $0.722 | **$0.690** |

### 2.1 What entrant2 chose

| (6 matches) | PR #81 | now |
|---|---:|---:|
| decisions | 5,198 | 4,584 |
| attack `nearest_tower` | 40.7 % | 8.5 % |
| … with no target | **40.6 %** (2,111) | **0 %** |
| stood still to its next decision (< 5 units, alive both times) | 47.6 % | **19.2 %** |
| … right after a tower attack | 2,105 | 0 |
| home | 20.1 % | 27.5 % |
| walk with the wave (`nearby_minion`) | 26.1 % | 26.1 % |
| recall | 0.3 % | 7.0 % |

The tower rule now fires for a few seconds and the bot walks in. Before, it fired again and again
from the same spot. The remaining 19.2 % of standing still (878 decisions) breaks down like this:
- 44 % were ability casts at `lowest_hp_enemy` (keytar's chord, violin's staccato).
- 35 % were violin's `go_home_wait`, already at home.
- 17 % were the recall-2 channel.
- 4 % were attacks on a minion in range.

The ability casts are close to the old gap's shape. The sim's `ability` never walks: with its target
out of range (chord 180, staccato 50) or on cooldown, it does nothing (`src/sim/match.ts`
`tryUseAbility`). That isn't part of this fix (§3.5).

### 2.2 Why it dies

| entrant2's deaths (6 matches) | PR #81 | now |
|---|---:|---:|
| total | 9 | 119 |
| killing blow: tower / minion / bearbot | 4 / 5 / 0 | **95** / 19 / 5 |
| under an enemy tower | 8 | 113 |
| playing `recall_low_hp` at the time | 9 | 113 |

The entrant attacks the tower "with at least two minions near". The tower shoots the minions first,
then the bot. Below a third of its hp the bot recalls, and recall-2 is a 4 s channel where it stands,
inside the tower's range. Its back-off rule ("an enemy tower is visible and none of my minions are
near → home") comes later in the order than the recall, so it never gets to walk out. Easy didn't
kill it. Easy stays at its own tower (99.7 % of its alive time) and never died.

### 2.3 D6 line 8

(a) 6 of 6 finish and replay-verify. (b) 0 server errors, 0 parse errors. (c) Easy chose
`nearest_enemy_bearbot` 110 times, `nearest_enemy_minion` 65 and the `own_front_tower` default 4,984,
but `own_tower` 0 times. **FAIL**, on the same sub-line as before: easy spent 0.0 % of its time in an
enemy tower's range. Easy's schema is unchanged and names no `nearest_tower`. Its other choices moved
because entrant2 now comes to it.

## 3. What Ceryce may want to decide

1. **The entrant's next blocker is in its prose, not the code.** "Recall when below a third" fires
   under the enemy tower and kills it. This is the kind of lesson an entrant is meant to learn from a
   match, and it isn't a resolver bug. Two possible responses: none (it's the entrant's to fix), or a
   line in the entrants README about recall-2's channel under towers. The sample entrant could also
   move "back off from the tower" above "recall". That's a prose edit and a fresh compile.
2. **Hard-eco's change is unmeasured in play.** The fix gives a target to the 10.9 % of hard-eco's
   decisions that used to park (§1). A hard-eco vs medium block on Jev would show whether that breaks
   the stall PR #79 saw, or feeds medium deaths the way entrant2 just did. At about $0.12 a match, 6
   matches cost about $0.75. Not run, because it's outside this brief.
3. **D6 line 8's `own_tower` sub-line** still can't pass against easy, as PR #81 §3.2 said.
4. **Before the arena's vocab-2 switch:** this changes `target_resolve.py`, which is in
   `tools/arena/schemas.mjs` `COMPILER_FILES`. So the compiler version (the compile cache key) changes
   when this merges, and a running `schema_server.py` must be restarted to play it.
5. **Abilities stand still when their target is out of range.** 316 of entrant2's stand-still
   decisions were keytar's "chord the lowest-hp enemy". The target can be any enemy within 260, and
   the sim's `ability` doesn't approach it. How many of those were out of range rather than on
   cooldown isn't split here, and nothing is changed. The pilot side (as in `nearest_tower`, without touching `src/sim`) is where a fix
   would go if wanted.

## Files

- **This page.** The fix is in `tools/jev/target_resolve.py`, with tests in `tools/jev/test_vocab.py`
  and `tools/match/test_vocab.mjs`. Docs are `docs/vocabulary-spec.md` §8.2.
- **entrant2** is PR #81's
  [`jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json`](jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json),
  which is in `develop` since #81 merged; the copy played is byte-identical, and every log records it
  whole. This branch adds no schema, so `test_vocab.py` needs no registration.
- **The 6 logs and 2 stub smokes aren't in git.** They are on the
  [`data-vocab2-tower-reach-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-tower-reach-2026-10-02)
  prerelease as `vocab2-tower-reach-2026-10-02-match-logs.zip`: 0.6 MB, sha256
  `1fdbb23c632547c02bda5b9e597acbf70e9acc072b443297a3cd48cdd0795158`.
  - The zip has `runs/vocab2-tower-reach-2026-10-02-SHA256SUMS`.
  - `runs/vocab2-tower-reach-2026-10-02-analysis/` holds PR #81's runner, probe and scorer
    (repointed), the summary, death, stand-still and re-resolve scripts, all their output (`analysis-output.txt`),
    the run log, the entrant schema, and the server's final `/health`.
- **Log names:** `runs/vocab2-tower-reach-2026-10-02-<violet>-<green>-seed<N>.json`. To check one,
  unzip at the repo root and run `npm run match -- --verify runs/vocab2-tower-reach-2026-10-02-easy-entrant2-seed7.json`.
