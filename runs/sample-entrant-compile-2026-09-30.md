# Jev compile preview: `prompts/pilots/sample-entrant.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 7,881 tokens of a 120,000-token cap, $0.0000, 30.1 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately. A line that starts `keytar only:` (or `violin only:`, `drums only:`, `Keytar:`...) is compiled only for the instrument it names.

- **drums**: 7 rules -- ⚠ 1 rule(s) with no clear source sentence
- **keytar**: 7 rules -- ⚠ 1 rule(s) with no clear source sentence
- **violin**: 7 rules -- ⚠ 1 rule(s) with no clear source sentence

---

# Transparency report: `prompts/pilots/sample-entrant.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a third of its max? | **recall** home |
| 2 | — | is an enemy tower visible AND are no minions near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is the 'kick' ability ready AND is an enemy bearbot within melee range? | use **kick** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | — | is an enemy bearbot visible? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy tower visible AND are at least two minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is an enemy minion visible? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 7 | — | are any minions near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Road Case → Bass Strings → Metronome (default for drums — your prose names no items)

## Rule detail

### 1. `low_hp_recall` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means hp is less than one-third of max hp; no means hp is one-third or more of max hp.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 2. `tower_no_minions_backoff` — is an enemy tower visible AND are no minions near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are no minions near this bot?" -- yes means enemy tower is visible and no allied minion is nearby; no means no enemy tower is visible OR at least one allied minion is nearby.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 3. `kick_ready_near_enemy` — is the 'kick' ability ready AND is an enemy bearbot within melee range?

- **Then:** use **kick** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the 'kick' ability ready AND is an enemy bearbot within melee range?" -- yes means kick is ready and an enemy bearbot is adjacent; no means kick is not ready OR no enemy bearbot is adjacent.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### 4. `attack_lowest_hp_bearbot` — is an enemy bearbot visible?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot visible?" -- yes means at least one enemy bearbot is visible; no means no enemy bearbot is visible.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot is in sight, I attack the enemy bearbot with the lowest hp.

### 5. `attack_tower_with_minions` — is an enemy tower visible AND are at least two minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two minions near this bot?" -- yes means enemy tower is visible and two or more allied minions are nearby; no means no enemy tower is visible OR fewer than two allied minions are nearby.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 6. `attack_enemy_minion` — is an enemy minion visible?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion visible?" -- yes means at least one enemy minion is visible; no means no enemy minion is visible.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 7. `walk_with_minion_or_home` — are any minions near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are any minions near this bot?" -- yes means at least one allied minion is nearby; no means no allied minion is nearby.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the drums schema (each is compiled only for the instrument it names): "Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on th…"; "Violin: when staccato is ready and an enemy bearbot has less than half its hp, I…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.
> Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave.
> Nothing matters more than that.


---

# Transparency report: `prompts/pilots/sample-entrant.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a third of its max? | **recall** home |
| 2 | — | is an enemy tower visible AND are no minions near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is the chord ability ready AND is an enemy bearbot in sight? | use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is an enemy bearbot in sight? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy tower visible AND are at least two minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is an enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 7 | — | are there any minions near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move to this bearbot's own home/base position |

Shopping list: Metronome → Amp → Road Case (default for keytar — your prose names no items)

## Rule detail

### 1. `low_hp_recall` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means hp is critically low (below 33%); no means hp is above or equal to 33%.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 2. `tower_backoff` — is an enemy tower visible AND are no minions near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are no minions near this bot?" -- yes means enemy tower seen, no nearby allies; no means no enemy tower or at least one minion nearby.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 3. `chord_cast` — is the chord ability ready AND is an enemy bearbot in sight?

- **Then:** use **chord** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the chord ability ready AND is an enemy bearbot in sight?" -- yes means ability ready and target exists; no means ability not ready or no target.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.

### 4. `basic_attack_bearbot` — is an enemy bearbot in sight?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot in sight?" -- yes means enemy bearbot visible; no means no enemy bearbot visible.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot is in sight, I attack the enemy bearbot with the lowest hp.

### 5. `attack_tower` — is an enemy tower visible AND are at least two minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two minions near this bot?" -- yes means tower seen with 2+ allies nearby; no means conditions not met.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 6. `attack_minion` — is an enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion in sight?" -- yes means enemy minion visible; no means no enemy minion visible.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 7. `default_move` — are there any minions near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there any minions near this bot?" -- yes means at least one minion nearby; no means no minions nearby.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the keytar schema (each is compiled only for the instrument it names): "Violin: when staccato is ready and an enemy bearbot has less than half its hp, I…"; "Drums: when kick is ready and an enemy bearbot is right next to me, I kick the n…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.
> Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave.
> Nothing matters more than that.


---

# Transparency report: `prompts/pilots/sample-entrant.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a third of its max? | **recall** home |
| 2 | — | is an enemy tower visible AND are no allied minions near this bot? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is staccato ready AND is there an enemy bearbot with less than half its max hp? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | — | is an enemy bearbot visible? | **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 5 | — | is an enemy tower visible AND are at least two allied minions near this bot? | **attack** targeting: the nearest visible enemy tower or nexus |
| 6 | — | is an enemy minion visible? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 7 | — | are there any allied minions near this bot? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

Shopping list: Amp → Bass Strings → Road Case (default for violin — your prose names no items)

## Rule detail

### 1. `low_hp_recall` — is this bot's hp below a third of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a third of its max?" -- yes means hp is critically low (below 33% max); no means hp is above or equal to 33% max.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > When my hp drops below a third of my max, I recall home to heal.

### 2. `tower_backoff` — is an enemy tower visible AND are no allied minions near this bot?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are no allied minions near this bot?" -- yes means enemy tower seen but isolated from allies; no means no enemy tower seen OR at least one ally minion is nearby.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and none of my minions are near me, I back off home instead of tanking the tower alone.
  > Otherwise I walk with my nearest minion, and if I have no minions near me I go home and wait for the next wave.

### 3. `staccato_ready` — is staccato ready AND is there an enemy bearbot with less than half its max hp?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is staccato ready AND is there an enemy bearbot with less than half its max hp?" -- yes means ability ready and a vulnerable enemy exists; no means ability not ready OR no vulnerable enemy exists.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Violin: when staccato is ready and an enemy bearbot has less than half its hp, I play staccato on the enemy with the lowest hp.

### 4. `attack_lowest_bearbot` — is an enemy bearbot visible?

- **Then:** **attack** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot visible?" -- yes means at least one enemy bearbot is in sight; no means no enemy bearbots are in sight.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot is in sight, I attack the enemy bearbot with the lowest hp.

### 5. `attack_nearest_tower` — is an enemy tower visible AND are at least two allied minions near this bot?

- **Then:** **attack** targeting: the nearest visible enemy tower or nexus
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower visible AND are at least two allied minions near this bot?" -- yes means tower seen with sufficient minion support; no means no tower seen OR fewer than two minions nearby.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If I can see an enemy tower and at least two of my minions are near me, I attack the nearest enemy tower.

### 6. `attack_nearest_enemy_minion` — is an enemy minion visible?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy minion visible?" -- yes means at least one enemy minion is in sight; no means no enemy minions are in sight.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy minion is in sight, I attack the nearest enemy.

### 7. `walk_with_minion_or_home` — are there any allied minions near this bot?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there any allied minions near this bot?" -- yes means at least one ally minion is nearby; no means no ally minions are nearby.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Instrument scope — what was kept out of this instrument's schema

- instrument scope: 2 clause(s) your prose marks for another instrument were left out of the violin schema (each is compiled only for the instrument it names): "Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on th…"; "Drums: when kick is ready and an enemy bearbot is right next to me, I kick the n…"

## Dropped — what did NOT become a rule

### Marked for another instrument — compiled only for that one

your prose marks this for a different instrument, so it was left out of this instrument's schema before translation (`translator.scope_to_instrument`) -- it is compiled into the schema of the instrument it names, not lost.

> Keytar: when chord is ready and an enemy bearbot is in sight, I play chord on the enemy with the lowest hp.
> Drums: when kick is ready and an enemy bearbot is right next to me, I kick the nearest enemy.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> We are a band that plays together and pushes with the wave.
> Nothing matters more than that.

