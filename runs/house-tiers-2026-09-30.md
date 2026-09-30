# House tiers (easy / medium / hard) on `qwen3.5:9b`: sanity check, 2026-09-30

Job A of Ceryce's 2026-09-30 01:10 CT ask: three house bots differentiated by **strategy, not
stats**, for Friday's Jam, plus a small sanity check. The evolution harness is a separate job.
**This is a sanity check, not a rating: N = 9 matches, 3 per pairing, one model, one cadence.**

**Verdict:**

- **Hard does not beat medium.** Across the three hard vs medium matches, medium won 1 and 2 were
  draws. Hard vs easy: 3 draws.
- **The observed ordering is flat.** 8 of 9 matches were timeout draws with no tower down. The only
  decisive result was medium beating hard.
- **Easy is the hardest bot to kill.** 0 deaths in 6 matches, and nobody took an easy tower.
- **Easy never threatens anything.** 1 % of its calls were attacks; it never attacked a tower.
- **Hard's defect is target identification, not strategy.** 32 of its 87 tower-attack decisions hit
  its own towers (the sim doesn't check team on `attack`).
- **The default house (medium) is unchanged.** The 1000 placement bar hasn't moved.

## What was built

| tier | files | archetype, as played |
|---|---|---|
| easy | `prompts/pilots/house-easy.prose.md` → `house-easy-{violet,green}.md` | recall under 100 hp; leave when an enemy tower is near; attack the nearest enemy; stay with a friendly minion; else home. No abilities. |
| medium | `prompts/pilots/house-{violet,green}.md`, **unchanged** | today's wave-rider (`runs/house-prompt-2026-09-21.md`) |
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
[`house-tiers-schemas-2026-09-30.json`](house-tiers-schemas-2026-09-30.json). Both final versions
compile to the same cascade on all three instruments: easy 5 rules (6,048 tokens, 18.6 s), hard 8
rules (7,654 tokens, 32.9 s).

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
house plays on `qwen3.5:9b` (the ruled backend and the house's existing path), so each cascade is
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
can. That gap is the whole story of hard below.

## Method

- Backend: `tools/model_server.py` on :8801, Ollama `qwen3.5:9b`, `think:false`, temperature
  0.2, 120 tokens. The GPU was shared, at 1.0–2.6 s per call.
- Matches: `npm run match -- --a house:<t> --b house:<t> --cadence 4`, full length (600 sim-s),
  seeds 7 / 11 / 42. Each pairing plays both sides.
- Cadence 4 is the arena's quick-test cadence. The ladder runs cadence 2, which was not measured
  here.
- Every log is replay-verified (`npm run match -- --verify`, 120/120 checkpoints). Its
  `promptText` equals the checked-in side file.
- Timeout rules (`match.ts decideByTiebreak`): more towers alive wins, then more nexus hp, else a
  draw.

## Results

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

## What each tier visibly did

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

## Versions tried and rejected (the practice-match loop)

Each change below is one entrant-style edit prompted by a probe. None is a stat change.

| version | probe | what it showed | change |
|---|---|---|---|
| easy prose v1 | compile only | "no matter what" promoted the tower rule above recall; violin failed to compile | reworded (above) |
| easy render v1 (`tower` from `visibleEnemies`, like medium) | full match, seed 7 vs medium: [`house-tiers-2026-09-30-rejected-easy-v1-vs-medium-seed7.json`](house-tiers-2026-09-30-rejected-easy-v1-vs-medium-seed7.json) | wrote its *own* tower as `tower` 231 times in 438 calls (the example reply's `tw-9` is violet's own tower), so the unconditional leash kept it home all match: 437 `move`, 1 `attack`, mean position 0.04 | `tower` from `nearbyTowers` by the enemy team literal; each side's example names an enemy tower. Probe after: own 7, enemy 15 |
| hard prose v1 (`push_lane` default) | 180 s quick, seed 7 vs medium (log overwritten by the next probe; numbers from the session) | all three hard bearbots dead by 26.4 s: with no wave yet, the default walked them at the enemy nexus; at cadence 4 they crossed the 390 px `nearbyTowers` warning between decisions | prose now ends in a `home` fallback (three compiles, above) |
| hard render v2 (`tower` from `nearbyTowers`, no team check) | 180 s quick, seed 7 vs medium (log overwritten) | own tower as `tower` 47 times vs 6 enemy; 19 tower attacks; violet lost 738 tower hp in 3 min | added `towerteam` (the shipped v3) |
| **hard render v3 (`towerteam`)** | **the 6 matches above** | **32/87 own-tower attacks** | **shipped as-is, with this caveat** |
| hard render v4 (`tower` from `visibleEnemies` exactly as medium, no `towerteam`) | 180 s quick, seed 42, hard as green: [`house-tiers-2026-09-30-rejected-hard-v4-quick-medium-vs-hard-seed42.json`](house-tiers-2026-09-30-rejected-hard-v4-quick-medium-vs-hard-seed42.json) | worse: own tower as `tower` 120 times vs 9 enemy; **29 of 31** tower attacks on its own towers; green lost 1,280 tower hp in 3 minutes | reverted to v3 |

So medium's own `tower` definition is not what keeps medium off its own towers (2/84). Hard's
rule 5 is: an attack-the-tower rule gated only on "friendly minions near" also fires at home,
where your own wave walks past your own towers.

## Follow-ups

- **Hard, next version.** Gate the tower rule on something the model can compute correctly and
  that is false at home. An idea, untested: the enemy's towers are on the enemy side of the river
  (for violet, `x > y`), so worksheet `tx`, `ty` and compare two written numbers. That is the one
  comparison this model does reliably. Also make rule 6 conditional on `foehp` vs own `hp`, or
  drop it. Both are prose changes to recompile, then re-render and rerun the 6 hard matches.
- **Or play the tiers on Jev.** Played on Jev like an entrant (`tools/jev/schema_server.py` with
  the committed schemas), the targets resolve in code and own-tower attacks become impossible. That
  needs a schema-playing house path in `queue.mjs`, which is more than small.
- **Tier picker in the arena UI / ladder**: not built. Today it is config + CLI only. A different
  tier is a different placement bar, so it should never silently apply to the ladder.
- **More N, cadence 2**: the ladder's cadence. These are 9 matches at cadence 4.
- This is also a natural seed population for the evolution harness (Job B): easy, medium and hard
  are three distinct starting strategies with measured weaknesses.

## Reproduce

```sh
python tools/jev/compile.py prompts/pilots/house-hard.prose.md --backend ollama --save-schemas /tmp/s
python tools/model_server.py --port 8801                       # ollama, qwen3.5:9b
npm run match -- --a house:hard --b house --seed 7 --cadence 4 --endpoint http://127.0.0.1:8801/ \
    --out runs/x.json
npm run match -- --verify runs/x.json
```

Wall time here was 10–27 min per full match at cadence 4 on the shared GPU (the host's arena and a
sibling job were also using Ollama).
