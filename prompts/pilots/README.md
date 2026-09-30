# pilots

One prompt per champion pilot, written in that champion's voice. Created by the first build session.

These three are also the jam's reference pilots: `npm run match` can pit any two prompt files
against each other (see the README's "Run a jam match"), and the entrants' starter template in
`jamobair-entrants` is built from `drums.md`. The contract a prompt is handed — the `Observation`
JSON and the one-object reply — is defined by `src/types.ts` and `src/pilots/promptPilot.ts`.

## `house-violet.md` / `house-green.md` — the house bot

The arena's **placement opponent** (spec §3.5, ruling Q13): every merged entrant prompt plays it on
the fixed placement seeds so the ladder is comparable before anyone plays anyone. It is rated as a
fixed 1000 that never updates and **entrants never see it ranked** — it is the bar, not a player.
It is not a champion voice; it is written for the ruled test backend (`qwen3.5:9b`, no thinking,
120 output tokens) to play decisively, and its shape follows what that model can and cannot do:

- **One file per side.** The runner hands one prompt to a whole side, and the 9B model cannot
  compare fields against `self.team`, so team is a literal. The arena (`tools/arena/house.mjs`)
  loads `house-violet.md` when the house plays violet and `house-green.md` when it plays green;
  the two files differ only in those literals (`diff` them). Keep them in step when editing.
- **A worksheet inside the reply.** The object starts with `hp`, `wave`, `tower`, `foe`, `cd`
  before `kind`; `parseAction` only reads `kind`/`target`/`ability`, so the extra keys are legal
  and they are what makes the model's comparisons work.
- **Strategy:** ride your own minion wave, fight what it meets, press towers only with the wave,
  recall under 75 hp, abilities only with the cooldown at 0.
- **Per-instrument lines** (`keytar only: …`) are the form the Jev translator recognises: compiled
  with `tools/jev/compile.py`, each instrument's schema gets only its own line
  ([`translator-guards-and-defaults-spec.md` §10](../../docs/translator-guards-and-defaults-spec.md)).

Evidence and known holes (recall obeyed ~46 % of the time under pressure): see
[`runs/house-prompt-2026-09-21.md`](../../runs/house-prompt-2026-09-21.md). Evolving house bots
by strategy tier (easy / medium / hard) through the Jev translator:
[`docs/prompt-evolution-spec.md`](../../docs/prompt-evolution-spec.md).

## House tiers: `house-easy-*` / `house-*` / `house-hard-*`

Three house bots that differ by **strategy**, not stats: same model, same worksheet-and-literals
shape, same bearbots. The pair above is **medium** and stays the default and the placement bar;
easy and hard are only played when asked for (`config.house.tier` or `--house-tier` on the arena,
`--a house:easy` on `npm run match`; `tools/arena/house.mjs` `HOUSE_TIERS`).

| tier | archetype | rules, in order |
|---|---|---|
| easy | defend, never risk a bearbot | recall under 100 hp → leave whenever an enemy tower is near → attack the nearest enemy → stay with a friendly minion → wait at home. No abilities. |
| medium | ride the wave (above) | recall under 75 → leave a tower without a wave → ability → attack the foe → the tower → ride → home |
| hard | towers and kills | recall under 90 → leave a tower without a wave → ability on a bearbot under 100 hp → attack that bearbot → the tower if 2+ friendly minions are in sight → the lowest-hp bearbot → the nearest minion → ride → home |

**How easy and hard were written: through the Jev translator, as an entrant writes.** Each tier
is authored as an entrant-style prose rulebook, `house-<tier>.prose.md`. That prose is compiled
with `python tools/jev/compile.py … --backend ollama`, the same door-A path an entrant uses. The
compiled cascades and transparency reports are checked in
(`runs/house-tiers-compile-{easy,hard}-2026-09-30.md`, `runs/house-tiers-schemas-2026-09-30.json`).
`house-<tier>-{violet,green}.md` renders that compiled cascade rule for rule, in the house format
`qwen3.5:9b` needs: a worksheet, team literals, and the first matching rule wins. Targets follow
the translator's fixed selector vocabulary: `nearest_enemy` becomes easy's `foe` key or hard's
`creep` key, `lowest_hp_enemy` becomes hard's `foe` key, `nearest_tower` the `tower` key,
`nearby_minion` a friendly minion's position, and `home` your own corner. So the house can only
say what an entrant's prose can compile to. There is no "hold at my own tower" selector, for
example, so easy leashes itself by leaving whenever an enemy tower comes into view.

The rendering is by hand: the translator emits a Jev schema, not a qwen prompt. The mapping is in
the evidence file. One rendering choice differs from medium. Easy and hard read `tower` from
`nearbyTowers` by the enemy team literal, not from `visibleEnemies`, because the 9B model kept
naming its own tower there. Hard also writes the tower's team (`towerteam`) and acts only on the
enemy's, because in the probes it attacked its own towers otherwise. So neither tier targets the
nexus. Medium keeps its original definition, so the bar doesn't move.

**To change a tier:** edit its prose, recompile, and re-render both sides from the new cascade.
Then rerun the sanity matches. Don't edit the side files alone. The green file is the violet file
with every quoted team literal, the example enemy tower id, and the two base corners swapped
(`test_house.mjs` checks that).

Evidence (a small-N sanity check, not a rating):
[`runs/house-tiers-2026-09-30.md`](../../runs/house-tiers-2026-09-30.md).

- 9 full matches at cadence 4: 8 timeout draws, plus medium beating hard once.
- Easy lost no bearbot and no tower, and never attacked one.
- **Hard does not beat medium.** 32 of its 87 tower-attack decisions targeted its own towers: the
  9B model overrides its own `towerteam` check, and the sim doesn't check team on `attack`.
- Hard's rule 6 also picks fights with full-health drums.

Fix both before calling hard "hard"; the follow-ups are in the evidence file.
