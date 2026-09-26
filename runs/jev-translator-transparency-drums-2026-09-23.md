# Transparency report: `drums.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

## Quick view

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | — | is an enemy bearbot within melee range of an ally? | use **kick** targeting: the enemy nearest to this bearbot's own lowest-hp ally |
| 3 | — | are multiple enemy bearbots bunched up near this bot? | use **fill** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 4 | — | is there a visible enemy bearbot? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | — | has a fight started? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | — | *(none of the above — root default)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `critical_health_retreat` — is this bot's hp below a quarter of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a quarter of its max?" -- yes means bot hp < 25% of max hp; no means bot hp >= 25% of max hp.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `threatened_ally_taunt` — is an enemy bearbot within melee range of an ally?

- **Then:** use **kick** targeting: the enemy nearest to this bearbot's own lowest-hp ally
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot within melee range of an ally?" -- yes means enemy bearbot is near an ally; no means no enemy bearbot is near an ally.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When an enemy gets close to an ally, that enemy is now your problem.
  > Kick (taunt/knockback, short range) is your favorite word. Use it the instant an enemy bearbot is close enough to touch — on cooldown, always, no hesitation, no overthinking.
  > Attack whatever's nearest and threatening an ally first, the nearest enemy bearbot second, minions last.

### 3. `clustered_enemies_slow` — are multiple enemy bearbots bunched up near this bot?

- **Then:** use **fill** targeting: the visible enemy with the most other enemies near it (an AoE target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are multiple enemy bearbots bunched up near this bot?" -- yes means multiple enemies in close proximity; no means single or no nearby enemies.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Fill (AoE slow) is for when more than one of them is bunched up near you; drop it under their feet, not yours.

### 4. `nearest_enemy_attack` — is there a visible enemy bearbot?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy bearbot?" -- yes means at least one enemy bearbot is visible; no means no enemy bearbots are visible.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 5. `default_lane_push` — has a fight started?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "has a fight started?" -- yes means combat is active; no means no combat is active.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Push the lane. march toward the enemy nexus alongside your minions unless a fight has started — then the fight is the lane.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Retreat only when you're really hurt — below a quarter health —

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> Walk in front. Take the hits meant for someone else.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a bearbot on the drums. You are the beat everyone else plays over — if you drop out, the whole band falls apart. You are slow and you are heavy and that is the point.
> Your job is not to win the fight. Your job is to BE the fight, so your squishier allies don't have to be.
> because your whole reason for existing is to be the thing that's still standing when the smoke clears. A drummer who recalls too early let the band down.

