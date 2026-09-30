# Jev compile preview: `prompts/pilots/house-easy.prose.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 3 model call(s), 6,048 tokens of a 60,000-token cap, $0.0000, 18.6 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately.

- **drums**: 5 rules -- ⚠ 1 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing
- **keytar**: 5 rules -- ⚠ 1 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing
- **violin**: 5 rules -- ⚠ 1 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `prompts/pilots/house-easy.prose.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 100? | **recall** home |
| 2 | — | is an enemy tower or nexus visible? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is an enemy bearbot or minion visible? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | — | is an allied minion visible? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 5 | — | is there no allied minion visible? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `low_hp_recall` — is this bot's hp below 100?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 100?" -- yes means hp is below 100; no means hp is 100 or above.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 100, recall home to heal.

### 2. `enemy_tower_sight` — is an enemy tower or nexus visible?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower or nexus visible?" -- yes means an enemy tower or nexus is visible; no means no enemy tower or nexus is visible.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower or the enemy nexus, move back home.

### 3. `enemy_in_sight` — is an enemy bearbot or minion visible?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot or minion visible?" -- yes means an enemy bearbot or minion is visible; no means no enemy bearbot or minion is visible.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot or enemy minion is in sight, attack the nearest enemy.

### 4. `stay_with_minion` — is an allied minion visible?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion visible?" -- yes means an allied minion is visible; no means no allied minion is visible.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When nothing is in sight, stay with your own minion wave: move to the nearest allied minion.
  > If there is no allied minion either, go home and wait there.

### 5. `go_home_wait` — is there no allied minion visible?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no allied minion visible?" -- yes means no allied minion is visible; no means an allied minion is visible.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Fight only what comes to you.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's easy bearbot: a careful player who defends and never takes a risk.
> Retreat early.
> Never go near an enemy tower.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You would rather give up ground than lose a bearbot, because a bearbot that dies never comes back.
> This comes before everything else.


---

# Transparency report: `prompts/pilots/house-easy.prose.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 100? | **recall** home |
| 2 | — | is an enemy tower or enemy nexus visible? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is an enemy bearbot or enemy minion in sight? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | — | is an allied minion in sight? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 5 | — | is there no allied minion in sight? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `hp_low_recall` — is this bot's hp below 100?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 100?" -- yes means hp is below 100; no means hp is 100 or higher.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 100, recall home to heal.

### 2. `enemy_tower_sight` — is an enemy tower or enemy nexus visible?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower or enemy nexus visible?" -- yes means an enemy tower or nexus is visible; no means no enemy tower or nexus is visible.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower or the enemy nexus, move back home.

### 3. `enemy_in_sight` — is an enemy bearbot or enemy minion in sight?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot or enemy minion in sight?" -- yes means an enemy bearbot or minion is visible; no means no enemies are visible.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot or enemy minion is in sight, attack the nearest enemy.

### 4. `minion_present` — is an allied minion in sight?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an allied minion in sight?" -- yes means an allied minion is visible; no means no allied minion is visible.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When nothing is in sight, stay with your own minion wave: move to the nearest allied minion.
  > If there is no allied minion either, go home and wait there.

### 5. `no_minion_home` — is there no allied minion in sight?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no allied minion in sight?" -- yes means no allied minion is present; no means an allied minion is present.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Fight only what comes to you.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's easy bearbot: a careful player who defends and never takes a risk.
> Retreat early.
> Never go near an enemy tower.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You would rather give up ground than lose a bearbot, because a bearbot that dies never comes back.
> This comes before everything else.


---

# Transparency report: `prompts/pilots/house-easy.prose.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

*Your prose was split into sentences and sorted into rule / advisory / voice automatically, by a word list -- not by a person. If a sentence below is filed under the wrong heading, trust your own reading; what matters is whether each instruction you meant shows up as a rule.*

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below 100? | **recall** home |
| 2 | — | is an enemy tower or enemy nexus visible? | **move** targeting: move to this bearbot's own home/base position |
| 3 | — | is an enemy bearbot or enemy minion visible? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | — | is there an allied minion visible? | **move** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 5 | — | is there no allied minion visible? | **move** targeting: move to this bearbot's own home/base position |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `low_hp_recall` — is this bot's hp below 100?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below 100?" -- yes means hp is below 100; no means hp is 100 or above.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:**
  > When your hp is below 100, recall home to heal.

### 2. `enemy_tower_sight` — is an enemy tower or enemy nexus visible?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy tower or enemy nexus visible?" -- yes means an enemy tower or nexus is visible; no means no enemy tower or nexus is visible.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If you can see an enemy tower or the enemy nexus, move back home.

### 3. `enemy_in_sight` — is an enemy bearbot or enemy minion visible?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot or enemy minion visible?" -- yes means an enemy unit is in sight; no means no enemy unit is in sight.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > If an enemy bearbot or enemy minion is in sight, attack the nearest enemy.

### 4. `stay_with_minion` — is there an allied minion visible?

- **Then:** **move** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an allied minion visible?" -- yes means an allied minion is visible; no means no allied minion is visible.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When nothing is in sight, stay with your own minion wave: move to the nearest allied minion.
  > If there is no allied minion either, go home and wait there.

### 5. `go_home_wait` — is there no allied minion visible?

- **Then:** **move** targeting: move to this bearbot's own home/base position
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no allied minion visible?" -- yes means no allied minion is visible; no means an allied minion is visible.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Fight only what comes to you.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> You are the house band's easy bearbot: a careful player who defends and never takes a risk.
> Retreat early.
> Never go near an enemy tower.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You would rather give up ground than lose a bearbot, because a bearbot that dies never comes back.
> This comes before everything else.

