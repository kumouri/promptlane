# Jev compile preview: `prompts/pilots/house-hard-eco.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 9,391 tokens of a 120,000-token cap, $0.0000, 45.8 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

- **drums**: 10 rules -- ⚠ 2 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing
- **keytar**: 10 rules -- ⚠ 2 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing
- **violin**: 10 rules -- ⚠ 2 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `prompts/pilots/house-hard-eco.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 90? | **recall** home |
| 2 | — | can this bot afford the next item on its shopping list and are no enemy bearbots in sight? | **recall** home |
| 3 | — | does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot? | **recall** home |
| 4 | — | can this bot see an enemy tower and are there no allied minions nearby? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is this bot's primary ability ready and is there an enemy bearbot in sight with less than 100 hp? | use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is there an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 7 | — | can this bot see an enemy tower and are at least two allied minions nearby? | **attack** targeting: the nearest visible enemy tower or nexus |
| 8 | — | is there an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 9 | — | is there an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 10 | — | is there an allied minion nearby? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Road Case → Bass Strings → Amp (from your prose)

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below 90?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 90?" -- yes means hp is critically low (below 90); no means hp is sufficient (90 or above).
- **Order:** checked first (position 1 of 10) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 90 hp, recall home to heal.

### 2. `buy_item` — can this bot afford the next item on its shopping list and are no enemy bearbots in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and are no enemy bearbots in sight?" -- yes means item is affordable and lane is clear of enemies; no means item is unaffordable or an enemy bearbot is visible.
- **Order:** checked at position 2 of 10, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list and no enemy bearbot is in sight, recall home to buy it.

### 3. `spend_gold_safety` — does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot?" -- yes means gold is high (>=300) and a stronger enemy is visible; no means gold is low or the visible enemy is weaker/equal.
- **Order:** checked at position 3 of 10, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > If you carry at least 300 gold and an enemy bearbot in sight has more hp than you, recall home to spend it.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 4. `retreat_from_tower` — can this bot see an enemy tower and are there no allied minions nearby?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are there no allied minions nearby?" -- yes means enemy tower is visible and lane is empty of allies; no means enemy tower is not visible or allies are present.
- **Order:** checked at position 4 of 10, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > If you can see an enemy tower and there is no allied minion near you, move back home.

### 5. `finish_kill_ability` — is this bot's primary ability ready and is there an enemy bearbot in sight with less than 100 hp?

- **Then:** use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready and is there an enemy bearbot in sight with less than 100 hp?" -- yes means ability is charged and a dying enemy exists; no means ability is on cooldown or no dying enemy exists.
- **Order:** checked at position 5 of 10, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 6. `attack_dying_enemy` — is there an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot in sight with less than 100 hp?" -- yes means a dying enemy is visible; no means no dying enemy is visible.
- **Order:** checked at position 6 of 10, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.

### 7. `attack_tower` — can this bot see an enemy tower and are at least two allied minions nearby?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are at least two allied minions nearby?" -- yes means tower is visible and wave support is sufficient (>=2 minions); no means tower not visible or insufficient minion support.
- **Order:** checked at position 7 of 10, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and at least two allied minions are near you, attack the nearest enemy tower.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 8. `hunt_carrier` — is there an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot in sight?" -- yes means an enemy bearbot is visible; no means no enemy bearbot is visible.
- **Order:** checked at position 8 of 10, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 9. `attack_minion` — is there an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy minion in sight?" -- yes means an enemy minion is visible; no means no enemy minion is visible.
- **Order:** checked at position 9 of 10, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 10. `push_wave` — is there an allied minion nearby?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an allied minion nearby?" -- yes means an allied minion is present to ride with; no means no allied minion is immediately nearby.
- **Order:** checked at position 10 of 10, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "keytar only: Metronome, then Amp, then Road Case."; "violin only: Amp, then Bass Strings, then Road Case."

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Your fallback, when none of the above applies, is to go home and wait for the next wave.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's hard bearbot, playing the Jam economy: you play to take towers, to finish kills and to hunt the enemy worth the most gold.
> Recall with discipline.
> Go shopping.
> Never carry a fortune into a fight you can lose.
> Finish kills.
> Never walk toward the enemy nexus without your minions.

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> keytar only: Metronome, then Amp, then Road Case.
> violin only: Amp, then Bass Strings, then Road Case.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: drums only: Road Case, then Bass Strings, then Amp.
> This comes before everything else.
> Take the objective.
> Hunt the carrier.


---

# Transparency report: `prompts/pilots/house-hard-eco.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 90? | **recall** home |
| 2 | — | can this bot afford the next item on its shopping list and is no enemy bearbot in sight? | **recall** home |
| 3 | — | does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot? | **recall** home |
| 4 | — | can this bot see an enemy tower and is there no allied minion near it? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is this bot's primary ability ready and is there an enemy bearbot in sight with less than 100 hp? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is there an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 7 | — | can this bot see an enemy tower and are at least two allied minions near it? | **attack** targeting: the nearest visible enemy tower or nexus |
| 8 | — | is there an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 9 | — | is there an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 10 | — | is there an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Metronome → Amp → Road Case (from your prose)

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below 90?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 90?" -- yes means hp is below 90; no means hp is 90 or above.
- **Order:** checked first (position 1 of 10) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 90 hp, recall home to heal.

### 2. `buy_item_if_safe` — can this bot afford the next item on its shopping list and is no enemy bearbot in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and is no enemy bearbot in sight?" -- yes means affordable item exists and no enemy bearbot visible; no means cannot afford item or enemy bearbot visible.
- **Order:** checked at position 2 of 10, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list and no enemy bearbot is in sight, recall home to buy it.

### 3. `spend_gold_if_weak` — does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold and is there an enemy bearbot in sight with more hp than this bot?" -- yes means carries >= 300 gold and visible enemy has higher hp; no means carries < 300 gold or no visible enemy or visible enemy has lower/equal hp.
- **Order:** checked at position 3 of 10, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > If you carry at least 300 gold and an enemy bearbot in sight has more hp than you, recall home to spend it.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 4. `retreat_from_tower` — can this bot see an enemy tower and is there no allied minion near it?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and is there no allied minion near it?" -- yes means enemy tower visible and no nearby allied minion; no means no enemy tower visible or at least one allied minion nearby.
- **Order:** checked at position 4 of 10, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > If you can see an enemy tower and there is no allied minion near you, move back home.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 5. `finish_kill_ability` — is this bot's primary ability ready and is there an enemy bearbot in sight with less than 100 hp?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready and is there an enemy bearbot in sight with less than 100 hp?" -- yes means ability ready and visible enemy has < 100 hp; no means ability not ready or no visible enemy with < 100 hp.
- **Order:** checked at position 5 of 10, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 6. `finish_kill_attack` — is there an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot in sight with less than 100 hp?" -- yes means visible enemy has < 100 hp; no means no visible enemy or visible enemy has >= 100 hp.
- **Order:** checked at position 6 of 10, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.

### 7. `attack_tower` — can this bot see an enemy tower and are at least two allied minions near it?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and are at least two allied minions near it?" -- yes means enemy tower visible and >= 2 allied minions nearby; no means no enemy tower visible or < 2 allied minions nearby.
- **Order:** checked at position 7 of 10, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and at least two allied minions are near you, attack the nearest enemy tower.

### 8. `hunt_carrier` — is there an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot in sight?" -- yes means at least one enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 8 of 10, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 9. `attack_minion` — is there an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy minion in sight?" -- yes means at least one enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 9 of 10, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 10. `push_with_wave` — is there an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an allied minion near this bot?" -- yes means at least one allied minion nearby; no means no allied minion nearby.
- **Order:** checked at position 10 of 10, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "drums only: Road Case, then Bass Strings, then Amp."; "violin only: Amp, then Bass Strings, then Road Case."

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Your fallback, when none of the above applies, is to go home and wait for the next wave.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's hard bearbot, playing the Jam economy: you play to take towers, to finish kills and to hunt the enemy worth the most gold.
> Recall with discipline.
> Go shopping.
> Never carry a fortune into a fight you can lose.
> Finish kills.
> Never walk toward the enemy nexus without your minions.

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> drums only: Road Case, then Bass Strings, then Amp.
> violin only: Amp, then Bass Strings, then Road Case.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: keytar only: Metronome, then Amp, then Road Case.
> This comes before everything else.
> Take the objective.
> Hunt the carrier.


---

# Transparency report: `prompts/pilots/house-hard-eco.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 90? | **recall** home |
| 2 | — | can this bot afford the next item on its shopping list AND is no enemy bearbot in sight? | **recall** home |
| 3 | — | does this bot carry at least 300 gold AND is there an enemy bearbot in sight with more hp than this bot? | **recall** home |
| 4 | — | is an enemy tower visible AND is there no allied minion near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 5 | — | is this bot's primary ability ready AND is there an enemy bearbot in sight with less than 100 hp? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is there an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 7 | — | is an enemy tower visible AND are at least two allied minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 8 | — | is there an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 9 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 10 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Amp → Bass Strings → Road Case (from your prose)

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below 90?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 90?" -- yes means hp is below 90; no means hp is 90 or above.
- **Order:** checked first (position 1 of 10) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 90 hp, recall home to heal.

### 2. `buy_item_if_safe` — can this bot afford the next item on its shopping list AND is no enemy bearbot in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list AND is no enemy bearbot in sight?" -- yes means affordable and safe (no enemies); no means cannot afford or enemies present.
- **Order:** checked at position 2 of 10, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list and no enemy bearbot is in sight, recall home to buy it.

### 3. `spend_gold_if_weak` — does this bot carry at least 300 gold AND is there an enemy bearbot in sight with more hp than this bot?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold AND is there an enemy bearbot in sight with more hp than this bot?" -- yes means has >=300 gold and faces a stronger enemy; no means gold <300 or no stronger enemy present.
- **Order:** checked at position 3 of 10, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > If you carry at least 300 gold and an enemy bearbot in sight has more hp than you, recall home to spend it.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 4. `retreat_from_tower` — is an enemy tower visible AND is there no allied minion near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND is there no allied minion near this bot?" -- yes means tower seen, alone (no minions); no means no tower or has minions nearby.
- **Order:** checked at position 4 of 10, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > If you can see an enemy tower and there is no allied minion near you, move back home.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 5. `finish_kill_ability` — is this bot's primary ability ready AND is there an enemy bearbot in sight with less than 100 hp?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready AND is there an enemy bearbot in sight with less than 100 hp?" -- yes means ability ready and low-hp enemy present; no means ability not ready or no low-hp enemy.
- **Order:** checked at position 5 of 10, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 6. `finish_kill_attack` — is there an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot in sight with less than 100 hp?" -- yes means low-hp enemy present; no means no low-hp enemy.
- **Order:** checked at position 6 of 10, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.

### 7. `attack_tower` — is an enemy tower visible AND are at least two allied minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two allied minions near this bot?" -- yes means tower seen with 2+ minions; no means no tower or fewer than 2 minions.
- **Order:** checked at position 7 of 10, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and at least two allied minions are near you, attack the nearest enemy tower.

### 8. `hunt_carrier` — is there an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot in sight?" -- yes means enemy bearbot present; no means no enemy bearbot.
- **Order:** checked at position 8 of 10, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 9. `attack_minion_or_enemy` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion present; no means no enemy minion.
- **Order:** checked at position 9 of 10, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 10. `push_with_wave` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means allied minion present; no means no allied minion.
- **Order:** checked at position 10 of 10, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "drums only: Road Case, then Bass Strings, then Amp."; "keytar only: Metronome, then Amp, then Road Case."

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Your fallback, when none of the above applies, is to go home and wait for the next wave.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's hard bearbot, playing the Jam economy: you play to take towers, to finish kills and to hunt the enemy worth the most gold.
> Recall with discipline.
> Go shopping.
> Never carry a fortune into a fight you can lose.
> Finish kills.
> Never walk toward the enemy nexus without your minions.

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> drums only: Road Case, then Bass Strings, then Amp.
> keytar only: Metronome, then Amp, then Road Case.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: violin only: Amp, then Bass Strings, then Road Case.
> This comes before everything else.
> Take the objective.
> Hunt the carrier.

