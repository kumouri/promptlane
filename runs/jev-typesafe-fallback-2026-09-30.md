# Jev: TypeSafe by default, Workers AI as automatic fallback (2026-09-30)

**Ruling.** Ceryce, 2026-09-30 08:34 CT, from a picker: **"Typesafe default, auto-fallback."**
`typesafe` becomes the default Jev backend. It falls back to Cloudflare Workers AI on its own when
TypeSafe rate-limits, so a busy jam day can't stall. The context for the ruling is in
[`jev-backend-parity-2026-09-30.md`](jev-backend-parity-2026-09-30.md): same model, TypeSafe
~35% faster, same price. Everything below ran on Jev; nothing ran on qwen.

**Result.**

- **Every decision answered.** Across three live legs (16 concurrent Jam-shape matches, 26,885
  decisions), 0 went unanswered and every match got 0 call errors.
- **Real TypeSafe never rate-limited.** It stayed clean at up to **150 decisions/s** from 8
  concurrent matches. That's 3.75× its published 40 req/s cap, averaging about 96K tokens/s.
- **The fallback absorbed a simulated cap.** Leg C enforced TypeSafe's published 40/s cap in
  front of the real API. The fallback took 30 failovers in 14 episodes and 15 probes, and Workers AI
  answered 74.5% of the decisions, with 0 unanswered.

**Spend: $0.97** of the $1.50 cap. That's the servers' own `/health cost_usd`, from real
`usage.input_tokens` × $0.042/M. Both backends list the same price.

## What was built

`tools/jev/client.py`:

- **The default.** `DEFAULT_JEV_BACKEND = "typesafe"`, and `make_jev_client("typesafe")` returns a
  `FallbackJevClient`: `SystemOneClient` first, `WorkersAIClient` behind it.
- **Per call.** TypeSafe gets **one attempt**, with no backoff, cut off at **8 s**. On a 429, 408,
  529 or any 5xx (what TypeSafe's own SDK retries), or when it can't connect or times out, the
  **same decision** goes to Workers AI. That happens within the decision's deadline: the server's
  `--timeout`, 30 s, the same as the pilots' `AbortSignal.timeout`. `_open_with_retry` now takes
  that deadline. It cuts each attempt's socket timeout to what's left and skips any retry whose
  backoff would overrun, so the Workers AI call can't outlive the decision either. If under 0.5 s
  is left, the fallback isn't attempted.
- **Cool-down.** A failover also routes new calls straight to Workers AI for
  `--jev-fallback-cooldown-sec`. That's 10 s by default, stretched to a `Retry-After` and capped
  at 60 s. When it runs out, **one** call probes TypeSafe, and calls that arrive while the probe is
  in flight still go to Workers AI. A probe that TypeSafe answers ends the episode and logs
  `RECOVERED`. A failed probe starts another cool-down. The failover is logged once per episode
  (`[jev-fallback] !!! FAILOVER #n`), not once per call.
- **What isn't failed over.** A 401 (bad key) or 422 (bad request) is not failed over. Workers AI
  can't fix either one, and hiding a revoked key behind the fallback would only delay finding out.
- **Workers AI keeps PR #42's single-flight token renewal.** The fallback's token status is in
  `/health` as `jev_fallback_token_*`.
- **No Workers AI credential.** The server still starts and prints one
  `[jev-fallback] WARNING: Workers AI fallback is OFF` line. TypeSafe then keeps its own SDK-style
  retries. `/health` shows `jev_fallback: null` and `jev_fallback_disabled`.
- **`/health`** on all three Jev servers gains these counters: `jev_fallback`,
  `jev_fallback_failovers`, `jev_fallback_cooldown_calls`, `jev_fallback_probes`,
  `jev_fallback_errors` (decisions neither backend answered), `jev_fallback_cooldown_left_sec` and
  `jev_fallback_last_error`.
- **The key is never logged.** TypeSafe errors were already redacted, and the tests check stderr,
  `/health` and every exception for the key.
- **Flags** (`add_jev_backend_args`, on every server):
  - `--no-jev-fallback` gives the bare TypeSafe client. `backend_parity.py` always uses it, so a
    parity run measures each backend alone.
  - `--jev-fallback-cooldown-sec` sets the cool-down.
  - `--jev-backend workers-ai` still selects Workers AI only.
- **`house_server.py --check-token`** checks the fallback's Workers AI token as well. If there
  isn't one, it prints `fallback: OFF`.

Tests: `tools/jev/test_jev_fallback.py` (18 tests, network mocked by URL) covers:

- a 429 answered by Workers AI after one TypeSafe attempt with no sleep
- 529, 503, a timeout and a refused connection each failing over
- 401 and 422 not failing over
- Workers AI failing too, which is counted and redacted
- the cool-down routing to Workers AI, then the probe, then `RECOVERED`
- a failed probe starting a new cool-down
- only one probe at a time
- `Retry-After` stretching the cool-down, up to the cap
- no Workers AI credential: one warning, TypeSafe's own retries, and `--check-token` output
- the deadline arithmetic
- PR #42's 401 renewal on the fallback path

The existing client and server tests move to the new default.

## Live check: method

Each leg ran a private `schema_server.py` on **:8831**, with the default backend and
`--budget-usd 1.20`. The arena's 8797 and evolution's 8805/8813 were untouched. Each leg ran N
concurrent Jam-shape matches:

- violet: `house:hard` (`house-hard.prose.md` + the hard schemas)
- green: `house:medium` (`house-violet.md` + the medium schemas)
- cadence 2, full 600 sim-s, the same shape as the parity run

`/health` was polled every 2 s. "Unanswered" is checked two ways: the server's `errors` and
`jev_fallback_errors`, and the pilots' own `callErrors` summed over every match log. A pilot that
gets no answer holds and logs `[pilot error: …]`.

- **Leg A: 4 matches, seeds 7–10.** The brief's "3–4 concurrent matches" (~58 req/s).
- **Leg B: 8 matches, seeds 11–18.** Leg A didn't draw a single 429, so this pushed to about twice
  the load.
- **Leg C: 4 matches, seeds 7–10, with TypeSafe's published cap enforced.** Real TypeSafe wouldn't
  rate-limit at any load the budget allowed, so a local token-bucket proxy (scratch, not in the
  repo) sat between the server and `api.typesafe.ai`. It allowed **40 req/s** with a burst of 40,
  answered anything over that with `429 {"error": {"type": "rate_limit_error", …}}` and no
  `Retry-After`, and forwarded everything else verbatim to the real API. The server was the
  unchanged `schema_server.py`, started through a four-line wrapper that pointed its
  `SystemOneClient.url` at the proxy. Every decision was still answered by live Jev: by real
  TypeSafe, or by real Workers AI after a failover.

## Live check: results

| | leg A: 4 matches | leg B: 8 matches | leg C: 4 matches, 40/s cap |
|---|---:|---:|---:|
| decisions (server `requests`) | 6,711 | 13,327 | 6,847 |
| **unanswered** (server `errors` / `jev_fallback_errors` / pilot `callErrors`) | **0 / 0 / 0** | **0 / 0 / 0** | **0 / 0 / 0** |
| TypeSafe 429s seen | 0 | 0 | 29 (all from the proxy) |
| failovers (per-call) | 0 | 0 | 30 |
| sent straight to Workers AI during cool-downs | 0 | 0 | 5,074 |
| probes / recovered | 0 / 0 | 0 / 0 | 15 / 14 |
| answered by TypeSafe / Workers AI | 6,711 / 0 | 13,327 / 0 | 1,743 / 5,104 |
| peak decisions/s (2 s window) | 74 | 150 | 58 |
| decision latency p50 / p95 / p99 (server `ms`) | 217 / 548 / 624 ms | 221 / 518 / 620 ms | 326 / 814 / 1,548 ms |
| decisions > 2 s | 2 | 3 | 12 |
| wall time | 116 s | 120 s | 202 s |
| Workers AI token renewals | 0 | 0 | 0 |
| cost | $0.2428 | $0.4817 | $0.2481 |

In leg C, 30 failovers is the proxy's 29 rate-limits plus one real TypeSafe call. The proxy
forwarded that call, but it didn't answer within the 8 s attempt timeout. The client gave up at 8 s
(the proxy logged the aborted connection), and Workers AI answered that decision. So the
connection-failure path was exercised live as well as the 429 path. `jev_fallback_last_error`
showed `timed out` for about 14 s of polls.

Leg C ran in 14 episodes of the same shape:

1. TypeSafe served about 115 decisions (2–3 s at ~50/s).
2. The bucket emptied and the first 429 failed over.
3. Calls already in flight that also 429'd failed over silently, because the episode was already
   logged.
4. For 10 s, everything went to Workers AI.
5. The probe got through, and the log printed `RECOVERED`.

One probe hit the cap again, so its episode got a second cool-down.

**What it costs to be on Workers AI.** Leg C had the same seeds as leg A, but p50 rose from 217 to
326 ms and wall time from 116 to 202 s. That's the known Workers AI latency: 74.5% of leg C's
decisions went there, and the parity run measured p50 335 against 219 ms. Headless matches run as
fast as decisions return, so their wall time tracks latency. At cadence 2, a 0.3–0.8 s decision is
well inside a 2 s decision slot either way. Workers AI answered about 5,100 decisions at up to
~58/s with no error and no 429.

**A tuning note.** A 10 s cool-down moves most of the load off TypeSafe even though, under a
40/s cap, TypeSafe could still serve 40/s. A shorter cool-down would keep more calls on the faster
backend, at the price of more 429 round trips (each ~0.2 s, then the Workers AI call). Real
TypeSafe didn't limit at 150/s, so the real limiter's shape (per second, per minute, tokens) is
unknown. 10 s stays the default until a real 429 is seen. `--jev-fallback-cooldown-sec` tunes it
without a code change.

## The 8.2 s decisions: the old "21 s call", now capped

In legs A and B, all 4 decisions over 2.6 s took **8.21–8.22 s**, and none of them counted as a
failover. `api.typesafe.ai` resolves to four addresses (two IPv4, two IPv6). Python's
`socket.create_connection` applies the timeout **per address** and moves on to the next one when
an address times out. So the most likely reading is:

1. One address's connect hit the new 8 s attempt timeout.
2. The next address connected in about 0.2 s.
3. The call succeeded on TypeSafe, which is why no failover was counted.

The parity run's single ~21 s call per backend fits the same pattern. Windows gives up a connect
after 21 s (3 + 6 + 12 s of SYN retransmits), which is under the old 30 s timeout, and then the
next address worked.

So the 8 s cap now limits that stall to about 8.2 s instead of about 21 s. It happened on 4 of
20,038 decisions. This is inferred from the timing, not traced at the socket level. A shorter
attempt timeout (2–3 s) or a pooled keep-alive connection would shrink it further, and either
would be a follow-up.

## The match results (not a backend comparison)

| seed | leg A (TypeSafe) | leg C (mostly Workers AI) |
|---|---|---|
| 7 | draw by timeout | violet by timeout |
| 8 | draw by timeout | violet by timeout |
| 9 | violet by timeout | draw by timeout |
| 10 | violet by timeout | violet by timeout |

Leg B: violet won seeds 11, 13, 15 and 17 by timeout, and 12, 14, 16 and 18 were draws. Jev isn't
deterministic, so a replay on the same seed can flip
([`prompt-evolution-smoke-2026-09-30.md`](prompt-evolution-smoke-2026-09-30.md)). These outcomes
say nothing about the backends; the parity run is the evidence that the answers match.

## Logs

The logs aren't in git (~1.2 MB per match; the house-tiers precedent). They're on the host at
`promptlane-worktrees/jev-typesafe-default/runs/jev-fallback-live-2026-09-30/`, which `/runs/*/`
ignores:

- `match-leg{A,B,C}-seed*.json` (16 match logs)
- `health-leg*.jsonl` (the 2 s `/health` polls)
- `server-leg*.log` (the `[jev-fallback]` lines)
- `proxy-legC-stats.json`

sha256 of the leg C match logs:

- `match-legC-seed7.json` `ae0e3063a767f55fee8ec4f8e53fdf520f4e4caa1f8fc82b50205677883257fb`
- `match-legC-seed8.json` `e08f5f007d07ee6543d17fd3e6c8b67959b37a14ae8adc90c3ff1f0c590874a3`
- `match-legC-seed9.json` `6eeb2206fd0103e5cd89698d9ae14d9bf2af8f66f4703f07f08de0336009dc2f`
- `match-legC-seed10.json` `2fe8cc3f7ea0fbed83127ec1406faa6e3937d9a67c75f7977e4383eca9b76d82`

## Reproduce

```sh
python -m unittest tools/jev/test_jev_fallback.py                       # the mocked tests, $0
python tools/jev/house_server.py --check-token                           # TypeSafe key + the fallback's Workers AI token

python tools/jev/schema_server.py --port 8831 --budget-usd 1.20          # default: typesafe, Workers AI fallback
npm run match -- --a prompts/pilots/house-hard.prose.md --a-schemas runs/house-tiers-schemas-hard-2026-09-30.json \
    --b prompts/pilots/house-violet.md --b-schemas runs/house-tiers-schemas-medium-2026-09-30.json \
    --jev-schema http://127.0.0.1:8831/ --seed 7 --cadence 2 --out runs/x.json   # x4 in parallel, seeds 7-10
curl -s http://127.0.0.1:8831/health                                      # jev_fallback_* counters
```
