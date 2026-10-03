# Elysium — the promptlane arena — runbook (Phases A + B)

The arena is **Elysium** (ruling Q16; the *Hades* stadium where the dead fight for glory forever).
The code paths keep the word `arena` (`tools/arena/`, `runs/arena/`, `npm run arena`) — paths are
not the name. How to run the pre-jam ladder on the workstation, how it stays up unattended
(section 3 — two scheduled tasks; this is the deployment of record), what has to be done by hand
on the Cloudflare side, and what a jam-day operator does. The design is
[`arena-site-spec.md`](arena-site-spec.md); this is the *doing*. Markdown is canonical.

Everything the arena writes lives under `runs/arena/` (gitignored): `ledger.jsonl` (append-only,
the whole truth), `logs/<matchId>.json` (one replayable match log per match), `prompts/<handle>/`
(content-addressed cache of merged prompts), `schemas/` (the Jev ladder's compiled prose, one file
per prompt hash and compiler version; §1c), `scratch/` (scratch prompt text, deleted when its
match ends).

**The ladder plays on Jev** (both sides, the Jam's path) unless `tournament.backend` says otherwise:
§1c, and [`arena-site-spec.md` §9](arena-site-spec.md#9-jev-as-the-ladders-main-backend-built-2026-09-30).

---

## 1. Start it locally (dev mode)

Dev mode = no Cloudflare Access; every request is you, as organizer. The listener is
`127.0.0.1` only in every mode; nothing else on the machine changes.

```sh
npm ci && npm run build                     # once; `build` produces dist/ for the /play/ replay viewer
cp tools/arena/config.example.json runs/arena/config.json   # edit: organizerEmail
python tools/jev/schema_server.py           # terminal 1 — Jev on :8797, the ladder's backend (§1c)
npm run arena -- --config runs/arena/config.json --dev-user you@inrhythm.com   # terminal 2 — :8790
```

Entrant prose compiles on host Ollama (`$OLLAMA_HOST`, `qwen3.5:9b`) unless `compile.backend` is
`openrouter`. `python tools/model_server.py` (:8787) is only needed for a text-model backend
(`--backend qwen9b`).

Open <http://127.0.0.1:8790/>. Startup log lines to look for:

```
arena: house bot loaded from prompts/pilots/house-violet.md + prompts/pilots/house-green.md (…)
arena: Jev ladder — both sides play compiled schemas on http://127.0.0.1:8797/; house schemas prompts/pilots/house-medium.schemas.json (554c7ea5); entrant prose compiles on ollama (compiler …)
arena: listening on http://127.0.0.1:8790/ (dev mode — every request is you@… (organizer))
arena: tournament ladder backend=jev-schema data=…/runs/arena
```

Flags (`npm run arena -- --help`): `--port`, `--data DIR`, `--backend mock` (no model server;
the game's deterministic mock — what CI runs), `--entrants-dir DIR` (read
`entrants/<handle>/pilot.md` from a local tree instead of GitHub), `--no-sync`, `--house-tier
easy|medium|hard` (which house pair plays; §4).

A fast local smoke without Ollama:

```sh
npm run arena -- --dev-user dev@example.com --backend mock --data /tmp/arena-smoke
```

The entrants poller shells out to `gh api` for `kumouri/jamobair-entrants` (`main`) every 60 s, so
`gh auth status` must be good on the host. It never pushes.

### Config (`runs/arena/config.json`)

| Key | Meaning |
|---|---|
| `tournament.backend` | which `backends` entry ranked matches and tests use — **the per-tournament model setting**; it is recorded in every match log (`backend.model`) and every `finished` ledger row. `jev-schema` (a `kind: "jev-schema-http"` entry) = both sides on Jev, §1c; `qwen9b` = the old text-model ladder |
| `tournament.map` | the map variant every match plays (`pvp-1`; `pvp-1-hp400` is the same map with outer towers at 400 hp and inner at 600, opt-in, runs/tower-hp-2026-10-02.md); checked at startup. Unset = the runner's `DEFAULT_MAP`. Every match also plays the runner's `DEFAULT_RESOLUTION` (`simultaneous-1`, `src/resolution.ts`; no config key), recorded in its log. A Jev match's targets resolve under `DEFAULT_TARGETING` (`own-lane-1`, `tools/jev/target_resolve.py`; no config key), also recorded |
| `tournament.economy` | the economy ruleset every match plays: `null`/unset (none) or a name such as `"eco-2"` (`src/economy.ts`, `docs/economy-spec.md`): respawn, gold, levels and items. Off until Ceryce's go/no-go gate (§6, *The Jam calendar*); checked at startup. A side buys the shopping list (`build`) its compiled schema carries, else its instrument's default. Each log records the ruleset, so changing it never alters a match already played |
| `tournament.objective` | the river objective every match plays (`river-1` = the Bandstand, `river-2` = its redesign, `none` = off; docs/economy-spec.md §9); checked at startup and recorded in every log. Unset = the runner's `DEFAULT_OBJECTIVE`, which is none until the go/no-go gate |
| `tournament.recall` | the recall rule every match plays (`recall-2` = a 4 s channel then a teleport home, `none` = the specimen's 3× run; docs/economy-spec.md §9.10); checked at startup and recorded in every log. Unset = the runner's `DEFAULT_RECALL`, the specimen's recall |
| `tournament.finale` | the finale every match plays (`final-chorus-1` = the Final Chorus: a tower lead at 8:00 wins, level towers start a ×3 sudden death the first tower wins; `none` = play to 10:00; docs/fewer-draws-spec.md §4.1); checked at startup and recorded in every log. Unset = the runner's `DEFAULT_FINALE`, none. The match list shows why each match ended |
| `tournament.cadenceSec` / `maxSimSec` | ranked matches: cadence 2, full 600 s |
| `tournament.quick` | quick tests: 3 sim-min at cadence 4 (ruling Q10) |
| `tournament.placementSeeds` | `[7, 11, 42]` (Q14); sides alternate violet/green/violet (Q15) |
| `tournament.quota` | `{quick: 6, full: 2}` per handle per Central-Time day (Q11); organizer exempt |
| `backends.<id>` | `{kind: jev-schema-http, endpoint, avgSecPerCall, timeoutSec, dailyBudgetUsd, maxUsdPerMatch, maxUnansweredRate, maxConsecutiveUnanswered}` (§1c; the four limits are enforced), `{kind: http, endpoint, model, avgSecPerCall, timeoutSec}` or `{kind: mock}`; `avgSecPerCall` sizes the wall-clock cap (3× expected) — raise it when the GPU is shared. A hosted backend (§1a) also carries `concurrency`, `usdPerMToken`, `dailyBudgetUsd` in the shape `docs/arena-site-spec.md` §5.4 wants; the arena doesn't read those three yet (§1a "not built") — they document the backend for now, the same way `runs/arena/config.json` has always been the record of what a tournament ran on |
| `entrants` | `{kind: gh, repo, ref, syncIntervalSec}` or `{kind: dir, path}` |
| `house` | `{handle, tier}` (the example: `medium`) or `{handle, files}` — ordered candidates; a candidate is a `{violet, green}` pair (one prompt per side) or one file; the first whose files all exist wins: the `house-*.md` pair, then `house.md`, then `drums.md`. `schemas` (default `null` = the tier's `prompts/pilots/house-<tier>.schemas.json`) is what the house plays on a Jev ladder (§4). `backend` (default `null`, text-model ladders only) names a `kind: "jev-http"` entry to have Jev play the house side — §6, *5.3 Jam day with the Jev house bot* |
| `organizerEmail` | the one organizer (Q19); refused if left as `CHANGE-ME` in Access mode; `ARENA_ORGANIZER_EMAIL` overrides |
| `compile` | the `/compile` panel (§1b) **and the Jev ladder's own compiles** (§1c): `backend` (`ollama`/`openrouter`), `model`, per-IP and global limits (panel only), `ipHeader`, `practiceBackend` |
| `submissions` | web teams and submissions (§1d): `enabled`, `cutoff` (ISO instant; the default is the entry cutoff as currently set, §1d, and moves with the Jam: §6, *The Jam calendar*), `maxPromptBytes`, per-person and global rate limits. Absent = those defaults. Accepted submissions are committed to the `entrants` repo |

Changing the tournament block appends a new `tournament` row; nothing already played is altered.

---

## 1a. Hosted text-model backend (OpenRouter) — not the Jam's path

The everyday ladder runs on Jev (§1c). This section is the hosted *text-model* backend, kept as a
per-tournament choice (§5.4) for running prose prompts on a bigger chat model; it is not the Jam's
path. Full cost/latency reasoning is
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
  `compile.py` child; the browser only ever gets the rendered view. A compile costs about
  $0.0015–$0.0037. There is no token cap (ruling 2026-10-02 17:59 CT): the wall clock
  `timeoutSec` (900 s) is the only limit on one compile.
- **Limits:** `perIpPerMinute` 3, `perIpPerDay` 20, `globalPerDay` 400, `maxConcurrent` 1 — in
  memory, so a restart resets them. **Behind the tunnel set `"ipHeader": "cf-connecting-ip"`**, or
  every visitor arrives as 127.0.0.1 and shares one bucket.
- **Practice matches (optional):** start the schema server, then point the panel at it:

  ```
  python tools/jev/schema_server.py              # live Jev: TypeSafe, Workers AI fallback; 127.0.0.1:8797, --budget-usd 0.50
  python tools/jev/schema_server.py --jev-backend workers-ai   # live Jev via Workers AI only (§5.3 step 1)
  python tools/jev/schema_server.py --stub       # $0 plumbing run
  ```

  and set `"compile": {"practiceBackend": "jev-schema"}` (the `jev-schema` backend is already in
  `config.example.json`, and the example sets this already). The entrant's compiled rules play
  violet on Jev against the house bot: a quick test against their handle's quota, never ranked. On
  a Jev ladder (§1c) the house plays its compiled schemas on the same server, and the match is
  metered like any other. On a text-model ladder the house plays `tournament.backend`. The Workers AI token behind the
  fallback renews itself. `python tools/jev/house_server.py --check-token` checks both
  credentials.

  One schema server serves every practice match at once. A pilot that can't reach it holds, and its
  log line says why: `[pilot error: fetch failed <- ECONNREFUSED]`. **Same-tick clusters of
  `ECONNREFUSED` while the server is up** mean a server started from code older than 2026-09-30,
  which had a listen backlog of 5, so a second concurrent match overflowed it. Restart it from
  current develop. The Jev servers and `model_server.py` now listen with a backlog of 128 (see
  [`runs/jev-server-backlog-2026-09-30.md`](../runs/jev-server-backlog-2026-09-30.md)).

---

## 1c. The Jev ladder (default since 2026-09-30)

`tournament.backend: "jev-schema"` makes every ladder match, test, bracket match and practice match
play **both sides on Jev**, the way the Jam does. Design and evidence:
[`arena-site-spec.md` §9](arena-site-spec.md).

- **Entrant side.** The prose is compiled by `tools/jev/compile.py` on `compile.backend` the first
  time a match needs it, then cached in `runs/arena/schemas/<sha256>.<compiler>.json`. Every later
  match of that prompt plays the same rules.
- **House side.** The house plays `prompts/pilots/house-<tier>.schemas.json`; medium is the
  placement bar.
- **Jev.** Every Jev call goes to `tools/jev/schema_server.py`: TypeSafe first, failing over to
  Workers AI. Both are Jev. Each match records which door answered.

**Start the schema server** (the ladder's only model process):

```sh
python tools/jev/house_server.py --check-token        # both credentials: TypeSafe key + Workers AI fallback token
python tools/jev/schema_server.py --budget-usd 10     # 127.0.0.1:8797; --budget-usd is this process's lifetime cap
curl http://127.0.0.1:8797/health                     # "backend": "jev-schema", "jev_backend": "typesafe", "jev_fallback": "workers-ai"
```

`PROMPTLANE_JEV_API_KEY` is a Windows *user* variable. A detached launcher may not inherit it; read
it from the User scope in the launcher, as `run_arena.ps1` loads `arena.env`. `--budget-usd` counts
from process start and resets on restart. Keep it above the arena's `dailyBudgetUsd`, so the arena's
daily cap is the one that bites. It is a backstop, not the budget.

**Spend guard** (on the `jev-schema` backend entry, all enforced):

| Key | Example | What it does |
|---|---|---|
| `dailyBudgetUsd` | `5` | No new match starts once today's (Central) Jev spend on this backend, summed from the ledger, reaches it. Queued matches wait, and `/matches` says why. |
| `maxUsdPerMatch` | `0.25` | Stops a match whose own spend reaches it. The match ends `failed` and is not retried. |
| `maxUnansweredRate` | `0.05` | A side with more unanswered decisions than this fails the match, which is re-queued once. |
| `maxConsecutiveUnanswered` | `30` | This many unanswered decisions in a row stops the match early, as `failed`, re-queued once. |

`null` turns one off. Expected cost: about **$0.06 a full match**, **$0.005–0.01 a quick one**, and
$0 per compile on Ollama (about $0.0006 on OpenRouter). Each match's spend is the `jev` field on its
terminal ledger row: `{calls, unanswered, tokensIn, costUsd, doors, compile}`. Its log has the same
counts under `backend.jev`. Today's total:

```sh
node -e "import('./tools/arena/ledger.mjs').then(({Ledger, jevSpentToday}) => console.log(jevSpentToday(new Ledger('runs/arena/ledger.jsonl').load().state(), 'jev-schema')))"
```

**When something goes wrong, the ladder says so and never falls back to qwen:**

| You see | Meaning | Do |
|---|---|---|
| `/matches`: *Backend `jev-schema` is not starting matches: Jev schema server not reachable* | `schema_server.py` is down | start it; the worker retries every 30 s |
| … *is not a Jev schema server (… backend="ollama")* | the endpoint points at a text-model server | fix `backends.jev-schema.endpoint` |
| … *the schema server resolves targets under first-min only, not own-lane-1* | `schema_server.py` is older than the arena's code | restart it from the arena's checkout |
| … *the schema server plays vocab-1 only, not vocab-2* | `schema_server.py` is older than the vocabulary entrants now compile under (`tools/jev/vocab.py`) | restart it from the arena's checkout |
| … *daily Jev budget reached* / *the schema server's own --budget-usd … is spent* | a cap did its job | wait for the Central day to turn, or raise the cap and restart |
| a match `failed — compile failed — violin: …` | that instrument's prose got no valid schema | it re-runs once by itself; if the retry fails too, the entrant's prose needs work. `/compile` shows them why |
| a match `failed — Jev stopped answering …` / `Jev left too many decisions unanswered …` | Jev outage mid-match | it re-runs once; read the server's `/health` (`jev_fallback_last_error`) and §6 *5.3* step 3 |
| a match `failed — per-match Jev spend cap reached` | a match cost far more than ≈ $0.06 | look at the log before raising `maxUsdPerMatch` |

**Switch the live ladder** (the arena on :8790, `runs/arena/config.json`):

1. Start `schema_server.py` persistently on `127.0.0.1:8797`. A third scheduled task, shaped like
   the other two (§3): `margo-elysium-jev` → `python tools/jev/schema_server.py --budget-usd 10`,
   with its own port guard, logging to `runs/arena/jev-task.log`. Check `/health` as above.
2. In `runs/arena/config.json`, change or add exactly these keys (everything else stays):

   ```json
   "tournament": { "backend": "jev-schema", "map": "pvp-1", ... },
   "backends": {
     "jev-schema": { "kind": "jev-schema-http", "endpoint": "http://127.0.0.1:8797/", "model": "typesafe/jev",
                     "avgSecPerCall": 0.5, "timeoutSec": 30, "dailyBudgetUsd": 5, "maxUsdPerMatch": 0.25,
                     "maxUnansweredRate": 0.05, "maxConsecutiveUnanswered": 30 },
     "qwen9b": { ...unchanged... }, "mock": { ...unchanged... }
   },
   "house": { "handle": "house", "tier": "medium", "files": null, "schemas": null },
   "compile": { "backend": "ollama", "practiceBackend": "jev-schema" }
   ```

   `house` can keep its current `files` list instead: its first pair is medium's, so it plays
   `house-medium.schemas.json` either way. `compile` may stay absent, since the defaults are
   `ollama` and no practice. `practiceBackend` turns on the panel's practice match on the same
   server.
3. Restart the arena: `Stop-ScheduledTask margo-elysium-arena`, then the orphan-port check (§3),
   then `Start-ScheduledTask margo-elysium-arena`. The task's `npm run build` picks up the merged
   code.
4. Read `runs/arena/arena-task.log`. It should show `arena: Jev ladder — both sides play compiled
   schemas on http://127.0.0.1:8797/ …` and `tournament ladder backend=jev-schema`.
5. Optional proof: a quick test from `/test`. Its match page should show
   `Jev: … decisions · $0.00… · answered by typesafe …`.

**Back out:** set `tournament.backend` back to `qwen9b`, make sure `margo-elysium-model` (:8787)
is up, and restart the arena. Jev matches already played keep their recorded backend.

**Elo across the switch.** Standings fold every ranked match in the ledger. If the ladder already
has ranked qwen matches, move `runs/arena/` aside first (§5.2 *Reset for a fresh ladder*), so Jev
ratings don't start from qwen results. On 2026-09-30 the live ledger had no entrants, so there was
nothing to reset.

---

## 1d. Teams and web submissions (`/teams`, `/team`)

Built 2026-10-01 on Ceryce's ask: "a way to view teams and stuff on the website, and to make your
submissions via the website instead of via github". Pull requests keep working exactly as before;
the web is a second door into the same repo.

**What a person sees.**

- **`/teams`**: every entry, web or GitHub. Each row shows the folder name (`alice+bob`), the members' handles with
  lead/learner (lead first, as the folder orders them), and a status: *not submitted yet*,
  *submitted — syncing*, *placing* or *on the ladder*. It also shows the last update, the ladder
  rank · Elo · current W-D-L, and whether the team is managed on the web or by pull request.
- **`/teams/<folder>`**: the pilot as committed (escaped, in a `<pre>`). On a Jev ladder it also
  shows what the ladder's compiler made of the pilot (*compiled* with the rule counts and the
  transparency view, *compiling*, or *failed* with the reason), then the last 20 matches with
  replay and watch-live links.
- **`/team`** (*Your team* in the nav): if you are not on a team, *Create* (you are its lead; pick
  your handle) or *Join* (your handle plus the join code your lead sends you). If you are, the team's
  `pilot.md` sits in a text box and *Submit* commits it. The page then shows the commit and
  "the entrants validator passed it", or the validator's own words for what is wrong, or a conflict
  (below).

Every authenticated viewer sees `/teams`, the same audience as a match log, which already carries
each side's prose. Emails show only to the organizer, and a join code only to the team's members
and the organizer.

**Rules, all enforced server-side** (`tools/arena/teams.mjs`):

| Rule | How |
|---|---|
| Identity | the Access email, exactly as everywhere else (`auth.mjs`) |
| Only members edit | a team's members are emails in the ledger (`team`, `team-member` rows). A self-claimed handle is never enough, so a handle a GitHub entry already names cannot be taken on the web |
| Team shape | the creator is the lead; one learner joins with the join code (10 characters, case-insensitive). A second learner (a team of three) and "Ceryce as lead" are the organizer's to assign, as the entrants README rules |
| Validation | the entrants repo's own `tools/validate_entry.py`, run as itself on the exact bytes to be committed. Below: *one validator* |
| Cutoff | `submissions.cutoff`, the entry cutoff. Its default, `2026-10-16T05:00:00Z` (midnight Central going into Fri 16 Oct, the entrants repo's ruling of 2026-09-30 05:40 CT, which replaced 17:00 CT), was set for the 2026-09-30 plan and moves with the Jam (§6, *The Jam calendar*). From that instant, create, join and submit answer 403. Pages stay readable |
| Size | `maxPromptBytes` 32 KB, a web-form limit only. The validator has no cap, so a bigger entry can still go in by pull request |
| Rate | per Access email: `perUserPerMinute` 2 and `perUserPerDay` 30 submissions; `globalPerDay` 300; joins and creates 5 a minute, 20 a day (so join codes can't be guessed). In memory, like the compile panel's limits; a restart resets them |
| Cross-site posts | the team forms refuse a request whose `Origin` is not this host. **The tunnel must not rewrite `Host`** (cloudflared's default; no `httpHostHeader` on the `elysium.` ingress) |
| Prose is data | never executed or shelled: `gh` gets an argv and the text goes on stdin as JSON. Every page puts it through `esc()` |

### Source of truth: the arena commits into jamobair-entrants

**Decision.** An accepted web submission becomes a commit on the entrants repo's `main`, the ref
the sync polls. The arena keeps no store of its own.

**Why.** It is the option that leaves the ladder's sync path untouched. The poller, placements,
`prompt-seen` rows, the repo's `validate` check and the git history see a web submission exactly as
they see a merged pull request. The arena syncs right after its own write, so placements queue
within seconds. The alternative, a local store that the sync merges with the repo, is the second
source of truth that [`arena-site-spec.md` §3.2](arena-site-spec.md#32-prompt-store-git-backed-vs-upload)
already turned down. It would need a merge rule between two stores, the cutoff would live on one
workstation, and the repo would stop being the jam-day roster.

**How** (`tools/arena/entrants_writer.mjs`). The write goes through the Git Data API via `gh api`:
read `main` and its tree, write one tree, write one commit, then move `refs/heads/main`
fast-forward only (`force: false`). If `main` moved meanwhile because of an unrelated merge, it
re-reads and retries. The commit message is
`entrants/<team>: pilot.md from <handle> (<role>)`; handles only, never an email.

**Credential and scope.** It uses the `gh` login the sync already uses on the host (account
`kumouri`; `gh auth status` lists `repo` among its scopes). **No new secret.** What it needs:

- the `repo` scope (write access to a private repo's contents) — already there;
- the right to update `main` past its branch protection. `main` requires a pull request and the
  `validate` check, with *Do not allow bypassing* off (`enforce_admins: false`). `kumouri` is the
  repo's admin, so its ref update goes through as an admin bypass. GitHub records each one as
  bypassing protection. The `validate` workflow still runs on the push (it triggers on `push` to
  `main`), so the CI gate stays visible.

If bypassing is ever turned off for admins, a web submission answers **502 "GitHub refused the
commit: …"** and writes nothing; pull requests keep working. The fix would be a bypass-list entry
for whichever account the arena's `gh` runs as.

**Same team, edited both ways.** Every web write names the blob it replaces; the form carries it
in a hidden field, and the API takes it as `base`. If `main` holds anything else at that path (a
pull request merged since the page loaded, or a teammate's own web submission), the write is
refused with **409** and nothing is committed. The page shows what the repo has now above the
user's draft; submitting again replaces it knowingly. A pull request still *open* when a web write
lands conflicts on GitHub at merge time. The organizer resolves it there, as for any two pull
requests touching one file.

**One validator.** `tools/arena/entrants_validator/validate_entry.py` is a byte-for-byte copy of
the entrants repo's `tools/validate_entry.py`. The README beside it pins its blob sha and says how
to re-vendor. Every web submission runs that copy on a temp `entrants/<team>/pilot.md`, exactly as
the repo's check runs on a pull request. The copy is pinned rather than fetched because anyone who
can merge to the entrants repo could otherwise run code on this host. Each sync and each write
compare the upstream file's blob sha with the pinned one. **While they differ, web submissions
answer 503** and `/admin` → *Teams* shows both shas. The sync's own JavaScript port of the rules
(`prompts.mjs`) is held to the copy by `test_teams.mjs`, including where Python's regex dialect and
JavaScript's differ.

**A learner joins a team that already has an entry.** One commit moves `entrants/alice/pilot.md` to
`entrants/alice+bob/pilot.md`. The sync then appends `prompt-gone` for `alice`, which leaves the
ladder, and places `alice+bob` as a new entrant from 1000, exactly as if a pull request had renamed
the folder.

**Teams that entered by pull request** are listed, read-only on the web. To let one submit here:
`/admin` → *Teams* → create the team with the folder's handles (lead first) and its members'
emails. That links it, and its members can then edit it from `/team`. The same form makes a team for
a learner with Ceryce as lead, or a team of three. *Disband* forgets a team on the arena only; the
repo is untouched.

**Operator checks.** `gh auth status` must be good on the host, the same as for the sync.
`/admin` → *Teams* shows open/closed with the cutoff, the validator shas, and every team with
member emails and join codes. The API, all behind Access: `GET /api/teams`,
`/api/teams/<folder>`; `POST /api/team/create {handle}`, `/api/team/join {handle, code}`,
`/api/team/submit {prompt, base}` (`base` = the blob sha replaced, `""` for a first submission) →
`201 {folder, commit, hash, blobSha}`, or `422 {problems}`, `409 {conflict}`, `403`, `413`, `429`,
`503`. Organizer-only: `POST /api/teams {leadEmail, leadHandle, learnerEmail?, learnerHandle?,
learner2Email?, learner2Handle?}`, `/api/teams/<teamId>/disband`.

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

Identity is the Access email; the **handle** (a name in the `entrants/<team>` folder) is typed
once, on the Test page or when creating or joining a team, and recorded as a `claim` row. First
come, first served; the organizer reassigns on `/admin`. Team membership is by email, not by
handle (§1d).

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
| `margo-elysium-jev` (**to add** with the Jev ladder, §1c) | `run_jev_task.cmd` → `run_jev.ps1` → `python tools/jev/schema_server.py --budget-usd 10` | `127.0.0.1:8797` |

On a Jev ladder `margo-elysium-model` plays nothing (it serves only the `qwen9b` backend). Leave it
running if a back-out to `qwen9b` should be instant. The Jev task needs `PROMPTLANE_JEV_API_KEY`
from the User scope, plus wrangler's login or `CLOUDFLARE_API_TOKEN` for the Workers AI fallback.

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

That pair is the **medium** house tier. `house-easy-*` and `house-hard-*` are the other two
(different strategies, same model; `prompts/pilots/README.md`, evidence in
[`runs/house-tiers-2026-09-30.md`](../runs/house-tiers-2026-09-30.md)). `config.house.tier` (with
`files` null) or `--house-tier` picks one. **Leave it unset for the ladder and the jam:** the
placement bar is "the house, rated 1000", and a different tier is a different bar. Easy and hard
are for practice or a demo arena. No page picks a tier yet.

The house bot is a fixed Elo 1000 that never moves and does not appear on the ladder.

**On a Jev ladder (§1c)** the house plays its tier's compiled schemas,
`prompts/pilots/house-<tier>.schemas.json` (medium: `house-medium.schemas.json`, the cascades the
tiers were measured with on Jev). Set `house.schemas` to play another file. The `house` ledger row
records the schema file and its hash. A house that resolves to no schema file (a single-file
`house.md` / `drums.md`) stops a Jev ladder at startup with a message saying so.

The same rules can instead be played by Jev (shadow only unless Ceryce flips it): see *5.3 Jam day with the Jev house bot* in §6.

---

## 5. What runs unattended

- **Sync**: every 60 s, and right after a web submission (§1d), the poller lists
  `entrants/*/pilot.md` on `main`. Each folder is one team, named `lead[+learner[+learner]]`. It
  validates each entry with the entrants validator's rules, and for any *new* content hash writes a
  `prompt-seen` row, cancels that entry's not-yet-started placements, and queues three placements
  (seeds 7, 11, 42, entrant on violet/green/violet, full match on the tournament backend). A
  folder that disappears gets a `prompt-gone` row and leaves the ladder.
- **Queue**: one worker per backend. Priority `organizer` > `bracket` > `placement` > `test`,
  FIFO within a class. Before each job the worker probes the model server's `/health`; if it is
  down it waits 30 s and tries again without touching the job. A Jev backend also checks that the
  server really is `jev-schema` and that neither its own cap nor today's `dailyBudgetUsd` is spent,
  and shows any hold on `/matches` (§1c).
- **Jev matches** compile an entrant's prose on its first match (cached after that). They fail
  visibly on a compile failure or a Jev outage, and are re-queued once; a per-match spend cap fails
  a match without a retry. Each match's spend and doors go on its ledger row (§1c).
- **Every match is re-simulated** (`verifyReplay`) before it counts. A log that does not replay
  is written as `logs/<id>.diverged.json`, a `void` row is appended, and the job is re-queued once
  as a new match id (`retryOf`). A job past its wall cap (3× expected, 60 s floor) is written as
  `unfinished`, marked `timed-out`, and not re-queued.
- **Crash recovery**: on restart, anything `queued` or `started` without a terminal row runs
  again (the startup log says so per job). Scratch text survives a restart because it sits in
  `runs/arena/scratch/<id>.md` until the match ends.

---

## 6. Jam day

### The Jam calendar

**Unsettled as of 2026-10-02 03:05 CT.** The date depends on InRhythm's answer on work time.
Ceryce fills in the dates in this table once she sets them. This is the one place the repo gives
Jam dates. Every other doc names the milestone and points here. The dates written on 2026-09-30 for
a Fri 10-16 Jam no longer hold.

The milestones and their order stand:

| Milestone | What it means | Date |
|---|---|---|
| Rulings for entrant-facing work | the vocabulary and late-game decisions are ruled, leaving a day to build and a day to review | not set |
| **The go/no-go gate** (end of day) | economy and objective ship or move to after the Jam (`docs/economy-spec.md` §7, Q10, Q17) | not set |
| **Entrant-facing changes land** | entrants README, template, compile preview, `PROMPTLANE_REF` bump, announcement | not set |
| **Sign-ups close** | | not set |
| **The numbers freeze** | rulesets final; bug fixes only after | not set |
| **The entry cutoff** (midnight Central going into the Jam) | web submissions close (§1d); the training blackout starts | not set |
| The night before the Jam | bracket rounds 1–2 pre-run and held (§5.1) | not set |
| **The Jam** | | not set |

**Current settings that move with the Jam.** These are Ceryce's explicit rulings, not planning
dates. They stay as set until she changes them:

- `submissions.cutoff`, default `2026-10-16T05:00:00Z` (`tools/arena/teams.mjs`,
  `tools/arena/config.example.json`). The entrants repo's ruling of 2026-09-30 05:40 CT.
- The training blackout in `tools/evolve/budget.mjs`, `2026-10-16T00:00:00-05:00` to
  `2026-10-17T00:00:00-05:00`. Ceryce, 2026-10-01 18:44 CT: *"Training cutoff is
  20261016T00:00.00-5"* (`docs/prompt-evolution-spec.md` §7).
- The site copy that shows those dates: `tools/arena/pages/home.mjs` (the Jam on Fri 16 Oct, #68)
  and `tools/arena/pages/teams.mjs` (the cutoff sentence).

### 5.1 The sequence (rulings Q6/Q8/Q9)

Everything below is a button on `/bracket` or `/admin` as the organizer; every press is a ledger
row, so a wrong press is undone by the next one, never by editing history.

| When | Do | What happens |
|---|---|---|
| **After the entry cutoff (midnight Central going into the Jam; *The Jam calendar*)** — web submissions close by themselves at that instant (§1d) | `/admin` → *Sync now* (so the last merges are in), wait for the placements to finish (`/matches` shows an empty queue), then `/admin` → *Jam-day bracket* → **Create bracket from the ladder** (id `jam`, backend `qwen9b`, cadence **2**, 600 s, pre-run rounds **2**) | A `bracket` row pins every entrant's handle, merged hash and Elo in ladder order; byes go to the top seeds. Nothing runs yet. |
| **The night before the Jam** | `/bracket` → **Run round 1**. When its matches are finished (`done` on the page; ~25 min each, one at a time), **Run round 2** | Round-1/2 matches queue at `bracket` priority and are verified before they count. Both rounds are **held**: only you can see results, match pages, logs or streams; spectators see "held until jam day" and no pairings for later rounds. |
| **Jam day, before announcing** | `npm run build` if `src/` changed since the last build; `/matches` should be idle; open `/bracket` yourself in a second browser without the organizer identity (or a phone) to confirm what a remote spectator will actually see, before anyone is watching | — |
| **Jam day, opening** | `/bracket` → **Reveal results** on round 1, then on round 2 | Results, pairings and replays appear for everyone. |
| **Jam day, replays** | On each revealed slot press **Replay 4×** (`/play/?replay=/logs/<id>.json&speed=4`; the speed control in the top bar also has 1× and 16×) | A 10-minute match plays in 2½; the page re-checks every checkpoint and says `REPLAY DIVERGED` rather than lie. |
| **Jam day, semis** | `/bracket` → **Run semi-finals**. Press **Watch live** on the slot (or open `/matches`) — `/play/?live=<id>` | The page shows `QUEUED #n` until the match starts, then `LIVE · 2 s cadence`; the clock runs at the model's pace (~2.5× slower than real time on the 9b model). Any number of browsers can watch; a late joiner catches up in seconds. |
| **Jam day, final** | **Run final**, same | The champion line appears on `/bracket` when the final is verified. |
| A full draw | nothing to press | deaths → tower hp → errors → higher seed decides (Q7); the slot says which. |
| A match you do not trust | `/admin` → *Void* it, then the slot's **Re-run (new seed)**; or **Rule** the slot with a reason | Void, re-run and ruling are rows; the bracket re-derives. A re-run is a new match id on a new seed. |
| The model server died mid-match | restart `model_server.py`; the runner holds through call errors and the log still verifies; if the result is silly, void + re-run | — |
| **After** | stop the arena, move `runs/arena/` aside (`runs/jam-<the Jam's date>/`) — the ledger and logs are the record | The next start is a clean ladder (§5.2 *Reset*). |

Rehearse this once on the mock before the bracket pre-run: `npm run arena -- --dev-user you@x --backend mock
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
| Change the model | edit `runs/arena/config.json` `tournament.backend`, start that model server (`schema_server.py` for `jev-schema`, `model_server.py` for `qwen9b`), restart the arena. The new setting is a new `tournament` row; old matches keep their recorded backend. |
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

### 5.3 Jam day with the Jev house bot

**Shadow by default.** `house.backend` is `null` in every shipped config, so the house bot plays
`house-violet.md`/`house-green.md` on `tournament.backend` like everyone else, and none of this
section applies. Going live is Ceryce's call; when she makes it, this is the whole procedure. The
Jev house bot plays the same rules — Jev answers each rule's condition, code applies them in
order (`tools/jev/rules.py`, rule 3 exact on the live path; the Bandstand rule only in a match
played with the river objective). Background and numbers:
[`runs/jev-house-bot-2026-09-23.md`](../runs/jev-house-bot-2026-09-23.md),
[`runs/jev-jam-readiness-2026-09-25.md`](../runs/jev-jam-readiness-2026-09-25.md).

**1. Backend and credential.** Jev can be reached two ways, and every Jev server
(`house_server.py`, `schema_server.py`, `team_server.py`) chooses between them with
`--jev-backend`. Both serve the same model and answer the same; the wire contract to the game is
identical, and `/health` shows `jev_backend`
([`runs/jev-backend-parity-2026-09-30.md`](../runs/jev-backend-parity-2026-09-30.md)).

| `--jev-backend` | Credential | Notes |
|---|---|---|
| `typesafe` (the default) | `$PROMPTLANE_JEV_API_KEY`, Ceryce's TypeSafe key, set as a Windows User variable. It's read from the registry if the shell predates it, and is never printed. **Plus** the Workers AI credential below, for the fallback. | p50 219 ms and p95 567 ms, measured. The key never expires, so nothing is ever renewed. The published cap is 40 requests/s per account; one full-speed headless match draws about 14. |
| `workers-ai` | a Cloudflare token (below) | p50 335 ms and p95 860 ms, measured. The token needs renewing unless it's `$CLOUDFLARE_API_TOKEN`. |

**typesafe fails over to Workers AI on its own** (Ceryce's ruling, 2026-09-30 08:34 CT: "Typesafe
default, auto-fallback"). TypeSafe gets one attempt per decision, cut off at 8 s. It may answer 429
(rate limited), 408, or 529 or another 5xx (overloaded), or it may be unreachable. Either way, that
same decision goes to Workers AI within the decision's 30 s deadline. For the next
`--jev-fallback-cooldown-sec` (default 10 s, stretched to a `Retry-After`), new decisions skip
TypeSafe and go straight to Workers AI. Then one probe call tries TypeSafe again. The server logs
`[jev-fallback] !!! FAILOVER #n` once per episode, and `RECOVERED` when a probe gets through. A 401
or 422 is not failed over, because Workers AI can't fix a bad key or a bad request (step 4).

- **No Workers AI credential:** the server still starts. It prints one
  `[jev-fallback] WARNING: Workers AI fallback is OFF` line and relies on TypeSafe's own retries
  with backoff.
- **`--no-jev-fallback`** turns it off on purpose, for example to measure TypeSafe alone.
- **Measured:** real TypeSafe never rate-limited, even at 150 decisions/s from 8 concurrent
  matches. With its published 40/s cap enforced in front of it, 4 matches failed over 30 times,
  and every one of 6,847 decisions was answered
  ([`runs/jev-typesafe-fallback-2026-09-30.md`](../runs/jev-typesafe-fallback-2026-09-30.md)).

To run on Workers AI alone, start the server with `--jev-backend workers-ai`; nothing else
changes.

On **`workers-ai`**, and for typesafe's fallback, there are two ways to authenticate, checked in this order:

- **`$CLOUDFLARE_API_TOKEN` (preferred for jam day)** — a dashboard API token with Workers AI
  permission, set in the environment the server starts from. It does not expire mid-jam.
- **Wrangler's OAuth login** (what the workstation uses today). The access token lives about an
  hour; the server renews it on its own once less than `--refresh-margin-sec` (default 900 s = one
  600 s match + slack) is left, writes the new pair back to wrangler's config, and on a 401 retries
  once on a renewed token. Calls that 401 together share **one** renewal, and a brand-new token
  (which Cloudflare 401s for its first ~0.5 s) is never retried on until it is live, so concurrent
  matches on one server don't set off a renewal storm (`runs/jev-client-renew-2026-09-30.md`). Only
  a dead refresh token needs you: `npx wrangler login`.

Check before starting (renews if needed, then exits):

```
python tools/jev/house_server.py --check-token
# token OK: source=typesafe-api-key (PROMPTLANE_JEV_API_KEY or TYPESAFE_API_KEY; does not expire, never renewed)
# fallback workers-ai token OK: source=wrangler-oauth expires in 3078s (margin 900s; the server renews automatically)
python tools/jev/house_server.py --jev-backend workers-ai --check-token
# token OK: source=wrangler-oauth expires in 3599s (margin 900s; the server renews automatically)
```

On typesafe, exit code 1 with `PROMPTLANE_JEV_API_KEY / TYPESAFE_API_KEY is not set` means no key
was found: set `PROMPTLANE_JEV_API_KEY`. A
`fallback: OFF` line means there is no Workers AI credential, so the server will run without the
fallback. Any of these means `npx wrangler login`, then check again:

- a `… NOT OK` line with exit code 1
- a `TOKEN RENEWAL FAILED` line

**2. Start the server** (its own terminal or scheduled task, next to the model server):

```
python tools/jev/house_server.py --port 8798 --budget-usd 3.00                            # TypeSafe, Workers AI fallback
python tools/jev/house_server.py --port 8798 --budget-usd 3.00 --jev-backend workers-ai   # Workers AI only
```

Cost is the same on either backend: about $0.035 per 1,000 Jev calls (measured, `usage.input_tokens` × $0.042/M). A jam-shape
match (600 s, cadence 2) is ~900 house calls ≈ $0.03, so $3 covers ~90 house matches. Past the
budget the bot keeps playing on the fallback below — restart with a bigger `--budget-usd` to put
Jev back.

**3. Watch it.** `curl -s http://127.0.0.1:8798/health` →

| Field | Healthy |
|---|---|
| `jev_backend` | the one you started it with |
| `token_source`, `token_expires_in_sec` | `env` and `null`, or `wrangler-oauth` and a number that climbs back to ~3600 after each renewal; on typesafe, `typesafe-api-key` and `null` |
| `token_renewals` | about one per hour of uptime; always 0 on typesafe. Several a minute means renewals are storming — the bug `runs/jev-client-renew-2026-09-30.md` fixed |
| `jev_fallback` (typesafe) | `workers-ai`. `null` means the Workers AI fallback is off, and `jev_fallback_disabled` says why |
| `jev_fallback_failovers`, `jev_fallback_cooldown_calls` | `0` on a quiet day. When they climb, TypeSafe is refusing and Workers AI is answering in its place, and play goes on. `jev_fallback_cooldown_left_sec` > 0 means that is happening now |
| `jev_fallback_errors` | `0`. Anything else counts decisions that neither backend answered |
| `jev_fallback_token_*` | the Workers AI fallback's token, read the same way as `token_*` above |
| `fallbacks`, `last_fallback_error` | `0` and `null` (these are the rules-in-code fallback of step 4, not the Workers AI one) |
| `cost_usd` / `budget_usd` | well apart |

The server's stderr prints `[jev-token] renewed …` on each renewal.

**4. The fallback — the house bot never stops playing.** If Jev can't answer (network, a 401 that
survived the renewal, the budget), the server decides with the same rules evaluated in code
and prints `[jev-house] !!! FALLBACK #n: … -> rules-in-code rule=… bucket=…`; the first Jev
success afterwards prints `RECOVERED`. If the server itself is down, the arena's pilot does the
same in TypeScript and logs `[jev-house] !!! FALLBACK (server unreachable …)`. Either way the
bearbot plays house-violet.md's rules perfectly instead of holding, and each fallback still counts
as a call error in that match's stats. What to do:

| `last_fallback_error` says | Do |
|---|---|
| `401` / `TOKEN RENEWAL FAILED` (workers-ai) | `npx wrangler login` — the server picks the new token off disk on its next renewal; no restart |
| `typesafe 401` | the key is wrong or revoked: fix `PROMPTLANE_JEV_API_KEY` and restart, or restart with `--jev-backend workers-ai` |
| `workers-ai fallback failed … (after typesafe: 429 …)` | TypeSafe refused the call and Workers AI failed too. Read `jev_fallback_last_error`, and check the Workers AI token with `--check-token` |
| `typesafe 429` / `529` | only happens with the Workers AI fallback off (`jev_fallback` is `null`): TypeSafe's own retries ran out. Give the server a Workers AI credential and restart, or restart with `--jev-backend workers-ai` |
| `BudgetExceeded` | restart the server with a larger `--budget-usd` |
| a timeout / connection error | provider or network trouble; nothing to do, it recovers on its own (restart on the other `--jev-backend` if it doesn't) |
| (arena log: server unreachable) | restart `house_server.py` |
| (arena log: `server unreachable: fetch failed <- ECONNREFUSED` in same-tick bursts, server up) | the server predates the backlog fix (§1b); restart it from current develop |

A match that ran mostly on fallback was played by the rules-in-code house bot, not Jev; it still
counts (same rules), but if that matters for a placement, void and re-run it.

**5. Go live — the one config change.** In `runs/arena/config.json`, with the `jev-house` entry
present under `backends` (copy it from `tools/arena/config.example.json`):

```json
"house": { ..., "backend": "jev-house" }
```

then restart the arena. Only the house side of a
match plays Jev; entrants never do. **Back out:** set `"backend": null` and restart.

---

## 7. Tests

`npm run test:arena` — `node --test` over `tools/arena/test_*.mjs`: the `arena.` →
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
schema server), and the Jev ladder (`test_jev_ladder.mjs`: the compile cache and compiler version,
placements on a fake schema server with spend and doors on the ledger and nothing asking the qwen
port, a compile failure, an outage mid-match, the unanswered-rate rule, both spend caps, the
holds, and the house's schema files), and teams (`test_teams.mjs`: the web refuses what the
entrants repo's check refuses and accepts what it accepts, in its words; the sync's JavaScript port
against the vendored validator on Python-vs-JavaScript regex edges; the cutoff; only members edit;
escaping; the teams pages; commit → placements; a join renaming the folder; a stale edit refused as
a conflict; the rate and size limits; validator drift; the GitHub writer against a fake `gh`). No
GPU and no Jev; it is what CI runs. `test_teams.mjs` needs Python, as `test_compile.mjs` does.
