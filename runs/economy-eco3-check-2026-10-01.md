# `eco-3` on the shipping code: the 12-match house-pairing check — 2026-10-01 run

**Question.** [`economy-eco3-2026-10-01.md`](economy-eco3-2026-10-01.md) passed every scorable
`docs/economy-spec.md` §6.2 line on `eco-3`, but on the house tiers from before #57 and on the
`first-min` targeting from before #62. Its one weak cell was the house pairing, medium vs hard, whose
first item came at **4:47**. Does `eco-3` still hold on the code that ships: today's eco house tiers
and `own-lane-1`? Ceryce approved this check on Thu 10-01, 13:34 CT ("~$1.10, 12 matches"). It is
**not** a second tuning pass, which §6.2 doesn't allow. No constant moved.

## Verdict

- **`eco-3` holds on the shipping code.** In the house pairing, every §6.2 line this run can score
  passes. The weak spot closed:
  - **first item 4:16** (255.5 s), 11 of 12 matches ≤ 4:30 (eco-3's cell: 4:47, 4 of 12);
  - income **96.7** gold/min/bot, 11 of 12 in 85–125 (cell: 105.2);
  - gold gap at 6:00 **0.160**, 0 of 12 above 0.25 (cell: 0.120, 1 of 12);
  - PvP share of earned gold 76.2 %, items 2, carried gold at death 161, and both tiers shop.
- **The gains and the losses come from the same shift, and this run can't say which change caused
  it.** Between the two runs the house tiers changed (#57, and #60's hard trigger) and so did the
  targeting (#62). Both are on in every match here, so their effects can't be separated (details
  [below](#what-changed-between-the-two-runs)).
- **What got thinner:**
  - Tower gold collapsed (11.6 → 2.2 gold/min/bot), and income fell with it: −18.2
    [−30.0, −9.3] seed-paired. That leaves 12 of headroom over the 85 floor, and one match below it.
  - The items median is 2, but the mean fell to 1.85. 13 of 36 hard bots ended on one item, against
    2 of 36 before.
- **Unscorable here:** comeback (3 decided, 0 comebacks) and `decided` (no A on this code). Both are
  pooled B1 lines, and this run is one pairing. 9 of the 12 matches were draws, and towers fell in
  only 3. That matters for the Jam, but it is outside §6.2.
- **Not measured:** the medium-vs-entrant pairing on the shipping code. It shares house medium, so
  #57 and #62 touch it too.
- **Recommendation for Sun 10-04: ship `eco-3`, and on a GO flip the default to it** in a follow-up
  PR (details [at the end](#for-sun-10-04)). This PR flips nothing.

## The run

- **Command:** `node tools/match/measure_economy.mjs --jev-schema http://127.0.0.1:8893/ --date
  2026-10-01-check --conditions B1 --pairings hard --economy eco-3 --both-sides --seeds
  7,11,42,101,3,5 --parallel 2`.
  - **The two new options, in this PR:**
    - `--both-sides` also plays every match with the sides swapped. Medium plays green on
      `house-eco-green.md`, the arena's own file, with the same compiled schemas.
    - `--date` takes a run suffix, so these logs (`economy-measure-2026-10-01-check-*`) can't match
      the eco-3 run's `economy-measure-2026-10-01-B1-*` glob.
  - **Defaults are develop's:** `simultaneous-1`, `own-lane-1`, the current eco tiers, `pvp-1`,
    cadence 2, and 600 s.
- **The 12 matches:** house medium vs house hard, economy-aware (B1), on `eco-3`. Each of 6 seeds is
  played both ways.
  - The seeds are the first six of the eco-3 run's twelve, in its list order, fixed before the run.
  - The eco-3 cell played medium as violet only. Here 6 matches have medium violet (that orientation)
    and 6 have medium green.
- **Code:** `origin/develop` at `2a3bf9f` (#61's merge). #57, #60, #61, #62 and #63 are ancestors.
- **Results:** 12 of 12 exited 0, all 12 replay-verify (`npm run match -- --verify`), and
  `npm run metrics` reports `replay=ok`. **All 12 ended on timeout:**
  - medium won 3, all three with medium as green;
  - the other 9 were drawn.
- **Backend:** one `schema_server.py` on port 8893, with a `--budget-usd 1.50` hard cap.
  - It served 22,668 requests with 0 errors.
  - TypeSafe returned a 529 (`system_overloaded`) once, and the server failed over to Workers AI. So
    84 calls in cooldown (0.37 %) weren't Jev's, and none errored.
- **Cost:** **$1.3964** by the server's ledger, against ~$1.10 approved and the $1.50 cap.
  - The first four matches cost $0.4241 ($0.106 a match). That projected $1.27 for 12, under the stop
    line.
  - About $0.12 of the total is one match killed mid-play when the tool driving the runner timed out
    (swapped seed 3). The runner resumed and played it again from scratch, and the log here is the
    re-run.
  - The run took 13:38–14:02 CT.

## §6.2's lines, scored

**Inputs.**
- **This check:** its 12 logs.
- **The eco-3 cell:** the eco-3 run's 12 medium-vs-hard logs.
- **Tools:** both are measured by `npm run metrics`:
  - this check alone: [`economy-eco3-check-2026-10-01-metrics.md`](economy-eco3-check-2026-10-01-metrics.md) and `.json`;
  - the cell vs the check: [`economy-eco3-check-2026-10-01-vs-eco3.md`](economy-eco3-check-2026-10-01-vs-eco3.md).
- **Medians:** per match off the `--json`, as the eco-3 write-up took them.
- **Seed-paired rows:** pair the 6 medium-violet matches with the cell's same seeds. That is the only
  orientation the cell has, so n = 6.

| line | pass line | eco-3 cell (12) | check (12) | check: medium violet (6) | check: medium green (6) | paired, medium violet, n = 6 [95 % CI] | result |
|---|---|---:|---:|---:|---:|---|---|
| gold / min / bot | 85–125 | 105.2 (11 / 12 in band) | **96.7** (11 / 12; one below, 73.0) | 93.9 | 97.7 | **−18.2** [−30.0, −9.3] | **pass** |
| PvP share of earned gold | ≥ 35 % | 58.2 % (one match 0 %) | **76.2 %** (59.8–80.1) | 78.6 % | 69.0 % | **+17.2pp** [+13.0, +22.3] | **pass** |
| items per bot at the end | ≥ 2 | 2 (mean 2.11) | **2** (mean 1.85; 0 of 72 with none) | 2 | 2 | **−0.4** [−0.7, −0.1] | **pass** (thin) |
| first item at | ≤ 4:30 | 4:47 (4 / 12) | **4:16** (11 / 12; 3:56–4:43) | 4:07 (5 / 6) | 4:16 (6 / 6) | −19.3 s [−41.1, +4.0] | **pass** |
| carried gold at death | 50–300 | 206.0 | **160.8** (85–234) | 152.0 | 167.0 | −36 [−100, +27] | **pass** |
| shopping recalls, medium and hard | > 0 | medium 3.17 (12 / 12), hard 4.75 (12 / 12) | medium **2.67** (12 / 12), hard **3.83** (11 / 12) | | | | **pass** |
| \|gold diff\| ÷ team gold @ 6:00 | ≤ 0.25 | 0.120 (1 / 12 above) | **0.160** (0 / 12 above; max 0.230) | 0.076 | 0.168 | −0.0 [−0.1, +0.0] | **pass** |
| comeback: behind at 5:00 wins | ≥ 20 % of decided | 6 / 8 | 0 / 3 | 0 / 0 | 0 / 3 | | **unscorable** (below) |
| `decided` (non-draw share) | not lower than A | 8 / 12 | 3 / 12 | 0 / 6 | 3 / 6 | | **unscorable** (no A on this code) |

- **The shopping-recall rows are per tier.** The `metrics` tables report them per colour, and here a
  colour isn't a tier, so these were mapped from each log's sides.
- **The one match under the income band** is seed 42 with medium violet, at 73.0. The eco-3 cell's one
  was seed 23, at 73.3, which isn't among these seeds.
- **Gold by source** (mean gold/min/bot), cell → check:
  - passive 55.0 → 55.0, minion 9.2 → 8.8;
  - kill 13.5 → **18.4**, assist 6.1 → **2.6**, drop 5.1 → 6.4, first blood 2.3 → 2.5;
  - tower (team) 8.3 → **1.6**, tower (local) 3.3 → **0.6**.
  - Towers are most of the income drop. Fewer towers fall: 1.33 a match → 0.25, and any tower fell in
    3 of 12 matches against 12 of 12. Fights also pay less in assists, and kills pay more.
    PvP share rises because tower gold left the denominator.

### Where the first item moved: by tier

Read off each bot's items at the logs' 5 s checkpoints, so this is 5 s resolution. The §6.2 line is
the median of all six bots, which in this pairing lands between the slowest hard bot and the fastest
medium one.

| tier | eco-3 cell: bots' median | eco-3 cell: bots ≤ 4:30 | check: bots' median | check: bots ≤ 4:30 |
|---|---:|---:|---:|---:|
| medium | 5:35 | 0 / 36 | **5:00** | **15 / 36** |
| hard | 3:25 | 34 / 36 | 3:30 | 24 / 36 |

- **The line moved because medium buys earlier.** Hard's median barely moved. Its tail got slower,
  and at the end of the match 13 of its 36 bots are on one item, against 2 of 36.

### What else moved (context, not §6.2 lines)

| | eco-3 cell | check | paired, n = 6 [95 % CI] |
|---|---:|---:|---|
| team fights / match | 2.83 | 0.50 | −3.33 [−3.83, −2.67] |
| bot-time engaged in PvP | 11.2 % | 16.8 % | +4.6pp [+2.1, +6.9] |
| towers destroyed / match | 1.33 | 0.25 | |
| deaths / match | 4.33 | 4.75 | |
| recalls started / cancelled / died recalling, per match | 77.3 / 8.0 / 2.25 | 58.7 / 2.25 / 0 | |

- **Openings repeat across seeds.** Five of the six medium-green matches have the identical first-item
  median (255.5 s). All three decided matches have the same gold diff at 3:00 (−388). The cell's
  twelve first-item medians are all distinct. So the 12 matches here carry fewer independent openings
  than 12, and the intervals above are narrower than the evidence behind them.

## What changed between the two runs

| change | what it does | in the eco-3 run | here |
|---|---|---|---|
| #57 (`edc9baf`) | every eco tier gets out of reach before it recalls: with an enemy in sight it walks home, with none it recalls. That covers the low-hp recall and the shopping recall, and hard's 300-gold rule walks home | no | yes |
| #60 (`a5718f8`) | hard's low-hp trigger moves from a flat 90 hp to 65 % of max hp (drums 143, keytar 91, violin 97.5) | no | yes |
| #62 (`e84bfe0`) | `own-lane-1`: a schema bot at its own fountain rides its own lane, where `first-min` sent green's bots up top 135 times of 136 | `first-min` | `own-lane-1` |
| sides | | medium violet in all 12 | each seed both ways (the paired rows hold the orientation fixed) |
| seeds | | 12 | the first 6 of those 12 |

- **Nothing else in the match path changed.** Between the eco-3 run's code (`a39c46e`) and this one,
  `src/` and the match runner differ only by the targeting plumbing and §9.8's `river-2-set10`
  objective, which a `pvp-1` B1 match doesn't attach.
- **This run can't attribute the shift to the tiers or the targeting.** Every match has both, and
  telling them apart would need a 2 × 2 (for example, the same 12 with `--targeting first-min`, about
  $1.3). Two readings are consistent with the mechanisms, but they are not attributions:
  - Recall cancellations fell from 8.0 to 2.25 a match, and deaths while recalling from 2.25 to 0.
    Those are what #57 was built to change.
  - Towers, team fights and assists all fell, and engaged PvP rose. That fits bots spread across their
    own lanes (#62) and no longer stacked up top. Walking home also keeps bots off the lane longer
    (#57, #60).

## For Sun 10-04

**Ship `eco-3`.**
- **Why:**
  - On the shipping code the house pairing passes every §6.2 line this run can score.
  - The first item, the one line it failed on its own, now passes in 11 of 12 matches. Neither
    orientation fails, and the gold gap stays under 0.25 in all 12.
  - The changes since the eco-3 run moved the economy's mix (less tower gold, more kill gold) but
    didn't push any line out.
- **`eco-2` isn't the better fallback on this evidence.**
  - It hasn't been measured on the shipping code either.
  - Its gate misses were too much income, a late first item and too wide a gap. On this code the
    house pairing's income fell and its first item came earlier. Neither argues for the richer bounty.
  - It stays a go only as the gate found it.
- **No-go isn't indicated.**
- **The default should flip on a GO.** In a follow-up PR, as the eco-3 write-up lists:
  - set `DEFAULT_ECONOMY` to `ECO_3`;
  - name `eco-3` in the arena's `tournament.economy` and the README;
  - publish the entrant-facing prices (start 100, kill 250, assist pool 125, first blood +150).
  - Nothing flips here: Q10 is Ceryce's call.
- **What the pooled lines still rest on.** The pre-registered lines are medians over both pairings, and
  the entrant pairing hasn't been re-run on this code. The house pairing now carries most of the
  three lines on its own:
  - **First item:** 11 of its 12 are ≤ 4:30, so the pooled median passes if 2 of the entrant
    pairing's 12 are. The eco-3 run had 12 of 12, at 2:38.
  - **Gap:** all 12 are under 0.25, so it passes if 1 entrant match is. The eco-3 run had 5 of 12.
  - **Income:** the house pairing tops out at 105.7, so the pooled median stays in band if any
    entrant match is at or under about 144. In the eco-3 run the entrant pairing's median was 149.0,
    with 1 of 12 in band.
  - If Ceryce wants that read, not argued, a 12-match medium-vs-entrant check on this code costs about
    $1.3.
- **Caveats to carry:**
  - **Income headroom is 12 gold/min/bot**, and towers barely pay on this code. Watch income if a later
    change makes bots push less.
  - **Items is thin.** The median is 2, but 30 of 72 bots ended on one item.
  - **House vs house now mostly draws** (9 of 12, towers in 3 of 12). The Jam's tiebreak and draw
    handling will see that, whichever preset ships.

## Files and logs

- [`economy-eco3-check-2026-10-01-metrics.md`](economy-eco3-check-2026-10-01-metrics.md) and `.json`:
  this check, both orientations.
- [`economy-eco3-check-2026-10-01-vs-eco3.md`](economy-eco3-check-2026-10-01-vs-eco3.md): the eco-3
  cell vs this check, seed-paired on the 6 medium-violet matches. Its shopping recalls are per colour:
  in the cell violet is medium, but here a colour mixes both tiers.

The 12 logs aren't in git. They are on the
[`data-economy-eco3-check-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-economy-eco3-check-2026-10-01)
prerelease as one zip, `economy-eco3-check-match-logs-2026-10-01.zip` (1.2 MB, sha256
`b07ee7d687a20a7ae7de5da6ca387cc95ba442a36755363bc6d0d093ddbb55bc`). It holds
`runs/economy-measure-2026-10-01-check-B1-{medium-vs-hard,hard-vs-medium}-seed<N>.json` and a
`SHA256SUMS`. The eco-3 cell's logs are on
[`data-economy-eco3-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-economy-eco3-2026-10-01).
Unzip both at the repo root, then:

```sh
npm run match -- --verify runs/economy-measure-2026-10-01-check-B1-hard-vs-medium-seed42.json
npm run metrics -- --group B1-eco3-check runs/economy-measure-2026-10-01-check-B1-*.json \
  --json runs/economy-eco3-check-2026-10-01-metrics.json --md runs/economy-eco3-check-2026-10-01-metrics.md
npm run metrics -- --group eco3-medium-vs-hard runs/economy-measure-2026-10-01-B1-medium-vs-hard-seed*.json \
  --group eco3-check runs/economy-measure-2026-10-01-check-B1-*.json --md runs/economy-eco3-check-2026-10-01-vs-eco3.md
```
