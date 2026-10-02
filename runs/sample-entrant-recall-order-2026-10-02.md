# Sample entrant: back off before recall, and never recall under an enemy tower, 2026-10-02

**Question.** PR #82's Jev re-check ([`runs/vocab2-tower-reach-2026-10-02.md`](vocab2-tower-reach-2026-10-02.md)
§2.2 and §3.1) found the vocab-2 sample entrant dying 19.8 times a match. 113 of its 119 deaths came
under an enemy tower while it was playing its own "recall when below a third" rule. Recall-2 is a
4 s channel where the bot stands still. That rule came before the entrant's "back off from the
tower" rule, so the bot never walked out.
- **Ruled:** Ceryce approved it ("Approve 1 and 2"). In the sample entrant's prose
  (`prompts/pilots/sample-entrant-eco.prose.md`, the source of the vocab-2 schema #81 registered),
  move "back off from the tower" before recall. If the vocabulary can say it, keep recall from firing
  inside an enemy tower's range. Confirm the compiled order with a free local recompile. Add one line
  to the entrants README.
- **Budget:** $0. All compiles ran on the local Ollama (`qwen3.5:9b`, the translator the entrant
  doors use), as PR #79 and #81 did. No Jev call was made.

## Verdict

1. **The prose now says it, and vocab-2 can.** Back off now comes first, and the recall reads "when
   my hp drops below a third of my max and I'm not inside an enemy tower's range". vocab-2 tells Jev,
   for every enemy tower within 390, whether this bot is inside its range (`vocab.py` `enemy_towers`).
2. **The gate compiles every time a recall compiles.** Across 12 samples of the final prose, all 29
   recalls the translator wrote are gated on "not inside an enemy tower's range". None can fire
   under a tower. The old prose's 8 compiles (#79's 5 and #81's 3) gave 8 ungated recalls.
3. **The order mostly compiles.** Back off comes before recall in 24 of the 35 instrument compiles.
   Violin has it in 11 of 11, drums in 8 of 12, keytar in 5 of 12. The old prose got it in 0 of 8.
4. **The new cost is keytar.** The translator drops keytar's recall altogether in 5 of 12 samples,
   where the old prose dropped it in 0 of 3. The 9B translator is told to write 3 to 8 top-level nodes
   (`translator.py`), and this prose has about 10 rule sentences per instrument. Something gets dropped, and with recall
   no longer first, keytar's recall is often what goes.
5. **No schema is checked in.** None of the 4 screened draws (s9 to s12, pre-registered below) passed
   for all three instruments. A Jev re-check needs a pick (§3).

## 1. The prose change

```
-When my hp drops below a third of my max, I recall home to heal. Nothing matters more than that.
+If I can see an enemy tower and none of my minions are near me, I back off home instead of
+tanking the tower alone. After that: when my hp drops below a third of my max and I'm not inside an
+enemy tower's range, I recall home to heal.
 ...
-If I can see an enemy tower and none of my minions are near me, I back off home instead of
-tanking the tower alone.
```

Nothing else changes. "Nothing matters more than that" is gone, because it is no longer true. It was
also never an override phrase (`translator.ABSOLUTE_OVERRIDE_PHRASES`), so it never promoted anything.

**Why no "walk out of the tower first" rule.** A tower shoots a bearbot only when none of that
bearbot's minions is in its range. Back off fires exactly when none of my minions is near. So once
the wave dies and the tower turns on the bot, back off walks it out. Recall fires once it is out of
range. Variant 1 below tried an explicit walk-out sentence. It added a rule the translator had no
room for, and once that rule even compiled as a recall.

`sample-entrant-eco.schemas.json`, the vocab-1 schema behind economy-spec §6's B1 condition, is
unchanged. It was compiled from the earlier prose, so §6 still plays what it played
(`prompts/pilots/README.md`). `sample-entrant.prose.md`, the economy-blind sample, is unchanged.

## 2. The compiles

Every compile ran with `python tools/jev/compile.py prompts/pilots/sample-entrant-eco.prose.md
--vocab vocab-2 --economy eco-3-late --backend ollama`, on this branch, and took 44 to 95 s.
Translation is sampled, so the claim is the distribution, not one draw. A scratch classifier read
each compiled rule's own condition and action:
- **back off:** a move home whose condition names an enemy tower and none of my minions.
- **recall gated:** a recall whose condition says not inside an enemy tower's range.
- **parking rule:** a move home whose condition is only "is this bot at its base?". It holds the bot
  at its fountain for as long as it stands there.

### 2.1 The final prose, 12 samples

| (instrument compiles) | drums | keytar | violin | total |
|---|---:|---:|---:|---:|
| compiled | 12 | 12 | 11 | 35 |
| recall present | 11 | **7** | 11 | 29 |
| … gated on "not inside an enemy tower's range" | 11 | 7 | 11 | **29 of 29** |
| … able to fire inside an enemy tower's range | 0 | 0 | 0 | **0** |
| back off present | 10 | 10 | 11 | 31 |
| back off before recall | 8 | 5 | 11 | **24** |
| parking rule | 2 | 1 | 0 | 3 |

**Old prose, for comparison** (#79's s1 to s3 and #81's sample, 8 instrument compiles): recall in 8 of 8, gated in 0,
back off before recall in 0, parking rule in 0.

**The parking rule.** It comes from the shopping-list lines ("Drums: Road Case, then Bass Strings,
then Metronome" becomes three "is this bot at its base? → home" rules), and those lines didn't
change. The old prose's 0 of 8 against this prose's 3 of 35 is too few to blame on the edit. At the
rate seen here (3 in 35), 0 of 8 happens about half the time. It is still a translator
failure mode the compile preview should flag. It isn't flagged today.

### 2.2 The wordings tried

The prose was revised between batches. Each batch's 4 samples are reported whole.

Each count is out of the instrument compiles that succeeded. "Gated" is out of the recalls compiled.

| variant | compiled | back off before recall | recall gated | what went wrong |
|---|---:|---:|---:|---|
| 1: back off, then "below a third **and inside** an enemy tower's range → walk home first", then the gated recall | 12 | 5 | 11 of 11 | This is one more rule than the translator keeps, and back off was dropped in 7. Once (s4 violin) the walk-out compiled as a **recall inside the tower's range**. |
| 2: back off, then the gated recall as its own paragraph | 10 | 3 | 9 of 9 | Keytar failed or came out as 1 rule in 3 of 4. Recall often went back above back off. |
| 3: variant 2 plus "no matter what else is going on" on back off | 10 | 6 | 10 of 10 | **Rejected.** The priority guard (`enforce_absolute_priority`) promotes the rule whose words best match the override paragraph. Where the translator had dropped back off, it promoted "**attack** the tower when two minions are near" to rule 1 instead, in 3 instruments. |
| 4 (**final**): back off and the gated recall in one paragraph, "After that: when …" | 35 | 24 | 29 of 29 | Keytar drops its recall in 5 of 12. |
| 5: "I recall home to heal, but never inside an enemy tower's range" | 10 | 3 | **0 of 9** | The translator drops a trailing "but never …" clause. The gate has to sit inside the "when …" condition. |

**Variant 3 is a translator bug worth knowing about.** The guard requires at least two shared tokens
between the override paragraph and a rule. "Enemy tower" plus "minions" is enough to match the
attack-tower rule. So override language on a rule the translator drops can silently move a different
rule to the top. Before, the guard raised only when nothing matched at all. Fixing it isn't in this
brief.

### 2.3 The pre-registered pick (nothing checked in)

`preregistration.txt` was written before each batch it covers.
1. **16:07:09 UTC, before s5 to s8:** "Artifact = first of s5..s8 in which all three instruments
   compile." That was **s5**. Its drums had three parking rules (rules 2 to 4) above everything else,
   so drums would have stood at its fountain all match. That isn't fit to play.
2. **16:14:16 UTC, before s9 to s12:** the first of s9 to s12 in which all three instruments compile
   and each one has back off before a gated recall, no recall that can fire in tower range, and no
   parking rule. "If none passes, no schema is checked in." **None passed.** Keytar had no recall in any of the
   four, and s12's violin failed to compile.

So this branch adds no schema, and `tools/jev/test_vocab.py` needs no registration. Across all 12
samples, 3 whole draws (s2, s3, s8) would have passed the screen, and 23 of the 35 instrument
compiles would have.

## 3. What Ceryce may want to decide

1. **A Jev re-check.** Rerun #82's block (easy vs entrant2, seeds 3, 7 and 11, both pairings,
   6 matches) with this prose on develop, which has #83's ability fix. It needs a schema first. One option is the
   first screened draw of a new pre-registered batch, expected to take about 4 compiles at $0. Another
   is to splice screened instruments across draws, as #79 did. #82's block cost **$0.690**, so expect
   about $0.70.
2. **Keytar's dropped recall.** If the sample should compile cleanly every time, the prose needs
   fewer rule sentences than 11, or the translator's 3-to-8-node instruction needs to change. The
   first changes the sample's strategy and the second changes the compiler. Neither is done here.
3. **The priority-guard misfire (§2.2, variant 3)** and the **unflagged parking rule (§2.1)** are
   compiler issues entrants can hit. They are noted, not fixed.
4. **The entrants README line** (kumouri/jamobair-entrants, separate PR) renders the 4 s channel
   and the 3.5 s window from `src/recall/recall-2.json` at the entrants' pinned `PROMPTLANE_REF`. It
   names `recall-2` because `recall-2` is still opt-in (`DEFAULT_RECALL` is the specimen's 3× run).
   The README's contract bullet "`recall` walks the bearbot home at three times its speed"
   describes that default. Once `recall-2` is ruled in for the Jam, that bullet needs rewriting.

## Files

- **This page,** the prose change, and a paragraph in `prompts/pilots/README.md`.
- **All compiles** (28 compile runs over the 5 wordings, 12 of them on the final prose, with their
  reports, schemas and stdout), the classifier and tally scripts, `preregistration.txt`, and the
  README-line renderer are on the
  [`data-sample-entrant-recall-order-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-sample-entrant-recall-order-2026-10-02)
  prerelease as `sample-entrant-recall-order-2026-10-02-compiles.zip` (0.26 MB, sha256
  `52917d61c6b92546048cc60ce0feebc82c654307090b10e49f611bd86dc168e8`). Each variant has its own
  directory, `variant1-walkout` through `variant5-never`. The final prose's samples are
  `variant4-final/s1` to `s12`, called "try4" in `preregistration.txt`.
