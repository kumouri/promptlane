# Tower hp cuts and a bot structure-damage multiplier on the base-tower maps — 2026-10-02

**Question.** Ceryce, 2026-10-02 22:45 CT: "Look into lowering tower health a tad more, 50 or 100 points.
Alternatively raising damage (and commensurately HP of everything ELSE in the game, unless we just add a
flat multiplier to player attacks against towers or something).." #99 (`feat/bots-push-to-base`) found no
base kill in 34 Jev matches: no inner tower fell before the 8:00 Final Chorus, so the base tower never
opened in time ([`bots-push-to-base-2026-10-02.md`](bots-push-to-base-2026-10-02.md) §2.4).

- **Budget:** Jev hard stop **$4.00**. $0 work first: replays of recorded logs, and #96/#99's calibrated
  stand-in, which ranks and is never a result. Jev only on §1.3's blocks, committed before the first paid
  call.
- **Base:** #99's branch (open), so every bot carries the push-to-base rule.
- **Out of bounds:** `src/sim` (frozen); the live arena and its backend (`:8790`, `:8797`); the main
  checkout; other jobs' branches (`fix/vocab2-rule-order`, `feat/vocab2-and-node`).

## Verdict

*Written after the run. §0–1 were committed (`187bee4`, 23:17 CT) before the first paid call.*

- **Neither "a tad" of tower hp nor a flat damage multiplier gives base kills.**
  - **At $0:** 0 of 1,800 stand-in sims, over every cut (outer, inner, base; −50 and −100, alone and
    together) and every multiplier (×1.1, 1.2, 1.33). That held under the 8:00 Chorus, a 9:00 Chorus, no
    Chorus, the arena with eco-3, and on pvp-2. The 54 recorded Jev logs project 0 as well.
  - **On Jev:** 0 of 30, for the two best candidates.
- **The two candidates, and why** (§0.7): all tiers −100 (`pvp-1-hp200-400-base600`) and bot →
  structure ×1.33 (`pvp-1-hp300-base700-sd133`). They opened the most base towers at $0 (26 and 25 in
  90), and they are her two mechanisms.
- **What they do change, on Jev:**
  - The first lane tower falls at a median **3:01** (all −100) and **4:02** (×1.33), against **6:02** on
    the same 10 slots of #99 (`pvp-1-hp300-base700`).
  - Under the Jam, more matches end at 8:00 on a tower lead: 7 of 10 in each, against 5 of 10. The rest
    end in sudden death, as before.
  - Every Jam match still lasted 8:00 or more, so neither is trivially short.
- **Why there are still no base kills:**
  - Under the Jam, no inner tower fell before 8:00 in 20 matches, so the base tower never opened.
  - With the economy on and no Chorus (EA), five base towers opened, with 57–144 s left. They lost 17–103
    of their 600 hp.
  - After those openings the attackers' answered decisions went to the 8:00 close-out 375 times, the
    low-hp walk or recall 247 times, and the push-to-base rule 23 times, of 688. The bots were hurt or
    busy; the base tower's hp was not what saved it.
- **Multiplier versus cut** (§0.2): minions do 40 % of an outer tower's damage and almost none of a base
  tower's. So ×1.33 is worth about −50 hp on an outer tower, −100 on an inner and −175 on the base tower.
  On Jev it put the first tower down about a minute later than the cut (4:02 against 3:01): a minion wave
  on its own chips a tower no faster under the multiplier.
- **The Chorus:** a later Chorus or none opens more base towers at $0 (8:00: 0–1 per 30; 9:00: 0–6; none:
  2–10) but kills none.
- **Ladder** (A + K + EA, 30 matches):
  - medium beat easy 6–0, and the siege entrant beat easy 6–0;
  - hard against medium went 1–3–2, so "medium ≤ hard" is not shown here (#99: 3–1–2);
  - the siege entrant went 1–4–1 against medium and 1–5 against hard.
- **Spend: $3.6605 of the $4.00 stop**, on the server's ledger. 30 matches, all three blocks whole, 0
  errors, 0 parse errors, 3 TypeSafe calls failed over to Workers AI. All 30 logs replay-verify.

| block (Jev, 10 each; #99's seed-3 slots) | map | base kill | Chorus lead | sudden death | 10:00 decided | draw | first tower <8:00 (median, earliest) | inner tower down | base opened (time left) | finished | median len | deaths a match |
|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|
| #99 J, seed 3 (Jam) | `pvp-1-hp300-base700` | 0 | 5 | 5 | — | 0 | 8 (6:02, 3:43) | 1 (8:07, ended it) | 1 (0 s) | 0 | 8:00 | 5.0 |
| **A** (Jam) | `pvp-1-hp200-400-base600` | **0** | 7 | 3 | — | 0 | 8 (**3:01**, 2:32) | 0 | 0 | 0 | 8:00 | 5.4 |
| **K** (Jam) | `pvp-1-hp300-base700-sd133` | **0** | 7 | 3 | — | 0 | 8 (**4:02**, 3:23) | 0 | 0 | 0 | 8:00 | 4.8 |
| #99 E (arena + eco-3) | `pvp-1-hp300-base700` | 0 | — | — | 7 | 3 | 7 (6:19, 4:28) | 2 (9:29, 9:36) | 2 (30, 23 s) | 0 | 10:00 | 8.2 |
| **EA** (arena + eco-3) | `pvp-1-hp200-400-base600` | **0** | — | — | 7 | 3 | 8 (**3:04**, 2:32) | 5 (7:35–9:02; 1 before 8:00) | 5 (57–144 s) | 0 | 10:00 | 7.8 |

## 0. What was built and screened, at $0

### 0.1 The two levers

- **Tower hp cuts.** A map variant's `towerHp` and `baseTower.hp`, as #93 and #96 did. Screened: outer,
  inner and base each −50 and −100 on their own, and all three together (−50, −100). "A tad" means these
  two steps, nothing bigger.
- **A bot structure-damage multiplier** (her "flat multiplier to player attacks against towers"): a new
  map field, `botStructureDamage` (`src/structureDamage.ts`).
  - Every point of hp a bearbot's attack or ability takes off an enemy tower, base tower or nexus is
    followed by `k − 1` more. Minion damage, tower damage, bot-on-bot and bot-on-minion damage, and every
    hp, are unchanged.
  - It wraps the sim's two private bot-damage methods (`approachAndAttack`, `tryUseAbility`) on the match
    instance, from outside the frozen sim, inside `attachMapRules`. So it runs after the resolution and
    before anything that hears hits: the economy, tower aggro and the metrics tool all see one hit of k×.
  - The base tower's protection still undoes it on a protected base tower. In sudden death the Chorus's
    ×3 is an hp rescale, so a bot's hit there is 3k× its old share.
  - Absent, or 1, attaches nothing. A log records the variant whole, so it replays under the rule it was
    played with. All 54 recorded base-map Jev logs (#96, #99) replay-verify on this branch.
  - Screened at k = 1.1, 1.2, 1.33.
- **pvp-2's base map, scaled the same way:** `pvp-2-hp400-base950` is `pvp-1-hp300-base700` × 1.37 (#99
  §0.3), so each pvp-1 cut × 1.37: −70 and −140. The multiplier is the same k.

### 0.2 Who damages towers, and why a cut and a multiplier differ

On the 54 recorded base-map Jev logs (`cf_shares.py`), before 8:00:

| tower | bot damage | minion damage | minion share |
|---|---:|---:|---:|
| outer | 23,358 | 15,855 | **40 %** |
| inner | 2,299 | 540 | 19 % |
| base (whole match) | 183 | 0 | 0 % |

A multiplier speeds up only the bots' share; a cut speeds up both. So for structure kills:

- **×1.33 on an outer tower is worth about −50 hp:** 0.6 × 1.33 + 0.4 = 1.2× the damage, the same as
  300 → 250.
- **On an inner tower it is worth about −100:** 0.81 × 1.33 + 0.19 = 1.27×, as 500 → 395.
- **On the base tower it is worth about −175:** bots do all of it, so 700 → 526.
- **What that means in play:** a minion wave chips an outer tower on its own, with no bot near. With a
  cut, an unattended outer tower falls to the waves earlier; with the multiplier it falls no earlier
  unless a bot commits to it. In the stand-in's Jam cell, all −100 put the first lane tower down at a
  median **4:05**; ×1.33, which hits the deeper towers as hard, at **5:59** (baseline 5:22, §0.4). The
  multiplier rewards a push; the cut rewards waiting.

### 0.3 From the recorded logs (`cf_collect.mjs`, `cf_project.py`)

Each recorded log is replayed exactly, with attribution, and every tower's damage is kept by source and
second, in the original hp scale (a hit in sudden death counts ×3). For a variant, a tower falls at the
first second its recorded damage, k × bot + minion, reaches its new hp.

- The first fall is exact up to the moment play would have diverged. After it, two readings bracket what
  the bots would do:
  - **rec:** the recorded play continues unchanged (pessimistic);
  - **shift:** a lane's inner-tower damage starts as much earlier as its outer tower fell earlier, and the
    base tower's as much earlier as it opened earlier (optimistic).
- **A base tower that its recorded match never opened has no damage to replay,** so the logs undercount
  base kills by construction. The stand-in (§0.4) carries that question.
- Every baseline row reproduces its logs' recorded counts exactly.

| logs (n) | candidate | first tower <8:00 (median) | inner <8:00 rec / shift | base opened, shift (median) | base kills | ends, shift |
|---|---|---|---|---|---:|---|
| Jam, base700: #99 J + #96 N (20) | baseline | 15 (6:32) | 0 / 0 | 1 (8:07) | 0 | lead 11, SD 9 |
| | outer −100 | 19 (3:40) | 0 / 1 | 1 (7:34) | 0 | lead 17, SD 2, unresolved 1 |
| | inner −100 | 15 (6:32) | 0 / 0 | 1 (8:06) | 0 | lead 11, SD 9 |
| | base −100 | 15 (6:32) | 0 / 0 | 1 (8:07) | 0 | lead 11, SD 9 |
| | all −100 | 19 (3:40) | 0 / 1 | 1 (7:33) | 0 | lead 17, SD 2, unresolved 1 |
| | ×1.33 | 16 (4:36) | 0 / 1 | 1 (7:34) | 0 | lead 13, SD 5, unresolved 2 |
| arena + eco-3, base700: #99 E + E′ (12) | baseline | 9 (6:30) | 0 / 0 | 3 (9:30) | 0 | 10:00 12 |
| | all −100 | 10 (3:41) | 0 / 4 | 6 (5:54) | 0 | 10:00 12 |
| | ×1.33 | 10 (4:26) | 0 / 4 | 6 (7:06) | 0 | 10:00 12 |
| Jam, pvp-2 base950: #99 P (10) | baseline | 10 (6:10) | 0 / 0 | 1 (9:10) | 0 | lead 8, SD 2 |
| | all −140 | 10 (4:29) | 0 / 1 | 1 (7:48) | 0 | lead 10 |
| | ×1.33 | 10 (5:28) | 0 / 0 | 1 (8:53) | 0 | lead 8, SD 2 |

"Unresolved" is a match the recorded play ended at 8:00 on a lead that the variant levels: there is no
recorded play after it. Every −50 row and the other single-tier rows sit between these; the full table
(also #96's AN and NF) is `cf-proj.md` in the data kit.

- **Under the Jam, no candidate gets more than one inner tower down before 8:00 in 20 logs,** even on the
  optimistic reading. A base kill under the Chorus needs outer, inner and base all down before 8:00 (a
  lead at 8:00 ends the match, and in sudden death the inner tower's own fall ends it first).
- Cutting only the base tower changes nothing before it opens, and it never opens in time.

### 0.4 The stand-in screen (1,800 sims; ranking only, never a result)

#88's model-free stand-in for Jev (`pl_oracle_server.py`, with #99's base-tower atom and #96's fitted
rates) in Jev's seat, #99's shipped bots, the same 10 pairings × seeds 3, 7, 11 as #99's stand-in: 30 sims
per cell. Every candidate is a whole variant object (unregistered; the log records it). It overstates
pre-8:00 tower damage by ~1.8× (#88 §0.2), so it errs toward more towers falling, not fewer. All 1,800
replay-verify.

**Base kills: 0 of 1,800.** Every candidate, under every Chorus setting (8:00, 9:00, none), on the arena +
eco config, and on pvp-2.

**Jam (Chorus 8:00), base700** (`J`):

| candidate | Chorus lead | sudden death | first tower <8:00 (median) | inner ever | base opened | ladder: m–e; h–m; entrant3–e |
|---|---:|---:|---|---:|---:|---|
| baseline | 20 | 10 | 22 (5:22) | 0 | 0 | 6–0; 4–2; 6–0 |
| outer −50 | 23 | 7 | 28 (5:29) | 0 | 0 | 6–0; 5–1; 6–0 |
| outer −100 | 22 | 8 | 27 (4:53) | 1 (8:58) | 1 | 6–0; 6–0; 6–0 |
| inner −50 | 18 | 12 | 18 (7:02) | 0 | 0 | 6–0; 5–1; 6–0 |
| inner −100 | 18 | 12 | 20 (6:38) | 0 | 0 | 6–0; 4–2; 6–0 |
| base −50 | 19 | 11 | 22 (5:45) | 1 (8:10) | 1 | 6–0; 4–2; 6–0 |
| base −100 | 25 | 5 | 27 (5:53) | 0 | 0 | 6–0; 5–1; 6–0 |
| all −50 | 25 | 5 | 27 (5:51) | 0 | 0 | 6–0; 5–1; 6–0 |
| **all −100** | 24 | 6 | **30 (4:05)** | 1 (8:48) | 1 | 6–0; 4–2; 6–0 |
| ×1.1 | 22 | 8 | 24 (5:45) | 0 | 0 | 6–0; 6–0; 6–0 |
| ×1.2 | 22 | 8 | 23 (5:29) | 0 | 0 | 6–0; 5–1; 6–0 |
| **×1.33** | 23 | 7 | 27 (5:59) | 1 (8:55) | 1 | 6–0; 5–1; 6–0 |

Every match ends at 8:00 or in sudden death right after it. No inner tower falls before 8:00 in any of
these 360 sims; the few that fall come in sudden death and end the match.

**Inner towers down (base towers opened) where there is time after 8:00**, 30 sims each:

| candidate | Chorus at 9:00 (`L`) | no Chorus (`F`) | arena + eco-3 (`E`) | all three (median opening per cell) | draws, F + E |
|---|---:|---:|---:|---:|---:|
| baseline | 4 | 4 | 3 | 11 (9:08–9:34) | 17 |
| outer −50 | 0 | 6 | 5 | 11 | 13 |
| outer −100 | 1 | 4 | 5 | 10 | 17 |
| inner −50 | 3 | 5 | 7 | 15 | 15 |
| inner −100 | 4 | 8 | 10 | 22 (8:45–9:07) | 21 |
| base −50 | 4 | 4 | 6 | 14 | 12 |
| base −100 | 4 | 2 | 3 | 9 | 10 |
| all −50 | 3 | 10 | 6 | 19 | 20 |
| **all −100** | 4 | 10 | 12 | **26** (8:53–9:20) | 13 |
| ×1.1 | 2 | 4 | 4 | 10 | 20 |
| ×1.2 | 3 | 7 | 7 | 17 | 14 |
| **×1.33** | 6 | 8 | 11 | **25** (8:41–9:12) | 13 |

- Inner towers fall at a median 8:10–9:42 in every cell. Two inner towers fell before 8:00 in 1,440 pvp-1
  sims (one each under all −100 and ×1.33, both with no Chorus).
- **pvp-2 (`P`, Jam):** no candidate opened more than 2 base towers in 30; base kills 0. Its first tower
  falls later than on pvp-1 (baseline median 7:13; all −140 4:36; ×1.33 5:12).
- Full tables (every cell, every column, the ladder per pairing): `stand/tables.md` in the data kit.

### 0.5 When a base tower did open, how close it came

Of the 199 stand-in sims where an inner tower fell (`cf_shares.py` on their replays):

- the base tower had a median **25 s** left when it opened; 38 had a minute or more, 2 had two minutes;
- it lost a median **12 hp** after opening (30 hp in the 38 with a minute or more);
- the most any lost was **27 %** of its hp (173 of 650, all −50, Chorus at 9:00).

So no tad of hp or damage gets the base tower near a kill. It opens late, and when it is open the bots
don't commit to it in numbers: the push rule sits below "an enemy tower will shoot you → fall back" (#99
§0.1), and the base tower shoots a lone bot for 18 a second.

### 0.6 The Chorus

- **A later Chorus adds openings, not base kills.** At $0 the Chorus at 9:00 opened 0–6 base towers per
  30 where the 8:00 Chorus opened 0–1; with no Chorus at all, 2–10. Base kills stayed 0 in all three.
- From the recorded logs that played past 8:00 with no Chorus (#99 E, E′; #96 AN, NF; 24 logs), applying
  a Chorus at 8:00 or 9:00, or none, gives 0 base kills for every candidate on either reading.
- So on these bots the Chorus is not what stands between the base tower and a kill: without it, the inner
  tower still falls after ~9:00 and the base tower then stands.

### 0.7 The candidates for Jev, and why

Her goal is decisive matches that end by taking the base more often, not trivially short ones. No
candidate produced a base kill at $0, so the ranking is by what a base kill needs first, an inner tower
down with time left, and then by how decisive matches are:

1. **all −100** (`pvp-1-hp200-400-base600`): the most inner towers down where time allows (26 of 90),
   the first tower before 8:00 in 30 of 30 under the Jam, and among the fewest draws without a Chorus (13
   of 60). It is the biggest cut she named.
2. **×1.33** (`pvp-1-hp300-base700-sd133`): next (25 of 90), the same draw count, and the most openings
   under a 9:00 Chorus (6). It is her other mechanism, and it differs where §0.2 says it should: the first
   tower falls later (5:59) because waves alone don't speed it.

The other candidates opened fewer base towers than these two, and the base-only cuts did nothing a base
tower that never opens can show. Neither candidate is trivially short: under the Jam, every stand-in match
still runs to 8:00. Both are registered (`src/mapVariant.ts`, opt-in; `DEFAULT_MAP` stays `pvp-1`), with
their pvp-2 twins (`pvp-2-hp260-560-base810`, `pvp-2-hp400-base950-sd133`), which are screened at $0 only.

## 1. Method (written and committed before the first paid call)

### 1.1 What is compared

- **Code:** `feat/tower-tune-base-maps` at this commit, on #99's `31b4b60` (which merges develop through
  #98).
- **Sides:** #99's bots as shipped: `entrant3` = `sample-entrant-siege`, `medium` = `house-medium-eco`,
  `hard` = `house-hard-eco`, `easy` = `house-easy-eco`.
- **Every match:** `--resolution simultaneous-1 --targeting own-lane-1 --cadence 2`, the full 600 s, and:
  - **jam** (#90 §4.2, #93, #96, #99): `--recall recall-2 --economy eco-3-late --objective river-2-set10
    --finale final-chorus-1`. The Jam ruleset, finale on, economy on.
  - **arenaeco** (#99's E): `--economy eco-3 --recall recall-2 --objective none --finale none`. The live
    arena's config with the economy the go/no-go gate would ship; plays to 10:00.
- **Baselines, already paid for:** #99's J at seed 3 (the same 10 slots, `pvp-1-hp300-base700`, Jam) and
  #99's E (the same 10 slots, arenaeco). #99's blocks played its first base-tower wording, fixed in
  #99 §1.4–1.5 and on this branch; that changes play after 8:00, not the tower counts before it.

### 1.2 What is measured (every block, from the logs; tower times from exact replays)

1. **How matches end:** base kill, Chorus lead, sudden death, 10:00 decided, draw.
2. **First lane tower and first inner tower down:** how many before 8:00, median, earliest.
3. **Base towers opened (time left), and how many were finished;** the base tower's hp lost after it
   opened.
4. **Length:** median and shortest.
5. **Ladder:** easy < medium ≤ hard, and the siege entrant against each; W–L per pairing.
6. **Hygiene:** every match finishes and replay-verifies; 0 server errors; 0 parse errors.
7. **Spend** ≤ $4.00 on the server's ledger.

**Forecast (§0), so the result can be read against it:** no base kill in any block. In A and K, every
match ends at 8:00 on a lead or in sudden death, with no inner tower down before 8:00; the first lane tower
falls earlier in A than in K. In EA, a few inner towers fall after ~9:00 and their base towers stand.

### 1.3 The Jev blocks

- **One paid server:** a private `tools/jev/schema_server.py` (TypeSafe, `jev-latest`, with its Workers AI
  failover) from this worktree on `:9741`, `--budget-usd 3.90`: the backstop under the $4.00 stop. A free
  `--stub` server on `:9742` ran the smokes: one 120 s match per block's map and config, all three
  replay-verified.
- **Order and slots** (violet–green, all seed 3; #99's E order, which is its J's seed-3 slots):
  entrant3–medium, medium–entrant3, hard–medium, medium–hard, medium–easy, easy–medium, entrant3–hard,
  hard–entrant3, entrant3–easy, easy–entrant3.

| # | block | map | config | matches |
|---|---|---|---|---:|
| 1 | **A** | `pvp-1-hp200-400-base600` (all −100) | jam | 10 |
| 2 | **K** | `pvp-1-hp300-base700-sd133` (×1.33) | jam | 10 |
| 3 | **EA** | `pvp-1-hp200-400-base600` | arenaeco | up to 10, as the budget allows |

- **The spend guard** (`tt_jev.mjs`, #99's `ng_jev.mjs` pointed at this worktree): waves of up to 4, block
  by block. Before each wave it launches the first k slots where ledger spend + k × m ≤ **$3.80**; m is
  the most expensive finished match of this block, else of the run, else $0.15. Once a slot is cut,
  nothing after it runs, so a cut takes EA's last slots first. The write-up says how many of EA ran.
- **Estimate:** A $1.25 and K $1.25 (#99's J: $0.119 a match); EA $0.137 a match (#99's E), so about 9 of
  its 10 fit under the guard. About $3.7 in all.
- **Never extended.** No match is added or replayed after any result is seen. A match that crashes before
  it finishes is retried once.
- Jev is not deterministic (PR #37), and Jev replays easy's matches near-identically. The blocks are
  directions, not rates.

## 2. Result

*Written after the run.*

### 2.1 The run

- **Timeline (CT, 2026-10-02):**
  - the plan was pushed at 23:17 (`187bee4`);
  - A ran 23:17–23:27, K 23:27–23:37, EA 23:37–23:50, in plan order.
  - The guard never cut a slot. Nothing was retried, added or replayed.
- **Clean:**
  - 30 of 30 logs replay-verify (`--verify`), plus the 3 stub smokes;
  - 0 parse errors and 0 call errors on either side;
  - 0 server errors; 3 TypeSafe calls failed over to Workers AI (the same Jev model), 0 fallback errors.
- **Spend: $3.6605** on the paid server's ledger (`health-9741-final.json`): A $1.1537, K $1.1616, EA
  $1.3452. 44,918 requests.

### 2.2 How matches end, slot for slot

Winner and end, then (first lane tower down; first inner tower down). Times are exact, from replays.

| slot (violet–green, seed 3) | #99 J | A | K | #99 E | EA |
|---|---|---|---|---|---|
| entrant3–medium | medium, SD 8:07 (5:35; inner 8:07) | medium, lead 8:00 (5:00) | medium, lead 8:00 (5:04) | medium, 10:00 (8:03) | medium, 10:00 (3:30) |
| medium–entrant3 | entrant3, SD 8:01 (8:01) | medium, SD 8:06 (4:37) | entrant3, lead 8:00 (4:09) | entrant3, 10:00 (6:06) | draw, 10:00 (5:08) |
| hard–medium | hard, SD 8:14 (3:43) | medium, SD 8:07 (8:07) | medium, SD 8:07 (8:07) | draw, 10:00 (9:20) | draw, 10:00 (8:54) |
| medium–hard | medium, SD 8:10 (8:10) | hard, SD 8:08 (8:08) | medium, SD 8:13 (8:13) | draw, 10:00 (8:57) | draw, 10:00 (8:54) |
| medium–easy | medium, lead 8:00 (6:34) | medium, lead 8:00 (2:32) | medium, lead 8:00 (4:02) | medium, 10:00 (6:09; inner 9:29) | medium, 10:00 (2:32; inner 7:35) |
| easy–medium | medium, lead 8:00 (6:34) | medium, lead 8:00 (2:32) | medium, lead 8:00 (4:02) | medium, 10:00 (6:34) | medium, 10:00 (2:32; inner 8:35) |
| entrant3–hard | hard, lead 8:00 (5:26) | hard, lead 8:00 (3:00) | entrant3, SD 8:06 (3:23) | entrant3, 10:00 (5:27) | hard, 10:00 (3:06; inner 9:02) |
| hard–entrant3 | entrant3, SD 8:08 (4:11) | hard, lead 8:00 (3:00) | hard, lead 8:00 (3:50) | draw, 10:00 (6:06) | hard, 10:00 (2:34) |
| entrant3–easy | entrant3, lead 8:00 (6:30) | entrant3, lead 8:00 (3:01) | entrant3, lead 8:00 (3:57) | entrant3, 10:00 (6:30; inner 9:36) | entrant3, 10:00 (3:01; inner 8:09) |
| easy–entrant3 | entrant3, lead 8:00 (4:28) | entrant3, lead 8:00 (3:01) | entrant3, lead 8:00 (3:58) | entrant3, 10:00 (4:28) | entrant3, 10:00 (3:01; inner 8:08) |

### 2.3 Against the questions (§1.2)

1. **How matches end:**
   - **Base kills: 0 of 30.**
   - A and K: every match ended at 8:00–8:14, 7 on a tower lead and 3 in sudden death each (#99 J's
     same slots: 5 and 5).
   - EA: every match ran to 10:00, 7 decided by the tower count and 3 drawn, as in #99 E.
2. **First towers:**
   - A lane tower fell before 8:00 in 8 of 10 in every block. The two that didn't are hard–medium and
     medium–hard, where even an outer tower of 200 stood until sudden death.
   - Median first tower: A 3:01, K 4:02, EA 3:04, against 6:02 (J) and 6:19 (E) on #99's base map.
   - **No inner tower fell before 8:00 in A or K.** In EA five fell, at 7:35, 8:08, 8:09, 8:35 and 9:02
     (#99 E: two, at 9:29 and 9:36).
3. **Base towers opened, and finished:**
   - 5 opened (all EA), none finished. They opened with 144, 111, 111, 85 and 57 s left and lost 103, 17,
     36, 35 and 33 of 600 hp.
   - After the openings, the attackers' 688 answered decisions went to the close-out 375 times, the
     low-hp walk 183, recall 64, the shop 23, the push-to-base rule 23, hard's weakened-tower rule 16 and
     the fall-back 3 (`tt_opened.py`; another 2,050 decisions were cached repeats with no reply).
   - The push-to-base rule's condition was right: yes 677 of 688 times while the enemy base tower could be
     hit, and 0 of 12,860 while it couldn't. It won only when nothing above it did.
4. **Length and deaths:**
   - Median 8:00 (A, K) and 10:00 (EA); shortest 8:00 under the Jam.
   - Deaths a match: A 5.4, K 4.8 (#99 J's slots 5.0); EA 7.8 (#99 E 8.2).
5. **Ladder** (A + K + EA):
   - medium beat easy 6–0 (A 2–0, K 2–0, EA 2–0);
   - hard against medium 1–3–2 (A 1–1, K 0–2, EA 0–0–2). Every one of these six matches was decided in
     sudden death or drawn: neither side takes a tower before 8:00 in this pairing;
   - the siege entrant: easy 6–0; medium 1–4–1; hard 1–5.
6. **Hygiene: PASS** (§2.1).
7. **Spend: PASS**, $3.6605.

### 2.4 Against the forecast

The forecast (§1.2) held: no base kill in any block, no inner tower before 8:00 in A or K, and a few late
inner towers in EA whose base towers stood. Two things came out stronger than the stand-in said:

- **The first tower fell much earlier on Jev than in the stand-in's cells** (A 3:01 against the stand-in's
  4:05; K 4:02 against 5:59), though the stand-in overstates pre-8:00 tower damage. The 10 slots are seed 3
  only, and Jev replays easy's matches nearly identically: these are directions, not rates.
- **EA's earliest opening (7:35, 2:24 left) is the most time any base tower has had open in this line of
  work** (#96: 107 s, #99 E′: 50 s). It lost 103 of 600 hp.

### 2.5 Caveats

- 10-match blocks at one seed. Directions, not rates.
- #99's baselines played its first base-tower wording (#99 §1.4); A, K and EA play the fixed wording and
  the resolver fallback. That touches play after 8:00, so the sudden-death results and EA's post-opening
  decisions are of the bots with the fix. The pre-8:00 tower times are not affected.
- The stand-in ranks; it is never a result. Its tables are $0 evidence for the choice of candidates, not
  for the Jev numbers.
- Nothing bigger than −100 or ×1.33 was screened: she asked for "a tad".

## 3. What Ceryce may want to decide

1. **Whether to keep either map, for what it does do.** Neither gives base kills. Both bring the first
   tower forward (3:01 / 4:02 from 6:02) and turn more Jam matches into an 8:00 tower lead. If earlier
   first towers are wanted on the base map:
   - all −100 lets minion waves alone take more of a tower;
   - ×1.33 speeds up only towers a bot commits to.
   Both are opt-in; `DEFAULT_MAP` stays `pvp-1`.
2. **What would give base kills.** Each is unmeasured on Jev:
   - **The bots after an opening.** The close-out (above the push rule after 8:00) and the low-hp rules
     won 558 of 688 answered decisions; the push rule won 23. A push rule that outranks the close-out once
     the base tower is open, or a close-out that names the base tower, is a bot change, not a balance one.
   - **An inner tower before ~7:00 under the Chorus.** A Jam base kill needs outer, inner and base down
     before 8:00. No candidate here got an inner tower down before 8:00 under the Jam, at $0 or on Jev.
   - **More than a tad.** #99's stand-in with inner towers at 300 (−200) also gave none under the Chorus.
3. **The Chorus.** At $0, moving it to 9:00 opens more base towers (0–6 per 30, against 0–1) and removing
   it more still (2–10), but neither kills one with these bots. Not worth moving for base kills alone.
4. **Keep the multiplier code?** `botStructureDamage` is opt-in, inert unless a map carries it, and
   tested. It is the clean way to make bots matter more against structures without touching minions.

## Files

- `src/structureDamage.ts`: `attachStructureDamage`.
- `src/mapVariant.ts`: `botStructureDamage`; `PVP_BASE_TOWER_HP_CUT_MAP` (`pvp-1-hp200-400-base600`),
  `PVP_BASE_TOWER_SD133_MAP` (`pvp-1-hp300-base700-sd133`), and their pvp-2 twins.
- `src/mapRules.ts`: attaches the multiplier.
- `tools/jev/vocab.py`: the four names in `MAPS`, `MAP_GEOMETRY`, `TELEPORT_MAPS`, `BASE_TOWER_MAPS`.
- **Tests:** `tools/match/test_structure_damage.mjs` (new, in `test:match`); `tools/jev/test_vocab.py`.
- **Docs:** `docs/arena-runbook.md` (`tournament.map`), `docs/vocabulary-spec.md` §8.14's map list,
  `cli.mjs` / `compile.py` help.
- **Logs, not in git.** On the
  [`data-tower-tune-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-tower-tune-2026-10-02)
  prerelease:
  - the 30 paid logs, `runs/tower-tune-2026-10-02-<block>-<violet>-<green>-seed3.json` (block A, K or EA),
    and the 3 stub smokes;
  - `runs/tower-tune-2026-10-02-analysis/`:
    - `stand/`: the 1,800 stand-in sims, their exact falls (`falls.jsonl`), `tables.md` and `summary.json`,
      and the damage streams of the 199 where an inner tower fell (`cf-opened.jsonl`);
    - `cf-99.jsonl`, `cf-96.jsonl`, `cf-proj.md` / `cf-proj.json`: the recorded logs' damage streams and
      §0.3's projection;
    - `jev/`: falls, `tables.txt`, `summary.json`, `shares.txt`, the run log and the server's final `/health`;
    - the kit: `cf_collect.mjs`, `cf_project.py`, `cf_shares.py`, `tt_stand.mjs`, `make_tt_plans.py`,
      `tt_summary.py`, `tt_jev.mjs`, `make_jev_plan.py`, `tt_opened.py`, `slot_table.py`, the plans, and #99's
      `ng_replay.mjs`, `ng_falls.mjs`, `pb_analyze.py`, `pb_opened.py`, `pl_oracle*.py`, `rates.json` they use.

  To check a log, unzip at the repo root and run `npm run match -- --verify <log>`.
