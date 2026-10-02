# vocab-2: a shopping list is the build, never a rule, 2026-10-02

**Question.** PR #84's and #85's recompiles of the sample entrant
([`runs/sample-entrant-recall-order-2026-10-02.md`](sample-entrant-recall-order-2026-10-02.md) §2.1,
[`runs/vocab2-node-cap-2026-10-02.md`](vocab2-node-cap-2026-10-02.md) §3.3) found the shopping-list
lines ("Drums: Road Case, then Bass Strings, then Metronome") sometimes compiling into rules like "is
this bot at its base? → go home". It happened in 3 of 35 instrument compiles in each PR. A move home
that fires because the bot is at its base keeps it at its fountain all match. In #84's s5, drums would
have stood there all match.
- **Ruled (Ceryce, 2026-10-02 13:11):** "Fix the 'go home' bug." A shopping sentence produces `build`
  and no rule. If a rule is still emitted for one, a deterministic post-check drops or rejects it, and
  the retry quotes the sentence, the same shape as #85's guard. Real "go home when …" rules must
  survive, and vocab-1 stays byte-identical.
- **Budget:** $0. Every compile ran on the local Ollama (`qwen3.5:9b`), as #84's and #85's did. No Jev
  call was made.

## Verdict

1. **Cause.** No step after the model checks rules against the shopping list. `parse_schema`
   checks the rules' shape. `normalize_build` checks only `build`. The two guards cover instrument
   scope and priority. The prompt asks for "one top-level node for every rule the prose states"
   and describes `build` in a separate block, so a list "in order" can read as ordered steps. The
   wording "at its base" comes from vocab-2's facts list, which says the game states "whether it is
   at its base" in the same line as items and affording. The observation calls it "at its base,
   where it can shop". That last part is an inference from the wording, not tested.
2. **Fix, vocab-2 only.** `translator.enforce_shopping_list` drops every rule that restates a pure
   shopping sentence, and adds a `build:` note the entrant sees. If `build` is missing too, it rejects
   the reply, and the retry quotes the shopping line. A `build` action kind gets a retry message
   saying where the list goes.
3. **No prompt change.** A prompt line that forbade the rule, quoting it, made the translator write
   it in **6 of 12** compiles. Without the line it wrote it in 5 of 36 (Fisher p = 0.018). The line was
   removed. The vocab-1 and vocab-2 prompts are byte-identical to develop's (18 prompts checked).
4. **On develop's sample entrant, 12 free compiles:** parking rules **0 of 36** (was 3 of 35). Every
   `build` is the instrument's own list, **36 of 36** (was 33 of 35). The guard acted on 8 of 36
   compiles and dropped 26 rules. Every one has a shop/buy id and asks about the base or a listed
   item. It rejected no reply, and all 36 instruments compiled.
5. **Real go-home rules survive.** Back off, "more than 300 gold → go home and spend it", "afford my
   next item → head home" and "no minions → go home" are all still there. The guard can't remove
   them (§2), and the replay of #85's own schemas shows it didn't.

## 1. What the translator wrote

Every shopping rule in #84's and #85's saved vocab-2 schemas (91 schemas, all whose prose was saved;
`check_saved.out`) is one of three shapes, each **always** a move home:

| shape | example (id: condition) | where |
|---|---|---|
| at its base, once per item | `buy_road_case`: "is this bot at its base?" ×3 | #84 s4, s5 drums; #85 s4 drums |
| at its base, then per item | `shop_first`: "is this bot at its base?", `buy_amp`: "is this bot at its base and can it afford Amp?" | #84 s1 keytar; #85 s7 keytar, s2 violin |
| per item only | `shop_order_amp`: "does the bot have a Metronome and no Amp?" or "can this bot afford the Amp?" | #84 s12 keytar; #85 s3 keytar |

#84's `order.py` counts only the first two as a "parking rule". The third sends the bot home whenever
it can afford an item it may already own. Its rules are the list again, one per item, with ids
`shop_order_*`/`buy_*`. In #85 s2 violin the list became rules and `build` was missing, so violin
would also have played the default build.

The sentence the real "go home to shop" rule comes from is different: "When I can afford my next item
and no enemy is in sight, I head home to shop." The translator writes it as "can this bot afford its
next item?", sometimes listing the items in brackets (#84 s4 keytar). That rule stays.

## 2. The fix

`enforce_shopping_list` runs in `translate_pilot` after the instrument-scope guard and before the
priority guard. It reads the instrument's scoped prose and the ruleset's item names
(`economy_rules.items`).

- **A pure shopping sentence** is item names plus ordering words ("then", "first", "buy", "shopping
  lists, in order", the instrument label), and nothing else. "buy an amp first, then a road case" is
  one. "I buy an Amp when I can afford it" is not.
- **A rule restates one** in either of two cases:
  - It asks about an item no other sentence of the prose names, and not about the "next item".
  - It asks only whether the bot is at its base, moves home or holds, and has a shop/buy/order/item/build id, and no other sentence speaks of the base.

  A rule about an item that a rule sentence names ("Once I have a Road Case, I dive the tower") stays.
  So does "If I'm at my base, I wait for the next wave". Both have tests.
- Such a rule is **dropped**, anywhere in the tree, with a note such as `build: removed rule buy_road_case
  ("is this bot at its base?") -- it restates your shopping list ('Our shopping lists, in order:
  Drums: Road Case, then Bass Strings, then Metronome.'), which is the build (Road Case → Bass Strings
  → Metronome), not a rule. As a rule it would have sent the bot home and held it at its base
  whenever it fired.` The compile preview shows it under "Shopping list — what was changed".
- If **`build` is missing** (#85 s2 violin), or nothing would be left, it raises `SchemaValidationError`.
  The translator then retries with "…a shopping list is not a rule -- put its items in the top-level
  "build" list and write no rule for it: 'Our shopping lists, in order: Violin: Amp, then Bass
  Strings, then Road Case.'"
- A rule with action kind `build`/`buy`/`shop`/`purchase` was already invalid. Under vocab-2 the
  retry is now told where the list goes. #85's variant-3 s1 violin failed three times on `'build'`.
- **vocab-1** returns the schema untouched, and its error messages are unchanged.

**Why it can't remove a real go-home rule.** Back off asks about an enemy tower and minions. Spend
asks about 300 gold, "no minions" about minions, and recall about hp. None of them names an item, and
none asks only about the base.

**The prompt line that backfired.** The first build also added this to the vocab-2 prompt: *A shopping
list is never a rule: write no rule for it (no "is this bot at its base?" rule, no rule per item),
only "build".* Batch A (§3.3) wrote the forbidden rule in 6 of 12 compiles before the guard. That
is the same kind of backfire `translator-guards-and-defaults-spec.md` §10.4 measured for instrument
scope, where telling the model made it do more of the thing. The line was removed before batch B (the
addendum in `preregistration.txt`, 18:26 UTC). A test now checks that no prompt names the rule.

**Fixture tests** (`test_translator.py` `ShoppingListIsNotARuleTests`, 14 tests) use develop's exact
sample prose and seven compiled schemas, verbatim from #84's and #85's zips
(`tools/jev/testdata/shopping_rules.json`):
- The rules dropped are exactly the shopping ones, in all four shapes.
- No "at its base" rule survives, and every real move-home rule does.
- "Afford my next item (Metronome, then Amp, then Road Case)" is kept, and a clean compile is returned
  unchanged.
- A missing `build` raises and quotes "Violin: Amp, then Bass Strings, then Road Case."
- `translate_pilot` retries in that case and doesn't retry when `build` is there. The note renders.
- vocab-1 is untouched, and a `build` action gets the new message under vocab-2 only.
- What counts as a shopping sentence: the brief's "buy an amp first, then a road case" does.

## 3. The free recompiles

Pre-registered (`preregistration.txt`, 18:21 UTC, before any compile). Command: `python
tools/jev/compile.py prompts/pilots/sample-entrant-eco.prose.md --vocab vocab-2 --economy eco-3-late
--backend ollama`, through `run_compile.py`. That wrapper only records what the guard saw on each
attempt. Each run took 48 to 131 s. The prose is develop's sample entrant after #84 and #85. It is
byte for byte the prose #85 compiled.

### 3.1 Batch B (what ships), 12 samples

Classified by #84's `order.py`, unchanged, plus this branch's `tally.py` for builds and go-home rules.

| (instrument compiles) | #85 (before) | this branch |
|---|---:|---:|
| compiled | 35 of 36 | **36 of 36** |
| `build` = the instrument's own list, in order | 33 | **36** |
| parking rule ("at its base → home") | 3 | **0** |
| recall present | 34 | 33 |
| … gated on "not inside an enemy tower's range" | 34 of 34 | 33 of 33 |
| … able to fire inside an enemy tower's range | 0 | 0 |
| back off present | 31 | 32 |
| back off before recall | 29 | 25 |
| keytar recall present | 12 of 12 | 11 of 12 |
| "more than 300 gold → go home and spend it" | 30 | 30 |
| "afford my next item → go home" | 33 | 33 |
| "no minions → go home" | 9 | 12 |
| whole draws passing #84's screen | 5 of 12 | 4 of 12 (s3, s5, s9, s11) |
| top-level nodes, median (range) | 10 (9–14) | 10 (7–12) |
| model calls per run: 3 (no retry) | 8 of 12 | 8 of 12 |

**The guard acted on 8 of 36 compiles.** Before it, the translator had written an "at its base" rule
in 5 (s1, s3, s6 drums; s2, s8 violin) and per-item rules in 3 more (s2, s4, s9 keytar). It dropped 26
rules and rejected no reply. Every one of the 26 is listed in `tally.out`. Each has a shop/buy id and
asks about the base or a listed item, and none is a recall, a back off or a rule from another
sentence.

**Back off before recall and keytar recall moved, and the guard didn't move them.** The prompt is #85's,
byte for byte, so the model draws from the same distribution. The guard only drops the rules listed
above. 25 of 36 against 29 of 35 is p = 0.27 (Fisher). §3.2 runs #85's own draws through the guard to
show the guard alone.

### 3.2 #85's own 35 schemas, replayed through the guard (no model call)

`replay85.py` runs `enforce_shopping_list` on each of #85's saved final-prose schemas, then `tally.py`
counts them again:

| | #85 as saved | replayed |
|---|---:|---:|
| parking rule | 3 | **0** |
| whole draws passing #84's screen | 5 of 12 (s1, s6, s8, s9, s10) | **6 of 12** (+ s7) |
| instrument compiles passing it | 26 | 28 |
| rules dropped | | 10 (s3 keytar 3, s4 drums 3, s7 keytar 4) |
| rejected (would retry live) | | 1: s2 violin, list as rules and no `build` |

Every other count moves only by s2 violin's one compile. Recall is 34 → 33 and back off before
recall 29 → 28, from that compile's own rules. Nothing else changes.

### 3.3 Batch A (prompt line + guard), stopped after 4 samples

All 12 instrument compiles compiled and kept their own `build`, and the guard left no parking rule.
But before the guard, the translator wrote an "at its base" rule in 6 of 12 (s1, s2 violin; s3 keytar and
violin; s4 drums and keytar). The pre-registration's addendum stopped the batch there and removed the
line. Its 4 samples are reported whole in `tally.out`.

## 4. Still open

1. **"Afford my next item" loses its "no enemy in sight" clause.** In 5 of batch B's 36 compiles (9 of
   #85's 35), the translator wrote that sentence as "is there any enemy within 260 units? → go home"
   (`shop_no_enemy`). That rule sends the bot home *because* it sees an enemy. It is a translation
   miss of a real rule sentence, not a shopping line, so this branch leaves it alone. The tally counts
   it as "enemy in sight (afford clause lost)".
2. **`build` missing with no shopping rule.** #85 s5 keytar compiled with no `build` and no rule
   restating the list, so it plays the keytar default build. The guard acts only when a rule restates
   the list. It didn't happen in batch B (36 of 36).
3. **After merge**, the arena's compiler version changes (`translator.py` is in `COMPILER_FILES`), so
   ladder prompts compile again on their next match. Bump the entrants' `PROMPTLANE_REF`, as after #85.

## Files

- `tools/jev/translator.py` (`enforce_shopping_list` and its hook in `translate_pilot`; the `build`
  action-kind message), `tools/jev/test_translator.py`, `tools/jev/testdata/shopping_rules.json`,
  `docs/vocabulary-spec.md` §8.5, and a sentence in `docs/prose-to-schema-translator.md`.
- **All 16 compile runs** are on the
  [`data-vocab2-shopping-not-rules-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab2-shopping-not-rules-2026-10-02)
  prerelease as `vocab2-shopping-not-rules-2026-10-02-compiles.zip` (0.28 MB, sha256
  `3b9cff35b2d18106090b738c1581c110c72838e4bafc64f7dea28e85dbb5f3dc`). It holds each run's report,
  schemas, stdout and guard log, batch A's runs, the #85 replay, `preregistration.txt`, `run_compile.py`,
  `compile_batch.sh`, `tally.py` with `#84`'s `order.py`, `tally.out`, `check_saved.py` with its output,
  the fixture builder and the prompt-identity check.
