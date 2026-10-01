# Jev compile preview: `prompts/pilots/house-eco-violet.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 9,407 tokens of a 120,000-token cap, $0.0000, 22.0 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

- **drums**: 8 rules -- ⚠ 2 rule(s) with no clear source sentence
- **keytar**: 8 rules -- ⚠ 2 rule(s) with no clear source sentence
- **violin**: 8 rules -- ⚠ 2 rule(s) with no clear source sentence

---

# Transparency report: `prompts/pilots/house-eco-violet.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 75? | **recall** home |
| 2 | — | is the next item affordable (gold >= cost) and no enemy bearbot present? | **recall** home |
| 3 | — | is an enemy tower visible and there are no allied minions? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | are drums ready (cd=0) and a soft target available? | use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is there an enemy bearbot to attack? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is an enemy tower visible? | **attack** targeting: the nearest visible enemy tower or nexus |
| 7 | — | are there allied minions to ride with? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 8 | — | none | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Road Case → Bass Strings → Metronome (from your prose)

## Rule detail

### 1. `low_hp_retreat` — is this bot's hp below 75?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 75?" -- yes means hp < 75; no means hp >= 75.
- **Order:** checked first (position 1 of 8) -- this is the order the translator produced.
- **From your prose:**
  > hp less than 75 -> "kind":"recall" 2.

### 2. `shop_ready` — is the next item affordable (gold >= cost) and no enemy bearbot present?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the next item affordable (gold >= cost) and no enemy bearbot present?" -- yes means gold >= next and foe is null; no means gold < next or foe is not null.
- **Order:** checked at position 2 of 8, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold instead of carrying it: you ride with your minion wave, you fight what the wave meets, you leave when you are hurt, and you go home to shop when you can afford your next item.
  > next is not null, gold is next or more, and foe is null -> go home to shop: "kind":"recall" 3.

### 3. `tower_no_wave` — is an enemy tower visible and there are no allied minions?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible and there are no allied minions?" -- yes means tower is not null and wave is 0; no means tower is null or wave > 0.
- **Order:** checked at position 3 of 8, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Enemy towers hit hard (range 160) but shoot minions before bearbots, so you touch a tower only while your wave is there.
  > foe is null, tower is null and wave is 1 or more -> ride with a violet minion: "kind":"move","target":{"x":<that minion's x>,"y":<that minion's y>} 8.
  > otherwise wait for the next wave at home: "kind":"move","target":{"x":100,"y":900} Never use fill, glissando or solo.

### 4. `drums_kick_soft` — are drums ready (cd=0) and a soft target available?

- **Then:** use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are drums ready (cd=0) and a soft target available?" -- yes means cd is 0 and foe is a bearbot with hp < 100; no means cd > 0 or foe is not a low-hp bearbot.
- **Order:** checked at position 4 of 8, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900}    drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"kick","target":foe 5.

### 5. `attack_foe` — is there an enemy bearbot to attack?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot to attack?" -- yes means foe is not null; no means foe is null.
- **Order:** checked at position 5 of 8, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > foe is not null -> "kind":"attack","target":foe 6.

### 6. `attack_tower` — is an enemy tower visible?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible?" -- yes means tower is not null; no means tower is null.
- **Order:** checked at position 6 of 8, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null -> "kind":"attack","target":tower 7.

### 7. `ride_wave` — are there allied minions to ride with?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there allied minions to ride with?" -- yes means wave is 1 or more; no means wave is 0.
- **Order:** checked at position 7 of 8, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `wait_home` — none

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "none" -- yes means default fallback; no means default fallback.
- **Order:** checked at position 8 of 8, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "keytar only: Metronome, then Amp, then Road Case."; "violin only: Amp, then Bass Strings, then Road Case."; "4. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord…"; "violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abili…"

## Dropped — what did NOT become a rule

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> "attack" walks to the target and keeps hitting it.
> "recall" runs you home and heals you fully, and at home your next items are bought for you.
> Never "hold".

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> keytar only: Metronome, then Amp, then Road Case.
> violin only: Amp, then Bass Strings, then Road Case.
> 4. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord","target":foe
> violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"staccato","target":foe

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a VIOLET bearbot in the HOUSE BAND, the arena's placement opponent, playing the Jam economy.
> Your enemies are team "green".
> Your shopping list, bought in this order at your base: drums only: Road Case, then Bass Strings, then Metronome.
> Rules.
> Take the FIRST rule that matches.
> 1.


---

# Transparency report: `prompts/pilots/house-eco-violet.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 75% of its max? | **recall** home |
| 2 | — | is the next item affordable and no enemy bearbot present? | **recall** home |
| 3 | — | is an enemy tower visible and no minion wave present? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is the chord ability cooldown finished and an enemy bearbot exists? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy bearbot present? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is an enemy tower visible? | **attack** targeting: the nearest visible enemy tower or nexus |
| 7 | — | are there allied minions in the wave? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 8 | — | is the bot at home and no immediate action required? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Metronome → Amp → Road Case (from your prose)

## Rule detail

### 1. `low_hp_retreat` — is this bot's hp below 75% of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 75% of its max?" -- yes means bot is critically low on health; no means bot has sufficient health.
- **Order:** checked first (position 1 of 8) -- this is the order the translator produced.
- **From your prose:**
  > hp less than 75 -> "kind":"recall" 2.

### 2. `shop_ready` — is the next item affordable and no enemy bearbot present?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the next item affordable and no enemy bearbot present?" -- yes means gold >= cost of next item and foe is null; no means cannot afford or has a target.
- **Order:** checked at position 2 of 8, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold instead of carrying it: you ride with your minion wave, you fight what the wave meets, you leave when you are hurt, and you go home to shop when you can afford your next item.
  > next is not null, gold is next or more, and foe is null -> go home to shop: "kind":"recall" 3.
  > foe is not null -> "kind":"attack","target":foe 6.

### 3. `tower_threat` — is an enemy tower visible and no minion wave present?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible and no minion wave present?" -- yes means tower exists and wave count is 0; no means no immediate tower threat or wave present.
- **Order:** checked at position 3 of 8, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Enemy towers hit hard (range 160) but shoot minions before bearbots, so you touch a tower only while your wave is there.
  > tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900} 4.
  > foe is null, tower is null and wave is 1 or more -> ride with a violet minion: "kind":"move","target":{"x":<that minion's x>,"y":<that minion's y>} 8.

### 4. `ability_ready` — is the chord ability cooldown finished and an enemy bearbot exists?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the chord ability cooldown finished and an enemy bearbot exists?" -- yes means cd is 0 and foe is not null; no means ability on cooldown or no target.
- **Order:** checked at position 4 of 8, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord","target":foe 5.

### 5. `attack_target` — is an enemy bearbot present?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot present?" -- yes means foe is not null; no means no enemy bearbot present.
- **Order:** checked at position 5 of 8, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 6. `tower_attack` — is an enemy tower visible?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible?" -- yes means tower is not null; no means no enemy tower visible.
- **Order:** checked at position 6 of 8, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null -> "kind":"attack","target":tower 7.

### 7. `ride_wave` — are there allied minions in the wave?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there allied minions in the wave?" -- yes means wave count is 1 or more; no means no allied minions present.
- **Order:** checked at position 7 of 8, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `wait_home` — is the bot at home and no immediate action required?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the bot at home and no immediate action required?" -- yes means bot is waiting for next wave; no means other conditions apply.
- **Order:** checked at position 8 of 8, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > otherwise wait for the next wave at home: "kind":"move","target":{"x":100,"y":900} Never use fill, glissando or solo.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "drums only: Road Case, then Bass Strings, then Metronome."; "violin only: Amp, then Bass Strings, then Road Case."; "violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abili…"; "drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abilit…"

## Dropped — what did NOT become a rule

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> "attack" walks to the target and keeps hitting it.
> "recall" runs you home and heals you fully, and at home your next items are bought for you.
> Never "hold".

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> drums only: Road Case, then Bass Strings, then Metronome.
> violin only: Amp, then Bass Strings, then Road Case.
> violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"staccato","target":foe
> drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"kick","target":foe

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a VIOLET bearbot in the HOUSE BAND, the arena's placement opponent, playing the Jam economy.
> Your enemies are team "green".
> Your shopping list, bought in this order at your base: keytar only: Metronome, then Amp, then Road Case.
> Rules.
> Take the FIRST rule that matches.
> 1.


---

# Transparency report: `prompts/pilots/house-eco-violet.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 75? | **recall** home |
| 2 | — | is the next item affordable and no enemy bearbot present? | **recall** home |
| 3 | — | is an enemy tower present and no allied minions nearby? | **move** targeting: move to this bearbot's own home/base position |
| 4 | — | is the violin ability ready and a low-hp enemy bearbot present? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is there an enemy bearbot present? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 6 | — | is an enemy tower present? | **attack** targeting: the nearest visible enemy tower or nexus |
| 7 | — | are allied minions present to ride with? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 8 | — | none | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Amp → Bass Strings → Road Case (from your prose)

## Rule detail

### 1. `low_hp_retreat` — is this bot's hp below 75?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 75?" -- yes means hp < 75; no means hp >= 75.
- **Order:** checked first (position 1 of 8) -- this is the order the translator produced.
- **From your prose:**
  > hp less than 75 -> "kind":"recall" 2.

### 2. `shop_ready_home` — is the next item affordable and no enemy bearbot present?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the next item affordable and no enemy bearbot present?" -- yes means gold >= next cost AND foe is null; no means gold < next cost OR foe is not null.
- **Order:** checked at position 2 of 8, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > A bearbot that dies comes back after a few seconds, but half of the gold it carries goes to the bots that killed it, so you spend your gold instead of carrying it: you ride with your minion wave, you fight what the wave meets, you leave when you are hurt, and you go home to shop when you can afford your next item.
  > next is not null, gold is next or more, and foe is null -> go home to shop: "kind":"recall" 3.

### 3. `tower_no_wave_retreat` — is an enemy tower present and no allied minions nearby?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower present and no allied minions nearby?" -- yes means tower is not null AND wave is 0; no means tower is null OR wave > 0.
- **Order:** checked at position 3 of 8, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Enemy towers hit hard (range 160) but shoot minions before bearbots, so you touch a tower only while your wave is there.
  > foe is null, tower is null and wave is 1 or more -> ride with a violet minion: "kind":"move","target":{"x":<that minion's x>,"y":<that minion's y>} 8.
  > otherwise wait for the next wave at home: "kind":"move","target":{"x":100,"y":900} Never use fill, glissando or solo.

### 4. `violin_staccato_opener` — is the violin ability ready and a low-hp enemy bearbot present?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the violin ability ready and a low-hp enemy bearbot present?" -- yes means cd is 0 AND foe is a bearbot with hp < 100; no means cd > 0 OR foe is not a bearbot or foe hp >= 100.
- **Order:** checked at position 4 of 8, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900}    violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"staccato","target":foe 5.

### 5. `attack_lowest_hp` — is there an enemy bearbot present?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot present?" -- yes means foe is not null; no means foe is null.
- **Order:** checked at position 5 of 8, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > foe is not null -> "kind":"attack","target":foe 6.

### 6. `attack_tower` — is an enemy tower present?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower present?" -- yes means tower is not null; no means tower is null.
- **Order:** checked at position 6 of 8, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null -> "kind":"attack","target":tower 7.

### 7. `ride_wave` — are allied minions present to ride with?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are allied minions present to ride with?" -- yes means wave is 1 or more; no means wave is 0.
- **Order:** checked at position 7 of 8, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 8. `wait_home` — none

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "none" -- yes means all other conditions failed; no means some condition matched.
- **Order:** checked at position 8 of 8, only if every rule above it (1..7) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 4 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "drums only: Road Case, then Bass Strings, then Metronome."; "keytar only: Metronome, then Amp, then Road Case."; "4. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord…"; "drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abilit…"

## Dropped — what did NOT become a rule

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> "attack" walks to the target and keeps hitting it.
> "recall" runs you home and heals you fully, and at home your next items are bought for you.
> Never "hold".

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> drums only: Road Case, then Bass Strings, then Metronome.
> keytar only: Metronome, then Amp, then Road Case.
> 4. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord","target":foe
> drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"kick","target":foe

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a VIOLET bearbot in the HOUSE BAND, the arena's placement opponent, playing the Jam economy.
> Your enemies are team "green".
> Your shopping list, bought in this order at your base: violin only: Amp, then Bass Strings, then Road Case.
> Rules.
> Take the FIRST rule that matches.
> 1.

