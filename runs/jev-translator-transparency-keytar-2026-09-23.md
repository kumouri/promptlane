# Transparency report: `keytar.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's current health below a quarter of its max health? | **recall** home |
| 2 | — | is there a visible enemy within melee range of this bot? | use **glissando** |
| 3 | — | is there a visible enemy cluster or minion wave within attack range? | use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 4 | — | is there a minion wave within basic attack range and no immediate threat? | **attack** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 5 | — | is there no immediate threat and the bot is not at home? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `recall_low_hp` — is this bot's current health below a quarter of its max health?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's current health below a quarter of its max health?" -- yes means this bot's hp is less than 25% of its max hp; no means this bot's hp is greater than or equal to 25% of its max hp.
- **Order:** moved to position 1 of 5 by the automatic priority guard -- the prose uses unconditional-override language for this rule, so it is checked before every other rule regardless of where the translator originally placed it (see the note below).
- **From your prose:**
  > Recall the moment you're below a quarter health, no exceptions —

### 2. `panic_dash_out` — is there a visible enemy within melee range of this bot?

- **Then:** use **glissando**
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy within melee range of this bot?" -- yes means a visible enemy is inside the bot's melee attack range; no means no visible enemy is inside the bot's melee attack range.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never be the closest thing to an enemy. If a visible enemy is inside your attack range, that is too close; if one is inside melee range of you, you are already losing and should be leaving.
  > Glissando (short dash, no target needed) is your panic button and your opener both: dash OUT when something gets close, dash IN-range-but-not-close when you want a Chord angle you don't have yet.
  > When a real fight starts, Chord first, basic-attack second, never melee.

### 3. `engage_cluster` — is there a visible enemy cluster or minion wave within attack range?

- **Then:** use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy cluster or minion wave within attack range?" -- yes means there is a densest cluster of enemies or minions visible and reachable; no means no dense cluster of enemies or minions is currently reachable.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Chord (AoE burst, long range) is your headline move — throw it at the densest cluster of enemies or minions you can see the instant it's off cooldown,

### 4. `poke_lane` — is there a minion wave within basic attack range and no immediate threat?

- **Then:** **attack** targeting: the nearest allied minion in the wave (for riding/positioning with it)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a minion wave within basic attack range and no immediate threat?" -- yes means a minion wave is in range and the bot is not under threat; no means no minion wave is in range or the bot is under threat.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Poke minion waves with your basic attack while nothing else demands attention

### 5. `advance_lane` — is there no immediate threat and the bot is not at home?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no immediate threat and the bot is not at home?" -- yes means no enemy is within melee range and the bot is not currently moving to base; no means an enemy is within melee range or the bot is already moving to base.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Automatic priority fixes applied to this schema

- priority guard: promoted rule(s) recall_low_hp to the top of the cascade -- the prose uses unconditional-override language for them (no exceptions) but the translator placed them lower, where an earlier rule could pre-empt them.

## Dropped — what did NOT become a rule

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> don't wait for a "perfect" moment, waiting is how it goes to waste.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a bearbot on the keytar. Loud, flashy, and made of paper — you win fights from a distance or you don't win them at all.
> Your whole game is standing just outside their reach while they cannot stand outside yours.
> — free damage, free lane pressure, no risk from that range.
> you have no way to survive a follow-up hit and a dead mage is a silent one.

