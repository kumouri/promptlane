# Economy slice on Jev: eco-1 vs off on `pvp-1` — 2026-09-30

**Question.** This is the cheap slice the P1 smoke proposed
([`economy-p1-smoke-2026-09-30.md`](economy-p1-smoke-2026-09-30.md), last section), run before
the Sun 10-04 go/no-go. With today's house prompts, what does turning on `eco-1` change, measured
seed-paired with `npm run metrics`? How do the §6.2 numbers in
[`docs/economy-spec.md`](../docs/economy-spec.md#6-measurement--judging-the-economy-on-jev) compare
with their targets? In the spec's terms this is **condition A (map only) vs condition B0** (eco-1,
prompts that know nothing about the economy), on one pairing.

**Verdict.**

- **The layer holds up at scale on Jev.**
  - All 12 eco-1 matches replay-verify (120 of 120 checkpoints each).
  - 13 respawns, 72 bots buying.
  - Every gold unit lost on death went to the killers, as the Q2 default says.
  - 0 Jev errors and 0 failovers.
- **The economy does not hurt PvP, and nudges it up.** Two clear effects:
  - PvP share of bot damage +7.9 pp [+4.1, +11.9], 11 pairs up, 1 down.
  - Bot-time engaged in PvP +3.1 pp [+1.4, +4.8], 10/2.

  Also:
  - PvP damage taken on neutral ground rose 7.5 pp.
  - Time under an enemy tower fell 1.3 pp (1/11).
  - Team fights went from 3.58 to 4.42 a match, but the CI crosses 0.
  - Raw PvP damage per minute rose 54 %. Most of that is levels and items scaling attack damage, not more fighting (§3).
- **With today's prompts, the economy misses every §6.2 income and shopping target.**
  - Income is **59 gold/min/bot (median), against the 85–125 band. 0 of 12 matches reach it.** Half of it is the fixed passive.
  - The first item comes at 6:48 (median), against ≤ 4:30.
  - The median bot ends with 1 item, against ≥ 2.
  - PvP is 28 % of earned gold, against ≥ 35 %.
- **The cause is partly behaviour and partly the numbers.**
  - Bots only reach the shop when a low-hp recall or a respawn takes them home. P2 fixes that.
  - **The earned income is also short**, and it is short in every source, not only PvP. Better shopping won't fix that, so plan on §6.2's one tuning pass even if P2 lands.
- **Deaths are too rare to judge the death economy:** 1.17 a match with eco-1, 1.42 without. Here's what can't be read from that:
  - Snowball and comeback.
  - Whether carried gold is a risk anyone feels.
  - The killers-vs-vanished split. Every one of the 14 eco deaths was credited to a bearbot, so the vanish path never ran on Jev.
- **Every match went to the 600 s timeout**, in both conditions. Match length can't move, and "decided" means decided by the tiebreak. All 10 decided matches went to violet (house medium).
- **Spend: $1.66** of Jev against the ~$1.90 estimate and the $4 ceiling. Wall clock was 28 minutes.

## 1. Setup

| | |
|---|---|
| Pairing | house **medium** (violet, `prompts/pilots/house-violet.md` + `house-medium.schemas.json`) vs house **hard** (green, `house-hard.prose.md` + `house-hard.schemas.json`). These are byte-identical to the PR #40 tier schemas the smoke used. |
| Conditions | **off**: `--map pvp-1`, no economy, today's game, spec condition A. **eco-1**: `--map pvp-1 --economy eco-1`, spec condition B0. |
| Seeds | 7, 11, 42, 101, 3, 5, 13, 17, 23, 29, 31, 37: 12 pairs, 24 matches |
| Shape | Jam roster, full length (600 s), cadence 2, both sides compiled prose on Jev |
| Jev | a private `tools/jev/schema_server.py --port 8851 --budget-usd 3.80`, TypeSafe with the Workers AI fallback (the default) |
| Pairing in time | each seed's off and eco-1 matches ran side by side on one server, so each pair shares a backend window |
| Shopping lists | none declared: the house prose predates the economy, so every bot buys its instrument's default build (`eco-1.json` `defaultBuilds`) |

**Clean run.**
- 40,785 Jev calls, 0 errors, 0 failovers, 0.24 s mean, 0 parse errors.
- Every one of the 24 logs replay-verifies, 120 of 120 checkpoints.
- **Spend: $1.6555**, the servers' own `cost_usd`. A guard bug in my queue script stopped it after seed 7 and again after seed 11; both stopped cleanly between pairs. That gave three server runs: $0.1372 + $0.1410 + $1.3773.
- That is $0.069 a match, against $0.078 in the smoke.

**Pairing caveat.** Jev is not deterministic: same-seed reruns diverge about a minute in (PR #40). A seed fixes minion jitter and entity ids, not the match, which is why everything below is a paired difference with an interval.

## 2. Headline numbers against the spec's targets

### 2.1 The §6.2 economy lines (eco-1 matches only)

Targets are the spec's **B1** pass lines, meant for economy-aware prompts. This is **B0**, so a miss here says where today's prompts leave the economy. It is not a failed gate.

| §6.2 line | Target | eco-1 with today's prompts | Read |
|---|---|---|---|
| Gold / min / bot | 85–125 | **median 59.2** (mean 60.5, range 45.5–76.8); **0 / 12 in band** | below |
| …passive | 30 (fixed by design) | 30.0 | as built |
| …minion last hits | 15–30 (spec §3.2: 150–300 a match) | 10.5 | below |
| …towers (team + local) | 15–25 (150–250 a match) | 10.9 (7.9 + 3.0) | below |
| …PvP (kill + assist + drop + first blood) | 25–40 (250–400 a match) | 9.0 (3.9 + 1.9 + 2.1 + 1.1) | far below |
| PvP share of earned gold (non-passive) | median ≥ 35 % | **28.3 %**; 4 / 12 matches ≥ 35 % | below |
| Items per bot at end | median ≥ 2 | **1**: 7 bots own 0, 52 own 1, 9 own 2, 4 own 3 | below |
| First item time | median ≤ 4:30 | **6:48**, the median of the per-match medians (range 5:45–8:07); 0 / 12 ≤ 4:30 | below |
| Carried gold at death | median 50–300 | per-match medians 82, 97, 152, 173, 198, 240, 343, 452; 6 of the 8 matches with a death are in band | in band, n = 14 deaths |
| \|gold diff\| ÷ team gold at 6:00 | median ≤ 0.25 | **0.245** (max 0.51) | on the line |
| Comeback: the team behind at 5:00 wins | ≥ 20 % of decided | **1 / 5** | n = 5, unreadable |
| Shopping recalls (> 50 % hp, ends in a purchase) | > 0 for medium and hard | — | **unmeasurable**: no prompt shops, and the tool doesn't count them yet (spec §11) |

### 2.2 Gold lost on death: killers vs vanished

| | eco-1, 12 matches |
|---|---:|
| Deaths, all credited (ledger kills = deaths) | 14 |
| Respawns (one death came too late to respawn) | 13 |
| Gold lost on death | 1,495 |
| …paid to killers and assisters | **1,495 (100 %)** |
| …vanished | **0** |

This matches the Q2 default (`toKillers` 1.0). Gold vanishes only on an **execution**, a death with no enemy bearbot damage in the 10 s window. None happened. A tower or minion landed the last hit in 7 of the 14 deaths (the metric tool's `deathsByKiller`), but an enemy bearbot had always hit the victim within 10 s. So the vanish path is tested in `test_economy.mjs` but has never run on Jev.

### 2.3 Shopping lists

| | eco-1, 72 bots |
|---|---:|
| Purchases were exactly the bot's list, in order | 72 / 72 |
| Finished the whole list | 4 / 72 |
| Ended the match holding enough gold for its next item | 4 / 72 |
| Items bought per bot: drums / keytar / violin | 1.08 / 1.17 / 1.17 |

**No prompt declared a list**, so these are the instrument defaults. "Bought in order" holds by construction, because auto-buy only follows the list. The 4 bots holding enough gold for their next item at the end are the ones that never went home to buy it. The rest end short of the next item's price. At about 60 gold a minute, one item (300–350) is 5–6 minutes of earnings, and the first is bought only on the next trip home after that. A declared list from prose was exercised once in the smoke (m2) and is P2's job at scale.

## 3. eco-1 − off, seed-paired

95 % bootstrap interval over the 12 pairs; "u/d" counts pairs where eco-1 was higher / lower.
Full tables: [`economy-slice-2026-09-30-metrics.md`](economy-slice-2026-09-30-metrics.md). Raw numbers: [`economy-slice-2026-09-30-metrics.json`](economy-slice-2026-09-30-metrics.json).

| Metric | off | eco-1 | eco-1 − off [95 % CI] u/d |
|---|---:|---:|---|
| Deaths / match | 1.42 | 1.17 | −0.25 [−0.92, +0.50] 4/6 |
| …of which credited to a bearbot (metric tool's last hit) | 0.67 | 0.58 | −0.08 [−0.67, +0.50] 3/4 |
| Matches with a first blood | 75 % (9) | 67 % (8) | −8.3 pp [−41.7, +25.0] 2/3 |
| First blood at, s (pairs where both had one, n = 6) | 372 | 369 | −3 [−179, +162] 3/3 |
| **PvP share of bot damage** | 27.4 % | 35.3 % | **+7.9 pp [+4.1, +11.9] 11/1** |
| **Bot-time engaged in PvP** | 11.9 % | 15.0 % | **+3.1 pp [+1.4, +4.8] 10/2** |
| Bot-time intent: targeting a bot | 10.7 % | 13.0 % | +2.3 pp [+0.9, +3.7] 11/1 |
| Bot-time engaged in PvE only | 16.7 % | 14.6 % | −2.0 pp [−3.5, −0.7] 3/9 |
| Team fights / match | 3.58 | 4.42 | +0.83 [−0.83, +2.25] 8/3 |
| Team-fight seconds / match | 11.4 | 16.7 | +5.3 [−0.5, +11.0] 9/3 |
| PvP damage taken on neutral ground | 60.1 % | 67.7 % | +7.5 pp [+1.9, +12.9] 10/2 |
| Bot-time under an enemy tower | 9.6 % | 8.2 % | −1.3 pp [−2.1, −0.6] 1/11 |
| Deaths under the killer team's tower (n = 6) | 88.9 % | 81.3 % | −16.7 pp [−50.0, 0.0] 0/1 |
| Deaths dealt by a tower (n = 6) | 33.3 % | 33.3 % | +11.1 pp [−16.7, +41.7] 2/1 |
| Damage / min, PvP (bot → enemy bot) | 182.5 | 281.3 | +98.8 [+67.4, +130.4] 11/1 |
| Damage / min, bot → minions | 299.7 | 339.5 | +39.8 [+20.6, +59.8] 10/2 |
| Damage / min, bot → towers + nexus | 181.3 | 175.5 | −5.8 [−32.3, +18.9] 7/5 |
| Towers destroyed / match | 1.58 | 1.58 | 0.00 [−0.42, +0.42] 3/3 |
| Match length, min | 10.00 | 10.00 | 0 (every match timed out) |
| Decided (by the timeout tiebreak) | 41.7 % | 41.7 % | 0 [−41.7, +41.7] 3/3 |
| Swinginess, per min (30 s windows) | 110 | 145 | not comparable, below |
| Swing ratio (swinginess ÷ gold/min) | 0.76 | 0.38 | not comparable |
| Lead changes / match | 2.50 | 1.58 | −0.92 [−1.75, 0.00] 3/8, not comparable |

How to read it:

- **Bot damage per minute is inflated under eco-1.** All but a handful of bots reach level 4 or 5, which is +24–32 % attack damage, and Amp adds +35 % for those who own it. So the +54 % PvP damage and the +13 % minion damage are mostly stat scaling. The scale-free reads are the **share** and the **bot-time** rows: PvP share, time engaged, intent. They moved, modestly but clearly.
- **The cause of that shift isn't identified.** It is not fewer recalls. Recall decisions are 8.5 % of all decisions in both conditions (560 vs 595 a match; eco-1 has more decisions because nobody stays dead). Other candidates, untested:
  - Respawn keeps six bots on the map, so there are more targets.
  - The extra hp from levels and Road Case keeps a bot in a fight longer before its hp rule fires.
  - The gold, level and bounty sentences `describe_observation` adds change Jev's answers.
- **Swinginess and lead changes are different quantities in the two conditions.** Without an economy the tool's gold is a proxy: the value of what a team destroyed. With eco-1 it is the real ledger, including passive income, which is level by construction. So these rows describe each condition separately and aren't a paired effect. The eco-only no-runaway line is §2.1's gold diff at 6:00.
- **The §6.2 B-vs-A lines, applied to this B0 slice for information:**
  - PvP share passes (CI above 0).
  - Engaged PvP passes, and team fights don't regress.
  - Dives don't rise: the deaths-under-enemy-tower CI is not above 0, on n = 6.
  - The first-blood *rate* is one match lower, inside a wide interval.
  - "Decided" is level, but it is all tiebreak.

### Per seed

| Seed | off: winner, deaths, PvP/min, team fights, first blood s | eco-1: winner, deaths, PvP/min, team fights, first blood s | eco-1 gold/min/bot | lost → killers / vanished | items/bot |
|---|---|---|---:|---|---:|
| 3 | draw, 1, 252, 6, 489 | draw, 3, 325, 7, 175 | 76.1 | 235 / 0 | 1.50 |
| 5 | violet, 2, 164, 2, 417 | draw, 3, 260, 5, 165 | 76.8 | 265 / 0 | 1.67 |
| 7 | draw, 2, 175, 3, 431 | draw, 1, 251, 2, 566 | 61.8 | 99 / 0 | 1.17 |
| 11 | draw, 1, 215, 6, 524 | draw, 0, 273, 6, — | 53.0 | 0 / 0 | 1.00 |
| 13 | violet, 2, 178, 3, 309 | violet, 1, 270, 2, 585 | 55.4 | 41 / 0 | 0.83 |
| 17 | draw, 2, 141, 3, 558 | violet, 0, 316, 5, — | 45.5 | 0 / 0 | 0.83 |
| 23 | violet, 0, 248, 8, — | draw, 1, 242, 2, 435 | 64.7 | 226 / 0 | 1.17 |
| 29 | violet, 4, 132, 1, 278 | violet, 2, 323, 6, 430 | 61.4 | 239 / 0 | 1.00 |
| 31 | draw, 0, 180, 3, — | draw, 0, 239, 4, — | 52.8 | 0 / 0 | 1.00 |
| 37 | violet, 2, 180, 2, 309 | draw, 2, 246, 3, 293 | 71.9 | 342 / 0 | 1.33 |
| 42 | draw, 1, 142, 2, 579 | violet, 0, 295, 5, — | 49.5 | 0 / 0 | 1.00 |
| 101 | draw, 0, 184, 4, — | violet, 1, 334, 6, 165 | 57.0 | 48 / 0 | 1.17 |

All 24 matches ended by timeout at 10:00. The matches with the most deaths (seeds 3 and 5) have the highest income, 76–77 gold/min/bot. Even they are below the band.

## 4. What today's low-hp-recall house prompts make unmeasurable until P2

The house tiers go home only when hurt: about 8.5 % of decisions are recalls, gated on low hp. They know nothing about gold, items or bounty. With prompts like that, these §6 quantities can't be read, or can be read only as B0:

- **Shopping recalls**, the B1 line. Nobody recalls to spend, and the tool doesn't count them yet.
- **Declared shopping lists.** No prompt declares one, so "followed the list" is 72/72 by construction. Whether prose `build` compiles and gets followed was shown once in the smoke, not measured.
- **First-item time and items per bot as a decision.** Both come from *when a bot happens to be at base*, not from a choice to shop.
- **Carried gold as a risk.** At 1.17 deaths a match (14 deaths in all), the 50–300 band is met, but by accident. Hold-vs-spend can't be seen when nobody chooses to spend.
- **The death-drop split under executions.** No execution happened on Jev, so "vanished" is 0 by circumstance, not by rule.
- **Snowball, comeback and gold-lead stability.** 5 matches had both a 5:00 leader and a winner, and every winner came from the timeout tiebreak.
- **Bounty-driven targeting.** The `highest_bounty_enemy` selector is P2. Today's prompts can't act on bounty even though Jev is told it.
- **Match length and timeouts.** 24/24 timeouts in both conditions. Any effect the economy has on ending matches is hidden until something ends them.
- **The B1 − B0 difference itself**, the spec's "are bots using the economy?" test. It needs P2's economy-aware house tiers.

What *can* be read now: the layer's mechanical effect with economy-blind prompts, meaning PvP share and engagement, dives, team fights and first blood; the income level by source; and that the ledger and replay hold up across 12 Jev matches.

## 5. What the Sun 10-04 go/no-go can and can't lean on

**Can lean on:**

- **P1 works on the Jam backend at the Jam shape.** Earn, level, buy, die, drop to the killers and respawn all ran across 12 full matches with 0 errors, and every log replay-verifies.
- **Turning eco-1 on does not make the game less PvP.** On scale-free measures it is modestly more PvP, by +7.9 pp of damage share and +3.1 pp of engaged time, and more of that PvP is on neutral ground. It does not pay for dives. That is the §6.2 "must not get worse" side, met on B0.
- **The income band won't be hit by behaviour alone.** All four earned sources are below the spec's §3.2 per-match expectation, even in the two highest-fighting matches. That argues for scheduling the one constants tuning pass now (minion last hit, tower gold, or the band itself), not discovering it in P3.

**Can't lean on:**

- **Any B1 line.** Shopping, declared lists and item timing as decisions all need P2's economy-aware prompts.
- **The death economy's balance** (snowball, comeback, carried-gold risk, the vanish split). There are too few deaths, and none were executions.
- **Team fights.** +0.83 a match with a CI through 0. The river objective's §9.8 run is still where team fights get judged.
- **Tier or side conclusions.** One pairing with fixed sides, and every decided match went to violet by tiebreak in both conditions.

## 6. Logs and reproduction

The 24 logs aren't in git, by ruling. They are on the
[`data-economy-slice-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-economy-slice-2026-09-30)
prerelease as one zip (`economy-slice-match-logs-2026-09-30.zip`, 2.0 MB, sha256
`9390112c7cd5a7db3c6c4055f99a7cc1d1c2d36b82b386b3d18dbafea39daadd`). Inside are
`runs/economy-slice-2026-09-30-{off,eco-1}-medium-vs-hard-seed<N>.json` and a `SHA256SUMS`. Unzip at
the repo root, then:

```sh
npm run match -- --verify runs/economy-slice-2026-09-30-eco-1-medium-vs-hard-seed3.json
npm run metrics -- --group off runs/economy-slice-2026-09-30-off-*.json \
                   --group eco1 runs/economy-slice-2026-09-30-eco-1-*.json --md out.md
```

One match of the pair, as run:

```sh
npm run match -- --a prompts/pilots/house-violet.md --a-schemas prompts/pilots/house-medium.schemas.json --name-a medium \
  --b prompts/pilots/house-hard.prose.md --b-schemas prompts/pilots/house-hard.schemas.json --name-b hard \
  --jev-schema http://127.0.0.1:8851/ --map pvp-1 --cadence 2 --seed 3 --economy eco-1 \
  --out runs/economy-slice-2026-09-30-eco-1-medium-vs-hard-seed3.json
```

The off match is the same command without `--economy`.
