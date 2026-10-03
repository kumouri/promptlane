# vocab-2: every condition of a sentence is in its rule, 2026-10-02

**Question.** #87's free recompiles of the sample entrant
([`runs/vocab2-negation-polarity-2026-10-02.md`](vocab2-negation-polarity-2026-10-02.md) §4) left two
items open:
1. "When I can afford my next item and no enemy is in sight, I head home to shop." lost its "no enemy
   in sight" clause in 20 of 35 compiles: "can this bot afford its next item? → go home". The bot leaves
   fights to shop.
2. Split into two rules, "no enemy in sight → go home" fires at the base too and can keep the bot there:
   1 of 35 in #87, 4 of 36 in #86.

PR #88's easy house tier uses the same sentence.
- **Ceryce's ruling (2026-10-02 15:14 CT, verbatim):** *"Do it for sure. The most important part of this
  whole thing is the translation from prose to Jev. It HAS to be right. Well, as right as we can get it
  🙃"*
  - Translation fidelity outranks compile speed and retry count. #92 recorded this as the
    translator's design priority (`docs/prose-to-schema-translator.md` §2). This PR quotes the ruling
    whole there, adds that a check's cost is measured and never traded away, and lists this guard
    under it.
  - The cost of the extra retries is measured here, not traded away.
- **Brief:** a clause-coverage check for vocab-2.
  - Every condition clause of a rule-bearing sentence must be in the rule that states it.
  - A split, or a dropped clause, is rejected and retried quoting only the prose.
  - On the last attempt the rule is dropped with a note.
  - Reuse #85–#87's machinery. Keep #86's and #87's guards as they are, and vocab-1 byte-identical.
- **Budget:** $0. Every compile ran on the local Ollama (`qwen3.5:9b`). No Jev call and no paid model
  call was made.

## Verdict

1. **Cause.** No step after the model checked that a rule asks every clause of its sentence.
   - `parse_schema` checks shape. The guards check scope, the shopping list, identity, polarity and
     priority.
   - The 9B's first reply drops or splits the afford sentence's enemy clause in **74 of 107**
     instrument compiles across this PR's three batches (69 %).
   - It does the same to "300 gold **and** an enemy bearbot is in sight" in about a third, and
     sometimes inverts that clause ("… and is **no** enemy in sight?").
   - On PR #88's easy prose it does worse. "When your hp is below 100 and …" became "hp below
     **100% of its max**" (true whenever the bot is hurt at all), or "hp below 100%?" alone as rule 1.
     That is a bot that goes home every time it takes a hit. 63 of 72 first replies in the final batch
     were rejected for it.
2. **Fix.** `translator.enforce_clause_coverage` (vocab-2 only) runs after the negation guard. It reads
   the conditions the prose states, and what each clause names: things with their polarity, concepts,
   and numbers with their unit (§2). It rejects a reply in which a rule states only part of a
   condition. It also rejects one in which a condition of two or more clauses has no rule at all.
3. **The retry had to be redesigned twice** (§3). Each design was measured on 24 free compiles.
   - **A plain rewrite (v1)** fixed the sentence but lost rules the first reply had right: the
     300-gold rule in 15 of 26 retried compiles.
   - **Showing the passing rules and asking to keep them (v2)** made the 9B copy them and leave the
     wanted rule out. The afford sentence had no rule at all in 16 of 35 compiles.
   - **The final design (v3)** asks for a plain rewrite quoting only the prose. From the reply, it
     splices *only* the rules for the wanted sentences into the rules that passed.
4. **Results, final design, develop's sample entrant** (12 free compiles, batch v3; §4):
   - **Dropped clause: 0 of 33** shipped (#87: 20 of 35).
   - **At-base split misfires: 0 of 33** (#87: 1 of 35; #86: 4 of 36).
   - The afford sentence is one faithful rule in **33 of 33** (#87: 11 of 35).
   - Of all 231 multi-clause conditions:
     - **229 are stated in full** (#87 v2: 207 of 245; develop with #89, run alongside: 102 of 126);
     - **none is stated only in part** (#87: 25; develop: 9; p < 0.001).
   - Nothing on #86's and #87's lists regressed: every p ≥ 0.19 against #87 batch v2.
5. **PR #88's easy prose** (12 compiles): **106 of 108 conditions stated in full, none in part.**
   Develop's translator, on the same hardware the same evening, managed 33 of 108 (72 in part); with
   #89, 21 of 54 (36 in part).
6. **Cost (§5).** About **1.7× the model calls** on the sample entrant: 7.2 a compile against 4.3 for
   develop with #89, and 34k tokens against 19k. On easy it is **1.9×**: 6.3 calls against 3.3. The
   largest run used 44,033 of the 60,000-token cap. Locally that is $0, about 30–80 s more a compile.
7. **Compile failures:** 3 of 36 sample instrument compiles in batch v3 (all violin, all a last reply
   cut off mid-JSON after a repair). That is against 1 of 36 for #87, p = 0.61.
   - The batches ran before #95 removed the 1,800-token reply cap, which is the likely cut.
   - The code now also handles it: an unreadable last repair reply ships the rules that passed, with a
     note. Replayed on the three, each would have shipped 9 rules and one "no rule states …" note.
   - Easy: 36 of 36 compiled.
8. **Rebased on develop e7714a9** (#90–#95: guard scope, no token caps, pvp-2), and confirmed live
   (batch v4, 6 + 6 compiles, §4.3):
   - **36 of 36 compiled.**
   - **All 126 sample and all 54 easy multi-clause conditions stated in full, none in part.**
   - Every checked-in vocab-2 schema passes the guard untouched: house easy, medium and hard, and the
     siege and pvp-2 entrants.
   - The branch was then rebased once more, onto 4c0bd26. #96 and #97 add a base tower and tower aggro,
     and change no translator code. It was re-checked at $0:
     - every Python suite passes;
     - the prompt (276 compared) and the other guards' results (1,344 compared) are identical to
       develop's;
     - the replay is unchanged, and the 15 checked-in schema sets are untouched.

## 1. What the translator wrote

The free compiles of this PR, and the 224 saved schemas of #84–#88 (`replay.py`), show these shapes. Each
condition below is a sentence of the prose with two or more clauses:

| shape | example | where |
|---|---|---|
| dropped clause | "can this bot afford its next item? → home" | #87 v2 20 of 35, every batch since #84 |
| split, "no" kept | "can … afford …? → home" + "is no enemy bearbot in sight? → home" | #86 B 4 of 36, #87 v2 1 of 35 |
| inverted clause | "300 gold **and is no** enemy bearbot in sight? → home" | 10 of 215 saved schemas |
| "or" between the clauses | "can … afford its next item **or** is it carrying more than 300 gold with an enemy bearbot in sight?" | #84 s3 drums |
| lost number | "is an enemy tower visible and are minions near this bot?" for "at least two of my minions" | 9 saved schemas |
| a share for an amount | "hp below **100% of its max**" for "hp below 100" | develop's easy compiles, nearly every one |
| half of a sentence that reads like another | "is an enemy minion, enemy tower or enemy bearbot in sight? → home" | develop easy f1 drums |
| no rule at all | the 300-gold sentence missing | 12 of 35 in #87 v2 |

## 2. The check

`translator.enforce_clause_coverage`; the full rules are in `docs/vocabulary-spec.md` §8.11.
- **What a sentence states.** "if"/"when"/"whenever" up to the consequence. That is ", move back home",
  ", I head home", " I go home", "then", or the end. The condition splits at "and" and at commas. A
  piece with no verb joins the next one as a list of alternatives ("an enemy minion, enemy tower or enemy
  bearbot is in sight").
- **What a clause names:**
  - **Things, with their polarity.** These come from #87's reader, called with wider word lists:
    - "outside" negates;
    - "your tower" is the bot's own;
    - "dead" is a concept, not "no enemy";
    - a "no" carries along a list.

    #87's guard keeps its own lists: 672 of its results, and #89's, compared identical to develop's.
  - **Concepts:** hp, gold, afford, ready, dead, time, the fight verdict, the Bandstand, contested.
  - **Numbers, with their unit.** "half"/"50%" and "a third"/"33%" are shares of the maximum, and a plain
    number is an amount.
- **Holding a rule to a condition.** Each "or" alternative of the question is held to the condition
  whose requirements it meets the most of. Guard questions above it count. A tie goes to the rule's own
  sentence, matched by words, action and target. "Otherwise I walk with my nearest minion, and if I have
  no minions near me I go home" also states "my minions are near me", for the walk.
- **Replay** (`replay.py`, `replay_v8.out`, over 224 saved schemas):
  - Dropped: every shape in §1 and 3 rules the prose never states ("do we spend our gold before
    risking it?", "gold greater than 0 and at its base?").
  - Not dropped: no correct rule, and no rule of #88's checked-in easy, hard or siege schemas (27
    instrument schemas).
  - Wrongly read along the way, and fixed before any batch counted:
    - "the third tower" read as a third;
    - a fallback's "walk with my minion";
    - #88 siege's "to shoot first";
    - after the rebase, the pvp-2 entrant's ", I teleport to …" and "one of the bot's towers". A
      consequence now starts at any ", I/we/you …" that isn't a state ("I can", "I'm"). "The bot's
      tower" is the bot's own unless an enemy word precedes it.

## 3. The retry: three designs, measured

Every design quotes only the prose sentence and its clauses, never a rule. #86 and #87 found the 9B copies
what it is shown. When a number is missing, one more line says a plain number is an amount.

| batch (12 sample + 12 easy) | retry | sample: conditions stated in full | afford sentence, no rule | 300-gold rule kept on retry |
|---|---|---:|---:|---:|
| v1 (code 00ee5d3) | plain rewrite | 212 of 245 | 7 of 35 | 11 of 26 |
| v2 (5f4d1a1) | rewrite, shown the passing rules | 221 of 245 | 16 of 35 | 28 of 24 |
| **v3 (01d06ee)** | **rewrite; splice in only the wanted rules** | **229 of 231** | **0 of 33** | **31 of 27** |

("kept on retry" counts the 300-gold rule in the final schema against the first reply. v2 and v3 add
one where the first reply had none.)
- **v1.** The rewrite fixed the afford sentence (18 of 28 "afford only → joint") but rewrote the rest.
  Retried schemas shrank from 313 to 268 rules. "No minions near me → go home" went from 10 to 0.
  #87's retries did the same, too rarely to show: gold 5 → 1 of 8.
- **v2.** Shown its passing rules and asked to keep them and add the wanted one, the 9B kept them, and
  in 10 of 35 left the wanted one out on both retries ("afford only → none → none").
- **v3.**
  - The reply is a plain rewrite. Only its rules that ask *all* of a wanted condition are used
    (`translator._spliced`).
  - A rule that failed is replaced where it stood. A missing condition goes where the prose's order puts
    it.
  - Every other rule stays exactly as it passed.
  - A rejection by any other guard still rewrites whole, as before.
  - Before batch v3, the splice was replayed on batch v1's real second replies
    (`simulate_splice.py`):
    - 20 of 24 sample retries passed, against 6 for the rewrites as they were;
    - easy, 23 of 23 against 14;
    - conditions stated in full rose from 148 to 163 of 168.

## 4. The free recompiles

Pre-registered (`preregistration.txt`, 20:35 UTC, before any compile) for the first design. The design
changed twice after its batch (§3). Each change is its own batch, and each is reported whole. Commands:
`python tools/jev/compile.py <prose> --vocab vocab-2 --economy eco-3-late --backend ollama`, through
`run_compile_any.py`, which only records what each guard saw on each attempt. Each batch ran from a
frozen `git archive` of its commit. The sample prose is byte for byte #85–#87's. Easy is PR #88's
`house-easy-eco.prose.md` at 500d5a9 (now on develop). The develop baselines ran on the same machine
the same evening: develop 304336c (with #89) interleaved with batch v2, and 16a8c7a before it.

### 4.1 Sample entrant, batch v3

p is two-sided Fisher (`compare.py`, `compare.out`), against #87 batch v2, the pre-registered
baseline:

| (instrument compiles) | #86 B | #87 v2 | develop 304336c | **this PR (v3)** | p vs #87 v2 |
|---|---:|---:|---:|---:|---:|
| compiled | 36 of 36 | 35 of 36 | 18 of 18 | **33 of 36** | 0.61 |
| **afford sentence: clause dropped** | 25 | 20 | 9 of 18 | **0** | < 0.001 |
| **afford sentence: split** | 5 | 1 | 0 | **0** | 1.00 |
| afford sentence as one faithful rule | 3 | 11 | 5 of 18 | **33** | < 0.001 |
| 300-gold sentence as one faithful rule | 30 | 23 | 14 of 18 | **31** | 0.006 |
| **conditions stated only in part** | 35 of 252 | 25 of 245 | 9 of 126 | **0 of 231** | < 0.001 |
| conditions stated in full | 204 of 252 | 207 of 245 | 102 of 126 | **229 of 231** | < 0.001 |
| inverted negation shipped | 1 | 0 | 0 | 0 | 1.00 |
| `build` = the instrument's own list | 36 | 34 | 18 | 33 | 1.00 |
| parking rule | 0 | 0 | 0 | 0 | 1.00 |
| recall present / gated / in tower range | 33 / 33 / 0 | 35 / 35 / 0 | 17 / 17 / 0 | 33 / 33 / 0 | 1.00 |
| back off present | 32 | 33 | 14 | 33 | 0.49 |
| back off before recall | 25 | 24 | 12 | 23 | 1.00 |
| home: 300 gold / afford next item / no minions | 30 / 33 / 12 | 27 / 32 / 14 | 14 / 14 / 5 | 30 / 32 / 11 | ≥ 0.19 |
| model calls per compile run, mean | 3.6 | 4.7 | 4.3 | 7.2 | |

- **What the guard did.**
  - It rejected the first reply of 34 of the 36 instrument compiles, 24 of them for the afford
    sentence and 13 for the 300-gold sentence.
  - 31 then compiled with every rule faithful. Nothing reached the last-attempt drop.
  - Two shipped with a "no rule states …" note.
- **The 3 failures** were all violin: c9, c10 and c11. Each was a repair whose last reply was cut off
  mid-JSON ("unbalanced JSON object"), while it was re-writing a "Violin:" identity rule at length. See
  the verdict item 7 for the fix.
- Batches v1, v2 and v4 are in `tally.out`, whole. v1 is the data for §3's rule loss. v2 also had 0
  conditions stated in part, but 16 afford sentences with no rule.

### 4.2 PR #88's easy prose, batch v3

| conditions stated in full (of compiles) | develop 16a8c7a | develop 304336c | **this PR (v3)** |
|---|---:|---:|---:|
| "your hp is below 100" & an enemy minion, enemy tower or enemy bearbot in sight | 1 of 36 | 2 of 18 | **35 of 36** |
| "your hp is below 100" & no enemy in sight | 1 of 36 | 2 of 18 | **36 of 36** |
| "you can afford the next item …" & no enemy in sight | 31 of 36 | 17 of 18 | **35 of 36** |
| **stated only in part** | 72 of 108 | 36 of 54 | **0 of 108** |
| compiled | 36 of 36 | 18 of 18 | 36 of 36 |

### 4.3 Confirmation on the rebased code, batch v4

Code f8be8e6 = develop e7714a9 (#90–#95) + this PR, 6 sample + 6 easy compiles, interleaved:

| | sample entrant | easy |
|---|---:|---:|
| compiled | **18 of 18** | **18 of 18** |
| conditions stated in full / in part | **126 of 126 / 0** | **54 of 54 / 0** |
| afford sentence as one faithful rule | 18 of 18 | 18 of 18 |
| 300-gold sentence as one faithful rule | 18 of 18 | |
| first reply rejected, then compiled faithfully | 17 of 18 | 17 of 18 |
| last-attempt drops or "no rule states" notes | 0 | 0 |
| model calls / tokens per compile run, median | 6.5 / 32,511 | 6 / 27,207 |
| wall time per run, median | 227 s | 177 s |

Back off before recall was 14 of 18, recall gated 18 of 18 and parking 0.

**PR #88's easy schemas are still correct.** The checked-in schemas pass this guard untouched (fixture
test). Develop's recompiles of the same prose would mostly not: "hp below 100% of its max".

## 5. Cost

| per compile run (three instruments) | develop 304336c | this PR (v3) | ratio |
|---|---:|---:|---:|
| sample entrant: model calls, mean | 4.3 | 7.2 | 1.7× |
| sample entrant: tokens, median (max) | 19,476 (24,688) | 33,939 (44,033) | 1.7× |
| sample entrant: wall time, median | 105 s | 132 s | |
| easy: model calls, mean | 3.3 | 6.3 | 1.9× |
| easy: tokens, median (max) | 13,304 (18,058) | 27,308 (32,114) | 2.1× |
| easy: wall time, median | 55 s | 82 s | |

- **Per instrument compile**, the sample entrant takes 2.3 attempts on average (36 compiles: 1 attempt
  in 1, 2 in 24, 3 in 11), against 1.3 for develop.
- **Wall time is noisy.** The GPU was shared with other sessions' batches all evening, and per call it
  ran from 13 to 32 s across batches. Calls and tokens are the measure that doesn't depend on load.
- **Money:** $0 locally. On the OpenRouter backend (≈$0.0006 a three-instrument compile at develop's
  token count), this is about $0.001.
- **Token cap:** the batches before the rebase ran under the 60,000-token cap: the largest used
  44,033, and none hit it. #95 has since removed every cap. A compile is now bounded by wall clock: 900
  s in the arena, against this PR's slowest run of 461 s (v1, contended GPU) and 292 s in v4.
- **Batch v4's wall time** (35 s a call) is the uncapped code on a GPU shared with other sessions'
  batches. Its calls and tokens match batch v3's.

## 6. Limits and follow-ups (not fixed here)

1. **One condition per Jev question.** TypeSafe's docs ask for one condition per `noul`, combined in
   code ([Noul](https://docs.typesafe.ai/primitives/noul.md): "Ask two Nouls and combine them in code").
   The schema has no AND node, so this guard keeps a conjunction in one question. An AND node of atomic
   questions is the follow-up that would match the docs. It needs a schema format change and a Jev
   check.
2. **#87's reader reads "outside an enemy tower's range" as inside it.** A correct recall rule worded
   that way would be rejected by the negation guard. It never happened in 224 saved schemas or these
   batches. Left as is, per the brief; the coverage reader handles it.
3. **The concept lists are fixed words.**
   - "gold greater than or equal to its next item's cost" is an afford rule but reads as gold. It was
     still removed (it dropped the enemy clause), but the note named the 300-gold sentence (c11).
   - "one of theirs is dead" written as "an **allied** bearbot dead" is not caught: whose bearbot is
     not read.
   - "enemy" and "enemy bearbot" are one thing to this check.
4. **Made-up conditions on an unconditional sentence** are dropped on the last attempt, with a note
   that names the nearest condition. Example: easy's fallback written as "no enemy bearbot or minion in
   sight → hold at my tower". The default plays the fallback anyway.
5. **After merge:** the compiler version changes (`translator.py` is in `COMPILER_FILES`), so ladder
   prompts compile again. Bump the entrants' `PROMPTLANE_REF`.

## Files

- **Translator:** `tools/jev/translator.py`.
  - The new functions are `enforce_clause_coverage`, `_condition_units`, `_clauses`,
    `_condition_text`, `_facts`, `_numbers`, `_asked_of`, `_clause_dropped`, `_Repair`, `_spliced`
    and `_own_sentence`. `_own_sentence` is factored out of #87's `_negation_lost`, unchanged in
    behaviour.
  - Also changed: the repair loop in `translate_pilot`; the "Conditions" section of `render_markdown`;
    and `_polarities`, which now takes optional word lists (its defaults unchanged).
- **Transparency report:** `tools/jev/transparency.py`, the same section.
- **Tests:** `tools/jev/test_translator.py` `ClauseCoverageTests` (the exact failing schemas, in
  `tools/jev/testdata/clause_coverage.json`), `tools/jev/test_transparency.py`.
- **Docs:** `docs/vocabulary-spec.md` §8.11, and `docs/prose-to-schema-translator.md` §2 (the design
  priority, with this guard listed under it, and a paragraph).
- **Data:** every compile run of the four batches and both develop baselines is on the
  [`data-vocab2-clause-coverage-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-clause-coverage-2026-10-02)
  prerelease, with the analysis scripts and their outputs. Each run has its report, schemas, stdout and
  guard log. The scripts are `tally.py`, `compare.py`, `afford_path.py`, `simulate_splice.py`,
  `fallback_c9_c11.py`, `replay.py`, `same_as_develop.py`, `make_fixture.py`, and #84's and #87's
  `order.py`, `survey.py` and `fisher.py` unchanged.
