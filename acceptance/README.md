# Independent v1 evaluator

Run **after submission is frozen**, outside the generator's context. See
[requirements.md](requirements.md) for the original-v1 pass gates and separate
exploratory checks. No model calls, generation, game patching, package changes,
or specific `src/` classes are required by this framework.

## Commands

Python 3.10+ standard library is enough for CLI, import validation and unit tests.
Commands below work with an arbitrary frozen source app, not necessarily this repo.
Use a new report directory outside the candidate each time.

```sh
# Inventory only: explicit unverified gates, no npm or code execution.
python acceptance/evaluate.py path/to/frozen-app --output path/to/reports/inventory

# Opt-in candidate code execution in a temporary copy.
python acceptance/evaluate.py path/to/frozen-app --output path/to/reports/build --execute --install "npm ci" --typecheck "npm run typecheck" --build "npm run build"

# Apps without a typecheck script: explicitly select their real compiler command.
python acceptance/evaluate.py path/to/frozen-app --output path/to/reports/compiler --execute --typecheck "npx --no-install tsc --noEmit"

# Validate schema, referenced bytes, and candidate association.
python acceptance/validate.py path/to/reports/build/report.json --candidate path/to/frozen-app

python -m unittest discover -s acceptance/tests -v
```

Default install is `npm ci`, build is `npm run build`, typecheck is unconfigured.
Use `--install "npm install"` for an app with no lockfile, disclose that dependency
resolution was not pinned. Use `--typecheck ""` (or omit it) only if intentionally
not running a separate compiler check. `--timeout 180` bounds each command.
Commands are argument strings, **not shell programs**: no `&&`, pipes or env
assignment syntax. Configure the process environment externally. On Windows npm
is resolved to its installed command wrapper.

Exit codes: 0 means a report was produced without an observed required failure
(**read `overall`; 0 is not a pass**), 1 means overall fail, 2 means invalid input,
report or integrity error. `--output` must be empty/new and outside the candidate.
Dependencies and build output are staged, never intentionally written into the
candidate. Temporary execution is not a security sandbox: submitted npm scripts
have the current user's privileges. Use an isolated machine/container with no
secrets and network restrictions for untrusted submissions.

## Optional generic browser smoke

Install evaluator tooling outside the app, e.g. a dedicated evaluator virtualenv:

```sh
python -m venv path/to/evaluator-venv
# Activate it using your shell's normal venv activation command, then:
python -m pip install -r acceptance/requirements-browser.txt
python -m playwright install chromium
python acceptance/evaluate.py path/to/frozen-app --output path/to/reports/browser --execute --browser
```

`--serve "npm run dev -- --host 127.0.0.1 --port {port} --strictPort"` is the
default. Configure for other apps; `{port}` is replaced with a free local port.
`--browser-seconds 5` sets observation time after navigation. A fresh browser
context records JS/console errors, canvas dimensions, and a screenshot. No
implementation-specific Start button selector is guessed; this is startup
smoke, not a completed match. Install is only performed with `--execute`.
Missing Python Playwright or its Chromium binary gives `browser: unverified`,
not a bogus gameplay failure. Server/browser errors once executed are failures.

Framework verification used Windows, Python **3.14.6**, Node **26.4.0**, and an isolated
evaluator environment with Playwright **1.63.0** and Chromium **153.0.8010.12** (revision 1243).
An actual install/typecheck/build/browser startup evaluation of the historical specimen passed
those four checks and retained unchanged candidate integrity. The overall report remains
**unverified**, because startup smoke does not establish gameplay. See
[the historical result](../runs/historical-v1.md). Unit tests themselves do not download browsers.

For local-only browser storage, set `PLAYWRIGHT_BROWSERS_PATH` to an absolute directory under
`artifacts/` before both installation and evaluation. The environment and browser are evaluator
dependencies, never prompt inputs. Reuse the pinned tooling for the comparison.

## Human evidence workflow

1. Freeze the game directory after initial submission. Inventory it with the
   first command and copy `candidate_sha256` from `report.json`.
2. Run the unchanged candidate in a disposable copy. Record exact install,
   launch, environment, viewport, browser version, controls, seed, wall time and
   simulation time. Keep recordings/screenshots, request traces and replay logs
   **outside** the candidate. Do not fix it while evaluating.
3. Follow the gates in `requirements.md`. For `baseline`, record an entire fresh
   Scripted match through terminal outcome. Confirm destroyed nexus separately
   from winner text. If 10-minute timeout occurs, record `fail`, not pass.
   For timing/abilities, record start/end simulation timestamps and state
   observations. For HTTP tests use a local delayed endpoint without secrets.
4. An independent reviewer writes a packet with their identity, timestamp,
   reproducible steps, actual observed facts and hashed evidence references.
   Source review can establish static gates, never dynamic gameplay passes.
   A candidate's README/agent “tests passed” assertion is not evidence.
5. Import the packet and validate the resulting report:

```sh
python acceptance/evaluate.py path/to/frozen-app --output path/to/reports/reviewed --evidence path/to/evidence/packet.json
python acceptance/validate.py path/to/reports/reviewed/report.json --candidate path/to/frozen-app
```

Packet shape (replace placeholders; hashes are lowercase SHA256 of file bytes):

```json
{
  "schema": "promptlane-v1-acceptance-1",
  "candidate_sha256": "COPY_FROM_INVENTORY_REPORT",
  "reviewer": "Independent reviewer name",
  "captured_at": "2026-01-01T12:00:00Z",
  "adapters": [],
  "observations": [{
    "id": "baseline",
    "status": "fail",
    "method": "human-browser",
    "steps": "Fresh page; default seed; all six Scripted; Start; observe full match.",
    "actual": "At 600 simulation seconds winner appears by tower count; both nexuses remain alive.",
    "references": [{
      "path": "baseline.webm",
      "sha256": "SHA256_OF_RECORDING",
      "description": "Full match; final outcome at 10:04 in recording."
    }]
  }]
}
```

Methods: `human-browser`, `reviewer-source`, `readonly-adapter`. Missing gates
remain unverified; partial packets are useful. Every pass/fail observation needs
at least one reference. Unknown fields, duplicate IDs/JSON keys, wrong candidate
hash, missing/tampered references and source-only gameplay passes are rejected.
Paths are relative to the packet directory and cannot escape it. `import.json`
is reserved. Import copies the packet, evidence and adapter bytes into the report.
Hash files portably with:

```sh
python -c "import hashlib,pathlib; print(hashlib.sha256(pathlib.Path('baseline.webm').read_bytes()).hexdigest())"
```

An implementation-specific adapter is allowed **only** as external evaluator
instrumentation: inspect or run unchanged code, never rewrite game rules or
claim generic applicability. Include each adapter as
`{"path":"adapter.mjs","sha256":"...","purpose":"What it reads; all timing/control assumptions"}`.
Attach raw output with seed, checkpoints and terminal reason; describe commands,
instrumentation and semantic limitations in observation steps. Changing timers
or forcing state requires disclosure and cannot alone prove the normal
browser baseline. Review adapter results against the real browser before
clearing visual/UI gates. Never ship an adapter back as generation input.

## Integrity and limits

The candidate ID hashes a canonical JSON manifest of sorted relative file paths,
sizes, content SHA256s, and POSIX executable flags (`null` when unavailable on Windows).
Moving a candidate between permission models requires a new inventory and explicit provenance,
not relabeling the old evidence hash. `.git`, `node_modules`, `dist`, `.vite`, `__pycache__`
directories are excluded at all depths. Evaluate source submissions, not
dist-only bundles. All other files (including lockfiles and prompts) participate.
Symlinks in the included tree are rejected. The same hash is checked after
staging and after evaluation. This detects changes, not hostile concurrent races.

`evaluate.py` contains the executable strict schemas (`validate_evidence`,
`validate_report`); `validate.py` additionally verifies stored references and
optional candidate association. Reports do not cryptographically authenticate
human identity or truth. A fabricated recording or dishonest reviewer cannot be
eliminated by schema validation; maintain independent reviewer custody and review
the attachments. Do not treat a schema-valid self-report as automatic proof.

Tests use temporary fake apps under `acceptance/`, exercise staging/build success
and failure, partial evidence, tampering, schema rejection and hash binding. They
do not invoke paid agents, npm installation, or a browser.
