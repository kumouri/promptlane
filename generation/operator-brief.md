# Operator brief: Claude Desktop and Delta

Use the **same recorder and evaluator**, not a separately reimplemented Claude runner. The Python
recorder operates in an external terminal and does not require an API key, a Claude integration,
or changes to your normal coding client. It records manual pauses and submissions; it does not
control Claude Desktop or enforce a hard process kill.

Read [protocol.md](protocol.md) first. Python 3.11+ and Git are required for the recorder.
Node/npm and browser evaluation dependencies belong to the execution environment. Commands below
are run from the fixture repository in an **operator terminal**, not the generator's project.

## 1. Prepare one fresh project per model

```text
python generation/runner.py prepare astra-v1-001 --agent astra --provider "ChatGPT subscription" --harness "Delta; record version and tools" --init-git
python generation/runner.py prepare sol-v1-001 --agent sol --provider "ChatGPT subscription" --harness "Delta; record version and tools" --init-git
```

For your Claude runs:

```text
python generation/runner.py prepare fable-v1-001 --agent fable --provider "Claude subscription" --harness "Claude Desktop; record version, persona and tools" --effort high --init-git
python generation/runner.py prepare opus-v1-001 --agent opus --provider "Claude subscription" --harness "Claude Desktop; record version, persona and tools" --effort high --init-git
```

The Claude `high` values above are examples, **not an approved or inferred setting**: replace them
with the actual effort you choose in the client. The approved GPT runs use High explicitly.
Fable's model is `claude-fable-5.1`; Opus's is `claude-opus-5`.

The exported project is `artifacts/<run-id>/workspace`. Only this directory should be attached to
the generator. Keep `runs/<run-id>/` and evaluator files outside its context. Do not clone the
fixture's current branch or import a prior conversation. The fresh Git repository has no remote:
do not add the fixture repository as a remote or fetch its history.

In Delta, open a **new thread**, use **Open Git Project…** to attach the exported input-only
repository, and select the exact model on the ChatGPT subscription provider with High effort.
Do not attach the original promptlane project. Use the prepared directory as the existing checkout
when possible; if the client uses a managed checkout, ensure the submission workspace is the
actual generated output, not the unchanged original export. Do not start until that path is known.

In Claude Desktop, select the exported directory as the coding workspace using the workflow your
installed client supports. Record any persona/skills/hooks injected into the session. Do not feed
the whole operator brief to the coding agent. If the client cannot restrict its attached project
to the export, stop and resolve that before calling the run clean-input.

Copy [harness-template.json](harness-template.json) to your local run directory, fill in what is
observable, and use `unknown` for unavailable facts. Keep secrets out. Export generic tooling
instructions separately if feasible, but do not give one model another model's transcript.

## 2. Start and send the same kickoff

Prepare the client and operator timer before starting. In the operator terminal:

```text
python generation/runner.py start astra-v1-001
```

Immediately send this neutral kickoff in the new generator conversation:

> Read `prompts/initial_prompt.md` and carry out its instructions in this project.

Use the same kickoff for all setups. Any additional generic persona or tool instructions are
declared harness inputs, not silently counted as part of the historical prompt.

Check elapsed active time from a separate terminal:

```text
python generation/runner.py status astra-v1-001
```

Or leave the deadline monitor running in the operator terminal:

```text
python generation/runner.py watch astra-v1-001
```

It follows recorded pauses and exits with an alert (code 3) when the active budget is exhausted.
It does **not** stop the coding client. Keep an operator present at the deadline and use the
client's stop control. The runner's `--help` lists all commands.

## 3. Record genuine pauses

If the agent is blocked on a human question and is no longer doing useful independent work:

```text
python generation/runner.py pause astra-v1-001 --reason human --reference "transcript turn 4: exact question saved in operator record"
```

Write the answer/reference into the run record, then resume **before** delivering the answer:

```text
python generation/runner.py resume astra-v1-001 --reference "transcript turn 5: exact answer saved in operator record"
```

Use `--reason infrastructure` for a real outage, with the cause and recovery recorded.
Do not pause while tools continue running. Do not put credentials or unrelated private messages
in the reference text. Record accidental pauses/overruns honestly rather than rewriting history.

## 4. Freeze even when the game is broken

When the agent says it is done, stop any further editing and freeze:

```text
python generation/runner.py submit astra-v1-001 --outcome completed
```

At the budget deadline, stop the agent using the client's stop control, then freeze what exists:

```text
python generation/runner.py submit astra-v1-001 --outcome timed-out
```

Use `failed` if the generation cannot continue. `completed` means the agent submitted, **not**
that acceptance passed. The submission remains separate from the mutable workspace. Do not edit
it, silently rerun generation, or let evaluator feedback flow back into the scored conversation.

If using a client-managed checkout, verify the actual files were transferred to the submission
workspace before freezing; preserve the source/destination and hashes in the operator record.
Do not copy `.git`, credentials, dependencies, or unrelated files. The input hash check before
starting and submitted-file manifest are necessary, but they cannot detect an unrecorded human edit.

## 5. Evaluate outside the generator

Follow [the acceptance runner documentation](../acceptance/README.md) against
`artifacts/<run-id>/submission`. Keep reports/captures outside that directory. The evaluator must
not assume generated internals match the historical game. Complete manual/adapter evidence where
generic browser checks cannot establish gameplay. Preserve `unverified` rather than guessing.

Use exactly the same evaluator version for Astra, Sol, Fable, and Opus. Record client, OS, browser,
Node/npm versions, machine characteristics, and all human interventions alongside the results.

## If you want to automate Claude later

Build only a thin adapter around this recorder, not another timing or evaluation implementation.
Its responsibilities would be:

1. Launch or attach the client to the prepared workspace and verify the selected model.
2. Record when a run genuinely blocks for a human, and pause only after work has stopped.
3. Resume before delivering the recorded answer.
4. Stop generation on deadline and acknowledge that it stopped before submitting.
5. Export redacted transcript/tool evidence and call the same external evaluator.

If the client exposes no supported stop/wait API, retain operator supervision and label timing
`operator-enforced`. Do not claim an automated hard limit from a UI scrape or an unacknowledged
stop request. No Claude API billing is required for the manual protocol.
