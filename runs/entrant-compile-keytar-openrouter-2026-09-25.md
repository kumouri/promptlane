# Jev compile preview: `prompts/pilots/keytar.md`

Compiled by promptlane's prose-to-schema translator with `openrouter:qwen/qwen3.5-9b` -- 1 model call(s), 1,499 tokens of a 60,000-token cap, $0.0002, 4.7 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately.

- **keytar**: 5 rules -- ⚠ 2 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `keytar.md` -> Jev decision schema (keytar)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

## Quick view

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is a visible enemy inside melee range of this bot? | use **glissando** |
| 3 | is a visible enemy inside attack range but not melee range of this bot? | use **glissando** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | is there a densest cluster of enemies or minions visible? | use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 5 | is no enemy inside attack range of this bot? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `low_health_recall` — is this bot's hp below a quarter of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a quarter of its max?" -- yes means hp < 25% of max; no means hp >= 25% of max.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:**
  > Recall the moment you're below a quarter health, no exceptions —

### 2. `panic_glissando` — is a visible enemy inside melee range of this bot?

- **Then:** use **glissando**
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is a visible enemy inside melee range of this bot?" -- yes means enemy distance <= melee range; no means enemy distance > melee range.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 3. `engage_glissando` — is a visible enemy inside attack range but not melee range of this bot?

- **Then:** use **glissando** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is a visible enemy inside attack range but not melee range of this bot?" -- yes means enemy distance > melee range AND <= attack range; no means enemy distance > attack range OR <= melee range.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Never be the closest thing to an enemy. If a visible enemy is inside your attack range, that is too close; if one is inside melee range of you, you are already losing and should be leaving.
  > Glissando (short dash, no target needed) is your panic button and your opener both: dash OUT when something gets close, dash IN-range-but-not-close when you want a Chord angle you don't have yet.
  > When a real fight starts, Chord first, basic-attack second, never melee.

### 4. `aoe_chord` — is there a densest cluster of enemies or minions visible?

- **Then:** use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a densest cluster of enemies or minions visible?" -- yes means densest cluster exists; no means no densest cluster.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Chord (AoE burst, long range) is your headline move — throw it at the densest cluster of enemies or minions you can see the instant it's off cooldown,

### 5. `lane_push` — is no enemy inside attack range of this bot?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is no enemy inside attack range of this bot?" -- yes means no enemies in attack range; no means at least one enemy in attack range.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> Poke minion waves with your basic attack while nothing else demands attention

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> don't wait for a "perfect" moment, waiting is how it goes to waste.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a bearbot on the keytar. Loud, flashy, and made of paper — you win fights from a distance or you don't win them at all.
> Your whole game is standing just outside their reach while they cannot stand outside yours.
> — free damage, free lane pressure, no risk from that range.
> you have no way to survive a follow-up hit and a dead mage is a silent one.

