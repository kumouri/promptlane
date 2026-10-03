# Run records

One recorder-created submission per run; no winning model overwrites another. Files are not
OS-write-protected: the protocol forbids edits and recorded hashes detect changes.

The recorder stores local operator state in `runs/<run-id>/` and generated workspaces/submissions
in `artifacts/<run-id>/`. Those directories are ignored to avoid accidentally committing private
operator references, machine paths, credentials, or large generated trees. Ignored local records
are not backed up by Git: retain reviewed copies and artifact archives before deleting a workspace.

See [the protocol](../generation/protocol.md) and [operator brief](../generation/operator-brief.md).
Only publish reviewed summaries and content-addressed artifact references, with permission.
Never claim a prepared run is a completed build, or an agent's completion message is an acceptance
pass.

Reviewed summaries kept in source control: [historical-v1.md](historical-v1.md) (root specimen
diagnostic), [fable-v1-001.md](fable-v1-001.md) and [opus-v1-001.md](opus-v1-001.md) (cleanroom
Claude submissions, evidence pass with per-submission adapters under `acceptance/adapters/`), and
[v1-comparison.md](v1-comparison.md) (the three side by side and what that decides about v2),
and [house-prompt-2026-09-21.md](house-prompt-2026-09-21.md) (the arena's house bot on `qwen3.5:9b`:
four quick tests vs `drums.md`, logs `house-prompt-2026-09-21-r*.json` beside it), and
[prompt-evolution-smoke-2026-09-30.md](prompt-evolution-smoke-2026-09-30.md) (the house-bot
evolution harness's one-generation smoke on live Jev plus the backend measurements its spec uses,
logs `prompt-evolution-smoke-2026-09-30-*.json` beside it), and
`translator-instrument-scope-2026-09-30.jsonl` (the live compiles behind
[`translator-guards-and-defaults-spec.md` §10](../docs/translator-guards-and-defaults-spec.md)), and
[house-tiers-2026-09-30.md](house-tiers-2026-09-30.md) (easy / medium / hard house tiers: 42
full matches on Jev, logs `house-tiers-jev-2026-09-30-*.json`, plus the earlier nine on qwen,
`house-tiers-2026-09-30-*.json` — both in a zip on the
[`data-house-tiers-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-house-tiers-2026-09-30)
release, not in git; compile reports `house-tiers-compile-*` and schemas `house-tiers-schemas-*`
beside it), and
[balance-pvp-2026-09-30.md](balance-pvp-2026-09-30.md) (tower range/placement vs PvP, measured on
Jev: the house-tier logs plus 24 seed-paired matches on three maps; metrics, heatmaps
`balance-pvp-2026-09-30-*` beside it, logs on the
[`data-balance-pvp-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-balance-pvp-2026-09-30)
release), and
[bandstand-2026-09-30.md](bandstand-2026-09-30.md) (the river objective, `pvp-1` with and without
the Bandstand, 24 seed pairs on Jev, the §9.8 pre-registered verdict; metrics and heatmaps
`bandstand-2026-09-30-*` beside it, logs on the
[`data-bandstand-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-bandstand-2026-09-30)
release), and
[bandstand-2-2026-09-30.md](bandstand-2-2026-09-30.md) (the redesign, `river-2` and `recall-2`, on
the same verdict lines, 12 seed pairs per comparison on Jev; metrics and heatmaps
`bandstand-2-2026-09-30-*` beside it, logs on the
[`data-bandstand-2-2026-09-30`](https://github.com/kumouri/promptlane/releases/tag/data-bandstand-2-2026-09-30)
release), and
[side-fairness-2026-10-01.md](side-fairness-2026-10-01.md) (why `pvp-1` favoured violet: the frozen
sim's update order, traced and fixed by the `simultaneous-1` tick resolution; bots-at-base
symmetry, 489 old logs replayed byte-identically, 10 side-swapped Jev matches and a mirror probe;
logs on the
[`data-side-fairness-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-side-fairness-2026-10-01)
release), and
[bandstand-3-2026-10-01.md](bandstand-3-2026-10-01.md) (`recall-2` with tiers that leave reach
first, on the fixed map; logs on the
[`data-bandstand-3-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-bandstand-3-2026-10-01)
release), and
[bandstand-4-2026-10-01.md](bandstand-4-2026-10-01.md) (hard's walk-home trigger at 65 % of max hp,
and a Bandstand-state Jev mirror probe; logs and probe rows on the
[`data-bandstand-4-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-bandstand-4-2026-10-01)
release), and
[bandstand-5-2026-10-01.md](bandstand-5-2026-10-01.md) (the first Bandstand read on the lane fix,
`own-lane-1`, and §9.8's one tuning pass, `river-2-set10`; logs on the
[`data-bandstand-5-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-bandstand-5-2026-10-01)
release), and
[economy-gate-2026-10-03.md](economy-gate-2026-10-03.md). That is the economy's §6 pre-registered
gate: 96 matches on Jev across A, R, B0 and B1, scored line by line, with the tuning pass and the
go / no-go for the 10-04 gate. Its metrics `economy-measure-2026-10-03-*` are beside it, and its
logs are on the
[`data-economy-gate-2026-10-03`](https://github.com/kumouri/promptlane/releases/tag/data-economy-gate-2026-10-03)
release, and
[economy-eco3-2026-10-01.md](economy-eco3-2026-10-01.md) (the one tuning pass §6.2 allows, `eco-3`:
B1's 24 matches re-run on Jev under `simultaneous-1`, scored against the gate's `eco-2` lines, with the
recommendation for the 10-04 gate; metrics `economy-eco3-2026-10-01-*` beside it, logs on the
[`data-economy-eco3-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-economy-eco3-2026-10-01)
release), and
[economy-eco3-check-2026-10-01.md](economy-eco3-check-2026-10-01.md) (`eco-3` on the shipping code:
12 medium-vs-hard matches, each seed both ways, on the post-#57 tiers and `own-lane-1`; metrics
`economy-eco3-check-2026-10-01-*` beside it, logs on the
[`data-economy-eco3-check-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-economy-eco3-check-2026-10-01)
release), and
[final-chorus-2026-10-01.md](final-chorus-2026-10-01.md) (the Final Chorus on the Jam stack on Jev:
62 matches with and 62 without, the fewer-draws spec's pre-registered measurement with its sample
amended before the run, and the recommendation for the 10-04 gate; metrics
`final-chorus-2026-10-01-metrics.md` beside it, logs on the
[`data-final-chorus-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-final-chorus-2026-10-01)
release), and
[house-hard-2026-10-02.md](house-hard-2026-10-02.md) (why house hard won no decided match on the Jam
stack, why the free stand-in said otherwise, the economy-aware hard's fix, and its pre-registered Jev
check; the kept compile's report is `house-hard-eco-compile-2026-10-02.md` beside it, and the logs are
on the
[`data-house-hard-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-house-hard-2026-10-02)
release), and
[vocab-fight-calibration-2026-10-02.md](vocab-fight-calibration-2026-10-02.md) (vocab-2's fight
verdict scored on 64,290 decisions replayed from 219 recorded `pvp-1` matches, $0; the logs are the
earlier runs' own), and
[pvp-2-2026-10-02.md](pvp-2-2026-10-02.md) (the opt-in `pvp-2` ruleset: the map ×1.33, new tower
spots, a speed boost and a teleport, with couriers deferred. It is measured against `pvp-1` on PR #88's
20 matches on Jev, pre-registered, plus teleport and drift blocks: 42 matches, $4.61. The logs and the
stand-in kit are on the
[`data-pvp-2-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-pvp-2-2026-10-02)
prerelease), and
[remove-token-caps-2026-10-02.md](remove-token-caps-2026-10-02.md) (every token cap on the
prose-to-Jev path removed: house-hard-eco 0/12 → 12/12 on the local 9B, $0, no runaway in 375
replies, and the two fidelity defects whole long compiles now show. Replies, probes and scripts are
on the
[`data-remove-token-caps-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-remove-token-caps-2026-10-02)
prerelease), and
[nexus-guard-2026-10-02.md](nexus-guard-2026-10-02.md). It covers the opt-in `pvp-1-hp300-base700`:
towers at 300 / 500, plus a 700-hp base tower in front of each nexus whose fall wins. That map is
measured against `pvp-1` and `pvp-1-hp400` on Jev, under the Jam ruleset and as the live arena runs.
No base tower fell in 20 matches on it, and the arena's `pvp-1` drew 5 of 8. The run was 36
pre-registered matches for $3.43, and it adds a $0 count of tower dives on 74 recorded matches. The
logs and the analysis kit are on the
[`data-nexus-guard-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-nexus-guard-2026-10-02)
prerelease.
The bulky captures those documents hash live under ignored `artifacts/<run>-evidence/` and
`artifacts/<run>-reviewed/`.
