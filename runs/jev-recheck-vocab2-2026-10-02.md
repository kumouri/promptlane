# The sample entrant on Jev after the vocab-2 target fix — 2026-10-02 re-check

**Question.** PR #79's D6 check ([`runs/vocab-house-tiers-2026-10-02.md`](vocab-house-tiers-2026-10-02.md)
§4 line 8, §5.4) found that the sample entrant, recompiled under `vocab-2`, sent "walk with my nearest
minion" to `nearest_ally`, a teammate bearbot. On Jev, 79.4 % of its decisions walked to its own bots, it
spent 96 % of its alive time in its own towers' range, and it dealt 2 structure damage a match. PR #80
([`runs/vocab2-target-fixes-2026-10-02.md`](vocab2-target-fixes-2026-10-02.md)) fixed the translator.
This re-runs the same D6 block on Jev, with the sample entrant recompiled on the fixed translator.
- **Asked for:** Ceryce, 2026-10-02: "Do the two still-open things in promptlane" (job
  20261002-101247-f667 left this check open).
- **Budget:** $1.50 hard stop on Jev (the estimate was about $0.75; PR #79's D6 block cost $0.82).

## Verdict

*§1 was committed before the first real match (`661ecf9`, 09:21 CT). The verdict and §2 came after.*

- **The fix works on Jev. The entrant still doesn't push, and the cause is new.**
  1. **Minion rules target minions: yes.** 1,335 of entrant2's 1,355 `nearby_minion` moves (98.5 %) went
     to an allied minion, 3 to an allied bearbot and 17 elsewhere. In PR #79, all 4,156 `nearest_ally`
     moves went to an allied bearbot.
  2. **Walking to its own bots: 0 % of decisions** (`nearest_ally`), against 79.4 %. No rule names it.
  3. **Pushed: no.** Structure damage rose from 2 to 17 a match. No tower fell, and all 6 matches were
     draws at 10:00. Entrant2 spent 82.7 % of its alive time in its own towers' range (was 96.4 %) and
     5.1 % on the opponent's half (was 0.8 %).
  4. **D6 line 8: FAIL, on the same sub-line as PR #79.** (a) 6 of 6 finish and replay-verify; (b) 0
     server errors, 0 parse errors; (c) easy chose `own_tower` **0** times. Easy holds at its outer tower
     and never stands in an enemy tower's range, so that rule has nothing to do. The other three new
     actions fired.
  5. **Spend: $0.722** of the $1.50 stop: 10,454 requests, 0 errors, no failover.
- **The new blocker: an "attack the enemy tower" rule that fires out of reach parks the bot.** 2,113 of
  entrant2's decisions (40.7 %) were "attack `nearest_tower`". In 2,111 of them the action had no
  target, and the bot did not move before its next decision. vocab-2 tells Jev about enemy towers out to
  `nearbyTowers`' radius (1.5 × vision, about 390; `src/sim/match.ts`), so Jev rightly answers "an enemy
  tower is visible". But the resolver takes `nearest_tower` only from `visibleEnemies`, out to vision
  (260; `tools/jev/target_resolve.py`). In those 2,111 decisions the nearest enemy tower was 260 to 390
  away (median 370), so the attack resolved to nothing. The same gap existed in PR #79 (325 of 335
  tower attacks had no target), where `nearest_ally` hid it. Nothing here changes it, because it is
  a resolver or vocabulary change and Ceryce's call (§3).

## 1. Method (written and committed before the first real match)

- **Code:** `develop` at `00a7d34` (PR #80 merged on top of PR #79), branch
  `runs/jev-recheck-vocab2-2026-10-02`. No code changes.
- **The entrant (entrant2):** `prompts/pilots/sample-entrant-eco.prose.md`, unchanged, compiled by PR #79's
  path: `python tools/jev/compile.py … --vocab vocab-2 --economy eco-3-late --backend ollama`
  (`qwen3.5:9b` on the local Ollama as the translator, $0, the model the entrant doors use). The rule
  is PR #79's: take the first sample in which all three instruments compiled. Sample 1 compiled all three,
  so it is the entrant:
  [`jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json`](jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json),
  with its transparency report
  [`jev-recheck-vocab2-compile-sample-entrant-eco-2026-10-02.md`](jev-recheck-vocab2-compile-sample-entrant-eco-2026-10-02.md).
- **What the compile already shows:** every instrument's "walk with my nearest minion" rule now targets
  `nearby_minion`, the nearest allied minion in the wave. No rule names `nearest_ally`. The compile made
  no `target:` corrections, so the prompt wording alone got it right. Every instrument's "attack the
  nearest enemy tower" targets `nearest_tower`, with no invented selector.
- **Easy:** `house:easy` with `prompts/pilots/house-easy-eco.schemas.json`, as in PR #79.
- **Backend:** Jev on one private `tools/jev/schema_server.py` on `:8961`, `--budget-usd 1.50`. TypeSafe
  answers, failing over to Workers AI per call. The live arena is not touched.
- **Smoke, free, already done:** `--stub` on `:8962`, 120 s at seed 7, easy–entrant2 and entrant2–easy.
  Both ran 336 requests with 0 errors. Tokens came to 276k a pairing, against PR #79's 275k, so the block
  should cost about what PR #79's did ($0.82).
- **Lines (every match):** PR #79's: `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1
  --recall recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`,
  full 600 s.
- **The sample:** PR #79's D6 block, in its order: easy–entrant2 and entrant2–easy at seeds 3, 7 and 11,
  6 matches, 4 at a time. The runner is PR #79's (`run_vh.mjs`), repointed. It stops launching once the
  projected spend passes $1.40, and the server stops at $1.50. No match is added or replayed after
  any result is seen. A match that crashes before it finishes is retried once.

**What is reported.** The baseline is PR #79's D6 block (its probe output, scored by the same scorer).
1. **Did the minion rules target minions?** This counts entrant2's `nearby_minion` moves, and what each
   target point was (an allied minion, an allied bearbot, or elsewhere), from the replayed observations.
2. **The share of entrant2's decisions that walked to its own bots** (`nearest_ally`). Baseline 79.4 %.
3. **Did it push?** Structure damage by entrant2's bearbots a match (baseline 2), its share of alive time
   in its own towers' range (96.4 %) and on the opponent's half (0.8 %), towers taken, and results.
4. **D6 line 8, exactly as PR #79 registered it.** PASS iff all hold: all 6 matches finish and
   replay-verify; the server logs 0 errors and both sides 0 parse errors; and each of easy's four new
   actions is chosen at least once (`own_tower`, `nearest_enemy_bearbot`, `nearest_enemy_minion`, and
   the `own_front_tower` default). PR #79 failed only the last sub-line: `own_tower` was chosen 0 times.
5. **Spend,** by the server's ledger.

## 2. Result

**The run** went as written. The first match's `createdAt` is 09:21:41.979 CT and the last finished at
09:26:53. All 6 matches played in plan order. The spend guard never fired, and nothing was retried,
added or dropped. TypeSafe answered every call: 10,454 requests, 0 errors, 0 failovers.

| | PR #79 D6 | now |
|---|---:|---:|
| matches, decided | 6, 0 | 6, 0 (all level at 10:00) |
| entrant2 structure damage a match | 2 | **17** |
| entrant2 deaths a match | 0.83 | 1.50 |
| entrant2 alive time in own towers' range | 96.4 % | **82.7 %** |
| entrant2 alive time at its fountain | 0.5 % | 3.9 % |
| entrant2 alive time on the opponent's half | 0.8 % | **5.1 %** |
| easy alive time in own tower range | 99.9 % | 100.0 % |
| easy deaths | 0 | 0 |
| spend | ≤ $0.819 \* | **$0.722** |

\* PR #79's server ledger after its sixth D6 match. That figure includes P matches already in flight,
so D6 alone cost less. §1's "$0.82" is the same figure.

### 2.1 What entrant2 chose

| (6 matches) | PR #79 | now |
|---|---|---|
| decisions | 5,231 | 5,198 |
| walk to a teammate (`nearest_ally`) | **79.4 %** | **0 %** |
| walk with the wave (`nearby_minion`) | — | 26.1 % |
| attack `nearest_tower` | 6.4 % | **40.7 %** |
| home | 6.7 % | 20.1 % |
| attack nearest enemy minion | 2.6 % | 8.9 % |
| push the lane (default and rule) | 4.3 % | 3.5 % |
| everything else | 0.6 % | 0.7 % |

- **Where the `nearby_minion` moves went** (target point against the replayed observation): an allied
  minion 1,335, an allied bearbot 3, elsewhere 17.
- **Home** is mostly drums' and keytar's "an enemy tower is visible and none of my minions are near →
  home" (15.5 % of all decisions). It reads the same wide tower view as the attack rule, but home is a
  real target, so those bots do walk back.
- **Easy** (5,256 decisions): hold at its outer tower 99.7 %, attack nearest enemy bearbot 7 times,
  nearest enemy minion 7 times, `own_tower` 0.

### 2.2 The parked tower attack

| entrant2's "attack `nearest_tower`" decisions | PR #79 | now |
|---|---:|---:|
| total | 335 | 2,113 |
| with no target (no tower in `visibleEnemies`) | 325 | **2,111** |
| of those, an enemy tower in `nearbyTowers` | 325 | 2,111 |
| distance to that tower (median, range) | — | 370 (260–390) |
| moved before the bot's next decision | — | 0 % (all under 5 units) |

The bots walk up with the wave until an enemy tower enters `nearbyTowers`. Then the "enemy tower visible
and at least two of my minions near → attack the nearest enemy tower" rule fires and resolves to no
target, so the bot stands still. Its wave walks on into the tower and dies, the bot is left with no
minions near, and the back-off rule sends it home. Under `vocab-1` the same rule fired only when the
tower was in vision, because the description didn't list towers further out, so it resolved.

## 3. What Ceryce may want to decide

1. **The tower-reach gap (entrant-facing, ahead of the arena's `vocab-2` switch).** Either resolve
   `nearest_tower` under `vocab-2` from `nearbyTowers` (walk to the tower until it is in vision, as
   `own_tower` already reads them), or describe to Jev as "visible" only the enemy towers the resolver can
   target. The first keeps the prose meaning ("attack the tower you can see"). Either one is a
   resolver or vocabulary change. Old logs replay unchanged, because they record their decisions. A
   fresh D6 block on Jev after the change costs about $0.75.
2. **D6 line 8's `own_tower` sub-line** can't pass against an entrant that never brings easy into an
   enemy tower's range, which is easy's design. Ceryce could drop it, or test that rule against a pusher (the
   `vocab-1` sample entrant took towers in PR #79's S block).

## Files

- **This page;** the entrant
  [`jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json`](jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json)
  and its compile report
  [`jev-recheck-vocab2-compile-sample-entrant-eco-2026-10-02.md`](jev-recheck-vocab2-compile-sample-entrant-eco-2026-10-02.md).
  `tools/jev/test_vocab.py` names the entrant as `vocab-2` on purpose.
- **The 6 logs and 2 stub smokes aren't in git.** They are on the
  [`data-jev-recheck-vocab2-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-jev-recheck-vocab2-2026-10-02)
  prerelease as `jev-recheck-vocab2-2026-10-02-match-logs.zip`: 0.5 MB, sha256
  `e94344e7ba371cdc01e257b7ab34df1c51ab054127e02dbb6538b1fd00e69b8b`.
  - The zip has `runs/jev-recheck-vocab2-2026-10-02-SHA256SUMS`.
  - `runs/jev-recheck-vocab2-2026-10-02-analysis/` holds the scratch tools behind this page: PR #79's
    runner, probe and scorer, repointed; the action tally; the two tower probes; the compile sample; the
    run log; and the server's final `/health`.
- **Log names:** `runs/jev-recheck-vocab2-2026-10-02-<violet>-<green>-seed<N>.json`. To check one, unzip at
  the repo root and run `npm run match -- --verify runs/jev-recheck-vocab2-2026-10-02-easy-entrant2-seed7.json`.
