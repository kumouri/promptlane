# Jev compile preview: `prompts/pilots/violin.md`

Compiled by promptlane's prose-to-schema translator with `openrouter:qwen/qwen3.5-9b` -- 1 model call(s), 1,521 tokens of a 60,000-token cap, $0.0002, 2.8 s.

At the jam your prose is not run by a chat model: it is compiled once into the rule cascade below, and Jev answers each rule's yes/no question every decision. Translation is sampled, so compiling the same prose twice can differ a little -- wording that compiles the same way every time is wording that will play the way you meant.

One prompt drives all three of your bearbots, so each instrument is compiled separately.

- **violin**: 5 rules -- ⚠ 2 rule(s) with no clear source sentence; 1 rule-like sentence(s) that compiled to nothing

---

# Transparency report: `violin.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

## Quick view

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's current HP below 25% of its max HP? | **recall** home |
| 2 | is there exactly one isolated enemy bearbot visible? | **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| 3 | is the selected target within staccato range and staccato is off cooldown? | use **staccato** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| 4 | is the selected target escaping and solo is off cooldown? | use **solo** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| 5 | are there no immediate fights or recalls needed? | **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| — | *(none of the above)* | **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |

## Rule detail

### 1. `low_hp_recall` — is this bot's current HP below 25% of its max HP?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's current HP below 25% of its max HP?" -- yes means HP is critically low; no means HP is 25% or higher.
- **Order:** checked first (position 1 of 5) -- this is the order the translator produced.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 2. `engage_isolated` — is there exactly one isolated enemy bearbot visible?

- **Then:** **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there exactly one isolated enemy bearbot visible?" -- yes means One enemy is alone and far from others; no means No single isolated enemy exists.
- **Order:** checked at position 2 of 5, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Do not walk into a fight straight-on. Wait at the edge of what you can see until exactly one enemy is isolated — alone, or clearly the softest target in a group — then commit fully.

### 3. `staccato_attack` — is the selected target within staccato range and staccato is off cooldown?

- **Then:** use **staccato** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the selected target within staccato range and staccato is off cooldown?" -- yes means Target is in range and ability is ready; no means Target is out of range or ability is on cooldown.
- **Order:** checked at position 3 of 5, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Staccato (quick high-damage stab, short range) is your opener on whoever you've picked as the target — use it the moment you're in range of them, every time it's off cooldown, on that same target if they're still alive.

### 4. `solo_chase` — is the selected target escaping and solo is off cooldown?

- **Then:** use **solo** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is the selected target escaping and solo is off cooldown?" -- yes means Target is fleeing and ability is ready; no means Target is not fleeing or ability is on cooldown.
- **Order:** checked at position 4 of 5, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Solo (burst + speed, your ultimate) is for closing distance on a target that's about to get away, or for the decisive engage when the moment is right —

### 5. `reposition_next` — are there no immediate fights or recalls needed?

- **Then:** **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "are there no immediate fights or recalls needed?" -- yes means No active engagement or low HP state; no means Active fight or low HP state.
- **Order:** checked at position 5 of 5, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

### Looked like a rule, but no translated rule traces back to it — check this by hand

this reads like a bounded rule (a threshold, a presence check, or a target selection) but no translated rule's wording overlaps with it enough to trace back to it -- either the translator merged it into another rule's condition without it showing here, or it was dropped outright. Worth checking by hand.

> You have less HP than almost anything else on the map — the instant you drop under a quarter health, recall, no matter how close the kill looked.

### Advisory prose Jev's question types structurally can't take

decision-relevant prose that doesn't reduce to a condition on state or a bounded choice (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this content structurally cannot become a rule.

> you only take fights you can win in one phrase.
> it is not free, so don't burn it just because it's up.
> Between fights, don't stand still: your speed exists so you can keep repositioning toward the next isolated target rather than sitting in a lane pushing minions like a bruiser would.

### Voice / tone — no decision content

identity, tone, or in-character justification -- zero decision content. Removing it would not change what action the bot picks; it's the entrant's voice, not their strategy.

> You are a bearbot on the violin. The bow is the blade. You are fast, you are fragile, and you exist to end one enemy before the rest of their band can even turn around.
> A violin that trades evenly with a whole team has already failed;
> A dead assassin secures nothing.

