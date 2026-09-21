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
[v1-comparison.md](v1-comparison.md) (the three side by side and what that decides about v2).
The bulky captures those documents hash live under ignored `artifacts/<run>-evidence/` and
`artifacts/<run>-reviewed/`.
