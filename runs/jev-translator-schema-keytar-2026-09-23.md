# Decision schema translated from `prompts/pilots/keytar.md` (keytar)

Rules are checked in order; the first one whose condition is true fires. If none fire, the default action at the bottom runs.

| # | Condition | Then |
|---|---|---|
| 1 | is a visible enemy within melee range of this bot? | use **glissando** |
| 2 | is a visible enemy within attack range but not melee range of this bot? | use **glissando** |
| 3 | is the primary ability 'chord' off cooldown? | use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 4 | is this bot's current health below a quarter of its maximum health? | **recall** home |
| 5 | are there no enemies within attack range of this bot? | **attack** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
