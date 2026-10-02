# vocab-2: a negated clause keeps its "no", 2026-10-02

**Question.** #86's free recompiles of the sample entrant
([`runs/vocab2-shopping-not-rules-2026-10-02.md`](vocab2-shopping-not-rules-2026-10-02.md) §4.1)
found the sentence "When I can afford my next item and no enemy is in sight, I head home to shop."
sometimes compiled as "is there any enemy within 260 units? → go home". That rule sends the bot home
*because* it sees an enemy.
- **Queued as a bug (Margo, under Ceryce's standing rule):** fix it so negated conditions ("no enemy in
  sight", "none of my minions near me", "not under a tower") compile with the right polarity.
  - Prefer a deterministic check against the prose to prompt changes.
  - Never alter a correctly negated rule.
  - vocab-1 stays byte-identical.
- **Budget:** $0. Every compile ran on the local Ollama (`qwen3.5:9b`). No Jev call and no paid model
  call was made.

## Verdict

1. **The negation is lost only when the sentence is split.** The translator writes the sentence as two
   rules: "can this bot afford its next item? → home", then a rule for "no enemy is in sight" → home.
   The second rule is where the "no" goes missing. 11 of the 139 saved vocab-2 schemas of the sample
   entrant have it (#84 2, #85 7 + 1 in a variant, #86 1). Each one asks "is there any enemy …?" (§1).
2. **#86's "5 of 36" counted splits, not inversions.** Only 1 of those 5 rules lost the "no". The other
   4 asked "is no enemy bearbot in sight?". In #85, 7 of 9 lost it.
3. **Cause.** The model still means "no enemy". Its id for the rule says so: `shop_no_enemy`,
   `no_enemy_sight_shop`. The "no" is lost when the clause is rewritten as a question in the terms of
   the facts list, which states the enemies "within 260 units" as a positive list. Every condition
   example in the prompt is a presence check, and none is negated. The criteria are written from the
   question, so they agree with it ("true: at least one enemy visible"). Nothing after the model reads
   the prose's "no": `parse_schema` checks shape, and the other guards check scope, the shopping list
   and priority.
4. **Fix, vocab-2 only.** `translator.enforce_negation` runs after the shopping-list guard and before
   the priority guard. A rule whose question asks only that a thing IS there is rejected when either:
   - the prose sentence the rule states says it is NOT, or
   - the rule's own id does, and a sentence of the prose does too.

   The retry quotes the prose's negated clause and its sentence. On the last attempt the rule is dropped
   with a `negation:` note instead, so the instrument still compiles. A question that keeps its "no" is
   never touched. The prompt is unchanged: 36 prompts, both vocabularies, are byte-identical to develop's
   (`prompt_same.out`).
5. **On develop's sample entrant, 12 free compiles (batch v2):**
   - **0 inverted rules shipped in 35** (#85 7 of 35, #86 1 of 36).
   - The guard caught an inversion on the first reply in 8 instrument compiles, and all 8 then compiled
     correctly. No rule had to be dropped.
   - Nothing on #86's list moved (every p ≥ 0.24).
   - One drums compile failed on an existing parse error (`guard_spend_gold: invalid action kind None`)
     before any guard ran.

## 1. What the translator wrote

`find_inverted.py` and `survey.py` read every saved vocab-2 schema of the sample entrant's final prose.
That is #84's and #85's final batches and variant 3s, and #86's batches A and B: 139 schemas. In the
three final batches, the afford sentence compiled in one of five ways:

| afford sentence compiled as | #84 final | #85 final | #86 B |
|---|---:|---:|---:|
| one rule, afford **and** no enemy | 4 | 1 | 3 |
| afford only: the enemy clause dropped | 27 | 25 | 25 |
| split, and the second rule keeps its "no" | 0 | 2 | 4 |
| **split, and the second rule lost its "no"** | **2** | **7** | **1** |
| no afford rule | 2 | 0 | 3 |

Every inverted rule is the second half of a split, with a move home:

| where | id | question |
|---|---|---|
| #85 s1, s3 violin | `shop_no_enemy` | is there any enemy within 260 units? |
| #85 s10 violin, s8 keytar | `shop_no_enemy` | is there any enemy bearbot within 260 units? |
| #85 s11 keytar | `no_enemy_sight_shop` | are there any enemies within 260 units? |
| #85 s12 drums | `no_enemy_sight_shop` | are there any enemies in sight? |
| #85 s7 violin | `shop_no_enemy` | is there an enemy bearbot in sight? |
| #85 variant 3 s3 drums | `no_enemies_sight` | is there any enemy within 260 units? |
| #84 s1 drums, #86 s4 drums | `shop_no_enemy` | is there any enemy bearbot in sight? |
| #84 s2 drums | `no_enemy_sight_shop` | is there any enemy within 260 units? |

The other negated clauses of this prose kept their polarity in every saved schema. "None of my
minions are near me" (back off), "I'm not inside an enemy tower's range" (recall) and "if I have no
minions near me I go home" all did.

**The wording "within 260 units" leans toward the inversion, but this isn't shown.** 7 of the 11
inverted questions use it, against 1 of the 6 split questions that kept the "no" (Fisher p ≈ 0.13).
That is the facts line's own phrase ("every enemy within 260 units …").

## 2. The fix

`enforce_negation` reads each rule's question for the things it names: an enemy, an enemy tower, my
own tower, an enemy minion, my minions, a teammate. For each one, it records whether the question asks
that the thing is there or is not.
- A "no", "not", "none", "zero", "never", "can't" or "fewer" up to four words before the thing negates
  it. So does "absent", "gone", "dead", "zero" or "out (of sight)" up to three words after it.
- Neither may cross "and", "or", "if" or punctuation.
- "Enemy tower" and "enemy minion" are their own things, apart from "enemy". "My own tower" is apart
  from an enemy tower.

A rule whose question names a thing only as there is wrong when either of these says it is not:
- **Its sentence.** That is the prose sentence sharing the most words with the rule (id and target
  included), at least two, with no other sentence tying it. This path stays quiet in two cases:
  - The sentence names the thing both ways ("walk with my nearest minion, and if I have no minions …").
  - Another sentence names the thing as there and gives the rule words of its own. #84 s3's merged
    "afford my next item OR 300 gold with an enemy bearbot in sight" took its enemy from the 300-gold
    sentence.
- **Its id**, counting only a negation before the thing ("shop_no_enemy"; "push_wave_dead_enemy" is a
  dead enemy, not a dead wave), **and** a prose sentence that says the thing is not there. The sentence
  quoted is the one sharing the most words with the rule.

Replayed over all 139 saved schemas, plus the repo's 12 house-tier and sample-entrant schemas
(`check_saved.out`), it rejects exactly the 11 inverted rules and nothing else:
- None of the 6 split rules that kept their "no" is rejected.
- None of the 15 joint rules, and none of the 90 afford-only compiles, is rejected.
- The id path alone catches all 11. The sentence path alone catches 5 (`which_path_sentence_only.out`).
  The others tie between the afford sentence and the 300-gold sentence ("an enemy bearbot is in sight
  … I go home").
- The first draft rejected 2 more, both correct rules. In `push_wave_dead_enemy`, "wave dead" was read
  as "no minions". The other was #84 s3's merged rule. Both have tests now.

**What happens on a hit.**
- On attempts 1 and 2, `translate_pilot` retries with *rule shop_no_enemy lost a "no" the prose states:
  the prose says "no enemy is in sight", and the rule must fire only then. Keep its no/not/none in the
  question, and write one rule for the whole sentence: "When I can afford my next item and no enemy is
  in sight, I head home to shop."*
- On the last attempt the rule is dropped. The note reads `negation: removed rule …`, and the compile
  preview and the transparency report show it under "Negations — what was removed". If nothing would be
  left at the root, it raises.

**The first retry message backfired (batch v1).** It quoted the wrong question: *rule shop_no_enemy
asks 'is there any enemy bearbot in sight?', whether an enemy IS there, but the prose says it is NOT
…*. In batch v1, 3 of the 8 retries after a rejection were rejected again. All 3 contained the quoted
question word for word, for example "can this bot afford its next item and is there any enemy bearbot
in sight?" (`retries-v1.out`). In s9 keytar this happened on all three attempts, and keytar did not
compile. This is #86's lesson again: don't put the wrong output in front of the model. The message now
quotes only the prose. Batch v2 had 2 rejected retries, neither of them a copy (`retries-v2.out`).

**Tests** (`test_translator.py` `NegatedClauseKeepsItsNoTests`, 13 tests) use develop's exact sample
prose and ten schemas verbatim from #84's, #85's and #86's zips (`tools/jev/testdata/negation_rules.json`):
- **Rejected, with the sentence quoted and the wrong question never quoted:** the four shapes of the
  inverted rule.
- **Returned untouched:**
  - the split rules that kept their "no", and a joint rule;
  - #84 s3's merged rule and `push_wave_dead_enemy`;
  - a clean compile;
  - six correctly negated wordings ("are all enemies out of sight?", "is the count of visible enemies zero?", …).
- **Synthetic cases:**
  - a split recall that lost "not inside an enemy tower's range" is rejected with no id help;
  - "none of my minions" keeps its "none";
  - a sentence naming minions both ways decides nothing;
  - an id saying "no" with no prose "no" is left alone.
- **In `translate_pilot`:** a retry that is fixed keeps the fixed reply, and three bad replies end in a
  drop with a note rather than a failure.
- **vocab-1** is untouched.

`test_transparency.py` checks that the note gets its own section.

## 3. The free recompiles

Pre-registered (`preregistration.txt`, 18:58 UTC, before any compile). The addendum (19:24 UTC) is from
before batch v2, and a correction line follows it. Command: `python tools/jev/compile.py
prompts/pilots/sample-entrant-eco.prose.md --vocab vocab-2 --economy eco-3-late --backend ollama`.
It ran through `run_compile.py`, which only records what the shopping and negation guards saw on each
attempt. The code is develop after #86 plus this branch. The prose is byte for byte the prose #85 and
#86 compiled. Each run took 49 to 206 s.

### 3.1 Batch v2 (what ships), 12 samples

Classified by #84's `order.py` and #86's `tally.py` checks, unchanged, plus `survey.py`'s afford
classifier (`tally-v2.out`). p is two-sided Fisher against #86 batch B (`fisher.out`).

| (instrument compiles) | #85 | #86 B | **this branch** | p vs #86 B |
|---|---:|---:|---:|---:|
| compiled | 35 of 36 | 36 of 36 | **35 of 36** | 1.00 |
| **inverted negation shipped** | **7** | **1** | **0** | 1.00 |
| `build` = the instrument's own list | 33 | 36 | 34 | 0.49 |
| parking rule | 3 | 0 | 0 | 1.00 |
| recall present / gated / in tower range | 34 / 34 / 0 | 33 / 33 / 0 | 35 / 35 / 0 | 0.24 |
| back off present | 31 | 32 | 33 | 0.67 |
| back off before recall | 29 | 25 | 24 | 1.00 |
| home: 300 gold / afford next item / no minions | 30 / 33 / 9 | 30 / 33 / 12 | 27 / 32 / 14 | ≥ 0.56 |
| afford sentence as one rule (afford **and** no enemy) | 1 | 3 | **11** | 0.018 |
| afford sentence split, "no" kept | 2 | 4 | 1 | 0.36 |
| afford only (enemy clause dropped) | 25 | 25 | 20 | |
| whole draws passing #84's screen | 5 of 12 | 4 of 12 | 5 of 12 (s2, s7, s8, s11, s12) | |
| model calls per run, median | 3 | 3 | 5 | |
| compile tokens per run, median | 14,233 | 14,324 | 24,096 | |

**The guard caught 8 compiles and dropped nothing.**
- On the first reply it saw, the guard rejected an inversion in 8 instrument compiles: s3, s4, s9 keytar;
  s5, s7, s9 violin; s7, s11 drums.
- 6 compiled correctly on the first retry. s3 keytar and s7 violin took two retries, because the
  second reply was "is there an enemy bearbot or tower within 260 units?".
- No rule reached the last-attempt drop.

**More joint rules** (3 → 11, p = 0.018). The retry asks for "one rule for the whole sentence", and
the retries wrote the afford rule with both clauses.

**The one failure** is s1 drums. All three replies named a plain rule `guard_spend_gold` with no action
kind. That fails in `parse_schema`, before any guard runs. It is the class the existing "guard_" retry
line already addresses, and #85 had one like it (s4 violin, unbalanced JSON).

**Cost.** The extra calls cost no money here. On the OpenRouter backend they would be about $0.0005 a
compile. The largest run used 31,054 tokens of the 60,000-token compile cap.

### 3.2 How often the 9B inverts it before any guard

The guard's log gives the rate on the first reply it saw. It was 6 of 30 instrument compiles in batch v1
and 8 of 35 in batch v2, so **14 of 65 (22 %)**. #85 shipped 7 of 35 (20 %, p = 1.00). #86 B's 1 of 36
was a low draw (p = 0.017 against 14 of 65). Without this guard, about one instrument compile in five
of this prose would play the inverted rule.

### 3.3 Batch v1 (first retry message, no drop), 10 samples

Reported whole in `tally-v1.out`:
- 0 inverted rules shipped in 29.
- The guard rejected 9 replies across 6 instrument compiles.
- s9 keytar failed to compile after three rejected replies, each copying the quoted question (§2).
- s11 began while `translator.py` was being edited for v2. It loaded the new translator under the old
  recording wrapper, crashed on a `TypeError`, and is not counted. It is in the zip as
  `invalid/s11-mixed-code`.

## 4. Still open (not fixed)

1. **The afford sentence still loses its enemy clause in most compiles.** "Can this bot afford its
   next item? → home", with no "no enemy in sight", was 20 of 35 here and 25 of 36 in #86 B. It goes
   home to shop in the middle of a fight. The polarity is not wrong; the clause is missing.
2. **A split that keeps its "no" still plays as an OR.** "Is no enemy bearbot in sight? → home",
   placed below "can afford → home", fires whenever nothing is visible. That includes standing at the
   base, so it can hold the bot there. It was 1 of 35 here and 4 of 36 in #86 B. The brief said never
   to alter a correctly negated rule, so this branch leaves it alone. A check that a rule covers every
   clause of its sentence would fix both 1 and 2. It would need a ruling, because it would retry most
   compiles (item 1).
3. **New this batch: "is this bot's instrument 'Violin'? → hold" as rule 1.** It is always true for
   the violin, so the violin would hold all match. It appeared in s1, s4 and s12 violin, all on the
   first reply, from develop's prompt byte for byte. That is 3 of 35, and 0 in the 147
   earlier schemas of this prose (#84's, #85's and #86's batches, and batch v1).
   Its id is `shop_order_violin`: the "Violin:" label of the shopping line became a question. #86's
   shopping guard misses it because the question names no item and no base. This branch didn't cause
   it, and its frequency here may be sampling. It needs its own fix.
4. **`build` missing with no shopping rule** (#86's open item 2): once here, in s3 violin.
5. **After merge**, the compiler version changes (`translator.py` is in `COMPILER_FILES`), so ladder
   prompts compile again. Bump the entrants' `PROMPTLANE_REF`.

## Files

- **Translator:** `tools/jev/translator.py`. It adds `enforce_negation`, `_negation_lost`,
  `_polarities` and `_negated_clause`, with its hook in `translate_pilot` and the "Negations" section
  of `render_markdown`.
- **Transparency report:** `tools/jev/transparency.py`, the same section.
- **Tests:** `tools/jev/test_translator.py`, `tools/jev/test_transparency.py` and
  `tools/jev/testdata/negation_rules.json`.
- **Docs:** `docs/vocabulary-spec.md` §8.6, and a paragraph in `docs/prose-to-schema-translator.md`.
- **Data:** all 22 compile runs are on the
  [`data-vocab2-negation-polarity-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-negation-polarity-2026-10-02)
  prerelease, as `vocab2-negation-polarity-2026-10-02-compiles.zip` (0.26 MB, sha256
  `6a0c4b06038afcde1c01edcfd4aac37cdd05900efa73dd04cce70022abe9d6a5`). Each run has its report,
  schemas, stdout and guard log. The zip also holds the set-aside s11, `preregistration.txt`,
  `run_compile.py`, `compile_batch.sh` and the analysis scripts with their outputs. The scripts are
  `tally.py` (with #84's `order.py`), `survey.py`, `retries.py`, `fisher.py`, `check_saved.py`,
  `find_inverted.py`, `prompt_same.py` and `make_fixture.py`.
