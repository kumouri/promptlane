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
  under 75 hp walk home while an enemy is in sight and recall once none is (see "Recall: out of
  reach first" below), abilities only with the cooldown at 0; with the objective on, go to the
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
| easy | defend, never risk a bearbot | under 100 hp: walk home while an enemy is in sight, else recall → leave whenever an enemy tower is near → attack the nearest enemy → stay with a friendly minion → wait at home. No abilities. |
| medium | ride the wave (above) | under 75: walk home while an enemy is in sight, else recall → *the Bandstand* → leave a tower without a wave → ability → attack the foe → the tower → ride → home |
| hard | towers and kills | under 65 % of max hp (drums 143, keytar 91, violin 97.5): walk home while an enemy is in sight, else recall → *the Bandstand, three rules* → leave a tower without a wave → ability on a bearbot under 100 hp → attack that bearbot → the tower if 2+ friendly minions are in sight → the lowest-hp bearbot → the nearest minion → ride → home |

**Recall: out of reach first** (2026-10-01, for `recall-2`, [`docs/economy-spec.md`
§9.10](../../docs/economy-spec.md)). Under `recall-2` a recall is a 4 s channel that any hit in its
first 3.5 s breaks, so a tier that recalls in a lane dies standing in it
(`runs/bandstand-2-2026-09-30.md`). Every tier's single low-hp recall is now two rules on the same
threshold: **"an enemy minion, tower or bearbot is in sight → move home"**, then **"no enemy is in
sight → recall"**. Vision is 260, beyond a tower's 160 range and a minion's 130 aggro radius plus
its 30 attack range, so "no enemy in sight" means out of reach, and Jev reads it straight off its
description ("No enemies visible."). A channel a hit breaks is not re-issued into the same damage:
the next decision sees the enemy and walks. The eco tiers' shopping recall is split the same way,
and hard-eco's "carrying 300 with a stronger enemy bearbot in sight" walks home instead of recalling,
since an enemy is in sight by definition. Under the specimen's 3× recall (still the default), the
change only delays a recall until the bot is out of sight.
- **How the schemas changed.** Each source was recompiled with `compile.py --backend ollama` as
  before, and only the new recall rules were taken from the compile. They replace the old recall
  rule objects in the checked-in schema; every other rule object, the root default and the build
  are kept byte for byte, as the Bandstand rules were spliced in (#53). A fresh compile rewords
  the untouched rules too, so taking it whole would have changed more than the recall. Per
  instrument, the first sample of the final wording was kept whose new questions name only what
  Jev's description states (an enemy in sight, none in sight; no worksheet names such as `foe` or
  `self.hp`). The rule-by-rule diff and the samples tried are in
  [`runs/bandstand-3-2026-10-01.md`](../../runs/bandstand-3-2026-10-01.md).
- **Medium keeps its 75 %-of-max reading.** The translator reads medium's "hp less than 75" as
  "75 % of its max", as it did before (`runs/house-tiers-2026-09-30.md`), and the new pair keeps it.
  Medium-eco's kept samples read "below 75" on all three instruments; its old keytar recall said
  "75 % of its max".
- **Medium's worksheet lines say "in sight", not "foe or tower is not null".** With the worksheet
  keys in the line, the translator copied them into Jev's questions.
- **This moves the placement bar.** Medium is the arena's bar, so a ladder restarted on these files
  plays the new pair; the `house` ledger row records the new hash.
- `tools/arena/test_house.mjs` checks that every recall rule, in every tier's schema and side file,
  follows a move home.

**Hard leaves at 65 % of its max hp** (2026-10-01, Bandstand 4). Walking out under `recall-2`, a
flat 90 hp left hard drums (max 220) dying in the lane before 1:30. 65 % of max is drums 143,
keytar 91 and violin 97.5, so no instrument's trigger went down. The derivation from Bandstand 3's
walks is in [`runs/bandstand-4-2026-10-01.md`](../../runs/bandstand-4-2026-10-01.md).
- **Only the trigger changed**, in `house-hard.prose.md`, `house-hard-eco.prose.md` and both hard
  side files. Rules 1–2 say "less than 65% of self.maxHp", like rules 3–4. The side files' one
  example that goes to the Bandstand with a foe in sight now has 150 hp, so it holds on drums too.
- **The schemas were spliced the same way as above.** `compile.py --backend ollama` was run three
  times per source, and only the low-hp pair was taken (each instrument's first sample, s1).
  Every other rule object is byte for byte.
- `test_house.mjs` pins the 65 % in the plain prose, its cascade and both side files. The
  economy-aware hard has left at 50 % since 2026-10-02 (next section).

**The economy-aware hard takes the tower race** (2026-10-02,
[`runs/house-hard-2026-10-02.md`](../../runs/house-hard-2026-10-02.md)). On the Jam stack with the
Final Chorus, hard won no decided match on Jev (0 of 24). It walked out at 65 % of max hp, stood at
home when no rule applied, and dealt a third of medium's structure damage. Only
`house-hard-eco.prose.md` and its schemas changed, in four places:
- **The low-hp pair fires at 50 % of max hp** (drums 110, keytar 70, violin 75), not 65 %.
- **A tower needs one allied minion near**, not two.
- **A new rule, right after the spend-gold rule:** "If it is more than 480 seconds into the match
  and you can see an enemy tower, attack the nearest enemy tower." Jev's description states the
  clock ("N sim-seconds into the match").
- **The fallback pushes the lane** (`push_lane`) instead of going home.
- **How the schemas changed.** The edited prose was compiled three times with `compile.py --backend
  ollama`, with the Bandstand paragraph left out. Those rules are the plain tier's, spliced byte for
  byte, and with them the cascade overruns the translator's 1,800-token reply. From the first
  sample, the low-hp pair, the 480-second rule, the one-minion tower rule and the root default were
  taken. Every other rule object is byte for byte. All three samples compiled the same rules.
- **On Jev, pre-registered (Final Chorus on): hard won all 14 decided medium–hard matches of 18**,
  and 5 of 5 decided against easy. The sample entrant still beat it, 6 of 6, as it beats medium.
  Hard's bearbots now deal 934 structure damage a match against medium's 266, and hard dies 5.2
  times a match (medium 3.7).
- **The plain hard is unchanged** (65 %, two minions, home). The Jam plays with an economy, so it
  plays the eco file.
- `test_house.mjs` pins all four changes in the prose and the cascade.

**The Bandstand** (the river objective, [`docs/economy-spec.md` §9.7](../../docs/economy-spec.md)).
Medium and hard go to `bandstand.pos` by rules placed right after the low-hp pair. Easy has no
Bandstand rule: easy stays easy. The economy-aware hard plays the same three rules last, after its
wave rule ("Siege with the wave" below).

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

> **Hard is not yet harder than medium.** On Jev, the Jam's backend, each tier's prose was compiled and played as an entrant's is (`runs/house-tiers-2026-09-30.md`). There, hard and medium are level: 3-3-16 over 22 matches, with 25 towers taken each. Both beat easy 10-0. Hard never hits its own towers on Jev. But it loses more bearbots at enemy towers than medium does (28 to 15 in 32 matches each), because it recalls too late. The timeout tiebreak doesn't count bearbots. On the qwen side files below it was weaker than medium: medium went 1-0-2 against it, and 32 of its 87 tower attacks hit its own towers. Ceryce's ruling 2026-09-30: ship it labelled, and let the prompt-evolution campaign's hard lineage (`docs/prompt-evolution-spec.md`) start from it. On the Jam stack (eco-3, the Final Chorus) the economy-aware hard then won no decided match against medium; it was changed on 2026-10-02 ("The economy-aware hard takes the tower race" above).

**How easy and hard were written: through the Jev translator, as an entrant writes.** Each tier
is authored as an entrant-style prose rulebook, `house-<tier>.prose.md`. That prose is compiled
with `python tools/jev/compile.py … --backend ollama`, the same door-A path an entrant uses. The
compiled cascades and transparency reports are checked in
(`runs/house-tiers-compile-{easy,hard}-2026-09-30.md`, `runs/house-tiers-schemas-{easy,hard}-2026-09-30.json`;
the latter in `npm run match --a-schemas` shape, so a tier can also be played on Jev as an entrant is).
Medium's `house-violet.md` was compiled the same way for the Jev sanity run
(`runs/house-tiers-{compile,schemas}-medium-2026-09-30.*`); its side files are unchanged.

**`house-<tier>.schemas.json`** (easy, medium, hard) started as byte copies of those three
`runs/house-tiers-schemas-*-2026-09-30.json` files, and have since had the Bandstand rules (#53)
and the out-of-reach recall pair (above) spliced in. They are what the house plays on a Jev ladder
(`tools/arena/house.mjs`, [`docs/arena-site-spec.md` §9](../../docs/arena-site-spec.md)). They are
fixed, not recompiled, so the placement bar doesn't move with a sampled compile. To change what the
house plays on Jev, recompile on purpose, replace the file, and restart the arena; the `house`
ledger row records the new hash.
`house-<tier>-{violet,green}.md` renders that compiled cascade rule for rule, in the house format
`qwen3.5:9b` needs: a worksheet, team literals, and the first matching rule wins. Targets follow
the translator's fixed selector vocabulary: `nearest_enemy` becomes easy's `foe` key or hard's
`creep` key, `lowest_hp_enemy` becomes hard's `foe` key, `nearest_tower` the `tower` key,
`nearby_minion` a friendly minion's position (from your own fountain, the start of your own lane:
`target_resolve.py` `own-lane-1`), and `home` your own corner. So the house can only
say what an entrant's prose can compile to. Every plain house schema here was compiled under `vocab-1`
(no `vocab` key; [`docs/vocabulary-spec.md`](../../docs/vocabulary-spec.md)), which has no "hold at my
own tower" selector, so the plain easy leashes itself by leaving whenever an enemy tower comes into
view. These side files stay vocab-1 renderings (a vocab-2 selector has no worksheet key: spec §4.4
C2). The economy-aware easy and hard, which the Jam plays, are `vocab-2` (next section).

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

| tier | files | shopping list (declared in the prose) | economy rules, after the low-hp pair |
|---|---|---|---|
| easy | `house-easy-eco.prose.md` (both sides) | Road Case → Metronome → Amp → Tour Bus → Bass Strings → Headliner → Fuzz Pedal → Feedback | can afford the next item and no enemy in sight: recall to shop (never walks home to shop) |
| medium | `house-eco-violet.md` / `house-eco-green.md` | each instrument's default ladder | can afford the next item, no enemy bearbot or minion in sight: with an enemy tower in sight walk home, with no enemy in sight recall to shop |
| hard | `house-hard-eco.prose.md` (both sides) | drums Road Case → Bass Strings → Amp → Backline → Metronome → Wall of Sound → Click Track → Arpeggiator; keytar and violin their default ladders | can afford the next item and no enemy bearbot in sight: with an enemy minion or tower in sight walk home, with none recall to shop; carrying ≥ 300 gold while its side is weaker in the fight near it → walk home to spend it; attack the enemy bearbot **worth the most gold** (`highest_bounty_enemy`) instead of the lowest-hp one |

**The shopping lists are full late-game ladders** (2026-10-02,
[`runs/vocab-house-tiers-2026-10-02.md`](../../runs/vocab-house-tiers-2026-10-02.md)): three tier-1 items, a
recipe, the fourth item, the first upgrade, the second recipe and its upgrade
([`docs/late-game-economy-spec.md`](../../docs/late-game-economy-spec.md) §2.5). Under `eco-3-late` a list is
bought as written, so a three-item list would never reach a recipe. Under a ruleset without recipes
the engine drops the recipe names and keeps the first three, which are each tier's old list. Medium's
change is its `build` lists only (and their `economy` key); its rules and vocabulary are unchanged,
but the file hash, and so the placement bar under `eco-3-late`, moved. No house ladder holds both
Feedback and Wall of Sound (the uncapped 110 % lifesteal stack). `test_house.mjs` checks all of it.

**Easy and hard are `vocab-2`** (same date and write-up; vocabulary spec §7 D3). The changed rules were
compiled with `compile.py --vocab vocab-2 --economy eco-3-late --backend ollama`, three samples, and
spliced in. Every other rule object is byte for byte.
- **Easy holds at its own tower** instead of leaving at the first sight of an enemy tower: inside an
  enemy tower's range → `own_tower`; the nearest enemy bearbot, then the nearest enemy minion;
  otherwise hold at its outer tower (`own_front_tower`, the root default, set by hand because every
  sample compiled the stated fallback as a catch-all rule over `push_lane`).
- **Hard fights under its own tower:** the 300-gold rule asks the tower-counting fight verdict; an
  enemy bearbot under its tower → attack it (`tower_diver`); an enemy tower that will shoot it →
  `own_tower` (it used to walk home whenever an enemy tower was in sight without an allied minion);
  its side weaker in the fight near it → `own_tower`, before hunting the carrier. PR #71's tower-race
  changes ("The economy-aware hard takes the tower race", above) all stay.
- **On Jev, pre-registered (`eco-3-late`, Final Chorus on), 40 matches:**
  - **Hard punishes the dive:** 68 % of the sample entrant's deaths credit a defender (46 % before),
    and the entrant won 2 of 4 decided (6 of 6 before).
  - **Against medium, hard is unproven:** only 4 of 18 matches were decided (hard won 3), so the
    primary line is INCONCLUSIVE.
  - **Easy holds at its tower** 99.7 % of the time and lost no bearbot. It also never shops.

**Siege with the wave; easy shops** (2026-10-02,
[`runs/better-bots-2026-10-02.md`](../../runs/better-bots-2026-10-02.md)). Each prose edit was compiled
as above, and only the changed rules were spliced in. Every other rule object is byte for byte.
- **Hard sieges with its wave.** "Take the objective" (a tower with one allied minion near) became
  "Siege with your wave": inside an enemy tower's range while that tower has your own minions in range
  to shoot first → `nearest_tower`.
- **Hard's three Bandstand rules move to after its wave rule.** It goes to the river only when its lane
  gives it nothing to do. First in the order, they had held hard away from the lane 20 % of the time.
- **Easy recalls to shop** when it can afford its next item and no enemy is in sight. It still never
  walks home to shop, never pushes, and holds at its tower.
- **On Jev, pre-registered, 20 matches:**
  - **Hard against medium:** 6 of 6 decided, all won by hard. Before, 4 of 18 were decided.
  - **Easy:** spends a mean of 383 gold a bot and ends with a median of 181 unspent. Before, it spent
    about 50 and ended with 550.
  - **Easy against medium:** both matches were still draws.

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
  right after each instrument's low-hp recall, with every other rule unchanged. So medium-eco
  differs from medium only by the economy, and hard-eco from hard by the economy and the 2026-10-02
  tower-race changes above (`test_house.mjs` checks the Bandstand rules are the same). The
  transparency reports above predate the splice. Without the objective the Bandstand rules can't
  match, so the order is the low-hp pair → (Bandstand) → the shopping pair → the rest. The recall
  pairs were spliced the same way ("Recall: out of reach first" above).
- **The worksheet keys reach only the worksheet prompt and its compile.** The Jev worksheet house
  bot (`tools/jev/rules.py`, `house_server.py`, `jevPilot.ts`, shadow only) still mirrors the plain
  medium cascade from before the recall split; see `docs/economy-spec.md` §13.2.

## Sample entrants for the economy measurement: `sample-entrant*.prose.md`

Two entrant-shaped prose files for §6's "house medium vs a sample entrant" pairing, compiled the
same way (`sample-entrant*.schemas.json`, reports in `runs/sample-entrant*-compile-2026-09-30.md`).
`sample-entrant.prose.md` knows nothing about the economy (conditions A, R, B0).
`sample-entrant-eco.prose.md` is the same entrant plus the §4.5 sentences: a shopping list per
instrument, go home to shop, don't fight while carrying more than 300, hunt the enemy worth the
most, push while one of theirs is dead (condition B1).

On 2026-10-02 `sample-entrant-eco.prose.md` changed in two ways. Its "back off from the tower"
sentence now comes before its recall. Its recall now fires only when the bot is not inside an enemy
tower's range. The reason is that under `recall-2` the bot died channelling recall under enemy towers
(`runs/sample-entrant-recall-order-2026-10-02.md`). `sample-entrant-eco.schemas.json` is vocab-1 and
was compiled from the earlier prose. It is unchanged, so §6's measurement still plays what it played.

## The siege sample entrant: `sample-entrant-siege.*`

A vocab-2 entrant that plays to win, and a baseline an entrant can learn from
([`runs/better-bots-2026-10-02.md`](../../runs/better-bots-2026-10-02.md)). Its rules, in order:
- the low-hp pair at half its max hp;
- a shopping recall with no enemy in sight;
- after 480 s, attack any enemy tower it can see (sudden death: towers are at a third of their hp and
  the first to fall wins);
- step back to its own tower whenever an enemy tower will shoot it;
- siege while that tower has its own minions to shoot first;
- fight bearbots, then minions;
- walk with the wave;
- otherwise push.

`sample-entrant-siege.schemas.json` is a whole compile (`compile.py --vocab vocab-2 --economy
eco-3-late --backend ollama`). Each instrument comes from the first of six samples that passed a
pre-registered ten-point screen: drums e4, keytar e2, violin e1.

On Jev it decided all 12 of its matches:
- against medium (the placement bar), 5–1;
- against easy, 6–0;
- it died 0.5 times a match against easy (the PR #82 vocab-2 entrant died 19.8 times);
- it dealt about 900 structure damage a match (that entrant dealt 195).

It isn't the economy measurement's entrant, which stays `sample-entrant-eco.*`.
