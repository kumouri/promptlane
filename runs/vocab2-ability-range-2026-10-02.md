# vocab-2 ability range: a cast out of range walks toward its target, 2026-10-02

**Question.** PR #82 ([`runs/vocab2-tower-reach-2026-10-02.md`](vocab2-tower-reach-2026-10-02.md)
§2.1 and §3.5) found that 316 of the vocab-2 sample entrant's stand-still decisions were keytar's
"chord the lowest-hp enemy". The sim's `ability` never moves the bot. When the target is out of range
or the ability is on cooldown, it does nothing (`src/sim/match.ts` `tryUseAbility`). #82 didn't
split those two causes.
- **Ruled:** Ceryce approved it ("Approve 1 and 2"). Use #82's fix shape. When an ability's target is
  out of that ability's range, the bot moves toward it. Each range has one source of truth. vocab-1
  stays byte-identical. Split the 316 into cooldown and range from #82's logs, and say whether the
  house tiers change.
- **Budget:** $0. No model was called. Every number below comes from replaying logs already on
  releases, the stub schema server, or unit tests.

## Verdict

1. **All 316 are range, none is cooldown.** In #82's 6 matches, 312 of the 316 chord casts were out
   of range with chord ready, and 0 were on cooldown. The other 4 were in range and cast. Chord doesn't
   move the bot, so a cast that lands still counts as standing still. Violin's staccato has the same
   shape: 70 of its 70 stand-still casts were out of range.
2. **The fix** (`tools/match/jevSchemaPilot.ts` `approachOutOfRange`, vocab-2 only) turns 387 of
   entrant2's 396 casts in those matches into moves toward the target. That is 8.4 % of its decisions.
   The median gap was 47 units beyond the ability's range, and the largest was 206.
3. **House tiers: only hard-eco changes.** In PR #79's 40 matches (hard-eco plays 30), 576 of hard-eco's 24,190 decisions
   (2.4 %) become moves. Easy-eco names no ability rule. Easy, medium, hard and medium-eco are vocab-1 and
   play as before.
4. **vocab-1 is byte-identical.** The same stub-server match on develop and on this branch gives the
   same decisions, checkpoints and result (§2.3). The vocab-1 description and resolver goldens in
   `tools/jev/test_vocab.py` are untouched, because no Python changed.

## 1. The fix, and why it sits in the pilot

#82 fixed the target side: `nearest_tower` read too few towers, and the sim's `attack` already walks
to a target out of reach. For abilities the target is already right. The gap is the action, because
`ability` never walks. The resolver can't fix that by choosing differently. If it picked only targets
in range, "chord the lowest-hp enemy" would get no target more often, and the bot would still stand.

So the fix walks, as #82's `attack` does, and it sits where the action is played. That is the schema
pilot, which every schema match goes through: the arena (`tools/arena/queue.mjs`), the CLI and evolve.
Under `vocab-2`, the pilot checks a cast against the observation the server answered. If that
observation places the target beyond that ability's range, the cast plays as `move` to where the
target stood. At the next decision, if the rule still fires and the bot is now in range, it casts.

- **One source for each range.** The check reads `INSTRUMENTS[instrument].abilities[…].range` from
  `src/sim/entities.ts`, which is the same table `tryUseAbility` reads. No copy exists in Python or
  TypeScript. (Python has no range mirror to add. The pilot is TypeScript and imports the sim's table.)
- **Left as before:** abilities with range 0 (fill, glissando, solo), which never check range. Also a
  cast at a target the observation doesn't list, a cast with no target, and every other action kind.
- **Cooldown is not checked.** A cast that is both on cooldown and out of range still walks. Once in
  range it does what it did before.
- **In the log.** `reply` keeps the server's action and the rule that fired. The decision's `action`
  is what was played. Replay reads `action`, so every existing log replays unchanged.
- `src/` is not touched.

## 2. Results

### 2.1 The 316, split ($0 replay of PR #82's 6 matches)

Each log was replayed on this branch. A probe read the observation at every ask and computed the
distance to the target and the ability's cooldown at that moment. Each cast was then passed through
`approachOutOfRange` on that observation. All 6 replays verify. "Stood still" uses #82's definition:
under 5 units moved to the bot's next decision, alive both times. The probe found the same 878
stand-still decisions #82 reported.

| entrant2, 6 matches | casts | ready, in range | cooldown only | out of range only | both | → move under the fix |
|---|---:|---:|---:|---:|---:|---:|
| keytar chord (range 180) | 320 | 4 | 0 | **316** | 0 | 316 |
| … of which stood still | **316** | 4 | **0** | **312** | 0 | |
| violin staccato (range 50) | 71 | 0 | 0 | 71 | 0 | 71 |
| drums kick (range 45) | 5 | 5 | 0 | 0 | 0 | 0 |

The entrant's ability rules say "when chord is ready", and Jev read readiness right every time. The
target was the problem: `lowest_hp_enemy` picks any enemy in sight (260), and chord reaches 180.

### 2.2 Do the house tiers change? ($0 replay of PR #79's 40 matches; hard-eco plays in 30)

Only a vocab-2 schema with an ability rule can change.

| tier | vocab | ability rules | casts | → move under the fix | share of its decisions |
|---|---|---|---:|---:|---:|
| easy-eco | vocab-2 | none | 0 | 0 | 0 % |
| **hard-eco** | vocab-2 | `finish_kill_ability` (kick, chord, staccato at `lowest_hp_enemy`) | 841 | **576** | **2.4 %** of 24,190 |
| medium-eco, easy, medium, hard | vocab-1 | (pass through) | | 0 | 0 % |

Hard-eco's 841 casts split like this: 186 ready and in range, 79 on cooldown only, 473 out of range
only, and 103 both. The 576 that become moves are the last two groups. The median gap was 123 units
beyond range. Its kick and staccato reach 45 and 50, but `lowest_hp_enemy` reaches 260. How this
plays out in matches against medium is **not** measured. That would be a Jev block (§3).

**The gap exists in vocab-1 too, and stays there by rule.** The same replay counts vocab-1 medium's
casts: 2,298 of its 3,078 were out of range (1,540 of them chord). That is 12.7 % of medium's
decisions, and they stand still exactly as before, because vocab-1 is frozen. The vocab-1 sample
entrant shows the same shape: 391 of its 647 casts were out of range.

### 2.3 vocab-1 byte-identical, and the tests

- **Stub matches, develop (`80884bb`) vs this branch.** These ran with the Jam's lines (pvp-1,
  simultaneous-1, own-lane-1, recall-2, eco-3-late, river-2-set10, cadence 2, final-chorus-1), seed 7,
  for the full 600 s, on `schema_server.py --stub` started from each checkout.

  | match | decisions | same decisions (sorted by tick, bot) | same checkpoints | same result |
  |---|---:|---|---|---|
  | medium-eco (vocab-1) vs vocab-1 sample entrant | 6,996 | yes | yes | yes |
  | hard-eco (vocab-2) vs medium-eco | 6,980 | yes | yes | yes |
  | entrant2 (vocab-2) vs easy-eco (vocab-2) | 6,996 | yes | yes | yes |

  Within a tick, log order is arrival order, as before (PR #78). The two vocab-2 stub matches came out
  identical because the stub never had a cast for the fix to change. Its random "yes" fired ability
  rules with no enemy in sight, so all 20 of entrant2's casts had no target. On the stub, the fix is
  exercised by the tests below.
- **Tests** (`tools/match/test_vocab.mjs`):
  - `approachOutOfRange` unit cases, with ranges read from `INSTRUMENTS`. For chord, staccato and kick,
    a cast at exactly the ability's range still casts, and 1 unit beyond becomes a move. A point target
    is measured the same way. Range-0 abilities, unlisted targets, no target and `attack` are left
    alone.
  - In the real sim, through the real schema pilot, a keytar 240 units from an enemy bearbot is told
    "chord it" every decision. Under vocab-2 it walks into chord's range and casts. Under vocab-1 it
    stands still and casts nothing. At 150 units both vocabularies play the same.
  - Without the fix, the 240-unit case fails.
- **All suites pass:** typecheck, build, the CI smokes with verify, `test:match`, `test:arena`,
  `test:evolve`, and the generation, acceptance and tools unittest suites.

## 3. What Ceryce may want to decide

1. **A Jev check of both fixes together.** Rerun #82's block (easy vs entrant2, seeds 3, 7 and 11,
   both pairings, 6 matches). Use this fix plus the sample entrant recompiled with "back off" before
   recall (the companion prose PR). #82's identical block cost **$0.690**, so expect about $0.70.
   It would show whether entrant2 stops dying under towers and whether chord now lands.
2. **Hard-eco against medium in play.** This fix and #82's both change hard-eco only (2.4 % and
   10.9 % of its decisions). A 6-match hard-eco vs medium block on Jev costs about **$0.75**
   (#82 §3.2). It is unmeasured here.
3. **vocab-1 keeps the gap.** Medium stands still on 12.7 % of its decisions with an out-of-range cast.
   Fixing that would break vocab-1's byte-identity, so it would need a new rule name, like `targeting`.
   Not proposed; noted.
4. **After merge:** restart the arena (`tools/arena/server.mjs`), so that it bundles the new pilot.
   `schema_server.py` doesn't need a restart, and the compiler version doesn't change, because no file
   in `COMPILER_FILES` changed.

## Files

- **This page.** The fix is `approachOutOfRange` in `tools/match/jevSchemaPilot.ts`, exported through
  `tools/match/headless.ts`. Tests are in `tools/match/test_vocab.mjs`. Docs are
  `docs/vocabulary-spec.md` §8.3 and a line in `docs/entrant-compile-preview.md`.
- **Inputs:** the logs on the
  [`data-vocab2-tower-reach-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-tower-reach-2026-10-02)
  and [`data-vocab-house-tiers-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab-house-tiers-2026-10-02)
  prereleases, unchanged.
- **The probe, split and compare scripts, with their output,** are not in git. They are on the
  [`data-vocab2-ability-range-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-ability-range-2026-10-02)
  prerelease as `vocab2-ability-range-2026-10-02-analysis.zip` (0.9 MB, sha256
  `efc4f4b3e404a7113ddf31f4923feb2f92904b2ec6ca52b951eb138ae32efc75`). It includes the six stub logs
  and the local CI run.
