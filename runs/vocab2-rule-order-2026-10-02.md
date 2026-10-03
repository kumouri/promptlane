# vocab-2: a cascade keeps the prose's order, 2026-10-02

**Question.** Once #95 removed the token caps, house-hard-eco's 16-rule prose compiled whole for the
first time ([`runs/remove-token-caps-2026-10-02.md`](remove-token-caps-2026-10-02.md) §6). Two defects
showed:
1. In **16 of 36** schemas the translator moved the 480-second tower rule, the tower-fire retreat or the
   finish kills below "push with your wave". A cascade is first-match-wins, and the wave rule nearly
   always fires, so those rules rarely ran.
2. In **3 of 36**, #87's negation check dropped a correct shopping rule. It tied the rule's id
   (`shop_afford_no_enemy_minion_tower`) to "Never stand in an enemy tower's fire".

- **Ceryce's rulings (2026-10-02):** 15:14 CT, *"The most important part of this whole thing is the
  translation from prose to Jev. It HAS to be right."* 17:59 CT, *"Get rid of any fucking token caps."*
- **Brief:**
  1. The compiled vocab-2 cascade keeps the prose's priority order (prose order, unless the prose
     reorders it, as with #85's override words). On a mismatch: reject and retry, quoting only prose.
     On the last attempt: reorder when each rule's sentence is clear, else drop with a note.
  2. Fix the 3/36 negation false positive. Also fix #87's reader for "outside an enemy tower's range"
     (flagged by #98's job), with fixtures.
  3. Drop vocab-1's 1,800-token reply cap.
  4. Recompile the checked-in house-hard-eco schemas (#88's hand-splice), and any other house tier whose
     committed schemas would change. Don't recompile files open PRs #99 and #100 change.
  5. Fix the guards spec's violin example prose so #92's guard-scope check accepts it, without loosening
     the check.
- **Budget:** $0. Every compile ran on the host's Ollama (`qwen3.5:9b`). No Jev call and no paid model
  call was made.
- **Two jobs.** The first job (Margo job 20261003-004053-7602) built the check and its retry in four
  rounds (§2, §4), committed 2dec3e6–63eff78, and hit its 6-hour limit with the docs uncommitted and
  no write-up. This resumed job:
  - merged develop (#96–#98) and finished items 2–5;
  - ran the merged code at $0, which found five more defects, and fixed them (§3.3, §6.3, §8, §11.1);
  - confirmed on a last live batch (c476d27, §6.4). The two fixes after it (b1fead0, 69e0471) were
    checked by replaying that batch's recorded replies.

## Verdict

1. **Order (item 1).** `translator.enforce_rule_order` (spec §8.15) places each rule at the part of the
   prose it states. It rejects a cascade that leaves the prose's order.
   - On #95's own 72 schemas, the check agrees with an independent oracle on all 72 (§2).
   - On every later reply the model wrote (283), it agrees on 281. The other 2 are junk rules ("spend
     gold first", "is gold > 0?") above the back-off. The check flags them; the oracle can't see them.
2. **Shipped out of order: 16 of 36 → 0 of 36** on #95's exact hard-eco prose (the first job's batch v4,
   63eff78). **0 of 72** on the merged code (12 hard-eco + 12 sample-entrant compiles, e902d0b). The
   sample entrant was 33 of 36 before.
3. **Negation false drops: 3 of 36 → 0 of 36** shipped on #95's prose. 0 of 72 on the merged code.
   - The batch found one more false drop, inside an attempt; it never shipped (§3.3). The rule's own
     sentence names the minions both ways, and the id path didn't skip it the way the sentence path
     does. Fixed: 2 of 567 recorded verdicts change, both false rejections.
   - "Outside an enemy tower's range" now keeps the prose's "not inside" (§3.2). No recorded verdict
     moves.
4. **No regression against #98's table** (§6.2). No row is worse than #98's, and only one difference
   is significant:
   - **Back off before recall: 36 of 36**, against #98's 23 of 33 (p < 0.001). That is the order
     fix.
   - All 252 multi-clause conditions are stated in full, none in part. All 36 compiled.
5. **The retry took four rounds** (§4). Each round fixed what the last one measured:
   - quoting the misplaced pairs left 10 of 11 retries out of order; listing the prose's whole order,
     0 of 11;
   - a retry may write fewer rules, or a different rule for a sentence. So the first reply that is
     wrong only in its order is kept, reordered. It ships unless a later reply keeps every action it
     had for every sentence.
6. **Five defects found by this job's batches, all fixed** (§3.3, §6.3, §8, §11.1):
   - the id-path negation false drop;
   - a retry that swapped the walk rule for its sentence's other half;
   - violin.md, the reference prose that is mostly not conditional: the check moved a rule the prose
     states nowhere up to rule 2. A rule now needs a best part score of 0.8 to be judged. Every rule a
     sentence states scored at least 0.88 (2,778 rules);
   - keytar.md: "inside your attack range … you should be leaving" read as the attack action. That
     moved a basic attack above Chord;
   - #98's clause coverage removed the correct tower-fire rule as half of the siege sentence in 3 of 54
     hard-eco compiles. Its tie-break now uses the same parts.

   Each fix was replayed on the batches' recorded replies, which reproduce every shipped schema under
   the code that ran. After all four, the replayed merged-code batches have **every hard-eco prose rule
   in 54 of 54** schemas.
7. **vocab-1 sends no reply cap** (item 3, §7.1). Its request is the recorded one less `num_predict`
   1800.
8. **violin.md** (item 5, §7.2). Its Staccato paragraph now opens "In a fight you can win, …". The
   guards spec's tree is accepted, and the check is as strict as before.
9. **No house schema needed a recompile** (item 4, §9).
   - Every committed house tier passes all five vocab-2 checks unchanged. That includes house-hard-eco,
     which is #88's splice, in prose order.
   - #99 and #100 change `house-hard-eco` and `house-medium-eco` (prose and schemas), so any
     recompile waits for them anyway.
   - Two sample-entrant files, pvp-2 and siege, are out of order. Their swap plays the same (§9).
10. **Cost (§10).** The order retry is a whole rewrite.
    - Sample entrant: 8.7 model calls a compile (#98: 7.2; #95: 3.7).
    - House-hard-eco: 5.2 calls (#95: 3.5).
    - Wall time: median 136 s and 92 s on a quiet GPU.
    - In 36 of the 42 sample compiles where the order retry ran (§10), the kept reply shipped. In the
      other 6 the retry shipped the same rules. The third call never bought a better schema. Skipping
      the retry when the reorder is clean would save it, but the brief asks for a retry. **Needs a
      ruling.**
11. **Needs a ruling: descriptive prose (§8.1).** drums.md states "Retreat only when you're really
    hurt — below a quarter health" in its *last* paragraph, after "Push the lane". In 3 of 3 compiles,
    prose order moved the model's low-hp recall from the top to the bottom, below push-the-lane, where it
    rarely fires. That is the brief's rule ("prose order unless the prose explicitly reorders"), and the
    entrant sees an `order:` note. But a drums.md-style entrant would rarely retreat.
12. **Confirmation (§6.4).** The final code ran 6 sample-entrant, 6 hard-eco and 9 reference-pilot
    compiles. None regressed against #98's table (every p ≥ 0.07). No hard-eco or sample schema was out of
    order, except one swap where both rules attack the nearest tower. The 9B wrote no guard in any of the
    7 violin compiles, so the guard-tree path was tested by replay only.

## 1. What the translator wrote

#95's free batch, replayed through this branch's checks
([`data-remove-token-caps-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-remove-token-caps-2026-10-02)):

| (instrument schemas) | house-hard-eco at #95's prose | sample entrant |
|---|---:|---:|
| shipped out of the prose's order (oracle) | 16 of 36 | 33 of 36 |
| first replies out of order (oracle) | 17 of 36 | 34 of 36 |
| shipped with a negation drop | 3 of 36 (all false) | 0 |
| every prose rule present | 24 of 36 | 24 of 36 |

- **Hard-eco:** the 480-second tower rule, the tower-fire retreat or the finish kills land below "push
  with your wave (if an allied minion is near you)".
- **Sample entrant:** "afford my next item → go shop" lands above the back-off and the recall.
- **The oracle** is the first job's, unchanged: hand-written signatures of which compiled rule is which
  prose rule. #95's `hard_screen.py` serves #95's prose, and the same style serves #94's hard-eco prose
  and the sample entrant (`analyze.py`). A schema is out of order when any two rules it finds are
  inverted.

## 2. The check

`translator.enforce_rule_order`; the full rule is in `docs/vocabulary-spec.md` §8.15.
- **The prose is cut into parts:** each rule sentence, with the label sentences that introduce it
  (`_ProseUnits`).
- **Scoring:** a node scores against each part by the idf-weighted share of the part's words it uses,
  with a part naming another action counted half.
- **Out of order:** the fewest nodes whose removal leaves the rest in the prose's order.
- **Not judged:**
  - override-worded prose (#85's guard places those rules);
  - a node that shares fewer than two words with every part;
  - since §8, a node whose best part scores under 0.8.

**Against the oracle** (no model call; `replay_order.py`, `replay_order_replies.py`):

| | schemas / replies | both out of order | both in order | check only | oracle only |
|---|---:|---:|---:|---:|---:|
| #95's shipped schemas (in-sample: the parts were tuned on these) | 72 | 49 | 23 | 0 | 0 |
| every reply of batch v4 (63eff78) and v5 (merged), out-of-sample | 283 | 108 | 173 | 2 | 0 |

- The 2 "check only" replies put junk rules ("spend gold first", "is gold > 0?") above the back-off.
  The oracle has no signature for them.
- On #95's 72, the last-attempt reorder leaves none out of order and removes no rule.

## 3. Negation

### 3.1 A "no" in another sentence never vetoes a rule

`enforce_negation` (#87) now lets only sentences of the parts a rule may state decide (§2's
attribution). That removes #95's 3 false drops. In each, "Never stand in an enemy tower's fire" backed
the "no" in a shopping rule's id. #87's fixtures pass unchanged. Batch v4 on #95's prose shipped
**0 of 36** negation drops.

### 3.2 "Outside an enemy tower's range"

Flagged by #98's job. #87's reader read "outside an enemy tower's range" as the tower being there, so a
correct recall rule worded that way would have been rejected for losing "I'm not inside an enemy
tower's range".
- "outside" and "beyond" now negate in the guard's own word list. #98's coverage list already had
  them, and now reuses the guard's.
- The four-word window before a mention no longer counts "the", "a", "of" or "every". So "outside the
  range of every enemy tower" and "not inside the range of an enemy tower" keep their "not" too.
- **Replayed on everything on record** (157 JSON files: 482 conditions, 509 rule ids, 552 sentences):
  no condition or rule id reads differently. Two doc lines do ("beyond a tower's 160 range", a README
  table row). Neither is pilot prose.
- Fixtures: `test_outside_a_towers_range_is_not_inside_it`.

### 3.3 A sentence naming the thing both ways backs no id either

Found in batch v5, sample s1 keytar, last attempt.
- The rule was `walk_or_home_no_wave`: "is there at least one minion near me?" → walk with the nearest
  minion. That is the first half of "Otherwise I walk with my nearest minion, and if I have no minions
  near me I go home …", and it is correct.
- #87 already let such a sentence decide nothing on the sentence path. The id path took any sentence
  with a "no" on the thing, and dropped the rule.
- The drop didn't ship: the kept reply (§4) had the rule.
- **Fixed:** the id path now needs a sentence that names the thing only as not there.
- **Replayed on all 567 recorded replies:** 2 verdicts change. Both are this pattern; the other is the
  first job's v3 s8 violin, `walk_or_home_no_minions`. Both were false rejections.

## 4. The retry: four rounds

Each round ran on a frozen `git archive` of its commit, through `rec_verify.py`, which only records
what each check saw on each attempt.

| round (commit) | retry design | batch | shipped out of order | every prose rule present | calls / run |
|---|---|---|---:|---:|---:|
| #95 (baseline) | none | hard-eco at #95's prose | 16 / 36 | 24 / 36 | 3.0 |
| | | sample entrant | 33 / 36 | 24 / 36 | 3.5 |
| 1 (2dec3e6) | quote the misplaced pairs | hard-eco at #95's prose | 0 / 36 | 35 / 36 | 4.0 |
| | | hard-eco, #94's prose | 1 / 36 | 31 / 36 | 3.0 |
| | | sample entrant | 0 / 36 | 24 / 36 | 9.0 |
| 2 (49a8fe0) | list the prose's whole order; keep an order-only reply | hard-eco, #94's prose | 1 / 36 | 30 / 36 | 3.0 |
| | | sample entrant | 1 / 36 | 14 / 36 | 6.0 |
| 3 (d500c89) | list every part a rule may state | sample entrant (9 runs) | 0 / 27 | 14 / 27 | 7 |
| 4 (63eff78) | ship the kept reply when the retry loses a rule | hard-eco at #95's prose | **0 / 36** | 29 / 36 | 4.5 |
| | | sample entrant | **0 / 36** | 27 / 36 | 6.0 |

(Calls are medians per three-instrument compile.)

**Round 1's message** quoted the misplaced pairs ("X" and "Y" before "Z"). The first job A/B'd it at
$0 on the 11 sample-entrant first replies the check rejected (`ab_retry.py`, one call per reply and
message):

| retry message (quotes prose only) | back in order and passing | rules, of 104 in the first replies |
|---|---:|---:|
| A: the misplaced pairs | 0 of 11 (10 still out of order, 1 parse error) | 100 |
| B: the prose's whole order, numbered | **11 of 11** | 107 |
| C: B plus "rule 1 must be the rule for …" | 11 of 11 | 106 |

B shipped. The brief asked the retry to quote "only the out-of-order sentences". This quotes more: every
sentence the reply's rules state, numbered in the prose's order. It still quotes only prose, never the
model's output.

**What rounds 2–4 fixed.**
- Told to keep the prose's order, the 9B wrote one rule per listed sentence. It dropped "walk with my
  nearest minion", the first half of the walk sentence, in 13 of 36 round-2 retries.
- Round 3 listed every candidate part, so the walk sentence was always listed. Retries still dropped
  the rule: 9 of 27 shipped without it.
- Round 4 kept the first reply that is wrong only in its order (it has passed every other check),
  reordered as the last attempt would ship it. It ships instead when a later reply states fewer rules
  for some part, or when every later attempt fails for another reason.
- §6.3 tightens "fewer rules" to "a missing action".

## 5. The merge with develop (#96–#98)

Develop gained #96 (base tower), #97 (tower aggro) and #98 (clause coverage). Every guard is kept.
- **Order of the checks.** `translate_pilot` runs clause coverage, then rule order, then the priority
  guard. Order is judged on rules that already state every clause, so the kept reply has passed every
  other check.
- **Retries.** An order rejection is a whole rewrite, like guard scope's. A coverage rejection is #98's
  splice.
- `_negation_lost` takes #98's `_own_sentence`, and still lets only the stated parts decide.
- The rule-order section is vocabulary spec §8.15. §8.11–§8.12 are develop's, §8.13 is the AND-node
  branch's, and §8.14 is #99's and #100's.
- **Two tests met the other check.**
  - #98's splice test reply is out of the prose's order, so order is off for it, as for #84–#87's.
  - The order keeper's reply also drops a clause, so coverage is off for it.
  - A new test runs both checks: coverage splices first, then the order retry, and the result is whole
    and in order.
- **Prompt.** All 504 first-attempt prompts (every pilot × vocab × instrument × economy × map) are
  byte-identical to develop's 87eaf87, given the same prose. With violin.md's new paragraph, its 24 differ
  by that sentence only (`prompt_same.py`).

## 6. The free recompiles

Same arguments as #95's batch:
`python tools/jev/compile.py <prose> --vocab vocab-2 --economy eco-3-late --backend ollama`, through
`rec_verify.py`.

### 6.1 Like for like with #95: the first job's batch v4 (63eff78)

#95's exact hard-eco prose (`house-hard-eco-at95.prose.md`) and the sample entrant, 12 compiles each:

| | #95 hard-eco | **v4 hard-eco** | #95 sample | **v4 sample** |
|---|---:|---:|---:|---:|
| compiled | 36 | 36 | 36 | 36 |
| shipped out of order (oracle) | 16 | **0** | 33 | **0** |
| shipped with a negation drop | 3 (false) | **0** | 0 | 0 |
| every prose rule present | 24 | 29 | 24 | 27 |
| first replies out of order (oracle) | 17 | 17 | 34 | 35 |
| order check: rejected, next attempt passed | — | 17 of 17 | — | 30 of 31 |

v4 predates the merge, so it has no clause coverage. Its order check is the merged code's, less §8's
floor, which changes no verdict on these proses.

### 6.2 The merged code: batch v5 (e902d0b)

Interleaved, 12 sample-entrant and 12 house-hard-eco (#94's prose, as on develop) compiles:

| | hard-eco | sample entrant |
|---|---:|---:|
| compiled | 36 of 36 | 36 of 36 |
| **shipped out of order (oracle)** | **0** | **0** |
| shipped with a negation drop | 0 | 0 |
| every prose rule present | 35 | 34 |
| first replies out of order (oracle) | 1 | 36 |
| order check: rejected, next attempt passed | 4 of 4 | 27 of 27 |
| shipped the kept reply, reordered | 1 | 29 |

**#98's table** (#98's own `tally.py` and `compare.py`, unchanged; two-sided Fisher):

| (instrument schemas) | **v5** | #98 v3 (its table) | p | #98 v4 | #87 v2 | p |
|---|---:|---:|---:|---:|---:|---:|
| compiled | **36/36** | 33/36 | 0.24 | 18/18 | 35/36 | 1.00 |
| build = its own list | 36/36 | 33/33 | 1.00 | 18/18 | 34/35 | 0.49 |
| parking rule | 0 | 0 | 1.00 | 0 | 0 | 1.00 |
| recall present / gated / under a tower | 36 / 36 / 0 | 33 / 33 / 0 | 1.00 | 18 / 18 / 0 | 35 / 35 / 0 | 1.00 |
| back-off present | 36/36 | 33/33 | 1.00 | 18/18 | 33/35 | 0.24 |
| **back-off before recall** | **36/36** | 23/33 | **< 0.001** | 14/18 | 24/35 | < 0.001 |
| home: spend gold | 36/36 | 30/33 | 0.10 | 18/18 | 27/35 | 0.002 |
| home: afford next item | 36/36 | 32/33 | 0.48 | 18/18 | 32/35 | 0.12 |
| home: no minions | 15/36 | 11/33 | 0.62 | 4/18 | 14/35 | 1.00 |
| inverted negation | 0 | 0 | 1.00 | 0 | 0 | 1.00 |
| conditions stated only in part | **0/252** | 0/231 | 1.00 | 0/126 | 25/245 | < 0.001 |
| conditions stated in full | **252/252** | 229/231 | 0.23 | 126/126 | 207/245 | < 0.001 |

- "Home: no minions" is the walk sentence's second half. It is short in every batch since #86, and
  is not a regression.
- **The one hard-eco schema missing a rule** (s11 violin, no tower-fire retreat) never reached the
  order check. It is #98's clause-coverage splice (§11.1).

### 6.3 A retry that changed a rule

In batch v5 sample s8, drums and violin:
- The order retry (a whole rewrite) kept one rule for the walk sentence, but the wrong half: "are there
  no minions near? → home", and in drums "→ the nearest ally".
- The kept reply had "walk with my nearest minion". Round 4's guard counted rules per part, saw one
  each, and shipped the retry.
- **Fixed:** `keeps_every_rule` now needs every (kind, ability, target) the kept reply had for each part.
- **Replayed:** the batch's 72 compiles with their recorded replies reproduce all 72 shipped schemas
  under e902d0b. Under the fix, 8 ship something else:
  - 2 improve (s8 drums and violin, 9 → 10 of 10 prose rules);
  - 6 swap one schema with every prose rule in order for another;
  - none gets worse.
- #98's table on the replay is the one above, except "home: no minions" 14/36 (p = 0.80 vs #98).

### 6.4 Confirmation: batch v6 (c476d27), and replays of the two fixes after it

c476d27 is v5's code plus §3.3, §6.3 and §8's floor. The batch ran 6 sample-entrant and 6
house-hard-eco compiles interleaved, then 3 each of violin.md, drums.md and keytar.md, with
`--instrument`.

| | hard-eco, live | **hard-eco, final code (replayed)** | sample, live | **sample, final code (replayed)** |
|---|---:|---:|---:|---:|
| compiled | 18 of 18 | 18 of 18 | 18 of 18 | 18 of 18 |
| shipped out of order (oracle) | 0 | **0** | 1 | 1 |
| every prose rule present | 16 | **18** | 16 | 16 |
| shipped with a negation drop | 0 | 0 | 0 | 0 |

- **Hard-eco 16 → 18.** The two missing rules were both the tower-fire retreat, lost to #98's coverage
  (§11.1). The fix keeps them.
- **The order check's 3 hard-eco removals** were duplicates: a second hurt-recall rule that #98's splice
  had taken from the rewrite. No prose rule was lost to them.
- **The sample schema out of order** (s6 keytar) is a near-tie. The model wrote the dead-enemy push
  sentence as "attack the nearest tower", and its best part became the enemy-minion sentence, so it
  sits one place below the two-minions tower rule. Both rules attack the nearest tower, so the swap
  plays the same.
- **The two sample schemas missing a rule:**
  - s3 keytar never reached the order check. A guard tree, then shopping-list rules, used up its
    attempts. The last reply lacked the back-off, and coverage removed two partial rules with notes.
    That is develop's existing path.
  - s6 drums: the order check removed "gold ≥ 300 and an enemy bearbot visible" (id `shop_order`),
    which it could not place between the 300-gold and afford sentences. That is the brief's "else drop
    with a note".
- **One sample negation drop on a last attempt** was a genuine inversion: "are there **any** minions
  near?" for "none of my minions". It didn't ship, because the kept reply did.

**#98's table, v6 sample (6 runs):** every row p ≥ 0.07 against #98's v3. Back-off before recall is
17 of 18. 122 of 126 conditions are stated in full, none in part; the 4 not stated are s3 keytar's.
The batch is too small to show more than "no regression".

**Replays of the two fixes after c476d27**, on v5's and v6's 108 recorded compiles. Each reproduces every
shipped schema under the code that ran, and no replay needed an attempt the live run never made:
- b1fead0 (coverage tie-break, §11.1): 3 change, each now with the tower-fire rule. Hard-eco has every
  prose rule in 54 of 54.
- 69e0471 (the part's action, §8.2): no hard-eco or sample compile changes.

**Reference pilots** (§8): 0 guards written in 3 violin compiles. drums.md moved its recall to the
bottom in 3 of 3 (§8.1). keytar s3's basic attack was moved above Chord; that was fixed in 69e0471.

## 7. vocab-1's cap and violin.md

### 7.1 vocab-1 sends no reply cap

Ceryce's 17:59 ruling covers any token cap. #95 had left vocab-1's 1,800 in place, so that its
request stayed byte-identical to its recorded runs.
- It is now the recorded body less `num_predict`, and nothing added (not even `"truncate": false`).
  `test_llm_backends.test_vocab1_body_is_the_recorded_one_less_its_cap` builds the recorded body and
  deletes that one field.
- vocab-1's prompts and its golden (`tools/jev/testdata/vocab1_golden.json`, prompts only) are
  unchanged.
- **Not changed:** `ab_prompt_harness.py`'s 1,800 (it reproduces a recorded A/B exactly) and
  `model_server.py` / `ground_truth.py`'s 120 (the game's one-action reply). #95 left both on purpose.
  Neither is on the compile path.

### 7.2 violin.md scopes its opener under its verdict

The guards spec's worked tree (§3.2) puts Staccato and Solo under "you only take fights you can win".
That sentence ends its paragraph, and the Staccato/Solo paragraph never restated it, so #92's
guard-scope check rejected the spec's own example. Ceryce ruled (2026-10-02 17:59) to fix the prose.
- The paragraph now opens **"In a fight you can win, Staccato …"**. The verdict's prose is paragraphs
  {1, 2}, not {1}.
- "Between fights" and the recall paragraph stay outside. A recall rule inside the guard is still
  rejected (`test_violin_md_places_its_opener_under_its_verdict`).
- `expressibility.FILES`' hand segments follow the new wording.
- `test_compile` still reproduces the 09-23 violin transparency run byte for byte, except the one quoted
  line that changed, which it now names.
- **Live:** the 9B wrote **no guard** in 4 vocab-2 compiles of violin.md (#92: 0 of 8). The accepted tree
  is proven by the test, not by a live compile.

## 8. A rule the prose states nowhere

Batch v5's four violin.md compiles showed a defect in the check itself, on prose that is mostly not
conditional.
- **The bug.** violin.md's voice line "You are a bearbot on the violin. … you exist to end one enemy …"
  is a part of its own, and nearly every rule shares "enemy" and "bearbot" with it.
- **What it did.** In s1, the model's own "is an enemy bearbot within attack range? → attack" scored 0.61
  there and 0.44 elsewhere. The check moved it up to rule 2, above "wait until one enemy is isolated"
  and the Staccato opener. That is less faithful than the reply it corrected. In s3 and s4 it removed a
  rule on the same weak placement.
- **Where the genuine matches score.** Of the 2,778 rules that the batches' oracle ties to a sentence
  (hard-eco, sample entrant; #95's batches and this branch's), the lowest scored **0.88** (`score_dist.py`).
  Genuine violin.md matches scored 1.15–2.53.
- **The fix.** The order check judges a node only when its best part scores **0.8**. Negation
  attribution and `keeps_every_rule` keep the plain candidates.

**Measured, no model call:**
- the oracle agreement in §2 is unchanged (72 of 72; 281 of 283);
- batch v5's 72 compiles, replayed, ship exactly what they did;
- every committed schema's verdict is unchanged;
- violin.md, replayed:
  - s1 ships its first reply as written;
  - s3 and s4 keep the rule they lost;
  - s4 still moves "wait until one enemy is isolated" above the Staccato opener, which is a real
    prose-order fix.

### 8.1 drums.md: descriptive prose, where prose order may not be the priority order (needs a ruling)

drums.md is written as a character sketch. Its paragraphs are:
1. who you are;
2. "BE the fight";
3. Kick and Fill;
4. "Push the lane … Attack whatever's nearest and threatening an ally first …";
5. "**Retreat only when you're really hurt — below a quarter health** — because your whole reason for
   existing is to be the thing that's still standing …".

- **What happened.** In 3 of 3 batch-v6 compiles the model put the low-hp recall first, as a human
  reader would. The order check moved it to the bottom, to the paragraph that states it. There it sits
  below "push the lane" and the attacks, which nearly always fire. A drums bot compiled this way rarely
  retreats.
- **That is the brief's rule:** prose order, unless the prose explicitly reorders. "Only when" limits
  when to retreat, not where it ranks, and drums.md has no override words. The entrant sees "order:
  moved rule retreat_if_low_hp to where your prose states it … rewording the prose may help".
- **The ruling it needs.** A literal compiler that tells the entrant is defensible. But an entrant who
  writes like drums.md gets a bot that doesn't retreat, unless they read the note. Options:
  - keep it literal (this PR);
  - treat a low-hp retreat or recall as implicitly first, like override words;
  - judge order only for prose that states one ("first", "after that", "otherwise", numbered lists).

  Not changed here.

### 8.2 keytar.md: "attack range" is a distance

In batch v6 keytar s3, the model's "is a visible enemy bearbot or minion within attack range? → attack"
was moved above Chord. That goes against keytar.md's "Chord first, basic-attack second".
- **Why.** The check placed the rule at "If a visible enemy is inside your **attack range**, that is too
  close; … you should be leaving" (score 1.47). That part counted as naming the attack action, so it got
  no other-action discount.
- **Fix (69e0471).** A part's actions read "attack range" as a distance, and "leave/leaving",
  "retreat/retreating" and "walk/walks" as moves. That paragraph is now a move part. The basic attack
  scores 0.73 there, under the floor, and stays where the model put it.
- **Measured, no model call:**
  - §2's agreement is unchanged;
  - the floor still leaves every stated rule judged;
  - no hard-eco or sample compile changes;
  - every committed schema's verdict is unchanged;
  - of the reference-pilot compiles, only keytar s3 (fixed) and violin v6 s1 change. In violin s1 two
    rules of the same paragraph swap.
- Test: `test_attack_range_is_a_distance_not_the_attack`.

## 9. The committed schemas (item 4)

Every checked-in `prompts/pilots/*.schemas.json` with a prose file was run through all five vocab-2
checks: guard scope, identity, negation, clause coverage and order (`check_committed.py`).

| file | verdict |
|---|---|
| `house-easy-eco`, `house-medium-eco`, **`house-hard-eco`** (vocab-2) | all checks pass, unchanged |
| `house-easy`, `house-hard`, `sample-entrant`, `sample-entrant-eco` (vocab-1) | unchanged (vocab-1 is untouched) |
| `sample-entrant-pvp2`, `sample-entrant-siege` (vocab-2) | order: "afford → recall to shop" sits above the low-hp pair |

- **house-hard-eco** is still #88's splice. It keeps the prose's order and passes every check, so a
  recompile would only trade a known-good schema for a sampled one. #99 and #100 both add a base-tower
  sentence to `house-hard-eco.prose.md` and `house-medium-eco.prose.md` and change their schemas. A
  recompile of either belongs after they merge.
- **The two sample entrants** are not house tiers, and the swap plays the same:
  - the shop rule asks "no enemy in sight", which excludes the low-hp "enemy in sight → walk home"
    rule;
  - it shares its action, recall, with the low-hp "no enemy → recall" rule.

  `sample-entrant-siege` is also in #99/#100. Both are left for a recompile after those merge.

## 10. Cost and wall time

| per three-instrument compile | #95 | v4 | **v5** | **v6** |
|---|---:|---:|---:|---:|
| **hard-eco:** model calls, mean | 3.5 | 4.5 | **5.2** | **5.3** |
| hard-eco: tokens, median (max) | 18,783 (31,521) | 28,708 (39,290) | **27,430 (44,200)** | **26,966 (44,648)** |
| hard-eco: wall time, median (max) | 121 s (222) | 143 s (226) | **92 s (141)** | **85 s (143)** |
| **sample:** model calls, mean | 3.7 | 6.3 | **8.7** | **8.5** |
| sample: tokens, median (max) | 17,032 (26,426) | 30,585 (39,171) | **44,744 (45,395)** | **44,474 (45,042)** |
| sample: wall time, median (max) | 95 s (152) | 300 s (358) | **136 s (143)** | **130 s (139)** |
| wall per model call, median | 28–38 s | 26–44 s | **15–18 s** | **15–18 s** |

#98's v3 sample: 7.2 calls, 33,939 tokens, 132 s. The reference pilots compile in 9–24 s, in 1–3
calls.

- **Wall time follows the shared GPU.** It ran quiet for v5 and v6, at 15–18 s a call against
  26–44 s for earlier batches. Calls and tokens are the measure that doesn't depend on load.
- **Money:** $0 locally. On OpenRouter (≈$0.0006 per compile at develop's token counts) the sample
  entrant would be about $0.0015.
- **Why the sample entrant takes 3 attempts.** Traced per instrument (`sequences.py`), the usual
  sequence is:
  1. clause coverage rejects the first reply;
  2. the splice passes coverage, but keeps the first reply's order, so the order check rejects it;
  3. the whole rewrite passes, but loses or changes a rule against the kept reply, which ships
     reordered.
- **How often.** The order retry ran in 42 of 54 sample instrument compiles (v5: 27 of 36; v6: 15 of
  18), and the kept reply shipped in **36 of the 42**. In the other 6 the retry kept every action of
  the kept reply, in prose order, so it shipped the same rules. The third call never bought a better
  schema.
- **Not changed, needs a ruling.** When the kept reply's reorder is clean (nothing removed), skipping
  the order retry would save about one call per order-rejected instrument with no loss seen in these
  batches. The brief specifies a retry before the deterministic reorder, so it stays.

## 11. Beyond the brief, and follow-ups

### 11.1 #98's clause coverage lost the tower-fire rule (fixed, b1fead0)

- **What happened.** In 3 of 54 hard-eco compiles (v5 s11 violin, v6 s3 violin, v6 s6 keytar), #98's
  coverage removed a correct "will an enemy tower shoot this bearbot? → my own tower". It read the rule
  as half of the siege sentence ("inside an enemy tower's range and that tower has your own minions in
  its range to shoot first, attack …"), and spliced in the rewrite's siege rule.
- **No note.** The tower-fire sentence has one clause, so no "no rule states it" note fired, and the
  retreat shipped with no rule.
- **Cause.** The rule's criteria ("inside an enemy tower's range … no minions in range to block") share
  more words with the siege sentence. #98's tie-break went by word count.
- **Fix.** The tie now goes to the rule's own part of the prose when the order check's parts give it
  one (`_ProseUnits.own`, above the order floor). The parts weigh rare words more, and count a sentence
  naming another action ("attack") at half, as negation attribution already does. With no clear part,
  #98's word count decides as before.
- **Replayed coverage's removals on all 745 recorded replies: 26 change.**
  - 23 are false removals fixed:
    - the tower-fire rule;
    - "afford the next item and no enemy in sight → recall", which is the second hard-eco shopping
      sentence word for word.
  - 2 new removals merge two sentences ("one enemy dead and at least two minions → attack the tower").
  - 1 is arguable: "alone with no minions near → home" now reads as half of the back-off sentence,
    which says "alone".
- **End to end,** 3 of the 108 v5/v6 compiles change, all now with the tower-fire rule. Nothing else
  moves.
- Test: `test_the_tower_fire_rule_is_its_own_sentences_not_half_the_siege`, with the batch's exact rule.
  It fails without the fix.

### 11.2 Limits and follow-ups

1. **drums.md-style prose** (§8.1): prose order ranks a low-hp retreat last. Ruling needed.
2. **The order retry's cost** (§10): the kept reply shipped in 36 of 42 order retries. Ruling needed on
   skipping the retry when the reorder is clean.
3. **Known misses** (spec §8.15):
   - two rules whose sentences share a paragraph and every condition word but one (the low-hp
     move-home / recall pair) can swap unflagged. Their conditions exclude each other;
   - a rule the model rewrote across two sentences can be placed at a third, near-tie (v6 s6 keytar).
     Its swap plays the same.
4. **The order check's "else drop" can lose a mis-id'd rule.** v6 s6 drums lost "gold ≥ 300 and an enemy
   bearbot visible" (id `shop_order`), which it could not place. 1 of 54 sample instrument compiles. The
   entrant sees the `order: removed` note.
5. **Typed guards stay rare live.** 0 guards were written in 7 violin compiles. The guard-scope check and
   order inside branches are tested by replay and unit tests, not live.
6. **After merge:**
   - bump the entrants' `PROMPTLANE_REF`, because `translator.py` and `violin.md` change the compiler
     version;
   - recompile `house-hard-eco` and `house-medium-eco` after #99/#100 if their new prose wants it;
   - recompile `sample-entrant-pvp2` and `-siege`.

## Files

- **Translator:** `tools/jev/translator.py`.
  - New: `_ProseUnits`, `enforce_rule_order`, `RuleOrderError`, `_out_of_order`, `_Misplaced`,
    `keeps_every_rule`, `_actions_per_part`, `ORDER_NOTE_PREFIX`.
  - Also new: `_ORDER_STATED_FLOOR`, `_ProseUnits.placed`, and the part's action words
    (`_ACTION_WORDS`, "attack range").
  - Changed:
    - the negation reader (`_NEG_BEFORE`, `_UNCOUNTED`, `_negated`, `_negation_lost`);
    - #98's coverage tie-break (`_clause_dropped`'s `own_sentences`, from `enforce_clause_coverage`);
    - the attempt loop in `translate_pilot`.
- **Transparency:** `tools/jev/transparency.py` renders the "Rule order — what was moved or removed"
  section.
- **Request:** `tools/jev/llm_backends.py`, `ground_truth.py` and `compile.py` (vocab-1 sends no cap).
- **Prose:** `prompts/pilots/violin.md`, with `tools/jev/expressibility.py` following it.
- **Tests:**
  - `tools/jev/test_translator.py`: `RuleOrderTests`, using #95's exact replies in
    `testdata/rule_order.json`; plus negation, guard-scope and coverage additions;
  - `test_llm_backends.py`, `test_compile.py`.
- **Docs:**
  - `docs/vocabulary-spec.md`: §8.15 is new; §8.6, §8.10 and §8.11 are touched;
  - `docs/prose-to-schema-translator.md`, `docs/translator-guards-and-defaults-spec.md` §2.2,
    `docs/entrant-compile-preview.md`, `prompts/pilots/README.md`.
- **Data:** every compile run of both jobs' batches is on the
  [`data-vocab2-rule-order-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-rule-order-2026-10-02)
  prerelease. Each run has its report, schemas, stdout, replies and guard log. The analysis scripts
  are there too: `analyze.py`, `analyze_v5.py`, `replay_order*.py`, `replay_pilot.py`,
  `replay_dirs.py`, `replay_negation.py`, `polarity_snapshot.py`, `score_dist.py`, `sequences.py`,
  `tally_v5.py`, `check_committed.py`, `prompt_same.py`, `ab_retry.py`, `rec_verify.py`, and their
  outputs.
