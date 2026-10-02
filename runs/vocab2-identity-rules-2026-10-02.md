# vocab-2: identity-only rules and unfinished guards, 2026-10-02

**Question.** #87's free recompiles of the sample entrant
([`runs/vocab2-negation-polarity-2026-10-02.md`](vocab2-negation-polarity-2026-10-02.md) §4, on
#87's branch) found two translator bugs it did not cause:
1. **An identity rule.** "is this bot's instrument 'Violin'? → hold" came back as rule 1 in s1, s4
   and s12 violin. That is 3 of 35 compiles, each on the first reply, with develop's prompt.
2. **A parse failure.** s1 drums failed all three replies on `rule guard_spend_gold: invalid action
   kind None`, before any check ran.

- **Queued as bug fixes (Margo, under Ceryce's standing rule).**
  - Catch the identity rule deterministically after the model. Its retry quotes only the prose
    sentence, and the last attempt drops the rule with a note.
  - Diagnose the parse failure. Repair it if the intent is unambiguous, otherwise reject and retry.
  - Don't alter #86's or #87's guards. vocab-1 stays byte-identical. Change the prompt only with
    evidence.
- **Budget:** $0. Every compile ran on the local Ollama (`qwen3.5:9b`). No Jev call and no paid model
  call was made.

## Verdict

1. **Identity rules.** The facts list states "this bearbot's team, instrument, …", and neither changes
   during a match. So "is this bot's instrument 'Violin'?" has one answer all match, and the violin
   holds on every decision. The model turned the "Violin:" label of the shopping line into a
   question.
   - `translator.enforce_identity_rules` rejects a rule whose question asks about **nothing but**
     this bearbot's own instrument or team. The retry quotes the line it came from, and the last
     attempt drops the rule with an `identity:` note.
   - **0 shipped in 36** (#87: 3 of 35). It caught 2 first replies, and both compiled correctly
     after one retry.
2. **The parse failure is an unfinished guard.** The 9B writes a node with a condition and both a
   `then` and an `else` branch, but no `"type": "guard"` and no action. As a plain rule it fails
   `invalid action kind None`. Develop's retry tells it to "finish the guard shape", which the reply
   already has.
3. **Completing the type was tried first, and it is not safe.** A guard sends every decision into one
   of its two branches, so no rule after it is ever checked.
   - Completed guards shipped in **3 of the first 12** instrument compiles of the first batch.
   - s2 keytar's guard was rule 1, with `push_lane` as the default of both branches. That keytar
     would never recall and never fight (§2.2).
   - On develop these replies are retried, and the retry usually comes back flat.
4. **Fix: `translator.enforce_finished_guards`.** It rejects the reply before parsing. The retry asks
   for plain rules and leaves out develop's "finish the guard shape" line. On the last attempt the
   node is dropped, branches and all, with an `unfinished guard:` note.
   - **Retry A/B, 24 replies each:** develop's message got an unfinished guard back **8 times**, and
     this one **0 times** (p = 0.004).
   - Develop's message also got back one typed guard, which would ship as a guard tree. This one got
     none.
5. **On develop's sample entrant, 12 free compiles (this branch merged with #87's head):**
   - **36 of 36 compiled** (#87: 35 of 36).
   - **0 identity rules shipped**, and **0 guard trees shipped**.
   - Nothing on #86's or #87's list moved: every p ≥ 0.37.
   - Model calls per run: median **4** (#87: 5).
6. **The prompt is unchanged:** 12 of 12 prompts, both vocabularies, are byte-identical to develop's.
   vocab-1 returns from both checks untouched.

## 1. Identity rules

All three come from #87's batch v2, on the first reply, with `"action": {"kind": "hold"}` and id
`shop_order_violin`. In two of them, the shopping guard also dropped "is this bot's instrument
'Violin' and can it afford an Amp?" per item. The identity-only rule was left, because it names no
item and no base.

`_identity_only(condition)` takes the condition's words and removes filler: "is", "this", "bot",
"bearbot", "its", "the", "a", "on", "play", "which", "what" and the like. What is left must be only:
- instrument words: "instrument", "keytar", "violin", "drum(s)";
- team words: "team", "violet", "green".

Any other word makes it a real question:
- "Is an enemy violin in sight?" has "enemy" and "sight".
- "Is this bot's side stronger in the fight near it?" has "side", "stronger" and "fight".
- "Is this bot on its team's side?" has "side", which is position.
- "Is this bot's instrument the violin and can it afford an Amp?" has "afford" and "amp".

**Replay with no model call** (`replay_identity.out`): the check runs over all 269 saved vocab-2
schemas in #84's, #85's, #86's and #87's zips. It rejects exactly the three #87 violin compiles and
nothing else.

**The retry message.** It quotes the prose line, never the question (#87's lesson: the 9B copies a
quoted question back):

> rule shop_order_violin asks only about this bearbot's own instrument, which never changes during a
> match, so it would fire on every decision or on none. Remove that rule and keep the others. It came
> from the prose line "Our shopping lists, in order: Violin: Amp, then Bass Strings, then Road
> Case.": the label before the colon only says which instrument the line is for, and its items belong
> in the top-level "build" list.

**Retry check** (`retry-check.jsonl`): the s1 violin first reply, followed by this message, was fed to
the 9B 20 times.
- Every reply parsed.
- No reply had an identity-only rule, any rule naming the instrument, or the message's own words.
- Every reply had `build` = Amp → Bass Strings → Road Case.
- 19 of 20 passed every check. The 20th was caught by #87's negation guard, the usual retry.

## 2. Unfinished guards

### 2.1 What the 9B writes

#87 did not save s1 drums's replies. This branch recorded every reply of 40 free drums compiles on a
frozen copy of develop (`repro-drums/`, `repro-drums-first.out`):
- 3 of 64 first replies had an unfinished guard at the root.
- 3 more were cut off mid-JSON while writing a `guard_` node: unbalanced JSON, a different failure
  that this branch leaves alone.

The failing shape is always the same: an id like `guard_shop_or_fight`, a condition, criteria, and
`then`/`else` branch objects. Some of these nest more of the same inside a branch. There is no
`"type"` and no `"action"` (`tools/jev/testdata/identity_rules.json` → `replies`).

**Develop's retry can't fix it.** The retry reads "rule guard_shop_or_fight: invalid action kind
None. If this mentions a 'guard_'-named rule, you emitted a plain rule action for something that
needed the full guard shape (type/then/else) -- either finish the guard shape or use a normal rule
instead." The shape it asks for is already there. In repro s6 the retry wrote the same unfinished
guard again. Only the third reply was flat.

**The guards spec saw this before.** In 2026-09 it measured "`guard_`-named, no action kind" failures
on `violin.md` and added the retry line above
(`docs/translator-guards-and-defaults-spec.md` §7).

### 2.2 Completing the type (tried, then withdrawn)

The first version of this branch added the missing `"type": "guard"` before parsing. Its first batch
(`verify-v1-complete/`, stopped after 4 samples) shows why that is wrong:
- 4 of 12 first replies had an unfinished guard: keytar s2 and s4, violin s2 and s3. Completed, 3 of
  them shipped as guard trees.
- **s2 keytar.** Rule 1 asked "can this bot afford its next item right now?". Its yes-branch went home
  only if "no enemy bearbot is in sight", and its no-branch only when carrying over 300 gold with an
  enemy in sight. Both branches default to `push_lane`. A guard always routes, so the eight rules
  below it never run: tower back-off, recall, chord, the bounty hunt, the pushes. That keytar never
  recalls and never fights.
- **s2 violin.** The guard was rule 2. Everything after it (recall, staccato, shopping) never runs.

The intent ("this is a guard") is unambiguous, but the guard it completes is not what the prose says.
So the fix rejects instead.

### 2.3 The fix and its retry

`enforce_finished_guards` reads the raw reply before `parse_schema`. A node with both branch objects,
no `"type"` and no action kind, anywhere in the tree, is rejected. The retry is:

> node guard_shop_or_fight has "then" and "else" branches but no "action", so it is neither a rule
> nor a guard. A guard would send every decision into one of its two branches, and no rule after it
> would ever be checked: write plain rules instead, each with its own "action", in the order the
> prose gives them.

The retry leaves out develop's generic guard line, because that line is the instruction the reply had
already followed. The message quotes the node's id, never its condition. On the last attempt the node
is dropped with its branches, with an `unfinished guard:` note. If nothing would be left at the root,
it still raises.

A node with only one branch, a `"type"` of its own, or an action kind is not touched. It goes on to
`parse_schema` and fails or passes as before.

**Retry A/B** (`ab_guard_retry.py`, `ab-guard-retry.out`): three recorded first replies (repro s6's
two drums replies and v1 s2 keytar). For each, 8 retries with develop's message (A) and 8 with this
branch's (B), interleaved. The table counts the replies:

| (24 replies per arm) | A, develop | B, this branch | p |
|---|---:|---:|---:|
| **unfinished guard again** | **8** | **0** | 0.004 |
| typed guard (would ship as a guard tree) | 1 | 0 | 1.00 |
| unparseable (cut off) | 2 | 0 | 0.49 |
| passes every check, flat | 13 | 18 | 0.23 |

B's other 6 misses are all on the keytar reply. In each, #86's shopping guard caught a "Metronome
first" rule, which is the normal next retry.

## 3. The free recompiles

Pre-registered (`preregistration.txt`, about 20:00 UTC, before any verification compile). The
retry-message checks and the switch from completing to rejecting came after it; §2.2 says why.

- **Command:** `compile.py prompts/pilots/sample-entrant-eco.prose.md --vocab vocab-2 --economy
  eco-3-late --backend ollama`.
- **How it ran:** through `rec_verify.py`, which only records every reply and every check.
- **Code:** a frozen copy of this branch merged with #87's head (`origin/fix/vocab2-negation-polarity`).
  #87 merges on either side of this, and its numbers are the comparison. The merge's Python suites
  all pass.
- **Prose:** develop's sample entrant, byte for byte the prose #85, #86 and #87 compiled.
- Runs took 91 to 364 s. The retry A/B shared the GPU for most of the batch.

### 3.1 Batch v2, 12 samples

Classified by #87's `tally.py`, unchanged, which uses #84's `order.py` and #86's checks
(`tally-verify-v2.out`, `tally-87v2.out`). p is two-sided Fisher against #87's batch v2
(`analyze-v2.out`).

| (instrument compiles) | #87 v2 | **this branch + #87** | p |
|---|---:|---:|---:|
| compiled | 35 of 36 | **36 of 36** | 1.00 |
| **identity-only rule shipped** | **3** | **0** | 0.12 |
| **guard tree shipped** | 0 | **0** | |
| inverted negation shipped | 0 | 0 | 1.00 |
| `build` = the instrument's own list | 34 | 36 | 0.49 |
| parking rule | 0 | 0 | 1.00 |
| recall present / gated / in tower range | 35 / 35 / 0 | 35 / 35 / 0 | 1.00 |
| back off present / before recall | 33 / 24 | 32 / 23 | ≥ 0.67 |
| home: 300 gold / afford next item / no minions | 27 / 32 / 14 | 26 / 33 / 12 | ≥ 0.63 |
| afford sentence: joint / split, no kept / afford only / none | 11 / 1 / 20 / 3 | 8 / 1 / 24 / 3 | ≥ 0.43 |
| whole draws passing #84's screen | 5 of 12 | 2 of 12 | 0.37 |
| instrument compiles passing it | 24 | 23 | |
| model calls per run, median | 5 | 4 | |
| compile tokens per run, median | 24,096 | 19,209 | |

The 3 "identity-only" in #87's column are from §1. #87 shipped them, because no check existed.

**What the checks did** (`guards.jsonl`):
- **Identity:** the first parsed reply was rejected for an identity rule in s3 and s5 violin ("is this
  bot's instrument 'Violin'?", "is this bot's instrument a violin?"). Both compiled correctly after
  one retry, and nothing was dropped.
  - That is 2 of 12 violin compiles, against #87's 3 of 12. The bug is not a one-off.
- **Unfinished guard:** 1 of 36 first replies (s3 drums, `guard_can_win_fight`) was rejected, and its
  retry compiled flat.
  - `rec_verify.py` reads the retry's error with develop's wording, so it filed that retry as a first
    reply. There were 36 first replies, not the 37 `analyze-v2.out` prints.
- **Negation (#87):** 4 rejections, every one recovered.

**Cost.** Nothing: every call was to the local Ollama. On the OpenRouter backend, one retry is about
$0.0005 a compile.

## 4. Still open (not fixed)

1. **A typed guard still ships as typed.** "type": "guard" in the right place makes a guard tree. The
   rules after it are dead, and #87's negation check does not read a guard's own condition. Develop's
   retry produced one in 24 replies in the A/B. The prompt still invites guards for "strategic
   verdict" prose.
   - Whether a guard may stand above unrelated rules at all is a design question for
     `docs/translator-guards-and-defaults-spec.md` §2.2, and needs a ruling.
2. **Cut-off replies.** A guard-shaped reply that runs out of tokens fails as unbalanced JSON: 3 of 64
   drums first replies, and 2 of 24 develop-retry replies in the A/B. They are retried, as before.
3. **Identity inside a compound question.** "is this bot's instrument 'Violin' and can it afford an
   Amp?" is left alone. Its identity half is always true for the violin, and always false (a dead
   rule) for the others. Here the shopping guard dropped every such rule, because each named an item.
4. **#87's open items** are unchanged by this branch (its §4: the afford clause dropped, and a kept
   "no" split into an OR).
5. **After merge:** `translator.py` is in `COMPILER_FILES`, so the compiler version changes. Bump the
   entrants' `PROMPTLANE_REF`.
   - #87 and #88 merged while this ran, and this branch is rebased onto develop after both. Develop's
     four translator files are byte-identical to #87's head, so the shipped code is the merge §3
     measured.
   - None of the 27 schemas committed under `prompts/pilots/`, #88's included, holds an identity-only
     rule or a guard (`check_pilots.py`).

## Files

- **Translator:** `tools/jev/translator.py`. It adds `enforce_identity_rules`, `_identity_only` and
  `_identity_sentence`; `enforce_finished_guards`, `UnfinishedGuardError` and `_unfinished_guard`;
  their hooks in `translate_pilot`; and two note sections of `render_markdown`.
- **Transparency report:** `tools/jev/transparency.py`, the same two sections.
- **Tests:** `tools/jev/test_translator.py` (`IdentityRuleTests`, `UnfinishedGuardTests`),
  `tools/jev/test_transparency.py`, and `tools/jev/testdata/identity_rules.json`. The fixture holds
  #87's three identity compiles and three clean ones as compile.py saved them (`pilot_file`
  shortened), plus the three recorded unfinished-guard replies verbatim.
- **Docs:** `docs/vocabulary-spec.md` §8.7, a note in `docs/translator-guards-and-defaults-spec.md`
  §7, and a sentence in `docs/prose-to-schema-translator.md`.
- **Data:** the
  [`data-vocab2-identity-rules-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-identity-rules-2026-10-02)
  prerelease, as `vocab2-identity-rules-2026-10-02-compiles.zip` (0.53 MB, sha256
  `d728c3a0427f28ad2ab4f9a2351c2a7f691bff9c2edef98d8d5a60cd72651b49`). It holds:
  - every run's report, schemas, replies and check log (`verify-v2/`, `verify-v1-complete/`,
    `repro-drums/`);
  - the A/B's and the retry check's replies;
  - `preregistration.txt`;
  - the scripts with their outputs.
  - In `repro-drums/`, s7 to s30 each hold two compiles' replies: a launcher that seemed dead was
    still running. Those are counted per reply only.
