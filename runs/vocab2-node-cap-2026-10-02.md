# vocab-2: no cap on rules, and override words promote the rule they're on, 2026-10-02

**Question.** PR #84's recompiles of the sample entrant (`runs/sample-entrant-recall-order-2026-10-02.md`)
found two translator problems:
1. The translator prompt says "Use between 3 and 8 top-level nodes". The prose has about ten rule
   sentences per instrument, and keytar lost its recall in 5 of 12 compiles.
2. Adding "no matter what else is going on" to back off made the priority guard promote a
   *different* rule, "attack the tower", to rule 1 in 3 instruments.
- **Ruled (Ceryce, 2026-10-02 11:43 CT):** "If there's no reason for a limit, there's NO LIMIT. And fix
  the 'no matter what' bug." Find out first whether the 8 has a real reason. Change vocab-2 only;
  vocab-1 stays byte-identical.
- **Budget:** $0. Every compile ran on the local Ollama (`qwen3.5:9b`), as #84's did. Every Jev number
  below comes from match logs already recorded. No Jev call was made.

## Verdict

1. **The 8 has no reason.** It was in the translator's first commit with no rationale, and nothing
   anywhere enforces it. The translator already ignores it: 32 of #84's 35 final-prose schemas have
   more than 8 nodes, and live house-tier matches ask Jev up to 18 questions a decision.
2. **An extra node costs almost nothing.** A decision is one Jev call. Jev reads the state once and
   answers every question in parallel. One more node is about 40 more input tokens (≈2 % of a call,
   $0.0000017) and +0.4 ms. So the vocab-2 prompt now asks for one node per rule the prose states,
   with no upper bound. The only floor is one, which `parse_schema` needs.
3. **The priority guard no longer promotes a look-alike.** Under vocab-2 it matches the sentence the
   override phrase is in. It promotes a rule only if no other sentence of the prose matches that rule
   better. If the translator dropped the rule, the guard raises and the translator retries with the
   sentence named.
4. **On #84's final prose, 12 free compiles:** keytar keeps its recall in **12 of 12** (was 7 of 12),
   back off comes before recall in **29 of 35** (was 24 of 35), and all 34 recalls are gated. 5 of 12
   whole draws pass #84's screen (was 3 of 12).
5. **On #84's variant 3 ("no matter what"), 4 free compiles:** all 11 promotions are the back-off rule.
   Nothing else was promoted.

## 1. Does the 8 have a reason?

| where | what it says |
|---|---|
| History | `a63d9e3` (2026-09-23, "feat(jev): prose-to-schema translator") wrote "Use between 3 and 8 rules". `e4efe3e` (guard tree) changed "rules" to "top-level nodes". The commit messages, `docs/prose-to-schema-translator.md` and the spec give no reason. `ab_prompt_harness.py` has a copy. |
| Validator | `parse_schema` rejects only zero rules. Nothing in `translator.py`, `compile.py`, `schema_server.py`, `house_server.py` or the arena counts nodes. |
| What compiles | #84's 35 final-prose schemas have 8 to 14 nodes (median 10), and 32 have more than 8. In the live house-tier matches (`data-vocab-house-tiers-2026-10-02`) decisions ask 5, 10, 11 or 18 questions. |
| How Jev is asked | One `systemone` call per decision. Every node in the tree is one `noul` question in it (`docs/translator-guards-and-defaults-spec.md` §2.2). TypeSafe's models page, read today: Jev "ingests the `state` once and evaluates every question against it in parallel". 64k tokens per request, 32k of them for the state plus the longest question. $0.042 per million input tokens, output free. No limit on the number of questions is stated. |

**The measured cost of one more node**, from 74,979 live decisions and 36 live matches (vocab-2
house tiers and #82's tower-reach block; `node_cost.py`):

| | measured |
|---|---|
| Jev latency, median by questions per decision | 5 → 209.2 ms, 10 → 209.0, 11 → 206.9, 18 → 208.8. Fit: **+0.43 ms** per question. |
| Input tokens per call | Fit across 36 matches: **+28** per question (intercept 1,500). The question text itself in 77 vocab-2 schemas: mean 153 characters, so 38 to 51 tokens. Call it 40. |
| Dollars | 40 tokens is $0.0000017 a decision. A 10-minute match is about 1,700 decisions at about $0.12. One more node on all six bots adds about **$0.003 a match (+2.4 %)**. |
| Limits | The arena's `dailyBudgetUsd` ($5) covers about 42 such matches, 41 with one more node everywhere. `maxUsdPerMatch` ($0.25) would bind at roughly 45 to 65 more questions per decision than today. Jev's 64k-token request holds about 1,500 questions. |
| Compiling | More nodes is more translator output. The fixed translator's runs used a median of 14,233 tokens (max 25,424) of the compile preview's 60,000 cap, against #84's 18,359 (max 28,226). It needed fewer retries: 8 of 12 runs took 3 model calls, against 4 of 12. |

The cost is negligible, so the bound is removed. The prompt for vocab-1 is unchanged (`vocab1_golden.json`).

## 2. The priority-guard misfire

`enforce_absolute_priority` finds the paragraph with an override phrase ("no exceptions", "no
matter", …) and promotes the root rule that shares the most words with it, if that is at least two.
When the translator has dropped the rule the phrase is on, a rule about the same things still
shares two words. In #84's variant 3 ("If I can see an enemy tower and none of my minions are near
me, I back off home instead of tanking the tower alone, no matter what else is going on."), this
happened:

| compile | back off | the old guard promoted |
|---|---|---|
| s4 keytar | dropped | `attack_tower_if_two_minions` |
| s4 violin | dropped | `push_tower_if_wave_near` |
| s3 violin | dropped | `push_tower_if_wave_near` |

There was a second way to misfire. In s1 drums back off compiled, but it ties with the attack-tower
rule ("enemy", "tower", "minions"). A tie goes to whichever rule the translator wrote first. The
guard promoted back off only because it came first.

**The fix, vocab-2 only** (`translator._enforce_absolute_priority_v2`):
- The unit is the **sentence** with the override phrase, not its paragraph.
- A rule matches that sentence only if **no other sentence of the prose matches the rule better**. The
  attack-tower rule matches "…at least two of my minions are near me, I attack the nearest enemy
  tower" better, so it belongs to that sentence and is never promoted for back off.
- The rule's **target** counts as words ("home", "nearest tower", "push lane"). So back off ("back off
  **home**") beats the attack rule even before the check above.
- No match raises `SchemaValidationError`, which is the translator's existing retry path. The retry
  prompt quotes the sentence: "write a rule for this sentence: …". After three attempts the instrument
  doesn't compile, as before.

**"Always" and "never" are still not override words.** The brief listed them, but this repo has
measured why they aren't. "Always" is ordinary habit wording in ability lines (`drums.md`: "on
cooldown, always, no hesitation"). Promoting the rule it's on puts kick above recall. A test has
locked that in since the guard was written. "Never" usually gates a rule rather than ranking it.
#84's variant 5 ("I recall home to heal, but never inside an enemy tower's range") would have
promoted recall above back off, which is the order #84 exists to fix. Both checks still pass under
vocab-2. Adding them is a one-line change if Ceryce wants it anyway.

**Fixture tests** (`test_translator.py` `VocabTwoPriorityGuardTests`) use #84's exact variant-3 prose
and four of its compiled schemas (`tools/jev/testdata/override_lookalike.json`, from the
`data-sample-entrant-recall-order-2026-10-02` zip). The prose was not saved in #84's zip, so it is
rebuilt from the reports' verbatim quotes; every one of the 17 quoted sentences matches. The tests:
- No look-alike is promoted in the three dropped-back-off schemas.
- Back off is promoted in s1 drums.
- vocab-1's guard is unchanged, misfires included.
- `translate_pilot` retries, names the sentence, and ships the rule.
- The keytar repro still promotes recall.
- No override phrase leaves the schema unchanged.

On the saved schemas, the vocab-2 guard promotes back off in the 6 that have it and raises in the 4
that dropped it (`guard_check.out`). The checked-in `keytar.md` and `violin.md` schemas still get their
recall promoted.

## 3. The free recompiles

Pre-registered (`preregistration.txt`, 16:52 UTC, before any compile). Command: `python
tools/jev/compile.py <prose> --vocab vocab-2 --economy eco-3-late --backend ollama`. Each run took 45
to 98 s. Each instrument compile was classified by #84's own `order.py`, unchanged.

### 3.1 #84's final prose, 12 samples

This is `prompts/pilots/sample-entrant-eco.prose.md` as #84 merged it (`3cd58ad`), byte for byte.

| (instrument compiles) | #84 (old translator) | this branch |
|---|---:|---:|
| compiled | 35 of 36 | 35 of 36 |
| keytar recall present | 7 of 12 | **12 of 12** |
| recall present | 29 | 34 |
| … gated on "not inside an enemy tower's range" | 29 of 29 | **34 of 34** |
| … able to fire inside an enemy tower's range | 0 | 0 |
| back off present | 31 | 31 |
| back off before recall | 24 | **29** |
| parking rule | 3 | 3 |
| whole draws passing #84's screen | 3 of 12 (s2, s3, s8) | **5 of 12** (s1, s6, s8, s9, s10) |
| top-level nodes, median (range) | 10 (8–14) | 10 (9–14) |

By instrument, back off before recall is drums 10 of 12, keytar 8 of 12, violin 11 of 11. Keytar now keeps
its recall but drops back off in 3 of 12. The one failure (s4 violin) was unbalanced JSON after 3
attempts. The guard never fired, because the final prose has no override phrase. Nothing was promoted.

The median node count barely moved. The gain is that fewer compiles drop a rule (one 9-node schema,
against eleven 8- or 9-node ones before).

### 3.2 #84's variant 3 ("no matter what"), 4 samples

All 11 compiled instruments put back off first, and every one of the 11 promotions is the back-off
rule (its ids: `avoid_tower_alone`, `retreat_from_tower`, `back_off_tower`, …). No other rule was
promoted. One instrument (s1 violin) failed to compile: the translator wrote the shopping list as a
rule with action `build`. One recall (s3 drums) came out ungated, asking about "an enemy bearbot
inside any of this bot's own towers' ranges". That is a translation miss, not the guard. This prose
was rejected in #84 and isn't shipped.

### 3.3 The shopping-list parking rule

It's unrelated to the node cap, and not fixed. It came out 3 of 35 before and 3 of 35 after. The
shopping lines still sometimes become "is this bot at its base? → home" (#84 §2.1). The compile
preview still doesn't flag it.

## 4. What Ceryce may want to decide

1. **"Always" / "never"** (§2): not added as override words, for the reasons above. Say so if you want
   them anyway.
2. **A Jev check.** #84's §3.1 re-check (6 matches, easy vs entrant2, seeds 3, 7, 11, both pairings)
   with a schema drawn from this translator. Node counts are unchanged at median 10, so expect #82's
   cost: about **$0.70**. Not run.
3. **The parking rule** (§3.3) and the **ungated-recall translation miss** (§3.2) are still open
   translator issues.

## Files

- `tools/jev/translator.py` (vocab-2's node-count line and priority guard), `tools/jev/test_translator.py`,
  `tools/jev/testdata/override_lookalike.json`, `tools/arena/schemas.mjs` (`segment.py`, which the
  guard now reads, joins `COMPILER_FILES`), `docs/vocabulary-spec.md` §8.4, and a line each in
  `docs/prose-to-schema-translator.md` and `docs/arena-site-spec.md`.
- **All 16 compile runs** (reports, schemas, stdout), the cost scripts and their outputs, the tally,
  `preregistration.txt`, both prose files and the fixture builder are on the
  [`data-vocab2-node-cap-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-node-cap-2026-10-02)
  prerelease as `vocab2-node-cap-2026-10-02-compiles.zip` (0.16 MB, sha256
  `b323bac5897b4484a0772ade0dbf0400ca00fc3cb98465b9848b457fd77f08e6`).
