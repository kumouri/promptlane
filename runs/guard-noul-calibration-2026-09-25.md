# Guard-noul calibration -- can Jev answer a judgment guard question?

Mode: live (workers-ai, model=typesafe/jev). Instrument: `violin`. 12 scenarios, 4 scored against violin's own prose-derived labels (the rest are `move`/`recall` scenarios this guard isn't about).

## Headline

- Main wording (`guard_can_win`) vs. violin's prose labels: **4/4** (100.0%)
- Majority vote across 3 wordings vs. violin's prose labels: **4/4** (100.0%)
- All 3 wordings agreed with each other on **4/12** of all 12 scenarios (33.3%)
- Cost: 7814 input tokens, $0.000328

## What this does and does not show

n=4 scored scenarios: one scenario is 25 percentage points. A perfect score on 4 cases is real evidence Jev can answer this specific judgment question in this specific wording, on these specific states -- it is not evidence the guard-tree design generalizes to every wording or every pilot's version of this same idea.

The three wordings agreeing with each other on only 4/12 of 12 scenarios is the more important number for the design question: `guard_favorable_target` answered "yes" far more often than `guard_can_win`/`guard_commit_now` (it is a softer question -- "is a beatable target visible" rather than "should this bot commit" -- and Jev treated it that way), so it disagreed with the other two on scenarios where no fight was even in progress (`ability_on_cooldown_enemy_present`, `softest_target_selection`). A guard-tree cascade picks ONE wording per guard and lives with it every decision; this run shows that choice is not interchangeable -- the exact phrasing changes the answer, not just its confidence.

## Guard wordings asked

- `guard_can_win`: "Given everything visible right now, can this bearbot win the fight it is currently in or about to enter, by itself, right now?"
- `guard_commit_now`: "Should this bearbot commit fully to engaging the enemy it can currently see, because the fight is winnable?"
- `guard_favorable_target`: "Is there a visible enemy right now that this bearbot could defeat alone, either because it is isolated or because it is clearly the weakest target present?"

## Per-scenario

| Scenario | Scored? | Expected | can_win | commit_now | favorable_target | Majority | Unanimous |
|---|---|---|---|---|---|---|---|
| empty_lane_push | no | — | no (0.11) | no (0.05) | no (0.07) | no | yes |
| low_hp_recall_under_pressure | no | — | no (0.15) | no (0.13) | no (0.33) | no | yes |
| melee_range_enemy_ability_ready | yes | yes | yes (0.62) | no (0.46) | yes (0.79) | yes | no |
| ranged_enemy_far | no | — | no (0.40) | no (0.25) | yes (0.66) | no | no |
| clustered_enemies | yes | no | no (0.41) | no (0.34) | yes (0.63) | no | no |
| ability_on_cooldown_enemy_present | no | — | yes (0.62) | no (0.38) | yes (0.81) | yes | no |
| ally_under_threat | no | — | no (0.27) | no (0.23) | yes (0.52) | no | no |
| isolated_vs_grouped_enemy | yes | yes | yes (0.55) | no (0.31) | yes (0.83) | yes | no |
| enemy_tower_only | yes | no | no (0.31) | no (0.26) | yes (0.51) | no | no |
| hp_exactly_at_threshold | no | — | no (0.21) | no (0.17) | no (0.45) | no | yes |
| minion_wave_poke | no | — | no (0.13) | no (0.05) | no (0.07) | no | yes |
| softest_target_selection | no | — | yes (0.55) | no (0.33) | yes (0.89) | yes | no |

