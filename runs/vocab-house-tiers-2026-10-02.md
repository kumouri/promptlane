# House tiers on the new vocabulary and the late-game economy — 2026-10-02 run

**Question.** Vocabulary spec §7 D3 and D6 ([`docs/vocabulary-spec.md`](../docs/vocabulary-spec.md)).
Recompile house easy and the economy-aware hard under `vocab-2`, so easy can hold at its own tower and
hard can judge fights by the tower-counting verdict and punish tower divers. Then check on Jev that the
tiers keep their order, and run the spec's small `vocab-2` check (D6).
- **Rulings:**
  - Ceryce, Telegram, Fri 2026-10-02 02:45 CT: "Move the house tiers and I auth the jev check after."
    D3 is the spec's recommendation: easy and hard-eco move to `vocab-2`, and medium's strategy stays
    the bar.
  - 02:46 CT: "But wait until the late game changes come through." 03:31 CT: the late-game build is
    in, so tune against it (PR #76, `eco-3-late`).
  - 03:54 CT: "Why don't we give the ladder to medium?" Medium gets the late-game shopping ladder,
    and its strategy is unchanged.
- **Budget:** $6.00 hard stop on Jev for D6 and the tier check together.
- **Economy measured against:** `eco-3-late` (recipes, tier-3 items, eight levels), with the Final
  Chorus and the rest of the Jam stack (§4). That is the economy Ceryce asked the tiers to be tuned
  against. It is not the default ruleset yet, so the arena plays none of this until it is switched on.

## Verdict

*Everything from §1 to §4 was written and committed before the first real match (`e2c34e7`,
04:22 CT). The verdict and §5 came after.*

- **Not an overall PASS.** Six of the eight lines pass. The primary is INCONCLUSIVE, and D6 fails
  one sub-line. On Jev with `eco-3-late` and the Final Chorus:
  - **1. hard above medium: INCONCLUSIVE.** Only 4 of 18 matches were decided (hard 3, medium 1). The
    other 14 reached 10:00 with no tower down. With the PR #71 schemas on `eco-3`, 14 of 18 were
    decided, all for hard.
  - **4. dives punished: PASS.** 67.7 % of the sample entrant's deaths now credit a defender, against
    46.0 % (job 4e15: 54 % credited no defender; now 32 %). The entrant won 2 of 4 decided against hard,
    against 6 of 6.
  - **6, 7. easy holds and doesn't feed: PASS.** Easy spent 99.7 % of its alive time in its own
    tower's range (was 50.0 %) and 0.5 % at its fountain (was 17.6 %). It lost no bearbot in 16
    matches.
  - **2, 3, 5 (guards and control): PASS.** Easy took no decided match from hard (0 of 5). Hard is no
    wall (2–2 against the entrant). Medium–easy was 4 draws, as before.
  - **D6: FAIL on one sub-line.** `vocab-2` plays end to end: 6 of 6 matches finished and
    replay-verify, with 0 errors. But easy never chose `own_tower`, because the `vocab-2` sample
    entrant never came near it. That entrant spent 79 % of its decisions walking to its own
    teammates (finding 1 below). All six matches were draws, five with no death at all.
- **Two findings Ceryce should see before any entrant compiles under `vocab-2`:**
  1. **"Stay with my minions" now compiles to "go to my nearest teammate" (`nearest_ally`).** Every
     hard-eco and sample-entrant compile that succeeded in this run did it. On Jev the recompiled sample entrant
     stopped pushing: its three bots clustered at their own towers (96 % of alive time) and dealt
     2 structure damage a match. An entrant's prose that worked under `vocab-1` can stop playing
     after the `vocab-2` recompile. The house is unaffected, because its old `nearby_minion` rules
     were kept byte for byte.
  2. **The translator invents a `nearest_enemy_tower` selector.** 4 of 24 instrument compiles
     failed on it. An entrant can lose an instrument's compile to it.
- **The economy-aware hard no longer takes towers before 8:00 against medium.** Across P, 4 towers
  fell, all in sudden death, against 14 before. Hard's structure damage fell from 934 to 689 a match,
  and medium's rose from 266 to 396. This sample can't split the cause between hard's new rules and
  the late-game economy (§5.2).
- **Easy is now a turtle that never shops.** It never leaves its tower and never takes enough damage
  to walk home, so it ends with a median 550 gold unspent, at level 2.6 at 8:00.
- **Passives:** no bot held Feedback and Wall of Sound together in any match (0 of 240 bots), so the
  uncapped stack never appeared. No house ladder declares both, and the sample entrant's lists stop
  at tier 1.
- **Spend: $4.993** of the $6.00 stop. The smoke tests were free.

## 1. What changed

Only economy-aware files change. The plain tiers (no economy), their qwen side files and every other
pilot are byte for byte as on `develop`. That follows PR #71: the Jam plays with an economy, so it
plays the eco files. The qwen side files stay `vocab-1` renderings (spec §4.4 C2).

### Easy (`house-easy-eco.prose.md`): hold at your own tower

| | before (`vocab-1`) | after (`vocab-2`) |
|---|---|---|
| near an enemy tower | "If you can see an enemy tower or the enemy nexus, move back home." This is the leash: any enemy tower within 260 sent easy home. | "If you are inside an enemy tower's range, fall back to your own tower." (`own_tower`) |
| fighting | attack the nearest enemy (any kind) | the nearest enemy bearbot, then the nearest enemy minion (`nearest_enemy_bearbot`, `nearest_enemy_minion`) |
| nothing to do | ride the nearest allied minion, else go home | **hold your lane at your own outer tower** (`own_front_tower`, the root default) |
| shopping | Road Case → Metronome → Amp | the full ladder (below) |

The low-hp pair (walk home under 100 hp with an enemy in sight, recall with none) is unchanged, byte
for byte. Easy still has no abilities and no Bandstand rule.

### Hard-eco (`house-hard-eco.prose.md`): fight under your own tower, punish divers

PR #71's tower-race changes all stay: the low-hp pair at 50 % of max hp, a tower with one allied
minion, the 480-second tower rule, and the lane push as the fallback. Four rules change:

| | before | after |
|---|---|---|
| the 300-gold rule | "…and an enemy bearbot in sight has more hp than you, move back home to spend it" | "…and your side is weaker in the fight near you…" (vocab-2's tower-counting fight verdict) |
| new, right after it | — | "If an enemy bearbot is under your tower, attack the enemy bearbot under your tower." (`tower_diver`) |
| after the 480-second rule | "If you can see an enemy tower and there is no allied minion near you, move back home." | "If an enemy tower will shoot you, fall back to your own tower." (`own_tower`) |
| new, after the wave tower rule and before "hunt the carrier" | — | "If your side is weaker in the fight near you, fall back to your own tower." (`own_tower`) |

### The shopping ladders (all three tiers)

The late-game build (PR #76, its spec §11) found that every compiled schema names exactly three tier-1
items, and that a declared list is taken as written. So under `eco-3-late` each tier would play as
levels only. Each tier now names its full ladder: three tier-1 items, a recipe, the fourth item, the
first upgrade, the second recipe and its upgrade.

| tier | instrument | ladder |
|---|---|---|
| easy | all three | Road Case → Metronome → Amp → **Tour Bus** → Bass Strings → **Headliner** → **Fuzz Pedal** → **Feedback** |
| medium | drums | Road Case → Bass Strings → Metronome → **Backline** → Amp → **Wall of Sound** → **Click Track** → **Arpeggiator** |
| medium, hard | keytar | Metronome → Amp → Road Case → **Click Track** → Bass Strings → **Arpeggiator** → **Backline** → **Wall of Sound** |
| medium, hard | violin | Amp → Bass Strings → Road Case → **Fuzz Pedal** → Metronome → **Feedback** → **Tour Bus** → **Headliner** |
| hard | drums | Road Case → Bass Strings → Amp → **Backline** → Metronome → **Wall of Sound** → **Click Track** → **Arpeggiator** |

- **Medium's ladders are the instrument defaults** (late-game spec §2.5), so its first three items are
  its old ones.
- **Easy's ladder is defensive.** Its first three items contain two recipes. It takes Tour Bus
  (+50 % max hp) first, so the leftover Amp and the fourth item make Fuzz Pedal.
- **Hard drums keeps its old first three** (Road Case, Bass Strings, Amp), so its first recipe is
  Backline, and Amp plus Metronome make Click Track.
- **Each ladder expands as written** under `eco-3-late`, with no notes. Under `eco-3` and `eco-2`, the
  engine drops the recipe names and keeps the old first three items. So a match without recipes
  plays exactly the old shopping (`test_house.mjs` checks both).
- **No house ladder holds Feedback and Wall of Sound together.** That stack heals 110 % of PvP damage
  dealt and nothing caps it (late-game spec §11). Whether to cap it is Ceryce's call, and this run
  changes nothing about it. §5 reports how often it appeared.

### Medium: the bar moved, but only its shopping

- `house-medium-eco.schemas.json` changed **in its `build` lists only**, to the ladders above, plus the
  `"economy": "eco-3-late"` key that names the ruleset the list was checked against. Its rules, root
  default, notes and vocabulary (`vocab-1`) are byte for byte. The qwen side files
  `house-eco-{violet,green}.md` name the same ladders in their shopping lines.
- PR #76 says a shopping list can name any tier, so no recompile was needed.
- **The placement bar moved.** Under `eco-3-late`, medium now buys recipes and tier-3 items instead of
  holding three tier-1 items and unspent gold. Under `eco-3` it plays exactly as before. Either way
  its file hash changed, so the arena ledger's `house` row records the new one.

**New hashes** (sha256 of the file, as `tools/arena/house.mjs` hashes it):

| file | before | after |
|---|---|---|
| `house-easy-eco.schemas.json` | `be6e71b4…` | `d883285f929e45144bf7e699fbe24fd073c8f78b07418f5a4e9ccbd749af5fe3` |
| `house-medium-eco.schemas.json` | `abfc30c0…` | `e705e85a20f280cdcc2d6d30726f99bf86cd43da6009794aa0bc42cf6fea8020` |
| `house-hard-eco.schemas.json` | `405a185d…` | `30e577889130510c25b95e001e7138398cf6f897719d04476d4bb67a22e0afe6` |

## 2. How the schemas were made

The repo's house-pilot path, as in PR #71: `python tools/jev/compile.py … --vocab vocab-2 --economy
eco-3-late --backend ollama` (the translator is `qwen3.5:9b` on the local Ollama, the same model the
entrant doors use), three samples per source. Hard-eco was compiled without its Bandstand paragraph.
Those rules are the plain tier's, spliced byte for byte, and with them the cascade overruns the
translator's 1,800-token reply. Then **only the changed rules were spliced** into the checked-in schema.
Every other rule object, and the notes, stay byte for byte.

| source | drums | keytar | violin |
|---|---|---|---|
| easy-eco s1 / s2 / s3 | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ |
| hard-eco s1 / s2 / s3 | ✗ selector / ✓ / ✓ | ✗ truncated / ✗ selector / ✗ truncated | ✓ / ✗ selector / ✗ truncated |

("✗ selector": the translator invented `nearest_enemy_tower`, which no vocabulary has. "✗ truncated":
the reply hit the 1,800-token cap.)

- **Every changed rule is instrument-agnostic, so one sample's rule objects went into all three
  instruments.**
  - **Hard:** s3 drums. It is the only sample that compiled all four changed rules; s2 drums and s1
    violin dropped the "weaker → own tower" rule. No keytar sample compiled, so keytar's rules come
    from the same objects. Its ladder is its prose line, which is the instrument default.
  - **Easy:** s1 keytar, the first sample whose three new rules ask what the prose says. s1 drums
    asked "within this bot's attack range" for "in sight".
- **Easy's root default is the prose's stated fallback, `own_front_tower`, set by hand.** No easy
  sample put it in the default slot. Each compiled it as a last rule with a catch-all question ("is
  there no immediate threat or shopping opportunity?", "do none of the above conditions apply?") over
  a `push_lane` default. Jev answering no would have sent the careful tier pushing. So the catch-all
  rule was not taken.
- **Kept transparency reports:** `runs/vocab-house-tiers-compile-{easy-eco,hard-eco,sample-entrant-eco}-2026-10-02.md`.

### What the compiles showed about `vocab-2` (for entrants; nothing here is changed)

1. **The translator invents `nearest_enemy_tower`.** It happened in 4 of the 24 instrument compiles
   in this run (hard-eco 3 of 9, sample entrant 1 of 6, easy 0 of 9). By analogy with `nearest_enemy_bearbot` and
   `nearest_enemy_minion`, it writes a selector no vocabulary has, and the instrument fails after three
   attempts. An entrant whose prose says "attack the tower" can fail to compile one instrument.
2. **"Move to my minions" now compiles to `nearest_ally`,** the nearest allied *bearbot*. It falls
   back to an allied minion only when no ally is alive. Every hard-eco and sample-entrant sample did
   this. This run splices hard's old `nearby_minion` rule unchanged, so the house is unaffected. The
   D6 sample entrant has it (§4), so D6 measures it as an entrant would get it.
3. **A long shopping list becomes shopping rules.** Two of three easy samples turned the eight-item
   list into up to nine "can this bot afford X → go home" rules, though the prose says "You never go
   home just to shop". Rule 1 of some samples read "hp below 100" as "below 100 %".
4. **"Your fallback is X" is ignored when X is a new selector.** The prose's fallback became a
   catch-all rule over a `push_lane` default, as above.

## 3. Old schemas and logs

- **Logs replay byte-identical.** Nothing here touches the sim, the economy, replay or the resolver.
  §5 reports `--verify` on the 34 PR #71 logs on this branch.
- **Every other checked-in schema is unchanged.** It plays `vocab-1` as before (`test_vocab.py` now
  names the three files that are `vocab-2` on purpose and checks the rest are still `vocab-1`).
- **Evolution campaign 2 is untouched.** It is still pinned to `vocab-1`; nothing under
  `tools/evolve` changed.
- **The arena is untouched:** no code, no config, no live server. It still compiles for the default
  ruleset (late-game spec §11). That is out of scope here.

## 4. Pre-registered Jev measurement

**Written and committed before any real match.** The commit time is in the git log of this file, and
the first match's log carries its `createdAt`.

- **Code:** `feat/vocab-house-tiers` at this commit.
- **Backend:** Jev on one private `tools/jev/schema_server.py` on `:8951`, with `--budget-usd 6.00` as
  the hard stop. TypeSafe answers, failing over to Workers AI per call. The live arena's `:8790` and
  `:8797` are not touched.
- **Smoke, free, already done:** `schema_server.py --stub` on `:8952`, 120 s at seed 7, on this code:
  medium–hard, easy–entrant2 and entrant–hard. All three played 336 requests with 0 errors. The
  stub's token count is 1.28× PR #71's for medium–hard (955 against 745 a request), so a full match
  should cost about $0.12 against PR #71's $0.095.
- **Lines (every match):** `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall
  recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`, full
  600 s.
- **Sides:**
  - **easy, medium, hard:** each plays its tier's eco prose with the schemas in this commit.
  - **entrant:** `sample-entrant-eco.{prose.md,schemas.json}`, unchanged (`vocab-1`). It is the entrant
    of PR #71 and job 4e15, so the dive question compares like with like.
  - **entrant2:** the same prose compiled under `vocab-2`,
    `runs/vocab-house-tiers-2026-10-02-sample-entrant-eco-vocab2.schemas.json`. It is the first of two
    samples in which all three instruments compiled (s1's drums invented `nearest_enemy_tower`).

**The sample: 40 matches, in this order, 4 at a time.** Seeds are PR #71's.

| block | pairings (violet–green) | seeds | matches |
|---|---|---|---:|
| **D6** (vocab-2 check) | easy–entrant2, entrant2–easy | 3, 7, 11 | 6 |
| **P** (primary) | medium–hard, hard–medium | 3, 7, 11, 23, 42, 101, 5, 13, 17 | 18 |
| **S** (dives) | entrant–hard, hard–entrant | 3, 7, 11 | 6 |
| **E** (easy vs hard) | hard–easy, easy–hard | 3, 7, 11 | 6 |
| **C** (control) | medium–easy, easy–medium | 3, 7 | 4 |

- **Spend guard.** The runner stops launching matches once the projected spend passes $5.75: spent so
  far, plus cost per request × the mean calls of the finished matches × the matches left. The server
  stops at $6.00.
- **What a stop means.** A block cut short is reported as cut, with what it played.
- **Never extended.** No match is added or replayed after any result is seen. One exception: a match
  that crashes before it finishes is retried once, as in PR #71.

**Decided** means a winner by any end reason: a tower lead at 8:00, the first tower in sudden death,
the nexus, or a tower lead at 10:00. **Baselines** are PR #71's 34 logs (`eco-3`, the old easy and
hard), replayed on this branch by the same probe and scorer. The economy also changed (`eco-3-late`,
with ladders), so a difference from a baseline is the tier change and the late game together.

**The lines.**
1. **Primary: hard is still above medium (P).** Over P's 18 matches pooled, PASS iff:
   - at least 6 are decided;
   - hard wins at least 2/3 of the decided ones;
   - and the one-sided exact binomial test against 50 % gives p < 0.05.

   Fewer than 6 decided is INCONCLUSIVE, which is not a pass. Baseline: hard 14 of 14 decided.
2. **Guard: easy doesn't beat hard (E).** Easy's share of the decided hard–easy matches is below
   50 %. No decided match passes. Baseline: easy 0 of 5.
3. **Guard: hard isn't a wall (S).** This fails only if at least 3 entrant matches are decided and
   hard wins every one of them.
4. **The dive question (S): hard punishes dives.** Count the entrant's bearbot deaths in S, and the
   share that credit a defender (the economy's death event names a killer bearbot). PASS iff that
   share is **at least 56.0 %**. Baseline 46.0 % (58 of 126); 54.0 % credited no defender (job 4e15's
   figure). The entrant's decided-win share is reported beside it (baseline 6 of 6).
5. **Control: medium still beats or draws easy (C).** Medium wins at least half of the decided
   medium–easy matches, or none is decided. Baseline: 0 of 4 decided. Both tiers changed, so this is
   no longer a check on the run alone.
6. **Easy holds at its tower (E and C, easy's 10 matches pooled).** PASS iff both hold:
   - easy's bearbots spend at least 60 % of their alive time inside the range of an alive own tower
     (baseline 50.0 %);
   - and less of it at their own fountain than the baseline's 17.6 %.
7. **Easy doesn't feed (E and C).** Easy dies at most 2.0 times a match (baseline 0.6; medium died
   3.7 times a match against hard in the baseline). The "careful" tier holding forward shouldn't
   turn into a death trade.
8. **D6: `vocab-2` plays end to end (D6).** PASS iff all hold:
   - all 6 matches finish and replay-verify;
   - the server logs 0 errors and both sides 0 parse errors;
   - each of easy's four new actions is chosen at least once: `own_tower`,
     `nearest_enemy_bearbot`, `nearest_enemy_minion`, and the `own_front_tower` default.

   The result and easy's time shares are reported, and so is how often entrant2's `nearest_ally` rule
   fired and what it resolved to.

**Overall PASS = 1 to 8.**

**Reported, not lines:**
- end reasons and match length;
- structure damage per team, deaths, and time on the opponent's side, per tier;
- tier-2 and tier-3 timings and unspent gold per tier;
- how often a bot held Feedback and Wall of Sound together, and its PvP healing when it did;
- spend.

## 5. Result

**The run** went as registered.
- **Timeline (CT):**
  - plan committed at 04:22:31 (`e2c34e7`);
  - `origin/develop` merged on top at 04:22 (`99dd240`), with no conflicts, every suite green, and
    pushed. The merge brought #75–#78; #76 is the late-game build already in this branch, and #78
    is the stub's ordering fix;
  - stub smoke re-run on the merged code at 04:23 (four pairings, 0 errors);
  - first real match at 04:24:56 (its log's `createdAt`), on `99dd240`;
  - last finished at 05:01:01.
- **The sample:** all 40 matches played in plan order. The spend guard never fired, and nothing was
  retried, added or dropped.
- **Clean:**
  - 40 of 40 logs replay-verify (`--verify`), and so do the 34 PR #71 logs on this branch;
  - 0 parse errors;
  - 65,139 requests. TypeSafe returned 529 "system overloaded" six times, and each time the server
    failed over to Jev on Workers AI for about 11 s: 436 calls in all. One call failed on both doors,
    in P (hard–medium, seed 23), and that bot held for one decision. No D6 match saw an error.

| block | matches | decided | results | how they ended |
|---|---:|---:|---|---|
| **D6** easy–entrant2, entrant2–easy | 6 | 0 | — | 6 level at 10:00 |
| **P** medium–hard, hard–medium | 18 | **4** | **hard 3, medium 1** | 4 first tower in sudden death, 14 level at 10:00 |
| **S** entrant–hard, hard–entrant | 6 | 4 | entrant 2, hard 2 | 4 sudden death, 2 level at 10:00 |
| **E** hard–easy, easy–hard | 6 | 5 | hard 5, easy 0 | 5 sudden death, 1 level at 10:00 |
| **C** medium–easy, easy–medium | 4 | 0 | — | 4 level at 10:00 |

| line | result | pass line | |
|---|---|---|---|
| 1. hard above medium (P) | hard 3 of 4 decided, p = 0.31 | ≥ 6 decided, ≥ 2/3, p < 0.05 | **INCONCLUSIVE** |
| 2. easy doesn't beat hard (E) | easy 0 of 5 decided | below 50 % | **PASS** |
| 3. hard isn't a wall (S) | hard 2 of 4 decided | fails only on a sweep of ≥ 3 | **PASS** |
| 4. dives punished (S) | **67.7 %** of entrant deaths credit a defender (84 of 124) | ≥ 56.0 % (baseline 46.0 %) | **PASS** |
| 5. medium vs easy (C) | no decided match | medium ≥ half of decided, or none | **PASS** |
| 6. easy holds (E + C) | **99.7 %** of alive time in own tower range; **0.5 %** at its fountain | ≥ 60 %, and below 17.6 % | **PASS** |
| 7. easy doesn't feed (E + C) | **0.00** deaths a match | ≤ 2.0 | **PASS** |
| 8. D6 plays end to end | (a) 6 of 6 finish and verify; (b) 0 errors, 0 parse errors; (c) `own_tower` chosen **0** times | all of (a)–(c) | **FAIL** (c) |

### 5.1 The dive question

The sample entrant (unchanged, `vocab-1`) against hard, S block. Baseline: PR #71's S block, the old
hard on `eco-3`.

| | baseline | now |
|---|---:|---:|
| entrant's decided-win share | 6 of 6 (100 %) | **2 of 4 (50 %)** |
| entrant deaths a match | 21.0 | 20.7 |
| deaths that credit a defender | 46.0 % (58 / 126) | **67.7 % (84 / 124)** |
| deaths that credit no defender (job 4e15's figure) | 54.0 % | **32.3 %** |
| entrant deaths in range of hard's tower | 90 % (114 / 126) | 69 % (86 / 124) |
| entrant structure damage a match | 1,132 | 731 |
| hard deaths a match | 1.33 | 1.67 |

- **The entrant still dives and dies just as often,** but a hard bearbot now lands most of the kills,
  and the gold goes to it. Hard spent 5.1 % of its alive time against the entrant on the
  `tower_diver` rule, and 2.1 % falling back from a tower that would shoot it.
- **Hard reached tier 3 earliest of all tiers.** 18 of its 90 bots bought one, and in the entrant
  matches two did by 4:40, on the entrant's bounties (§5.3).
- **Two things changed at once:** hard's rules and the economy (`eco-3-late`). The late-game paper
  replay (late-game spec §11, "HH vs hard-new") put the economy alone at entrant 6 → 4 with 2 draws
  on the same seeds, so part of the drop is the economy's.

### 5.2 Hard against medium: the tower race stalled

| per team, per match (P) | hard, PR #71 | hard, now | medium, PR #71 | medium, now |
|---|---:|---:|---:|---:|
| structure damage by its bearbots | 934 | **689** | 266 | **396** |
| deaths | 5.22 | 5.61 | 3.72 | 4.89 |
| towers taken, all of P | 14 | **3** | 0 | **1** |
| share of alive time at its own fountain | 15.3 % | 11.3 % | 31.2 % | 24.4 % |
| share in its own tower's range | 47.3 % | 53.9 % | 35.7 % | 37.3 % |

- **No tower fell before 8:00 in any P match.** Before, 6 matches were won on a tower lead at 8:00.
- **Hard's new rules took 8.3 % of its alive time against medium:**
  - falling back from a tower that would shoot it: 3.3 %;
  - attacking a diver: 3.2 %;
  - falling back when weaker: 1.3 %;
  - the 300-gold rule: 0.5 %.

  The old "an enemy tower in sight and no minion near me → home" took 6.3 %. Hard spends more time
  under its own tower (53.9 % against 47.3 %), defending against medium's waves.
- **The economy can't explain the first eight minutes on its own.** In P, tier-2 items landed at a
  median 7:06 (hard) and 7:28 (medium), and mean level at 8:00 was 5.3 and 4.6, about eco-3's level
  cap. Before 8:00 the two economies differ little. After it, more hp from items and levels can slow
  a ×3 sudden death. Splitting the two needs a match set this sample doesn't have, such as the new
  hard on `eco-3`. It was not run, because the sample is never extended after results are seen.
- **What to do with that is Ceryce's call** (§6). The PR #71 hard is the version that took towers. On
  this evidence the `vocab-2` hard is a better defender against the entrant and a worse attacker
  against medium.

### 5.3 The ladders and the passive stack

| tier | bots | bought a tier-2 | median time | bought a tier-3 | median time | unspent gold at the end (median) | level at 8:00 (mean) |
|---|---:|---:|---:|---:|---:|---:|---:|
| hard | 90 | 41 | 7:06 | 18 | 6:41 | 245 | 5.3 |
| medium | 66 | 19 | 7:28 | 6 | 8:07 | 188 | 4.6 |
| easy | 48 | 1 | 3:07 | 1 | 3:07 | 550 | 2.6 |
| entrant (`vocab-1`) | 18 | 0 | — | 0 | — | 146 | 3.8 |
| entrant2 (`vocab-2`) | 18 | 0 | — | 0 | — | 225 | 4.0 |

(The tier-3 median is over the bots that reached tier 3, which were the ones that got their tier-2
early. So it can come before the tier-2 median.)

- **The ladders work.** Hard and medium buy recipes and upgrades, so the late game reaches the house.
  Under `eco-3-late`, medium is a different bar from before: its first three items are the same, and
  29 % of its bots went on to a recipe.
- **Easy doesn't shop.** It only buys when a low-hp retreat or a respawn takes it home, and holding at
  its tower it neither gets low nor dies. Its one tier-3 item is the D6 keytar that killed five
  bunched-up entrant2 bots (seed 7) and earned 1,784 gold from kills, first blood and drops.
- **Feedback + Wall of Sound: 0 of 240 bots, in all 40 matches.** Items are never sold, and a tier-3
  item is never used up, so "held at the end" is "ever held". No house ladder declares both, and the
  sample entrant's lists stop at tier 1. So these matches say nothing about what the stack does. It
  can only appear for an entrant whose list names Feedback and Wall of Sound (or their parts in that
  shape). No cap was added; that is Ceryce's call.

### 5.4 D6: what `vocab-2` did to the sample entrant

| side (D6, 6 matches) | decisions | chosen actions |
|---|---:|---|
| easy | 5,256 | hold at outer tower (default) 99.3 %, attack nearest enemy bearbot 0.3 %, nearest enemy minion 0.2 %, low-hp pair 0.2 % |
| entrant2 | 5,231 | **move to nearest ally 79.4 %**, home 6.7 %, attack tower 6.4 %, push (default) 4.1 %, nearest enemy minion 2.6 % |

- **Every one of entrant2's 4,156 `nearest_ally` moves went to an allied bearbot.** Its rule is "is
  there a minion near me? → move to the nearest ally". Under `vocab-1` the same sentence compiled to
  `nearby_minion` and the entrant rode its wave. Now its three bearbots chase each other, and spend
  96 % of their alive time in their own towers' range.
- **Easy's `own_tower` rule never fired in 16 matches** (D6, E and C). Holding at its outer tower, it
  never stood in an enemy tower's range, so the rule had nothing to do. The other three new actions
  did fire.

## 6. What Ceryce may want to decide

1. **`nearest_ally` capture (entrant-facing, before `vocab-2` compiles matter).** Options: reword the
   selector list so "my minions" can't read as an ally, a validator note when a condition about
   minions moves to `nearest_ally`, or a stub-free compile check on a fixture. Not done here, because
   it is a translator change and every entry would recompile.
2. **The invented `nearest_enemy_tower`:** a validator that maps it to `nearest_tower` with a note, or
   a prompt line. Same caveat.
3. **Which hard ships.** The `vocab-2` hard punishes dives, but its push against medium is unproven
   (INCONCLUSIVE). The PR #71 hard won 14 of 14 against medium on `eco-3`. A follow-up could
   pre-register the new hard on `eco-3`, or the PR #71 hard on `eco-3-late`, to split the cause (about
   $2.30 for 18 matches).
4. **Easy never shops.** That is "easy stays easy", or one more sentence (recall to buy when nothing is
   in sight). Either is a one-line prose change.
5. **The passive stack** is untested in play: no bot in this run could reach it.

## Files

- **This page;** the kept compile reports
  `runs/vocab-house-tiers-compile-{easy-eco,hard-eco,sample-entrant-eco}-2026-10-02.md`; the D6
  entrant `runs/vocab-house-tiers-2026-10-02-sample-entrant-eco-vocab2.schemas.json`.
- `prompts/pilots/house-{easy,hard}-eco.{prose.md,schemas.json}`,
  `prompts/pilots/house-medium-eco.schemas.json`, `prompts/pilots/house-eco-{violet,green}.md`,
  `prompts/pilots/README.md`, `tools/arena/test_house.mjs`, `tools/jev/test_vocab.py`.
- **The 40 logs and the 4 stub smokes aren't in git.** They are on the
  [`data-vocab-house-tiers-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-vocab-house-tiers-2026-10-02)
  prerelease as `vocab-house-tiers-match-logs-2026-10-02.zip`: 4.0 MB, 61.5 MB raw, sha256
  `65f0f59f1eb5a3ab123c2a8eaec568c219aef730cd87c4760f60120b7e5849ff`.
  - The zip has `runs/vocab-house-tiers-2026-10-02-SHA256SUMS`.
  - `runs/vocab-house-tiers-2026-10-02-analysis/` holds the scratch tools behind this page: the
    runner, plan, probe, scorer, the D6 action tally, the ladder report, the splice, every compile
    sample, the run log and the server's final `/health`.
- **Log names:** `runs/vocab-house-tiers-2026-10-02-<violet>-<green>-seed<N>.json`. To check one, unzip
  at the repo root and run `npm run match -- --verify runs/vocab-house-tiers-2026-10-02-medium-hard-seed7.json`.
- **Spend:** $4.993 by the server's ledger, for 65,139 requests, against the $6.00 stop.
