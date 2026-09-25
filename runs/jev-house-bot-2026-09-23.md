# Jev house bot — built and run live, 2026-09-23

**SHADOW ONLY.** Per Ceryce (Telegram, 2026-09-23 13:14 CT): *"Jev house bot, I'll decide whether or
not it goes live later."* Today's house bot (`prompts/pilots/house-violet.md`/`house-green.md`
played by `qwen3.5:9b` via `tools/model_server.py --backend ollama`) is unchanged and stays the
default everywhere — nothing an entrant plays against changed. This doc builds
`docs/jev-decision-model-research.md` §6's option 3 for real and reports what a real head-to-head
looked like. **Going live is one config change — see "Going live" below.**

## What was built

Per the memo's §4 ("not a config entry... a new `Backend` kind"): Jev has no `prompt` field, so its
decision logic moves into code, not a model reply.

| File | What | Frozen files touched |
|---|---|---|
| `tools/jev/house_server.py` | HTTP server: worksheet in, `{bucket, rule, answers, ms}` out. Reuses `tools/jev/{client,rules,serializer}.py` unchanged — the question set, the rule-order cascade (`first_match`), the state paragraph. Own `--budget-usd` cap (default $1). | none |
| `tools/match/jevPilot.ts` | `extractWorksheet` (Observation → house-violet.md's five worksheet fields, in code) and `bucketToAction` (bucket → a real `Action` with a real target). Lives outside `src/pilots/` — that directory is the frozen v1 specimen. Holds (`{kind:'hold'}`) on any transport failure, never throws. | none |
| `tools/match/headless.ts` | Additive: `RunOptions.decisionPilotFor`, an optional per-bot pilot override. Omitted (the default), a match is byte-for-byte identical to before — the existing 83-test `npm run test:arena` suite passes unchanged, and a mock smoke match (`node tools/match/cli.mjs --model mock`) was re-run to confirm. | none (reads `src/pilots/promptPilot.ts`, `src/sim/map.ts` — read-only imports, same posture as the existing code) |
| `tools/arena/queue.mjs`, `server.mjs`, `config.example.json` | The one config change to go live (below); validated at config load; covered by a new `test_queue.mjs` test that runs a real match through the wiring against a local stub HTTP server. | none |
| `tools/jev/run_house_bench.mjs` | The head-to-head benchmark script used for the numbers below. | none |

Tests: `tools/jev/test_house_server.py` (new, 5 tests, no network — a fake client), the full
`python -m unittest discover -s tools -p "test_*.py"` (107 tests) and `npm run test:arena` (85
tests, was 83) all green; `npm run typecheck` and `npm run build` clean.

> **Fixed 2026-09-25** (`runs/jev-jam-readiness-2026-09-25.md`): the live path now sends the foe's
> kind and hp and asks the exact rule 3; the offline harness keeps the approximation. The paragraph
> below describes this run as it was.

**Where q3 stayed a known approximation on purpose.** `rules.py`'s `q3_ability_ready` asks the same
reduced condition (cd is 0, a foe is present) for every instrument, even though violin/drums'
real rule also needs "foe is a bearbot under 100 hp" — a limitation the offline harness had because
the logged data didn't carry foe kind/hp. A *live* match does have that data, but this build reuses
`rules.py` unchanged rather than writing a second, live-only version of rule 3 — keeping the
question set identical to what the suitability harness already measured, at the cost of carrying
the same known over-trigger risk for violin/drums abilities into live play. Flagged, not fixed,
because fixing it means the live numbers below would no longer be comparable to
`runs/jev-suitability-harness-2026-09-22.md`'s.

## How the test was run

Both sides played the *identical* rule table (`house-violet.md`/`house-green.md`, unedited) — only
the model deciding each side's answers differs, so any difference in outcome traces to the model,
not the rules:

- **Violet = Jev house bot**, via `tools/jev/house_server.py --backend workers-ai --budget-usd 1.00`
  (Cloudflare Workers AI, `typesafe/jev` — TypeSafe's own direct signups are still paused, per
  `runs/jev-suitability-harness-2026-09-22.md`).
- **Green = today's house bot**, via `tools/model_server.py --backend ollama --model qwen3.5:9b`,
  confirmed as the arena's actual default by reading `tools/arena/config.example.json`
  (`tournament.backend: "qwen9b"` → `{"kind":"http","model":"qwen3.5:9b", ...}`), not assumed.
- 20 matches, seeds 1–20, **quick shape** (`cadenceSec: 4`, `maxSimSec: 180`) — this repo's own
  existing fast-test configuration (`tournament.quick` in the same config file), chosen over the
  600 s "full" shape for wall-clock reasons: `qwen3.5:9b` on this host's single-GPU Ollama serialises
  concurrent calls (~1.8 s/call measured), and a 600 s × cadence-2 match would have meant roughly
  300 rounds × 3 house bots each side queued behind that one GPU — a multi-hour run for 20 matches,
  not a same-session one. **Not tested: whether the numbers below hold at the 600 s/cadence-2 shape
  jam day actually uses.** That's the honest gap this budget didn't reach.
- Budget: **$1.00 / 20 matches**, both from the task brief. Actual spend: **$0.0917** (2,602 Jev
  calls, 2,183,382 input tokens, real `usage.input_tokens`, not estimated) — the whole run landed at
  under a tenth of the cap, so no match was cut short by budget.

## Headline numbers (measured, this run)

| | Jev house bot (violet) | qwen3.5:9b house bot (green) |
|---|---:|---:|
| Matches won | 0 | 0 |
| Draws (of 20) | 20 | 20 |
| Real decisions | 2,580 | 2,257 |
| Tick latency mean / p50 / p90 (sec) | 0.934 / 0.487 / 1.913 | 1.825 / 1.615 / 2.909 |
| Decision failures (transport/parse) | 3 / 0 | 0 / 4 |
| Own bearbot deaths (of that side's 3) | 0 | 19 |
| Towers lost | 0 | 0 |
| Low-hp-recall compliance | 2/2 = **100%** (n=2, see caveat) | 54/100 = **54%** |

**All 20 matches were draws by 180 s timeout — no nexus fell either way.** This matches the
project's own prior finding at the *600 s* shape (`runs/historical-v1.md`: three seed-1/42 matches,
all "Timeout, draw", zero bearbot deaths on either side under the historical `ScriptedPilot`/v1
prompt). Under quick's shorter 180 s cap and rule-based house-vs-house play, neither side reliably
takes a nexus — win rate is not a discriminating metric here, and is not read as one below.

**Latency: Jev is faster, by about 2x on mean and p50, less dramatically at p90.** 0.934s vs 1.825s
mean is a real, measured difference, but well short of the memo's vendor-quoted 20–200x or the
suitability harness's own offline mean (0.639s) — most likely because this run's Jev calls compete
with the same host's other traffic and this qwen backend is a locally-hosted 9B model already fast
by hosted-LLM standards (not the multi-second frontier-model comparisons the vendor's own numbers
use). p90 for Jev (1.913s) overlaps qwen's p50 (1.615s) — Jev is consistently faster on the typical
case, not uniformly faster on the tail.

**Decision failures: 3 transport failures on Jev (0.12% of calls), 4 parse failures on qwen (0.18%
of calls) — different failure *kinds*, as the memo predicted.** All 3 Jev failures were the same
transient `401` from Cloudflare Workers AI (`workers-ai 401: ...Authentication error`), one each in
3 different matches (seeds 1, 12, 16), never twice in the same match, never fatal — each one held
(`{kind:'hold'}`) and the match continued. This is exactly memo §4's prediction: *"the parse-failure
reason for hold becomes unreachable dead code under a Jev backend... the backend-had-a-bad-day
reason... stays exactly as necessary as it ever was."* Confirmed here empirically: Jev had zero
parse failures (structurally impossible, per the memo) and a small, real rate of transport failures;
qwen had the opposite — zero transport failures (rock-solid on a local Ollama with no network hop)
and 4 parse failures (qwen occasionally doesn't reply with parseable JSON).

**Low-hp-recall compliance: qwen 54%, Jev 100% but on almost no data — don't read the 100% as a
result.** The task brief cites 46% for qwen from `runs/house-prompt-2026-09-21.md`; this run
measured 54% (54/100) under a different opponent and a shorter match — same rule (self-reported
`hp < 75` → `"kind":"recall"`), a different match context, so "close, not identical" is the honest
read, not confirmation of the same number. **Jev's n=2 is the more important number here than its
100%**: across 2,580 real Jev decisions, its bearbots' *real* hp (not self-reported — Jev's worksheet
extraction reads live `Observation.self.hp` directly, since Jev has no self-report step to get
wrong) dropped below 75 only twice in the whole 20-match run. That is downstream of the finding
below, not an independent one.

## Why zero deaths on the Jev side: it barely fights

| Action bucket / kind | Jev (2,580 decisions) | qwen (2,253 decisions) |
|---|---:|---:|
| move-home / `go_home` | 834 | *(folded into `move` below)* |
| ride-wave / `move` (other) | 1,155 | move total: **1,585** |
| ability | 510 | 235 |
| attack (foe or tower) | 65 + 11 = **76** | **378** |
| recall | 2 | 55 |

**Jev's bearbots attack 5x less often than qwen's (76 vs 378 attack actions, out of similar overall
call counts) and spend most of their time riding a wave or heading home (1,989 of 2,580 decisions,
77%).** This — not a stronger combat model — is the most likely explanation for zero Jev-side
deaths: bots that rarely engage rarely take lethal damage. This is an *inference from the action
distribution*, not something the harness directly measures (it never built a "why" metric); it is
consistent with, but not proven by, the numbers above. The likely mechanism: rule 2 (tower visible,
wave 0 → go home) and rule 6 (no foe, no tower, wave ≥ 1 → ride wave) are evaluated *before* rules
4/5 (attack foe/tower) in the fixed rule-order cascade (`rules.first_match`, unchanged from the
harness), so if Jev answers q2 or q6 "yes" more readily than the ground truth a perfectly rule-
following model would, attack opportunities never get asked. Whether that is miscalibration on q2/q6
specifically, or a real difference in how often those conditions are actually true in *this* live
matchup (Jev's opponent, unlike the offline harness's qwen-vs-qwen logs, is qwen playing back) is
not established by this run — it would need per-question ground-truth comparison against live
Observations, which this run did not build (out of scope for the budget; the offline harness's own
per-question accuracy numbers, 95–100%, come from a *different* population of game states and do not
transfer here by assumption).

## Is Jev harder, easier, or the same as what entrants will actually face?

**Easier, on the evidence here — plainly stated, with the caveat that this was never tested at jam
cadence/duration.** A house bot that attacks a fifth as often and never lost a single bearbot across
20 matches is a passive opponent relative to today's default. If this went live unchanged, the most
likely effect on `docs/jev-decision-model-research.md`'s cited "is it winnable" tuning (closed
2026-09-22) is that the arena would get *easier to beat*, not harder — the opposite direction a
naive "faster, cheaper, and just as good" read of the memo's vendor numbers might suggest. This
conclusion rests entirely on the quick-shape, 180 s data above; it was not re-tested at the actual
jam shape (600 s, cadence 2), and passivity that shows up in three-minute matches could look
different over ten.

## Going live

One config change, nothing else, per Ceryce's brief:

```json
"house": { "backend": "jev-house" }
```

in whichever `config.json` the arena actually runs with, alongside a `"jev-house"` entry under
`backends`:

```json
"jev-house": { "kind": "jev-http", "endpoint": "http://127.0.0.1:8798/", "timeoutSec": 30 }
```

(both already present, commented for clarity, in `tools/arena/config.example.json`, with
`house.backend` left `null` so today's example config is unaffected). `tools/jev/house_server.py`
must be running at that endpoint. Unset (`null`, the shipped default), the house bot plays
`tournament.backend` exactly as it does today — entrants are never routed through Jev either way.

## What more the budget would buy

The $1/20-match budget was not the binding constraint (actual spend $0.09) — wall-clock time was
(qwen's serialised Ollama calls, ~85–245s wall per 180s-sim match). What this run did **not** answer,
that a larger budget of wall-clock time (not dollars) would:

1. **The jam shape itself** (600s, cadence 2) — untested here for the reason above. Cheapest next
   step: 3-5 matches at the real shape, not 20, to see whether the passivity finding holds.
2. **Why q2/q6 fire so much more than q4/q5 in live play** — would need per-tick ground-truth
   comparison against live `Observation`s (this run only has the aggregate bucket distribution, not
   a per-question accuracy number for this specific matchup).
3. **Jev vs a real entrant prompt**, not house-vs-house — this run, like the suitability harness
   before it, only ever tested Jev against the rule-following house prompt's own logic; nothing here
   says how a Jev house bot performs against the kind of free-text prompt an actual entrant submits.
