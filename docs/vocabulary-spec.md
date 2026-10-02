# Vocabulary spec: what a compiled rule can see, ask and target

**Ruling (Ceryce, Telegram, Fri 2026-10-02 02:20 CT), verbatim:** "The shared vocabulary should be
as rich as possible."

**The ask:** a bot judging "can I win this fight?" should count its **own** towers, so fighting under
your own tower reads as strong. More generally, the prose → schema vocabulary should be as
expressive as the game state allows, for entrants and the house alike. That vocabulary is the
conditions, the targets, the actions, and the facts a rule can read. The house pilots can only say
what an entrant's prose can compile to. `prompts/pilots/README.md:162-163`: "There is no 'hold at my
own tower' selector, so easy leashes itself by leaving whenever an enemy tower comes into view".

- **Spend:** $0. No model call of any kind was made: no Jev, no Workers AI, no TypeSafe, no Ollama,
  no schema server. Nothing touched the live arena or evolution campaign 2.
- **This is a design document.** §1–§7 were written before any code, and §7 lists the decisions for
  Ceryce. §8 records stage A as built, and where the build departs from the design.
- **Related, in flight:** the sample entrant beats both house tiers by diving towers and dying
  about 21 times a match. A separate $0 log analysis (job 4e15) is costing that trade. §4.2's
  `tower_diver` and §4.1's tower facts are the vocabulary a house tier needs to punish a dive. Use
  4e15's answer to choose which tier gets them first (§7, D3).

## Verdict

- **The binding limit is the description, not the selectors.** A condition has no grammar. It is a
  free-text yes/no question that Jev answers from an English paragraph,
  `describe_observation` (`tools/jev/fidelity_harness.py:171-245`). A rule can test only what that
  paragraph says.
  - The paragraph **never mentions `nearbyTowers`**. So no rule can tell its own towers from
    the enemy's, or know it stands under one.
  - It gives **no distances or ranges**. Its docstring says so: "No precomputed distance/range: only
    raw positions" (`:174-175`). Yet the translator's own example question is "is an enemy bearbot
    within melee range?" (`tools/jev/translator.py:219-220`). The sample entrant's drums rule
    compiled to exactly that (`prompts/pilots/sample-entrant.schemas.json:26`), and Jev has to
    estimate it from coordinates.
- **The target list is 12 fixed selectors** (`translator.py:70-84`). Every one of them is either an
  enemy, or a place on the enemy's side or at home. There is no allied-tower target, no ally
  target, no "nearest enemy bearbot" (`nearest_enemy` includes minions and towers), and no
  "nearest enemy minion".
- **The actions are fine.** `move / attack / ability / recall / hold` (`translator.py:68`) cover
  what the sim accepts (`src/types.ts:34`). Holding a position is a target problem, not an action
  problem.
- **The fix is additive and versioned like the targeting rule.** It adds facts to the description,
  a few selectors to the resolver, and a list of the facts to the translator prompt. Each compiled
  schema names the vocabulary it was compiled under, and it is described and resolved under that
  vocabulary. A schema without the key is `vocab-1`, today's. So every checked-in schema plays as
  it does now, and every match log replays byte-identical (§5).
- **What fits before sign-ups close:** stage A, which is Python only and reads the
  observation as it is. That covers own and enemy tower facts, distances and in-range flags, a
  count-and-hp fight line that counts your towers, and six new selectors, `own_tower` among them.
  It has to merge by the time **entrant-facing changes land**, the deadline the economy spec
  already set (`docs/economy-spec.md` §0 row 10, §7).
- **What fits before the numbers freeze:** stage B, a TypeScript observation layer
  outside `src/sim`. It adds damage-weighted fight strength, map-wide tower status, whether a tower
  is shooting you, the scoreboard and the wave timer.
- **What must wait for after the Jam:** structured numeric conditions (stage C). Nothing in this
  spec should change after the numbers freeze (§6).

## 1. How a rule reads the game today

A compiled rule goes through three layers. Each one is a different place vocabulary can be lost.

| layer | what it does | where |
|---|---|---|
| **Observation** | The sim's `observe()` builds the JSON a pilot gets every 0.5 s. The economy and objective layers add fields by wrapping `decide`. | `src/sim/match.ts:158-219`; `src/economy.ts:568-602, 656-660`; `src/objective.ts:445-460, 506-510` |
| **Description → answers** | The schema server turns the observation into one English paragraph. It asks Jev every node's `condition` in one call, and an answer above 0.5 is yes. | `tools/jev/fidelity_harness.py:171-245, 315-344`; `tools/jev/schema_server.py:118` |
| **Selector → target** | The winning rule's `target_selector` resolves, with no model call, to an entity id or a position. | `tools/jev/target_resolve.py:144-228` |

- **What a rule object is:** `id, condition, criteria_true, criteria_false, action_kind,
  action_ability, action_target_selector` (`tools/jev/compile.py:89-97`). For example,
  `{"condition": "is this bot's hp below a third of its max?", "action_kind": "recall",
  "action_target_selector": "home"}` (`prompts/pilots/sample-entrant.schemas.json:7`).
- **Guards** are the same free-text question with `then`/`else` branches (`translator.py:109-125`).
  There is no structured guard, field list or comparator anywhere. A number only exists inside the
  question's text. No checked-in schema has a guard.
- **The qwen house side files** (`prompts/pilots/house-*-{violet,green}.md`) read the raw JSON
  directly. The 9B model fills in a worksheet, and the rules quote literal keys. They are rendered
  from the compiled cascade by hand, and no code maps a selector to a worksheet key
  (`prompts/pilots/README.md:156-170`). Only the easy and hard worksheets read `nearbyTowers` with a
  team (`:166-169`), so they are the only house rules that know a tower's team.

## 2. Inventory

### 2.1 What a pilot can see

The ✗ entries in the right-hand columns are the gaps.

| field | present when | built at | in Jev's description? | read by a selector? |
|---|---|---|---|---|
| `clockSec` | always | match.ts:202 | ✓ "N sim-seconds into the match" | – |
| `self.team`, `self.instrument` | always | match.ts:204-207 | ✓ | team: ✓ (home/push_lane) |
| `self.id`, `self.lane` | always | match.ts:204-206 | ✗ | lane: `nearby_minion` at the fountain only (target_resolve.py:224) |
| `self.pos` | always | match.ts:208 | ✓ coordinates | ✓ (distances) |
| `self.hp`, `self.maxHp` | always | match.ts:209-210 | ✓ with % | – |
| `self.moveSpeed` | always | match.ts:211 | ✗ | – |
| `self.cooldowns` | always | match.ts:160-161 | ✓ ready / not ready | – |
| `allies[]` {id,pos,hp,maxHp}: **every** living allied bearbot, map-wide | always | match.ts:163-165 | ✓, but labelled "Allies visible" though it isn't limited to vision (fidelity_harness.py:205) | `threatened_ally_enemy` only |
| `visibleEnemies[]` {id,pos,hp,maxHp,kind}: within 260 | always | match.ts:167-191 | ✓ | ✓ every enemy selector |
| `nearbyMinions[]` {id,team,pos,hp,maxHp}: both teams within 260 | always | match.ts:193-195 | ✓ id, team, pos; **hp omitted** (:229-239) | `nearby_minion` (allied) |
| `nearbyTowers[]` {id,team,lane,pos,hp,maxHp,alive}: **both teams** within 390, dead ones too | always | match.ts:197-199 | **✗ entirely** | **✗** |
| `self.gold`, `goldAtRisk`, `deathLoss`, `deathPayout`, `bounty`, `level`, `xp`, `xpToNext`, `items`, `slotsFree`, `nextItem`, `atShop` | economy on | economy.ts:578-589 | ✓, except `xp` raw and `goldAtRisk` (:118-152) | – |
| `allies[].level/gold/items` | economy on | economy.ts:591-594 | ✓ | – |
| `visibleEnemies[bearbot].level/bounty/items` | economy on | economy.ts:595-598 | ✓ | `highest_bounty_enemy` |
| `respawning[]` {id,team,inSec}: both teams | economy on | economy.ts:599 | ✓ | – |
| `shop[]` | economy on | economy.ts:600 | ✓ | – |
| `bandstand` {site,pos,radius,status,opensInSec,progress,contested,alliesOn,selfOn} | objective on | objective.ts:428-442 | ✓, `radius` omitted (:258-303) | `bandstand` |
| `self.encoreSec`, `allies[].encoreSec`, `visibleEnemies[bearbot].encore` | objective on | objective.ts:455-457 | ✓ (:305-312) | – |

### 2.2 What a rule can express

| part | the full vocabulary | where |
|---|---|---|
| **condition** | Any yes/no question. In practice: "a threshold comparison or a presence check… Never a question that needs a text answer". That is guidance to the translator model, and nothing enforces it. Jev answers it from §2.1's ✓ column. | translator.py:218-220 |
| **comparators** | None as such. "below", "more than" and "at least two" are words inside the question. `number_normalize.py` only rewrites numbers to trace which sentence a rule came from. | translator.py:456-464 |
| **guard** | The same free-text question, with branches. Meant for a "strategic verdict", for example "you only take fights you can win" (`translator.py:229-250`, example `:251-257`). It compiles to one question Jev must judge with no strength facts to judge from. | translator.py:109-125 |
| **action kinds** | `move, attack, ability, recall, hold` | translator.py:68; jevSchemaPilot.ts:68 |
| **abilities** | the instrument's two (kick/fill, chord/glissando, staccato/solo). A rule naming another instrument's ability is removed. | scenarios.py:47-51; translator.py:718-728 |
| **selectors** | `none, home, push_lane, bandstand` (positions); `nearest_enemy, lowest_hp_enemy, densest_cluster_enemy, isolated_enemy, nearest_tower, threatened_ally_enemy, highest_bounty_enemy` (enemy ids); `nearby_minion` (an allied minion's position) | translator.py:70-84; target_resolve.py:151-228 |
| **shopping** | not an action. Shopping is a top-level `build` list bought automatically at base (economy.ts:521-533), so a rule can only *go* home to shop. | economy_rules.py:95-130 |
| **defaults** | the top-level `default_action` (required); branch defaults (optional) | translator.py:318-320, 353-396 |

**How the selectors read the observation.** `nearest_tower` reads `visibleEnemies`, so it is an enemy
tower or nexus by construction (`target_resolve.py:199-201`). No selector reads `nearbyTowers`.
(That is vocab-1, as it still is; under `vocab-2`, `nearest_tower` also reaches the towers A1 lists,
§8.2.)
`lowest_hp_enemy` and `isolated_enemy` prefer bearbots, but fall back to any enemy, towers included
(`:179-182, 191-198`).

### 2.3 Gaps: state a pilot can see, but a rule cannot use

| # | state the observation has | why a rule can't use it | what a bot can't do as a result |
|---|---|---|---|
| G1 | **Own towers**: `nearbyTowers` with `team` = own | not described, no selector | "fight under my tower", "fall back to my tower", "hold my lane at our tower" |
| G2 | **Enemy tower is a tower within range**: `nearbyTowers` with enemy team, plus position | not described; tower range isn't in the observation (it is the map variant's: `src/mapVariant.ts:26-40`) | "don't stand in their tower's range without a wave". The sample entrant's tower rule asks "is an enemy tower visible", which is 260, not 160 (`sample-entrant.schemas.json:17`) |
| G3 | **Distances**: every entity's `pos` and `self.pos` | Jev has to do geometry from coordinates. The translator's own example asks about melee range (translator.py:217-218) | "if an enemy is right next to me", "if I'm in range" |
| G4 | **Allied strength near me**: `allies[]` positions and hp, allied minions | the allies are listed map-wide under a "visible" label; there is no count near me and no comparison | "can I win this fight", "we outnumber them" |
| G5 | **Allied minion hp, enemy minion hp** | the description omits minion hp | "last-hit the low minion" (gold under the economy) |
| G6 | **Nearest enemy bearbot** as a target | `nearest_enemy` is any kind; `lowest_hp_enemy` picks by hp | "attack the closest bearbot" |
| G7 | **Nearest enemy minion** as a target | as G6 | "farm minions", "clear the wave" |
| G8 | **An ally's position** as a target | no ally selector (`threatened_ally_enemy` returns the *enemy*) | "stick with my teammate", "group up" |
| G9 | **An enemy bearbot under my tower** | needs G1 + G2 | "punish divers" (the sample entrant's whole game, per job 4e15) |
| G10 | **`self.lane`** | not described | "stay in my lane", "go back to my lane" (only `own-lane-1`'s fountain rule uses it) |
| G11 | **`bandstand.radius`** | not described | "am I on the stage": `selfOn` is described, so this one is minor |

**Game state the sim has but never shows a pilot** (the ruling's "as rich as the game state
allows"; stage B in §4.3):

| # | state | where it lives |
|---|---|---|
| H1 | tower range, damage and targeting rule (minions first, bearbots only when no minion is in range) | entities.ts:202-206; mapVariant.ts:79; match.ts:463-467 |
| H2 | towers outside 390, own nexus hp, and the enemy nexus outside 260 | match.ts:197-199 |
| H3 | each unit's attack damage, range and cooldown, with level, item and Encore scaling | entities.ts:27-67; economy.ts:543; objective.ts:96 |
| H4 | enemy and ally **instrument** | not in `allies` / `visibleEnemies` (types.ts:28-29) |
| H5 | kills, deaths and towers taken (the scoreboard) | economy.ts:171-173, 469-473 (summary only) |
| H6 | the next minion wave (every 30 s from 30 s) | match.ts:20, 399-415 |
| H7 | whether my recall channel is running (`recall-2`) | src/recall.ts:146-190, no observe wrapper |
| H8 | who is attacking me | src/attribution.ts, not exposed |

**Doc bug found on the way.** The entrants README (`jamobair-entrants` `README.md:103-105`) says
"the observation fields and the five actions are exactly what your compiled rules test and choose
between". That is not true today. A compiled rule cannot test `nearbyTowers`, `self.lane`, minion
hp or any distance. Fix it in the same entrant-facing PR as stage A (§6.3).

## 3. Design constraints

1. **`src/sim/*` and `src/types.ts` are frozen** (`runs/historical-v1.md` records their hashes).
   New observation facts come from a wrapper layer outside `src/sim`, as the economy and objective
   do (`economy.ts:656-660`, `objective.ts:506-510`), or are computed in Python from fields the
   observation already has.
2. **One name pins the whole vocabulary.** `vocab-1` is today's. `vocab-2` adds stage A, and
   `vocab-3` adds stage B. A vocabulary pins four things together: the translator's selector list
   and facts list, the description, the resolver's selectors, and the observation layer it needs.
3. **A schema plays under the vocabulary it was compiled under.** It never plays under the
   server's default. That one rule keeps old schemas byte-identical in behaviour (§5).
4. **Precompute facts, not verdicts, except where the ruling asks for a verdict.** The description
   states counts, hp, distances and ranges. The one verdict it states, the fight balance (§4.1 A3),
   is defined in this spec, and its sentence gives the numbers behind it, so a rule can also ask
   about the parts.
5. **Additive only.** A selector or fact that doesn't apply is described as absent. "No tower of
   yours is in range" is described the way "There is no Bandstand in this match." already is. It
   is never omitted silently, so a question about it gets a definite no.

## 4. Proposed additions, ranked

Ranked by strategy unlocked per unit of work and risk. "Work" is agent hours, tests included.
None needs a paid call to build, and §7 D6 covers the one Jev check after merge.

| rank | addition | stage | unlocks | work | risk |
|---|---|---|---|---|---|
| 1 | **Tower facts**: own and enemy towers near me, in-range flags, and "an enemy tower would shoot me" (A1) | A | under my tower; out of their range; dive only with a wave | 2 h | low |
| 2 | **`own_tower` / `own_front_tower` selectors** (A4) | A | fall back to my tower; hold or defend my lane | 1.5 h | low |
| 3 | **Fight balance near me, counting towers** (A3) | A (counts + hp), then B (damage-weighted) | "can I win this fight"; fight under my own tower | 2 h A, 4 h B | medium: the threshold needs calibrating |
| 4 | **Distances and in-my-range flags** (A2) | A | melee range, "right next to me", kiting at keytar range | 1 h | low |
| 5 | **`nearest_enemy_bearbot`, `nearest_enemy_minion`, `tower_diver`, `nearest_ally`** (A4) | A | focus bearbots; farm; punish divers; group up | 1.5 h | low |
| 6 | **Facts list in the translator prompt** (A5) | A | the translator writes questions Jev can answer, instead of guessing at "melee range" | 1 h | medium: changes every compile (§6.2) |
| 7 | **Map-wide towers, scoreboard, wave timer, recall state, instruments** (B1-B4) | B | "if we're ahead, push"; "wait for the wave"; don't re-recall | 4 h | medium: new TypeScript layer |
| 8 | **Structured numeric conditions** (C1) | C | exact thresholds without Jev's ~85 % reading | 1-2 days | high |

### 4.1 Stage A facts (Python only, from the observation as it is)

The description adds these sentences under `vocab-2`. Each needs one new request field, the map's
`towerRange`, because tower range isn't in the observation. The request names the map the way it
already names `targeting` (§5.2).

**A1: towers.** Read from `nearbyTowers`: alive towers, split by `team` against `self.team`.

- Prose an entrant writes: "If I'm under my own tower, I fight." / "If I'm inside an enemy tower's
  range and none of my minions are near it, I back off."
- Sentences:
  - "Your towers near you: tower-3 (top, 820/900 hp) at 95 units — you are inside its range." or
    "No tower of yours is near you."
  - "Enemy towers near you: tower-9 (mid, 900/900 hp) at 150 units — you are inside its range; it
    has no minion of yours to shoot first, so it will shoot you."
  - "Dead towers near you: tower-8 (yours)."
- "Will shoot you" follows the sim's targeting: minions first, a bearbot only when no minion is in
  range (`match.ts:463-467`). Stage A judges it from the allied minions in `nearbyMinions` within
  `towerRange` of the tower. That list stops at 260 from me, so a minion beyond my sight but inside
  the tower's range is missed. Stage B (B3) makes it exact.

**A2: distances and range.**

- Every listed entity gets its distance, e.g. "bb-4 (bearbot) at (410,560), 85 units away, with
  90/140 hp".
- Entities inside my own attack range are flagged. Range is a static per-instrument table, mirrored
  from `entities.ts:27-67` (drums 40, keytar 160, violin 45), in `scenarios.py` beside `ABILITIES`.
- Prose: "If an enemy bearbot is in my attack range…", "If an enemy is right next to me…".

**A3: fight balance near me.** This is the ruling's core.

- Scope: everything within the vision radius, 260, of me.
  - **My side:** me, allied bearbots within 260 (filtered from the map-wide `allies`), allied
    minions in `nearbyMinions`, and each own alive tower whose range covers me.
  - **Their side:** enemy bearbots, enemy minions, and each enemy tower whose range covers me.
- Sentence, for example: "Fight near you: your side 2 bearbots (310 hp), 3 minions, 1 tower in
  range; their side 1 bearbot (140 hp), 1 minion. Your side is stronger here."
- **Verdict (stage A, counts and hp only).** A tower counts as a *threat*, not as hp: no enemy will
  attack a tower in a skirmish, so its 900 hp doesn't fight, but its 18 dps does. The verdict:
  - **stronger** when my side's bearbot hp is at least 1.25 × theirs, or my side has a tower in
    range and theirs doesn't, unless I'm outnumbered in bearbots by two or more;
  - **weaker**, symmetrically;
  - **even** otherwise;
  - **"No fight near you"** when no enemy bearbot is within 260.

  *(As built, §8: the calibration below kept 1.25, made the tower clause decide first, and dropped
  the outnumbered veto.)* The 1.25 and the tower clause are a starting point. Calibrate them before the vocabulary ships,
  at $0, on the match logs already recorded (§7 D4): for every logged decision where both sides
  have a bearbot within 260, compute the verdict, and check who loses more hp over the next 5 s.
  The logs hold every position and hp, so this replays with no model call.
- Prose: "If my side is stronger here, I attack the lowest-hp enemy bearbot; if it's weaker, I fall
  back to my tower." The guard form also works: "I only take fights I can win" now has a stated
  fact to judge.
- Stage B (B1) replaces the hp sums with damage-weighted strength.

**A4: new selectors** (`target_resolve.py`, read from the observation as it is).

| selector | resolves to | how | fallback | prose |
|---|---|---|---|---|
| `own_tower` | position | the nearest own **alive** tower in `nearbyTowers`, at a point 40 units from it toward my base, so I stand inside its range and behind it | beyond 390, no own tower is visible. Use the static tower spots of my lane (from `LANE_PATHS` and the map's tower fractions, `mapVariant.ts:26-40`), the inner one first. Without B2, a dead tower's spot is still toward home. Then `home`. | "fall back to my tower", "hold at my own tower", "defend my tower" |
| `own_front_tower` | position | the outermost own alive tower **in my lane** (`self.lane`), same standing point | the next one in, then `home` | "hold my lane at our outer tower" |
| `nearest_enemy_bearbot` | id | the nearest `visibleEnemies` entry of kind bearbot | none (the rule doesn't apply) | "attack the closest enemy bearbot" |
| `nearest_enemy_minion` | id | the nearest enemy minion | none | "farm the nearest minion", "clear their wave" |
| `tower_diver` | id | the nearest enemy bearbot within `towerRange` of one of my alive towers | none | "attack any enemy bearbot under my tower" |
| `nearest_ally` | position | the nearest allied bearbot (`allies`, map-wide) | `nearby_minion`, then `home` | "stick with my teammate", "group up" (never "my minions", which is `nearby_minion`: §8.1) |

- "None" means the target resolves to null, the way `lowest_hp_enemy` with no enemy does today
  (`target_resolve.py:146-148`).
- **Ties:** every new selector uses `_pick` under `own-lane-1`, so a mirrored state gives the
  mirrored choice (`:119-141`).
- **"Hold position" needs no new action.** `move` to `own_tower` holds there once the bot has
  arrived. `hold` stays "do nothing this tick".

**A5: the facts list in the translator prompt.** Under `vocab-2` the prompt gains a list of "facts
the game states every decision". It is generated from the same table that writes the description,
so they can't drift. It sits beside the selector list (`translator.py:226-227`), and the
translator is told to phrase each condition in those terms. The house work already showed why: a
question in worksheet names, or in a fact the description doesn't give, is answered worse
(`prompts/pilots/README.md:68-72, 77-78, 214-218`).

### 4.2 Why these first

- **A1 + A4 `own_tower`:** easy no longer has to leash by retreating at the first sight of an enemy
  tower. It can hold at its own tower, which is what "defend, never risk a bearbot" means
  (`README.md:48`).
- **A3:** medium and hard can say "fight when stronger here". Their only strength rule now is
  hard-eco's "an enemy bearbot in sight has more hp than you" (`house-hard-eco.prose.md:25-26`). It
  compiles to one Jev question that counts neither side's towers.
- **A1 "it will shoot you" + `tower_diver`:**
  - An entrant can dive only when the wave covers it.
  - A house tier can punish the dive the sample entrant lives by.
  - If job 4e15 finds the sample entrant's dives are a net-positive trade, this is the house's
    answer. If it finds they are already costly, the house doesn't need it first (§7 D3).

### 4.3 Stage B: an observation layer, `sight-1`

A wrapper layer in `src/sight.ts`, beside `src/objective.ts`, outside the frozen set. It adds one
top-level `sight` block and nothing else. It reads the `Match` it wraps, so it knows what the
observation doesn't.

| key | content | replaces stage A's |
|---|---|---|
| B1 `sight.fight` | per side, within 260: bearbots with **instrument**, hp and current dps (attack damage ÷ cooldown, with level, items and Encore); minion count and hp; towers in range that are free to shoot bearbots. Strength = Σhp × Σdps per side, Lanchester's square law, so two half-strength bearbots aren't worth one full one. `edge` = mine ÷ theirs, with the same 1.25 band, recalibrated. | A3's hp-only verdict |
| B2 `sight.towers[]` | every tower and both nexuses, map-wide: id, team, lane, tier, pos, hp, alive, `range` | A1's 390 limit, and A4's static fallback |
| B3 `sight.self` | `attackRange`, `dps`, `underOwnTower` (id/null), `inEnemyTowerRange` (id/null), `towerTargetingMe` (the tower's actual next target by the sim's rule), `recalling` (channel seconds left, `recall-2`) | A1's approximation, A2's static range table |
| B4 `sight.score` | per team: kills, deaths, towers standing, nexus hp; `nextWaveInSec` | – (new) |

- **Information policy (§7 D5).**
  - Tower status, nexus hp and the scoreboard are what a MOBA's HUD shows everyone, so map-wide is
    fair.
  - An enemy's instrument is visible on the model. Recommend yes to both.
  - B3's `towerTargetingMe` says only what the tower will do. It reveals nothing hidden.
- **Prose it unlocks:**
  - "If we have more towers standing, play safe; if we're behind, take the Bandstand."
  - "Wait at my tower until the next wave is 5 seconds out."
  - "Don't recall again while a recall is running."
- **Not in B:** `attribution.ts`'s "who hit me". It is per-hit history, not state, and it changes the
  layer from a pure read into a stateful one. After the Jam if anyone asks.

### 4.4 Stage C: after the Jam

- **C1 structured conditions.** A rule node may carry `check: {fact, op, value}`, e.g.
  `{"fact": "self.hpPct", "op": "<", "value": 33}`. It is evaluated in Python, with no Jev
  question. The fact names are the A5/B table, and the ops are `< <= > >= == !=`.
  - It takes plain thresholds ("hp below a third") away from Jev's judgement, which today reads
    them from a number in a sentence and can miss.
  - It is a second node kind in the translator, the validator, `evaluate_schema`, the
    transparency view and the evolve mutators. That is too much surface to land in the Jam's last
    two weeks.
- **C2 the qwen worksheets.** Re-rendering `house-*-{violet,green}.md` to read `sight` keys (for
  example a `mytower` worksheet key) only matters for the qwen backend. The 9B model can't compare
  fields against `self.team` (`README.md:18-21`), so B3's precomputed booleans are what would make
  it work. These files are the qwen placement bar, so leave them at `vocab-1` unless asked.

## 5. Versioning: every log and schema replays byte-identical

### 5.1 What "byte-identical" has to cover

- **Match logs:** replay never calls Jev or the resolver. `ReplayPilot` feeds back the logged
  actions (`src/replay.ts:6-9, 216-233`), and `verifyReplay` compares sim checkpoints
  (`tools/match/headless.ts:397-464`). So nothing in stage A, which is Python only, can change a
  replay.
  - Stage B's layer adds observation fields only. It writes no sim state and draws no rng, so
    checkpoints can't move.
  - It is still recorded and re-attached in the wrapper order, for an honest re-run (§5.2).
- **Compiled schemas:** a schema on disk is never rewritten. A schema without a `vocab` key is
  `vocab-1`: it is described by today's `describe_observation`, byte for byte, and resolved by
  today's 12 selectors. The loader reads keys by name and ignores the rest
  (`tools/jev/compile.py:111-147`), so a new optional key breaks no old reader.

### 5.2 The mechanism, copied from the targeting rule

The targeting rule is the precedent. It is named, sent on every request, echoed by the server,
listed in `/health`, recorded in the log only when it isn't the old default, and hashed into
evolve's key only when named (`schema_server.py:112-146`; `jevSchemaPilot.ts:33-42, 81-91`;
`headless.ts:271`; `generation.mjs:145-156`). The vocabulary does the same:

| piece | change |
|---|---|
| `translator.py` | `VOCABS = ("vocab-1", "vocab-2", "vocab-3")`. The selector list and facts list are chosen per vocab, and **the vocab-1 prompt is byte-identical to today's** (a golden test on the prompt string). `_validate_action` accepts the selected vocab's selectors only. |
| `compile.py` | `--vocab NAME`. A `vocab-2`+ compile writes a top-level `"vocab"` key. A `vocab-1` compile writes no key, so it is identical to today's output. |
| `fidelity_harness.py` | `describe_observation(obs, vocab="vocab-1", tower_range=None)`. Under vocab-1 it is today's function, byte for byte (golden test over `scenarios.py`'s observations and observations recorded in logs). |
| `target_resolve.py` | the new selectors exist only in vocab-2+. A vocab-1 schema naming one is still a `ValueError`, as now (`:228`). |
| `schema_server.py` | The request may name `vocab` and `map`. If it doesn't, it gets the schema's own `vocab` key, and then `vocab-1`. The reply echoes `vocab`, and `/health` lists the vocabs it serves. |
| `jevSchemaPilot.ts` | sends `vocab` and `map`, and checks the echo, as it does for `targeting`. |
| match log | `sides[team].schemas` already holds each schema, `vocab` key included (`queue.mjs:407-416, 463-464`). Add `sight: "sight-1"` only when the layer is attached, as `objective` is. Its absence means not attached. |
| `tools/arena/schemas.mjs` | `compilerVersion` hashes the default vocab name too, and `COMPILER_FILES` gains `fidelity_harness.py` and `target_resolve.py` under vocab-2+. While there, add `economy_rules.py`, whose item lines are in the prompt but not in the hash (`translator.py:62`). |
| `tools/evolve/generation.mjs` | `shape.vocab` is hashed into `matchKey` when named, so campaign 2's cached matches keep their keys (§7 D7). |

**Tests that prove it.** None needs a model.
- the vocab-1 translator prompt string is unchanged;
- the vocab-1 description is unchanged on a fixed observation corpus;
- every checked-in `*.schemas.json` loads and resolves exactly as before over that corpus;
- `verifyReplay` passes over the checked-in logs;
- an existing campaign's `matchKey` values are unchanged.

## 6. Timing against the Jam

The Jam's dates are unsettled; the dates, once set, are in [the Jam calendar](arena-runbook.md#the-jam-calendar). The milestones and their
order stand (`docs/economy-spec.md` §7):
- **entrant-facing changes land**;
- then **sign-ups close**;
- then **the numbers freeze**;
- then the training cutoff at midnight going into the Jam, and **the Jam**.

### 6.1 What fits where

| window | what lands | gate |
|---|---|---|
| **By the time entrant-facing changes land** (before sign-ups close) | Stage A: A1–A5, `vocab-2`, the §5.2 plumbing, and the A3 calibration on recorded logs ($0). Entrants README "What your prose can say" section (§6.3), `PROMPTLANE_REF` bump, announcement. | Ruled two days before that, so there is a day to build and a day to review. Optional Jev check (§7 D6). |
| **By the numbers freeze** | Stage B: `sight-1`, `vocab-3`. Only if stage A merged clean when entrant-facing changes landed. | A second announcement and a second recompile of every entry. Nothing after the freeze. |
| **After the Jam** | Stage C; anything stage B didn't fit. | – |
| **Never between the numbers freeze and the Jam** | any translator, description or selector change | It would recompile every entry in the last week (§6.2). |

### 6.2 The risk of changing the vocabulary after entrants start writing

1. **Every translator change recompiles every entry.** `compilerVersion` is a hash of the compiler's
   files (`tools/arena/schemas.mjs:27, 35-44`), so any edit changes it and the arena's cache misses.
   Translation is sampled, so an entrant's cascade can change though their prose didn't. This is
   true even for a vocab-1 compile whose prompt is byte-identical, because it is a fresh sample.
2. **New selectors capture old prose.** "Attack the closest enemy bearbot" used to compile to
   `nearest_enemy` or `lowest_hp_enemy`. Under `vocab-2` it compiles to `nearest_enemy_bearbot`.
   That is better, but nobody asked for it.
3. **A changed description changes Jev's answers to old questions.** §3 rule 3, a schema playing
   under its own vocab, removes this for existing schemas, but not for anything recompiled.
4. **Fairness.** An entrant who tuned their wording against the vocab-1 compile has to re-check it.
   One change, announced before sign-ups close, with the compile preview showing the new terms,
   costs everyone the same.
5. **Campaign 2 and the house bar.** The evolution campaign compiles as it goes. It must pin
   `vocab-1`, or its later generations play a different game (§7 D7). Recompiling a house tier
   under `vocab-2` moves the placement bar, and the ledger's `house` row records the new hash
   (`prompts/pilots/README.md:149-155`).

### 6.3 How entrants are told

- **Entrants README** (`jamobair-entrants`):
  - Replace the false sentence at `README.md:103-105` (§2.3).
  - Add a "What your prose can say" section that lists the facts Jev is told and the targets your
    rules can name, each with an example sentence. Generate it from the translator's selector and
    facts tables, as the economy section is generated from the ruleset (`economy-spec.md:653`), so
    it can't drift.
  - Mark it "final at the numbers freeze".
- **Compile preview** (all three doors, `docs/entrant-compile-preview.md`): the transparency view
  already shows each rule's selector. Add the vocab name to its header. After the bump, an
  entrant's next PR comment shows their prose under the new terms.
- **Announcement:** one message the day it merges. Say what's new, that everyone's entry was
  recompiled, and to re-check their compile view.

## 7. Decisions for Ceryce

| # | decision | recommendation | cost if yes |
|---|---|---|---|
| D1 | Build stage A to land when **entrant-facing changes land**, before sign-ups close? | **Yes.** It is Python only, covers the whole ask (own towers, fight balance, hold at my tower), and every existing schema is unchanged. | ~9 h agent work, $0 |
| D2 | Make `vocab-2` the **default** for entrant compiles from the moment it merges (recompiles every entry once)? | **Yes**, and only before sign-ups close. A default that stays `vocab-1` means entrants never get the vocabulary. | one recompile per entry |
| D3 | Which house tiers get recompiled under `vocab-2`, and when? | **Easy and hard-eco**, after job 4e15 reports: easy holds at its own tower, hard punishes divers. Keep **medium** as the bar unless 4e15 says it must move. | a tier check on Jev (~$3-4, as in PR #71) |
| D4 | Calibrate A3's 1.25 band and tower clause on recorded logs before it ships? | **Yes**, $0, part of stage A. | ~1 h |
| D5 | Information policy for stage B: map-wide tower status, nexus hp and scoreboard; enemy instrument | **Yes to both** (HUD-equivalent, visible on the model) | – |
| D6 | A small Jev check after stage A merges: house easy and the sample entrant, compiled under `vocab-2`, a few seeded matches | **Yes, capped at ~$2** | ~$2 |
| D7 | Evolution campaign 2: pin `vocab-1`, or relaunch under `vocab-2`? | **Pin `vocab-1`.** Its results stay comparable, and the blackout starts at midnight going into the Jam anyway. | – |
| D8 | Stage B by the numbers freeze, or after the Jam? | **By the freeze only if stage A merged clean when entrant-facing changes landed**, else after the Jam | ~8 h, a second recompile and announcement |

## 8. Stage A as built

Ceryce ruled D1 and D2 yes (Telegram, Fri 2026-10-02 02:35 CT: "Build it now"). D7 is as
recommended: campaign 2 stays on vocab-1. D3 and D6 are open, so no house tier was recompiled and no
model was called. The build is A1–A5, the §5.2 plumbing and the D4 calibration, at $0.

**D3 and D6, done later the same day** (Ceryce, 02:45 CT: "Move the house tiers and I auth the jev
check after."). Easy-eco and hard-eco were recompiled under `vocab-2`, against the late-game economy,
and checked on Jev. The results and two `vocab-2` translator findings for entrants (`nearest_ally`
captures "my minions"; an invented `nearest_enemy_tower`) are in
[`runs/vocab-house-tiers-2026-10-02.md`](../runs/vocab-house-tiers-2026-10-02.md).

**Where it lives.** `tools/jev/vocab.py` holds the names, the facts table (A5), the tower and fight
arithmetic, and the mirrors of `src/mapVariant.ts` and the attack ranges. `fidelity_harness.
describe_observation(obs, vocab, map)` keeps vocab-1's function as `_describe_vocab1`, unchanged, and
adds `_describe_vocab2`. `target_resolve.resolve_target(..., vocab, map)` resolves the six new
selectors under vocab-2 only. `translator` takes `vocab` through the prompt, the validator and the
schema. `compile.py --vocab` defaults to vocab-2. `schema_server.py` plays each schema under its own
`vocab` key, echoes it, and lists `vocabs` in `/health`. `jevSchemaPilot.ts` sends `vocab` and `map`
and holds on a missing or wrong echo. The CLI and the arena check `/health` before a match.

**Departures from §4–§5.**

| design | as built | why |
|---|---|---|
| A3 verdict: stronger when hp ≥ 1.25× theirs **or** a one-sided tower, vetoed when outnumbered by 2+ | a one-sided tower over the fight **decides first**, then hp at 1.25×; no veto | D4 on 64,290 recorded pvp-1 decisions (`runs/vocab-fight-calibration-2026-10-02.md`): with only my tower over the fight my side won the next 5 s 71 % of the time, with only theirs 11 %, with neither 49 %. "Tower first" is right 65.4 % of the time on 84 % of fights; the design's rule 61.0 % on 73 %. The veto made every setting slightly worse. |
| A2: distances and in-range flags | also each minion's hp, and the bot's own lane | both are in the observation and cost one clause each (gaps G5, G10); `own_front_tower` needs the lane to mean anything |
| the request names the map | it sends the variant object a log records (`{name, towerRange, towerFractions}`); a known name also works | a new map variant needs no Python change |
| `VOCABS = ("vocab-1", "vocab-2", "vocab-3")` | `("vocab-1", "vocab-2")` | vocab-3 is stage B; naming it before it exists would let a schema claim it |
| new campaigns | `DEFAULT_CAMPAIGN.shape.vocab` is vocab-2, hashed into `matchKey`; a campaign without it compiles vocab-1 | campaign 2 keeps its keys and its words; a new campaign measures what entrants write |

**Proofs (no model).** `tools/jev/test_vocab.py` holds vocab-1's prompt, description and every
resolution to goldens recorded from develop at eaf1b45 (`tools/jev/testdata/`), over 226
observations, 154 of them recovered from the checked-in logs. It plays every checked-in schema and
checks Jev would be shown the same paragraph. It also tests each fact and target, and runs a stand-in
that reads only the description text. `tools/match/test_vocab.mjs` replays every checked-in log,
checks the Python mirrors against the TypeScript, and plays a real match on the stub schema server
with one side on vocab-2 and the other on vocab-1. `test_evolve.mjs` checks that matchKeys recorded
before vocab-2 are unchanged.

**Left for later, on purpose.** Stage B (B1–B4) and stage C, as §6.1 says. The entrants README fix
and its "What your prose can say" section live in `jamobair-entrants`, so they ship there with the
`PROMPTLANE_REF` bump. The qwen side files stay vocab-1 renderings (§4.4 C2). The vocab-2 prompt is
about 730 tokens longer, so a compile under the arena's 20,000-token cap now has room for two
retries rather than three.

### 8.1 Two target fixes after the first vocab-2 compiles

The house-tier run (PR #79, `runs/vocab-house-tiers-2026-10-02.md` §2 and §5.4) found two ways the
`vocab-2` translator picked a target the prose didn't mean. Both are fixed in `translator.py`, and
`vocab-1` is untouched (its prompt, error text and parsing are byte for byte as before).

- **"My nearest minion" became `nearest_ally`.** Prose that says "walk with my nearest minion" or
  "move to the nearest allied minion" matched the target *named* `nearest_ally`, which is a teammate
  bearbot. Prose that says "follow my wave" without "nearest" was already right. The fix:
  - The `vocab-2` prompt now says which is which. `nearby_minion` is "the nearest allied MINION ...
    walk / push / ride with my minions, follow my wave". `nearest_ally` is "the nearest allied
    BEARBOT, a teammate, never a minion" (`VOCAB2_MEANINGS`, `VOCAB2_SELECTORS`).
  - A deterministic check runs after it (`normalize_targets`). A rule whose own words (id, question,
    and what "yes" means) name only my minions, but which targets `nearest_ally`, targets
    `nearby_minion`. The reverse applies to a rule naming only teammates. A mention that is negated
    ("none of my minions", "my minions are dead") doesn't count, and a rule naming both keeps the
    translator's choice.
- **The made-up `nearest_enemy_tower`.** The translator modelled it on `nearest_enemy_bearbot` and
  `nearest_enemy_minion`, and the compile failed after three attempts. Now a short alias table
  (`TARGET_ALIASES`) maps this name and a few like it to the real target, here `nearest_tower`. Any
  other unknown name is still an error, and the retry prompt now lists every valid target.

Every correction is a `target:` note in the schema. The entrant sees it under "Targets — what was
corrected" in the compile preview. Free local compiles of PR #79's two sources, before and after, are
in `runs/vocab2-target-fixes-2026-10-02.md`. A schema compiled before the fix keeps the targets it
was compiled with.

### 8.2 `nearest_tower` reaches the towers vocab-2 describes

The Jev re-check after §8.1 (`runs/jev-recheck-vocab2-2026-10-02.md` §2.2) found a reach gap. A1
lists enemy towers out to `nearbyTowers`' 390, but `nearest_tower` still read only `visibleEnemies`
(260). So "attack their tower" fired with no target, and the bot stood still 260–390 units out.
Ceryce ruled to fix the target side and keep the description. Under `vocab-2`, `nearest_tower` now
picks from every enemy tower or nexus the description lists: `visibleEnemies`, plus the alive enemy
towers that A1's lines read (`vocab.tower_facts`, `target_resolve.VOCAB2_WIDER`). The sim's `attack`
walks to a target that is out of reach. Under `vocab-1` it reads `visibleEnemies`, as in §2.2. The
result is in `runs/vocab2-tower-reach-2026-10-02.md`.

### 8.3 An ability aimed out of its range walks toward its target

§8.2's re-check found the same gap for abilities. A rule like "chord the enemy with the lowest hp" can
pick any enemy within 260, but chord reaches 180 and staccato 50. The sim's `ability` never moves the
bot (`src/sim/match.ts` `tryUseAbility`): out of range it does nothing, and the bot stands until its
next decision. Unlike towers, the target here is right; the action is the problem. So under `vocab-2`
the schema pilot (`tools/match/jevSchemaPilot.ts` `approachOutOfRange`) checks the cast against the
observation the server answered. A cast whose target that observation places beyond that ability's
range plays as a `move` to where the target stood, and the next decision casts once the bot is in
range. The range is read from the sim's own table (`INSTRUMENTS[…].abilities[…].range`), so no range is
copied. An ability with range 0 (fill, glissando, solo) never checks one and is left alone. So is a
target the observation doesn't list, or a cast with no target. The reply in the log keeps the
server's action, and the decision's `action` is the one played. Under `vocab-1` the server's action
plays as it comes. The numbers are in `runs/vocab2-ability-range-2026-10-02.md`.
