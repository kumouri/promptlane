# Elysium — the promptlane arena — runbook (Phases A + B)

The arena is **Elysium** (ruling Q16; the *Hades* stadium where the dead fight for glory forever).
The code paths keep the word `arena` (`tools/arena/`, `runs/arena/`, `npm run arena`) — paths are
not the name. How to run the pre-jam ladder on the workstation, how it stays up unattended
(section 3 — two scheduled tasks; this is the deployment of record), what has to be done by hand
on the Cloudflare side, and what a jam-day operator does. The design is
[`arena-site-spec.md`](arena-site-spec.md); this is the *doing*. Markdown is canonical.

Everything the arena writes lives under `runs/arena/` (gitignored): `ledger.jsonl` (append-only,
the whole truth), `logs/<matchId>.json` (one replayable match log per match), `prompts/<handle>/`
(content-addressed cache of merged prompts), `scratch/` (scratch prompt text, deleted when its
match ends).

---

## 1. Start it locally (dev mode)

Dev mode = no Cloudflare Access; every request is you, as organizer. The listener is
`127.0.0.1` only in every mode; nothing else on the machine changes.

```sh
npm ci && npm run build                     # once; `build` produces dist/ for the /play/ replay viewer
cp tools/arena/config.example.json runs/arena/config.json   # edit: organizerEmail, backend
python tools/model_server.py                # terminal 1 — Ollama qwen3.5:9b on :8787 (honours $OLLAMA_HOST)
npm run arena -- --config runs/arena/config.json --dev-user you@inrhythm.com   # terminal 2 — :8790
```

Open <http://127.0.0.1:8790/>. Startup log lines to look for:

```
arena: house bot loaded from prompts/pilots/house-violet.md + prompts/pilots/house-green.md (…)
arena: listening on http://127.0.0.1:8790/ (dev mode — every request is you@… (organizer))
arena: tournament ladder backend=qwen9b data=…/runs/arena
```

Flags (`npm run arena -- --help`): `--port`, `--data DIR`, `--backend mock` (no model server;
the game's deterministic mock — what CI runs), `--entrants-dir DIR` (read
`entrants/<handle>/pilot.md` from a local tree instead of GitHub), `--no-sync`.

A fast local smoke without Ollama:

```sh
npm run arena -- --dev-user dev@example.com --backend mock --data /tmp/arena-smoke
```

The entrants poller shells out to `gh api` for `kumouri/jamobair-entrants` (`main`) every 60 s, so
`gh auth status` must be good on the host. It never pushes.

### Config (`runs/arena/config.json`)

| Key | Meaning |
|---|---|
| `tournament.backend` | which `backends` entry ranked matches and tests use — **the per-tournament model setting**; it is recorded in every match log (`backend.model`) and every `finished` ledger row |
| `tournament.cadenceSec` / `maxSimSec` | ranked matches: cadence 2, full 600 s |
| `tournament.quick` | quick tests: 3 sim-min at cadence 4 (ruling Q10) |
| `tournament.placementSeeds` | `[7, 11, 42]` (Q14); sides alternate violet/green/violet (Q15) |
| `tournament.quota` | `{quick: 6, full: 2}` per handle per Central-Time day (Q11); organizer exempt |
| `backends.<id>` | `{kind: http, endpoint, model, avgSecPerCall, timeoutSec}` or `{kind: mock}`; `avgSecPerCall` sizes the wall-clock cap (3× expected) — raise it when the GPU is shared. A hosted backend (§1a) also carries `concurrency`, `usdPerMToken`, `dailyBudgetUsd` in the shape `docs/arena-site-spec.md` §5.4 wants; the arena doesn't read those three yet (§1a "not built") — they document the backend for now, the same way `runs/arena/config.json` has always been the record of what a tournament ran on |
| `entrants` | `{kind: gh, repo, ref, syncIntervalSec}` or `{kind: dir, path}` |
| `house` | `{handle, files}` — ordered candidates; a candidate is a `{violet, green}` pair (one prompt per side) or one file; the first whose files all exist wins: the `house-*.md` pair, then `house.md`, then `drums.md` |
| `organizerEmail` | the one organizer (Q19); refused if left as `CHANGE-ME` in Access mode; `ARENA_ORGANIZER_EMAIL` overrides |
| `compile` | the `/compile` panel (§1b): `backend` (`ollama`/`openrouter`), per-IP and global limits, `ipHeader`, `practiceBackend` |

Changing the tournament block appends a new `tournament` row; nothing already played is altered.

---

## 1a. Hosted backend (OpenRouter) — for jam day, not the everyday ladder

The everyday ladder stays on `qwen9b` (Ollama, $0). A hosted backend is a per-tournament choice
(§5.4) for when wall-clock matters more than the fraction-of-a-cent cost — the jam bracket itself,
or a rehearsal of it. Full cost/latency reasoning is
[`hosted-model-options.md`](hosted-model-options.md); a real proof run (spend, latency, a
side-by-side against the `qwen9b` baseline on the same seed) is
[`../runs/openrouter-phase-c-proof-2026-09-22.md`](../runs/openrouter-phase-c-proof-2026-09-22.md).

**The key.** `OPENROUTER_API_KEY` is a Windows *user* environment variable on this host, not a repo
secret — it is never read from a file, never logged, never put in a commit, a PR body or a match
log (`/health` shows `base_url`, `model`, token/cost counters, never the key). A process that is
launched detached may not inherit a user env var; if `model_server.py` refuses to start with
`OPENROUTER_API_KEY is not set`, that is the symptom — check the launcher, not the key.

**1. Start the hosted model server** (a second `model_server.py`, its own port — :8789 is the slot
the architecture picture in `arena-site-spec.md` §3.0 already reserves for a hosted/budgeted
backend; :8787's Ollama `qwen9b` keeps running for everything else):

```sh
python tools/model_server.py --backend openrouter --model qwen/qwen3-32b --port 8789 \
    --provider DeepInfra --concurrency 6 --price-in-per-m 0.08 --price-out-per-m 0.28 \
    --daily-budget-usd 5
```

`--provider DeepInfra` pins the endpoint so a bracket doesn't drift providers (and therefore
quantisation/latency) mid-event; drop it to let OpenRouter route freely. `--daily-budget-usd`
refuses new calls once this *process's* cumulative estimated cost reaches it — restart the server
to reset the counter for a new day. Confirm it's up: `curl http://127.0.0.1:8789/health` should
show `"backend": "openrouter"`, the model, `base_url`, and `tokens_in`/`tokens_out`/`cost_usd`
starting at 0.

**2. Point a tournament at it.** In `runs/arena/config.json`, add a `backends` entry (there's a
template in `tools/arena/config.example.json`'s `openrouter-qwen32b`) pointing at `:8789`, then set
`tournament.backend` to that id and restart the arena — this is the same "change the model" step as
§5.2's table row, it just names the hosted entry instead of `qwen9b`. **Do this deliberately**: it
is a tournament-wide setting (§5.4), so it changes every match from that point on, not just one.

**3. What a jam-day rehearsal looks like.** Run one real match on the hosted backend the same way
`runs/openrouter-phase-c-proof-2026-09-22.md` did — `node tools/match/cli.mjs --a <a> --b <b>
--seed <n> --cadence 2 --endpoint http://127.0.0.1:8789/` — before trusting it for the bracket
itself, and read the result line for parse/call errors and the wall time, not just whether it
finished. The 6-pilot lockstep round now runs genuinely in parallel (mean ≈1.4 s/call in the proof
run, vs. Ollama's serial queue), so a full 600-second match finishes in low single-digit minutes
instead of the 25+ the everyday ladder takes — budget the rehearsal slot accordingly, and re-check
`/health`'s `cost_usd` afterward against the day's budget before running the real bracket.

---

## 1b. The compile panel (`/compile`) and practice matches

Entrants paste prose at `/compile` and read what it compiles to for Jev — the same view as
`python tools/jev/compile.py` and the jamobair-entrants PR bot (rulings 20–21; the full design and
measurements are in [`entrant-compile-preview.md`](entrant-compile-preview.md)). It is on by
default and compiles with host Ollama; nothing to start.

- **Hosted compiles:** set `"compile": {"backend": "openrouter"}` and start the arena with
  `OPENROUTER_API_KEY` in its environment. The key stays in the arena process and its
  `compile.py` child; the browser only ever gets the rendered view. ≈$0.0006 per compile, capped at
  `maxTokensPerCompile` (20k) each.
- **Limits:** `perIpPerMinute` 3, `perIpPerDay` 20, `globalPerDay` 400, `maxConcurrent` 1 — in
  memory, so a restart resets them. **Behind the tunnel set `"ipHeader": "cf-connecting-ip"`**, or
  every visitor arrives as 127.0.0.1 and shares one bucket.
- **Practice matches (optional):** start the schema server, then point the panel at it:

  ```
  python tools/jev/schema_server.py              # live Jev via Workers AI, 127.0.0.1:8797, --budget-usd 0.50
  python tools/jev/schema_server.py --stub       # $0 plumbing run
  ```

  and set `"compile": {"practiceBackend": "jev-schema"}` (the `jev-schema` backend is already in
  `config.example.json`). The entrant's compiled rules play violet on Jev against the house bot:
  a quick test against their handle's quota, never ranked. `npx wrangler whoami` first if the
  Workers AI token may have expired, and restart the schema server after it refreshes.

---

## 2. Expose it to InRhythm (Access + tunnel) — by hand, once

Rulings: Cloudflare Access one-time PIN (Q1), `inrhythm.com` (Q2), hostname **`elysium.`** on the
cockpit tunnel's zone is canonical and `arena.` on the same zone 301-redirects to it (Q16),
spectators behind Access too (Q18), organizer = Ceryce only (Q19). **None of
this is created by code**; the steps below are the deployment note.

1. **Access application.** Zero Trust → Access → Applications → *Add* → Self-hosted. Application
   domain `elysium.<zone>`. Session duration: 24 h is fine. Identity providers: *One-time PIN* only.
2. **Policy.** Allow → include *Emails ending in* `@inrhythm.com`, and *Emails* = your address
   if it is not on that domain. No bypass rules, no `Everyone` (that is Phase C).
3. **Copy the AUD.** On the application's overview: *Application Audience (AUD) Tag* — a 64-hex
   string. Team name is the `<team>` in `https://<team>.cloudflareaccess.com`.
4. **Tunnel ingress** (the cockpit's `cloudflared` config): add
   `elysium.<zone>` → `http://127.0.0.1:8790`. Nothing else on this host is ever an ingress target.
5. **The `arena.` redirect** (Q16: `arena.<zone>` → `elysium.<zone>`). Two layers, both cheap:
   - *Cloudflare, the one that normally answers.* DNS: a proxied `AAAA arena 100::` (or `A 192.0.2.1`)
     record so the name resolves at the edge. Rules → *Redirect Rules* → *Create rule*: when
     `Hostname equals arena.<zone>`, then *Dynamic* redirect to
     `concat("https://elysium.<zone>", http.request.uri.path, http.request.uri.query != "" ? concat("?", http.request.uri.query) : "")`,
     status **301**, *Preserve query string* on. The redirect fires at the edge; no Access app is
     needed on `arena.` because nothing on it ever reaches an origin.
   - *The origin, belt and braces.* The arena itself answers `301 https://elysium.<zone><path>` to any
     request whose `Host` header is `arena.<anything>` before it looks at identity, so if `arena.`
     is (or was) a tunnel ingress the answer is the same. `npm run test:arena` covers it.
6. **Start the arena in Access mode:**

   ```sh
   set ARENA_ACCESS_AUD=<64 hex>          # PowerShell: $env:ARENA_ACCESS_AUD = '…'
   set ARENA_ACCESS_TEAM=<team>
   set ARENA_ORGANIZER_EMAIL=<your address as Access will report it>
   npm run arena -- --config runs/arena/config.json
   ```

   The log line must say `Cloudflare Access — aud …, team …, organizer …`. With `ARENA_ACCESS_AUD`
   set, `--dev-user` is refused, every request without a valid `Cf-Access-Jwt-Assertion` gets a
   401, `/admin` and the organizer API return 403 for anyone whose email is not the organizer, and
   the JWKS is fetched from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cached six
   hours, re-fetched on an unknown key id).
7. **Smoke it from a phone:** open `https://elysium.<zone>/`, get the PIN by email, paste a prompt on
   *Test*, watch the result page fill in, press *Watch the replay*.

Identity is the Access email; the **handle** (GitHub login = `entrants/<handle>` folder) is typed
once on the Test page and recorded as a `claim` row. First come, first served; the organizer
reassigns on `/admin`.

---

## 3. Persistent on the workstation (scheduled tasks)

Sections 1 and 2 are how you bring it up **by hand**. This is how it actually runs on the
workstation: **two Windows scheduled tasks**, no terminal held open, no `jobs.py` job, surviving
logoff and reboot. Set up 2026-09-22; both previously lived as long-running jobs, which meant a
warm-session restart or a cancelled job took the site down.

| Task | Runs | Listens |
|---|---|---|
| `margo-elysium-arena` | `run_arena_task.cmd` → `run_arena.ps1` → `npm run build` + `npm run arena -- --config runs/arena/config.json` | `127.0.0.1:8790` |
| `margo-elysium-model` | `run_model_server_task.cmd` → `run_model_server.ps1` → `python tools/model_server.py` | `127.0.0.1:8787` |

The launcher scripts live **outside the repo**, in the host scratchpad
(`%USERPROFILE%\workspace\_scratch\promptlane-next\`), deliberately: they are host-specific
absolute paths, and an untracked file inside a working tree blocks a fast-forward pull. They are not
secret — Access credentials come from `runs/arena/arena.env` (gitignored), which `run_arena.ps1`
loads into the process environment. Each `.cmd` is a one-line wrapper that appends stdout+stderr to
`runs/arena/arena-task.log` / `runs/arena/model-server-task.log`.

### Both tasks have the same shape

- **Two triggers.** `AtLogOn` for the user, **plus** a `Once` trigger repeating every **5 minutes**
  with an explicit finite duration (`P3650D`).
- `MultipleInstances = IgnoreNew`, `ExecutionTimeLimit = PT0S` (none), `RunLevel = Limited`,
  `LogonType = S4U`, priority 7.
- Each `.ps1` **also guards its own port** and aborts with exit 3 if the port is already held.

**The 5-minute repeat is the keepalive, and it is not belt-and-braces — it is the only thing that
works.** `RestartCount 999` / `RestartInterval PT1M` are set on both tasks and **never fire**: when
the server process dies, the `.cmd`/pwsh wrapper still exits **0**, so Task Scheduler records success
and leaves the task `Ready` with the port dead. Verified by killing each server on 2026-09-22 —
`LastTaskResult 0`, no restart. With the repeat, a tick while the server is alive is dropped by
`IgnoreNew`, and a tick while it is dead brings it back: measured recovery was the next tick, ≤5 min,
rebuild included.

A repetition also needs an **explicit** duration. A repetition attached to the logon trigger with an
empty `Duration` registers without complaint and then silently never fires (first attempt did exactly
that); `[TimeSpan]::MaxValue` is rejected by the task XML schema as out of range.

### The orphan-port trap

`Stop-ScheduledTask` kills the wrapper, **not the tree** — the arena's `node` child outlives it and
keeps holding `:8790`. The task then reads `Ready` while the port is still occupied, so the next
keepalive tick hits the port guard and aborts (exit 3) forever. Seen on the first re-registration.
So: after stopping either task, check the port and kill the tree if it is still held.

```powershell
Get-NetTCPConnection -LocalPort 8790 -State Listen   # or 8787
taskkill /PID <OwningProcess> /T /F                  # /T — the tree, not just the parent
```

### Operating them

```powershell
Get-ScheduledTask -TaskName 'margo-elysium-*' | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName 'margo-elysium-arena' | Select-Object LastRunTime, LastTaskResult, NextRunTime
Start-ScheduledTask -TaskName 'margo-elysium-arena'   # don't wait for the next tick
Stop-ScheduledTask  -TaskName 'margo-elysium-arena'   # then check the port, above
Get-Content .\runs\arena\arena-task.log -Tail 20            # from the repo root
```

`LastTaskResult 267009` (`0x41301`) means *currently running*, not an error.

Health checks: `:8787/health` returns `{"ok": true, backend, model, …}`. A bare `GET :8790/` in Access
mode returns **401** to an unauthenticated local request — that is Access working, not a fault; the
startup line in `arena-task.log` is the real confirmation.

**To rebuild after a machine wipe:** recreate the two `.cmd` wrappers and re-run the two
registration scripts (`register-elysium-arena-task.ps1`, `register-elysium-model-task.ps1`, same
scratchpad — idempotent: each unregisters any prior copy first, and the arena's also kills a
process still holding :8790). They
are the executable form of everything in this section; if they are gone, this section is the spec.
`runs/arena/arena.env` and `runs/arena/config.json` are gitignored and host-only — restore them from
section 2 before starting the arena.

---

## 4. Seed the house bot

The house bot is the pair `prompts/pilots/house-violet.md` / `house-green.md` (ruling Q13; one
prompt per side because the 9B model cannot compare a field against its own team — evidence in
[`runs/house-prompt-2026-09-21.md`](../runs/house-prompt-2026-09-21.md)), else `house.md`, else
`prompts/pilots/drums.md` (`config.house.files`, `tools/arena/house.mjs`). It is loaded at
startup, hashed as one text (a pair is stored behind side markers, so the hash changes when either
side changes), cached like any merged prompt under handle `house`, and a `house` ledger row records
which file(s) and hash are in play. The queue hands each side its own half; a match log's
`promptText` is the side's prompt, never the bundle. Every match row names the house hash it was
played against, so a house change is visible in the record; nothing is re-run automatically. To
change the house: merge the file(s), restart the arena, read the startup line.

The house bot is a fixed Elo 1000 that never moves and does not appear on the ladder.

---

## 5. What runs unattended

- **Sync**: every 60 s the poller lists `entrants/*/pilot.md` on `main`, validates each with the
  entrants validator's rules, and for any *new* content hash writes a `prompt-seen` row, cancels
  that handle's not-yet-started placements, and queues three placements (seeds 7, 11, 42,
  entrant on violet/green/violet, full match on the tournament backend).
- **Queue**: one worker per backend. Priority `organizer` > `bracket` > `placement` > `test`,
  FIFO within a class. Before each job the worker probes the model server's `/health`; if it is
  down it waits 30 s and tries again without touching the job.
- **Every match is re-simulated** (`verifyReplay`) before it counts. A log that does not replay
  is written as `logs/<id>.diverged.json`, a `void` row is appended, and the job is re-queued once
  as a new match id (`retryOf`). A job past its wall cap (3× expected, 60 s floor) is written as
  `unfinished`, marked `timed-out`, and not re-queued.
- **Crash recovery**: on restart, anything `queued` or `started` without a terminal row runs
  again (the startup log says so per job). Scratch text survives a restart because it sits in
  `runs/arena/scratch/<id>.md` until the match ends.

---

## 6. Jam day

### 5.1 The sequence (rulings Q6/Q8/Q9)

Everything below is a button on `/bracket` or `/admin` as the organizer; every press is a ledger
row, so a wrong press is undone by the next one, never by editing history.

| When | Do | What happens |
|---|---|---|
| **Thu 10-01, after the 17:00 CT cutoff** | `/admin` → *Sync now* (so the last merges are in), wait for the placements to finish (`/matches` shows an empty queue), then `/admin` → *Jam-day bracket* → **Create bracket from the ladder** (id `jam`, backend `qwen9b`, cadence **2**, 600 s, pre-run rounds **2**) | A `bracket` row pins every entrant's handle, merged hash and Elo in ladder order; byes go to the top seeds. Nothing runs yet. |
| **Thu night** | `/bracket` → **Run round 1**. When its matches are finished (`done` on the page; ~25 min each, one at a time), **Run round 2** | Round-1/2 matches queue at `bracket` priority and are verified before they count. Both rounds are **held**: only you can see results, match pages, logs or streams; spectators see "held until jam day" and no pairings for later rounds. |
| **Fri, before announcing** | `npm run build` if `src/` changed since the last build; `/matches` should be idle; open `/bracket` yourself in a second browser without the organizer identity (or a phone) to confirm what a remote spectator will actually see, before anyone is watching | — |
| **Fri, opening** | `/bracket` → **Reveal results** on round 1, then on round 2 | Results, pairings and replays appear for everyone. |
| **Fri, replays** | On each revealed slot press **Replay 4×** (`/play/?replay=/logs/<id>.json&speed=4`; the speed control in the top bar also has 1× and 16×) | A 10-minute match plays in 2½; the page re-checks every checkpoint and says `REPLAY DIVERGED` rather than lie. |
| **Fri, semis** | `/bracket` → **Run semi-finals**. Press **Watch live** on the slot (or open `/matches`) — `/play/?live=<id>` | The page shows `QUEUED #n` until the match starts, then `LIVE · 2 s cadence`; the clock runs at the model's pace (~2.5× slower than real time on the 9b model). Any number of browsers can watch; a late joiner catches up in seconds. |
| **Fri, final** | **Run final**, same | The champion line appears on `/bracket` when the final is verified. |
| A full draw | nothing to press | deaths → tower hp → errors → higher seed decides (Q7); the slot says which. |
| A match you do not trust | `/admin` → *Void* it, then the slot's **Re-run (new seed)**; or **Rule** the slot with a reason | Void, re-run and ruling are rows; the bracket re-derives. A re-run is a new match id on a new seed. |
| The model server died mid-match | restart `model_server.py`; the runner holds through call errors and the log still verifies; if the result is silly, void + re-run | — |
| **After** | stop the arena, move `runs/arena/` aside (`runs/jam-2026-10-02/`) — the ledger and logs are the record | The next start is a clean ladder (§5.2 *Reset*). |

Rehearse this once on the mock before Thursday: `npm run arena -- --dev-user you@x --backend mock
--entrants-dir <a tree with two or three entrants>` and click through it; a mock match takes
seconds.

### 5.2 Everyday operator table

| Want | Do |
|---|---|
| Stop new matches starting (an in-flight one finishes) | `/admin` → *Pause*; *Resume* to continue. Both are ledger rows. |
| Drop a match from standings | `/admin` → *Void* with the match id and a reason. Append-only: it stays on the match page marked void. |
| Cancel something queued | `/admin` → *Cancel* next to it (queued only; a running match cannot be cancelled — pause and wait). |
| Force an entrants sync | `/admin` → *Sync now*. |
| Give a handle to the right person | `/admin` → *Handle claims* → *Reassign*. |
| Change the model | edit `runs/arena/config.json` `tournament.backend`, start that model server, restart the arena. The new setting is a new `tournament` row; old matches keep their recorded backend. |
| **Reset for a fresh ladder** | stop the arena, move `runs/arena/` aside (e.g. `runs/arena-pre-jam-<date>/`), start again. The next start has an empty ledger, re-loads the house bot, re-syncs the entrants repo and re-places everyone. Never edit `ledger.jsonl`. |
| Re-verify any log by hand | `npm run match -- --verify runs/arena/logs/<id>.json` |
| Watch a match **live** | `/matches` → *Watch … live*, or `/matches/<id>` → *Watch live* (`/play/?live=<id>`, the game's own page; needs `npm run build`). Works for a queued match (it waits), a running one, and a finished one (plays at the chosen speed). |
| Watch a finished match | `/matches/<id>` → *Watch the replay* (`/play/?replay=/logs/<id>.json`) or *at 4×* (`&speed=4`; the top-bar control has 1×/4×/16×). |

The API the pages use is plain JSON if you want it from a script: `GET /api/me`, `/api/ladder`,
`/api/matches`, `/api/matches/<id>`, `/api/brackets`, `/api/brackets/<id>`;
`GET /api/matches/<id>/events` is the live stream (`text/event-stream`: `meta`, `decision`,
`round`, `checkpoint`, `death`, `progress`, `result`, `end`; `waiting` first for a queued match;
`Last-Event-ID` resumes); `POST /api/tests {handle, source: scratch|merged, prompt?,
opponent: house|<handle>, kind: quick|full}` → `202 {id, position}`; organizer-only `POST
/api/queue/pause|resume`, `/api/sync`, `/api/void {id, reason}`, `/api/claims {email, handle}`,
`/api/matches/<id>/cancel`, `/api/brackets {id, name, backend, cadenceSec, maxSimSec,
preRunRounds, seedBase, top?}`, `/api/brackets/<id>/rounds/<r>/run|reveal`,
`/api/brackets/<id>/slots/<r>/<k>/rerun|ruling {winner: seedNo, reason}`. All of it is behind
Access; a held pre-run match answers 403 to anyone but the organizer.

`curl -N` on the events URL is the quickest way to see a match happen from a terminal.

---

## 7. Tests

`npm run test:arena` — `node --test` over `tools/arena/test_*.mjs` (95 tests): the `arena.` →
`elysium.` redirect, Elo and placements, ledger folds (quota, standings, recovery), the ported
validator, Access JWT refusal, the verify gate and wall cap, the house pair, the bracket (seeding,
byes, the Q7 tie order, the fold through void/re-run/ruling/reveal), the live stream (backlog,
`Last-Event-ID`, a match watched from the queue by two browsers and a late joiner, the live
stream being identical to the one synthesized from the log), the browser driver (`src/live.ts`
bundled and run in Node against a real mock log: never ahead of the server, lands on the log,
stops on a tampered checkpoint, 16× replay paces itself), and headless end-to-ends that boot the
arena on the mock model — ladder, quota, Access refusal, and a whole bracket over HTTP with a
held round hidden from a spectator, and the compile panel (the markdown renderer's escaping, the
rate limiter, the real `compile.py` child against a fake Ollama, a practice match through a fake
schema server). No GPU; it is what CI runs.
