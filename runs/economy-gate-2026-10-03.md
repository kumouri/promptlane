# The economy's §6 gate on Jev — 2026-10-03 run

**Question.** [`docs/economy-spec.md`](../docs/economy-spec.md) §6 pre-registered the lines the
economy has to pass before the Jam: 4 conditions × 2 pairings × 12 seeds = 96 matches on Jev, B1 read
against A. Does `eco-2` pass them? Which lines can this run still answer now that
[`side-fairness-2026-10-01.md`](side-fairness-2026-10-01.md) has shown `pvp-1` favoured violet? And
is the one tuning pass §6.2 allows warranted, and with which knob?

## Verdict

- **Every line that measures what the economy is for passes, with the CI clear of zero.** The PvP
  share of bot damage more than doubles. Bots engage more and first blood comes 74 s sooner. The
  economy doesn't pay for dives. Lead changes hold, PvP pays most of the earned gold, and bots buy
  2–3 items and shop on purpose.
- **Three level lines miss, all narrowly. None is a winner read, so all three stand:**
  - income is **128.4** gold/min/bot against a band of 85–125 (high);
  - the first item comes at **4:44** against a line of ≤ 4:30;
  - the gold gap at 6:00 is **0.261** of team gold against a line of ≤ 0.25.
- **Two lines can't be scored: `decided` and the comeback rate.** Both are winner reads, and all 96
  matches timed out, so every result is the tower-count tiebreak that the pre-`simultaneous-1` order
  hands to violet. They are invalid either way: `decided` reads as a fail and comeback as a pass.
- **The decision surface is in use.** B1 differs from B0 on every economy behaviour, with the CIs
  clear of zero, so bots aren't ignoring the economy.
- **§13's first-item concern is confirmed.** Medium vs hard, the smoke's pairing, has its first item
  at **5:07**, against the smoke's 5:08.
- **The one tuning pass is warranted.** Use `gold.start` 0 → 100, as §13.1 named, together with
  `kill` 400 → 250 and `assistPool` 200 → 125. Then re-run B1 only. `gold.start` alone would push
  income further over the band, because start gold is paid as passive income (below).
- **Recommendation for Sun 10-04: GO on the economy.** Details are in
  [the last section](#go--no-go-for-sun-10-04). The Bandstand is judged on its own gate; nothing here
  scores it.

## The run

- **Job** `20261001-041534-9b9a`, `tools/match/measure_economy.mjs --date 2026-10-03`.
- **Code:** played on `9356d22` (after #54, before #56). Every log is `sequential`: none carries a
  `resolution` field.
- **Setup:** `pvp-1`, cadence 2, full 600 s, 12 seeds (3, 5, 7, 11, 13, 17, 23, 29, 31, 37, 42, 101).
- **Pairings:** medium is violet in every match. Hard or the sample entrant is green.
- **Conditions:**
  - A: no economy;
  - R: `respawn-1`;
  - B0: `eco-2` with today's prompts;
  - B1: `eco-2` with the eco house tiers and `sample-entrant-eco`.
- **Results:** 96 of 96 exited 0 and all 96 replay-verify (`npm run metrics`, `replay=ok`).
  **All 96 ended on timeout**, so §13.3's finding holds for every condition.
- **Backend:** one `schema_server.py` with a $9.50 cap. It served 155,948 requests with 1 error.
  - It failed over to Workers AI 7 times: 6 TypeSafe read timeouts and 1 TypeSafe 529.
  - Each failover sends that call and the next 10 s to Workers AI. So a small slice of decisions,
    about 70 s of server time out of the run's hours, was not Jev's.
- **Cost:** **$7.3161** by the server's own ledger. That is $0.076 a match, against the $7.5–8.5
  §13.5 expected and Ceryce's $10. No Jev spend in this write-up.

## The pre-registered lines (§6.2), scored

B1 vs A, seed-paired, n = 24 pairs, 95 % bootstrap CI. The figures are from
[`economy-measure-2026-10-03-metrics.md`](economy-measure-2026-10-03-metrics.md), and the economy
medians are from its `--json`.

**"Side bias"** says whether the line survives the pre-#56 violet tilt:
- **stands:** a paired comparison of like with like, or a level read that is not about who won;
- **invalid:** a winner read.

### Existing `matchValues` metrics

| line | pass line | A | B1 | B1 − A [95 % CI] | result | side bias |
|---|---|---:|---:|---|---|---|
| PvP share of bot damage | CI above 0 | 20.1 % | 51.4 % | **+31.3pp** [+25.9, +37.1] | **pass** | stands |
| bot-time engaged in PvP | CI > 0 on one, neither < 0 | 8.5 % | 14.3 % | **+5.8pp** [+3.6, +7.8] | **pass** | stands |
| team fights (per match; per min = ÷ 10) | (same line) | 2.54 | 3.88 | +1.33 [−0.21, +2.92] | (not below 0) | stands |
| first blood rate | not lower | 95.8 % | 100 % | +4.2pp [+0.0, +12.5] | **pass** | stands |
| first blood at | earlier | 243 s | 174 s | **−73.8 s** [−111.7, −39.4] | **pass** | stands |
| `decided` (non-draw share) | not lower | 79.2 % | 50.0 % | −29.2pp [−54.2, −4.2] | fail as measured | **invalid** |
| deaths under the killer team's tower (share) | CI not above 0 | 80.8 % | 75.2 % | −6.7pp [−15.5, +2.0] | **pass** | stands |
| deaths dealt by a tower (share) | CI not above 0 | 55.4 % | 40.5 % | −16.1pp [−30.0, −1.2] | **pass** | stands |
| lead changes / match | ≥ 50 % of A's | 1.08 | 1.17 | +0.1 [−0.9, +1.0] (108 % of A) | **pass** | stands |
| swinginess | not collapsed | 135 | 476 | +341 [+281, +406] | **pass** | stands |

### New economy metrics (B1 alone)

| line | pass line | B1 median | medium vs hard | medium vs entrant | result | side bias |
|---|---|---:|---:|---:|---|---|
| gold / min / bot | 85–125 | **128.4** (range 88.1–196.0; 9 of 24 in band, 15 above) | 113.7 (9 / 12 in band) | 155.8 (0 / 12) | **fail (high)** | stands |
| PvP share of earned gold | ≥ 35 % | **78.6 %** (lowest 57.3 %) | 65.0 % | 88.0 % | **pass** | stands |
| items per bot at the end | ≥ 2 | **3** (mean 2.44; 1 of 144 bots ended with none) | 3 | 3 | **pass** | stands |
| first item at | ≤ 4:30 | **4:44** (284 s; 12 of 24 ≤ 4:30) | 5:07 (1 / 12) | 3:11 (11 / 12) | **fail** | stands |
| carried gold at death | 50–300 | **156.5** (range 67–269) | 194.0 | 132.3 | **pass** | stands |
| shopping recalls, medium and hard | > 0 | medium **4.42** a match (in 24 of 24), hard **4.50** (in 12 of 12) | | | **pass** | stands |
| \|gold diff\| ÷ team gold @ 6:00 | ≤ 0.25 | **0.261** (max 0.603; 12 of 24 above) | 0.376 (8 / 12 above) | 0.153 (4 / 12) | **fail** | stands (below) |
| comeback: behind at 5:00 wins | ≥ 20 % of decided | 8 of 12 = 66.7 % | 4 of 5 | 4 of 7 | pass as measured | **invalid** |

**Notes on the readings:**

- **Spec medians vs the md's means.** The economy rows of the metrics md are means, and §13.2 says
  so. The spec's lines are medians, read from the `--json`.
  - On first item, the two straddle the line: the mean of per-match medians is 265 s (4:25), and the
    median is 284 s (4:44). The spec's median is what's scored.
  - On income, the mean is 135.5 and the median 128.4. Both are over the band.
- **Tower deaths: the shares fell, the count didn't.** Deaths per minute tripled with respawn.
  Tower deaths per minute went 0.13 (A) → 0.29 (R) → 0.31 (B1). Respawn alone accounts for that rise.
  On these shares, B0 − R and B1 − B0 are flat: their CIs straddle 0.
- **Lead changes.** A's "gold" is the metrics proxy (A has no ledger), and B1's is the real ledger.
  That is the comparison §6.2 pre-registered.
- **Shopping recalls.** §13.2's caveat holds: medium's 75 %-of-max low-hp recall counts when it
  happens to buy. Hard's 4.50 in B1 (1.00 in B0) is unambiguous.

### Why `decided` and comeback are invalid here, and the gold gap is not

- **All 96 matches timed out, so the winner is the tower-count tiebreak.** Violet took the first
  tower in all 24 A matches, and A's 19 decided matches all went to violet.
- **The comeback "pass" is the tilt working.** In B1's medium vs hard, hard (green) led on gold at
  6:00 in 9 of 12 matches. Yet all 5 decided matches went to violet (medium), and 4 of those 5 count
  as comebacks.
- **`decided` is confounded twice.**
  - Respawn alone moves it −54.2pp [−79.2, −25.0] (R − A): with no respawn, a dead bot stays dead.
  - B1's 50 % against R's 25 % is the economy's own effect, and it points up. But it is still a
    tiebreak on a tilted map, so it is not scored.
- **The gold gap is a level read, not a winner read.** It is also not one the tilt can explain. In
  the pairing that fails, medium vs hard at 0.376, the leader at 6:00 was green in 9 of 12: the side
  the tilt works *against*. If anything, the tilt narrowed it. So the gap fail stands.
- **Income could move a little under `simultaneous-1`.** Violet's minion surplus pays last hits. But
  last hits are only 9.3 of B1's 135.5 gold/min/bot, so the income fail stands too.

## Where the change comes from: R − A, B0 − R, B1 − B0

The three steps are seed-paired on the same 24 pairs, so their mean differences add up exactly to
B1 − A. R has no gold ledger, so its gold, swinginess and lead-change rows are 0 by construction,
and B0 − R says nothing about them. The full tables are in
[`economy-measure-2026-10-03-metrics.md`](economy-measure-2026-10-03-metrics.md) (vs A),
[`economy-measure-2026-10-03-b0-vs-r.md`](economy-measure-2026-10-03-b0-vs-r.md) and
[`economy-measure-2026-10-03-b1-vs-b0.md`](economy-measure-2026-10-03-b1-vs-b0.md).

| metric | R − A (respawn) | B0 − R (gold, prompts unchanged) | B1 − B0 (economy-aware prompts) | B1 − A |
|---|---|---|---|---|
| PvP share of bot damage | +16.2pp [+11.0, +21.5] | +1.6pp [−0.7, +4.1] | **+13.5pp** [+10.4, +16.8] | +31.3pp |
| PvP damage / min | +146 [+102, +191] | +63 [+41, +84] | +8 [−22, +41] | +217 |
| bot-time engaged in PvP | +6.8pp [+4.5, +9.1] | +1.6pp [+0.5, +2.7] | −2.6pp [−3.9, −1.3] | +5.8pp |
| bot → minions damage / min | +44 [+23, +65] | +26 [+13, +38] | **−172** [−189, −155] | −102 |
| bot → structures damage / min | −10 [−25, +4] | +47 [+28, +65] | −47 [−66, −29] | −11 |
| deaths / min | +0.50 [+0.30, +0.71] | −0.08 [−0.21, +0.02] | +0.10 [+0.01, +0.20] | +0.52 |
| first blood at, s | +4 [−44, +56] | −18 [−65, +27] | **−50** [−80, −22] | −74 |

- **Respawn does about half of the PvP shift.** That was expected, and it is why R exists.
- **Gold on its own** (B0 − R, nobody shopping on purpose) adds PvP damage and structure damage,
  destroys 0.6 more towers a match [+0.3, +1.0], and adds a first tower in 41.7pp more matches.
- **The prompts that know the economy** (B1 − B0) move PvP's share of damage and earned gold, and
  stop farming minions.
- **B1 ≠ B0: the decision surface is being used.**
  - PvP share of earned gold: +19.6pp [+13.0, +27.0].
  - Items at the end: +0.5 [+0.3, +0.7].
  - Carried gold at death: −42 [−83, −3]. Bots spend before they die.
  - Shopping recalls on the green side: +1.8 [+0.9, +2.7]. Hard and the entrant start shopping.
  - Income: +9.7 [+0.3, +19.1].
- **The cost: walking home.** Engaged-PvP time falls 2.6pp against B0, and structure damage falls
  47/min.
  - That is the "bots that walk home to shop spend less time in lane" from §13.1.
  - It is also why no match came closer to ending. B1's towers destroyed fell −0.3 [−0.7, +0.1]
    against B0.

## §13: first-item timing, and the tuning pass

**Confirmed.** Medium vs hard, the smoke's pairing, has its median first item at **5:07**: only 1 of
12 matches is at or under 4:30. The smoke had 5:08.

The entrant pairing buys at 3:11, but only because it is rich on kill gold. So the overall 4:44 is
a mix of two pairings. One is late, and the other is fast because it overshoots the income band.

**The pass is warranted.** Three valid lines fail (income, first item, gold gap). §6.2 allows one
pass on the constants, without changing the design, followed by a re-run of B1 only.

**Knobs.** `gold.start` is the one §13.1 named. On its own it is the wrong pass:
- `src/economy.ts` pays start gold as `passive` at t = 0.
- So it adds `start` ÷ 10 to every bot's gold/min, and income goes from 128.4 to **139.1**.

It needs a partner, and the overshoot names it. The income above the band is kill and assist gold:
- 42.8 and 17.4 gold/min/bot in B1;
- 59.4 and 24.2 in the entrant pairing, where the sample entrant's violin dies 6 times a match.

eco-2 doubled both of them, and on Jev that doubling overshot: PvP's share of earned gold is 78.6 %
against a floor of 35 %.

**Counterfactual.** §13.1's method on this run's 24 B1 ledgers: events held fixed, prices rescaled,
the death drop scaled with the bot's other income. Start gold was added as `start` ÷ 10 per minute.

| candidate (everything else as `eco-2`) | median gold/min/bot | in band | medium vs hard | medium vs entrant | PvP share of earned | gap @ 6:00 (start-gold effect only) |
|---|---:|---:|---:|---:|---:|---:|
| `eco-2` as run | 128.4 | 9 / 24 | 113.7 | 155.8 | 78.6 % | 0.261 |
| start 100 | 139.1 | 6 / 24 | 124.4 | 166.8 | 78.7 % | 0.231 |
| start 100, kill 300 | 130.2 | 10 / 24 | 117.7 | 150.4 | 75.5 % | ≤ 0.231 |
| start 100, kill 300, assist pool 150 | 126.6 | 11 / 24 | 115.0 | 144.0 | 74.2 % | ≤ 0.231 |
| **start 100, kill 250, assist pool 125** | **118.9** | **15 / 24** | **111.0 (12 / 12)** | 132.6 | **71.2 %** | **≤ 0.231** |

**Proposed pass: `gold.start` 0 → 100, `kill` 400 → 250, `assistPool` 200 → 125.** First blood
stays at 150, and nothing else changes. Name it `eco-3`, the way eco-2 was cut from eco-1. What it
does:
- **First item:** 100 gold up front is about 50 s of the medium-vs-hard pairing's income. That moves
  its 5:07 to roughly 4:15, by arithmetic only.
- **Gold gap:** start gold pays both teams equally, so it narrows the gap at 6:00. With the same
  events, the median goes 0.261 → 0.231. A smaller kill bounty can't widen it unless kills run
  against the gold leader.
- **Bounty:** kill + assist pool + half the carried gold comes to about 375 + 78. That is still more
  than any item (300–350), so §13.1's "hunting the carrier is a real decision" still holds.
- **PvP share of earned gold:** 71 %, still double the line.

**Limits.**
- This holds behaviour fixed, as §13.1's did. It can't see richer-earlier bots fighting differently.
  That is what the B1 re-run is for.
- The gap column has the start-gold effect only. This run's metrics don't split each team's gold by
  source at 6:00.

**The re-run.**
- **Size and cost:** B1 only, 24 matches, about $2.2 at B1's rate, about 1 h at `--parallel 2`.
- **Use a new `--date` and `--resolution sequential`.** The lines are B1 vs A, so this keeps every
  line like for like with this run's A and B0, and only the constants differ.
- **Under `simultaneous-1` the A pairing breaks.** It is still the right resolution for the side
  question below, which is a separate run.
- **If it still fails:** §6.2 step 2. Ceryce rules on a preset, then re-run B0 and B1. There is no
  third pass before the Jam.

**Not scored by any run so far: the two winner lines** (`decided`, comeback).
- They need a run under `simultaneous-1` with sides swapped on half the seeds.
- `measure_economy.mjs` can't do that today: it keeps medium on violet so that `metrics` pairs on
  side names.
- That is Ceryce's call, as §13.3 left it. It isn't a blocker for the economy, because no run on the
  old order could have scored those lines either way.

## Go / no-go for Sun 10-04

**Economy (`eco-2` → `eco-3`): GO.**
- **Why go.**
  - Every line that measures what the economy exists to do passes with the CI clear of zero: PvP's
    share of damage, engagement, earlier first blood, no dive tax, lead changes kept, PvP-earned gold,
    items, carried gold at death, and shopping.
  - B1 ≠ B0, so the decision surface is being used.
  - The three misses are level misses of 3–5 %, and all in the "generous" direction. Nothing breaks
    a match.
- **Do before the gate:** the one tuning pass above (`eco-3`) and its 24-match B1 re-run.
  - Ship `eco-3` if it clears income, first item and the gap.
  - If it doesn't, §6.2 step 2 applies (a preset, Ceryce's ruling).
- **If the re-run can't land by Sunday,** the economy is still a go on `eco-2` as run. It plays
  correctly and is a little rich and a little slow to the first item.
- **Not a reason to hold:** `decided` and comeback. They are unscorable on this run, for the side
  reason above, not failed.
- **Separate, and not this gate's:** every match still times out (§13.3). The economy didn't fix
  that, and B1's shopping trips took structure damage down against B0. It is a game-length question
  for the house prompts or the structure hp, not an economy line.

**Bandstand:** judged on its own gate. These conditions have no objective, and no Bandstand rule
fired in any of the 96 matches, as designed.

## Files and logs

- [`economy-measure-2026-10-03-metrics.md`](economy-measure-2026-10-03-metrics.md) and `.json`: all
  four groups, paired against A.
- [`economy-measure-2026-10-03-b1-vs-b0.md`](economy-measure-2026-10-03-b1-vs-b0.md): B1 − B0.
- [`economy-measure-2026-10-03-b0-vs-r.md`](economy-measure-2026-10-03-b0-vs-r.md): B0 − R. This one
  was not in the run's printed commands. It is the same tool on the same logs, and it gives §6.2's
  "B0 vs R isolates the gold".
- All three were produced from the code the matches ran on (`9356d22`), with the commands
  §13.5 lists.

The 96 logs aren't in git. They are on the
[`data-economy-gate-2026-10-03`](https://github.com/kumouri/promptlane/releases/tag/data-economy-gate-2026-10-03)
prerelease as one zip (`economy-gate-match-logs-2026-10-03.zip`, 8.5 MB, sha256
`3ed166ae393e468ac59b7e04e467719dae01f989feaa68b066fd930b2eb1e2c3`). Inside are
`runs/economy-measure-2026-10-03-{A,R,B0,B1}-medium-vs-{hard,entrant}-seed<N>.json` and a
`SHA256SUMS`. Unzip at the repo root, then:

```sh
npm run match -- --verify runs/economy-measure-2026-10-03-B1-medium-vs-hard-seed42.json
npm run metrics -- --group A runs/economy-measure-2026-10-03-A-*.json --group R runs/economy-measure-2026-10-03-R-*.json \
  --group B0 runs/economy-measure-2026-10-03-B0-*.json --group B1 runs/economy-measure-2026-10-03-B1-*.json --md out.md
```

The logs are `sequential` (no `resolution` field). They replay the same on `develop` after #56
(`37410a9`):
- all 96 replay-verify;
- every one of the 52,037 values in the committed metrics JSON comes out identical;
- `develop` only adds the recall fields that #55 introduced.
