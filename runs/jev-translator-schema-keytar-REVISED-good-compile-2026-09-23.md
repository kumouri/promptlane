# Decision schema translated from `keytar-revised.md` (keytar)

Rules are checked in order; the first one whose condition is true fires. If none fire, the default action at the bottom runs.

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is a visible enemy bearbot within melee range? | **move** targeting: move to this bearbot's own home/base position |
| 3 | is a visible enemy inside attack range? | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
| 4 | is Chord off cooldown AND is at least one enemy or minion visible? | use **chord** targeting: the visible enemy with the most other enemies near it (an AoE target) |
| 5 | is a visible enemy approaching or close? | use **glissando** |
| 6 | is there no immediate threat and no cooldowns ready? | **attack** targeting: the nearest allied minion in the wave (for riding/positioning with it) |
| — | *(none of the above)* | **move** targeting: move toward the enemy nexus, i.e. advance down the lane |
