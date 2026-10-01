# Jev compile preview: `prompts/pilots/sample-entrant-eco.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 9,431 tokens of a 120,000-token cap, $0.0000, 45.2 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

- **drums**: 13 rules -- ⚠ 6 rule(s) with no clear source sentence
- **keytar**: 13 rules -- ⚠ 6 rule(s) with no clear source sentence
- **violin**: 10 rules -- ⚠ 3 rule(s) with no clear source sentence

---

# Transparency report: `prompts/pilots/sample-entrant-eco.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | can this bot afford the Road Case item? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | can this bot afford the Bass Strings item? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | can this bot afford the Metronome item? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is this bot's hp below a third of its max? | **recall** home |
| 5 | — | can this bot afford its next item AND is no enemy in sight? | **move** targeting: move to this bearbot's own home/base position |
| 6 | — | is this bot carrying more than 300 gold AND is an enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 7 | — | is an enemy tower visible AND are none of my minions near me? | **move** targeting: move to this bearbot's own home/base position |
| 8 | — | is the kick ability ready AND is an enemy bearbot right next to me? | use **kick** targeting: the visible enemy (any kind) closest to this bearbot |
| 9 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 10 | — | is at least one enemy bearbot dead AND are my minions near me? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| 11 | — | is an enemy tower visible AND are at least two of my minions near me? | **attack** targeting: the nearest visible enemy tower or nexus |
| 12 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 13 | — | are there any minions near me? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Bass Strings → Metronome (from your prose)

## Rule detail

### 1. `buy_road_case` — can this bot afford the Road Case item?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the Road Case item?" -- yes means bot has enough gold to buy Road Case; no means bot does not have enough gold for Road Case.
- **Order:** checked first (position 1 of 13) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `buy_bass_strings` — can this bot afford the Bass Strings item?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the Bass Strings item?" -- yes means bot has enough gold to buy Bass Strings; no means bot does not have enough gold for Bass Strings.
- **Order:** checked at position 2 of 13, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 3. `buy_metronome` — can this bot afford the Metronome item?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the Metronome item?" -- yes means bot has enough gold to buy Metronome; no means bot does not have enough gold for Metronome.
- **Order:** checked at position 3 of 13, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 4. `recall_low_hp` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means bot hp is less than 33% of max hp; no means bot hp is 33% or more of max hp.
- **Order:** checked at position 4 of 13, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 5. `shop_if_afford_no_enemy` — can this bot afford its next item AND is no enemy in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford its next item AND is no enemy in sight?" -- yes means bot can buy an item and sees no enemies; no means bot cannot buy an item OR sees at least one enemy.
- **Order:** checked at position 5 of 13, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When I can afford my next item and no enemy is in sight, I head home to shop.

### 6. `retreat_if_carrying_and_enemy_sight` — is this bot carrying more than 300 gold AND is an enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot carrying more than 300 gold AND is an enemy bearbot in sight?" -- yes means gold > 300 and enemy bearbot visible; no means gold <= 300 or no enemy bearbot visible.
- **Order:** checked at position 6 of 13, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I'm carrying more than 300 gold and an enemy bearbot is in sight, I don't start the fight: I go home and spend it.
  > If an enemy bearbot is in sight, I go after whichever enemy is worth the most gold.

### 7. `back_off_if_tower_and_no_minions` — is an enemy tower visible AND are none of my minions near me?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are none of my minions near me?" -- yes means enemy tower visible and no allied minions nearby; no means no enemy tower visible OR at least one minion nearby.
- **Order:** checked at position 7 of 13, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > If one of theirs is dead and my minions are near me, I push the nearest enemy tower with the wave.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 8. `kick_ready_and_enemy_adjacent` — is the kick ability ready AND is an enemy bearbot right next to me?

- **Then:** use **kick** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the kick ability ready AND is an enemy bearbot right next to me?" -- yes means kick cooldown finished and enemy bearbot adjacent; no means kick not ready OR no enemy bearbot adjacent.
- **Order:** checked at position 8 of 13, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### 9. `attack_highest_bounty_if_enemy_sight` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means at least one enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 9 of 13, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 10. `push_tower_if_one_dead_and_minions_near` — is at least one enemy bearbot dead AND are my minions near me?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is at least one enemy bearbot dead AND are my minions near me?" -- yes means enemy bearbot dead and allied minions nearby; no means no enemy bearbot dead OR no allied minions nearby.
- **Order:** checked at position 10 of 13, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 11. `attack_tower_if_two_minions_near` — is an enemy tower visible AND are at least two of my minions near me?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two of my minions near me?" -- yes means enemy tower visible and >= 2 allied minions nearby; no means no enemy tower visible OR < 2 allied minions nearby.
- **Order:** checked at position 11 of 13, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 12. `attack_enemy_minion_if_sight` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means at least one enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 12 of 13, only if every rule above it (1..11) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 13. `walk_with_minion_or_home` — are there any minions near me?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there any minions near me?" -- yes means at least one allied minion nearby; no means no allied minions nearby.
- **Order:** checked at position 13 of 13, only if every rule above it (1..12) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "Keytar: buy the Metronome first, then the Amp, then a Road Case."; "Violin: buy the Amp first, then Bass Strings, then a Road Case."; "Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on th…"; "Violin: when staccato is ready and an enemy bearbot has less than half its hp, I…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Keytar: buy the Metronome first, then the Amp, then a Road Case.
> Violin: buy the Amp first, then Bass Strings, then a Road Case.
> Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.
> Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave, and we spend our gold before we risk it.
> Drums: buy a Road Case first, then Bass Strings, then the Metronome.
> Nothing matters more than that.


---

# Transparency report: `prompts/pilots/sample-entrant-eco.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | can this bot afford the Metronome? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | can this bot afford the Amp? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | can this bot afford the Road Case? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is this bot's hp below a third of its max? | **recall** home |
| 5 | — | can this bot afford its next item and are no enemies in sight? | **move** targeting: move to this bearbot's own home/base position |
| 6 | — | is this bot carrying more than 300 gold and is an enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 7 | — | can this bot see an enemy tower and are none of its minions near it? | **move** targeting: move to this bearbot's own home/base position |
| 8 | — | is the chord ability ready and is an enemy bearbot in sight? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 9 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 10 | — | is one of the enemy's minions dead and are some of this bot's minions near it? | **move** targeting: the nearest visible enemy tower or nexus |
| 11 | — | can this bot see an enemy tower and are at least two of its minions near it? | **attack** targeting: the nearest visible enemy tower or nexus |
| 12 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 13 | — | are any of this bot's minions near it? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Metronome → Amp → Road Case (from your prose)

## Rule detail

### 1. `buy_metronome` — can this bot afford the Metronome?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the Metronome?" -- yes means bot has enough gold to buy Metronome; no means bot does not have enough gold to buy Metronome.
- **Order:** checked first (position 1 of 13) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `buy_amp` — can this bot afford the Amp?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the Amp?" -- yes means bot has enough gold to buy Amp; no means bot does not have enough gold to buy Amp.
- **Order:** checked at position 2 of 13, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 3. `buy_road_case` — can this bot afford the Road Case?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the Road Case?" -- yes means bot has enough gold to buy Road Case; no means bot does not have enough gold to buy Road Case.
- **Order:** checked at position 3 of 13, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 4. `recall_low_hp` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means this bot's hp is below one-third of its max hp; no means this bot's hp is at or above one-third of its max hp.
- **Order:** checked at position 4 of 13, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 5. `shop_idle` — can this bot afford its next item and are no enemies in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford its next item and are no enemies in sight?" -- yes means bot can afford next item and no enemy is visible; no means either bot cannot afford next item or an enemy is visible.
- **Order:** checked at position 5 of 13, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When I can afford my next item and no enemy is in sight, I head home to shop.

### 6. `spend_gold_safe` — is this bot carrying more than 300 gold and is an enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot carrying more than 300 gold and is an enemy bearbot in sight?" -- yes means bot has >300 gold and an enemy bearbot is visible; no means bot has <=300 gold or no enemy bearbot is visible.
- **Order:** checked at position 6 of 13, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I'm carrying more than 300 gold and an enemy bearbot is in sight, I don't start the fight: I go home and spend it.
  > If an enemy bearbot is in sight, I go after whichever enemy is worth the most gold.

### 7. `retreat_tower_threat` — can this bot see an enemy tower and are none of its minions near it?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are none of its minions near it?" -- yes means bot sees enemy tower and has no nearby minions; no means bot does not see enemy tower or has at least one nearby minion.
- **Order:** checked at position 7 of 13, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > If one of theirs is dead and my minions are near me, I push the nearest enemy tower with the wave.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 8. `use_chord` — is the chord ability ready and is an enemy bearbot in sight?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the chord ability ready and is an enemy bearbot in sight?" -- yes means chord is ready and an enemy bearbot is visible; no means chord is not ready or no enemy bearbot is visible.
- **Order:** checked at position 8 of 13, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.

### 9. `attack_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means an enemy bearbot is visible; no means no enemy bearbot is visible.
- **Order:** checked at position 9 of 13, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 10. `push_tower_wave_near` — is one of the enemy's minions dead and are some of this bot's minions near it?

- **Then:** **move** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is one of the enemy's minions dead and are some of this bot's minions near it?" -- yes means an enemy minion is dead and bot has nearby minions; no means no enemy minion is dead or bot has no nearby minions.
- **Order:** checked at position 10 of 13, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 11. `attack_tower_wave_near` — can this bot see an enemy tower and are at least two of its minions near it?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are at least two of its minions near it?" -- yes means bot sees enemy tower and has >=2 nearby minions; no means bot does not see enemy tower or has <2 nearby minions.
- **Order:** checked at position 11 of 13, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 12. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means an enemy minion is visible; no means no enemy minion is visible.
- **Order:** checked at position 12 of 13, only if every rule above it (1..11) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 13. `follow_or_home` — are any of this bot's minions near it?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are any of this bot's minions near it?" -- yes means bot has at least one nearby minion; no means bot has no nearby minions.
- **Order:** checked at position 13 of 13, only if every rule above it (1..12) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "Violin: buy the Amp first, then Bass Strings, then a Road Case."; "Drums: buy a Road Case first, then Bass Strings, then the Metronome."; "Violin: when staccato is ready and an enemy bearbot has less than half its hp, I…"; "Drums: when kick is ready and an enemy bearbot is right next to me, I kick the n…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Violin: buy the Amp first, then Bass Strings, then a Road Case.
> Drums: buy a Road Case first, then Bass Strings, then the Metronome.
> Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.
> Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave, and we spend our gold before we risk it.
> Keytar: buy the Metronome first, then the Amp, then a Road Case.
> Nothing matters more than that.


---

# Transparency report: `prompts/pilots/sample-entrant-eco.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a third of its max? | **recall** home |
| 2 | — | can this bot afford its next item AND is no enemy in sight? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is this bot carrying more than 300 gold AND is an enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is an enemy tower visible AND are none of my minions near me? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is staccato ready AND is an enemy bearbot with less than half its hp in sight? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 7 | — | is an enemy tower visible AND are at least two of my minions near me? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| 8 | — | is an enemy tower visible AND are at least two of my minions near me? | **attack** targeting: the nearest visible enemy tower or nexus |
| 9 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 10 | — | are any minions near me? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Amp → Bass Strings → Road Case (from your prose)

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means hp is critically low (below 33% max); no means hp is at or above 33% max.
- **Order:** checked first (position 1 of 10) -- this is the order the translator produced.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 2. `shop_afford_no_threat` — can this bot afford its next item AND is no enemy in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford its next item AND is no enemy in sight?" -- yes means bot has enough gold for an item and vision shows no enemies; no means bot cannot afford item OR at least one enemy is visible.
- **Order:** checked at position 2 of 10, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When I can afford my next item and no enemy is in sight, I head home to shop.

### 3. `spend_gold_safe` — is this bot carrying more than 300 gold AND is an enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot carrying more than 300 gold AND is an enemy bearbot in sight?" -- yes means high gold carry and enemy threat detected; no means low gold carry OR no enemy bearbot visible.
- **Order:** checked at position 3 of 10, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I'm carrying more than 300 gold and an enemy bearbot is in sight, I don't start the fight: I go home and spend it.
  > If an enemy bearbot is in sight, I go after whichever enemy is worth the most gold.

### 4. `retreat_from_tower_alone` — is an enemy tower visible AND are none of my minions near me?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are none of my minions near me?" -- yes means tower sighted but isolated from wave support; no means no tower sighted OR at least one minion is nearby.
- **Order:** checked at position 4 of 10, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > If one of theirs is dead and my minions are near me, I push the nearest enemy tower with the wave.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 5. `staccato_ready` — is staccato ready AND is an enemy bearbot with less than half its hp in sight?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is staccato ready AND is an enemy bearbot with less than half its hp in sight?" -- yes means ability cooldown finished and vulnerable target exists; no means ability on cooldown OR no low-hp target visible.
- **Order:** checked at position 5 of 10, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.

### 6. `hunt_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means at least one enemy bearbot is visible; no means no enemy bearbots are visible.
- **Order:** checked at position 6 of 10, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `push_tower_wave_support` — is an enemy tower visible AND are at least two of my minions near me?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two of my minions near me?" -- yes means tower sighted with sufficient wave support (2+ minions); no means no tower sighted OR fewer than 2 minions nearby.
- **Order:** checked at position 7 of 10, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `attack_tower_wave_support` — is an enemy tower visible AND are at least two of my minions near me?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two of my minions near me?" -- yes means tower sighted with sufficient wave support (2+ minions); no means no tower sighted OR fewer than 2 minions nearby.
- **Order:** checked at position 8 of 10, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 9. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion is visible; no means no enemy minions are visible.
- **Order:** checked at position 9 of 10, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 10. `walk_with_minion_or_home` — are any minions near me?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are any minions near me?" -- yes means at least one minion is nearby; no means no minions are nearby.
- **Order:** checked at position 10 of 10, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "Keytar: buy the Metronome first, then the Amp, then a Road Case."; "Drums: buy a Road Case first, then Bass Strings, then the Metronome."; "Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on th…"; "Drums: when kick is ready and an enemy bearbot is right next to me, I kick the n…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Keytar: buy the Metronome first, then the Amp, then a Road Case.
> Drums: buy a Road Case first, then Bass Strings, then the Metronome.
> Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.
> Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave, and we spend our gold before we risk it.
> Violin: buy the Amp first, then Bass Strings, then a Road Case.
> Nothing matters more than that.

