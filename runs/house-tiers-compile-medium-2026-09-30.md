# Jev compile preview: `prompts/pilots/house-violet.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 7,545 tokens of a 60,000-token cap, $0.0000, 20.7 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

- **drums**: 7 rules -- ⚠ 2 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing
- **keytar**: 7 rules -- ⚠ 2 rule(s) with no clear source sentence
- **violin**: 7 rules -- ⚠ 3 rule(s) with no clear source sentence

---

# Transparency report: `prompts/pilots/house-violet.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 75 of its max? | **recall** home |
| 2 | — | is there a visible enemy tower and are there no allied minions nearby? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is the drum cooldown at zero and is there an enemy bearbot with less than 100 hp? | use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is there a visible enemy bearbot? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | — | is there a visible enemy tower? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | are there allied minions in the wave? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 7 | — | is this a fallback state with no specific target? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

## Rule detail

### 1. `low_hp_retreat` — is this bot's hp below 75 of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 75 of its max?" -- yes means bot is critically low on health; no means bot has sufficient health.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > hp less than 75 -> "kind":"recall" 2.

### 2. `tower_threat_home` — is there a visible enemy tower and are there no allied minions nearby?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy tower and are there no allied minions nearby?" -- yes means tower exists and wave count is zero; no means no tower or minions present.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Enemy towers hit hard (range 160) but shoot minions before bearbots, so you touch a tower only while your wave is there.
  > otherwise wait for the next wave at home: "kind":"move","target":{"x":100,"y":900} Never use fill, glissando or solo.

### 3. `drum_kick_opportunity` — is the drum cooldown at zero and is there an enemy bearbot with less than 100 hp?

- **Then:** use **kick** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the drum cooldown at zero and is there an enemy bearbot with less than 100 hp?" -- yes means cooldown ready and soft target available; no means cooldown active or no soft target.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900}    drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"kick","target":foe 4.

### 4. `engage_foe` — is there a visible enemy bearbot?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy bearbot?" -- yes means an enemy bearbot is present; no means no enemy bearbot is present.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 5. `engage_tower` — is there a visible enemy tower?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy tower?" -- yes means an enemy tower is present; no means no enemy tower is present.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null -> "kind":"attack","target":tower 6.

### 6. `ride_wave` — are there allied minions in the wave?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there allied minions in the wave?" -- yes means at least one allied minion exists; no means no allied minions exist.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Bearbots do not respawn, so you never die for nothing: you ride with your minion wave, you fight what the wave meets, and you leave when you are hurt.
  > foe is null, tower is null and wave is 1 or more -> ride with a violet minion: "kind":"move","target":{"x":<that minion's x>,"y":<that minion's y>} 7.

### 7. `wait_home` — is this a fallback state with no specific target?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this a fallback state with no specific target?" -- yes means no other conditions matched; no means other condition matched.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "3. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord…"; "violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abili…"

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> foe is not null -> "kind":"attack","target":foe 5.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> "attack" walks to the target and keeps hitting it.
> "recall" runs you home and heals you fully.
> Never "hold".

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> 3. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord","target":foe
> violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"staccato","target":foe

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a VIOLET bearbot in the HOUSE BAND, the arena's placement opponent.
> Your enemies are team "green".
> Rules.
> Take the FIRST rule that matches.
> 1.


---

# Transparency report: `prompts/pilots/house-violet.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 75% of its max? | **recall** home |
| 2 | — | is there an enemy tower and no minion wave? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is keytar cooldown 0 and an enemy target exists? | use **chord** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | — | is there an enemy target available? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | — | is there an enemy tower? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | are there allied minions in the wave? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 7 | — | is this a fallback state to wait at home? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

## Rule detail

### 1. `low_hp_retreat` — is this bot's hp below 75% of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 75% of its max?" -- yes means bot is low on health; no means bot has sufficient health.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > hp less than 75 -> "kind":"recall" 2.

### 2. `tower_threat_home` — is there an enemy tower and no minion wave?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy tower and no minion wave?" -- yes means tower present and wave empty; no means no tower or wave exists.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Bearbots do not respawn, so you never die for nothing: you ride with your minion wave, you fight what the wave meets, and you leave when you are hurt.
  > Enemy towers hit hard (range 160) but shoot minions before bearbots, so you touch a tower only while your wave is there.
  > tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900} 3.
  > foe is null, tower is null and wave is 1 or more -> ride with a violet minion: "kind":"move","target":{"x":<that minion's x>,"y":<that minion's y>} 7.

### 3. `chord_ready_attack` — is keytar cooldown 0 and an enemy target exists?

- **Then:** use **chord** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is keytar cooldown 0 and an enemy target exists?" -- yes means cooldown ready and foe visible; no means cooldown active or no foe.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord","target":foe 4.

### 4. `attack_foe` — is there an enemy target available?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy target available?" -- yes means foe is present; no means no foe present.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > foe is not null -> "kind":"attack","target":foe 5.
  > tower is not null -> "kind":"attack","target":tower 6.

### 5. `attack_tower` — is there an enemy tower?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy tower?" -- yes means tower is visible; no means no tower visible.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 6. `ride_wave` — are there allied minions in the wave?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there allied minions in the wave?" -- yes means wave count is 1 or more; no means wave is empty.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `wait_home` — is this a fallback state to wait at home?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this a fallback state to wait at home?" -- yes means no other conditions matched; no means other condition matched.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > otherwise wait for the next wave at home: "kind":"move","target":{"x":100,"y":900} Never use fill, glissando or solo.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abili…"; "drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abilit…"

## Dropped — what did NOT become a rule

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> "attack" walks to the target and keeps hitting it.
> "recall" runs you home and heals you fully.
> Never "hold".

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"staccato","target":foe
> drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"kick","target":foe

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a VIOLET bearbot in the HOUSE BAND, the arena's placement opponent.
> Your enemies are team "green".
> Rules.
> Take the FIRST rule that matches.
> 1.


---

# Transparency report: `prompts/pilots/house-violet.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 75% of its max? | **recall** home |
| 2 | — | is there an enemy tower and no minion wave nearby? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is cooldown zero and foe is a low hp enemy bearbot? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is there a visible enemy target? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | — | is there an enemy tower? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is there at least one allied minion wave? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 7 | — | none | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

## Rule detail

### 1. `low_hp_retreat` — is this bot's hp below 75% of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 75% of its max?" -- yes means bot is critically low on health; no means bot has sufficient health.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > hp less than 75 -> "kind":"recall" 2.

### 2. `tower_threat_home` — is there an enemy tower and no minion wave nearby?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy tower and no minion wave nearby?" -- yes means tower exists and wave count is zero; no means no tower or wave present.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Bearbots do not respawn, so you never die for nothing: you ride with your minion wave, you fight what the wave meets, and you leave when you are hurt.
  > Enemy towers hit hard (range 160) but shoot minions before bearbots, so you touch a tower only while your wave is there.
  > foe is null, tower is null and wave is 1 or more -> ride with a violet minion: "kind":"move","target":{"x":<that minion's x>,"y":<that minion's y>} 7.
  > otherwise wait for the next wave at home: "kind":"move","target":{"x":100,"y":900} Never use fill, glissando or solo.

### 3. `violin_staccato` — is cooldown zero and foe is a low hp enemy bearbot?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is cooldown zero and foe is a low hp enemy bearbot?" -- yes means cooldown ready and target is vulnerable bearbot; no means cooldown active or target not vulnerable.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > tower is not null and wave is 0 -> go home: "kind":"move","target":{"x":100,"y":900}    violin only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"staccato","target":foe 4.

### 4. `engage_foe` — is there a visible enemy target?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy target?" -- yes means foe is present; no means no foe present.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > foe is not null -> "kind":"attack","target":foe 5.
  > tower is not null -> "kind":"attack","target":tower 6.

### 5. `attack_tower` — is there an enemy tower?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy tower?" -- yes means tower exists; no means no tower exists.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 6. `ride_wave` — is there at least one allied minion wave?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there at least one allied minion wave?" -- yes means wave count is one or more; no means no minions present.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `wait_home` — none

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "none" -- yes means all other conditions failed; no means none.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "3. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord…"; "drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"abilit…"

## Dropped — what did NOT become a rule

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> "attack" walks to the target and keeps hitting it.
> "recall" runs you home and heals you fully.
> Never "hold".

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> 3. keytar only: cd is 0 and foe is not null -> "kind":"ability","ability":"chord","target":foe
> drums only: cd is 0 and foe is a bearbot with hp less than 100 -> "kind":"ability","ability":"kick","target":foe

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a VIOLET bearbot in the HOUSE BAND, the arena's placement opponent.
> Your enemies are team "green".
> Rules.
> Take the FIRST rule that matches.
> 1.

