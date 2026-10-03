# Hard above the push-lane medium — 2026-10-02

**Question.** Ceryce, 2026-10-02 17:57 CT: "…And keep the new medium and tune hard to be above it."
#90 §4's push-lane medium (`0df793dd…`, merged in `0588e35`) beat hard 2–0 on Jev. The ladder must
order easy < medium < hard:
- on the lower tower hp of `runs/tower-hp-2026-10-02.md` (`pvp-1-hp400`, branch
  `feat/tower-hp-tune`);
- on today's default, pvp-1, so the ladder holds either way.

Also reported: hard against the siege sample entrant, which has never played on Jev.

- **Budget:** one Jev hard stop of **$4.00** shared with the tower-hp job, on one server ledger. The
  plan for every paid match is that file's §1.3, committed before the first paid match. This file's
  lines are below.
- **Out of bounds:** medium (byte for byte), easy, the entrants, the translator, and the live arena.

## 0. Diagnosis, at $0

### 0.1 Where medium beats hard (#90 §4's two Jev matches, replayed)

- Medium stood in hard's half of the map 355–380 s a match; hard stood in medium's 215–301 s.
- Hard spent 6–10 % of its time punishing tower divers, at its own tower, while medium was pushing.
- Neither side's weakest tower lost more than 330 before 8:00. Both matches went to sudden death,
  and medium took the first tower.
- Hard's two "your side is weaker → leave" rules and its Bandstand rules are the obvious
  differences from medium. Medium has neither.

### 0.2 What the stand-in ranked ($0, ranking only)

#88's model-free stand-in for Jev, with #90's fixed atoms, played 12 matches a cell against medium
(both side orders × 6 seeds). It is noisy (±3 in 12) and is never a result.

| hard variant (rule objects deleted or moved, nothing compiled) | outer 400 | 900 |
|---|---:|---:|
| today's hard | 6–6 | — |
| without the two "weaker → leave" rules | 6–6 | — |
| … and the diver rule moved below the siege | 5–7 | — |
| without the Bandstand rules | 7–5 | — |
| without both | 8–4 | — |
| without both, diver moved | 5–7 | — |

No deletion or move separates from noise. The lever the lower hp opens is different: **finishing a
tower the wave has already chipped.** A hand-written rule, "an enemy tower in sight has less than
150 hp → attack the nearest enemy tower", right after the shopping pair, was ranked next. The
stand-in got a matching atom for it.

| against medium, 12 matches | outer 400 | 900 (today) |
|---|---:|---:|
| today's hard | 7–5 | **2–10** |
| + the weakened-tower rule | **8–4** | **7–5** |
| + the rule, without the Bandstand rules | 7–5 | 8–4 |

On 900 it fires in sudden death, where every tower drops to a third and 150 is half an outer tower.
The one-sentence version is taken. Dropping the Bandstand too adds nothing measurable.

### 0.3 The change

- **`house-hard-eco.prose.md`, one new paragraph** after "Go shopping, out of reach": "Take a
  weakened tower. If an enemy tower in sight has less than 150 hp, attack the nearest enemy tower."
- **Why 150:** it is under half an outer tower at 400. A tower deals 18 a second, and to a bearbot
  only when no minion stands in its range, so a bot at more than half hp outlasts the few seconds it
  takes. On 900 it fires only in sudden death.
- **Above the "tower will shoot me" fallback** (and the 480 s rush), so a near-dead tower is finished
  rather than walked away from. **Below the low-hp pair**, so a hurt bot still leaves first.
- **`house-hard-eco.schemas.json`, spliced as in PRs #71, #79 and #88:**
  - only the new rule comes from a compile;
  - it goes in at position 5 of each instrument, after the shopping recall;
  - every other rule object, the notes, the build and the root default stay byte for byte.
- **The compile ($0, `compile.py --vocab vocab-2 --economy eco-3-late --backend ollama`):**
  - **n1**, the whole prose without the Bandstand paragraph (#88's way), failed on all three
    instruments: every reply was cut off at the translator's 1,800-token reply cap. Another job is
    removing that cap; it isn't merged.
  - **m1**, a copy cut to the intro, the shopping list, the low-hp pair, the shopping pair, the new
    sentence and the fallback, compiled all three. Each turned the sentence into one rule that
    attacks `nearest_tower`:
    - drums and keytar: "is an enemy tower in sight AND does it have less than 150 hp?";
    - violin: "is an enemy tower in sight with less than 150 hp?".
- **Stand-in check of the spliced schema** (8 matches a cell, both side orders × 4 seeds; ranking
  only):

| pairing | outer 400 | 900 |
|---|---:|---:|
| new hard vs medium | 6–2 | 3–5 |
| new hard vs entrant3 | 5–3 | 6–2 |
| new hard vs easy | 8–0 | 8–0 |
| today's hard vs entrant3 (for reference) | 4–4 | 6–2 |

  On 900 it is within the stand-in's noise. This is why the pre-registered lines below are on Jev,
  on both maps.
- `tools/arena/test_house.mjs` pins the sentence and the rule's place. The pilots README describes
  it.

## 1. Method (written and committed before the first paid match)

The blocks, the server, the flags, the smoke and the spend guard are
`runs/tower-hp-2026-10-02.md` §1.3 (on `feat/tower-hp-tune`). `hard2` is this branch's hard at
this commit. `medium`, `easy` and `entrant3` are develop's, unchanged.

| line | blocks | pass | fail | otherwise |
|---|---|---|---|---|
| **H1, hard above medium, outer 400** | HA (6) | hard2 wins ≥ 4 | medium wins ≥ 3 | INCONCLUSIVE |
| **H2, hard above medium, pvp-1 (today's default)** | HB (4) | hard2 wins ≥ 3 | medium wins ≥ 2 | INCONCLUSIVE |
| **H3, medium above easy, outer 400** | T's medium–easy, easy–medium | medium wins both, or one with a draw | easy wins either | INCONCLUSIVE |
| **H4, clean** | HA, HB, HC | every match finishes and replay-verifies; 0 server errors; 0 parse errors | any of those | — |

- On pvp-1, medium above easy is #90 §4's M3. It passed 2–0 with this medium and this easy, so it is
  cited, not re-run.
- **The ladder holds on a map** iff that map's H line and medium-above-easy line both pass.
- **Reported, not lines:**
  - **HC, hard2 against entrant3** (4 matches, never played on Jev before): W–L, how it was won;
  - the old hard against medium on outer 400 (block T's two), beside HA;
  - the weakened-tower rule's share of hard2's time, Jev's yes-rate on its question against the
    stated fact (an enemy tower listed within 390 with hp under 150), and the structure damage it
    dealt;
  - deaths, structure damage and towers taken per side.

Matches cut by the spend guard count as not played, and a line short of its matches is
INCONCLUSIVE.

## 2. Result (hard2)

*Written after the run.* Plan commits, then pushed: tower-hp `662b405`, this branch `0969def`, both
18:41 CT. The first paid match started 18:42:52 CT.

- **The block:** T, HA, HC and HB all played, in plan order, 18:42–19:08 CT. The guard never cut a
  slot, and nothing was retried, added or replayed.
  - 22 matches for **$2.7320** on the server's ledger, 30,872 requests, 0 errors, 0 failovers.
  - 22 of 22 logs replay-verify, with 0 parse errors on either side.

| line | result | pass line | |
|---|---|---|---|
| H1 hard above medium, outer 400 (HA) | hard2 **2–4** | hard2 ≥ 4 | **FAIL** (medium ≥ 3) |
| H2 hard above medium, pvp-1 (HB) | hard2 **1–3** | hard2 ≥ 3 | **FAIL** (medium ≥ 2) |
| H3 medium above easy, outer 400 (T) | medium **2–0** | medium both | **PASS** |
| H4 clean | 14 of 14 verify; 0 errors | all | **PASS** |

- **Reported:**
  - HC: hard2 beat entrant3 **3–1**.
  - Block T's old hard lost both to medium on outer 400 (0–2).
- **The new rule did its job.** Jev answered its question yes on 1.9 % of 9,852 asks, where the
  stated fact (an enemy tower listed within 390, under 150 hp) held on 2.6 %. Agreement was 99.3 %.
  It took 1.1 % of hard2's time in HA and dealt **52 %** of hard2's structure damage there (40 % in
  HC, 25 % in HB).
- **Why hard2 still lost** (Jev, per match, HA / HB):
  - Medium took the first tower. Hard2 rarely had a chipped tower to finish.
  - Hard2 stood under its own tower 727 / 744 s (three bots summed), where medium stood 653 / 647 s.
    Hard2 stood in the enemy half 242 / 258 s, medium 332 / 347 s.
  - Medium won the bearbot trade, 2,767 to 2,509 and 2,968 to 2,555. Medium's keytar chords any
    bearbot in sight; hard's abilities only finish kills under 100 hp.
  - Hard spent 10–11 % of its time chasing the enemy worth the most gold, and 7 % at its own tower
    punishing divers.

  The new rule works, but hard's other rules keep it behind its wave.

## 3. Amendment: hard is medium plus the rule (committed after §2's results were seen, before its own first paid match)

§2 failed both hard lines with $1.27 of the $4.00 left. As #90 §4 and #91 §1.6 did, one follow-up
block is pre-registered here before its first paid match. §2's results stand as measured.

### 3.1 What changes

- **hard3 = the push-lane medium, rule for rule, plus §0.3's rule.**
  - **The prose** is medium's, word for word, with a hard intro ("…you play the placement opponent's
    game and you finish what it leaves standing…") and "Take a weakened tower. If an enemy tower in
    sight has less than 150 hp, attack the nearest enemy tower." right after the shopping pair.
  - **The schemas:** medium's rule objects, build, notes and default byte for byte, with hard2's
    compiled weakened-tower rule object (m1) spliced in after the shopping recall. Nothing new was
    compiled, because every rule object is already a compile of its own sentence.
- **Why this shape:** medium against itself is a coin flip, so anything hard3 gains comes from the
  one rule. It is the narrowest change that can put hard above this medium, and it is a clean test of
  the rule.
- **Stand-in check ($0, ranking only):** hard3 against medium went **10–2** on outer 400 and **6–6**
  on 900 (12 a cell). Hard3 against easy went 4–0 on each.
- **Gone from the economy-aware hard:** hunting the carrier, the 300-gold retreat, punishing divers,
  "weaker → own tower", the Bandstand rules and hard's own drums ladder. The plain hard
  (`house-hard.*`) is unchanged.
- `test_house.mjs` pins hard as medium plus the rule. `prompts/pilots/README.md` and
  `docs/economy-spec.md` §4.4 follow it.

### 3.2 Block HD (Jev)

- §1's server (`:9561`, its ledger at $2.7320, its `--budget-usd 3.90`), flags, stub smoke and spend
  guard ($3.80; the prior is $0.124 a match, §2's measured mean). Waves of 4.

| block | map | slots | matches |
|---|---|---|---:|
| **HD-a** | `pvp-1-hp400` | hard3–medium: 3, 7; medium–hard3: 3, 7 | 4 |
| **HD-b** | `pvp-1` | hard3–medium: 3, 7; medium–hard3: 3, 7 | 4 |

| line | pass | fail | otherwise |
|---|---|---|---|
| **H1′, hard3 above medium, outer 400 (HD-a)** | hard3 wins ≥ 3 | medium wins ≥ 2 | INCONCLUSIVE |
| **H2′, hard3 above medium, pvp-1 (HD-b)** | hard3 wins ≥ 3 | medium wins ≥ 2 | INCONCLUSIVE |
| **H4′, clean** | every match finishes and replay-verifies; 0 server errors; 0 parse errors | any of those | — |

- **Medium above easy** is H3 on outer 400 (§2, passed) and #90 §4's M3 on pvp-1 (passed).
- **Hard3 above easy is not re-run on Jev.** Hard3 is medium plus one rule, and medium beats easy on
  both maps.
- **If H1′ and H2′ pass,** hard3 ships on this branch. Otherwise the branch still carries hard3, the
  write-up says hard is not above medium, and Ceryce chooses between hard3, §2's hard2 (`0969def`) and
  develop's hard.
- Matches cut by the guard count as not played. Nothing is added after a result is seen.
