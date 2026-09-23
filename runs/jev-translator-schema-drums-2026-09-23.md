# Decision schema translated from `prompts/pilots/drums.md` (drums)

Rules are checked in order; the first one whose condition is true fires. If none fire, the default action at the bottom runs.

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is an enemy bearbot within melee range of an ally? | **attack** targeting: the enemy nearest to this bearbot's own lowest-hp ally |
| 3 | are multiple enemy bearbots bunched up near this bot? | use **fill** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 4 | is an enemy bearbot within melee range? | use **kick** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | is there any visible enemy? | **attack** targeting: the visible enemy (any kind) closest to this bearbot |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
