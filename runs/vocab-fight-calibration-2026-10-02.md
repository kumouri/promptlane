# Fight verdict calibration, 2026-10-02

**Question.** Vocab-2 tells Jev, every decision, whether the bot's side is stronger, even or weaker
in the fight near it ([`docs/vocabulary-spec.md`](../docs/vocabulary-spec.md) §4.1 A3). The spec
proposed hp ≥ 1.25× theirs, or a tower over the fight on one side only, vetoed when outnumbered by
two bearbots, and asked for a calibration on recorded matches before it ships (§7 D4). Does the
verdict predict the fight, and which setting predicts it best?

**Answer.** Counting towers is what makes it predictive, and the tower should decide first.

- **Towers carry it.** With only my tower over the fight, my side won the next 5 s 71 % of the
  time. With only theirs, my side won 11 %. With neither, 49 %, a coin flip.
- **hp alone is close to chance.** On hp sums with towers ignored, "stronger" was right about 53 %
  of the time at every ratio from 1.0 to 2.0.
- **Shipped: tower first, then hp at 1.25×, no veto.** It is right 65.4 % of the time and gives a
  verdict on 84 % of fights. The spec's starting rule was right 61.0 % of the time on 73 %. With the
  shipped setting, "even" really is even: the mean exchange after an "even" verdict is 0.0 hp.
- **The outnumbered veto made every setting slightly worse** (by 0.4–1.3 points), so it is off.
- **Spend: $0.** No model call of any kind. Nothing touched the live arena or evolution campaign 2.

## Method

- **Data.** Every local match log on the `pvp-1` map: 219 distinct logs, read-only, from the
  worktrees of the economy gate (99), Bandstand 4 (59), the economy slice (27), the eco-3 check (27),
  Bandstand 5 (19), fewer draws (3) and the main checkout (3). There were 18 duplicates, skipped.
  These are Jev matches: the house tiers and the sample entrant, under several rulesets.
- **Samples.** `tools/match/fight_samples.mjs` replays each log through the unchanged sim
  (`verifyReplay`'s observation hook). Every 2 s of asks, for each bot that sees an enemy bearbot, it
  writes what the bot saw, and every bearbot's hp 5 s later. That hp comes from that round's
  observations: a bot sees its own hp and every living ally's, so one observation per team covers
  all six bots. A bot its team doesn't report is dead. Every log replayed cleanly: 64,290 samples.
- **Outcome.** As the spec defines it: which side lost more hp over the next 5 s. A side is the
  bearbots the verdict counted: the bot and its allies within 260, and the enemy bearbots it saw.
  A death costs all the hp the bot had. A heal counts as no loss. The exchange is their loss minus
  ours.
- **Scoring.** `tools/jev/calibrate_fight.py` computes the verdict with `vocab.fight`, the function
  the description uses, for every setting. Among samples where any hp changed hands, it counts how
  often "stronger" was followed by a won exchange, and "weaker" by a lost one.

## Results

"Decisive verdicts" is the share of samples that got stronger or weaker, not even. Accuracy counts
both kinds of verdict. Exchanges are in hp, positive when my side won.

| hp ratio | tower clause | outnumbered veto | decisive verdicts | stronger → won | weaker → lost | accuracy | mean exchange (stronger / even / weaker) |
|---|---|---|---|---|---|---|---|
| 1 | first | off | 94.6 % (40714 / 20080 of 64290) | 61.7 % | 69.4 % | 64.3 % | +17.6 / -0.6 / -26.2 |
| 1 | first | 2 | 92.7 % (40394 / 19183 of 64290) | 61.6 % | 68.4 % | 63.8 % | +17.6 / -8.1 / -25.1 |
| 1 | or | off | 76.1 % (33265 / 15668 of 64290) | 59.5 % | 62.8 % | 60.5 % | +15.6 / -3.9 / -17.2 |
| 1 | or | 2 | 78.0 % (34158 / 15979 of 64290) | 58.1 % | 62.1 % | 59.3 % | +13.9 / -1.8 / -16.3 |
| 1 | off | off | 92.3 % (37605 / 21765 of 64290) | 53.2 % | 52.1 % | 52.8 % | +7.1 / -0.3 / -3.5 |
| 1.1 | first | off | 89.3 % (39040 / 18341 of 64290) | 62.0 % | 70.3 % | 64.7 % | +18.3 / -0.8 / -28.4 |
| 1.1 | or | 2 | 76.6 % (34570 / 14678 of 64290) | 58.7 % | 63.2 % | 60.0 % | +14.6 / -2.3 / -19.1 |
| **1.25 (shipped)** | **first** | **off** | **84.2 % (37353 / 16787 of 64290)** | **62.4 %** | **71.8 %** | **65.4 %** | **+19.0 / -0.0 / -31.0** |
| 1.25 | first | 2 | 82.3 % (37035 / 15892 of 64290) | 62.4 % | 70.7 % | 64.9 % | +18.9 / -3.2 / -29.9 |
| 1.25 | or | off | 71.4 % (32716 / 13198 of 64290) | 60.8 % | 66.1 % | 62.3 % | +17.5 / -3.6 / -23.9 |
| 1.25 (the spec's rule) | or | 2 | 73.3 % (33600 / 13504 of 64290) | 59.4 % | 65.1 % | 61.0 % | +15.7 / -1.8 / -22.6 |
| 1.25 | off | off | 74.6 % (31806 / 16126 of 64290) | 53.0 % | 51.7 % | 52.6 % | +7.6 / +1.1 / -4.3 |
| 1.5 | first | off | 76.5 % (34575 / 14636 of 64290) | 63.7 % | 74.4 % | 66.9 % | +20.6 / -1.1 / -34.6 |
| 1.5 | or | 2 | 68.2 % (31939 / 11928 of 64290) | 61.4 % | 68.7 % | 63.4 % | +18.0 / -2.8 / -27.4 |
| 1.5 | off | off | 61.1 % (26884 / 12377 of 64290) | 54.0 % | 53.4 % | 53.8 % | +8.4 / +1.3 / -5.4 |
| 2 | first | off | 68.1 % (31272 / 12537 of 64290) | 64.5 % | 77.1 % | 68.2 % | +21.9 / -0.6 / -38.5 |
| 2 | or | 2 | 62.7 % (29799 / 10525 of 64290) | 62.2 % | 72.4 % | 64.9 % | +19.4 / -1.6 / -33.2 |
| 2 | off | off | 44.5 % (20337 / 8297 of 64290) | 52.3 % | 51.3 % | 52.0 % | +6.8 / +2.4 / -3.9 |

The full grid (30 settings) prints with the command below. These rows are the ones the choice turns on.

**Who won, by which side had a tower over the fight** (all 64,290 samples):

| tower over the fight | my side won | my side lost | nothing changed hands | my side's share of decided exchanges |
|---|---:|---:|---:|---:|
| mine only | 12,739 | 5,234 | 4,136 | 70.9 % |
| theirs only | 766 | 6,349 | 1,005 | 10.8 % |
| both | 0 | 0 | 0 | – |
| neither | 12,223 | 12,877 | 8,961 | 48.7 % |

## Why 1.25 and not higher

A higher ratio is more accurate but gives a verdict on fewer fights. At 2.0, tower first is right
68.2 % of the time on 68 % of fights, and "even" covers a third of them. In fights with no tower,
hp has almost no signal at any ratio: about 53 % right. So most of a higher ratio's gain comes from
labelling fewer fights. At 1.25, "even" is neutral (a 0.0 hp mean exchange), and a bot with a quarter
more hp than the bots it faces reads as stronger. That matches the spec's intent and the words an
entrant will write. Stage B's damage-weighted strength (§4.3 B1) is the fix for the weak hp signal:
a drums' 220 hp doesn't fight like a violin's 150.

## Caveats

- **These bots never read the verdict.** It predicts fights between bots that didn't know it. Once
  entrants act on "stronger here", fights they choose will differ from these.
- **The logs are the house tiers and the sample entrant**, under the economy, the Bandstand and the
  Final Chorus in various mixes. That is most of what was played on `pvp-1`, but not a sample of
  entrant prose.
- **5 s is the spec's horizon.** A tower's shots land every second, so a longer horizon would
  likely favour the tower clause further. It was not tested.
- **The logs are not in this repo.** They live in other worktrees and on the data releases those
  runs published. The two scripts run on any set of logs.

## Reproduce

```bash
node tools/match/fight_samples.mjs --out samples.jsonl <log files or directories>
python tools/jev/calibrate_fight.py samples.jsonl --markdown
```

The tower-case table came from a scratch tally over the same samples (`vocab.fight` per sample,
grouped by which side had a tower in range).
