# Economy P2 smoke on Jev: economy-aware house tiers on eco-2 — 2026-09-30

**Question.** With the P2 house tiers (`prompts/pilots/README.md`, "Economy-aware tiers") and the
retuned ruleset `eco-2` ([`docs/economy-spec.md`](../docs/economy-spec.md) §13.1), do the bots buy
on purpose, and does income land in the 85–125 gold/min/bot band? This is a short plumbing-and-sanity
smoke before the §6 measurement, not the measurement.

**Verdict.**

- **They shop on purpose.**
  - Both tiers make about 4 shopping recalls a match: medium 4.00 (2–7), hard 4.25 (3–5). A
    shopping recall is a recall started above half hp that buys on the way in (`metrics.ts`).
  - In the economy slice (B0: same seeds, eco-1, prompts that know nothing about gold), hard made
    0.17 a match and medium 2.0. Medium's 2.0 is an accident: its low-hp recall fires at 75 % of max
    hp, which is above half.
  - Purchases rose from 6.8 a match in the slice to 11.8.
  - All 24 bots bought their declared list in order, including hard drums' non-default list
    (Road Case → Bass Strings → Amp).
- **Income is in band.** Median **99.6 gold/min/bot** (mean 98.8, range 83.1–113.0); 3 of 4
  matches are in 85–125. The slice's eco-1 B0 median was 59.2.
- **Not every §6.2 line is met.** First item is still slow: median 5:08 against ≤ 4:30 (§6.2). See
  "What it says for §6" below.
- **Clean run.** 6,923 Jev calls, 0 errors, 0 failovers, 0.25 s mean. All 4 logs replay-verify,
  120 of 120 checkpoints each. **Spend $0.34**, the server's own `cost_usd`. That is $0.085 a match;
  the slice's prompts cost $0.069, and the economy-aware prompts ask more questions per decision.

## Setup

| | |
|---|---|
| Pairing | house **medium-eco** (violet, `house-eco-violet.md` + `house-medium-eco.schemas.json`) vs house **hard-eco** (green, `house-hard-eco.prose.md` + `house-hard-eco.schemas.json`): spec §6.1 condition B1's first pairing |
| Ruleset | `--economy eco-2`, map `pvp-1`, cadence 2, Jam roster, full length |
| Seeds | 7, 11, 42, 101 (the slice's first four) |
| Jev | a private `tools/jev/schema_server.py --port 8861 --budget-usd 0.60`, TypeSafe with the Workers AI fallback (the default) |
| Command | `npm run match -- --a house --b house:hard --a-schemas prompts/pilots/house-medium-eco.schemas.json --b-schemas prompts/pilots/house-hard-eco.schemas.json --name-a medium-eco --name-b hard-eco --jev-schema http://127.0.0.1:8861/ --map pvp-1 --cadence 2 --seed <N> --economy eco-2 --out runs/economy-p2-smoke-2026-09-30-medium-eco-vs-hard-eco-seed<N>.json` (with `--economy`, `house` and `house:hard` resolve to the economy-aware files) |

## Results

| Seed | Winner | Deaths | Gold/min/bot | …passive / minion / towers / PvP | PvP share of earned | Items (violet d/k/v, green d/k/v) | First item | Shopping recalls medium / hard | \|gold diff\| ÷ gold @6:00 |
|---|---|---:|---:|---|---:|---|---:|---|---:|
| 7 | violet (tiebreak) | 3 | 86.6 | 45.0 / 10.4 / 8.8 / 22.5 | 54.0 % | 1/1/0, 2/3/2 | 5:05 | 2 / 5 | 0.140 |
| 11 | draw | 1 | 83.1 | 45.0 / 9.6 / 17.5 / 11.0 | 28.9 % | 1/1/1, 2/3/2 | 5:35 | 2 / 4 | 0.140 |
| 42 | violet (tiebreak) | 4 | 112.6 | 45.0 / 11.3 / 8.8 / 47.6 | 70.4 % | 2/3/3, 1/2/3 | 4:52 | 7 / 5 | 0.186 |
| 101 | violet (tiebreak) | 4 | 113.0 | 45.0 / 9.6 / 8.8 / 49.7 | 73.0 % | 1/3/3, 1/3/3 | 5:11 | 5 / 3 | 0.390 |

Against the §6.2 lines (B1's, read on 4 matches, so for direction only):

| §6.2 line | Target | Smoke | Slice B0, eco-1 (for contrast) |
|---|---|---|---|
| Gold / min / bot | 85–125 | median 99.6; 3 / 4 in band | 59.2; 0 / 12 |
| PvP share of earned gold | median ≥ 35 % | 62 % (29–73 %) | 28.3 % |
| Items per bot at end | median ≥ 2 | **2** (24 bots: one with 0, 8 with 1, 6 with 2, 9 with 3) | 1 |
| First item | median ≤ 4:30 | **5:08** (4:52–5:35): misses | 6:48 |
| Carried gold at death | median 50–300 | per-match medians 155, 196.5, 217, 222 (12 deaths) | in band, n = 14 |
| \|gold diff\| ÷ team gold @6:00 | median ≤ 0.25 | 0.163 (max 0.390) | 0.245 |
| Shopping recalls | > 0 for medium and hard | 4.00 and 4.25 a match | 2.0 and 0.17 (medium's are its 75 % retreat) |

Full tables: [`economy-p2-smoke-2026-09-30-metrics.md`](economy-p2-smoke-2026-09-30-metrics.md).
Raw numbers: [`economy-p2-smoke-2026-09-30-metrics.json`](economy-p2-smoke-2026-09-30-metrics.json).

## What it says for §6

- **Income now leans on PvP.** Deaths rose to 3 a match, against 1.17 in the slice, and PvP is
  56.6 % of earned gold. Last hits pay *less* per minute than in the slice, 10.2 against 10.5, even
  at 25 a hit instead of 15. Bots that walk home to shop spend less time in lane. If B1 fights more
  than this, income climbs toward the band's top: the two 4-death matches are at 113.
- **The first-item line is the likeliest §6.2 miss.** An item costs 300–350. At 45 passive plus a
  thin early lane income, that is about five minutes of gold, and the shopping recall can only fire
  once the gold is there.
  - If §6 confirms the miss, the one tuning pass §6.2 allows has a knob that changes nothing else:
    `gold.start`. It is 0 today; something like 100 brings the first item about a minute earlier.
  - It was not changed here. Changing it would need this smoke re-run, and it is §6's call.
- **Every match timed out again, and violet won every decided one.** That is the map and the house
  prompts, not the economy (spec §13.3). It means "medium beats hard" here is a side effect, not a
  tier result.
- **Dives.** 10 of the 12 deaths were under the killer team's tower, and a tower landed the killing
  blow in 5. That is the same shape as the slice. The §6.2 line on dives is paired B1 − A, so it
  needs §6.

## Logs and reproduction

The 4 logs aren't in git, by ruling. They are on the
[`data-economy-p2-smoke-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-economy-p2-smoke-2026-09-30)
prerelease as `economy-p2-smoke-match-logs-2026-09-30.zip`; the sha256 is in the release notes.
Unzip at the repo root, then:

```sh
npm run match -- --verify runs/economy-p2-smoke-2026-09-30-medium-eco-vs-hard-eco-seed7.json
npm run metrics -- --group b1smoke runs/economy-p2-smoke-2026-09-30-*-seed*.json --md out.md
```
