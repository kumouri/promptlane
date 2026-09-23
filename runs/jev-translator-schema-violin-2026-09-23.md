# Decision schema translated from `prompts/pilots/violin.md` (violin)

Rules are checked in order; the first one whose condition is true fires. If none fire, the default action at the bottom runs.

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is there exactly one isolated enemy visible? | **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| 3 | is the selected target within staccato range and is staccato off cooldown? | use **staccato** targeting: the visible enemy (any kind) closest to this bearbot |
| 4 | is a target about to escape and is solo off cooldown? | use **solo** targeting: the visible enemy (any kind) closest to this bearbot |
| 5 | is there no immediate fight opportunity? | **move** targeting: the visible enemy bearbot farthest from any other enemy (a target alone, not grouped) |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
