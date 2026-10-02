# vocab-2 target fixes: free local compiles before and after — 2026-10-02 run

**Question.** Do the two `vocab-2` translator bugs found in the house-tier run
([`vocab-house-tiers-2026-10-02.md`](vocab-house-tiers-2026-10-02.md) §2, §5.4, on PR #79) go away
with the fix in [`docs/vocabulary-spec.md` §8.1](../docs/vocabulary-spec.md)?

1. Prose about walking with my minions compiled to `nearest_ally`, the nearest *teammate*.
2. The translator wrote a `nearest_enemy_tower` target that doesn't exist, and the instrument failed.

**How.** `python tools/jev/compile.py <prose> --vocab vocab-2 --economy eco-3-late --backend ollama`.
That is the entrant compile path, with the translator (`qwen3.5:9b`) on the host Ollama: $0, no Jev,
no match. "Before" is `origin/develop` at 8577e9c, and "after" is this branch. The sources are the
two that PR #79 compiled (its scratch copies: the sample entrant on `eco-3-late`, and hard-eco
without its Bandstand paragraph), plus a short probe with the phrasings an entrant would write. Each
source was compiled 3 times, for all three instruments.

## Results

| source | | "walk with my (nearest) minion" rules | tower rules | instruments compiled |
|---|---|---|---|---|
| sample entrant | before | **8 of 8 → `nearest_ally`** | 8 → `nearest_tower` | 8 of 9 (1: a guard with no action) |
| sample entrant | after | 8 of 8 → `nearby_minion` | 8 → `nearest_tower` | 8 of 9 (1: malformed JSON) |
| house hard-eco | before | **1 of 1 → `nearest_ally`** | 1 → `nearest_tower` | **1 of 9** (5: `nearest_enemy_tower`; 3: reply cut at 1,800 tokens) |
| house hard-eco | after | 9 of 9 → `nearby_minion` | 9 → `nearest_tower` (2 via the alias) | **9 of 9** |

The probe prose ("attack their tower", "stay with my teammates", "follow my wave", "push with my
minions") compiled the same before and after: their tower → `nearest_tower` 9 of 9, teammates →
`nearest_ally` 9 of 9, my wave → `nearby_minion` 9 of 9. "Otherwise I push with my minions" was the
fallback, and it became the root default `push_lane` (advance down the lane) every time. No probe
instrument failed.

## What this shows

- **The minion bug is the word "nearest".** Prose that says "my wave" or "an allied minion" was
  already right under vocab-2. Prose that says "my nearest minion" or "the nearest allied minion"
  matched the *name* `nearest_ally`, every time. With the reworded meanings, all 17 such rules
  compiled to `nearby_minion`. The deterministic check (`normalize_targets`) never had to fire in
  these runs. It is there for the samples where the wording alone doesn't hold.
- **`nearest_enemy_tower` is common on the hard prose.** It killed 5 of 9 instruments here, against 3
  of 9 in PR #79's run. After the fix it was written twice and mapped to `nearest_tower` both times,
  each with a `target:` note.
- **The token-cap truncations went from 3 to 0.** That is not something this fix set out to change,
  and with 9 samples a side it may be chance. It is not claimed as a result.
- The remaining failures (a guard with no action, malformed JSON) are other, existing translator
  failure classes, one in nine at most on this prose.

Compile outputs (JSON with transparency markdown) are kept outside the repo, in the scratch dir of
the session that made this record.
