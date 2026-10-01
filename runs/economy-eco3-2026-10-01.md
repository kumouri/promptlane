# The economy's one tuning pass, `eco-3`, on Jev — 2026-10-01 run

**Question.** [`economy-gate-2026-10-03.md`](economy-gate-2026-10-03.md) scored `docs/economy-spec.md`
§6.2 on `eco-2` and found three narrow misses: income, first item and the gold gap at 6:00. It
proposed the one constants pass §6.2 allows, `eco-3`, and a B1-only re-run. Does `eco-3` clear the
three, without breaking a line `eco-2` passed? And which ruleset should go to Ceryce's Sun 10-04
gate?

## Verdict

- **`eco-3` passes every scorable §6.2 line, including the three `eco-2` missed:**
  - income is **122.0** gold/min/bot, inside 85–125 (`eco-2`: 128.4);
  - the first item comes at **3:28**, inside ≤ 4:30 (`eco-2`: 4:44);
  - the gold gap at 6:00 is **0.186**, inside ≤ 0.25 (`eco-2`: 0.261).
- **Nothing `eco-2` passed broke.** PvP's share of earned gold is 75.1 %, items 3, carried gold at
  death 162, and both tiers shop. Every paired line against A still passes. Team fights now pass on
  their own (CI above 0), and first blood comes 67 s sooner than under `eco-2`.
- **The ledger forecast held.** The forecast held behaviour fixed and predicted income −9.5, PvP share
  of earned −7.4pp, and a gap ≤ 0.231. Measured: −11.0, −7.3pp and 0.186.
- **The comeback line can be scored this time, and it passes:** 12 of 14 decided matches.
  `decided` still can't be scored, because its baseline (A) was played on the old order.
- **The pooled medians hide one weak cell.** Medium vs hard, the house pairing, still has its first
  item at **4:47** (4 of 12 matches ≤ 4:30). The pass is carried by the entrant pairing (2:38),
  just as the gate's income fail was carried by it. The entrant pairing also stays over the income
  band (149.0) and over the gap line (0.319). The lines are pooled medians, as pre-registered, so
  this is a caveat, not a fail.
- **Both presets were measured on the eco house tiers from before #57.** #57 merged during this
  run. It made every recall in those tiers walk out of sight of enemies first, a change made for
  `recall-2` that also changes play under today's recall. The comparison is like for like, because
  `eco-2` and `eco-3` played the same tiers. But the house medium and hard on `develop` now are not
  the ones measured (below).
- **Recommendation for Sun 10-04: ship `eco-3`** (details [at the end](#for-sun-10-04)). The default
  is not flipped here. The spec doesn't make that automatic, so it is Ceryce's call at the gate.

## The run

- **Command:** `node tools/match/measure_economy.mjs --date 2026-10-01 --conditions B1 --economy eco-3
  --parallel 2`. `--economy` is new in this PR: it re-prices the conditions that pay gold (B0, B1) and
  leaves A and R alone. The 24 matches are the gate's B1 plan: same tiers, same eco prompts and
  schemas, same pairings (medium violet vs hard or the eco sample entrant green), and the same
  12 seeds, `pvp-1`, cadence 2, full 600 s.
- **Code:** `develop` after #56 (`37410a9`), plus #58's write-up and this PR's preset commit
  (`a39c46e` before this PR was rebased onto `develop` after #57–#59). Every log is
  **`simultaneous-1`**; why is [below](#eco-2-was-pre-56-eco-3-is-post-56-what-that-touches).
  - **The tiers are the gate's own,** from before #57. Every log carries its prompt text and schemas,
    so it replays on any later `develop`.
  - **The targeting is `first-min`,** from before #62, like the gate's. The plan now defaults to
    `own-lane-1`, so add `--targeting first-min` to repeat this run like for like.
- **Results:** 24 of 24 exited 0, and all 24 replay-verify (`npm run match -- --verify`, and
  `npm run metrics`, `replay=ok`). **All 24 ended on timeout**, as every §6 match has.
  - 7 went to violet, 7 to green and 10 were drawn.
- **Backend:** one `schema_server.py` on port 8861, with a `--budget-usd 3.00` cap.
  - It served 40,750 requests with 1 error.
  - It failed over to Workers AI 3 times, so 107 calls in cooldown (0.26 %) weren't Jev's.
  - The one error was a Workers AI read timeout during a failover, and that call played as `hold`.
- **Cost:** **$2.2119** by the server's own ledger. That is $0.092 a match, against the ~$2.20
  approved. The run took 47 min, 09:03–09:50 CT.

## §6.2's lines, scored

**Inputs.**
- **`eco-2`:** the gate's 24 B1 logs.
- **`eco-3`:** this run's 24.
- **A:** the gate's 24 A logs.
- **Tools:** all are measured together by `npm run metrics`
  ([`economy-eco3-2026-10-01-metrics.md`](economy-eco3-2026-10-01-metrics.md) and `.json`). The spec's
  medians come from the `--json`.
- **Paired lines:** B1 − A, seed-paired, n = 24, with a 95 % bootstrap CI.

### New economy metrics (B1 alone)

| line | pass line | `eco-2` B1 (gate) | `eco-3` B1 | `eco-3`: medium vs hard | `eco-3`: medium vs entrant | result |
|---|---|---:|---:|---:|---:|---|
| gold / min / bot | 85–125 | 128.4 (9 / 24 in band) | **122.0** (12 / 24 in band, 11 above, 1 below; 73.3–166.8) | 105.2 (11 / 12) | 149.0 (1 / 12) | **pass** |
| PvP share of earned gold | ≥ 35 % | 78.6 % | **75.1 %** (one match 0 %, below) | 58.2 % | 83.8 % | **pass** |
| items per bot at the end | ≥ 2 | 3 | **3** (mean 2.33; 1 of 144 bots with none) | 2 | 3 | **pass** |
| first item at | ≤ 4:30 | 4:44 (12 / 24) | **3:28** (208 s; 16 / 24 ≤ 4:30) | 4:47 (4 / 12) | 2:38 (12 / 12) | **pass** |
| carried gold at death | 50–300 | 156.5 | **162.2** (49–284) | 206.0 | 149.2 | **pass** |
| shopping recalls, medium and hard | > 0 | medium 4.42, hard 4.50 | medium **5.29** (24 / 24), hard **4.75** (12 / 12) | | | **pass** |
| \|gold diff\| ÷ team gold @ 6:00 | ≤ 0.25 | 0.261 (12 / 24 above) | **0.186** (8 / 24 above; max 0.449) | 0.120 (1 / 12) | 0.319 (7 / 12) | **pass** |
| comeback: behind at 5:00 wins | ≥ 20 % of decided | 8 / 12, invalid | **12 / 14 = 85.7 %** | 6 / 8 | 6 / 6 | **pass** (below) |

- **The 0 % match** is medium vs hard, seed 23. Its two deaths were to a tower and to minions, so no
  PvP gold was paid. It is also the one match under the income band (73.3).
- **Gold by source** (mean gold/min/bot), `eco-2` → `eco-3`:
  - passive 45.0 → 55.0 (the 100 start gold is paid as passive);
  - kill 42.8 → 28.5, and assist 17.4 → 12.2;
  - drop 9.0 → 9.6, minion 9.3 → 8.9, and towers 9.5 → 8.0.
  - Fixed events would have put kill at 26.8 and assist at 10.9. The small excess is the extra deaths
    below.

### Existing `matchValues` metrics (B1 vs A)

| line | pass line | A | `eco-2` B1 | `eco-3` B1 | `eco-3` − A [95 % CI] | result |
|---|---|---:|---:|---:|---|---|
| PvP share of bot damage | CI above 0 | 20.1 % | 51.4 % | 52.3 % | **+32.2pp** [+25.2, +39.3] | **pass** |
| bot-time engaged in PvP | CI > 0 on one, neither < 0 | 8.5 % | 14.3 % | 15.2 % | **+6.7pp** [+3.6, +9.7] | **pass** |
| team fights / match | (same line) | 2.54 | 3.88 | 4.54 | **+2.00** [+0.54, +3.46] | **pass** (now CI > 0 too) |
| first blood rate | not lower | 95.8 % | 100 % | 100 % | +4.2pp [+0.0, +12.5] | **pass** |
| first blood at | earlier | 243 s | 174 s | 106 s | **−137.8 s** [−189.2, −90.9] | **pass** |
| `decided` (non-draw share) | not lower | 79.2 % | 50.0 % | 58.3 % | −20.8pp [−50.0, +8.3] | **unscorable** (below) |
| deaths under the killer team's tower | CI not above 0 | 80.8 % | 75.2 % | 77.4 % | −2.9pp [−12.2, +7.2] | **pass** |
| deaths dealt by a tower | CI not above 0 | 55.4 % | 40.5 % | 39.0 % | −15.5pp [−33.7, +3.9] | **pass** |
| lead changes / match | ≥ 50 % of A's | 1.08 | 1.17 | 0.96 | −0.1 [−1.0, +0.5] (88 % of A) | **pass** |
| swinginess | not collapsed | 135 | 476 | 377 | +242 [+188, +296] | **pass** |

## `eco-3` vs `eco-2`, seed-paired

Seed-paired B1 against B1, n = 24
([`economy-eco3-2026-10-01-eco3-vs-eco2.md`](economy-eco3-2026-10-01-eco3-vs-eco2.md)). These
deltas cross both the constants and the resolution (next section).

| metric | `eco-3` − `eco-2` [95 % CI] | the gate's forecast (events fixed) |
|---|---|---|
| gold / min / bot | **−11.0** [−19.5, −2.5] | −9.5 (median 128.4 → 118.9) |
| PvP share of earned gold | **−7.3pp** [−13.4, −2.5] | −7.4pp (78.6 % → 71.2 %) |
| first item at, s | **−46** [−65, −28] | medium vs hard 5:07 → about 4:15 |
| gap @ 6:00 | −0.071 [−0.175, +0.030] | median 0.261 → ≤ 0.231 |
| first blood at, s | **−67** [−93, −42] | not forecast |
| deaths / min | +0.08 [+0.01, +0.15] | not forecast |
| swinginess | −99 [−160, −43] | not forecast |
| PvP share of bot damage | +0.9pp [−3.3, +5.1] | not forecast |
| items per bot at the end | −0.11 [−0.26, +0.05] | not forecast |
| shopping recalls, medium | +0.9 [−0.3, +2.0] | not forecast |

- **Income and PvP share landed on the forecast.** The forecast held behaviour fixed, so the bots'
  play under `eco-3` didn't move the economy's mix much.
- **Medians against the forecast:**
  - income 122.0 against 118.9;
  - in band 12 of 24, against 15;
  - medium vs hard 105.2 (11 / 12), against 111.0 (12 / 12);
  - medium vs entrant 149.0, against 132.6.
  - The entrant pairing is where the forecast was short. The entrant's team still dies 7–13 times a
    match (median 10), and each death pays.
- **First item, medium vs hard: 5:07 → 4:47, not 4:15.**
  - The forecast was arithmetic only: 100 gold up front, worth about 50 s of income.
  - It didn't net out what that pairing loses. Kill and assist pay fell from 36.7 to 19.6 gold/min/bot
    there, while start gold adds about 10.
  - And a bot buys only when it gets home. The pairing's 12 first-item times tightened from
    4:05–6:41 to 4:12–5:17, but only 4 are at or under 4:30.
- **Fights come earlier:** first blood is 67 s sooner, and deaths are slightly up. That fits richer,
  earlier-itemised bots, and it is the feedback the forecast couldn't see.
- **Swinginess is down** because a kill moves less gold, as designed. It is still 2.8× A.

## `eco-2` was pre-#56, `eco-3` is post-#56: what that touches

- **The gate's 96 matches ran on `9356d22`,** before #56, so they are sequential: the frozen sim's
  order, which tilts `pvp-1` toward violet.
- **This run is on `develop` after #56,** under `simultaneous-1`, the resolution new matches get by
  default and the one the Jam plays.
- **On post-#56 code, a sequential log replays and measures byte-identically**
  (`side-fairness-2026-10-01.md`: 489 logs, the gate's 96 among them). So the code difference is
  only the resolution.
- **This is a deliberate departure from #58's §13.6,** which asked for this re-run on
  `--resolution sequential` to keep it like for like with A. This run's brief asked for it on post-#56
  code, with the winner lines scored if they could be, and only `simultaneous-1` allows that. It also
  puts `eco-3`'s numbers on the resolution that ships.

**What the resolution does and doesn't affect:**

| comparison | affected? | why |
|---|---|---|
| `eco-3`'s economy lines (income, first item, gap, PvP share of earned, items, carried gold, shopping) | **no:** they are level reads of `eco-3` alone, against fixed bands | measured on the resolution the Jam plays, which is the reading that matters for shipping |
| `eco-3` − `eco-2` deltas (the table above) | **yes, in principle:** constants and resolution together | the two deltas that were forecast with no resolution change, income and PvP share, landed on the forecast. So the constants explain them; the resolution adds little |
| paired lines vs A (PvP share of damage, engagement, team fights, first blood, dive tax, lead changes) | **yes:** `eco-3` is `simultaneous-1`, A is sequential | an anchor (below) puts the resolution's own effect on PvP share, engagement and team fights at zero or *negative*. If anything, these passes are conservative |
| `decided` vs A | **yes, and invalid** | A's 79.2 % is inflated by the old tilt: under the old order A's 19 decided matches all went to violet. On the 5 anchor seeds, sequential A was decided in 4 of 5 and `simultaneous-1` A in 1 of 5 |
| comeback (`eco-3` alone) | **now scorable** | within one resolution, and it no longer has a mechanism that hands the tiebreak to violet (below) |

**The resolution anchor.** These cost $0 and are not a pre-registered line. The side-fairness run
([`side-fairness-2026-10-01.md`](side-fairness-2026-10-01.md)) played house medium (violet) vs house
hard (green) with no economy on 5 of these seeds (3, 7, 11, 42, 101) under `simultaneous-1`. That is
condition A's medium-vs-hard shape exactly.
- Seed-paired against the gate's sequential A matches, n = 5
  ([`economy-eco3-2026-10-01-resolution-anchor.md`](economy-eco3-2026-10-01-resolution-anchor.md)):
  - PvP share of damage −5.8pp [−11.6, +0.2];
  - engaged PvP −2.8pp [−5.1, −0.4];
  - team fights −2.6 [−4.8, −0.4];
  - lead changes +1.0 [0, +1.8];
  - decided −60pp [−100, −20];
  - towers destroyed +0.6 [+0.2, +1.0].
- Five pairs is small. The direction is what's used: the PvP lines lean against `eco-3`, not for it.
  `eco-3`'s lead changes clear 50 % of A's either way (88 %).

### The winner lines

**Comeback, scored: pass, 12 of 14.**
- **The tilt is gone.** Under `simultaneous-1`, bots at base are 0 vs 0, so no known mechanism hands
  violet the tiebreak.
- **The comebacks aren't a side effect.**
  - In medium vs entrant, violet led on gold at 6:00 in 11 of 12. Yet green, the entrant, won all 6
    decided matches. That is against the old tilt's direction.
  - In medium vs hard, green (hard) led in 9 of 12, and violet (medium) won 7 of 8 decided.
- **Caveats:**
  - Every match is a timeout, so "wins" means the tower-count tiebreak.
  - Each tier plays one side, so a tier edge and any residual side edge can't be told apart. The
    side-fairness check had violet's first tower at 8 of 10, p ≈ 0.11, which left a small edge
    unbounded.
- **Not a line, but worth knowing:** 86 % says a gold lead at 5:00 barely predicts the tiebreak.
  §6.2's line is a floor against runaway, and this is the other end of it.

**`decided`, still unscorable.**
- Its line is B1 vs A, and A was played on the tilted order (above).
- R − A in the gate also showed respawn alone moves `decided` by −54pp.
- `eco-3`'s own level is 58.3 %, against `eco-2`'s 50.0 % on the old order.
- Scoring it needs an A under `simultaneous-1`: 24 matches, about $1.8. That is not part of this
  pass.

## For Sun 10-04

**Ship `eco-3`.**
- **Why:**
  - It passes every scorable §6.2 line. That includes the three `eco-2` missed, the gap with room
    (0.186 against 0.25).
  - It keeps everything the gate found the economy does.
  - It was measured on the resolution the Jam plays.
- **`eco-2` is the fallback,** and it is still a go as the gate found. Pick it only if Ceryce prefers
  the bigger bounty over the three level lines.
- **No-go isn't indicated** by anything here.
- **What to tell entrants:**
  - Everyone starts with 100 gold.
  - A kill pays 250, plus a 125 assist pool and the drop.
  - First blood is unchanged at +150.
  - The bounty (kill + assist pool + half the carried gold) still tops any item, so hunting the
    carrier stays a real decision.
- **Caveat to carry:** the house pairing's first item is 4:47.
  - The line passes on the pooled median, as pre-registered.
  - But a house-vs-house Jam match will usually buy after 4:30.
  - If that matters at the Jam, the lever is outside §6.2's one pass. §6.2 allows no further constants
    pass before the Jam.

**Caveat: the house tiers moved under this run (#57).**
- **What changed:** #57 rewrote each eco tier's low-hp and shopping recalls as "an enemy in sight →
  `move home`, then no enemy in sight → recall". Hard's 300-gold rule now walks home.
- **Why it applies here:** the change was made for `recall-2`, but the rules apply under any recall.
- **What it can move:** a bot that walks out of sight before recalling gets home later, so it shops
  later. That is the first-item and shopping lines, in the house pairing most of all.
- **What's untouched:** the sample entrant didn't change.
- **Status:** none of §6.2's lines has been measured on the new tiers, under either preset.
- **Before the Jam:** if the Jam's house bots are the post-#57 tiers, a 12-match medium-vs-hard check
  on `eco-3` (about $1.1) would show whether the house pairing's 4:47 first item got later. That is
  not a second tuning pass; §6.2 allows none.

**Caveat: the targeting rule moved after this run (#62).**
- **What changed:** `own-lane-1` became the default. A schema bot at its own fountain now rides its
  own lane, where under `first-min` float noise sent green's bots up top 135 times of 136
  ([`bandstand-4-2026-10-01.md`](bandstand-4-2026-10-01.md)).
- **What it can move:** every shopping trip ends at the fountain, so who farms which lane after it
  changes. That is income, the gold gap at 6:00 and PvP's share of earned gold, and through them
  comeback. The first item mostly isn't: matches and respawns put a bot in its lane, outside the
  fountain, so the rule only fires once a bot has been home.
- **Status:** unmeasured, under either preset. Both played `first-min`, so `eco-3` vs `eco-2` stays
  like for like; the absolute lines are what could shift.

**The default is not flipped in this PR, and the spec doesn't flip it automatically.**
- `DEFAULT_ECONOMY` stays `none` until Ceryce's go/no-go (Q10, §7: "Ceryce decides").
- The economy conditions in `measure_economy.mjs` stay on `eco-2`, so the gate's command, with
  `--targeting first-min` (the gate predates #62's `own-lane-1`), still reproduces the gate.
- **If the gate is GO on `eco-3`, a follow-up PR would:**
  - set `DEFAULT_ECONOMY` to `ECO_3`;
  - name `eco-3` in the arena's `tournament.economy` and the README;
  - publish the entrant-facing prices above.
- The translator's item list reads `eco-2.json`, and the items are identical in `eco-3`, so it needs
  no change.

## Files and logs

- [`economy-eco3-2026-10-01-metrics.md`](economy-eco3-2026-10-01-metrics.md) and `.json`: A,
  `eco-2` B1 and `eco-3` B1, paired against A.
- [`economy-eco3-2026-10-01-eco3-vs-eco2.md`](economy-eco3-2026-10-01-eco3-vs-eco2.md): `eco-3` −
  `eco-2`, B1 against B1.
- [`economy-eco3-2026-10-01-resolution-anchor.md`](economy-eco3-2026-10-01-resolution-anchor.md):
  A sequential vs A `simultaneous-1`, 5 seeds.

The 24 logs aren't in git. They are on the
[`data-economy-eco3-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-economy-eco3-2026-10-01)
prerelease as one zip, `economy-eco3-match-logs-2026-10-01.zip` (2.3 MB, sha256
`927b6473b2815b1813c52b9cef9f00dca8d52097344b021073aa7d95c6f893cc`), which holds
`runs/economy-measure-2026-10-01-B1-medium-vs-{hard,entrant}-seed<N>.json` and a `SHA256SUMS`. The
gate's logs (`data-economy-gate-2026-10-03`) and the side-fairness logs
(`data-side-fairness-2026-10-01`, unzipped into `runs/`) are the other inputs. Unzip all three at the
repo root, then:

```sh
npm run match -- --verify runs/economy-measure-2026-10-01-B1-medium-vs-hard-seed42.json
npm run metrics -- --group A runs/economy-measure-2026-10-03-A-*.json --group B1-eco2 runs/economy-measure-2026-10-03-B1-*.json \
  --group B1-eco3 runs/economy-measure-2026-10-01-B1-*.json \
  --json runs/economy-eco3-2026-10-01-metrics.json --md runs/economy-eco3-2026-10-01-metrics.md
npm run metrics -- --group B1-eco2 runs/economy-measure-2026-10-03-B1-*.json --group B1-eco3 runs/economy-measure-2026-10-01-B1-*.json \
  --md runs/economy-eco3-2026-10-01-eco3-vs-eco2.md
npm run metrics -- --group A-seq runs/economy-measure-2026-10-03-A-medium-vs-hard-seed{7,11,42,101,3}.json \
  --group A-sim runs/side-fairness-2026-10-01-mv-seed{7,11,42,101,3}.json --md runs/economy-eco3-2026-10-01-resolution-anchor.md
```
