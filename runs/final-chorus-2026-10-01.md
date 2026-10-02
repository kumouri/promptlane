# The Final Chorus on the Jam stack, on Jev — 2026-10-01 run

**Question.** [`docs/fewer-draws-spec.md`](../docs/fewer-draws-spec.md) picked the Final Chorus as
the way to make the game harder to tie without making it longer, and pre-registered a Jev
measurement (§8). Does it raise the decided share on the stack the Jam will ship, without hurting
side fairness, tier order or §9.8's lines?
- **Ruling:** Ceryce approved this run on Thu 10-01 at 17:56 CT ("Yes, after the eco-3 check"). It
  started after #65 confirmed that eco-3 holds on the shipping code.
- **Budget:** she approved $5 (ceiling $7), then raised it at 17:58 CT: "Give it $15."
- **The rule:** `final-chorus-1` (`src/finale.ts`, this PR), off by default.

## Verdict

- **PASS.** The pre-registered primary line passes. Every keep-line passes too.
  - **Decided share:** 18.3 % (11 of 60) without the Final Chorus, **63.3 % (38 of 60)** with it.
  - **Seed-paired difference: +45.0 pp, 95 % CI [+31.7, +58.3].** 28 slots went from drawn to
    decided, and 1 went the other way.
  - **On the 24 slots as first registered:** 12.5 % → 62.5 %, +50.0 pp [+29.2, +70.8].
- **How the Final Chorus arm ended** (60 paired matches):

  | ending | matches |
  |---|---:|
  | a tower lead at 8:00 | 2 |
  | the first tower in sudden death | 36 |
  | still level at 10:00, drawn | 22 |
  | nexus kill | 0 |

  - The mean end was 563 s, and no match ran past 600 s.
  - Without the Final Chorus, all 60 ran to 10:00 and 49 were drawn.
- **Sudden death wasn't a turtle. It wasn't a brawl either: it was a tower race.**
  - From 8:00, bots spent less time at their own fountain (−4.5 pp [−8.0, −1.0]) and more on the
    opponent's side (+2.6 pp [+0.3, +5.0]). PvP damage and fights didn't rise measurably.
  - **The deciding tower:** a bearbot took it in 32 of 36 sudden deaths, always an outer tower. A team
    fight was on within the 20 s before it fell in only 5 of the 36.
  - The bots didn't hit structures harder. The ×3 turned the chip damage they already dealt into a
    tower.
- **Hard won no decided match, with or without the Final Chorus.**
  - **Against medium:** medium won every decided medium–hard match, 2 of 2 without the rule and
    **11 of 11 with it**, playing either side.
  - **Against the entrant:** the entrant won 7 of 7, then 13 of 13.
  - **What the keep-line says:** it reads "hard's share doesn't fall below C0's" and passes (0 % →
    0 %). But the Final Chorus turns an inversion that was already there into results.
  - The free sims had hard winning every decided medium–hard match. **Jev disagrees with the stand-in
    here.**
- **Jev agrees with the stand-in in total, and disagrees on where the gain comes from.**
  - **The sims forecast** C0 ≈ 26 %, C1 ≈ 59 %, Δ +33 pp [+25, +42].
  - **Jev:** 18 %, 63 %, +45 pp [+32, +58]. The intervals overlap. Re-scored open loop, C0's own logs
    give 68 %.
  - **By pairing,** the gain sits in the entrant pairings and in medium beating hard. The sims had it
    in hard beating medium.
- **Recommendation for Sun 10-04: ship `final-chorus-1` on for the Jam,** as §8's decision rule
  proposes. Carry three caveats:
  - house hard, which the next section covers;
  - about a third of matches still draw (22 of 60, and both mirrors);
  - §4.6's finer tiebreak isn't built.

  [Details at the end](#for-sun-10-04). This PR turns nothing on.

## For Sun 10-04

**Ship `final-chorus-1` on for the Jam.**
- **Why:**
  - It passes the primary line by a wide margin: +45 pp, CI wholly above 0, C1 at 63 % (≥ 50 %).
  - It passes on the original 24 slots alone, and on the 36 added ones alone.
  - It moves no keep-line.
  - Nothing before 8:00 changes: the 0:00–8:00 control below is flat on every number.
  - It never makes a match longer.
- **How, on a GO** (a follow-up PR; nothing flips here):
  - set `DEFAULT_FINALE` to `FINAL_CHORUS_1` (`src/finale.ts`);
  - name `final-chorus-1` in the arena's `tournament.finale`;
  - tell entrants the rule: "a tower lead at 8:00 wins; if level, structures take triple damage and
    the first tower to fall wins".
- **Caveats to decide with it:**
  1. **House hard can't take a tower race.**
     - Under the Final Chorus, hard lost every decided match: 0 of 24, against medium and the entrant
       alike.
     - That was already true without it (0 of 9). The eco-3 check had medium beating hard 3–0 too.
     - Now a draw is rarely the shelter, so the house ladder (medium as the placement bar, hard above
       it) would read upside down on results.
     - That's a house-tier question, not a rule question, and this run doesn't establish why hard
       loses the races. It's worth a look before the ladder opens, whichever way the rule goes.
  2. **About a third still draw.**
     - 22 of 60 reached 10:00 level, and so did both hard–hard mirrors. That's 2 of 2 for each arm;
       the sims had 1 decided in 20.
     - §4.6's finer tiebreak (total tower hp, then kills, then captures) would settle most of them,
       but on paper only. It isn't in this PR. §8's decision rule pairs it with a pass, so it's a
       small follow-up if Ceryce wants it.
  3. **Sudden death is a race, not a team fight.**
     - Bots press a little harder: less fountain time, more time on the opponent's side. But fights
       didn't rise measurably.
     - Entrant prose that reads the clock ("all in at 8:00 when level") is what would make it a
       fight. The pilots see `clockSec` today. The spec's optional observation line ("Final Chorus:
       towers take triple damage, first tower wins") isn't built.
- **Ship off** would be the call only if the hard-tier inversion has to be fixed first and can't be
  by Sunday. Even then the rule isn't at fault: without it, hard still never wins a decided match.
  It just draws.

## The run

- **Code:** `feat/final-chorus` at `35dfae1` (this PR's rule commit), on `origin/develop` at
  `074e454` (#65's merge). The sample amendment is `3b166fe`.
- **Backend:** Jev (`jev-latest`; TypeSafe, with Workers AI as the fallback) on one private
  `tools/jev/schema_server.py`.
  - It ran on `:8913`, checked free first, with `--budget-usd 15.00` as the hard stop.
  - No compile and no recompile, so no qwen.
- **Lines (both arms):**
  - `pvp-1`, `--resolution simultaneous-1`, `--targeting own-lane-1`, `--recall recall-2`,
    `--economy eco-3`, `--objective river-2-set10`;
  - cadence 2, full 600 s;
  - develop's `house-{medium,hard}-eco.schemas.json` and `sample-entrant-eco.schemas.json`. House
    sides play the economy-aware prose for their colour.
- **Arms:**
  - **C0** = the lines;
  - **C1** = the lines + `--finale final-chorus-1`.
- **Slots:** played C0 then C1 per slot, 4 at a time, in plan order:
  1. the spec's 24 (medium–hard, hard–medium, medium–entrant, entrant–hard on seeds 3, 7, 11, 23,
     42, 101);
  2. its 2 hard–hard mirrors (seeds 7, 11);
  3. then the amendment's 36 (the same four pairings on seeds 5, 13, 17, 19, 29, 31, 37, 43, 47).
  - The runner is a scratch script, kept in the logs' zip.
- **Smoke:** before the arms, C1's flags, medium–hard, seed 7, 120 s.
  - It cost $0.0210 for 336 Jev requests, with 0 errors, and it replay-verifies.
- **Timeline (CT):**
  - smoke at 18:09;
  - amendment written at 18:11, committed at 18:12:06;
  - first match launched at 18:12:16;
  - last finished at 20:21.
- **One stop and restart, nothing lost:**
  - **What happened:** at 18:22 the runner's budget guard stopped launching slots. It had divided
    spend that included three in-flight matches by the five finished ones, and projected $16.95.
  - **The actual cost** from the eight finished matches was ~$0.099 a match, about $12.3 projected.
  - **What changed:** the guard was fixed to price a match as cost per request times calls per
    finished match. The run resumed 25 s later.
  - **What it cost the sample:** the stop left whole C0/C1 pairs. No match was dropped or replayed,
    and the sample didn't change.
- **Clean run:**
  - 124 of 124 logs replay-verify (`npm run match -- --verify`), and `npm run metrics` reports
    `replay=ok` for all 120 paired logs;
  - 198,971 Jev calls in the logs, with 0 call errors and 0 parse errors;
  - the server served 199,307 requests with 0 errors.
  - **Fallback:** TypeSafe timed out on reads three times, and the server failed over to Workers AI
    each time. So **285 calls (0.14 %) weren't Jev's**. None errored.

### The amendment: a bigger sample, fixed before the first real match

- **What changed:** the spec pre-registered 26 matches an arm. The amendment made it 62, before any
  real match of either arm, and no result had been seen.
- **Reason: Ceryce's budget raise to $15.** The smoke measured the cost, and 62 a side fit about $12.6
  with margin.
- **Recorded in the spec** as §8's last subsection, at 18:11 CT, committed at 18:12:06 (`3b166fe`),
  10 s before the first match.
- **Analysis:** unchanged except for n. The primary line and every keep-line are computed over the 60
  non-mirror slots. The 24 originally registered slots are also reported on their own (above).
- **The sample was never extended.**

## The primary line

Decided = a winner at all, before any finer tiebreak (§4.6 isn't built). Δ = C1 − C0, seed-paired
over slots, with a 95 % percentile bootstrap (10,000 resamples). The pass line is the CI wholly
above 0 **and** C1 ≥ 50 %.

| sample | slots | C0 decided | C1 decided [95 % CI] | Δ C1 − C0 [95 % CI] | pairs up / down | result |
|---|---:|---:|---:|---:|---:|---|
| **amended: all paired slots** | 60 | 18.3 % (11) | **63.3 %** (38) [52, 75] | **+45.0 pp** [+31.7, +58.3] | 28 / 1 | **PASS** |
| as first registered | 24 | 12.5 % (3) | 62.5 % (15) [42, 79] | +50.0 pp [+29.2, +70.8] | 12 / 0 | PASS |
| the 36 added slots alone | 36 | 22.2 % (8) | 63.9 % (23) [47, 78] | +41.7 pp [+22.2, +58.3] | 16 / 1 | PASS |

**By pairing.** Decided counts are out of the slots shown (15 per pairing, 2 for the mirrors); the
free sims' Jam-stack counts are out of 20.

| pairing (violet–green) | slots | C0 decided (winners) | C1 decided (winners) | free sims, base → Final Chorus |
|---|---:|---|---|---|
| medium–hard | 15 | 1 (medium) | **5** (medium 5) | 2 → 15 (hard wins them) |
| hard–medium | 15 | 1 (medium) | **6** (medium 6) | 0 → 16 (hard wins them) |
| medium–entrant | 15 | 2 (medium 1, entrant 1) | **14** (entrant 8, medium 6) | 18 → 20 |
| entrant–hard | 15 | 7 (entrant 7) | **13** (entrant 13) | 11 → 19 |
| hard–hard (mirror, reported only) | 2 | 0 | 0 | 0 → 1 |

- **No match was decided by two or more towers,** in either arm.
- **C0's 11 decided matches** were each one tower up at 10:00.

## The keep-lines

Each fails only if its C1 − C0 CI is wholly on the bad side (§8). Same pairing and bootstrap as above.
The PvP, fight, tower and first-blood lines come from `npm run metrics`. "Deaths under the killer
team's tower" pairs only slots with deaths in both arms; here that is all 60.

| line | C0 | C1 | Δ C1 − C0 [95 % CI] | pass line | result |
|---|---:|---:|---|---|---|
| violet's share of decided matches | 81.8 % (9 of 11; sign test p = 0.065) | **63.2 %** (24 of 38; p = 0.143), CI [47, 78] | −18.7 pp [−42.9, +7.7] | C1 within 30–70 % | **PASS** |
| hard's share of decided medium–hard matches | 0 % (0 of 2) | 0 % (0 of 11) | 0 | not below C0 | **PASS** (see below) |
| PvP damage / min | 361.6 | 370.6 | +9.0 [−6.9, +24.7] | CI not wholly below 0 | **PASS** |
| team fights / match | 3.40 | 3.57 | +0.17 [−0.28, +0.63] | CI not wholly below 0 | **PASS** |
| bot-time under an enemy tower (§9.8) | 7.4 % | 7.4 % | +0.0 pp [−0.3, +0.4] | CI not wholly above 0 | **PASS** |
| deaths under the killer team's tower (§9.8) | 63.3 % | 57.2 % | −6.2 pp [−13.4, +0.8] | CI not wholly above 0 | **PASS** |
| PvP damage taken in neutral ground (§9.8) | 68.4 % | 68.0 % | −0.4 pp [−2.8, +2.0] | CI not wholly below 0 | **PASS** |
| first blood at, s (§9.8) | 151 | 142 | −9.0 [−25.2, +7.1] | CI not wholly above 0 | **PASS** |
| no match longer than 600 s | 600.00 | 600.00 | – | by construction | **PASS** |

- **Side fairness: the violet lean is the entrant's, not the map's.**
  - The design plays the entrant as violet against hard, and as green against medium. The entrant
    won all 13 of its decided matches against hard, so those 13 count as violet wins.
  - Where orientation is balanced, it is even: medium beat hard 5 times as violet and 6 times as
    green.
- **Tier order:** the line passes by its letter. Read plainly, medium won every decided medium–hard
  match in both arms, and the Final Chorus decides more of them. Hard won 0 of the 24 decided
  matches it played in C1 (0 of 9 in C0).
- **Reported, not lines** (C1 − C0):
  - team fights / min +0.031 [−0.020, +0.081];
  - deaths / min +0.082 [0.000, +0.163];
  - bot-time engaged in PvP +0.4 pp [−0.3, +1.0].
- **§9.8's Bandstand lines,** from `--prereg bandstand` (P = C0, O = C1; the full table is in the
  metrics file):
  - captures per match fell, −0.4 [−0.7, −0.1], because matches end earlier, and an opening at 7:30
    can be cut short by the Chorus;
  - contested openings 55.3 % → 56.2 %, team fights at an open Bandstand 1.93 → 1.90;
  - the capture split (the fewer-captures team took ≥ 1) is 21.7 % → 13.3 %. It is under its 50 %
    line in both arms, so the Final Chorus didn't cause that.
  - The team with more captures won 9.1 % → 21.2 % of decided matches. Encore's +15 % helps in the
    race, as the spec expected, but rarely.

## How the matches ended

| arm | matches | tower lead at 8:00 | first tower in sudden death | nexus | 10:00, decided | 10:00, drawn | mean end, s | longest, s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| C0 | 60 | – | – | 0 | 11 | 49 | 600.0 | 600.00 |
| **C1** | 60 | **2** | **36** | 0 | 0 | **22** | **563.2** | 600.00 |
| C0 mirrors | 2 | – | – | 0 | 0 | 2 | 600.0 | 600.00 |
| C1 mirrors | 2 | 0 | 0 | 0 | 0 | 2 | 600.0 | 600.00 |

- **At the Chorus,** 58 of 60 C1 matches were level, and 2 had a lead. Both leads won on the spot.
- **When sudden death ended:** a median 71.5 s after 8:00, within a range of 4.1 to 119.5 s.
- **Every C1 match that reached 10:00 was drawn.** It was level at 8:00, nothing fell, and the
  nexus-hp tiebreak has never fired.
- **The free sims had** 10 matches end at 8:00, 61 in sudden death and 49 at 10:00, of 120 (8 % / 51 % /
  41 %), with a mean end of 556 s. Jev: 3 % / 60 % / 37 %, mean 563 s.

## Sudden death: team fights or a turtle?

**What was compared:** the 58 paired slots where C1 went into sudden death, against C0's same slots
over the same stretch (8:00–10:00). Both arms are replayed tick by tick with every layer attached.
- **Structure damage is in old-scale hp:** a C1 hit after the rescale counts ×3.
- **Control:** 0:00–8:00, where the two arms play the same rules.

| from 8:00 to the end | C0 | C1 | | 0:00–8:00 (control) | C0 | C1 |
|---|---:|---:|---|---|---:|---:|
| window, s per match | 120.0 | 85.8 | | | 480 | 480 |
| PvP damage / min | 325 | 380 | | | 374 | 377 |
| structure damage / min, old-scale | 199 | **473** | | | 106 | 105 |
| … raw hits (C1 ÷ 3) | 199 | 158 | | | | |
| towers fallen / match | 0.14 | **0.62** | | | 0.02 | 0.00 |
| deaths / min | 1.59 | 1.40 | | | 1.55 | 1.61 |
| bot-time at own fountain | 34.6 % | 31.0 % | | | 26.9 % | 27.3 % |
| bot-time under own tower | 29.8 % | 30.8 % | | | 34.6 % | 34.1 % |
| bot-time under an enemy tower | 9.0 % | 8.4 % | | | 6.8 % | 6.9 % |
| bot-time on the opponent's side | 17.7 % | 17.9 % | | | 16.1 % | 16.0 % |
| bot-time in PvP | 8.6 % | 10.0 % | | | 11.4 % | 11.4 % |
| team fights starting / min | 0.28 | 0.42 | | | | |

The pooled bot-time shares are weighted by window length, and C1's windows are shorter. Paired per
slot (C1 − C0, 95 % CI), 8:00 to the end:

| | C1 − C0 [95 % CI] |
|---|---|
| bot-time at own fountain | **−4.5 pp [−8.0, −1.0]** |
| bot-time on the opponent's side | **+2.6 pp [+0.3, +5.0]** |
| bot-time under an enemy tower | +1.9 pp [−0.1, +4.2] |
| team fights starting / min | +0.10 [−0.04, +0.25] |
| PvP damage / min | +13 [−46, +74] |
| bot-time in PvP | +0.2 pp [−1.4, +1.8] |
| raw structure hits / min | +47 [−24, +141] |

- **Not a turtle.** Level teams didn't sit at home: fountain time fell and time across the river
  rose, both with CIs clear of 0. Deaths didn't rise.
- **Not a team-fight finale either.** Fights and PvP damage are up a little, but neither is clear of 0.
- **It is a tower race.** The deciding tower fell to a bearbot in 32 of 36 sudden deaths, and to
  minions in 4. It was always an outer tower, and 23 of 36 were in mid.
  - A team fight was on within the 20 s before the tower fell in **5 of 36**.
  - Raw hits on structures didn't clearly rise. The ×3 turned the chip damage the bots already dealt
    into a tower: 0.62 towers a match in C1's sudden deaths, against 0.14 in the same two minutes
    without the rule.
- **Who won the races: medium 17 and the entrant 19. Hard won none.**

## Jev against the stand-in

| | free sims (oracle, Jam stack) | Jev, this run |
|---|---|---|
| C0 decided | 26 % | 18.3 % |
| C1 decided | 59 % | 63.3 % |
| Δ [95 % CI] | +33 pp [+25, +42] | **+45 pp [+32, +58]** |
| endings: 8:00 lead / sudden death / 10:00 | 8 % / 51 % / 41 % | 3 % / 60 % / 37 % |
| mean end | 556 s | 563 s |
| medium–hard, decided matches won by hard | all of them (31 of 31) | **none (0 of 11)** |
| medium–entrant decided, base | 18 of 20 | 2 of 15 |
| hard–hard mirrors decided | 1 of 20 | 0 of 2 |

- **In total, Jev agrees with the stand-in.** The direction is the same, the size overlaps (Jev's is
  larger), and the mix of endings is close.
- **Open loop agrees too.** §8 asked for C0's own logs re-scored under the Final Chorus, with behaviour
  held fixed, computed before C1 was read. They give **68.3 %** decided: 2 on a lead, 39 in sudden
  death and 19 still level. Jev closed loop gave 63.3 %.
- **On composition, Jev disagrees plainly.**
  - **Medium against hard:** the stand-in had hard winning every decided match. Jev has medium winning
    every one, and far fewer of them are decided.
  - **The entrant against medium:** the stand-in had that pairing already decided at base. On Jev it
    is the pairing the Final Chorus moves most (2 → 14 of 15).
- **What that means:** the oracle's 97 % per-decision fidelity didn't carry the tier ranking through
  closed loop. Any later pre-screen of house-tier balance on the oracle should be read with that in
  mind.

## Before 8:00 the arms are the same game

- **Not one pair is identical through 7:55.** The C0 and C1 matches of a slot first differ at a
  median of 105 s (50–360 s). C1 changes nothing before 8:00, so this is Jev's own nondeterminism:
  the same observation can get a different answer.
- **So the pairing is by slot, not by trajectory.** In aggregate, the arms agree before 8:00 on every
  number in the control table above, for example structure damage 106 vs 105 hp/min and PvP 374 vs
  377.

## Spend

**$12.3117** by the server's ledger, against the $15.00 hard stop. The first approval was $5, with
a $7 ceiling.

| | Jev calls | cost |
|---|---:|---:|
| smoke (120 s) | 336 | $0.0210 |
| C0, 62 matches | 102,311 | $6.3200 ($0.102 a match) |
| C1, 62 matches | 96,660 | $5.9709 ($0.096 a match) |
| **total** | 199,307 requests | **$12.3117** |

- **How the arms were split:** by each arm's calls in its logs, at the run's mean cost per request.
  The ledger itself is one total.
- **C1 is cheaper** because its matches end earlier.

## Files and logs

- **This page,** and [`final-chorus-2026-10-01-metrics.md`](final-chorus-2026-10-01-metrics.md):
  `npm run metrics` on the 60 paired slots, C0 against C1, with §9.8's `--prereg bandstand` table.
- **The 124 logs and the smoke aren't in git.** They are on the
  [`data-final-chorus-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-final-chorus-2026-10-01)
  prerelease as `final-chorus-match-logs-2026-10-01.zip`: 11.9 MB, 175 MB raw, sha256
  `f9662f13cc1dca7a5cfaeabbebbb99f287ca9aba01881af428b7a1bd018f05de`. It has a
  `runs/final-chorus-2026-10-01-SHA256SUMS`, and `runs/final-chorus-2026-10-01-analysis/` holds:
  - the metrics JSON;
  - the plan;
  - the scratch runner, the window probe and the analysis script behind the numbers here.
- **Log names:** `runs/final-chorus-2026-10-01-<C0|C1>-<violet tier>-<green tier>-seed<N>.json`.
- **To use them,** unzip at the repo root of a checkout with `final-chorus-1`, then:

```sh
npm run match -- --verify runs/final-chorus-2026-10-01-C1-entrant-hard-seed43.json
npm run metrics -- --group C0 runs/final-chorus-2026-10-01-C0-{medium-hard,hard-medium,medium-entrant,entrant-hard}-seed*.json \
  --group C1 runs/final-chorus-2026-10-01-C1-{medium-hard,hard-medium,medium-entrant,entrant-hard}-seed*.json --prereg bandstand
# one match, as played here (C1; drop --finale for C0):
python tools/jev/schema_server.py --port 8913 --budget-usd 15.00
npm run match -- --a house:medium --a-schemas prompts/pilots/house-medium-eco.schemas.json --name-a medium \
  --b house:hard --b-schemas prompts/pilots/house-hard-eco.schemas.json --name-b hard \
  --jev-schema http://127.0.0.1:8913/ --seed 7 --map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 \
  --recall recall-2 --economy eco-3 --objective river-2-set10 --cadence 2 --finale final-chorus-1 --out runs/x.json
```
