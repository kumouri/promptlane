# Decision schema translated from `prompts/pilots/keytar.md` (keytar)

Rules are checked in order; the first one whose condition is true fires. If none fire, the default action at the bottom runs.

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's current health below 25% of its maximum health? | **recall** home |
| 2 | is a visible enemy inside melee range of this bot? | use **glissando** |
| 3 | is there a visible enemy cluster (densest) within attack range? | use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 4 | are there no immediate threats and the bot is in a safe position to attack? | **attack** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| 5 | is there no enemy within attack range and the bot is not low on health? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |

**Automatic priority fixes applied to this schema:**

- priority guard: promoted rule(s) recall_low_hp to the top of the cascade -- the prose uses unconditional-override language for them (no exceptions) but the translator placed them lower, where an earlier rule could pre-empt them.
