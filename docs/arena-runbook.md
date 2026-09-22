# Elysium — the promptlane arena — runbook (Phase A)

The arena is **Elysium** (ruling Q16; the *Hades* stadium where the dead fight for glory forever).
The code paths keep the word `arena` (`tools/arena/`, `runs/arena/`, `npm run arena`) — paths are
not the name. How to run the pre-jam ladder on the workstation, what has to be done by hand on the Cloudflare
side, and what a jam-day operator does. The design is [`arena-site-spec.md`](arena-site-spec.md);
this is the *doing*. Markdown is canonical.

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
| `backends.<id>` | `{kind: http, endpoint, model, avgSecPerCall, timeoutSec}` or `{kind: mock}`; `avgSecPerCall` sizes the wall-clock cap (3× expected) — raise it when the GPU is shared |
| `entrants` | `{kind: gh, repo, ref, syncIntervalSec}` or `{kind: dir, path}` |
| `house` | `{handle, files}` — ordered candidates; a candidate is a `{violet, green}` pair (one prompt per side) or one file; the first whose files all exist wins: the `house-*.md` pair, then `house.md`, then `drums.md` |
| `organizerEmail` | the one organizer (Q19); refused if left as `CHANGE-ME` in Access mode; `ARENA_ORGANIZER_EMAIL` overrides |

Changing the tournament block appends a new `tournament` row; nothing already played is altered.

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

## 3. Seed the house bot

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

## 4. What runs unattended

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

## 5. Jam-day operator (Phase A tools; the bracket is Phase B)

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
| Watch a match | `/matches/<id>` → *Watch the replay* (`/play/?replay=/logs/<id>.json`, the game's own page; needs `npm run build`). |

The API the pages use is plain JSON if you want it from a script: `GET /api/me`, `/api/ladder`,
`/api/matches`, `/api/matches/<id>`; `POST /api/tests {handle, source: scratch|merged, prompt?,
opponent: house|<handle>, kind: quick|full}` → `202 {id, position}`; organizer-only `POST
/api/queue/pause|resume`, `/api/sync`, `/api/void {id, reason}`, `/api/claims {email, handle}`,
`/api/matches/<id>/cancel`. All of it is behind Access.

---

## 6. Tests

`npm run test:arena` — `node --test` over `tools/arena/test_*.mjs`: Elo and placements, ledger
folds (quota, standings, recovery), the ported validator, Access JWT refusal, the verify gate
and wall cap, and a headless end-to-end that boots the arena on the mock model, places an
entrant, runs a quick test over HTTP and reads the ladder. No GPU; it is what CI runs.
