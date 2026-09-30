# Jev compile preview: `prompts/pilots/house-hard.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 7,654 tokens of a 60,000-token cap, $0.0000, 32.9 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately.

- **drums**: 8 rules -- ⚠ 2 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing
- **keytar**: 8 rules -- ⚠ 2 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing
- **violin**: 8 rules -- ⚠ 2 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `prompts/pilots/house-hard.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 90? | **recall** home |
| 2 | — | is an enemy tower visible AND are there no allied minions near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is an enemy bearbot visible with hp below 100 AND is the primary ability ready? | use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is an enemy bearbot visible with hp below 100? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy tower visible AND are at least two allied minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is an enemy bearbot visible? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 7 | — | is an enemy minion visible? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 8 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below 90?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 90?" -- yes means hp is below 90; no means hp is 90 or above.
- **Order:** checked first (position 1 of 8) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 90 hp, recall home to heal.

### 2. `retreat_from_tower` — is an enemy tower visible AND are there no allied minions near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are there no allied minions near this bot?" -- yes means enemy tower visible and no nearby allied minion; no means no enemy tower visible OR at least one allied minion is nearby.
- **Order:** checked at position 2 of 8, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > If you can see an enemy tower and there is no allied minion near you, move back home.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 3. `finish_kill_ability` — is an enemy bearbot visible with hp below 100 AND is the primary ability ready?

- **Then:** use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot visible with hp below 100 AND is the primary ability ready?" -- yes means enemy bearbot < 100 hp and ability ready; no means no such target or ability not ready.
- **Order:** checked at position 3 of 8, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 4. `finish_kill_attack` — is an enemy bearbot visible with hp below 100?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot visible with hp below 100?" -- yes means enemy bearbot < 100 hp; no means no such target.
- **Order:** checked at position 4 of 8, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.
  > If an enemy bearbot is in sight, attack the enemy bearbot with the lowest hp.

### 5. `take_tower_objective` — is an enemy tower visible AND are at least two allied minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two allied minions near this bot?" -- yes means enemy tower visible and >= 2 nearby allied minions; no means no enemy tower visible OR < 2 nearby allied minions.
- **Order:** checked at position 5 of 8, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and at least two allied minions are near you, attack the nearest enemy tower.

### 6. `attack_any_enemy` — is an enemy bearbot visible?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot visible?" -- yes means enemy bearbot is visible; no means no enemy bearbot is visible.
- **Order:** checked at position 6 of 8, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `attack_any_minion` — is an enemy minion visible?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion visible?" -- yes means enemy minion is visible; no means no enemy minion is visible.
- **Order:** checked at position 7 of 8, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 8. `push_with_wave` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means allied minion is nearby; no means no allied minion is nearby.
- **Order:** checked at position 8 of 8, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> You are the house band's hard bearbot: you play to take towers and to finish kills, and you leave before you die, because a bearbot that dies never comes back.
> Your fallback, when none of the above applies, is to go home and wait for the next wave.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> Recall with discipline.
> Finish kills.
> Never walk toward the enemy nexus without your minions.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> This comes before everything else.
> Take the objective.


---

# Transparency report: `prompts/pilots/house-hard.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 90? | **recall** home |
| 2 | — | is an enemy tower visible AND are there no allied minions near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is an enemy bearbot in sight with less than 100 hp AND is the primary ability ready? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy tower visible AND are at least two allied minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 7 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 8 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below 90?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 90?" -- yes means hp is below 90; no means hp is 90 or above.
- **Order:** checked first (position 1 of 8) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 90 hp, recall home to heal.

### 2. `retreat_tower_alone` — is an enemy tower visible AND are there no allied minions near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are there no allied minions near this bot?" -- yes means enemy tower visible and no nearby allied minion; no means no enemy tower visible OR at least one allied minion is nearby.
- **Order:** checked at position 2 of 8, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > If you can see an enemy tower and there is no allied minion near you, move back home.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 3. `finish_kill_ability` — is an enemy bearbot in sight with less than 100 hp AND is the primary ability ready?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp AND is the primary ability ready?" -- yes means low hp enemy visible and ability ready; no means no low hp enemy visible OR ability not ready.
- **Order:** checked at position 3 of 8, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 4. `attack_low_hp_enemy` — is an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp?" -- yes means low hp enemy visible; no means no low hp enemy visible.
- **Order:** checked at position 4 of 8, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.
  > If an enemy bearbot is in sight, attack the enemy bearbot with the lowest hp.

### 5. `attack_tower_wave_ready` — is an enemy tower visible AND are at least two allied minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two allied minions near this bot?" -- yes means enemy tower visible and >=2 allied minions nearby; no means no enemy tower visible OR <2 allied minions nearby.
- **Order:** checked at position 5 of 8, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and at least two allied minions are near you, attack the nearest enemy tower.

### 6. `attack_any_enemy` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 6 of 8, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `attack_minion_or_fallback` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 7 of 8, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 8. `push_with_wave` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means allied minion nearby; no means no allied minion nearby.
- **Order:** checked at position 8 of 8, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> You are the house band's hard bearbot: you play to take towers and to finish kills, and you leave before you die, because a bearbot that dies never comes back.
> Your fallback, when none of the above applies, is to go home and wait for the next wave.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> Recall with discipline.
> Finish kills.
> Never walk toward the enemy nexus without your minions.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> This comes before everything else.
> Take the objective.


---

# Transparency report: `prompts/pilots/house-hard.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 90? | **recall** home |
| 2 | — | is an enemy tower visible AND are there no allied minions near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is an enemy bearbot in sight with less than 100 hp AND is the primary ability ready? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy tower visible AND are at least two allied minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 7 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 8 | — | is an allied minion near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

## Rule detail

### 1. `recall_low_hp` — is this bot's hp below 90?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 90?" -- yes means hp is below 90; no means hp is 90 or above.
- **Order:** checked first (position 1 of 8) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 90 hp, recall home to heal.

### 2. `retreat_from_tower_alone` — is an enemy tower visible AND are there no allied minions near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are there no allied minions near this bot?" -- yes means enemy tower visible and no nearby allied minion; no means no enemy tower visible OR at least one allied minion is nearby.
- **Order:** checked at position 2 of 8, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never stand at an enemy tower alone.
  > If you can see an enemy tower and there is no allied minion near you, move back home.
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 3. `finish_kill_ability_ready` — is an enemy bearbot in sight with less than 100 hp AND is the primary ability ready?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp AND is the primary ability ready?" -- yes means low-hp enemy present and ability ready; no means no low-hp enemy present OR ability not ready.
- **Order:** checked at position 3 of 8, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 4. `finish_kill_attack_ready` — is an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp?" -- yes means low-hp enemy present; no means no low-hp enemy present.
- **Order:** checked at position 4 of 8, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.
  > If an enemy bearbot is in sight, attack the enemy bearbot with the lowest hp.

### 5. `attack_tower_with_wave` — is an enemy tower visible AND are at least two allied minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two allied minions near this bot?" -- yes means enemy tower visible and >= 2 nearby allied minions; no means no enemy tower visible OR < 2 nearby allied minions.
- **Order:** checked at position 5 of 8, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and at least two allied minions are near you, attack the nearest enemy tower.

### 6. `attack_any_enemy_in_sight` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot present; no means no enemy bearbot present.
- **Order:** checked at position 6 of 8, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `attack_any_enemy_in_sight_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion present; no means no enemy minion present.
- **Order:** checked at position 7 of 8, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 8. `push_with_wave` — is an allied minion near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means allied minion nearby; no means no allied minion nearby.
- **Order:** checked at position 8 of 8, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> You are the house band's hard bearbot: you play to take towers and to finish kills, and you leave before you die, because a bearbot that dies never comes back.
> Your fallback, when none of the above applies, is to go home and wait for the next wave.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> Recall with discipline.
> Finish kills.
> Never walk toward the enemy nexus without your minions.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> This comes before everything else.
> Take the objective.

