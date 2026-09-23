# Transparency report: `violin.md` -> Jev decision schema (violin)

Rules are checked in order; the first one whose condition is true fires. Every rule below shows what it will literally ask Jev, which words in your prose it came from, and why it fires where it does. The **Dropped** section at the end lists everything from your prose that did *not* become a rule, and why.

## Quick view

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is there an isolated enemy bearbot or the softest target in a group within range? | use **staccato** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| 3 | is there a visible enemy bearbot with the lowest hp that is not currently isolated? | use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target) |
| 4 | is a target about to get away or is the decisive moment right? | use **solo** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | is a target within attack range? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| 6 | is there a next isolated target to reposition toward? | **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| 7 | is there no immediate fight or isolated target? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

## Rule detail

### 1. `low_hp_recall` — is this bot's hp below a quarter of its max?

- **Then:** **recall** home
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's hp below a quarter of its max?" -- yes means bot hp < 25% of max hp; no means bot hp >= 25% of max hp.
- **Order:** checked first (position 1 of 7) -- this is the order the translator produced.
- **From your prose:**
  > You have less HP than almost anything else on the map — the instant you drop under a quarter health, recall, no matter how close the kill looked.

### 2. `engage_isolated_target` — is there an isolated enemy bearbot or the softest target in a group within range?

- **Then:** use **staccato** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there an isolated enemy bearbot or the softest target in a group within range?" -- yes means an isolated enemy or the lowest hp enemy exists and is visible; no means no suitable isolated or softest target is available.
- **Order:** checked at position 2 of 7, only if every rule above it (1..1) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Do not walk into a fight straight-on. Wait at the edge of what you can see until exactly one enemy is isolated — alone, or clearly the softest target in a group — then commit fully.
  > Staccato (quick high-damage stab, short range) is your opener on whoever you've picked as the target — use it the moment you're in range of them, every time it's off cooldown, on that same target if they're still alive.

### 3. `engage_lowest_hp_target` — is there a visible enemy bearbot with the lowest hp that is not currently isolated?

- **Then:** use **staccato** targeting: the visible enemy bearbot with the lowest hp (the 'softest' target)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a visible enemy bearbot with the lowest hp that is not currently isolated?" -- yes means a low hp enemy exists and is within range; no means no low hp enemy is available.
- **Order:** checked at position 3 of 7, only if every rule above it (1..2) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 4. `close_distance_solo` — is a target about to get away or is the decisive moment right?

- **Then:** use **solo** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is a target about to get away or is the decisive moment right?" -- yes means a target is fleeing or an engage opportunity exists; no means no immediate chase or engage opportunity.
- **Order:** checked at position 4 of 7, only if every rule above it (1..3) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:**
  > Solo (burst + speed, your ultimate) is for closing distance on a target that's about to get away, or for the decisive engage when the moment is right —

### 5. `attack_in_range` — is a target within attack range?

- **Then:** **attack** targeting: the visible enemy (any kind) closest to this bearbot
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is a target within attack range?" -- yes means a selected target is in melee range; no means no target is in melee range.
- **Order:** checked at position 5 of 7, only if every rule above it (1..4) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 6. `reposition_next_target` — is there a next isolated target to reposition toward?

- **Then:** **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there a next isolated target to reposition toward?" -- yes means an isolated target exists outside current range; no means no isolated target is visible.
- **Order:** checked at position 6 of 7, only if every rule above it (1..5) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

### 7. `push_lane` — is there no immediate fight or isolated target?

- **Then:** **move** targeting: move toward the enemy nexus, i.e. advance down the lane
- **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is there no immediate fight or isolated target?" -- yes means no combat priority exists; no means combat priority exists.
- **Order:** checked at position 7 of 7, only if every rule above it (1..6) is false -- this is the order the translator produced; nothing promoted or demoted it.
- **From your prose:** ⚠ no strong match found in the prose for this rule (fewer than 2 shared meaningful words with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it more than this matching method can trace.

## Dropped — what did NOT become a rule

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

