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

Evidence and known holes (recall obeyed ~46 % of the time under pressure): see
[`runs/house-prompt-2026-09-21.md`](../../runs/house-prompt-2026-09-21.md).
