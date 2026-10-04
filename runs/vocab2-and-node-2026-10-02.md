# vocab-2: the AND node, one Jev question per condition, 2026-10-02

**Question.** PR #98 (merged 87eaf87) made every vocab-2 rule state every condition its sentence states,
but in ONE Jev question: "can this bot afford its next item and is no enemy in sight?". TypeSafe's
[Noul](https://docs.typesafe.ai/primitives/noul.md) page says: *"Ask one yes/no question per Noul. If a
question has two conditions, such as 'Is the customer angry and asking for a refund?', the model has to
judge both at once and the value means less. Ask two Nouls and combine them in code."*
- **Ceryce, 2026-10-02 21:58 CT:** "Build it." That is the AND node #98 §6 left open.
- **Standing rulings:** translation fidelity first (15:14, "It HAS to be right"); no token caps (17:59).
- **Budget:** $0 first. Then one pre-registered Jev block, hard stop **$2.00**, with its plan committed before
  the first paid call. It was: §J below, committed and pushed as 37225d7 before any paid call.

## Verdict

1. **Built, vocab-2 only.** A rule may ask `"all"`: one Jev question per condition, combined in code. It
   fires only when every question passes the single-question threshold (`noul > 0.5`). The probabilities
   are not multiplied. Everything is still one Jev call per decision. vocab-1 is unchanged.
2. **The AND rules come from code, not from the 9B.** The clause-coverage guard splits a faithful rule's
   "A and B" question into an AND rule, at no model cost.
   - **Asking the 9B for `"all"` cost fidelity** (batch A1, §2). On the sample entrant, 7 of 63 conditions
     had no rule, against develop's 0 of 126 (p = 0.0004). Its own AND questions turned a "not" positive.
   - **So the prompt and the retry stay #98's, byte for byte.** 324 prompts were compared to develop's, and
     none differ.
3. **Free recompiles, final code** (9992d9e; 12 compiles each of the sample entrant, easy and hard-eco;
   §3):
   - **Multi-condition sentences shipped as AND rules:** sample **252 of 252**, easy **107 of 108**, hard
     **212 of 216**. The 4 in hard state their third condition in a parenthesis, with no "and" to cut at.
   - **Clause coverage:** stated in full in **252/252, 107/108 and 252/252**, and **0 in part**. That is
     against #98's 355/357 and 160/162, and develop's 126/126, 54/54 and 252/252.
   - **No regression** on #98's list: every p ≥ 0.27. The one p < 0.05 is "back off before recall", 33 of
     36 against #98's 37 of 51, which is higher.
   - **Model calls per compile:** 6.17 / 6.50 / 4.33, against develop's 6.67 / 6.17 / 4.33 the same evening.
     The split costs no call.
4. **J1, on Jev: the split answers better** ($0.2834; §4). The 9B's own 56 compound wordings were set
   against the code's split of the same words, on 476 replayed game states with the truth read off the
   sim: 23,124 pairs.
   - **Accuracy:** split **99.5 %**, compound **98.8 %**. McNemar p ≈ 8 × 10⁻⁴¹; difference +0.67 points,
     CI +0.53 to +0.81.
   - **False fires: 58 against 208**, all in the near misses, where exactly one condition fails.
5. **J2, on Jev: play isn't worse** ($0.9754; §5). This was the siege entrant's checked-in schemas as
   compiled, against the same schemas split, each vs house medium, 4 matches an arm. No pre-registered
   flag fired. Results were 1–0–3 (AND) and 2–0–2 (compound); 4 matches can't rank the arms.
   - **The split rules fired with their condition false 4 times of 998, against 62 of 963 compound.**
   - **Most of the compound's were its shop rule:** violin went home to buy an item it could not afford 46
     times. Split, never.
   - **Fires when the condition held:** 99.3 % against 99.5 %. The split cost no firing.
6. **Old logs replay:** #90's 24 Jev logs and every J2 log replay-verify on this branch, and
   `test_vocab.mjs` replays every checked-in log. **Spend: $1.2588 of $2.00** on Jev, and $0 for the
   compiles.

## 1. What was built

The full rules are in `docs/vocabulary-spec.md` §8.13, and the schema shape is in
`docs/translator-guards-and-defaults-spec.md` §2.2.

- **The schema.** A vocab-2 rule may carry `"all"`: two or more one-condition questions, each with its own
  criteria, in place of its own `condition`.
  - `compile.py` writes `"all"` and no `"condition"`, so an older reader fails loudly (a 400) instead of
    asking the questions joined.
  - A guard still asks one question.
  - vocab-1 never reads `"all"`.
- **Evaluation** (`fidelity_harness.run_prediction`, so the schema server and the practice match).
  - Every question of the tree is in the decision's one Jev call, an AND rule's as `<rule>.1`, `<rule>.2`, ….
  - Each passes or fails at the single question's `noul > 0.5`. The rule matches only when all of them pass.
  - **The probabilities are not multiplied.** TypeSafe's docs threshold each Noul in code ("Handling
    multiple Noul answers in code"). A product would set a stricter bar the more conditions a sentence
    has.
  - Verified against the live docs: TypeSafe's API takes many questions per request and answers each one
    independently (`/api`, "Ask multiple questions together").
- **Where the AND rules come from.** The clause-coverage guard (#98) splits a faithful rule's "A and B"
  question into an AND rule, at no model cost (`translator._split_compound`).
  - It cuts at an "and" only where each piece asks exactly one condition, and the pieces together ask
    every clause.
  - "The same tower" stays one question.
  - The guard holds every rule clause by clause: one question must ask all of a clause.
  - The prompt and the retry are #98's, byte for byte, so the 9B's job is exactly what #98 measured (§2).
- **Guards kept.** Shopping (#86), negation (#87), identity (#89), guard scope (#92), clause coverage
  (#98), instrument scope and the priority guard all run. An AND rule's questions are read joined, as a
  compound question was. Identity takes out a question that only asks "is this bot the keytar?" in the
  keytar schema: it is always yes, and it gets a note.
- **Rendering.** The quick view and the headings show the questions joined by a bold **and**. "What Jev
  is asked" lists each one with its yes/no. The arena's compile panel and the entrants' PR bot render the
  same markdown, and the evolve brief lists the questions joined by AND.

## 2. How it got there: three designs, each measured at $0

| design | code | what happened |
|---|---|---|
| prompt asks for `"all"`; a retry for a compound question | (pilot, unfrozen) | The 9B wrote **no** AND rule in 9 replies, retries included. Every compound shipped on the last attempt, at 9 model calls a compile. |
| prompt names `"all"` in the condition line, an example and the JSON skeleton; deterministic split as backstop | b39b40c, then b48b6d7 (batch **A1**) | The 9B wrote AND rules, but **lost fidelity**: 7 of 42 sample conditions and 3 of 42 hard conditions had no rule, against 0 of 42 each for develop the same evening (§3). Its own AND questions turned a "not" positive ("is this bot inside an enemy tower's range?" for "I'm not inside"), and its retries, asked for `"all"`, came back without the afford or 300-gold sentence. |
| **prompt and retry = #98's; the AND rules come from the split** | **9992d9e** (batch **A'**) | The 9B writes "A and B" as #98 measured. The split turns it into an AND rule. Replayed on #98's 103 shipped schemas: 515 of 515 multi-condition sentences become AND rules, no rule lost. |

- **The split's first version cut only at "and is/are/…".** Easy's first compile (ae1, b39b40c) shipped 2
  of 9 conditions as "… below 100 and no enemy is in sight?". From b48b6d7 on, every "and" is a candidate
  cut, and a list ("minion, tower, and bearbot") is never cut.
- **Batch A1 was stopped** after 9 finished compiles. It is kept whole as design history
  (`runs/aborted-b48b6d7/` in the data). Both amendments are in the pre-registration, written before any
  run of the code they name.
- **J1 and J2 ran on b48b6d7.** Its split and its evaluation are byte-identical to 9992d9e's. The only
  difference is the prompt text and the retry wording (`git diff b48b6d7 9992d9e`). Both blocks use
  checked-in or #98-shipped schemas and never compile.

## 3. The free recompiles

- **Pre-registered** (`preregistration.txt`, 03:30 UTC, before any batch compile), with two amendments and
  a count correction, each before any run of the code it names.
- **Command:** #98's, plus `--format json`. That is `python tools/jev/compile.py <prose> --vocab vocab-2
  --economy eco-3-late --backend ollama`, run through `run_compile_and.py`, which only records what each
  guard saw. The model is `qwen3.5:9b` on the host Ollama 0.35.0, on two lanes and a GPU shared with other
  sessions.
- **Baselines:**
  - **#98's own batches v3 + v4**, from its data release: 18 compiles each of the sample entrant and easy.
  - **Develop 87eaf87, the same evening, interleaved:** 6 sample, 6 easy, and 12 hard-eco, which #98 never
    ran.
- **One scorer for all of them** (`tally_and.py`). It reads every schema with this PR's reader, clause by
  clause, which for #98's one-question rules is #98's own tally exactly. It reproduces #98's figures: 355
  of 357 and 160 of 162.

### 3.1 Final code (9992d9e), batch A'

| sample entrant (instrument compiles) | #98 v3 + v4 | develop 87eaf87 | **this PR** | p vs #98 | p vs develop |
|---|---:|---:|---:|---:|---:|
| compiled | 51 of 54 | 18 of 18 | **36 of 36** | 0.27 | 1.00 |
| **multi-condition sentences as AND rules** | 0 of 357 | 0 of 126 | **252 of 252** | < 10⁻¹⁰⁰ | < 10⁻¹⁰⁰ |
| conditions stated in full | 355 of 357 | 126 of 126 | **252 of 252** | 0.51 | 1.00 |
| conditions stated only in part | 0 | 0 | **0** | 1.00 | 1.00 |
| AND rules the 9B wrote itself (first reply) | 0 | 0 | 0 | | |
| afford sentence as one faithful rule (#87's classifier) | 50 | 18 | **36** | 1.00 | 1.00 |
| inverted negation shipped | 0 | 0 | 0 | 1.00 | 1.00 |
| `build` = the instrument's own list | 51 | 18 | 36 | 1.00 | 1.00 |
| parking rule | 0 | 0 | 0 | 1.00 | 1.00 |
| recall present / gated / under a tower | 51 / 51 / 0 | 18 / 18 / 0 | 36 / 36 / 0 | 1.00 | 1.00 |
| back off present | 51 | 18 | 36 | 1.00 | 1.00 |
| back off before recall | 37 | 15 | **33** | **0.031** (higher) | 0.39 |
| home: 300 gold / afford next item / no minions | 48 / 50 / 15 | 18 / 18 / 8 | 36 / 36 / 13 | ≥ 0.26 | ≥ 0.57 |
| model calls per compile run, mean | 6.94 | 6.67 | **6.17** | | |
| compile tokens per run, median (max) | 33,939 (44,033) | 32,032 (63,004) | **29,574 (34,912)** | | |

| easy | #98 v3 + v4 | develop 87eaf87 | **this PR** | p vs #98 | p vs develop |
|---|---:|---:|---:|---:|---:|
| compiled | 54 of 54 | 18 of 18 | **36 of 36** | 1.00 | 1.00 |
| **multi-condition sentences as AND rules** | 0 of 162 | 0 of 54 | **107 of 108** | < 10⁻⁷⁰ | < 10⁻⁴⁰ |
| conditions stated in full / in part | 160 / 0 of 162 | 54 / 0 of 54 | **107 / 0 of 108** | 1.00 | 1.00 |
| model calls per compile run, mean | 6.28 | 6.17 | 6.50 | | |
| compile tokens per run, median | 27,261 | 27,228 | 27,286 | | |

| hard-eco | develop 87eaf87 | **this PR** | p |
|---|---:|---:|---:|
| compiled | 36 of 36 | **36 of 36** | 1.00 |
| **multi-condition sentences as AND rules** | 0 of 216 | **212 of 216** | < 10⁻¹²⁰ |
| conditions stated in full / in part | 252 / 0 of 252 | **252 / 0 of 252** | 1.00 |
| the 480 s rule / the weakened-tower rule / the siege rule | 36 / 36 / 36 | 36 / 36 / 36 | 1.00 |
| model calls per compile run, mean | 4.33 | 4.33 | |
| compile tokens per run, median | 21,750 | 21,433 | |

- **The 9B wrote no AND rule itself** (the prompt doesn't ask). The guard split 257, 107 and 223 rules.
  Each of the 36 hard compiles also kept the siege condition ("inside an enemy tower's range and THAT
  tower has your own minions in its range") as one question. That is one condition about one tower, by
  design (§1).
- **The 4 hard sentences not split.** They are all "can this bearbot afford the next item … and is an
  enemy minion or enemy tower in sight (no enemy bearbots)?". The third condition sits in a parenthesis
  with no "and" to cut at. Their rule is faithful, and ships as one question.
- **Easy's one condition not stated in full.** In be9 violin, "hp below **100% of max** and no enemy
  entities in sight" lost its number on every attempt, and #98's guard dropped it with a note. It is the
  same shape #98 caught.
- **Wall time per run (median)** was 278 s sample, 253 s easy and 219 s hard. Develop ran 290 / 236 / 228 s
  on the same lanes. The arena's compile clock is 900 s; the slowest run here was 579 s.

### 3.2 Batch A1 (b48b6d7, the prompt asking for `"all"`): stopped, reported whole

| | develop, same evening | A1 |
|---|---:|---:|
| sample: conditions stated in full | 126 of 126 | **56 of 63** (p = 0.0004) |
| sample: afford rule / 300-gold rule shipped (of instrument compiles) | 18 / 18 of 18 | **6 / 6 of 9** |
| sample: recall present | 18 of 18 | 8 of 9 |
| hard: conditions stated in full | 252 of 252 | **39 of 42** (p = 0.003) |
| easy: conditions stated in full | 54 of 54 | 27 of 27 |

The 9B wrote AND rules here, so the fidelity loss came from the 9B, not the split. Its own questions
asked "is this bot inside an enemy tower's range?" for "I'm not inside". Its retries, asked for `"all"`,
came back without the afford and 300-gold sentences. The batch stopped after 8 compiles, and amendment 2
moved the design to §3.1.

## 4. J1: compound vs split, on Jev ($0.2834)

The block ran as written in §J1. It covered 476 states, 56 wordings and 20 conditions: **23,124
(state, wording) pairs**. Every answer came from `jev-1.13.0` over TypeSafe, on 6,748,708 input tokens.
The $0 stub run had estimated $0.154; TypeSafe counts more tokens per request than our estimator does.

| (state, wording) pairs | n | compound right | split right | compound-only right | split-only right | McNemar p |
|---|---:|---:|---:|---:|---:|---:|
| **all** | 23,124 | 98.8 % | **99.5 %** | 5 | 159 | 8 × 10⁻⁴¹ |
| condition holds | 2,689 | 97.4 % | 97.5 % | 0 | 4 | 0.13 |
| **near miss** (one condition fails) | 11,553 | 98.2 % | **99.5 %** | 5 | 155 | 1 × 10⁻³⁹ |
| other | 8,882 | 100 % | 100 % | 0 | 0 | 1 |

- **Split minus compound: +0.67 points**, with a 95 % cluster-bootstrap CI (by state) of +0.53 to +0.81.
- **False fires** (the rule fires when it shouldn't): **58 split, against 208 compound**, of 20,435.
  Misses were about the same: 67 against 71 of 2,689.
- **Every gain is a near miss**, where exactly one condition fails. That is the docs' case: *"the model has
  to judge both at once and the value means less."*
- **The largest single case is the sample entrant's back-off,** "I can see an enemy tower and none of my
  minions are near me": **136 of 975 false fires as one question, 8 split.**
  - In the two most frequent wordings, "is an enemy tower visible AND are none of this bot's minions near
    **it**?", the compound's "it" can read as the tower. Asked alone, "are none of this bot's minions near
    it?" has only the bot to mean.
  - The split also mends that pronoun, as well as the joint judgment.
- **The result doesn't hang on that one sentence.** Without it, split is still right more often: 31 pairs
  against 5, p = 1.3 × 10⁻⁵. False fires are 50 against 72.
- **Each piece against its own condition:** 99.3 % right (47,333 of 47,676).
- **Brier score of the compound `noul`** against the truth is 0.0114. As a diagnostic only, the product of
  the pieces scores 0.0086 and their minimum 0.0092. The schema server uses neither, only each piece
  thresholded on its own.
- No condition is worse split at p < 0.05. The one cell leaning the other way is "my hp is below half of
  my max and an enemy … is in sight": 3 compound-only right, 0 split-only, p = 0.25.

## 5. J2: the siege entrant vs medium, compound vs AND ($0.9754)

The block ran as written in §J2. All 8 matches ran in plan order, 4 at a time, from 03:47:37 to 03:56:46
UTC. There were 11,926 requests to the private server, with **0 errors and 0 failovers**. Nothing was
retried, added or dropped, and **all 8 logs replay-verify**. Every match ended in sudden death.

| per arm (4 matches) | C: compound (checked in) | A: AND |
|---|---:|---:|
| entrant W–D–L | 2–0–2 | 1–0–3 |
| entrant deaths / medium deaths | 9 / 15 | 11 / 14 |
| enemy towers taken / own towers lost | 2 / 2 | 1 / 3 |
| decisions (move / attack / recall) | 47.5 / 37.5 / 15.0 % | 48.5 / 38.0 / 13.5 % |
| parse / call errors | 0 / 0 | 0 / 0 |
| **split rules: fired with their condition FALSE** | **62 of 963 (6.4 %)** | **4 of 998 (0.4 %)** |
| split rules: condition true, it or a rule above fired | 960 of 965 (99.5 %) | 1,041 of 1,048 (99.3 %) |

- **The pre-registered flags didn't fire.** A lost one match more than C (the flag is two). Every split rule
  fired in A: the fewest was drums' shop, 5 against 9. Neither arm had errors.
- **4 matches an arm can't rank the arms.** Jev is not deterministic, and every match was decided in
  sudden death. What the logs can show is whether each rule fired when its sentence held. Every
  decision's observation was replayed through the sim (`fire_obs.mjs`) and checked with J1's oracles
  (`fire_truth.py`).
- **Arm C's false fires are its shop rule:** "can this bot afford its next item and is no enemy in sight?".
  - Violin fired it 73 times. 48 of those were wrong, and **46 of the 48 were a bot that could not afford
    its next item** but saw no enemy.
  - Keytar fired it 39 times, 14 of them wrong.
  - Each time, the bot went home to buy something it could not pay for.
  - Split, the same rule fired 16 and 30 times, never wrong.
- **The AND arm lost no firing it should have made.** When a split rule's condition held, it (or a rule
  above it) fired 99.3 % of the time, against 99.5 % for C.

## 6. Cost

| | spend | what |
|---|---:|---|
| the free recompiles (A', A1, develop, pilots) | **$0** | local Ollama |
| J1 | **$0.2834** | 476 states, each state's questions in calls of at most 40, 6,748,708 input tokens; its $0.30 cap never stopped it |
| J2 | **$0.9754** | 11,926 requests on the private :8987 server (`--budget-usd 1.60`); the $1.50 runner stop never fired |
| **Jev total** | **$1.2588 of $2.00** | |

- **Per compile,** the split costs no model call. The final code averaged 6.17, 6.50 and 4.33 calls per
  compile run, against develop's 6.67, 6.17 and 4.33 (§3.1).
- **Per decision,** an AND rule adds one more question to the same Jev call, about 40 input tokens.
  J2's two arms shared one server, so its ledger has no per-arm split: $0.122 a match over all 8.
- **The $0 stub estimated J1 at $0.154,** about half the real $0.2834. `client.estimate_request_tokens`
  counts fewer input tokens than TypeSafe bills, so a budget projected from a stub run should be about
  doubled.

## 7. Limits and follow-ups

1. **The checked-in schemas are not recompiled.** The house tiers and the siege and pvp-2 entrants still
   ask compound questions, and they play as they were compiled.
   - J2 found the siege entrant's compound shop rule false-firing in 62 of its fires, the bot going home
     unable to buy.
   - Running `enforce_clause_coverage` over a checked-in schema splits it with nothing else changed
     (`make_and_schemas.py` did this for J2, asserted).
   - Whether to regenerate the house tiers' schemas, which the ladder plays, is Ceryce's call.
2. **A third condition in a parenthesis is not split** (4 of 216 hard sentences). A partial split ("can
   afford" + "an enemy minion or tower in sight (no enemy bearbots)") would still ask fewer things at once.
   It would break "one piece per condition", so it was left alone.
3. **The rule-order job** (`fix/vocab2-rule-order`) was not pushed while this ran. It is on e7714a9,
   before #96–#98. Its commits touch `translate_pilot`, `_negation_lost` and the retry loop, so whichever
   lands second rebases. Its order check reads a rule's text, and an AND rule's questions joined read the
   same as the compound question it was split from.
4. **After merge:**
   - Restart any running `schema_server.py`. An older one answers a schema with `"all"` with a 400, and the
     match holds that bot. That is loud by design.
   - The compiler version changes (`translator.py` is in `COMPILER_FILES`), so bump the entrants'
     `PROMPTLANE_REF`.
5. **J1's truth is the sim's, read off the description's own facts.** "I can see an enemy tower" left out
   the states where a tower is listed between 260 and 390 units. "Right next to me" had no exact truth, so
   drums' kick sentence was not measured.
6. **J2 is 4 matches an arm.** It shows the rules fire when their sentence holds. It does not show which
   arm wins more.

## Files

- **Code:**
  - `tools/jev/translator.py`: `Question`, `TranslatedRule.all_of`, `rule_questions`, `schema_questions`,
    `node_answers` and `display_condition`. The split is `_split_compound`, `_split_question`,
    `_clause_groups`, `_rejoined` and `_as_rule`. The clause-by-clause reader is `_alternatives`, `_whole`,
    `_tally` and `_alt_covers`. Identity's `_without_own_instrument` is new too.
  - Also changed: `tools/jev/compile.py` (the JSON), `fidelity_harness.run_prediction`, `schema_server.py`
    (docs only), `transparency.py`, `backend_parity.py` and `tools/evolve/generation.mjs`.
- **Tests:** `tools/jev/test_and_node.py` (28). #98's coverage tests accept a faithful rule split into its
  own pieces (`assertKeptAsAsked`). `tools/evolve/test_evolve.mjs` has one more. Suites: tools 772, arena
  148, match 223, evolve 40, generation and acceptance, all passing.
- **Docs:**
  - `docs/vocabulary-spec.md` §8.13 (new), with §8.11's retry and closing lines corrected;
  - `docs/translator-guards-and-defaults-spec.md` §2.2;
  - `docs/prose-to-schema-translator.md` §2;
  - `docs/entrant-compile-preview.md`;
  - `docs/translator-transparency.md`.
- **Data:** the
  [`data-vocab2-and-node-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-and-node-2026-10-02)
  prerelease. It holds:
  - every compile run: A', A1, the aborted b39b40c start, develop and the pilots, each with its schemas,
    report, stdout and guard log;
  - the pre-registration with its amendments;
  - the scripts and outputs: `tally_and.py`, `replay_split.py` and `same_prompt.py`;
  - J1's inputs and every answer;
  - J2's 8 logs and 4 smoke logs, with `fire_obs.mjs` and `fire_truth.py`.

  #90's logs and #98's runs are on their own prereleases.

## J. The Jev block (pre-registered, committed before its first paid call)

Two parts, on Jev (`jev-latest` over TypeSafe direct). The spend caps sum to under $2.00:
- **J1** (answer accuracy) stops itself at **$0.30**. Its $0 stub run estimates $0.154.
- **J2** (matches) runs on a server with `--budget-usd 1.60`, and its runner stops launching at **$1.50**.
  #90's identical lines cost about $0.115 a match, so the 8 matches should come to about $0.95.

Code: `feat/vocab2-and-node` b48b6d7, frozen by `git archive`. Scripts, inputs and logs go on the
`data-vocab2-and-node-2026-10-02` prerelease.

### J1. Compound vs split, on real game states, truth from the sim

- **States.** I replayed #90's 24 Jev-played matches (`data-siege-fact-medium-bar-2026-10-02`; easy,
  medium, hard and the siege entrant, Jam lines) through the unchanged sim. That gave every bot's
  observation every 10 s: 7,028 states. All 24 logs replay on this branch.
  - For each condition: up to 10 states where it holds, 10 near misses (exactly one of its conditions
    fails) and 5 others.
  - The draw is seeded (20261003). The union is 476 states.
- **Wordings.** These are the 9B's own words: every multi-condition rule asked as one compound question in:
  - #98's shipped schemas (batches v3 + v4: sample entrant and easy);
  - the checked-in vocab-2 schemas (house easy, medium and hard-eco; the siege and pvp-2 entrants).

  That gives up to 3 wordings per condition, the most frequent first: **56 wordings of 20 conditions**. Each
  wording's **split** is the code's own (`translator._split_question`): the same words, one question per
  condition. A wording with no split, or a clause no oracle reads, is left out. "Kick is ready and an enemy
  bearbot is right next to me" is out because "right next to" has no exact truth.
- **Truth.** Read off the observation the description is written from:
  - afford = gold ≥ the next item's cost;
  - "in sight" = the sim's 260-unit vision, which the description lists as "Enemies within 260 units";
  - "near me" = the description's "Minions within 260 units", counting yours;
  - "inside an enemy tower's range" = `vocab.tower_facts`;
  - hp, gold, cooldowns and the match clock exactly;
  - "one of theirs is dead" = an enemy bearbot respawning.

  "I can see an enemy tower" is left out of a state that has no enemy tower within 260 but lists one out to
  390, since either reading is fair there.
- **Calls.** One Jev call per state per chunk of at most 40 questions, about an arena request's size. A
  wording's compound question and its pieces always share a call. That is safe because Jev answers each
  question on its own ([primitives](https://docs.typesafe.ai/primitives.md), "Ask multiple questions
  together").
- **Decision.**
  - A compound question fires when `noul > 0.5`.
  - A split fires when **every** piece's `noul > 0.5`: the same rule the schema server uses (§8.13).
  - Each is scored against the truth.
- **Primary outcome:** decision accuracy, compound vs split, over (state, wording) pairs, with a two-sided
  exact McNemar test on the discordant pairs. As a robustness check, a 95 % CI on the accuracy difference
  from a cluster bootstrap by state (2,000 resamples, seed 20261003).
- **Also reported:**
  - accuracy per condition, and in each stratum (holds / near miss / other);
  - false fires (the decision says yes where the truth says no) and misses;
  - each piece's accuracy against its own condition;
  - the Brier score of the compound `noul` against the truth.

  No threshold is tuned on these data.

### J2. Does play get worse? The siege entrant vs medium

- **Arms.** These are the same compile in two forms:
  - **C** = `prompts/pilots/sample-entrant-siege.schemas.json` as checked in (vocab-2, sha256 `0a4ee060…`,
    #90's "entrant3").
  - **A** = the same schemas through b48b6d7's `enforce_clause_coverage` (`make_and_schemas.py`, sha256
    `a7339fd0…`).

  It is asserted that A has the same nodes in order, the same actions, notes and build, and that only 4
  rules per instrument are split (shop, both low-hp retreats, the 480 s tower rule). The siege rule ("inside
  an enemy tower's range and that tower has your own minions") stays one question in both arms.
- **Opponent:** house medium, `prompts/pilots/house-medium-eco.schemas.json` as checked in, the same in
  both arms.
- **Lines:** #90's exactly: `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall recall-2
  --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`, the full 600 s.
- **Sample:** seeds 3 and 7, both sides, so 4 matches an arm and 8 in all. The plan order interleaves C and
  A, and runs 4 at a time on one private schema server on :8987.
  - A match that crashes is retried once (#90's runner).
  - Nothing is added or replayed after a result is seen.
- **Smoke, free:** `--stub` on :8988, 120 s at seed 7, each arm both sides. All 4 played with 0 errors and
  replay-verify. The A logs carry the split rules' answers as `<rule>.1` and `<rule>.2`.
- **Reported, per arm:**
  - the results and the Jam score;
  - the entrant's deaths, structure damage and enemy towers taken;
  - its decisions by kind;
  - how often each split rule fired (`reply.rule`);
  - server errors, parse errors and failovers;
  - spend from the server's ledger.

  Every log is replay-verified.
- **Flags** (investigated, not a pass/fail on 4 matches; Jev is not deterministic, PR #37):
  - A loses 2 or more matches more than C;
  - a split rule fires 0 times in A while it fires 5 or more times in C (summed over the arm);
  - any error in A that C doesn't have.
