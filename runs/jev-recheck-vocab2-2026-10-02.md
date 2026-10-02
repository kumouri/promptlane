# The sample entrant on Jev after the vocab-2 target fix — 2026-10-02 re-check

**Question.** PR #79's D6 check ([`runs/vocab-house-tiers-2026-10-02.md`](vocab-house-tiers-2026-10-02.md)
§4 line 8, §5.4) found that the sample entrant, recompiled under `vocab-2`, sent "walk with my nearest
minion" to `nearest_ally`, a teammate bearbot. On Jev, 79.4 % of its decisions walked to its own bots, it
spent 96 % of its alive time in its own towers' range, and it dealt 2 structure damage a match. PR #80
([`runs/vocab2-target-fixes-2026-10-02.md`](vocab2-target-fixes-2026-10-02.md)) fixed the translator.
This re-runs the same D6 block on Jev, with the sample entrant recompiled on the fixed translator.
- **Asked for:** Ceryce, 2026-10-02: "Do the two still-open things in promptlane" (job
  20261002-101247-f667 left this check open).
- **Budget:** $1.50 hard stop on Jev (the estimate was about $0.75; PR #79's D6 block cost $0.82).

## 1. Method (written and committed before the first real match)

- **Code:** `develop` at `00a7d34` (PR #80 merged on top of PR #79), branch
  `runs/jev-recheck-vocab2-2026-10-02`. No code changes.
- **The entrant (entrant2):** `prompts/pilots/sample-entrant-eco.prose.md`, unchanged, compiled by PR #79's
  path: `python tools/jev/compile.py … --vocab vocab-2 --economy eco-3-late --backend ollama`
  (`qwen3.5:9b` on the local Ollama as the translator, $0, the model the entrant doors use). The rule
  is PR #79's: take the first sample in which all three instruments compiled. Sample 1 compiled all three,
  so it is the entrant:
  [`jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json`](jev-recheck-vocab2-2026-10-02-sample-entrant-eco-vocab2.schemas.json),
  with its transparency report
  [`jev-recheck-vocab2-compile-sample-entrant-eco-2026-10-02.md`](jev-recheck-vocab2-compile-sample-entrant-eco-2026-10-02.md).
- **What the compile already shows:** every instrument's "walk with my nearest minion" rule now targets
  `nearby_minion`, the nearest allied minion in the wave. No rule names `nearest_ally`. The compile made
  no `target:` corrections, so the prompt wording alone got it right. Every instrument's "attack the
  nearest enemy tower" targets `nearest_tower`, with no invented selector.
- **Easy:** `house:easy` with `prompts/pilots/house-easy-eco.schemas.json`, as in PR #79.
- **Backend:** Jev on one private `tools/jev/schema_server.py` on `:8961`, `--budget-usd 1.50`. TypeSafe
  answers, failing over to Workers AI per call. The live arena is not touched.
- **Smoke, free, already done:** `--stub` on `:8962`, 120 s at seed 7, easy–entrant2 and entrant2–easy.
  Both ran 336 requests with 0 errors. Tokens came to 276k a pairing, against PR #79's 275k, so the block
  should cost about what PR #79's did ($0.82).
- **Lines (every match):** PR #79's: `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1
  --recall recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`,
  full 600 s.
- **The sample:** PR #79's D6 block, in its order: easy–entrant2 and entrant2–easy at seeds 3, 7 and 11,
  6 matches, 4 at a time. The runner is PR #79's (`run_vh.mjs`), repointed. It stops launching once the
  projected spend passes $1.40, and the server stops at $1.50. No match is added or replayed after
  any result is seen. A match that crashes before it finishes is retried once.

**What is reported.** The baseline is PR #79's D6 block (its probe output, scored by the same scorer).
1. **Did the minion rules target minions?** This counts entrant2's `nearby_minion` moves, and what each
   target point was (an allied minion, an allied bearbot, or elsewhere), from the replayed observations.
2. **The share of entrant2's decisions that walked to its own bots** (`nearest_ally`). Baseline 79.4 %.
3. **Did it push?** Structure damage by entrant2's bearbots a match (baseline 2), its share of alive time
   in its own towers' range (96.4 %) and on the opponent's half (0.8 %), towers taken, and results.
4. **D6 line 8, exactly as PR #79 registered it.** PASS iff all hold: all 6 matches finish and
   replay-verify; the server logs 0 errors and both sides 0 parse errors; and each of easy's four new
   actions is chosen at least once (`own_tower`, `nearest_enemy_bearbot`, `nearest_enemy_minion`, and
   the `own_front_tower` default). PR #79 failed only the last sub-line: `own_tower` was chosen 0 times.
5. **Spend,** by the server's ledger.
