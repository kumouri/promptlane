# Jev compile preview: `prompts/pilots/drums.md`

Compiled by promptlane's prose-to-schema translator with `ollama:qwen3.5:9b` -- 1 model call(s), 1,676 tokens of a 60,000-token cap, $0.0000, 18.6 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately.

- **drums**: 5 rules -- ⚠ 2 rule(s) with no clear source sentence; 2 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `drums.md` -> Jev decision schema (drums)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

## Quick view

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is there an enemy bearbot threatening a low-hp ally? | **attack** targeting: the enemy nearest to this bearbot's own lowest-hp ally |
| 3 | is an enemy bearbot within melee range? | use **kick** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | are multiple enemy bearbots bunched up near this bot? | use **fill** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 5 | is a fight currently active? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `critical_health_retreat` — is this bot's hp below a quarter of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a quarter of its max?" -- yes means bot hp < 0.25 * max_hp; no means bot hp >= 0.25 * max_hp.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `threatened_ally_engage` — is there an enemy bearbot threatening a low-hp ally?

- **Then:** **attack** targeting: the enemy nearest to this bearbot's own lowest-hp ally
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an enemy bearbot threatening a low-hp ally?" -- yes means exists enemy bearbot nearest to this bot's lowest-hp ally; no means no such enemy exists.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > When an enemy gets close to an ally, that enemy is now your problem.
  > Attack whatever's nearest and threatening an ally first, the nearest enemy bearbot second, minions last.

### 3. `melee_kick` — is an enemy bearbot within melee range?

- **Then:** use **kick** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is an enemy bearbot within melee range?" -- yes means enemy bearbot distance <= melee_range; no means enemy bearbot distance > melee_range.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Kick (taunt/knockback, short range) is your favorite word. Use it the instant an enemy bearbot is close enough to touch — on cooldown, always, no hesitation, no overthinking.

### 4. `aoe_fill` — are multiple enemy bearbots bunched up near this bot?

- **Then:** use **fill** targeting: the visible enemy with the most other enemies near it (an AoE target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are multiple enemy bearbots bunched up near this bot?" -- yes means count(enemy bearbots within AoE_range) >= 2; no means count(enemy bearbots within AoE_range) < 2.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Fill (AoE slow) is for when more than one of them is bunched up near you; drop it under their feet, not yours.

### 5. `general_push` — is a fight currently active?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is a fight currently active?" -- yes means active combat detected (attacks occurring); no means no active combat detected.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Push the lane. march toward the enemy nexus alongside your minions unless a fight has started — then the fight is the lane.
> Retreat only when you're really hurt — below a quarter health —

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> Walk in front. Take the hits meant for someone else.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a bearbot on the drums. You are the beat everyone else plays over — if you drop out, the whole band falls apart. You are slow and you are heavy and that is the point.
> Your job is not to win the fight. Your job is to BE the fight, so your squishier allies don't have to be.
> because your whole reason for existing is to be the thing that's still standing when the smoke clears. A drummer who recalls too early let the band down.

