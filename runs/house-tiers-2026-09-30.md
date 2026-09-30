# House tiers (easy / medium / hard): sanity check on Jev, 2026-09-30

Job A of Ceryce's 2026-09-30 01:10 CT ask: three house bots differentiated by **strategy, not
stats**, for Friday's Jam, plus a small sanity check. The evolution harness is a separate job.

**The Jam plays on Jev** (ruling 2026-09-25). Each entrant's prose is compiled by the translator
into a rule cascade, and Jev answers that cascade's questions. So the sanity check that counts is
the three tiers' compiled prose on Jev, played exactly the way an entrant's is. That is the first
half of this file. The first run (9 matches, hand-rendered house prompts on raw `qwen3.5:9b`) was
the wrong backend. It is kept below, labelled, because the qwen side files still exist and show a
real failure mode.

**This is a sanity check, not a rating.** 42 matches: 10 per easy pairing, 22 for medium vs hard.
One cadence, one compile per tier.

**Verdict, on Jev:**

- **Easy is clearly the weakest.** It lost all 20 of its matches: 10 to medium and 10 to hard.
  Each loss was a timeout with one easy outer tower down. Easy never took a tower (78 tower hp
  removed in 20 matches) and lost no bearbot.
- **Medium and hard are level.** In 22 matches (11 seeds, both sides) the record is 3-3-16, and
  each side took 25 towers. Every one of the 6 decided matches went to the side playing
  **violet**.
- **Hard is not harder than medium on Jev either, but now it isn't weaker.** It went from medium
  1-0-2 over hard (qwen) to 3-3-16 (Jev).
- **Hard's own-tower problem is gone on Jev.** 0 of its 3,689 tower-attack calls hit its own tower,
  because targets resolve in code. On qwen it was 32 of 87.
- **Hard's weakness that survives: it loses bearbots at enemy towers.** Head to head it lost 18 to
  medium's 14, and 10 to easy's 0. 22 of its 28 deaths came when it was already leaving: the
  recall or retreat rule had fired. All 28 were on the enemy half of the map. Recalling at 90 hp
  is too late under an enemy tower at cadence 2. The qwen run's other suspect, rule 6 picking
  fights with full-health drums, accounts for 2 of the 28.
- **The timeout tiebreak doesn't count bearbots.** It counts towers, then nexus hp. So hard's
  extra deaths cost it nothing on the scoreboard.
- **Jev is not deterministic.** Two same-seed reruns diverged 52.5 s and 61.2 s in. One of them
  flipped the result, from a hard win to a draw. Each match is a sample, not a fixed outcome.
- **The default house (medium) is unchanged,** and so is the 1000 placement bar. The arena's
  placement house still plays the qwen side files; nothing here changes what it runs.

## On Jev: method

- **Schemas.** Easy and hard played the committed
  [`house-tiers-schemas-easy-2026-09-30.json`](house-tiers-schemas-easy-2026-09-30.json) /
  [`-hard-`](house-tiers-schemas-hard-2026-09-30.json). Medium had no Jev schema, so its house
  prose, `prompts/pilots/house-violet.md`, was compiled on develop's translator (#39, `a987e99`)
  the same way easy and hard were: `python tools/jev/compile.py prompts/pilots/house-violet.md
  --backend ollama` (door A, `qwen3.5:9b`, 3 calls, 7,545 tokens, 20.7 s, $0). The results are
  [`house-tiers-schemas-medium-2026-09-30.json`](house-tiers-schemas-medium-2026-09-30.json) and
  [`house-tiers-compile-medium-2026-09-30.md`](house-tiers-compile-medium-2026-09-30.md). Each
  tier's one schema plays both sides, as an entrant's does. Selectors resolve team-aware in code.
- **Matches.** `npm run match -- --a <prose> --a-schemas <schemas> --b … --b-schemas …
  --jev-schema http://127.0.0.1:8811/ --cadence 2`, full length (600 sim-s). That is the Jam's
  shape: cadence 2, both sides compiled. Easy's pairings used seeds 7 / 11 / 42 / 101 / 202; medium
  vs hard added 303 / 404 / 505 / 606 / 707 / 808. Every seed was played both ways round.
- **Jev.** A private `tools/jev/schema_server.py --port 8811 --budget-usd 3.00`, with live Workers
  AI. The arena's port is 8797 and the evolution harness uses 8805, so neither was touched. Nothing
  else on the host was using Jev. The server log's 111 token renewals are all its own, below.
- **Spend.** 73,508 Jev calls, 0.34 s mean, **$2.55** in total. That covers the 42 matches plus
  the 2 reruns. The compile cost $0.
- **Verified.** Every log is replay-verified (`npm run match -- --verify`, 120/120 checkpoints).
  Each log keeps the prose as the side's `promptText` and the compiled cascade under
  `sides.<team>.schemas`.
- **Logs.** Not in git: all 55 logs named in this file (the 44 Jev ones here, the 11 qwen ones
  below; 62.3 MB) are in
  [`house-tiers-match-logs-2026-09-30.zip`](https://github.com/kumouri/promptlane/releases/download/data-house-tiers-2026-09-30/house-tiers-match-logs-2026-09-30.zip)
  on the [`data-house-tiers-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-house-tiers-2026-09-30)
  release, under their `runs/` paths with a `SHA256SUMS`. Unzip at the repo root, then
  `npm run match -- --verify runs/<log>.json`.
- **Timeout rules** (`match.ts decideByTiebreak`): more towers alive wins, then more nexus hp,
  else a draw.

### Medium's compile is not quite medium's prose

The translator compiled medium's prose the way an entrant's compile preview would show it. Two
departures matter.

1. **"hp less than 75" → "hp below 75% of its max"** on keytar and violin, and "below 75 of its
   max" on drums. This is the same trap hard's first prose hit ("below 90"). On Jev, medium's
   recall fired at a median of 105 hp on drums (max 170, of 220), 89.5 on keytar and 90 on
   violin. That is a 75 %-of-max recall, not a 75-hp one. So Jev medium is more careful than qwen
   medium. It lost 1 bearbot to easy in 10 matches, where qwen medium lost 7 in 3.
   Writing "below 75 hp" would fix it. Medium's prose is the default house's qwen prompt, so it
   stays as it is.
2. **`foe` became `nearest_enemy`,** not "the lowest-hp bearbot, else the nearest minion".
   Keytar's chord fires on the nearest enemy of any kind, as the prose says.

`house-green.md` was compiled too (not committed). It gives the same 7-rule shape, but its violin
cascade ends in a question that is not a catch-all ("is this bot at home position?"). Behind that
sits a `push_lane` default: the walk-at-the-nexus default that killed hard's first prose. So the
violet compile plays both sides. The prose's team literals don't reach Jev; its selectors are
team-aware.

## On Jev: results

| # | violet | green | seed | result | towers lost V / G | tower hp lost V / G | bearbot deaths V / G | call errors V / G | log |
|---|---|---|---|---|---|---|---|---|---|
| 1 | easy | medium | 7 | **medium** by timeout | 1 / 0 | 1470 / 0 | 0 / 0 | 1 / 2 | `house-tiers-jev-2026-09-30-easy-vs-medium-seed7.json` |
| 2 | easy | medium | 11 | **medium** by timeout | 1 / 0 | 1564 / 0 | 0 / 1 | 0 / 0 | `house-tiers-jev-2026-09-30-easy-vs-medium-seed11.json` |
| 3 | easy | medium | 42 | **medium** by timeout | 1 / 0 | 1606 / 0 | 0 / 0 | 1 / 2 | `house-tiers-jev-2026-09-30-easy-vs-medium-seed42.json` |
| 4 | easy | medium | 101 | **medium** by timeout | 1 / 0 | 1526 / 0 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-easy-vs-medium-seed101.json` |
| 5 | easy | medium | 202 | **medium** by timeout | 1 / 0 | 1649 / 0 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-easy-vs-medium-seed202.json` |
| 6 | medium | easy | 7 | **medium** by timeout | 0 / 1 | 0 / 2016 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-easy-seed7.json` |
| 7 | medium | easy | 11 | **medium** by timeout | 0 / 1 | 0 / 1974 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-easy-seed11.json` |
| 8 | medium | easy | 42 | **medium** by timeout | 0 / 1 | 0 / 1990 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-easy-seed42.json` |
| 9 | medium | easy | 101 | **medium** by timeout | 0 / 1 | 0 / 1906 | 0 / 0 | 3 / 5 | `house-tiers-jev-2026-09-30-medium-vs-easy-seed101.json` |
| 10 | medium | easy | 202 | **medium** by timeout | 0 / 1 | 0 / 2000 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-easy-seed202.json` |
| 11 | medium | hard | 7 | draw (timeout) | 1 / 1 | 1545 / 1503 | 1 / 1 | 11 / 14 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed7.json` |
| 12 | medium | hard | 11 | draw (timeout) | 1 / 1 | 1575 / 1701 | 2 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed11.json` |
| 13 | medium | hard | 42 | **medium** by timeout | 1 / 2 | 1570 / 1860 | 0 / 2 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed42.json` |
| 14 | medium | hard | 101 | draw (timeout) | 1 / 1 | 1807 / 1617 | 2 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed101.json` |
| 15 | medium | hard | 202 | draw (timeout) | 1 / 1 | 1557 / 1648 | 1 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed202.json` |
| 16 | medium | hard | 303 | draw (timeout) | 1 / 1 | 1252 / 1749 | 0 / 2 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed303.json` |
| 17 | medium | hard | 404 | draw (timeout) | 1 / 1 | 1595 / 1648 | 1 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed404.json` |
| 18 | medium | hard | 505 | **medium** by timeout | 1 / 2 | 1512 / 1860 | 0 / 2 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed505.json` |
| 19 | medium | hard | 606 | draw (timeout) | 1 / 1 | 1604 / 1664 | 1 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed606.json` |
| 20 | medium | hard | 707 | **medium** by timeout | 1 / 2 | 1465 / 1884 | 1 / 2 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed707.json` |
| 21 | medium | hard | 808 | draw (timeout) | 1 / 1 | 1452 / 1788 | 0 / 1 | 0 / 0 | `house-tiers-jev-2026-09-30-medium-vs-hard-seed808.json` |
| 22 | hard | medium | 7 | **hard** by timeout | 1 / 2 | 1469 / 1855 | 0 / 1 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed7.json` |
| 23 | hard | medium | 11 | draw (timeout) | 1 / 1 | 1337 / 1716 | 3 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed11.json` |
| 24 | hard | medium | 42 | **hard** by timeout | 1 / 2 | 1455 / 1897 | 0 / 0 | 8 / 4 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed42.json` |
| 25 | hard | medium | 101 | **hard** by timeout | 1 / 2 | 1443 / 1863 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed101.json` |
| 26 | hard | medium | 202 | draw (timeout) | 1 / 1 | 1734 / 1768 | 1 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed202.json` |
| 27 | hard | medium | 303 | draw (timeout) | 1 / 1 | 1388 / 1539 | 1 / 1 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed303.json` |
| 28 | hard | medium | 404 | draw (timeout) | 1 / 1 | 1249 / 1826 | 1 / 1 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed404.json` |
| 29 | hard | medium | 505 | draw (timeout) | 1 / 1 | 1435 / 1633 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed505.json` |
| 30 | hard | medium | 606 | draw (timeout) | 1 / 1 | 1233 / 1180 | 2 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed606.json` |
| 31 | hard | medium | 707 | draw (timeout) | 1 / 1 | 1252 / 1577 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed707.json` |
| 32 | hard | medium | 808 | draw (timeout) | 1 / 1 | 1275 / 1705 | 0 / 2 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-medium-seed808.json` |
| 33 | easy | hard | 7 | **hard** by timeout | 1 / 0 | 1551 / 0 | 0 / 1 | 15 / 21 | `house-tiers-jev-2026-09-30-easy-vs-hard-seed7.json` |
| 34 | easy | hard | 11 | **hard** by timeout | 1 / 0 | 1542 / 0 | 0 / 1 | 0 / 0 | `house-tiers-jev-2026-09-30-easy-vs-hard-seed11.json` |
| 35 | easy | hard | 42 | **hard** by timeout | 1 / 0 | 1724 / 0 | 0 / 1 | 5 / 6 | `house-tiers-jev-2026-09-30-easy-vs-hard-seed42.json` |
| 36 | easy | hard | 101 | **hard** by timeout | 1 / 0 | 1887 / 72 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-easy-vs-hard-seed101.json` |
| 37 | easy | hard | 202 | **hard** by timeout | 1 / 0 | 1523 / 0 | 0 / 2 | 0 / 0 | `house-tiers-jev-2026-09-30-easy-vs-hard-seed202.json` |
| 38 | hard | easy | 7 | **hard** by timeout | 0 / 1 | 0 / 1515 | 2 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-easy-seed7.json` |
| 39 | hard | easy | 11 | **hard** by timeout | 0 / 1 | 0 / 1573 | 1 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-easy-seed11.json` |
| 40 | hard | easy | 42 | **hard** by timeout | 0 / 1 | 0 / 1677 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-easy-seed42.json` |
| 41 | hard | easy | 101 | **hard** by timeout | 0 / 1 | 6 / 1804 | 0 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-easy-seed101.json` |
| 42 | hard | easy | 202 | **hard** by timeout | 0 / 1 | 0 / 1615 | 2 / 0 | 0 / 0 | `house-tiers-jev-2026-09-30-hard-vs-easy-seed202.json` |

Two same-seed reruns, not counted above
(`house-tiers-jev-2026-09-30-rerun-{hard-vs-medium-seed7,easy-vs-hard-seed42}.json`):

| rerun of | original | rerun | first differing decision | live decisions that agree (same tick, same bot) |
|---|---|---|---|---|
| hard vs medium, seed 7 | **hard** by timeout (towers lost 1 / 2), deaths 0 / 1 | **draw** (1 / 1), deaths 1 / 0 | 52.5 s | 845 / 1,632 |
| easy vs hard, seed 42 | **hard** by timeout (1 / 0), deaths 0 / 1 | **hard** by timeout (1 / 0), deaths 0 / 0 | 61.2 s | 1,124 / 1,648 |

Per tier and opponent, summed over the pairing. "Tower hp removed/lost" is the checkpoint delta.
On Jev every tower attack targets an enemy, so all of it is enemy damage.

| tier | vs | n | W-L-D | towers taken / lost | enemy tower hp removed | own tower hp lost | own bearbots lost | enemy bearbots killed | attack + ability share of calls | tower-attack calls (on own towers) | recall calls | mean forward position (0 = own base, 1 = enemy base) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | medium | 10 | 0-10-0 | 0 / 10 | 0 | 17701 | 0 | 1 | 13 % | 0 (0) | 127 | 0.21 |
| easy | hard | 10 | 0-10-0 | 0 / 10 | 78 | 16411 | 0 | 10 | 12 % | 0 (0) | 111 | 0.21 |
| medium | easy | 10 | 10-0-0 | 10 / 0 | 17701 | 0 | 1 | 0 | 31 % | 1287 (0) | 536 | 0.31 |
| medium | hard | 22 | 3-3-16 | 25 / 25 | 34192 | 35493 | 14 | 18 | 31 % | 2516 (0) | 1027 | 0.30 |
| hard | easy | 10 | 10-0-0 | 10 / 0 | 16411 | 78 | 10 | 0 | 23 % | 1142 (0) | 535 | 0.29 |
| hard | medium | 22 | 3-3-16 | 25 / 25 | 35493 | 34192 | 18 | 14 | 26 % | 2547 (0) | 1181 | 0.28 |

**Rule fire shares on Jev** (all instruments, all matches; rule ids differ a little per instrument):

- **easy:** stay with a minion 47 %, go home (no minion) 25 %, enemy tower in sight → home 14 %,
  attack the nearest enemy 13 %, recall 1 %.
- **medium:** ride the wave 41 %, wait at home 14 % (+3 % default), ability 14 %, attack the foe
  11 %, recall 6 %, the tower 6 %, a tower without a wave → home 4 %.
- **hard:** push with the wave 42 %, default home 19 %, tower with 2+ minions 13 %, alone at a
  tower → home 7 %, recall 7 %, the nearest minion (rule 7) 6 %, any bearbot (rule 6) 5 %,
  finish-kill (rules 3–4) 1.5 %.

**Call errors.** 98 of 70,162 decisions (0.14 %) got no answer. The bearbot holds for that
cadence window. 61 of the 98 came from the two seed-7 matches that ran side by side. After
that, matches ran one at a time. Every error was a 401. The server's token provider force-renews
on each 401 without checking whether another thread has already renewed, so concurrent 401s
set off a run of renewals: 111 in this run. That is a `tools/jev/client.py` issue, logged under
follow-ups. It is not a tier issue. *(Fixed since: `runs/jev-client-renew-2026-09-30.md`.)*

## On Jev: what each tier did

**Easy: gives up its outer tower, keeps its bearbots.** Its compiled rule 2 ("an enemy tower or
nexus is visible → move home") fires whenever its wave reaches the enemy's tower line. Then its
minions push alone and die. Medium's or hard's wave, with bearbots behind it, takes easy's top or
mid **outer** tower at 235–385 s in every match. Nobody ever took an easy inner tower. Easy lost
no bearbot in 20 matches. It killed 10 of hard's bearbots and 1 of medium's, all at its own
towers. It attacked on 12–13 % of calls and never hit a tower.

**Medium: pushes, recalls early, trades evenly with hard.** Its most-fired rules are ride the wave
(41 %) and the 75 %-of-max recall (above). Against hard, both sides lose one outer tower at about
265–335 s. The 6 decided matches are the ones where one side also lost a second tower. 13 of
medium's 15 deaths came while recalling.

**Hard: level with medium, but reckless at towers.** On Jev it attacks less than medium (23–26 %
of calls against 31 %). Its biggest rule is "push with the wave" (42 %), and 19 % of its calls
fall through to the home default. It takes towers as well as medium does (25 each). It loses more
bearbots: 28 in 32 matches, where medium loses 15 in 32. The deaths are at the enemy's towers
(forward position 0.40–0.93 at the last checkpoint before each death). 20 died recalling and 2
retreating. Recall fired at a median of 72–76 hp. So the 90-hp line fires, but under a tower
at cadence 2 it fires too late. The qwen run's suspect, rule 6 fights with full-health drums, is
2 deaths of 28. Rule 6 fires on only 5 % of calls, because rules 1–5 catch most of what it would.

## Side and seed caveats

- **Every decided medium–hard match went to violet (6 of 6).** 16 of 22 were draws. That is a
  map or side effect, or chance at N = 6. Either way, "medium vs hard" has no winner here.
- **Jev is not deterministic.** It agrees with prompt-evolution-smoke-2026-09-30.md: a same-seed
  replay is a new sample. The easy results (20-0 with one outer tower each time) are stable. The
  medium-vs-hard ones are coin flips around a draw.
- **One compile per tier.** Translation is sampled. A different compile of the same prose can
  play differently, as the green compile's `push_lane` default shows.

## What was built

| tier | files | archetype, as played |
|---|---|---|
| easy | `prompts/pilots/house-easy.prose.md` → `house-easy-{violet,green}.md` | recall under 100 hp; leave when an enemy tower is near; attack the nearest enemy; stay with a friendly minion; else home. No abilities. |
| medium | `prompts/pilots/house-{violet,green}.md`, **unchanged**; on Jev, `house-violet.md` compiled to `house-tiers-schemas-medium-2026-09-30.json` | today's wave-rider (`runs/house-prompt-2026-09-21.md`) |
| hard | `prompts/pilots/house-hard.prose.md` → `house-hard-{violet,green}.md` | recall under 90; leave a tower without a wave; ability then attack on a bearbot under 100 hp; the tower if 2+ friendly minions; the lowest-hp bearbot; the nearest minion; ride; else home |

**Selection:** `config.house.tier` (with `files` null), or `--house-tier` on the arena, or
`--a/--b house[:tier]` on `npm run match`. Unset means medium, exactly as before. There is no
UI or ladder picker; see follow-ups.

### Through the translator, as an entrant's prose goes

Each tier was authored as entrant-style prose and compiled with
`python tools/jev/compile.py prompts/pilots/house-<tier>.prose.md --backend ollama` (door A,
`qwen3.5:9b`, $0). The compile reports and schemas are
[`house-tiers-compile-easy-2026-09-30.md`](house-tiers-compile-easy-2026-09-30.md),
[`house-tiers-compile-hard-2026-09-30.md`](house-tiers-compile-hard-2026-09-30.md) and
[`house-tiers-schemas-easy-2026-09-30.json`](house-tiers-schemas-easy-2026-09-30.json) /
[`-hard-`](house-tiers-schemas-hard-2026-09-30.json) (`{drums, keytar, violin}`, the `npm run match
--a-schemas` shape). The per-instrument clause leak fixed on develop the same day (#39) did not
touch these: no schema names another instrument's ability. Both final versions
compile to the same cascade on all three instruments: easy 5 rules (6,048 tokens, 18.6 s), hard 8
rules (7,654 tokens, 32.9 s). Medium's house prose was compiled later, for the Jev run, with the
same command (see "Medium's compile is not quite medium's prose" above).

The prose needed entrant-style rewording before it compiled the way I meant. Each of these is
visible in the compile preview an entrant gets:

1. **"no matter what else is happening"** (easy's tower rule) is an absolute-override phrase.
   `translator.enforce_absolute_priority` promoted that rule above recall. Separately, violin failed
   to compile at all: `rule guard_retreat_threshold: invalid action kind None`, 3 attempts. The
   fix was to drop the phrase and say "This comes before everything else" on the recall rule.
2. **A default the prose never stated.** Hard's first prose ended "advance down the lane toward
   the enemy nexus". It compiled to a `push_lane` default, and that played as suicide (below).
   Rewriting the ending as "…if there is no allied minion, go home and wait" still compiled to
   `push_lane`: the sentence was listed under *Dropped* and the translator supplied its own
   default. Only "**Your fallback**, when none of the above applies, is to go home…" produced a
   `home` default.
3. **"hp is below 90" → "below 90% of its max"** for drums and violin, but not keytar, in one
   compile. With that rule drums would recall under 198 hp. Writing "below **90 hp**" compiled
   cleanly on all three.

### How the compiled cascade becomes a `qwen3.5:9b` prompt

At the Jam, an entrant's cascade runs on Jev, and targets are resolved in code, team-aware. The
arena's placement house plays on `qwen3.5:9b` (its existing path), so for that path each cascade is
**hand-rendered** rule for rule into the house format: a worksheet, team literals, and "take the
FIRST rule that matches".

| compiled (hard, all 3 instruments) | rendered rule | worksheet keys |
|---|---|---|
| 1 `hp below 90` → recall | 1 | `hp` |
| 2 `enemy tower visible AND no allied minion near` → move home | 2 | `towerteam`, `wave` |
| 3 `bearbot < 100 hp AND ability ready` → ability, `lowest_hp_enemy` | 3 | `cd`, `foe`, `foehp` |
| 4 `bearbot < 100 hp` → attack, `lowest_hp_enemy` | 4 | `foe`, `foehp` |
| 5 `enemy tower visible AND ≥ 2 allied minions` → attack, `nearest_tower` | 5 | `towerteam`, `wave`, `tower` |
| 6 `enemy bearbot visible` → attack, `lowest_hp_enemy` | 6 | `foe` |
| 7 `enemy minion visible` → attack, `nearest_enemy` | 7 | `creep` |
| 8 `allied minion near` → move, `nearby_minion` | 8 | `wave` + that minion's x,y |
| default → move, `home` | 9 | — |

Easy maps the same way: 5 rules; `foe` = `nearest_enemy`; the root default is unreachable
because rules 4 and 5 cover everything.

**This is where the house and an entrant stop being identical.** The rules are the same, but a Jev
entrant can't mis-target (the selector resolves in code), while the 9B model filling a worksheet
can. That gap is the whole story of hard in the earlier qwen run, and why it vanishes on Jev.

## Earlier run: hand-rendered prompts on `qwen3.5:9b` (not the Jam's backend)

The first sanity check, before the Jev run above. It played the qwen side files
(`house-<tier>-{violet,green}.md` and medium's `house-{violet,green}.md`) on raw `qwen3.5:9b` at cadence 4.
That is how the arena's placement house plays today, but it is not how an entrant plays at the Jam.
Its verdict at the time: hard does not beat medium (medium 1-0-2 over hard), 8 of 9 matches were
timeout draws, easy lost nothing, and hard hit its own towers on 32 of 87 tower attacks.

### Method

- Backend: `tools/model_server.py` on :8801, Ollama `qwen3.5:9b`, `think:false`, temperature
  0.2, 120 tokens. The GPU was shared, at 1.0–2.6 s per call.
- Matches: `npm run match -- --a house:<t> --b house:<t> --cadence 4`, full length (600 sim-s),
  seeds 7 / 11 / 42. Each pairing plays both sides.
- Cadence 4 is the arena's quick-test cadence. The ladder runs cadence 2, which was not measured
  here.
- Every log is replay-verified (`npm run match -- --verify`, 120/120 checkpoints). Its
  `promptText` equals the checked-in side file. The logs, the two rejected-version logs below
  included, are in the release zip (**Logs**, in the Jev method above).
- Timeout rules (`match.ts decideByTiebreak`): more towers alive wins, then more nexus hp, else a
  draw.

### Results

| # | violet | green | seed | result | towers lost V / G | tower hp lost V / G | bearbot deaths V / G | log |
|---|---|---|---|---|---|---|---|---|
| 1 | easy | medium | 7 | draw (timeout) | 0 / 0 | 283 / 0 | 0 / 2 | `house-tiers-2026-09-30-easy-vs-medium-seed7.json` |
| 2 | medium | easy | 11 | draw (timeout) | 0 / 0 | 52 / 653 | 3 / 0 | `house-tiers-2026-09-30-medium-vs-easy-seed11.json` |
| 3 | easy | medium | 42 | draw (timeout) | 0 / 0 | 200 / 0 | 0 / 2 | `house-tiers-2026-09-30-easy-vs-medium-seed42.json` |
| 4 | easy | hard | 7 | draw (timeout) | 0 / 0 | 236 / 795 | 0 / 1 | `house-tiers-2026-09-30-easy-vs-hard-seed7.json` |
| 5 | hard | easy | 11 | draw (timeout) | 0 / 0 | 538 / 364 | 3 / 0 | `house-tiers-2026-09-30-hard-vs-easy-seed11.json` |
| 6 | easy | hard | 42 | draw (timeout) | 0 / 0 | 230 / 788 | 0 / 1 | `house-tiers-2026-09-30-easy-vs-hard-seed42.json` |
| 7 | hard | medium | 7 | **medium** by timeout | 1 / 0 | 946 / 137 | 1 / 3 | `house-tiers-2026-09-30-hard-vs-medium-seed7.json` |
| 8 | medium | hard | 11 | draw (timeout) | 0 / 0 | 225 / 733 | 3 / 2 | `house-tiers-2026-09-30-medium-vs-hard-seed11.json` |
| 9 | hard | medium | 42 | draw (timeout) | 0 / 0 | 562 / 84 | 3 / 0 | `house-tiers-2026-09-30-hard-vs-medium-seed42.json` |

Per tier and opponent, summed over the pairing's 3 matches. "Tower hp removed/lost" is the
checkpoint delta, whoever caused it; see the self-damage note under hard.

| tier | vs | n | W-L-D | own bearbots lost | enemy bearbots killed | enemy tower hp removed | own tower hp lost | attack + ability share of calls | tower-attack calls | recalled when under own threshold | mean forward position (0 = own base, 1 = enemy base) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | medium | 3 | 0-0-3 | 0 | 7 | 52 | 1136 | 1 % | 0 | 2/2 | 0.13 |
| easy | hard | 3 | 0-0-3 | 0 | 5 | 2121 | 830 | 1 % | 0 | 2/2 | 0.11 |
| medium | easy | 3 | 0-0-3 | 7 | 0 | 1136 | 52 | 29 % | 45 | 23/52 | 0.29 |
| medium | hard | 3 | 1-0-2 | 6 | 6 | 2241 | 446 | 30 % | 39 | 42/112 | 0.32 |
| hard | easy | 3 | 0-0-3 | 5 | 0 | 830 | 2121 | 43 % | 55 | 30/37 | 0.15 |
| hard | medium | 3 | 0-1-2 | 6 | 6 | 446 | 2241 | 41 % | 32 | 12/18 | 0.16 |

**Observed ordering.** By result: medium ≥ hard, easy = both (all draws). By survival: easy (0
deaths) far ahead of medium (13) and hard (11). By pressure (attack share, forward position):
hard attacks most, medium pushes furthest, and easy does neither. None of this matches the
intended easy < medium < hard. **N is 3 per pairing, so none of it is a statistic.**

### What each tier visibly did

**Easy: a wall.** 97–100 % `move`. It sits around its own side (mean position 0.11–0.13 per pairing) and
turns back when an enemy tower comes near, e.g. #1 t = 72 s:

```
{"hp":140,"tower":"tw-10","foe":null,"wave":3,"kind":"move","target":{"x":100,"y":900}}
```

It attacked only what walked up to it (#1 t = 81 s, `"kind":"attack","target":"mn-54"`) and
recalled early (#1 t = 544 s, `{"hp":86,…,"kind":"recall"}`; 4 of 4 times it dipped under 100).
It lost **no bearbot in 6 matches** and **no tower**. Medium put 1,136 hp on easy's towers across
three matches and lost 7 bearbots doing it, mostly to easy's towers. Easy removed 52 hp of
medium's towers in 3 matches.

"Easy" is easy in the sense that it never threatens you. It is not easy to *beat* on the timeout
tiebreak within 10 minutes: no bot here took one of its towers.

**Medium: pushes, dies to towers, never converts.** Today's house did what
`runs/house-prompt-2026-09-21.md` described: rides the wave, fights, presses towers (84
tower-attack calls, 2 of them on its own towers). It obeyed its own recall rule 40 % of the time
(65/164 decisions under 75 hp), in line with the 46 % measured on 2026-09-21. Its deaths are that
hole, e.g. #1 t = 130.7 s, below 75 hp, attacking a tower:

```
{"hp":22,"wave":0,"tower":"tw-5","foe":"tw-5","cd":0,"kind":"attack","target":"tw-5"}
```

It lost 13 bearbots in 6 matches. The one tower that fell in the whole set was hard's top outer
(#7, `tw-5`): medium's green bots issued 10 attacks on it, and hard's top drums had died at
115.7 s.

**Hard: attacks most, recalls best, hits its own towers.**

- Highest attack share (41–43 % of calls).
- Best recall discipline (42/55 = 76 % under 90 hp, vs medium's 40 % under 75).
- Real finisher plays, e.g. #9 t = 98.7 s keytar,
  `{"hp":70,…,"foe":"bb-18","foehp":31,…,"kind":"ability","ability":"chord"}` (a 70-hp keytar,
  under its own recall line, casting instead of leaving).
- Real enemy-tower hits, e.g. #6 t = 85.5 s, `{"hp":72,"wave":2,"tower":"tw-5","towerteam":"violet",…,"kind":"attack","target":"tw-5"}`
  (again under its recall line; that violin died at 87.6 s).

Two things sank it:

1. **Own-tower attacks: 32 of 87 tower-attack decisions.** 27 of 56 as green, 5 of 31 as violet.
   The model does not just misread its worksheet, it overrides it. #6 green drums, t = 221 s:
   `{"hp":220,"wave":2,"tower":"tw-8","towerteam":"green",…,"kind":"attack","target":"tw-8"}`
   wrote its own team correctly, so rule 5 did not match, and it attacked its own `tw-8` anyway.
   At t = 103 s it wrote `"tower":null` and attacked its own `tw-4`. The sim applies `attack` to any
   id, any team. Easy's side removed only 52 tower hp in its three matches against medium. Yet
   hard's towers lost 2,121 hp against easy. So most of that damage is very likely hard's own.
   That is an inference from the checkpoints; the logs don't attribute damage.
2. **Rule 6 ("an enemy bearbot is in sight → attack the lowest-hp one") picks fights with
   full-health drums.** Hard's deaths are mostly this: #9 t = 144.7 s violin at 106 hp attacking a
   220-hp drums; #5 t = 239.5 s drums at 88 hp (under its own recall line) attacking a 204-hp drums.
   At cadence 4 a tower plus a drums can take > 90 hp inside one decision window, so the recall
   rule never gets a turn.

**Hard does not beat medium, and I did not tune stats to make it.** The two defects above are what
a next version has to fix; see follow-ups.

### Versions tried and rejected (the practice-match loop)

Each change below is one entrant-style edit prompted by a probe. None is a stat change.

| version | probe | what it showed | change |
|---|---|---|---|
| easy prose v1 | compile only | "no matter what" promoted the tower rule above recall; violin failed to compile | reworded (above) |
| easy render v1 (`tower` from `visibleEnemies`, like medium) | full match, seed 7 vs medium: `house-tiers-2026-09-30-rejected-easy-v1-vs-medium-seed7.json` (release zip) | wrote its *own* tower as `tower` 231 times in 438 calls (the example reply's `tw-9` is violet's own tower), so the unconditional leash kept it home all match: 437 `move`, 1 `attack`, mean position 0.04 | `tower` from `nearbyTowers` by the enemy team literal; each side's example names an enemy tower. Probe after: own 7, enemy 15 |
| hard prose v1 (`push_lane` default) | 180 s quick, seed 7 vs medium (log overwritten by the next probe; numbers from the session) | all three hard bearbots dead by 26.4 s: with no wave yet, the default walked them at the enemy nexus; at cadence 4 they crossed the 390 px `nearbyTowers` warning between decisions | prose now ends in a `home` fallback (three compiles, above) |
| hard render v2 (`tower` from `nearbyTowers`, no team check) | 180 s quick, seed 7 vs medium (log overwritten) | own tower as `tower` 47 times vs 6 enemy; 19 tower attacks; violet lost 738 tower hp in 3 min | added `towerteam` (the shipped v3) |
| **hard render v3 (`towerteam`)** | **the 6 matches above** | **32/87 own-tower attacks** | **shipped as-is, with this caveat** |
| hard render v4 (`tower` from `visibleEnemies` exactly as medium, no `towerteam`) | 180 s quick, seed 42, hard as green: `house-tiers-2026-09-30-rejected-hard-v4-quick-medium-vs-hard-seed42.json` (release zip) | worse: own tower as `tower` 120 times vs 9 enemy; **29 of 31** tower attacks on its own towers; green lost 1,280 tower hp in 3 minutes | reverted to v3 |

So medium's own `tower` definition is not what keeps medium off its own towers (2/84). Hard's
rule 5 is: an attack-the-tower rule gated only on "friendly minions near" also fires at home,
where your own wave walks past your own towers.

## Follow-ups

- **Hard, next version (on Jev).** Its deaths are late exits from enemy towers, so the lever is
  leaving earlier, not targeting: recall at a higher line, or retreat from a tower on hp as well
  as on "no allied minion". It needs a margin over medium that shows up in towers, since the
  tiebreak ignores bearbots. These are prose changes: recompile, then rerun medium vs hard at
  N ≥ 22. Or let the evolution campaign's hard lineage find it.
- **Hard on qwen, if the arena's house path stays qwen.** Gate the tower rule on something the
  model can compute correctly and that is false at home. An idea, untested: the enemy's towers are
  on the enemy side of the river (for violet, `x > y`), so worksheet `tx`, `ty` and compare two
  written numbers. That is the one comparison this model does reliably. Also make rule 6
  conditional on `foehp` vs own `hp`, or drop it.
- **Medium's prose says "hp less than 75", which compiles to 75 % of max.** If medium is ever
  meant to play on Jev as written, say "below 75 hp". That changes the default house's qwen prompt
  too, so it is a placement-bar decision, not a tidy-up.
- **The arena's placement house plays qwen side files, not schemas.** Playing a tier on Jev in
  the arena needs a schema-playing house path in `queue.mjs`, which is more than small.
- **`tools/jev/client.py`: 401 renewal storm under concurrency.** `WranglerOAuthToken.force_refresh`
  renews on every 401, even when another thread renewed a moment earlier. With two matches on one
  schema server, this run logged 111 renewals and 61 unanswered decisions in two matches. The
  arena's practice panel serves concurrent matches on one server, so this matters for the Jam.
  The likely fix is to renew only if the token that 401'd is still the current one. It is not
  fixed here. **Fixed later on 2026-09-30** (`runs/jev-client-renew-2026-09-30.md`). That fix was
  needed but wasn't the whole story. A brand-new token 401s for up to ~0.5 s, so each renewal
  caused the next. Two concurrent matches now cost one renewal and zero unanswered decisions.
- **Violet won all 6 decided medium–hard matches.** Worth a look before any tier ranking leans on
  side-balanced seeds.
- **Tier picker in the arena UI / ladder**: not built. Today it is config + CLI only. A different
  tier is a different placement bar, so it should never silently apply to the ladder.
- This is also a natural seed population for the evolution harness (Job B): easy, medium and hard
  are three distinct starting strategies with measured weaknesses.

## Reproduce

On Jev (the Jam's shape):

```sh
python tools/jev/compile.py prompts/pilots/house-violet.md --backend ollama --save-schemas /tmp/m
#   then merge /tmp/m/house-violet-{drums,keytar,violin}.json into one {drums, keytar, violin} file
python tools/jev/schema_server.py --port 8811 --budget-usd 3.00   # a private port: not 8797 (arena) or 8805 (evolution)
npm run match -- --a prompts/pilots/house-hard.prose.md --a-schemas runs/house-tiers-schemas-hard-2026-09-30.json     --b prompts/pilots/house-violet.md --b-schemas runs/house-tiers-schemas-medium-2026-09-30.json     --jev-schema http://127.0.0.1:8811/ --seed 7 --cadence 2 --out runs/x.json
npm run match -- --verify runs/x.json
```

A Jev match took 139–203 s of wall time and about $0.06. This run went one at a time because of
the `client.py` renewal storm. That is fixed now, so matches can share a server
(`runs/jev-client-renew-2026-09-30.md`).

The earlier qwen run:

```sh
python tools/jev/compile.py prompts/pilots/house-hard.prose.md --backend ollama --save-schemas /tmp/s
python tools/model_server.py --port 8801                       # ollama, qwen3.5:9b
npm run match -- --a house:hard --b house --seed 7 --cadence 4 --endpoint http://127.0.0.1:8801/ \
    --out runs/x.json
npm run match -- --verify runs/x.json
```

Wall time here was 10–27 min per full match at cadence 4 on the shared GPU (the host's arena and a
sibling job were also using Ollama).

## Recompiled on #39

Later on 2026-09-30, both tiers' prose was recompiled with the leak-fixed translator (#39,
`a987e99`), using the same command as above (`--backend ollama`, `qwen3.5:9b`). Easy took 6,233
tokens and 18.5 s; hard took 7,656 tokens and 29.2 s. Each instrument's fresh schema was diffed
against `house-tiers-schemas-{easy,hard}-2026-09-30.json`, rule by rule.

- **Equivalent. Nothing changed.** On all six instrument sets the recompile gives the same rule
  count, order, action kinds, abilities, target selectors and default: easy 5 rules with the
  unreachable `push_lane` root default, and hard 8 rules with a `home` default.
- **Only the question wording differs.** "visible" became "in sight", and rule 3's two conjuncts
  swapped order on drums and keytar. Translation is sampled, so small wording changes between
  compiles are expected.
- **No leaks.** No rule, old or fresh, names another instrument's ability or cooldown. Hard's rule
  3 fires `kick` / `chord` / `staccato` on drums / keytar / violin respectively.
- **House files are unchanged.** Hard's rule 3 in `house-hard-{violet,green}.md` pairs each
  instrument with its own primary, just as the schemas do. Easy uses no ability. Both side files
  still render the cascade correctly.
- **No smoke match was run**, because no tier file changed.
