# Better bots: siege with the wave, close out in sudden death, shop — 2026-10-02

**Question.** Ceryce, 2026-10-02 13:11 CT: "Work on better bots." Since PR #79, every vocab-2 match
on Jev has been a draw with no tower down. The bots should play like they're trying to win: push with
the wave, take towers, shop, trade sensibly, and produce decisive matches.
- **Budget:** Jev spend hard stop of **$3.00** for the whole job (Margo's cap). Everything that can
  be done at $0 is done first. Jev is spent only on the block in §1.4, and that plan is committed
  before the first paid match.
- **Out of bounds:** the translator's shopping-line path (`fix/vocab2-shopping-not-rules`, another
  job); `src/sim`; the vocab-1 prompt; medium (the placement bar), which stays byte for byte.

## Verdict

*Written after the run. §1 was committed before the first paid match.*

(pending)

## 0. Diagnosis, at $0

### 0.1 Why vocab-2 matches draw

These are from the recorded Jev logs of PR #79 (40 matches) and PR #82 (6 matches), replayed on this
branch. Every log replay-verifies.

- **Towers barely get touched before 8:00.** In the 18 hard–medium matches, the most-damaged tower
  on each side had lost a mean of **131** (hard's damage to medium) and **117** (medium's to hard) of
  its 900 hp at 7:59. A tower never regenerates, so this chip is all the pressure there was.
- **Sudden death then nearly decides it.** At 8:00 the Final Chorus divides every tower's hp by 3
  (`src/finale.ts`), and the first tower to fall wins. In 11 of the 14 drawn hard–medium matches, a
  medium tower ended between 18 and 179 of its 300 hp. The draws are near-misses.
- **What hard does instead (Jev, P block):**
  - Bandstand rules: 20.7 % of its alive time (contest 11.2 %, opening soon 5.6 %, open 3.9 %).
  - The tower rule ("an enemy tower in sight and an allied minion near"): 7.5 %.
  - Its three Bandstand rules sit right after the low-hp pair, above every lane rule.
- **The entrant (PR #82, vocab-2):** 195 structure damage a match, and it died 19.8 times a match, 113
  of 119 times under an enemy tower while channelling its own recall. #84 changed the prose, but no
  vocab-2 schema of it is checked in. The one PR #82 played (`entrant2`) is the old prose.
- **Easy never shops:** 0.17 purchases per bot per match against medium and hard. It ends with a
  median of 550 gold unspent, because "you never go home just to shop" and it never gets low enough
  to walk home.

The game's numbers behind this, all from `src/` (unchanged):
- A tower has 900 hp and deals 18 a second. It shoots the oldest enemy minion in range first, and a
  bearbot only when none is in range. Its range is 160.
- An uncontested wave of three minions gives about 11 s of cover and deals about 70 hp.
- A bot alone under a tower dies in 7–12 s. So a tower falls only to repeated, covered visits that add
  up over several waves, or to a sudden-death push on a tower already chipped.

### 0.2 A model-free stand-in for Jev (screening only)

To compare strategies at $0, a scratch oracle stands in for Jev. It is a schema server that answers
each compiled question with a deterministic predicate on the observation. The tower facts and the fight
verdict come from the repo's own `tools/jev/vocab.py`, so it reads the same numbers the description
states. It plays through the real `npm run match` path: the same pilot, the same description, the same
target resolution. Only the yes/no answers differ.

- **Calibration against Jev's recorded answers** (PR #79 and #82 logs, 76,931 decisions): the fired
  rule matched Jev's on 100 % of easy's decisions, 87 % of medium's, 86 % of hard's and 73 % of the
  old entrant2's.
  - "Near" is 260 (any listed minion).
  - "An enemy tower in sight" counts the tower lines out to 390 under vocab-2, and 260 under vocab-1.
  - A per-question answer rate fitted from the logs adds Jev-like noise.
- **It is not a forecast.** Replaying PR #79's blocks, it decides more matches than Jev did
  (hard–medium: 78 % against 22 %). It also overstates the pre-8:00 tower damage by about 1.8×. So it is
  used only to rank variants against each other. Every claim in the verdict comes from Jev (§2).

### 0.3 What the stand-in ranked (12 matches against medium, 6 against easy, each variant)

Hand-written vocab-2 cascades over the house rules' own wordings:

| variant | vs medium: decided, W–L | deaths/match | medium's weakest tower hp lost at 7:59 |
|---|---|---:|---:|
| hard-eco today | 83 %, 8–2 | 12.3 | 236 |
| siege rule ("inside an enemy tower's range while it has my minions to shoot first"), no sudden-death rush | 33 %, 3–1 | 2.8 | 393 |
| siege above the minion fight, no rush | 50 %, 4–2 | 2.5 | 425 |
| **siege above the minion fight + the 480 s tower rush above the "tower will shoot me" retreat** | **92 %, 11–0** | 3.7 | 314 |
| the same with the Bandstand rules at the top | 33 %, 3–1 | 4.1 | 161 |
| the same with the Bandstand rules last (no wave to push) | 100 %, 11–1 | 2.6 | 317 |

- **Without the rush, the mirror never decides:** the siege-only cascade against itself drew 6 of 6.
  With the rush it decided 10 of 12.
- **Bandstand-first halves the siege:** time spent walking to the river is time not spent with the
  wave.
- **Hard-eco, spliced variants:**
  - Swapping only its tower rule for the siege rule: 7–4 against medium, 12.3 deaths a match.
  - Also moving its three Bandstand rules to after its wave rule: **12–0, 4.5 deaths a match**.
- **Easy with one shopping rule** ("can afford the next item and no enemy in sight → recall"):
  - it spends 1,600–2,500 gold a match per side, against roughly 150–900 before;
  - it still draws medium 6 of 6 and loses to every pusher, so the ladder holds.

## 1. Method (written and committed before the first paid match)

### 1.1 What changes

All three are prose edits plus a compile, as an entrant's would be.
- **`house-hard-eco.prose.md`:**
  - The "Take the objective" rule becomes "Siege with your wave": if you are inside an enemy tower's
    range and that tower has your own minions in range to shoot first, attack the nearest enemy
    tower.
  - The Bandstand paragraph moves from right after the low-hp pair to right before the fallback
    ("when your lane gives you nothing to do").
  - Everything else is unchanged.
- **`house-easy-eco.prose.md`:** "You never go home just to shop" goes. Instead, "When you can afford the
  next item on your shopping list and no enemy is in sight, recall home to buy it", right after the
  low-hp pair. Easy stays easy: no abilities, no pushing, and it holds at its tower.
- **New `sample-entrant-siege.prose.md` (vocab-2):** a credible baseline an entrant can learn from. It
  does the low-hp pair, shops when safe, attacks a tower after 480 s, steps out of tower fire, sieges
  with the wave, fights bearbots then minions, walks with the wave, and pushes otherwise. The economy
  measurement's `sample-entrant-eco.*` pair stays as it is (`tools/match/measure_economy.mjs`
  plays it).
- **Medium (the placement bar) does not change.** The plain tiers and their qwen side files don't
  change either.

### 1.2 How the schemas are made (`compile.py --vocab vocab-2 --economy eco-3-late --backend ollama`, $0)

House tiers are spliced as before (PRs #71, #79): only the changed rules are taken from a compile.
Every other rule object, the notes, the build and the root default are kept byte for byte.

- **Easy:** three compiles. For each instrument, take the first sample whose rule for the new
  sentence asks only "can afford the next item" and "no enemy in sight", and recalls. It goes in
  right after the low-hp pair.
- **Hard:** three compiles, with the Bandstand paragraph left out. Hard's Bandstand rules are spliced
  anyway, and with them the cascade overruns the translator's 1,800-token reply. For each
  instrument, take the first sample whose siege rule asks both of these, and attacks
  `nearest_tower`:
  - "inside an enemy tower's range";
  - that the tower has this bot's own (my, its, this bot's) minions in range.

  It replaces the old tower-with-minion rule in place. The three Bandstand rules move, byte for byte,
  to right after the wave rule (`push_with_wave` / `push_wave`).
- **Fallback for both:** if no sample compiles a rule for an instrument, another instrument's rule
  object is used. The rules are instrument-agnostic, as in PR #79.
- **Sample entrant:** up to eight whole compiles, each instrument taken from the first sample in
  which it passes all of these:
  - (a) the low-hp pair: move home with an enemy in sight, then recall with none, both "below half";
  - (b) the 480 s rule attacks `nearest_tower` and comes before (c);
  - (c) "will an enemy tower shoot this bot" → `own_tower`;
  - (d) the siege rule asks "inside an enemy tower's range" and names this bot's own minions, and
    attacks `nearest_tower`;
  - (e) an enemy bearbot → `nearest_enemy_bearbot`, and an enemy minion → `nearest_enemy_minion`;
  - (f) walking with the wave → `nearby_minion`, never `nearest_ally`;
  - (g) no rule names a shop item, and no rule except the low-hp pair and the shop rule goes home;
  - (h) the shop rule asks "can afford the next item" and "no enemy in sight", and recalls;
  - (i) the root default (or a catch-all last rule) is `push_lane`;
  - (j) the build is the prose's list.

  If an instrument passes in no sample, the sample that fails fewest of these is used, and that is
  reported.

### 1.3 Stand-in check before Jev ($0)

The spliced schemas play the oracle (§0.2) against medium, easy, hard and each other before the Jev
block, to catch a splice or compile that plays nothing like its hand-written twin. It is not a gate on
results.

### 1.4 The Jev block

- **Code:** `feat/better-bots` at this commit, plus the spliced schemas (committed before the block).
- **Backend:** Jev on one private `tools/jev/schema_server.py` on `:8991`, with `--budget-usd 2.95`.
  The live arena's `:8790` and `:8797` are not touched.
- **Smoke, free:** `--stub` on `:8992`, 120 s at seed 7, every pairing, before the real block.
- **Lines (every match):** `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall
  recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`, full
  600 s.
- **Sides:**
  - `entrant3`: `sample-entrant-siege` (new);
  - `hard`, `easy`: the new eco schemas;
  - `medium`: `house-medium-eco.schemas.json`, unchanged.

**The sample: 20 matches, in this order, 4 at a time.**

| block | pairings (violet–green) | seeds | matches | baseline (Jev) |
|---|---|---|---:|---|
| **A** entrant vs the placement bar | entrant3–medium, medium–entrant3 | 3, 7, 11 | 6 | — (no vocab-2 entrant has played medium) |
| **B** entrant vs easy | entrant3–easy, easy–entrant3 | 3, 7, 11 | 6 | PR #82: 0 of 6 decided, 195 structure damage, 19.8 deaths a match |
| **C** hard vs medium | hard–medium, medium–hard | 3, 7, 11 | 6 | PR #79 P: 4 of 18 decided (hard 3, medium 1) |
| **D** easy vs medium | easy–medium, medium–easy | 3 | 2 | PR #79 C: 0 of 4 decided |

- **Spend guard:**
  - The runner stops launching once spent so far plus the mean cost of a finished match × the matches
    in flight passes **$2.80**.
  - The server stops at $2.95.
  - Blocks run in the order above, so a cut takes D first.
- **Never extended.** No match is added or replayed after any result is seen. A match that crashes
  before it finishes is retried once.
- **Decided** means a winner by any end reason.

**The lines.**
1. **Decisive (A + B, 12 matches):** PASS iff at least 6 are decided. Baseline 0 of 6 (B's pairing).
2. **The entrant takes towers (A + B):** PASS iff entrant3 destroys at least one tower in at least 5
   of the 12. Reported beside it: entrant3's structure damage a match (baseline 195).
3. **The entrant doesn't feed (B):** PASS iff entrant3 dies at most 10 times a match against easy.
   Baseline 19.8.
4. **Hard above medium (C):** PASS iff at least 3 of 6 are decided and hard wins at least 2/3 of the
   decided ones. Baseline: 4 of 18 decided.
5. **Ladder guard (C + D):** easy wins none of D's decided matches, and medium wins under half of C's
   decided matches.
6. **Easy shops (B + D, easy's 8 matches):** PASS iff both hold:
   - easy's bots spend a mean of at least 300 gold a match (baseline about 50 against medium and
     hard);
   - the median unspent gold at the end is below 400 (baseline 550).
7. **Clean:** all matches finish and replay-verify, with 0 server errors and 0 parse errors.
8. **Spend:** at most $3.00 in all, by the server's ledger.

**Reported, not lines:**
- end reasons and match length;
- structure damage, deaths, gold spent and unspent, and towers taken, per side;
- the most-damaged tower's hp at 7:59;
- time by rule for hard and entrant3;
- the share of entrant3's decisions per rule, and how often the siege rule fired.

Jev is not deterministic (PR #37), so a seed doesn't replay a baseline match. Comparisons are block
against block.

## 2. Result

(pending)

## 3. What Ceryce may want to decide

(pending)

## Files

(pending)
