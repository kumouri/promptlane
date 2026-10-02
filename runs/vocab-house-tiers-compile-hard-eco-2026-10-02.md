# Jev compile preview: `C:/Users/willa/workspace/scratch/vocab-house-tiers/r3/compile/src/house-hard-eco.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 7 model call(s), 37,706 tokens of a 60,000-token cap, $0.0000, 149.0 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

Vocabulary: `vocab-2` -- the facts Jev is told about the game each decision and the targets a rule can name. A compiled schema always plays under the vocabulary it was compiled in.

Items and shopping lists follow the `eco-3-late` ruleset.

- **drums**: 16 rules -- ⚠ 3 rule(s) with no clear source sentence; 3 rule-like sentence(s) that compiled to nothing
- **keytar**: ✗ not compiled -- the translator could not produce a valid schema for keytar: translation failed after 3 attempts: unbalanced JSON object in model output: '{\n  "rules": [\n    {\n      "id": "recall_low_hp_enemy_present",\n      "condition": "is this bot\'s hp below 50% of its max AND is an enemy minion OR enemy tower OR enemy bearbot in sight?",\n      "criteria": {\n        "true": "hp < 50% and at least one enemy (minion/tower/bearbot) is visible",\n      '
- **violin**: ✗ not compiled -- the translator could not produce a valid schema for violin: translation failed after 3 attempts: unbalanced JSON object in model output: '{\n  "rules": [\n    {\n      "id": "recall_hp_low_enemy_present",\n      "condition": "is this bot\'s hp below 50% of its max AND is an enemy minion, enemy tower, or enemy bearbot in sight?",\n      "criteria": {\n        "true": "hp < 50% and at least one enemy entity (minion/tower/bearbot) is visible",\n'

---

# Transparency report: `C:/Users/willa/workspace/scratch/vocab-house-tiers/r3/compile/src/house-hard-eco.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 50% of its max AND is an enemy minion OR enemy tower OR enemy bearbot in sight? | **move** targeting: move to this bearbot's own home/base position |
| 2 | — | is this bot's hp below 50% of its max AND are there NO enemies in sight? | **recall** home |
| 3 | — | can this bot afford the next item on its shopping list AND is no enemy bearbot in sight AND is an enemy minion OR enemy tower in sight? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | can this bot afford the next item on its shopping list AND is no enemy in sight? | **recall** home |
| 5 | — | does this bot carry at least 300 gold AND is its side weaker in the fight near it? | **move** targeting: move to this bearbot's own home/base position |
| 6 | — | is an enemy bearbot under this bot's own tower? | **attack** targeting: the nearest enemy bearbot standing inside the range of one of this bearbot's own towers (punish a tower dive) |
| 7 | — | is the match time greater than 480 seconds AND is an enemy tower visible? | **attack** targeting: the nearest visible enemy tower or nexus |
| 8 | — | will an enemy tower shoot this bot? | **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower |
| 9 | — | is this bot's primary ability ready AND is an enemy bearbot in sight with less than 100 hp? | use **fill** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 10 | — | is an enemy bearbot in sight with less than 100 hp? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 11 | — | is an enemy tower visible AND is an allied minion near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 12 | — | is this bot's side weaker in the fight near it? | **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower |
| 13 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold) |
| 14 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave) |
| 15 | — | is an allied minion near this bot? | **move** targeting: move to the nearest allied bearbot (stick with a teammate, group up) |
| 16 | — | is there no other rule matching? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Bass Strings → Amp → **Backline** → Metronome → **Wall of Sound** → **Click Track** → **Arpeggiator** (from your prose)

## Rule detail

### 1. `recall_low_hp_enemy_present` — is this bot's hp below 50% of its max AND is an enemy minion OR enemy tower OR enemy bearbot in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max AND is an enemy minion OR enemy tower OR enemy bearbot in sight?" -- yes means hp < 50% and at least one enemy unit visible; no means hp >= 50% or no enemy units visible.
- **Order:** checked first (position 1 of 16) -- this is the order the translator produced.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold before you risk it.
  > When your hp is below 50% of your max hp and an enemy minion, enemy tower or enemy bearbot is in sight, move back home.

### 2. `recall_low_hp_no_enemy` — is this bot's hp below 50% of its max AND are there NO enemies in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 50% of its max AND are there NO enemies in sight?" -- yes means hp < 50% and no enemy units visible; no means hp >= 50% or at least one enemy unit visible.
- **Order:** checked at position 2 of 16, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When your hp is below 50% of your max hp and no enemy is in sight, recall home to heal.

### 3. `shop_afford_no_enemy_enemy_minion_tower` — can this bot afford the next item on its shopping list AND is no enemy bearbot in sight AND is an enemy minion OR enemy tower in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list AND is no enemy bearbot in sight AND is an enemy minion OR enemy tower in sight?" -- yes means affords item, no enemy bearbots, but enemy minions/towers visible; no means cannot afford item OR enemy bearbot in sight OR no enemy minions/towers visible.
- **Order:** checked at position 3 of 16, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list, no enemy bearbot is in sight and an enemy minion or enemy tower is in sight, move back home.

### 4. `shop_afford_no_enemy_at_all` — can this bot afford the next item on its shopping list AND is no enemy in sight?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot afford the next item on its shopping list AND is no enemy in sight?" -- yes means affords item and no enemies visible at all; no means cannot afford item OR at least one enemy visible.
- **Order:** checked at position 4 of 16, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can afford the next item on your shopping list and no enemy is in sight, recall home to buy it.

### 5. `spend_gold_weak_fight` — does this bot carry at least 300 gold AND is its side weaker in the fight near it?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "does this bot carry at least 300 gold AND is its side weaker in the fight near it?" -- yes means gold >= 300 and side is weaker in nearby fight; no means gold < 300 or side is not weaker.
- **Order:** checked at position 5 of 16, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you carry at least 300 gold and your side is weaker in the fight near you, move back home to spend it.
  > If your side is weaker in the fight near you, fall back to your own tower.

### 6. `attack_tower_diver` — is an enemy bearbot under this bot's own tower?

- **Then:** **attack** targeting: the nearest enemy bearbot standing inside the range of one of this bearbot's own towers (punish a tower dive)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot under this bot's own tower?" -- yes means enemy bearbot inside own tower range; no means no enemy bearbot inside own tower range.
- **Order:** checked at position 6 of 16, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot is under your tower, attack the enemy bearbot under your tower.

### 7. `attack_nearest_tower_late_game` — is the match time greater than 480 seconds AND is an enemy tower visible?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the match time greater than 480 seconds AND is an enemy tower visible?" -- yes means time > 480s and enemy tower visible; no means time <= 480s or no enemy tower visible.
- **Order:** checked at position 7 of 16, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If it is more than 480 seconds into the match and you can see an enemy tower, attack the nearest enemy tower.

### 8. `fall_back_enemy_tower_shoots` — will an enemy tower shoot this bot?

- **Then:** **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "will an enemy tower shoot this bot?" -- yes means enemy tower will shoot this bot; no means enemy tower will not shoot this bot.
- **Order:** checked at position 8 of 16, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy tower will shoot you, fall back to your own tower.

### 9. `use_fill_lowest_hp` — is this bot's primary ability ready AND is an enemy bearbot in sight with less than 100 hp?

- **Then:** use **fill** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's primary ability ready AND is an enemy bearbot in sight with less than 100 hp?" -- yes means ability ready and low-hp enemy visible; no means ability not ready or no low-hp enemy visible.
- **Order:** checked at position 9 of 16, only if every rule above it (1..8) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on the enemy bearbot with the lowest hp.

### 10. `attack_lowest_hp` — is an enemy bearbot in sight with less than 100 hp?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight with less than 100 hp?" -- yes means low-hp enemy visible; no means no low-hp enemy visible.
- **Order:** checked at position 10 of 16, only if every rule above it (1..9) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot in sight has less than 100 hp, attack the enemy bearbot with the lowest hp.
  > If an enemy bearbot is in sight, attack the enemy bearbot worth the most gold.

### 11. `attack_nearest_tower_with_minion` — is an enemy tower visible AND is an allied minion near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND is an allied minion near this bot?" -- yes means enemy tower visible and allied minion nearby; no means no enemy tower visible or no allied minion nearby.
- **Order:** checked at position 11 of 16, only if every rule above it (1..10) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower and an allied minion is near you, attack the nearest enemy tower.

### 12. `fall_back_weak_fight` — is this bot's side weaker in the fight near it?

- **Then:** **move** targeting: move to this bearbot's own nearest standing tower, just behind it on the home side (inside its range): fall back to / hold at / defend my tower
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's side weaker in the fight near it?" -- yes means side is weaker in nearby fight; no means side is not weaker.
- **Order:** checked at position 12 of 16, only if every rule above it (1..11) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 13. `attack_highest_bounty` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 13 of 16, only if every rule above it (1..12) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 14. `attack_nearest_enemy_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy MINION closest to this bearbot (farming, clearing their wave)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 14 of 16, only if every rule above it (1..13) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, attack the nearest enemy.

### 15. `move_to_nearest_ally_minion` — is an allied minion near this bot?

- **Then:** **move** targeting: move to the nearest allied bearbot (stick with a teammate, group up)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion near this bot?" -- yes means allied minion nearby; no means no allied minion nearby.
- **Order:** checked at position 15 of 16, only if every rule above it (1..14) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.

### 16. `push_lane_fallback` — is there no other rule matching?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no other rule matching?" -- yes means no other conditions met; no means some other condition met.
- **Order:** checked at position 16 of 16, only if every rule above it (1..15) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "keytar only: Metronome, then Amp, then Road Case, then Click Track, then Bass St…"; "violin only: Amp, then Bass Strings, then Road Case, then Fuzz Pedal, then Metro…"

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> A hit breaks a recall, so get out of reach first.
> Fight under your own tower.
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

> keytar only: Metronome, then Amp, then Road Case, then Click Track, then Bass Strings, then Arpeggiator, then Backline, then Wall of Sound.
> violin only: Amp, then Bass Strings, then Road Case, then Fuzz Pedal, then Metronome, then Feedback, then Tour Bus, then Headliner.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> Your shopping list, in order: drums only: Road Case, then Bass Strings, then Amp, then Backline, then Metronome, then Wall of Sound, then Click Track, then Arpeggiator.
> These come before everything else.
> Punish tower divers.
> Close out the match.
> Never stand in an enemy tower's fire.
> Take the objective.
> Hunt the carrier.

