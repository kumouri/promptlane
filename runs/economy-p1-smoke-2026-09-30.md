# Economy P1 smoke on Jev — 2026-09-30

**Question.** Does the eco-1 layer (`src/economy.ts`, built to `docs/economy-spec.md` §7 P1 and
Ceryce's Q1–Q4/Q10 rulings) work end to end with the Jam's real pilots: do bearbots earn, buy, die,
drop gold to their killers and respawn, and does every match still replay? This is a plumbing
smoke, not the §6 measurement.

**Verdict.** Yes, on 3 full Jam-shape matches. All three replay-verify (120 of 120 checkpoints
each). Match 3 shows the whole loop: 7 deaths, 7 respawns, one bot dead three times, 455 gold lost on
death, of which 441 was paid to killers and assisters and 14 vanished in executions. A declared
shopping list (`build` on the compiled schema) was followed in match 2.

## Setup

- **Jev:** a private `tools/jev/schema_server.py --port 8831 --budget-usd 0.45`, TypeSafe with the
  Workers AI fallback (the default). 5,204 calls, **0 errors, 0 failovers**, 0.24 s mean.
  **Spend: $0.236** (the server's own `cost_usd`).
- **Shape:** full length (600 s), cadence 2, map `pvp-1`, `--economy eco-1`, both sides playing
  compiled house prose (`runs/house-tiers-schemas-{medium,hard}-2026-09-30.json`). These prompts
  predate the economy: nothing in them shops or hunts on purpose (spec §6 condition B0).
- **Match 2's violet** plays the medium schemas with a declared `build` per instrument
  ([`economy-p1-smoke-2026-09-30-medium-with-builds.json`](economy-p1-smoke-2026-09-30-medium-with-builds.json)),
  to exercise the prose-shopping-list path. The other five sides use the instrument defaults.

## Results

| Match | Seed | Deaths | Respawns | PvP dmg/min | Gold/min/bot | PvP share of earned gold | First item (median) | Items at end |
|---|---|---|---|---|---|---|---|---|
| m1 medium vs hard | 7 | 0 | 0 | 277 | 48.5 | 0 % | 6:26 | 1 each |
| m2 medium (declared builds) vs hard | 11 | 1 | 0 (died at 9:46; the timer is 18 s at level 4) | 224 | 53.4 | 29 % | 6:58 | 1, 1, 1, 1, 1, 0 |
| m3 hard vs hard | 42 | 7 | 7 | 319 | 83.6 | 70 % | 5:19 | 1, 3, 2, 1, 2, 2 |

**The death in m2, in full.** Green drums died with 23 gold carried. The violet violin (last enemy
hit in the window) got the kill (200) and first blood (100). Violet drums and keytar were in the
fight and got the assist pool (50 each). Half the victim's at-risk gold, 11, went to the three of
them: 5 / 3 / 3, the remainder to the killer.

**Declared builds were followed.** In m2, violet drums declared Bass Strings → Road Case → Amp and
bought Bass Strings first; its default would have been Road Case. Violet violin declared Metronome
first and bought it; its default starts with Amp.

**Levels.** Every bot reached level 4 or 5 on proximity XP.

## What it says before the §6 measurement (not a measurement: n = 3, no baseline)

- **Deaths are rare with these pilots.** The house tiers recall at low hp (576–605 recall
  decisions per match), and levels add up to +32 % hp. On `pvp-1` without the economy the balance
  study saw about 0.2 deaths a minute. Here: 0, 0.1 and 0.7.
- **Income is low except in a fighting match.** In m1, 48.5 gold/min/bot, against the spec's
  85–125 band (§3.2), all from passive, minions and towers. In m3, which had kills, it was 83.6.
- **The first item comes late.** 5:19–6:58, against the §6 line of 4:30. Nobody shops on purpose:
  a bot only buys when a low-hp recall or a respawn happens to take it home.

These are the B0 shape (prompts that ignore the economy). The P2 house tiers, which recall to
spend, are what §6's B1 condition measures.

## Logs

`runs/economy-p1-smoke-2026-09-30-m1-medium-vs-hard-s7.json`,
`…-m2-mediumbuilds-vs-hard-s11.json`, `…-m3-hard-vs-hard-s42.json`. Each records `economy` (the
whole eco-1 ruleset and all six shopping lists) and `result.economy` (the end-of-match ledger).

```sh
npm run match -- --verify runs/economy-p1-smoke-2026-09-30-m3-hard-vs-hard-s42.json
npm run metrics -- --group smoke runs/economy-p1-smoke-2026-09-30-m*-s*.json --md out.md
```

## The full §6 measurement: what it would cost

- 4 conditions × 2 pairings × 12 seeds = **96 matches**. At this smoke's rate (about $0.078 and
  107–217 s per full match with respawn on), that is roughly **$7.50 of Jev and 3–6 hours** run
  sequentially. Respawn keeps every bot alive to 600 s, so eco matches cost about as much as the
  balance study's longest matches, not its average.
- **It can't all run yet.** Condition B1 needs P2's economy-aware house tiers. Condition R
  (respawn, no gold) needs a `respawn-only` ruleset, which is a constants file, not code.
- **A cheap slice that can run now:** A vs B0 on the existing house tiers, 12 seed pairs × 1
  pairing = 24 matches, about $1.90 and 1–1.5 h.
