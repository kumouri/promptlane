# House prompt on `qwen3.5:9b` — quick-test evidence, 2026-09-21/22

Arena spec §7 **Q13 ruling** (Ceryce, 2026-09-21 23:43 CT): write a stronger house prompt before the
pre-jam ladder places anyone against it. This is the evidence for
[`prompts/pilots/house-violet.md`](../prompts/pilots/house-violet.md) /
[`house-green.md`](../prompts/pilots/house-green.md) — four quick tests (3 sim-minutes, cadence 4,
the ruled quick-test shape, Q10) on the ruled backend (Ollama `qwen3.5:9b`, Q12), serial, seeds 7 and
11. **Verdict in one line: a real improvement over `drums.md` as an opponent, with one known hole —
the model obeys its own low-HP check only about half the time under pressure.** Details below; the
logs are checked in and replay-verified.

## What the prompt does and why it looks the way it does

The model class is the constraint. `qwen3.5:9b` through `tools/model_server.py` runs with
`think: false`, temperature 0.2 and 120 output tokens, and in ~60 single-shot probes before the
matches it showed exactly one dependable skill set: copy an id or a coordinate out of the
observation, and compare two numbers *that are both in front of it*. It could not:

- do a per-instrument lookup ("drums 88, keytar 56, violin 60") or a percentage of `maxHp`;
- compare a field against `self.team` (it read its own towers as enemy towers every time);
- follow more than ~3 ordered rules of prose — in a 7-rule prompt it matched the most salient
  feature (an enemy in sight → attack) and skipped rule 1 even at hp 50;
- resist copying the worked example (it attacked `bb-5`, the id from the example, in a match
  state that had no `bb-5`).

Two things fixed most of that, and they are the design:

1. **A worksheet the model writes before it decides.** `parseAction` takes the first `{`…last `}` and
   only reads `kind`/`target`/`ability`, so extra keys are legal. The reply starts
   `{"hp":…,"wave":…,"tower":…,"foe":…,"cd":…` and only then `"kind"`. Once the number is written
   down the comparison works ("is 61 less than 75" passed every probe; "is self.hp less than 75"
   failed). The runner's own trailing line (`Reply with ONLY one JSON object …`) sits between the
   pilot text and the observation; the model obeys it strictly, so the worksheet must be *inside*
   the one object — a separate scratch line was dropped every time.
2. **One file per side, not one file.** Team is a literal (`"team":"violet"`, home `{100,900}`) so
   every team check is a string match. A single-file variant with a sixth `"team"` worksheet key
   was tested and was clearly worse (targeted its own minions, dived two towers, missed a recall).
   The arena loads `house-<side>.md` for the side the house plays (`tools/arena/house.mjs`).

Strategy, deliberately simple: **ride your own minion wave** (move to an allied minion's position —
lane discipline and tower cover for free), attack what the wave meets (lowest-hp enemy bearbot, else
nearest enemy minion), attack a tower/nexus only while allied minions are in sight, go home when a
tower is in sight and the wave is not, recall under 75 hp (one literal for all three instruments;
that is 34 % for drums, 54 % keytar, 50 % violin), abilities gated on `cd` = 0 (chord on any foe;
kick/staccato only as a finisher on a bearbot under 100 hp, because an out-of-range ability does
not consume its cooldown — the bot would retry it every tick and stand still).

Things the numbers in `src/sim/match.ts` decided: bearbots never respawn, so a death is permanent
and retreat is worth more than damage; `attack <id>` auto-approaches, so it is the real movement
primitive; an `ability` reply fires once and then the bot stands still for the rest of the cadence
window, so kick is a DPS loss at any cadence and staccato only pays at cadence 2.

## Runs

All four: `--cadence 4 --max-sim-sec 180`, backend `ollama/qwen3.5:9b` via `tools/model_server.py`
(defaults), through a size-logging pass-through proxy. A quick test ends `unfinished` (no winner
by construction) so "outcome" is the end state. Wall times include contention: a sibling arena job
was using the same Ollama for its own two tests during r1–r2.

| run | sides (violet / green) | seed | wall | deaths V / G | first blood | tower hp lost V / G | house action mix | drums action mix | malformed |
|---|---|---|---|---|---|---|---|---|---|
| r1 | **house** / drums | 7 | 243 s | **1** / 0 | 61.7 s, house violin (tower) | 6 / **112** | move 62 %, attack 22 %, ability 10 %, recall 6 % (101 calls) | move 100 % (129) | 0 / 0 |
| r2 | drums / **house** | 11 | 189 s | 3 / **1** | 58.8 s, drums drums (tower) | **172** / 0 | move 69 %, attack 18 %, ability 9 %, recall 4 % (107) | move 94 %, attack 6 % (47) | 0 / 0 |
| r3 | **house** / drums | 11 | 171 s | **1** / 0 | 61.7 s, house violin (tower) | 46 / **300** | move 60 %, attack 27 %, ability 7 %, recall 6 % (101) | move 100 % (129) | 0 / 0 |
| r4 | **house** / **house** | 7 | 131 s | 3 / 2 | 57.5 s, green violin | 102 / 327 | V: move 57 %, attack 26 %, ability 11 %, recall 5 % (61); G: move 69 %, attack 17 %, ability 10 %, recall 2 % (89) | — | 0 / **2** |

Reading it:

- **Action mix.** The brief's target was "not 94 % move". House: 57–69 % move (most of it riding the
  wave or going home), 17–27 % attack, 7–11 % ability, 2–6 % recall. Drums on the same model: 94–100 %
  move, never an ability, never a recall — same as the checked-in sample log.
- **Objective pressure.** In every run the house was the only side to damage an enemy tower
  (112 / 172 / 300 hp in r1–r3, on the outer mid or top tower, with the wave). No tower fell in
  3 minutes; at ~100–300 hp per wave that is ~4–8 waves per tower, so towers fall in a full match,
  not a quick test. Drums damaged nothing (the 6–46 hp on violet towers is green minions).
- **Deaths.** As green (r2) the house lost 1 bot to drums' 3 — drums walked its whole violet band
  into towers by 72 s, as it did in the sample log. As violet (r1, r3) the house lost 1 and drums
  lost 0, because green-side drums wandered mid for three minutes and never met anything; that is
  not drums winning, it is the 3-minute window. The house death is the same event in all three
  violet runs (r1, r3, r4 — the replies converge at temperature 0.2): the bottom violin chases an enemy minion into the
  green outer tower's range at ~55 s, and at 59 s replies `{"hp":48,…,"kind":"attack"}`.
- **Malformed replies.** 2 of 398 house calls (0.5 %), both in r4 green — the model stopped after
  the worksheet. The runner counts each as `hold` for one cadence window. Drums: 0.

## Compliance — where the 9B model still does not do what it wrote

Measured from the house's own worksheet values against the action it then chose (all four runs):

| check | occurrences | obeyed | note |
|---|---|---|---|
| worksheet `hp` < 75 → `recall` | 39 | **18 (46 %)** | misses cluster at hp 58 (drums), 48 (violin), 37 — the model wrote the number and still attacked, kicked, or "went home" via rule 2 (which does not heal) |
| worksheet `tower` set and `wave` = 0 → go home | 180 | 146 (81 %) | 34 tower attacks anyway; `tower` is often an *allied* tower copied from `nearbyTowers` despite the definition, which also produced **one attack window on the house's own tower** (r3, violet mid tier 1 — the sim does not check team on attacks) |
| ability only on a bearbot (kick/staccato) | 19 | 5 | 13 were on minions, 1 on a tower; harmless but wasted |
| ability fired (cooldown started next tick) | 36 | 17 | 19 were out of range: the bot stood still for that window |

This is the honest part. The prompt makes the model *play* — it attacks, presses towers with the
wave, retreats sometimes, and replies validly — but the low-HP rule that keeps a permanent-death
bot alive holds only about half the time once an enemy is in sight, and that is what every house
death in these runs was. It is still a materially stronger placement opponent than `drums.md`
(which never attacks and never recalls), and every entrant faces the same one, so the ladder stays
comparable; it is not a bot that plays well.

## Prompt budget

The brief asked for the house prompt to be ≤ ~40 % of what the runner sends per tick. Measured over
the 904 real calls of these runs: the observation is 592–2,008 chars (median 896, p90 1,639), the
runner's fixed line 140 chars, so a whole tick is 2,339–4,634 chars (median 3,358 ≈ 900 tokens).
`house-violet.md` is 2,452 chars (≈ 650 tokens) — **73 % of the median tick, 59 % at p90. The 40 %
target was not met and is not meetable with this model:** 40 % of a median tick is ~1,000 chars,
shorter than `drums.md` (1,573), and every shorter variant in the probes lost the worksheet or the
examples and with them the recall and tower-safety behaviour. Total context per call stays under
1.2 k tokens, far from any limit; cost is the only thing the share buys, and at ~0.5 s per call on
the host it is not the bottleneck.

## Not done / next

- **Recall compliance (46 %)** is the thing to fix first. Untested ideas, in order of cheapness: put
  the recall rule *after* the worksheet as a one-line "if hp < 75 the object ends `"kind":"recall"`"
  immediately before the closing instruction (recency helped in probes); lift the threshold for the
  violin; teach the tower key to name enemy towers only by making `visibleEnemies` the sole source
  once more (the v18 probe regressed on that sentence, so it needs a re-run, not a guess).
- **Cadence 2.** The ladder runs full matches at cadence 2; these are cadence-4 quick tests. Every
  window is half as long there, which should help recall and hurt nothing.
- ~~Arena wiring~~ — done in this change: `tools/arena/house.mjs` loads the pair as one hashed
  bundle and the queue hands each side its own half (`house.md`, then `drums.md`, stay as
  fallbacks).
- A second seed per side and a full 10-minute match would turn "deterministic at 0.2" into a
  statistic. Four runs was the budget tonight.

## Reproduce

```sh
python tools/model_server.py                                           # ollama, qwen3.5:9b, :8787
npm run match -- --a prompts/pilots/house-violet.md --b prompts/pilots/drums.md --seed 7 --cadence 4 --max-sim-sec 180 --name-a house --name-b drums --out runs/x.json
npm run match -- --verify runs/x.json
```

`--max-sim-sec` is new in this change (the spec's planned additive `maxSimSec`); `--verify` replays
an unfinished log as far as it ran. Replies are deterministic enough at temperature 0.2 that r1 and
r3 (different seeds, same violet prompt) give the violin identical replies from the first wave
(t = 32 s) to its death at 61.7 s — 8 of its 15 replies differ before that, all harmless
home/tower shuffling; a re-run on another day may still differ, because Ollama does not promise
bit-exact sampling.

Logs (replay-verified, `npm run match -- --verify`): `house-prompt-2026-09-21-r{1..4}-*.json`
beside this file. Unloaded the model afterwards (`keep_alive: 0`); nothing else was pulled or loaded.
