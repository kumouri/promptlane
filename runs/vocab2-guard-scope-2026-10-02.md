# vocab-2: a guard holds only the rules its verdict governs, 2026-10-02

**Ruling (Ceryce, 2026-10-02 16:20 CT, "Yes", on Margo's recommendation).** It was made under her 15:14
fidelity ruling: "The most important part of this whole thing is the translation from prose to Jev.
It HAS to be right."
- A `vocab-2` guard may only sit above rules that the prose actually places under its verdict.
- A guard over unrelated rules is rejected and retried.
- The retry quotes only the relevant prose sentence(s). It never echoes the model's wrong output:
  #87 and #89 found the 9B copies it back.
- On the last attempt, the guard is dropped or flattened with a note the entrant sees, rather than
  shipping dead rules.

**Question.** #89 (`runs/vocab2-identity-rules-2026-10-02.md` §4) found that a guard with its
`"type": "guard"` in place still ships as a guard tree, and every rule after it is dead. Develop's
old retry produced one in 24 replies.

- **Brief:**
  - reuse the #85–#89 guard machinery;
  - leave the shopping, negation and identity checks alone;
  - keep vocab-1 byte-identical;
  - verify at $0.
- **Budget:** $0. Every compile ran on the local Ollama (`qwen3.5:9b`). No Jev call and no paid model
  call was made.

## Verdict

1. **Every typed guard the 9B has written on the sample entrant breaks it.** The saved schemas of the
   #84–#89 data prereleases hold 5 typed guards in 360 schemas. #89's retry A/B recorded one more,
   in a reply. In all 6, the guard holds recall, the fights and the pushes, or sits above them as
   dead rules (§1).
2. **`translator.enforce_guard_scope` (vocab-2 only) rejects all 6, and nothing else.**
   - It is rejected when any node follows a guard in its cascade, because a guard always routes.
   - It is also rejected when a node in a branch states a sentence outside the guard's verdict.
   - None of the 355 flat schemas is touched, and none of the 27 committed pilot schemas is.
   - Four hand-written guards whose prose does scope them pass untouched (§3).
3. **The retry works, and isn't copied.** The rejection message went back to the 9B 24 times, from
   three recorded guards. 0 replies held a guard again, and 0 copied the message. 18 passed every
   check, and the other 6 hit #86's shopping retry (§4).
4. **No regression against #89's table.** 12 free compiles of the sample entrant: every row
   p ≥ 0.24, 36 of 36 compiled, median 4 model calls (§5).
   - #88's house-easy and siege prose: 24 of 24 compiled.
   - **No typed guard appeared in any of the batch's 121 replies.** The check never fired live. This
     is a rare failure, and the replay and the retry check (§3, §4) are what exercise it.
5. **One consequence needs a ruling.** This repo's own verdict pilot, `violin.md`, ends its verdict
   paragraph with "you only take fights you can win in one phrase", and puts Staccato and Solo in the
   next paragraph. Under this check a guard holding them is rejected (§6). In 8 free vocab-2
   compiles of `violin.md` the 9B wrote no guard at all, so it changes nothing today.

## 1. What the 9B's guards did

Every typed guard in the saved vocab-2 schemas (`tools/jev/testdata/guard_scope.json`):

| where | guard's question | what it sits above |
|---|---|---|
| #84 variant 2, s1 keytar (shipped) | "can this bot afford its next item and is there an enemy bearbot in sight?" | the whole schema. The else-branch holds recall, the tower pushes, chord, the bounty hunt and the walk. The then-branch holds "enemy tower in sight → home". |
| #84 variant 5, s3 keytar (shipped) | "is this bot carrying more than 300 gold and is an enemy bearbot in sight?" | the whole schema. Recall, back off and the pushes are in the then-branch; chord and the bounty hunt are in the else-branch. |
| #89 v1 (type completed), s2 keytar | "can this bot afford its next item right now?" | rule 1. Back off, recall, chord, the bounty hunt, the pushes and the walk are after it, dead. |
| #89 v1 (type completed), s2 violin | "is an enemy tower visible AND are at least two of the bot's minions near it?" | rule 2. Recall, staccato and the walk are after it, dead. |
| #89 v1 (type completed), s4 keytar | "can this bot afford its next item right now?" | rule 1, the same as s2. |
| #89 retry A/B, develop's message (reply) | "can this bot afford its next item AND is there an enemy bearbot in sight?" | the whole schema, recall included. |

- The sample entrant states no verdict at all. Each guard's question is one of its rules' conditions,
  turned into a router.
- #84's two shipped. Nothing after the model read a typed guard then.
- #89's three come from its type completion, which #89 withdrew before merging.

## 2. The check

`translator.enforce_guard_scope` runs right after the instrument-scope guard, before the shopping
guard. `docs/vocabulary-spec.md` §8.8 is the spec.

**The verdict's prose.**
- A guard's question has words that most rules don't use ("afford", "next", "item"; "side",
  "stronger", "fight"). Each paragraph with a sentence naming two of them is the verdict's prose.
  When the question has fewer than two such words, the sentence must name all of them.
- **One shared word is not enough.** With one word, "the next wave" put the sample entrant's walk
  rule under "can this bot afford its next item?". The first version of the check did exactly that
  on the replay.
- The verdict's prose also takes in:
  - a heading's whole section;
  - the paragraph a line ending in ":" introduces, with the list items after it;
  - an "Otherwise …" paragraph right after.

**What a node states.** Each node states the sentence(s) sharing the most words with it (its id, and a
rule's target, included). It must share at least two.

**Rejected:**
- any node after a guard in its cascade. A guard sends every decision into one of its two branches,
  so that node is never checked;
- any node in a branch that states a sentence outside the verdict's prose;
- any node in a branch whose sentence is unclear: none at all, or some on each side.

**The retry:**
- It quotes only those nodes' prose sentences (three at most, with a count of the rest), never the
  guard's question or id. It asks for plain rules in the prose's order.
- It shares #89's unfinished-guard retry path, so develop's generic "finish the guard shape" line is
  left out.

**The last attempt** flattens the guard instead, with a `guard scope:` note under "Guards over rules
your prose does not put under them — what was removed":
- nodes from other sentences take its place as plain rules;
- the dead nodes after it are checked again;
- nodes stating only the verdict's prose, or an unclear sentence, are removed, since they applied
  only under its question. So are the branches' own defaults.
- A flattened guard can expose a nested one, which is then checked the same way.
- If nothing would be left at the root, it raises.

On #84's variant 2 keytar, the last attempt ships recall, the pushes, chord, the bounty hunt, the minion
attack and the walk as plain rules. It removes "enemy tower in sight → home", which applied only under
the guard.

## 3. Replay with no model call

`replay_guard_scope.py`, `replay_guard_scope.out`:
- **All 360 saved vocab-2 schemas** in the #84, #85, #86, #87, #88 and #89 prereleases, each checked
  against its own prose: 5 hold a typed guard and all 5 are rejected. 355 are flat, and all 355 come
  back as they came.
- **Which prose each was checked against.** #85's variant 3 and final prose are in its zip. Every
  other schema names the sample entrant. #84's variants edited only its back-off and recall
  paragraph, and that edit isn't kept, so develop's sample prose stands in for them, as in #89's
  replay.
- **#89's A/B reply** with a typed guard is rejected too: 6 of 6.
- **Guards the prose does scope** (`positive.py`, and in `GuardScopeTests`): all return untouched.
  - the verdict's own paragraph;
  - separate paragraphs that restate it ("When your side is stronger in the fight near you, …");
  - a heading's section with its "Otherwise";
  - a lead-in line and its list;
  - a guard with no rules under it.
  - Their look-alikes are rejected: an unrelated recall inside a branch, and a recall after the
    guard.
- **The 27 schemas committed under `prompts/pilots/`** hold no guard, and the check changes none
  (`check_pilots.py`).
- **The prompt is unchanged.** All 240 prompts match develop's byte for byte: 20 prose files × 3
  instruments × 2 vocabularies × 2 economies (`prompt_same.py`).
- **vocab-1** schemas come back as they came, guards included.

False positives on guards the prose does scope: **0**. There is no such guard among the saved
schemas, because the sample entrant states no verdict. The hand-written ones above are the control.

## 4. The retry check

`retry_check.py`, `retry-check.out`, `retry-check.jsonl`. Three recorded guards were each rejected,
and the rejection was sent back exactly as `translate_pilot` sends it, 8 times each. The three are
#89's A/B drums reply, #84's variant 2 keytar, and #89's v1 s2 keytar with dead rules.

| 24 replies | this check's message | for scale: #89's A/B, develop's message (A) / #89's (B) |
|---|---:|---:|
| typed guard again | **0** | 1 / 0 |
| unfinished guard | 0 | 8 / 0 |
| unparseable (cut off) | 0 | 2 / 0 |
| copied the message's words | **0** | — |
| passes every check | **18** | 14 / 18 |

- The other 6 were caught by #86's shopping check ("shop_order_metronome restates the shopping
  list"). That is the normal next retry.
- The starting replies differ from #89's A/B, so the right-hand column is scale, not a paired
  comparison. Against A: typed guard 0 vs 1, p = 1.00; passes 18 vs 14, p = 0.36.

## 5. The free recompiles

- **Command:** `compile.py <prose> --vocab vocab-2 --economy eco-3-late --backend ollama`.
- **How it ran:** through `rec_verify.py`, #89's recorder plus a recorder for this check.
- **Code:** a frozen copy of this branch merged with #89's head (`b458a37`).
  - #89 merged into develop while this ran. This branch is rebased onto that merge.
  - Develop's translator files are byte-identical to that head, and the shipped `translator.py`
    differs from the frozen copy only in its module docstring. So the batch measured the shipped
    code.
- **Prose:** develop's files, byte for byte.
- **Comparison:** #89's verify-v2 batch, run on the same code without this check, through #87's
  `tally.py`, unchanged. That reproduces #89's published table exactly. p is two-sided Fisher.
- **Measures:** the brief's own (compile failures, guard-over-unrelated count, model calls, #89's
  table). No separate pre-registration file was written.
- **Retry check:** ran alongside the first half of the batch on the same GPU, so run times are
  inflated there.

### 5.1 The sample entrant, 12 samples

| (instrument compiles) | #89 verify-v2 | **this branch** | p |
|---|---:|---:|---:|
| compiled | 36 of 36 | **36 of 36** | 1.00 |
| **guard tree shipped / over unrelated rules** | 0 / 0 | **0 / 0** | |
| typed guard in any reply | 0 of 47 | 0 of 58 | 1.00 |
| identity-only rule shipped (#89) | 0 | 0 | |
| inverted negation shipped (#87) | 0 | 0 | 1.00 |
| parking rule / `build` = own list (#86) | 0 / 36 | 0 / 36 | 1.00 |
| recall present / gated / in tower range | 35 / 35 / 0 | 35 / 35 / 0 | 1.00 |
| back off present / before recall | 32 / 23 | 33 / 27 | ≥ 0.44 |
| home: 300 gold / afford / no minions | 26 / 33 / 12 | 26 / 35 / 7 | ≥ 0.29 |
| afford sentence: joint / split-ok / afford-only / none | 8 / 1 / 24 / 3 | 9 / 4 / 23 / 0 | ≥ 0.24 |
| afford clause lost ("enemy in sight → home") | 1 | 4 | 0.36 |
| whole draws passing #84's screen | 2 of 12 | 5 of 12 | 0.37 |
| instrument compiles passing it | 23 | 27 | 0.44 |
| model calls per run, median | 4 | 4 | |
| runs over 4 calls | 3 of 12 | 5 of 12 | 0.67 |

- **This check fired 0 times** (`guards.jsonl`). Every extra call came from the other checks:
  - 5 replies cut off mid-JSON;
  - 3 unfinished guards (#89);
  - 6 negation rejections (#87), 3 identity (#89) and 1 shopping (#86).
  - Every one recovered.
- The tally is `tally-batch-sample.out` and `tally-89v2.out`. The rest is `analyze-final.out`.

### 5.2 #88's prose, 4 samples each

| prose | compiled | typed guard in any reply | guard shipped | calls per run, median |
|---|---:|---:|---:|---:|
| `house-easy-eco.prose.md` | 12 of 12 | 0 of 15 | 0 | 3.5 |
| `sample-entrant-siege.prose.md` | 12 of 12 | 0 of 12 | 0 | 3 |
| `house-hard-eco.prose.md` | **0 of 12** | 0 of 36 | 0 | 9 |

**house-hard-eco does not compile on the local 9B, with or without this change.**
- Every one of its 36 replies was cut off at about 6,200 characters. That is `llm_backends`'
  1,800-token completion cap: its 16-plus rules don't fit.
- The reply fails `_extract_json_object` before any check runs, and the prompt is byte-identical to
  develop's. So develop gives the same result by construction.
- This is #89's open item 2 (cut-off replies), at full strength.
- #88 met the same overrun and compiled hard with its Bandstand paragraph left out
  (`runs/better-bots-2026-10-02.md` §1.2). It spliced in only the changed rules, so its committed
  schemas are unaffected.

### 5.3 A positive control: `violin.md`, 8 samples

`compile.py prompts/pilots/violin.md --instrument violin --vocab vocab-2`, the pilot the guard tree was
designed for:
- 8 of 8 compiled on the first reply.
- **The 9B wrote no guard in any of them.** All were flat: recall, wait for an isolated target, engage,
  staccato, solo, reposition.
- The check had nothing to do.

## 6. Still open (not fixed)

1. **violin.md's verdict, and the guards spec's worked tree (§3.2), need a ruling.** "You only take
   fights you can win in one phrase" ends its paragraph. The Staccato and Solo paragraph after it
   never restates the verdict, so this check reads them as not placed under it, and the spec's own
   tree is rejected.
   - It is pinned in `test_violin_md_does_not_place_its_opener_under_its_verdict`.
   - Prose that says "When my side is stronger in the fight near me, …" in the rule's own sentence,
     or keeps the rules in the verdict's paragraph, passes.
   - Whether a following paragraph about the same target counts is a judgment the check does not
     make. Today the 9B writes no guard for `violin.md` under vocab-2 (§5.3).
2. **The last attempt removes nodes whose sentence is unclear.** In #84's variant 5, the bounty-hunt
   rule tied between its own sentence and the verdict's, so the flattened schema drops it. Keeping it
   could ship a rule that applied only under the guard, so this errs toward removing. The note names
   it.
3. **The verdict reader is a word match**, like every check before it. A verdict worded entirely
   with words most rules use ("is an enemy in sight?") has no verdict prose, so anything under it is
   rejected.
4. **house-hard-eco can't compile locally** (§5.2), and nor can any entrant prose that long. That is
   the 1,800-token cap, not this change.
5. **After merge:** `translator.py` is in `COMPILER_FILES`, so the compiler version changes. Bump the
   entrants' `PROMPTLANE_REF`.

## Files

- **Translator:** `tools/jev/translator.py`. It adds `enforce_guard_scope`, `GuardScopeError`,
  `_verdict_scope`, `_overreach`, `_node_sentences` and `_prose_paragraphs`. It also adds their hook
  in `translate_pilot` (after the instrument-scope guard, sharing #89's unfinished-guard retry) and a
  note section in `render_markdown`.
- **Transparency report:** `tools/jev/transparency.py`, the same note section.
- **Tests:**
  - `tools/jev/test_translator.py`: `GuardScopeTests`, 15 tests;
  - `tools/jev/test_transparency.py`: one test;
  - `tools/jev/testdata/guard_scope.json`: every saved typed guard and the A/B reply, verbatim, with
    their prose.
- **Docs:**
  - `docs/translator-guards-and-defaults-spec.md` §2.2: the ruling;
  - `docs/prose-to-schema-translator.md` §2: "Design priority: fidelity", and the check;
  - `docs/vocabulary-spec.md` §8.8;
  - the translator's module docstring.
- **Data:** the
  [`data-vocab2-guard-scope-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-guard-scope-2026-10-02)
  prerelease, as `vocab2-guard-scope-2026-10-02-compiles.zip` (0.35 MB, sha256
  `e03647009160bb8553cb4ca8d31a29b143423dc1f52704af9e625682566a6a63`). It holds:
  - every batch run's report, schemas, replies and check log (`batch-*/`);
  - the retry check's replies;
  - the scripts and their outputs.
