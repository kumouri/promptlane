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
[house-tiers-2026-09-30.md](house-tiers-2026-09-30.md) (easy / medium / hard house tiers: nine
full matches, logs `house-tiers-2026-09-30-*.json` beside it, compile reports
`house-tiers-compile-*`).
The bulky captures those documents hash live under ignored `artifacts/<run>-evidence/` and
`artifacts/<run>-reviewed/`.
