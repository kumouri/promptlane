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
- **A worksheet inside the reply.** The object starts with `hp`, `wave`, `tower`, `foe`, `cd`,
  `stand` before `kind`; `parseAction` only reads `kind`/`target`/`ability`, so the extra keys are
  legal and they are what makes the model's comparisons work. `stand` is `bandstand.status`, and
  null in a match without the river objective (see "The Bandstand" below).
- **Strategy:** ride your own minion wave, fight what it meets, press towers only with the wave,
  recall under 75 hp, abilities only with the cooldown at 0; with the objective on, go to the
  Bandstand while it is open and no enemy bearbot is in sight.
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
| medium | ride the wave (above) | recall under 75 → *the Bandstand* → leave a tower without a wave → ability → attack the foe → the tower → ride → home |
| hard | towers and kills | recall under 90 → *the Bandstand, three rules* → leave a tower without a wave → ability on a bearbot under 100 hp → attack that bearbot → the tower if 2+ friendly minions are in sight → the lowest-hp bearbot → the nearest minion → ride → home |

**The Bandstand** (the river objective, [`docs/economy-spec.md` §9.7](../../docs/economy-spec.md)).
Medium and hard go to `bandstand.pos` by rules placed right after the low-hp recall. Easy has no
Bandstand rule: easy stays easy.

| tier | worksheet keys added | Bandstand rules |
|---|---|---|
| easy | none | none |
| medium | `stand` | `stand` is "open", `foe` is null or a minion, hp above 50 % of `self.maxHp` |
| hard | `stand`, `standIn` (`opensInSec`), `standDist` (to `bandstand.pos`, whole number), `standBar` (`progress`, your side), `contested` | the medium rule with hard's bearbot-only `foe`; "open" and (`contested` or `standBar` below 0) with hp above 40 % of `self.maxHp`; "upcoming", `standIn` 10 or less and `standDist` under 400 |

Every added key is null when the observation has no `bandstand` block (a match played without the
objective), and every Bandstand rule starts by naming a `stand` status, so without the objective
none can match and the tier plays as before. The code twin of medium's rule is `tools/jev/rules.py`
(`q1b_bandstand_open`, rule number 8 so rules 1–7 keep their old numbers) and
`tools/match/jevPilot.ts`; both send and ask it only when the observation has the block. The
spec's `encore` key is not added: no tier's rule reads it.

> **Hard is not yet harder than medium.** On Jev, the Jam's backend, each tier's prose was compiled and played as an entrant's is (`runs/house-tiers-2026-09-30.md`). There, hard and medium are level: 3-3-16 over 22 matches, with 25 towers taken each. Both beat easy 10-0. Hard never hits its own towers on Jev. But it loses more bearbots at enemy towers than medium does (28 to 15 in 32 matches each), because it recalls too late. The timeout tiebreak doesn't count bearbots. On the qwen side files below it was weaker than medium: medium went 1-0-2 against it, and 32 of its 87 tower attacks hit its own towers. Ceryce's ruling 2026-09-30: ship it labelled, and let the prompt-evolution campaign's hard lineage (`docs/prompt-evolution-spec.md`) start from it.

**How easy and hard were written: through the Jev translator, as an entrant writes.** Each tier
is authored as an entrant-style prose rulebook, `house-<tier>.prose.md`. That prose is compiled
with `python tools/jev/compile.py … --backend ollama`, the same door-A path an entrant uses. The
compiled cascades and transparency reports are checked in
(`runs/house-tiers-compile-{easy,hard}-2026-09-30.md`, `runs/house-tiers-schemas-{easy,hard}-2026-09-30.json`;
the latter in `npm run match --a-schemas` shape, so a tier can also be played on Jev as an entrant is).
Medium's `house-violet.md` was compiled the same way for the Jev sanity run
(`runs/house-tiers-{compile,schemas}-medium-2026-09-30.*`); its side files are unchanged.

**`house-<tier>.schemas.json`** (easy, medium, hard) are byte copies of those three
`runs/house-tiers-schemas-*-2026-09-30.json` files. They are what the house plays on a Jev ladder
(`tools/arena/house.mjs`, [`docs/arena-site-spec.md` §9](../../docs/arena-site-spec.md)). They are
fixed, not recompiled, so the placement bar doesn't move with a sampled compile. To change what the
house plays on Jev, recompile on purpose, replace the file, and restart the arena; the `house`
ledger row records the new hash.
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

- **On Jev** (compiled prose, cadence 2, the Jam's shape): 42 full matches. Easy lost all 20 of
  its matches, each time a timeout with one outer tower down. It lost no bearbot.
- **Medium vs hard on Jev: 3-3-16** over 22 matches. Every decided match went to the violet side.
- Hard can't target its own towers on Jev (0 of 3,689 tower attacks). Its remaining weakness is
  leaving enemy towers too late: 22 of its 28 deaths came after its recall or retreat rule had
  already fired.
- **Earlier, on the qwen side files** (cadence 4, 9 matches): 8 timeout draws, and medium beat
  hard once. Hard aimed 32 of its 87 tower attacks at its own towers. The 9B model overrides its
  own `towerteam` check, and the sim doesn't check team on `attack`. Hard's rule 6 also picks
  fights with full-health drums.

Hard needs a real margin over medium before it is called "hard". The follow-ups are in the
evidence file.

## Economy-aware tiers: `house-eco-*` / `house-<tier>-eco.*`

Under an economy (`--economy eco-2`, the arena's `tournament.economy`) each tier plays an
economy-aware version instead, picked by `tools/arena/house.mjs` (`HOUSE_TIERS_ECO`). They are the
same three strategies plus the decisions [`docs/economy-spec.md`](../../docs/economy-spec.md) §4.4
gives each tier. With no economy nothing changes, so the placement bar above doesn't move.

| tier | files | shopping list (declared in the prose) | economy rules, after the low-hp recall |
|---|---|---|---|
| easy | `house-easy-eco.prose.md` (both sides) | Road Case → Metronome → Amp | none: it buys only when retreating or waiting takes it home |
| medium | `house-eco-violet.md` / `house-eco-green.md` | each instrument's default | can afford the next item and no foe in sight → recall to shop |
| hard | `house-hard-eco.prose.md` (both sides) | drums Road Case → Bass Strings → Amp; keytar and violin their defaults | the medium rule; carrying ≥ 300 gold with a stronger enemy bearbot in sight → recall to spend it; attack the enemy bearbot **worth the most gold** (`highest_bounty_enemy`) instead of the lowest-hp one |

- **Medium keeps its worksheet.** It adds three keys after `hp`: `"gold": self.gold`,
  `"next": self.nextItem.cost` (null when the list is done) and `"home": self.atShop`; the rest,
  `stand` included, are the plain medium's. The green file is the violet file with the team
  literals swapped (`test_house.mjs` checks it).
- **Easy and hard are prose,** one file for both sides, because they have no team literals. They
  have no qwen worksheet render: the Jam plays the compiled schemas on Jev.
- **`house-<tier>-eco.schemas.json`** are the checked-in compiles, made with `compile.py --backend
  ollama` exactly as for the plain tiers. Translation is sampled, so medium was compiled four times
  and the cleanest sample was kept. The kept sample has the shopping recall as rule 2 for every
  instrument, phrases every question in terms Jev's description gives (not worksheet names such as
  `next` or `foe`), and keeps the prose's root default `home`. Two of the other three samples asked
  about worksheet names or fell back to `push_lane`. Easy and hard took their first sample.
  Transparency reports: `runs/house-eco-compile-{easy,medium,hard}-2026-09-30.md`.
- **The Bandstand rules are the plain tiers' own.** The eco tiers were compiled before the Bandstand
  merged (PR #53). Its rules were then added the way #53 added them to the plain tiers: the same
  worksheet key and sentences in the prose, and the plain schemas' identical rule objects spliced in
  right after each instrument's low-hp recall, with every other rule unchanged. So medium-eco and
  hard-eco differ from medium and hard only by the economy (`test_house.mjs` checks it). The
  transparency reports above predate the splice. Without the objective the Bandstand rules can't
  match, so the order is low-hp recall → (Bandstand) → shopping recall → the rest.
- **The worksheet keys reach only the worksheet prompt and its compile.** The Jev worksheet house
  bot (`tools/jev/rules.py`, `house_server.py`, `jevPilot.ts`, shadow only) still mirrors the plain
  medium cascade; see `docs/economy-spec.md` §13.2.

## Sample entrants for the economy measurement: `sample-entrant*.prose.md`

Two entrant-shaped prose files for §6's "house medium vs a sample entrant" pairing, compiled the
same way (`sample-entrant*.schemas.json`, reports in `runs/sample-entrant*-compile-2026-09-30.md`).
`sample-entrant.prose.md` knows nothing about the economy (conditions A, R, B0).
`sample-entrant-eco.prose.md` is the same entrant plus the §4.5 sentences: a shopping list per
instrument, go home to shop, don't fight while carrying more than 300, hunt the enemy worth the
most, push while one of theirs is dead (condition B1).
