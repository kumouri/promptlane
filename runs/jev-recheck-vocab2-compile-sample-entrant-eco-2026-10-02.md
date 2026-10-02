# Jev compile preview: `C:/Users/willa/.claude/scratch/jev-recheck-vocab2/compile/src/sample-entrant-eco.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 5 model call(s), 23,961 tokens of a 60,000-token cap, $0.0000, 96.8 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

Vocabulary: `vocab-2` -- the facts Jev is told about the game each decision and the targets a rule can name. A compiled schema always plays under the vocabulary it was compiled in.

Items and shopping lists follow the `eco-3-late` ruleset.

- **drums**: 10 rules -- ⚠ 3 rule(s) with no clear source sentence
- **keytar**: 10 rules -- ⚠ 3 rule(s) with no clear source sentence
- **violin**: 11 rules -- ⚠ 4 rule(s) with no clear source sentence

---

# Transparency report: `C:/Users/willa/.claude/scratch/jev-recheck-vocab2/compile/src/sample-entrant-eco.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a third of its max? | **recall** home |
| 2 | — | can this bot afford its next item and is no enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is this bot carrying more than 300 gold and is an enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is an enemy tower visible and are none of this bot's minions near it? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is the 'kick' ability ready and is an enemy bearbot right next to this bot? | use **kick** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower) |
| 6 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 7 | — | is at least one enemy bearbot dead and are minions near this bot? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| 8 | — | is an enemy tower visible and are at least two minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 9 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 10 | — | are there minions near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Bass Strings → Metronome (from your prose)

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means this bot's hp is less than 33% of its max; no means this bot's hp is 33% or more of its max.
- **Order:** checked first (position 1 of 10) -- this is the order the translator produced.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 2. `shop_afford_no_enemy` — can this bot afford its next item and is no enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford its next item and is no enemy bearbot in sight?" -- yes means this bot can afford its next item and no enemy bearbot is within 260 units; no means this bot cannot afford its next item or at least one enemy bearbot is within 260 units.
- **Order:** checked at position 2 of 10, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When I can afford my next item and no enemy is in sight, I head home to shop.

### 3. `avoid_fight_high_gold` — is this bot carrying more than 300 gold and is an enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot carrying more than 300 gold and is an enemy bearbot in sight?" -- yes means this bot has more than 300 gold and at least one enemy bearbot is within 260 units; no means this bot has 300 or less gold or no enemy bearbot is within 260 units.
- **Order:** checked at position 3 of 10, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I'm carrying more than 300 gold and an enemy bearbot is in sight, I don't start the fight: I go home and spend it.
  > If an enemy bearbot is in sight, I go after whichever enemy is worth the most gold.

### 4. `back_off_tower_no_minions` — is an enemy tower visible and are none of this bot's minions near it?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible and are none of this bot's minions near it?" -- yes means at least one enemy tower is within 390 units and no allied minion is within 260 units; no means no enemy tower is within 390 units or at least one allied minion is within 260 units.
- **Order:** checked at position 4 of 10, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > If one of theirs is dead and my minions are near me, I push the nearest enemy tower with the wave.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 5. `kick_ready_near_enemy` — is the 'kick' ability ready and is an enemy bearbot right next to this bot?

- **Then:** use **kick** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the 'kick' ability ready and is an enemy bearbot right next to this bot?" -- yes means the 'kick' ability cooldown is 0 and at least one enemy bearbot is within this bot's attack range; no means the 'kick' ability is not ready or no enemy bearbot is within this bot's attack range.
- **Order:** checked at position 5 of 10, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### 6. `hunt_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means at least one enemy bearbot is within 260 units; no means no enemy bearbot is within 260 units.
- **Order:** checked at position 6 of 10, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `push_tower_one_dead` — is at least one enemy bearbot dead and are minions near this bot?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is at least one enemy bearbot dead and are minions near this bot?" -- yes means at least one enemy bearbot is dead and at least one allied minion is within 260 units; no means all enemy bearbots are alive or no allied minion is within 260 units.
- **Order:** checked at position 7 of 10, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `attack_tower_two_minions` — is an enemy tower visible and are at least two minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible and are at least two minions near this bot?" -- yes means at least one enemy tower is within 390 units and at least two allied minions are within 260 units; no means no enemy tower is within 390 units or fewer than two allied minions are within 260 units.
- **Order:** checked at position 8 of 10, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 9. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means at least one enemy minion is within 260 units; no means no enemy minion is within 260 units.
- **Order:** checked at position 9 of 10, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 10. `follow_wave_or_home` — are there minions near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there minions near this bot?" -- yes means at least one allied minion is within 260 units; no means no allied minion is within 260 units.
- **Order:** checked at position 10 of 10, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "Keytar: Metronome, then Amp, then Road Case."; "Violin: Amp, then Bass Strings, then Road Case."; "Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on th…"; "Violin: when staccato is ready and an enemy bearbot has less than half its hp, I…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Keytar: Metronome, then Amp, then Road Case.
> Violin: Amp, then Bass Strings, then Road Case.
> Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.
> Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave, and we spend our gold before we risk it.
> Our shopping lists, in order: Drums: Road Case, then Bass Strings, then Metronome.
> Nothing matters more than that.


---

# Transparency report: `C:/Users/willa/.claude/scratch/jev-recheck-vocab2/compile/src/sample-entrant-eco.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a third of its max? | **recall** home |
| 2 | — | can this bot afford its next item and is no enemy in sight? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is this bot carrying more than 300 gold and is an enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | can this bot see an enemy tower and are none of its minions near it? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is the chord ability ready and is an enemy bearbot in sight? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 7 | — | is an enemy bearbot dead and are minions near this bot? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| 8 | — | can this bot see an enemy tower and are at least two of its minions near it? | **attack** targeting: the nearest visible enemy tower or nexus |
| 9 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 10 | — | are there minions near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Metronome → Amp → Road Case (from your prose)

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means this bot's hp is less than 33.3% of its max; no means this bot's hp is 33.3% or more of its max.
- **Order:** checked first (position 1 of 10) -- this is the order the translator produced.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 2. `shop_afford_no_enemy` — can this bot afford its next item and is no enemy in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford its next item and is no enemy in sight?" -- yes means this bot can afford its next item and there are no enemies within 260 units; no means this bot cannot afford its next item or there is at least one enemy within 260 units.
- **Order:** checked at position 2 of 10, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When I can afford my next item and no enemy is in sight, I head home to shop.

### 3. `spend_gold_no_fight` — is this bot carrying more than 300 gold and is an enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot carrying more than 300 gold and is an enemy bearbot in sight?" -- yes means this bot has more than 300 gold and at least one enemy bearbot is within 260 units; no means this bot has 300 or less gold or no enemy bearbots are within 260 units.
- **Order:** checked at position 3 of 10, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I'm carrying more than 300 gold and an enemy bearbot is in sight, I don't start the fight: I go home and spend it.
  > If an enemy bearbot is in sight, I go after whichever enemy is worth the most gold.

### 4. `back_off_tower_no_minions` — can this bot see an enemy tower and are none of its minions near it?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are none of its minions near it?" -- yes means at least one enemy tower is within 390 units and there are no allied minions within 260 units; no means no enemy tower is within 390 units or at least one allied minion is within 260 units.
- **Order:** checked at position 4 of 10, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > If one of theirs is dead and my minions are near me, I push the nearest enemy tower with the wave.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 5. `use_chord_lowest_hp` — is the chord ability ready and is an enemy bearbot in sight?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the chord ability ready and is an enemy bearbot in sight?" -- yes means chord cooldown is 0 seconds and at least one enemy bearbot is within 260 units; no means chord cooldown is greater than 0 seconds or no enemy bearbots are within 260 units.
- **Order:** checked at position 5 of 10, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.

### 6. `attack_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means at least one enemy bearbot is within 260 units; no means no enemy bearbots are within 260 units.
- **Order:** checked at position 6 of 10, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `push_tower_wave_near` — is an enemy bearbot dead and are minions near this bot?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot dead and are minions near this bot?" -- yes means at least one enemy bearbot is dead and at least one allied minion is within 260 units; no means all enemy bearbots are alive or no allied minions are within 260 units.
- **Order:** checked at position 7 of 10, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `attack_tower_minions_near` — can this bot see an enemy tower and are at least two of its minions near it?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are at least two of its minions near it?" -- yes means at least one enemy tower is within 390 units and at least two allied minions are within 260 units; no means no enemy tower is within 390 units or fewer than two allied minions are within 260 units.
- **Order:** checked at position 8 of 10, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 9. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means at least one enemy minion is within 260 units; no means no enemy minions are within 260 units.
- **Order:** checked at position 9 of 10, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 10. `walk_with_minion_or_home` — are there minions near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there minions near this bot?" -- yes means at least one allied minion is within 260 units; no means no allied minions are within 260 units.
- **Order:** checked at position 10 of 10, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "Violin: Amp, then Bass Strings, then Road Case."; "Drums: Road Case, then Bass Strings, then Metronome."; "Violin: when staccato is ready and an enemy bearbot has less than half its hp, I…"; "Drums: when kick is ready and an enemy bearbot is right next to me, I kick the n…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Violin: Amp, then Bass Strings, then Road Case.
> Drums: Road Case, then Bass Strings, then Metronome.
> Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.
> Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave, and we spend our gold before we risk it.
> Our shopping lists, in order: Keytar: Metronome, then Amp, then Road Case.
> Nothing matters more than that.


---

# Transparency report: `C:/Users/willa/.claude/scratch/jev-recheck-vocab2/compile/src/sample-entrant-eco.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot carrying more than 300 gold and is an enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bot's hp below a third of its max? | **recall** home |
| 3 | — | can this bot afford its next item AND is no enemy in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is an enemy tower visible AND are none of my minions near me? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is staccato ready AND is an enemy bearbot visible with less than half its hp? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 7 | — | is an enemy bearbot dead AND are my minions near me? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| 8 | — | is an enemy tower visible AND are at least two of my minions near me? | **attack** targeting: the nearest visible enemy tower or nexus |
| 9 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 10 | — | is there a minion near me? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 11 | — | is there no minion near me? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Amp → Bass Strings → Road Case (from your prose)

## Rule detail

### 1. `guard_shop_priority` — is this bot carrying more than 300 gold and is an enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot carrying more than 300 gold and is an enemy bearbot in sight?" -- yes means carrying >300 gold AND enemy bearbot visible; no means not carrying >300 gold OR no enemy bearbot visible.
- **Order:** checked first (position 1 of 11) -- this is the order the translator produced.
- **From your prose:**
  > If I'm carrying more than 300 gold and an enemy bearbot is in sight, I don't start the fight: I go home and spend it.
  > If an enemy bearbot is in sight, I go after whichever enemy is worth the most gold.

### 2. `recall_low_hp` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means hp < 33% of max; no means hp >= 33% of max.
- **Order:** checked at position 2 of 11, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 3. `shop_if_ready` — can this bot afford its next item AND is no enemy in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford its next item AND is no enemy in sight?" -- yes means afford next item AND no enemies visible; no means cannot afford next item OR enemies visible.
- **Order:** checked at position 3 of 11, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When I can afford my next item and no enemy is in sight, I head home to shop.

### 4. `back_off_tower` — is an enemy tower visible AND are none of my minions near me?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are none of my minions near me?" -- yes means enemy tower visible AND no nearby minions; no means no enemy tower visible OR at least one minion nearby.
- **Order:** checked at position 4 of 11, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > If one of theirs is dead and my minions are near me, I push the nearest enemy tower with the wave.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 5. `staccato_low_hp` — is staccato ready AND is an enemy bearbot visible with less than half its hp?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is staccato ready AND is an enemy bearbot visible with less than half its hp?" -- yes means staccato ready AND enemy bearbot < 50% hp; no means staccato not ready OR no enemy bearbot < 50% hp.
- **Order:** checked at position 5 of 11, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.

### 6. `hunt_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 6 of 11, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `push_tower_wave` — is an enemy bearbot dead AND are my minions near me?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot dead AND are my minions near me?" -- yes means enemy dead AND minions nearby; no means enemy alive OR no minions nearby.
- **Order:** checked at position 7 of 11, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `attack_tower_wave` — is an enemy tower visible AND are at least two of my minions near me?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two of my minions near me?" -- yes means enemy tower visible AND >=2 minions nearby; no means no enemy tower visible OR <2 minions nearby.
- **Order:** checked at position 8 of 11, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 9. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 9 of 11, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 10. `walk_with_wave` — is there a minion near me?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a minion near me?" -- yes means minion nearby; no means no minion nearby.
- **Order:** checked at position 10 of 11, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 11. `go_home_wait` — is there no minion near me?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no minion near me?" -- yes means no minion nearby; no means minion nearby.
- **Order:** checked at position 11 of 11, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "Keytar: Metronome, then Amp, then Road Case."; "Drums: Road Case, then Bass Strings, then Metronome."; "Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on th…"; "Drums: when kick is ready and an enemy bearbot is right next to me, I kick the n…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Keytar: Metronome, then Amp, then Road Case.
> Drums: Road Case, then Bass Strings, then Metronome.
> Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.
> Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave, and we spend our gold before we risk it.
> Our shopping lists, in order: Violin: Amp, then Bass Strings, then Road Case.
> Nothing matters more than that.

