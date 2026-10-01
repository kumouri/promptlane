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
release).
The bulky captures those documents hash live under ignored `artifacts/<run>-evidence/` and
`artifacts/<run>-reviewed/`.
