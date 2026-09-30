# Jev backends: Workers AI vs TypeSafe direct, parity (2026-09-30)

TypeSafe reopened signups, and Ceryce set a key as `PROMPTLANE_JEV_API_KEY` (a Windows User
variable). This run adds a direct TypeSafe backend next to Cloudflare Workers AI. It then sends
the same recorded decision states to both and plays one Jam-shape match on each. Everything ran on
Jev; nothing ran on qwen.

**Recommendation: make `typesafe` the default.** The default is **not** flipped here; that's
Ceryce's call. The evidence:

- **It's the same model.** Both report `jev-1.13.0`. Two backends agree with each other exactly as
  often as each one agrees with itself (98.8% vs 98.5% and 98.2% on the decision the server would
  play). No difference showed up beyond Jev's own repeat noise.
- **It's faster.** In the parity run, p50 was 219 ms against 335 ms and p95 was 567 ms against
  860 ms. The matches showed the same thing: p50 214 against 334 ms, and 124 s of wall time
  against 161 s.
- **It costs the same.** Both list $0.042/M input tokens with free output, and both reported the
  same token counts (767.6 mean per decision). That comes to about $0.032 per 1,000 decisions on
  either.
- **It has no token machinery.** An API key doesn't expire, so the typesafe path never renews
  anything. The wrangler-OAuth renewal behind PRs #36 and #42 doesn't exist on this path, and
  neither does `npx wrangler login` as a jam-day dependency.

Keep Workers AI as the fallback. Moving between the two is a server restart with the other
`--jev-backend`.

The risks, stated plainly:

- TypeSafe's published cap is **40 requests/s per account**, and its docs say limits are
  "adjusting dynamically". One headless Jam-shape match drew about 14 requests/s here, so about
  three concurrent full-speed matches would reach the cap. 429s are retried with backoff, but
  they would slow play. Workers AI's own limit for Jev wasn't measured.
- The key belongs to a personal account on a service that paused signups once already (09-22).

**Total spend: $0.17** against the $2 cap. That's $0.043 for the parity run, $0.123 for the two
matches, and under $0.001 for three probe calls.

## What the docs say (read 2026-09-30)

| Page | What it says |
|---|---|
| [docs.typesafe.ai/api.md](https://docs.typesafe.ai/api.md) | `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer <API_KEY>`, body `{state, model, questions}`. The question types are `noul`, `choice` (≤255 options) and `score` (2–10 levels). A noul answer is `{"type": "noul", "noul": p}` with **no `confidence` field**, which only choice and score answers have. Errors: 401 bad key, 422 validation, 429 rate limited, 529 overloaded. |
| [docs.typesafe.ai/models.md](https://docs.typesafe.ai/models.md) | `jev-1.13.0`, with aliases `jev-latest` (stable) and `jev-preview`. $0.042 per M input tokens, output free. **100K tokens/s and 40 requests/s**, and "rate limits are adjusting dynamically". 64k tokens per request, 32k of them for `state` plus the longest question. |
| [docs.typesafe.ai/confidence.md](https://docs.typesafe.ai/confidence.md) | `confidence` is a statistic of a choice or score probability distribution. The page doesn't claim it's calibrated. |
| [docs.typesafe.ai/model-jaggedness/jev-1.13.md](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) | The model is called "fast, calibrated", but "Jev is not a calculator": weak at counting, at arithmetic and at comparing raw numbers. This is the same caveat the translator work has been designing around. |
| [docs.typesafe.ai/sdk/python/api/retries.md](https://docs.typesafe.ai/sdk/python/api/retries.md) | The SDK retries 408, 429 and every 5xx, and honours `Retry-After` / `retry-after-ms`. The typesafe path now retries the same set. |
| [docs.typesafe.ai/sdk/python/api/constants.md](https://docs.typesafe.ai/sdk/python/api/constants.md) | The SDK reads `TYPESAFE_API_KEY`, base URL `https://api.typesafe.ai`, default model `jev-latest`. |
| [developers.cloudflare.com/ai/models/typesafe/jev](https://developers.cloudflare.com/ai/models/typesafe/jev/) | `typesafe/jev` on Workers AI costs $0.042/M input and $0.00 output. It's the same price. |

Two corrections to `docs/jev-decision-model-research.md` §3, which is now updated:

- `jev-latest` is TypeSafe's documented alias. It was previously inferred.
- The rate limit now reads 40 requests/s and 100K tokens/s. It used to read 1,200 requests/min
  and 250K tokens/s.

The confirmed wire shape matches what `client.py` had built from the 09-22 docs. A live probe
answered `{"model": "jev-1.13.0", "answers": {"q1": {"type": "noul", "noul": 0.98}}, "usage":
{"input_tokens": 322, "output_tokens": 21}}` in 0.17–0.31 s.

## What was built

- **`--jev-backend workers-ai|typesafe`** on `house_server.py`, `team_server.py` and
  `schema_server.py`, through `client.make_jev_client`. The default stays `workers-ai`
  (`client.DEFAULT_JEV_BACKEND`, a one-line change). `--backend`, the name the house and team
  servers shipped with, still works as an alias.
- **The wire contract to the game is unchanged.** Both clients return the same `{model, answers,
  usage}`. `/health` gains `jev_backend` on all three servers. On typesafe, `token_source` reads
  `typesafe-api-key` and `token_renewals` stays 0.
- **The key.** It comes from `$PROMPTLANE_JEV_API_KEY`, then the SDK's `$TYPESAFE_API_KEY`. Each is
  read from the process env first and then from the Windows User scope in the registry, so a
  server started from an older shell still finds it. The key is redacted from every error message,
  and the original exception isn't chained. It's kept out of `repr` and `/health`.
  `house_server.py --jev-backend typesafe --check-token` confirms the key without printing it.
- **Retries on typesafe** cover what TypeSafe's SDK retries: 408, 429, and 5xx including 529.
  `retry-after-ms` is honoured. The Workers AI path still retries only 429, exactly as before.
- **`tools/jev/backend_parity.py`** is this run's tool. Tests mock the network (see
  `test_client.py`, `test_house_server.py`, `test_schema_server.py` and `test_backend_parity.py`).

## Parity check: method

```sh
python tools/jev/backend_parity.py --out-json runs/jev-backend-parity-2026-09-30.json --budget-usd 0.40
```

- **Two recorded decision sets,** which are the two shapes of question the arena asks:
  - **House:** 120 real live worksheets from `runs/jev-jam-readiness-worksheets-2026-09-25.json`,
    sampled like `jam_readiness_report.py` (60 rule-3-contested, 60 others). Each is asked
    house-violet.md's rule conditions exactly as `house_server.py` asks them.
  - **Schema:** 216 states. That's each of the three compiled tier cascades
    (`runs/house-tiers-schemas-{easy,medium,hard}-2026-09-30.json`) × 3 instruments × the 12 fixed
    fidelity observations (`scenarios.py`) × both teams, asked exactly as `schema_server.py` asks
    them.
- **Every question is a `noul`,** the only type the game's wire contract uses. So "question type"
  below means the rule condition: one row per house rule, and one row per tier for schemas.
- **Repeats as a noise floor.** Each state went to each backend **twice**. Jev isn't deterministic,
  so a cross-backend flip only counts against the backend's flip rate against itself.
- **Order and load.** Which backend went first alternated on every call round. The order of states
  was shuffled across the two sets. Four states were in flight at a time, since a match has six
  bots asking.
- **What's measured.** Latency is client-side wall time per call, which is what a game tick waits.
  Cost is real `usage.input_tokens` × $0.042/M.
- **Scale.** 336 states and 1,344 calls, with 0 errors and 0 skipped. It took 117 s of wall time.
  The data is in [`jev-backend-parity-2026-09-30.json`](jev-backend-parity-2026-09-30.json).

## Parity check: results

| backend | calls | errors | p50 ms | p95 ms | mean ms | max ms | mean input tokens | $ / 1,000 decisions | spent |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| workers-ai | 672 | 0 | 335 | 860 | 442 | 21,446 | 767.6 | $0.0322 | $0.0217 |
| typesafe | 672 | 0 | **219** | **567** | **252** | 735 | 767.6 | $0.0322 | $0.0217 |

Both backends reported model `jev-1.13.0` and a mean of 131.9 output tokens (unbilled) on every
call. Workers AI's slowest calls were 21.4, 4.0, 1.9 and 1.8 s. TypeSafe never went over 0.74 s.

**Agreement per question type.** A yes/no is counted at the server's own threshold: ≥ 0.5 for
house and > 0.5 for schema. "Cross" averages every pairing of a workers-ai answer with a typesafe
answer to the same state. "Self" is a backend's two answers to the same state.

| question | cross pairs | cross | self workers-ai | self typesafe | mean abs Δnoul |
|---|---:|---:|---:|---:|---:|
| house (all six conditions) | 2,880 | 0.9979 | 0.9972 | 0.9972 | 0.0039 |
| schema: easy | 1,440 | 1.0 | 1.0 | 1.0 | 0.0019 |
| schema: medium | 2,016 | 0.9901 | 0.9901 | 0.9841 | 0.0063 |
| schema: hard | 2,304 | 1.0 | 1.0 | 1.0 | 0.0038 |

| house condition | cross pairs | cross | self workers-ai | self typesafe | mean abs Δnoul |
|---|---:|---:|---:|---:|---:|
| q1 low hp → recall | 480 | 1.0 | 1.0 | 1.0 | 0.0010 |
| q2 tower, no wave → go home | 480 | 1.0 | 1.0 | 1.0 | 0.0005 |
| q3 ability ready | 480 | 1.0 | 1.0 | 1.0 | 0.0029 |
| q4 foe present → attack | 480 | 0.9875 | 0.9833 | 0.9833 | 0.0065 |
| q5 tower present → attack | 480 | 1.0 | 1.0 | 1.0 | 0.0026 |
| q6 wave present → ride | 480 | 1.0 | 1.0 | 1.0 | 0.0099 |

**The decision the server would play,** meaning the house bucket or the schema action:

| set | states | cross | self workers-ai | self typesafe |
|---|---:|---:|---:|---:|
| house | 120 | 0.9875 | 0.9833 | 0.9833 |
| schema: easy | 72 | 1.0 | 1.0 | 1.0 |
| schema: medium | 72 | 0.9653 | 0.9583 | 0.9444 |
| schema: hard | 72 | 1.0 | 1.0 | 1.0 |
| **all** | **336** | **0.9881** | **0.9851** | **0.9821** |

**Where the flips came from.** Only 8 of the 336 states ever produced two different decisions.
Every one of the 8 is a borderline state that flipped **on its own repeat** too:

- 3 house states on q4 vs q5 (attack the foe or the tower)
- 5 medium-tier states: `ability_on_cooldown_enemy_present`, `isolated_vs_grouped_enemy`,
  `ally_under_threat`

No state flipped only across backends. The raw probabilities differ by less than 0.01 on average.

## Jam-shape match on each backend

`house:hard` (violet, `house-hard.prose.md` + the hard schemas) against `house:medium` (green,
`house-violet.md` + the medium schemas). Seed 7, cadence 2, full 600 sim-s: the same shape as
`runs/house-tiers-2026-09-30.md`. Each backend got its own private `schema_server.py`:

- workers-ai on `:8821`
- typesafe on `:8822`

The arena's 8797, evolution's 8805 and 8813 weren't touched. For typesafe, the key was passed in
via env at launch. The matches ran one after the other.

| | workers-ai | typesafe |
|---|---|---|
| result | violet (hard) by timeout | violet (hard) by timeout |
| towers lost violet / green | 1 / 2 | 1 / 2 |
| deaths | green 1 | none |
| Jev calls | 1,659 | 1,752 |
| call errors / parse errors | 0 / 0 | 0 / 0 |
| Jev latency p50 / p95 / max (server `ms`) | 334 / 674 / 1,793 ms | **214 / 537** / 21,242 ms |
| server mean (`/health avg_seconds`) | 0.372 s | **0.249 s** |
| wall time | 161 s | **124 s** |
| token renewals | 0 | 0 (none exist) |
| cost | $0.0599 | $0.0635 |
| replay-verify | ok, 120/120 checkpoints | ok, 120/120 checkpoints |

- **Why typesafe made more calls.** Green made 93 fewer calls on workers-ai. That's consistent
  with its one dead bot: it died at 405 s and missed about 97 two-second decision slots. It isn't
  a backend difference.
- **What one match per backend can show.** A single Jev match can't separate the backend from
  Jev's own match-to-match variance: the same match replayed on the same seed can flip
([`prompt-evolution-smoke-2026-09-30.md`](prompt-evolution-smoke-2026-09-30.md), "Jev determinism"). What it does
  show is that a full Jam-shape match runs cleanly end to end on typesafe, with the same outcome
  shape. The parity check is the evidence that the answers are the same.
- **Logs.** Not in git; each is about 1.2 MB, following the house-tiers precedent of release
  assets. They're on the host at `promptlane/runs/jev-backend-parity-2026-09-30/`, which
  `/runs/*/` ignores:
  - `match-workers-ai-seed7.json`, sha256 `d1ba50cf21bcc5e0e106df78ee488642e9fa7a946175ef7b5300e1277bba970e`
  - `match-typesafe-seed7.json`, sha256 `45060a79f63c8a864b26d7c46b729e086555d5c38b5a39b8745ec01753e979db`

## The one ~21 s call on each backend

Each backend had exactly one call of about 21 s:

- workers-ai: 21.4 s, in the parity run
- typesafe: 21.2 s, in its match, where it shows as the stall between t=120 s and t=180 s

Every other call on either backend finished under 4.1 s. 21 s is Windows' TCP connect
retransmission window (3 + 6 + 12 s). `client.py` opens a fresh TCP+TLS connection per call with
no keep-alive, so one lost SYN costs exactly that. This happened once on each backend, so it
reads as a host network event, not a backend property. It's not fixed here. Two possible
follow-ups:

- a pooled keep-alive connection, which would also shave the per-call handshake off both backends
- a shorter connect timeout, so the retry fires sooner

## Reproduce

```sh
python tools/jev/house_server.py --check-token                          # workers-ai credential
python tools/jev/house_server.py --jev-backend typesafe --check-token   # the TypeSafe key, never printed
python tools/jev/backend_parity.py --out-json runs/x.json               # both backends, ~2 min, ~$0.04
python tools/jev/backend_parity.py --stub                               # plumbing, $0

python tools/jev/schema_server.py --jev-backend workers-ai --port 8821 --budget-usd 0.50
python tools/jev/schema_server.py --jev-backend typesafe   --port 8822 --budget-usd 0.50
npm run match -- --a prompts/pilots/house-hard.prose.md --a-schemas runs/house-tiers-schemas-hard-2026-09-30.json \
    --b prompts/pilots/house-violet.md --b-schemas runs/house-tiers-schemas-medium-2026-09-30.json \
    --jev-schema http://127.0.0.1:8822/ --seed 7 --cadence 2 --out runs/x.json
npm run match -- --verify runs/x.json
```
