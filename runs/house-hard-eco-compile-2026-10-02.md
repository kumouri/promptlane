# Jev compile preview: `prompts/pilots/house-hard-eco.prose.md, without its Bandstand paragraph`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 11,210 tokens of a 60,000-token cap, $0.0000, 56.6 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

- **drums**: 13 rules -- ⚠ 3 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing
- **keytar**: 13 rules -- ⚠ 5 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing
- **violin**: 13 rules -- ⚠ 2 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `prompts/pilots/house-hard-eco.prose.md, without its Bandstand paragraph` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower, or enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bot's hp below 50% of its max hp and is no enemy in sight? | **recall** home |
| 3 | — | can this bot afford the next item on its shopping list and is an enemy minion or enemy tower in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | can this bot afford the next item on its shopping list and is no enemy in sight? | **recall** home |
| 5 | — | does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot? | **move** targeting: move to this bearbot's own home/base position |
| 6 | — | is it more than 480 seconds into the match and is an enemy tower in sight? | **attack** targeting: the nearest visible enemy tower or nexus |
| 7 | — | is an enemy tower in sight and is there no allied minion near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 8 | — | is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp? | use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 9 | — | is an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 10 | — | is an enemy tower in sight and is an allied minion near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 11 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 12 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 13 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Bass Strings → Amp (from your prose)

## Rule detail

### 1. `recall_low_hp_threat` — is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower, or enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower, or enemy bearbot in sight?" -- yes means low hp with threat in sight; no means not low hp or no threat in sight.
- **Order:** checked first (position 1 of 13) -- this is the order the translator produced.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > When your hp is below 50% of your max hp and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.

### 2. `recall_low_hp_safe` — is this bot's hp below 50% of its max hp and is no enemy in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max hp and is no enemy in sight?" -- yes means low hp with no threat in sight; no means not low hp or threat present.
- **Order:** checked at position 2 of 13, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 50% of your max hp and no enemy is in sight, recall home to heal.

### 3. `shop_home_threat` — can this bot afford the next item on its shopping list and is an enemy minion or enemy tower in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and is an enemy minion or enemy tower in sight?" -- yes means affordable item with minion/tower threat; no means cannot afford item or no minion/tower threat.
- **Order:** checked at position 3 of 13, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list, no enemy bearbot is in sight and an enemy minion or enemy tower is in sight, move back home.
  > If you can see an enemy tower and there is no allied minion near you, move back home.

### 4. `shop_home_safe` — can this bot afford the next item on its shopping list and is no enemy in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and is no enemy in sight?" -- yes means affordable item with no threat; no means cannot afford item or threat present.
- **Order:** checked at position 4 of 13, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list and no enemy is in sight, recall home to buy it.

### 5. `spend_gold_low_hp` — does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot?" -- yes means high gold vs low hp enemy; no means low gold or enemy has less/equal hp.
- **Order:** checked at position 5 of 13, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you carry at least 300 gold and an enemy bearbot in sight has more hp than you, move back home to spend it.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 6. `attack_tower_late_game` — is it more than 480 seconds into the match and is an enemy tower in sight?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is it more than 480 seconds into the match and is an enemy tower in sight?" -- yes means late game with tower visible; no means early game or no tower visible.
- **Order:** checked at position 6 of 13, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If it is more than 480 seconds into the match and you can see an enemy tower, attack the nearest enemy tower.

### 7. `retreat_alone_tower` — is an enemy tower in sight and is there no allied minion near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower in sight and is there no allied minion near this bot?" -- yes means tower visible alone; no means no tower or ally nearby.
- **Order:** checked at position 7 of 13, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 8. `finish_kill_low_hp` — is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp?

- **Then:** use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp?" -- yes means ability ready vs low hp enemy; no means ability not ready or no low hp enemy.
- **Order:** checked at position 8 of 13, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 9. `attack_low_hp_no_ability` — is an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp?" -- yes means low hp enemy present; no means no low hp enemy.
- **Order:** checked at position 9 of 13, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.

### 10. `attack_tower_with_minion` — is an enemy tower in sight and is an allied minion near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower in sight and is an allied minion near this bot?" -- yes means tower visible with ally nearby; no means no tower or no ally nearby.
- **Order:** checked at position 10 of 13, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and an allied minion is near you, attack the nearest enemy tower.
  > If an enemy minion is in sight, attack the nearest enemy.

### 11. `hunt_carrier` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 11 of 13, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 12. `attack_nearest_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 12 of 13, only if every rule above it (1..11) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 13. `move_to_minion` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means ally minion nearby; no means no ally minion nearby.
- **Order:** checked at position 13 of 13, only if every rule above it (1..12) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "keytar only: Metronome, then Amp, then Road Case."; "violin only: Amp, then Bass Strings, then Road Case."

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A hit breaks a recall, so get out of reach first.
> Your fallback, when none of the above applies, is to push down your lane toward the enemy base.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's hard bearbot, playing the Jam economy: you play to take towers, to finish kills and to hunt the enemy worth the most gold.
> Recall with discipline.
> Go shopping, out of reach.
> Never carry a fortune into a fight you can lose.
> Finish kills.

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> keytar only: Metronome, then Amp, then Road Case.
> violin only: Amp, then Bass Strings, then Road Case.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: drums only: Road Case, then Bass Strings, then Amp.
> These come before everything else.
> Close out the match.
> Take the objective.
> Hunt the carrier.


---

# Transparency report: `prompts/pilots/house-hard-eco.prose.md, without its Bandstand paragraph` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower, or enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bot's hp below 50% of its max hp and are no enemies in sight? | **recall** home |
| 3 | — | can this bot afford the next item on its shopping list and is an enemy bearbot not in sight while an enemy minion or tower is in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | can this bot afford the next item on its shopping list and are no enemies in sight? | **recall** home |
| 5 | — | does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot? | **move** targeting: move to this bearbot's own home/base position |
| 6 | — | is it more than 480 seconds into the match and is an enemy tower visible? | **attack** targeting: the nearest visible enemy tower or nexus |
| 7 | — | is an enemy tower visible and is there no allied minion near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 8 | — | is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 9 | — | is an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 10 | — | is an enemy tower visible and is an allied minion near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 11 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 12 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 13 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Metronome → Amp → Road Case (from your prose)

## Rule detail

### 1. `recall_low_hp_threat` — is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower, or enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower, or enemy bearbot in sight?" -- yes means low hp with threat in sight; no means safe or high hp.
- **Order:** checked first (position 1 of 13) -- this is the order the translator produced.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > When your hp is below 50% of your max hp and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.
  > When your hp is below 50% of your max hp and no enemy is in sight, recall home to heal.

### 2. `recall_low_hp_safe` — is this bot's hp below 50% of its max hp and are no enemies in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max hp and are no enemies in sight?" -- yes means low hp with no threat; no means safe or high hp.
- **Order:** checked at position 2 of 13, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 3. `buy_home_threat` — can this bot afford the next item on its shopping list and is an enemy bearbot not in sight while an enemy minion or tower is in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and is an enemy bearbot not in sight while an enemy minion or tower is in sight?" -- yes means affordable, safe from bears, threat present; no means cannot afford or bears present.
- **Order:** checked at position 3 of 13, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list, no enemy bearbot is in sight and an enemy minion or enemy tower is in sight, move back home.
  > If you can afford the next item on your shopping list and no enemy is in sight, recall home to buy it.
  > If you can see an enemy tower and there is no allied minion near you, move back home.

### 4. `buy_home_safe` — can this bot afford the next item on its shopping list and are no enemies in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and are no enemies in sight?" -- yes means affordable, completely safe; no means cannot afford or threats present.
- **Order:** checked at position 4 of 13, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 5. `spend_gold_home` — does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot?" -- yes means rich, vulnerable to bear; no means poor or safe from bears.
- **Order:** checked at position 5 of 13, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you carry at least 300 gold and an enemy bearbot in sight has more hp than you, move back home to spend it.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 6. `attack_tower_late` — is it more than 480 seconds into the match and is an enemy tower visible?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is it more than 480 seconds into the match and is an enemy tower visible?" -- yes means late game with tower sight; no means early game or no tower sight.
- **Order:** checked at position 6 of 13, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If it is more than 480 seconds into the match and you can see an enemy tower, attack the nearest enemy tower.

### 7. `retreat_from_tower` — is an enemy tower visible and is there no allied minion near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible and is there no allied minion near this bot?" -- yes means tower sight, alone; no means tower sight, with minion.
- **Order:** checked at position 7 of 13, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 8. `finish_kill_low_hp` — is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp?" -- yes means ability up, soft target present; no means no ability or no soft target.
- **Order:** checked at position 8 of 13, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 9. `attack_low_hp` — is an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp?" -- yes means soft target present; no means no soft target.
- **Order:** checked at position 9 of 13, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.

### 10. `attack_tower_with_minion` — is an enemy tower visible and is an allied minion near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible and is an allied minion near this bot?" -- yes means tower sight, with minion; no means no tower or no minion.
- **Order:** checked at position 10 of 13, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and an allied minion is near you, attack the nearest enemy tower.
  > If an enemy minion is in sight, attack the nearest enemy.

### 11. `hunt_carrier` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot present; no means no enemy bearbot.
- **Order:** checked at position 11 of 13, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 12. `attack_minion_or_nearest` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion present; no means no enemy minion.
- **Order:** checked at position 12 of 13, only if every rule above it (1..11) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 13. `push_with_minion` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means allied minion nearby; no means no allied minion nearby.
- **Order:** checked at position 13 of 13, only if every rule above it (1..12) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "drums only: Road Case, then Bass Strings, then Amp."; "violin only: Amp, then Bass Strings, then Road Case."

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A hit breaks a recall, so get out of reach first.
> Your fallback, when none of the above applies, is to push down your lane toward the enemy base.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's hard bearbot, playing the Jam economy: you play to take towers, to finish kills and to hunt the enemy worth the most gold.
> Recall with discipline.
> Go shopping, out of reach.
> Never carry a fortune into a fight you can lose.
> Finish kills.

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> drums only: Road Case, then Bass Strings, then Amp.
> violin only: Amp, then Bass Strings, then Road Case.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: keytar only: Metronome, then Amp, then Road Case.
> These come before everything else.
> Close out the match.
> Take the objective.
> Hunt the carrier.


---

# Transparency report: `prompts/pilots/house-hard-eco.prose.md, without its Bandstand paragraph` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower or enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bot's hp below 50% of its max hp and is no enemy in sight? | **recall** home |
| 3 | — | can this bot afford the next item on its shopping list and is no enemy bearbot in sight and is an enemy minion or enemy tower in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | can this bot afford the next item on its shopping list and is no enemy in sight? | **recall** home |
| 5 | — | does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot? | **move** targeting: move to this bearbot's own home/base position |
| 6 | — | is it more than 480 seconds into the match and can this bot see an enemy tower? | **attack** targeting: the nearest visible enemy tower or nexus |
| 7 | — | can this bot see an enemy tower and is there no allied minion near it? | **move** targeting: move to this bearbot's own home/base position |
| 8 | — | is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 9 | — | is an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 10 | — | can this bot see an enemy tower and is an allied minion near it? | **attack** targeting: the nearest visible enemy tower or nexus |
| 11 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 12 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 13 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Amp → Bass Strings → Road Case (from your prose)

## Rule detail

### 1. `low_hp_enemy_present` — is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower or enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max hp and is an enemy minion, enemy tower or enemy bearbot in sight?" -- yes means hp < 50% and enemy unit visible; no means hp >= 50% or no enemy unit visible.
- **Order:** checked first (position 1 of 13) -- this is the order the translator produced.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > When your hp is below 50% of your max hp and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.
  > Never stand at an enemy tower alone.

### 2. `low_hp_no_enemy_present` — is this bot's hp below 50% of its max hp and is no enemy in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max hp and is no enemy in sight?" -- yes means hp < 50% and no enemy visible; no means hp >= 50% or enemy visible.
- **Order:** checked at position 2 of 13, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 50% of your max hp and no enemy is in sight, recall home to heal.

### 3. `afford_item_no_enemy_home` — can this bot afford the next item on its shopping list and is no enemy bearbot in sight and is an enemy minion or enemy tower in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and is no enemy bearbot in sight and is an enemy minion or enemy tower in sight?" -- yes means item affordable, no bearbot enemy, other enemy unit visible; no means cannot afford item OR bearbot enemy present OR no other enemy unit.
- **Order:** checked at position 3 of 13, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list, no enemy bearbot is in sight and an enemy minion or enemy tower is in sight, move back home.

### 4. `afford_item_no_enemy_recall` — can this bot afford the next item on its shopping list and is no enemy in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list and is no enemy in sight?" -- yes means item affordable and no enemies visible; no means cannot afford item OR enemies visible.
- **Order:** checked at position 4 of 13, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list and no enemy is in sight, recall home to buy it.

### 5. `spend_gold_before_fight` — does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold and is an enemy bearbot in sight with more hp than this bot?" -- yes means gold >= 300 and visible bearbot enemy has higher hp; no means gold < 300 or no such bearbot enemy.
- **Order:** checked at position 5 of 13, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you carry at least 300 gold and an enemy bearbot in sight has more hp than you, move back home to spend it.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 6. `late_game_tower_attack` — is it more than 480 seconds into the match and can this bot see an enemy tower?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is it more than 480 seconds into the match and can this bot see an enemy tower?" -- yes means time > 480s and enemy tower visible; no means time <= 480s or no enemy tower visible.
- **Order:** checked at position 6 of 13, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If it is more than 480 seconds into the match and you can see an enemy tower, attack the nearest enemy tower.

### 7. `avoid_alone_at_tower` — can this bot see an enemy tower and is there no allied minion near it?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and is there no allied minion near it?" -- yes means enemy tower visible and no nearby ally minion; no means no enemy tower or nearby ally minion present.
- **Order:** checked at position 7 of 13, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and there is no allied minion near you, move back home.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 8. `finish_kill_low_hp` — is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready and is an enemy bearbot in sight with less than 100 hp?" -- yes means ability ready and visible bearbot enemy has < 100 hp; no means ability not ready or no such bearbot enemy.
- **Order:** checked at position 8 of 13, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 9. `attack_lowest_hp_no_ability` — is an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp?" -- yes means visible bearbot enemy has < 100 hp; no means no such bearbot enemy.
- **Order:** checked at position 9 of 13, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.

### 10. `attack_tower_with_minion` — can this bot see an enemy tower and is an allied minion near it?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot see an enemy tower and is an allied minion near it?" -- yes means enemy tower visible and nearby ally minion present; no means no enemy tower or no nearby ally minion.
- **Order:** checked at position 10 of 13, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and an allied minion is near you, attack the nearest enemy tower.

### 11. `hunt_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means visible bearbot enemy present; no means no visible bearbot enemy.
- **Order:** checked at position 11 of 13, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 12. `attack_nearest_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means visible enemy minion present; no means no visible enemy minion.
- **Order:** checked at position 12 of 13, only if every rule above it (1..11) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 13. `move_to_minion_wave` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means nearby ally minion present; no means no nearby ally minion.
- **Order:** checked at position 13 of 13, only if every rule above it (1..12) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "drums only: Road Case, then Bass Strings, then Amp."; "keytar only: Metronome, then Amp, then Road Case."

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A hit breaks a recall, so get out of reach first.
> Your fallback, when none of the above applies, is to push down your lane toward the enemy base.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's hard bearbot, playing the Jam economy: you play to take towers, to finish kills and to hunt the enemy worth the most gold.
> Recall with discipline.
> Go shopping, out of reach.
> Never carry a fortune into a fight you can lose.
> Finish kills.

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> drums only: Road Case, then Bass Strings, then Amp.
> keytar only: Metronome, then Amp, then Road Case.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: violin only: Amp, then Bass Strings, then Road Case.
> These come before everything else.
> Close out the match.
> Take the objective.
> Hunt the carrier.

