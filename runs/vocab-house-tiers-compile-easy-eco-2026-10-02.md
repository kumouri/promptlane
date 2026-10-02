# Jev compile preview: `C:/Users/willa/workspace/scratch/vocab-house-tiers/r3/compile/src/house-easy-eco.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 4 model call(s), 16,955 tokens of a 60,000-token cap, $0.0000, 46.4 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

Vocabulary: `vocab-2` -- the facts Jev is told about the game each decision and the targets a rule can name. A compiled schema always plays under the vocabulary it was compiled in.

Items and shopping lists follow the `eco-3-late` ruleset.

- **drums**: 7 rules -- ⚠ 5 rule(s) with no clear source sentence; 4 rule-like sentence(s) that compiled to nothing
- **keytar**: 6 rules -- ⚠ 3 rule(s) with no clear source sentence; 4 rule-like sentence(s) that compiled to nothing; 1 rule(s) removed for belonging to another instrument
- **violin**: 7 rules -- ⚠ 2 rule(s) with no clear source sentence; 4 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `C:/Users/willa/workspace/scratch/vocab-house-tiers/r3/compile/src/house-easy-eco.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's gold sufficient to buy Road Case, Metronome, Amp, Tour Bus, Bass Strings, Headliner, Fuzz Pedal, or Feedback in that specific order? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bot's hp below 100 and is there an enemy minion, enemy tower, or enemy bearbot within sight? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is this bot's hp below 100 and are there no enemies within sight? | **recall** home |
| 4 | — | is this bot currently inside the range of an enemy tower? | **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower |
| 5 | — | is an enemy bearbot within this bot's attack range? | **attack** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower) |
| 6 | — | is an enemy minion within this bot's attack range? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 7 | — | are there no immediate threats requiring retreat or attack? | **move** targeting: move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Metronome → Amp → **Tour Bus** → Bass Strings → **Headliner** → **Fuzz Pedal** → **Feedback** (from your prose)

## Rule detail

### 1. `shop_order` — is this bot's gold sufficient to buy Road Case, Metronome, Amp, Tour Bus, Bass Strings, Headliner, Fuzz Pedal, or Feedback in that specific order?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's gold sufficient to buy Road Case, Metronome, Amp, Tour Bus, Bass Strings, Headliner, Fuzz Pedal, or Feedback in that specific order?" -- yes means the bot has enough gold and the required items are owned to proceed down the shopping list; no means the bot lacks gold or missing parts for the next item on the shopping list.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `hp_below_100_with_enemy` — is this bot's hp below 100 and is there an enemy minion, enemy tower, or enemy bearbot within sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 100 and is there an enemy minion, enemy tower, or enemy bearbot within sight?" -- yes means the bot has low hp and at least one enemy unit is visible; no means either the bot has high hp or no enemies are visible.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 100 and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.
  > When your hp is below 100 and no enemy is in sight, recall home to heal.
  > If an enemy bearbot is in sight, attack the nearest enemy bearbot.
  > If an enemy minion is in sight, attack the nearest enemy minion.

### 3. `hp_below_100_no_enemy` — is this bot's hp below 100 and are there no enemies within sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 100 and are there no enemies within sight?" -- yes means the bot has low hp and the area is clear of enemies; no means the bot has high hp or enemies are present.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 4. `inside_enemy_tower_range` — is this bot currently inside the range of an enemy tower?

- **Then:** **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot currently inside the range of an enemy tower?" -- yes means the bot is standing in a position where an enemy tower can shoot it; no means the bot is outside all enemy tower ranges.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand inside an enemy tower's range.
  > If you are inside an enemy tower's range, fall back to your own tower.
  > Your fallback, when none of the above applies, is to hold your lane at your own tower: move to the outermost standing tower of your own lane and wait there.

### 5. `attack_bearbot` — is an enemy bearbot within this bot's attack range?

- **Then:** **attack** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot within this bot's attack range?" -- yes means an enemy bearbot is visible and reachable; no means no enemy bearbot is in range.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 6. `attack_minion` — is an enemy minion within this bot's attack range?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion within this bot's attack range?" -- yes means an enemy minion is visible and reachable; no means no enemy minion is in range.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `hold_lane` — are there no immediate threats requiring retreat or attack?

- **Then:** **move** targeting: move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there no immediate threats requiring retreat or attack?" -- yes means the bot is safe and no specific target is prioritized; no means there is a threat or opportunity to engage.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A bearbot that dies comes back after a few seconds, but you would still rather give up ground than die.
> You never go home just to shop: you buy whenever retreating or waiting takes you home anyway.
> A hit breaks a recall, so get out of reach first.
> Fight only what comes to you.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's easy bearbot, playing the Jam economy: a careful player who defends and never takes a risk.
> Retreat early.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list is Road Case first, then Metronome, then Amp, then Tour Bus, then Bass Strings, then Headliner, then Fuzz Pedal, then Feedback.
> These come before everything else.


---

# Transparency report: `C:/Users/willa/workspace/scratch/vocab-house-tiers/r3/compile/src/house-easy-eco.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bearbot's hp below 100 and is there an enemy minion, enemy tower, or enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bearbot's hp below 100 and are there no enemies in sight? | **recall** home |
| 3 | — | is this bearbot inside an enemy tower's range? | **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower |
| 4 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower) |
| 5 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 6 | — | is there no immediate threat or shopping opportunity? | **move** targeting: move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Metronome → Amp → **Tour Bus** → Bass Strings → **Headliner** → **Fuzz Pedal** → **Feedback** (from your prose)

## Rule detail

### 1. `retreat_hp_low_enemy_present` — is this bearbot's hp below 100 and is there an enemy minion, enemy tower, or enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot's hp below 100 and is there an enemy minion, enemy tower, or enemy bearbot in sight?" -- yes means hp < 100% AND (enemy minion OR enemy tower OR enemy bearbot is within attack range); no means hp >= 100% OR no enemies are within attack range.
- **Order:** checked first (position 1 of 6) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 100 and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.
  > If an enemy bearbot is in sight, attack the nearest enemy bearbot.
  > If an enemy minion is in sight, attack the nearest enemy minion.

### 2. `retreat_hp_low_no_enemy` — is this bearbot's hp below 100 and are there no enemies in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot's hp below 100 and are there no enemies in sight?" -- yes means hp < 100% AND no enemy minion, tower, or bearbot is within attack range; no means hp >= 100% OR at least one enemy is within attack range.
- **Order:** checked at position 2 of 6, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 100 and no enemy is in sight, recall home to heal.

### 3. `avoid_enemy_tower_range` — is this bearbot inside an enemy tower's range?

- **Then:** **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot inside an enemy tower's range?" -- yes means the bot is within the attack range of a standing enemy tower; no means the bot is outside the attack range of all enemy towers.
- **Order:** checked at position 3 of 6, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand inside an enemy tower's range.
  > If you are inside an enemy tower's range, fall back to your own tower.
  > Your fallback, when none of the above applies, is to hold your lane at your own tower: move to the outermost standing tower of your own lane and wait there.

### 4. `attack_enemy_bearbot` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means at least one enemy bearbot is within attack range; no means no enemy bearbots are within attack range.
- **Order:** checked at position 4 of 6, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 5. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means at least one enemy minion is within attack range; no means no enemy minions are within attack range.
- **Order:** checked at position 5 of 6, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 6. `hold_lane_fallback` — is there no immediate threat or shopping opportunity?

- **Then:** **move** targeting: move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no immediate threat or shopping opportunity?" -- yes means no enemies in range AND not at base AND hp >= 100%; no means enemies in range OR at base.
- **Order:** checked at position 6 of 6, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: removed rule shop_order -- its action names no ability, not the keytar's (chord/glissando); a keytar bearbot trying it would do nothing that tick. If your prose meant the keytar's own ability, name it.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A bearbot that dies comes back after a few seconds, but you would still rather give up ground than die.
> You never go home just to shop: you buy whenever retreating or waiting takes you home anyway.
> A hit breaks a recall, so get out of reach first.
> Fight only what comes to you.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's easy bearbot, playing the Jam economy: a careful player who defends and never takes a risk.
> Retreat early.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list is Road Case first, then Metronome, then Amp, then Tour Bus, then Bass Strings, then Headliner, then Fuzz Pedal, then Feedback.
> These come before everything else.


---

# Transparency report: `C:/Users/willa/workspace/scratch/vocab-house-tiers/r3/compile/src/house-easy-eco.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bearbot at its base? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bearbot's hp below 100% of max AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is this bearbot's hp below 100% of max AND no enemy is in sight? | **recall** home |
| 4 | — | is this bearbot inside an enemy tower's range? | **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower |
| 5 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower) |
| 6 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 7 | — | is this bearbot's side stronger in the fight near it? | **move** targeting: move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Metronome → Amp → **Tour Bus** → Bass Strings → **Headliner** → **Fuzz Pedal** → **Feedback** (from your prose)

## Rule detail

### 1. `buy_items` — is this bearbot at its base?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot at its base?" -- yes means the bearbot is currently at its base position; no means the bearbot is not at its base position.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `recall_low_hp_enemy_present` — is this bearbot's hp below 100% of max AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot's hp below 100% of max AND (an enemy minion OR an enemy tower OR an enemy bearbot is in sight)?" -- yes means hp < 100% and at least one enemy entity is visible; no means hp >= 100% or no enemies are visible.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 100 and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.

### 3. `recall_low_hp_no_enemy` — is this bearbot's hp below 100% of max AND no enemy is in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot's hp below 100% of max AND no enemy is in sight?" -- yes means hp < 100% and no enemies are visible; no means hp >= 100% or at least one enemy is visible.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 100 and no enemy is in sight, recall home to heal.

### 4. `inside_enemy_tower_range` — is this bearbot inside an enemy tower's range?

- **Then:** **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot inside an enemy tower's range?" -- yes means the bearbot is within the attack range of a standing enemy tower; no means the bearbot is outside all enemy tower ranges.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand inside an enemy tower's range.
  > If you are inside an enemy tower's range, fall back to your own tower.
  > Your fallback, when none of the above applies, is to hold your lane at your own tower: move to the outermost standing tower of your own lane and wait there.

### 5. `attack_enemy_bearbot` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy BEARBOT closest to this bearbot (never a minion or tower)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means at least one enemy bearbot is visible; no means no enemy bearbots are visible.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot is in sight, attack the nearest enemy bearbot.

### 6. `attack_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means at least one enemy minion is visible; no means no enemy minions are visible.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy minion.

### 7. `hold_lane` — is this bearbot's side stronger in the fight near it?

- **Then:** **move** targeting: move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bearbot's side stronger in the fight near it?" -- yes means the local fight verdict is 'your side is stronger'; no means the local fight verdict is not 'your side is stronger'.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A bearbot that dies comes back after a few seconds, but you would still rather give up ground than die.
> You never go home just to shop: you buy whenever retreating or waiting takes you home anyway.
> A hit breaks a recall, so get out of reach first.
> Fight only what comes to you.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's easy bearbot, playing the Jam economy: a careful player who defends and never takes a risk.
> Retreat early.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list is Road Case first, then Metronome, then Amp, then Tour Bus, then Bass Strings, then Headliner, then Fuzz Pedal, then Feedback.
> These come before everything else.

