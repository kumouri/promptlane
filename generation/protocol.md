# Promptlane generation protocol

Protocol version: `1`. This is an operator document, **not an additional game prompt**.

## Experiment

Generate independent games from frozen v1, using different model-and-agent setups. The approved
source snapshot is `5dde8b507a5350c3745063db3f20b6a36b8503c7`. The original
`prompts/initial_prompt.md` is never rewritten. Its supporting README, design, pilot placeholder,
license, ignore file, and branding inputs come from that same snapshot, not today's working tree.
File hashes in the input manifest make the exact bytes inspectable.

The historical pilot implementations, game source, later design lessons, recordings, other
submissions, and this project's conversation are excluded. A fresh run is not an attempt to
reproduce the historical recall bug, and must not receive that diagnosis.

| Setup | Model | Effort | Billing route | Owner |
|---|---|---|---|---|
| Astra | `gpt-6-astra` | `high` | ChatGPT subscription | Delta operator |
| Sol | `gpt-5.6-sol` | `high` | ChatGPT subscription | Delta operator |
| Fable | `claude-fable-5.1` | Record actual setting | Claude subscription | Claude operator |
| Opus | `claude-opus-5` | Record actual setting | Claude subscription | Claude operator |

Do not silently substitute a model or provider. An unavailable setup is a blocked run, not a
license to relabel another model's output. Provider aliases may change behind a model identifier;
record the run date and any more precise model revision the client exposes.

## Boundaries

The recorder exports a new input-only workspace per run. Optionally initialize a new Git repository
there containing only the historical input snapshot, with no remote or inherited Git history.
The operator's recorder, metadata, evaluator, and other runs stay outside the generator's project.

Open a **new conversation** attached only to that workspace. Never use a normal child of the full
fixture repository as a scored generator: an isolated checkout can still contain its entire
history and generated code. Do not attach parent threads or use conversation-retrieval tools to
recover the discussion that designed this experiment.

The exporter is not an OS sandbox. Same-user terminals can potentially read other host paths.
Record isolation as `input-only-workspace` unless a real filesystem/network boundary is separately
enforced and verified. For stronger assurance use a separate account, container, or machine with
only the input bundle mounted. Do not claim inaccessible files based solely on instructions.
Any observed out-of-bound source access invalidates a clean-input claim and must remain in the
report. Input hashes establish exported bytes, not everything a model has ever seen.

Keep normal language/tool documentation and package installation available if the harness permits
them. Do not search for promptlane implementations or other runs. Record network policy, tools,
permission mode, persistent memory/personas, hooks, installed skills, and generic system
instructions to the extent the client exposes them. A mature Claude setup and a minimal GPT setup
are valid comparison setups; hidden differences are not.

## Timing

- Budget: **3,600 seconds of active elapsed time** per initial generation.
  The recorder's `--budget` override is for workflow tests/exploratory runs; it records
  `standard_comparison_budget: false` and such runs are excluded from the approved comparison.
- Start immediately before sending the kickoff. Planning, agent work, tools, dependency
  installation, self-tests, and repair count.
- Pause only while genuinely blocked on human clarification or an infrastructure outage.
  If the agent continues independent work while awaiting an answer, the clock keeps running.
- Record the question/outage reference when pausing and the answer/recovery reference when
  resuming. Resume before delivering an answer and allowing work to continue.
- Do not pause for a difficult bug, slow ordinary build, or routine permission approval.
- Record total wall time and paused time separately. Never retroactively hide an overrun.
- The Desktop operator must stop the agent at the deadline, then freeze its current output.
  A timer alert is **not** process termination. If it finishes late, record a late submission.
- Submitting acknowledges that generation has stopped. Active time ends at that invocation;
  snapshot-copy time is recorded separately and does not consume the model's budget.

The recorder uses persistent UTC timestamps so another terminal can pause/resume it. It rejects
detected backward clock movement; wall-clock adjustment and unobserved operator delays remain
limitations. Keep the host awake and its clock stable, and record any anomaly. A monotonic
cross-process hardware stopwatch is not claimed.

## Questions and intervention

The generator may ask questions as required by v1. The human answers only the question asked.
Record exact question/answer text or a durable transcript reference, the timestamps, and whether
the answer supplied new requirements. Never enter credentials into transcripts.

Clarifications of the approved task and environment are allowed. Do not volunteer implementation
advice, recall remedies, other models' results, or evaluator feedback. If an answer changes the
task, preserve this run as a changed-input experiment and start a separately labeled run for the
new contract. Questions and answers can differ across setups; they are part of the comparison,
not evidence of a pure model-only experiment.

Use the original prompt's mock/offline mode unless the operator separately authorizes live model
endpoint use. No real API credentials are needed for the initial acceptance demonstration.
The generator may self-test and repair within the budget. Humans do not edit generated game code.

## Submission and evaluation

1. On completion or deadline, stop generator activity before submitting.
2. Freeze the candidate with the recorder. Preserve partial/failed outcomes too.
3. Keep the submission hash, dependency lockfile if produced, input manifest, timing/events, model
   and harness record, and redacted transcript references. Missing lockfiles are reported, not
   invented afterward.
   Review the displayed omissions before evaluating: credential-like paths and generated/tool
   directories are excluded. `.env.example`, ordinary source files, and archives are retained;
   none are secret-scanned. If an omission removes a required deliverable, record that the
   snapshot is incomplete and do not claim it faithfully represents the submitted application.
   `omission_review_required` flags exclusions beyond the usual root Git/dependency/build/cache
   directories; clear that question in the operator evidence before treating it as a scored
   candidate. This is a source snapshot with declared exclusions, not a byte-for-byte disk image.
   Preserve a redacted transcript and, when relevant, the standalone Git commit log separately
   for process evidence; `.git` is not copied into the application snapshot.
4. Run the independent evaluator on the frozen candidate, using a separate execution copy for
   installation/build/browser activity. Do not repair or modify the frozen submission.
5. Keep independent evaluation feedback from the generator until its scored run is closed.
6. Record explicit `pass`, `fail`, or `unverified` for each relevant criterion. A screenshot of a
   canvas does not prove match mechanics. A timeout is not the requested nexus-kill demonstration.
7. Any later evaluator-assisted repair gets a new run identity, additional-input/feedback record,
   and separate timing. It never replaces the initial submission.

Evaluation criteria and implementation are maintained independently under `acceptance/`.
Before scored runs, record the evaluator revision or hash. Freeze the same evaluator for the
comparison; if it has a defect, version the correction and re-evaluate all affected candidates.
Do not silently tailor it until one model passes.

## Evidence and storage

Local `artifacts/` and per-run `runs/` directories are ignored by Git. They can contain generated
code, bulky captures, machine paths, and private operator notes. The recorder is not a general
secret scanner. Review/redact before publication, and never publish credential files or raw
authenticated network traffic.

Keep small, reviewed comparison summaries and references in source control. Retain generated
code and large evidence in immutable archives with content hashes; choose a publication destination
explicitly rather than uploading automatically. Local ignored files are not durable shared storage.
Hashing detects later changes; it does not make directories write-protected.

Record measured billing/usage if the provider exposes it. Otherwise report subscription access
and `cost unknown`/`usage unavailable`; do not infer a per-run dollar price from an API price table.
One run per setup is a demonstration, not a statistically reliable provider ranking. Repeated
runs and controlled harness comparisons can follow without changing the first-round record.

## What is and is not demonstrated

A valid generation record shows which inputs were exported, what declared setup was used, timing,
interventions, and which output was evaluated. Behavioral evaluation establishes the properties
actually exercised on that specimen. Neither claims byte-identical LLM regeneration, universal
correctness, complete observability of provider internals, or guaranteed future success.

The current root game is a historical specimen, not a scored cleanroom result. Do not replace it
with the winner of a comparison or use its implementation as the baseline source for another run.
