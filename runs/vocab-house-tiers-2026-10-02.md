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

*Filled in after the run (§5). Everything above §5 was written and committed before the first real
match.*

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

*Pending.*

## Files

- **This page;** the kept compile reports
  `runs/vocab-house-tiers-compile-{easy-eco,hard-eco,sample-entrant-eco}-2026-10-02.md`; the D6
  entrant `runs/vocab-house-tiers-2026-10-02-sample-entrant-eco-vocab2.schemas.json`.
- `prompts/pilots/house-{easy,hard}-eco.{prose.md,schemas.json}`,
  `prompts/pilots/house-medium-eco.schemas.json`, `prompts/pilots/house-eco-{violet,green}.md`,
  `prompts/pilots/README.md`, `tools/arena/test_house.mjs`, `tools/jev/test_vocab.py`.
