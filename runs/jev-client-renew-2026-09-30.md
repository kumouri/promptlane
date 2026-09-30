# Jev client: token-renewal storm under concurrency, fixed (2026-09-30)

The house-tiers Jev rerun (PR #40, `runs/house-tiers-2026-09-30.md`) logged 111 token renewals and
61 unanswered decisions when two matches shared one `schema_server.py`. This run finds the cause,
fixes it in `tools/jev/client.py`, and measures before and after on live Jev. All of it ran on Jev
via Workers AI; nothing ran on qwen.

## What was actually going on

The brief's diagnosis was that every 401 forces its own renewal, with no check for whether another
thread had just renewed. That was true, but it doesn't explain what *starts* a burst of 401s, or
why the retries failed too. Three live probes, all tiny one-question Jev calls:

| Probe | Result |
|---|---|
| Renew once, then call with the **old** token for 25 s | 200 every time. A renewal does **not** revoke the token it replaces. |
| Renew, then fire **6 concurrent** calls with the new token at once, and again 3 s later (3 rounds) | **6/6 401 at t = 0**, 6/6 200 at t = 3 s, all 3 rounds. The old token got 6/6 200 both times. |
| Renew, then poll the new token every 0.1 s (5 rounds) | First 200 at 0.35 / 0.54 / 0.00 / 0.32 / 0.00 s. No 401 ever came after the first 200. |

**A freshly minted access token answers 401 for up to ~0.5 s**, and not after every renewal. The
storm fed itself like this:

1. A renewal mints a token that isn't live yet.
2. Every concurrent call using it gets a 401.
3. Each 401 forced another renewal, which minted another token that wasn't live yet.
4. Each call's one retry went out on that new, not-yet-live token and 401'd again. That is why
   almost every retry failed.

PR #40's server log starts exactly this way: one startup renewal, then four 401s, then four
renewals, and it went on like that for the whole run. The one-renewal-at-a-time fix in the brief is
necessary but not sufficient on its own. A 401 on a token that is still *current* but not yet live
would still renew.

## The fix (`tools/jev/client.py`)

`WranglerOAuthToken`:

- **Single-flight per credential.** One lock per credential file, shared by every provider in the
  process. A 401 hands the failed token to `force_refresh(failed)`. If the current token is already
  a different one, there is **no renewal**: the call retries on the current token. Concurrent 401s
  wait on the lock for the one renewal and then see that the token has changed.
- **No renewal for a 401 on a token that is still warming up.** A token minted less than
  `warmup_sec` ago (default 2 s, about 4× the worst case measured) gets its warm-up waited out and
  is retried as it is.
- **The warm-up is bridged.** After a proactive renewal, `token()` keeps handing out the token it
  replaced until the new one is warm. The old token is still valid, so nobody waits.
- **No handing out a token that has 401'd.** After a forced renewal, the token it replaced is not
  handed out again. With no valid previous token (e.g. at startup with an expired one), `token()`
  waits out the warm-up, outside the lock.
- Kept from PR #36: proactive renewal inside the margin, write-back of the rotated pair, picking up
  a token another process renewed, and one retry per call.
- `status()` gains `token_renewals`, so the house server's `/health` can show a storm.

`WorkersAIClient.ask` passes the token it sent to `force_refresh`, then retries once.

## Tests (network mocked)

`tools/jev/test_token_refresh.py`, 20 tests. The ones for this bug:

- `test_n_concurrent_401s_cost_exactly_one_renewal`: 8 threads, 8 concurrent 401s → 1 exchange,
  all 8 get the new token.
- `test_stale_401_after_a_renewal_does_not_renew_again`: a 401 on the old token after a renewal →
  no second exchange.
- `test_401_on_a_token_still_warming_up_waits_instead_of_renewing`.
- `test_two_providers_on_one_credential_share_the_flight`.
- `test_concurrent_401s_through_the_client_cost_one_renewal_and_no_unanswered_call`: the storm in
  miniature through a stub `/ai/run` that rejects the revoked token and 401s every new token for
  its first 0.15 s. 8 concurrent calls, 1 exchange, every call answered, and no retry ever lands on
  a token that isn't live yet.

The whole `tools/jev` suite passes (306 tests).

## Live check on Jev

A private `schema_server.py` per leg: port **8821** for before and **8822** for after (not the
arena's 8797 or the harness's 8805), `--budget-usd 0.40`. Nothing else on the host was using Jev.
"Before" is develop's `client.py` (`a987e99`) in a copy of `tools/jev`. "After" is this branch.
Each leg ran two Jam-shape matches (cadence 2, 600 sim-s) **at the same time**, the same pair PR
#40 ran side by side: hard vs medium and medium vs hard, both seed 7, on PR #40's compiled tier
schemas.

The trigger was a renewal under concurrent load. Each server started with `--refresh-margin-sec`
just above the token's remaining life, so the first burst of calls renewed. This mirrors PR #40's
startup renewal, and the new token outlives the margin, so no second proactive renewal happens.

| Leg | Renewals | 401s | Unanswered for a token reason (server `errors`) | Server requests | Jev $ |
|---|---:|---:|---:|---:|---:|
| **Before**, develop | **20** | **19** | **12** (all `502` → held) | 3,335 | 0.121 |
| **After**, this branch | **1** | **0** | **0** | 3,246 | 0.117 |

A first before-leg with a *proactive* renewal 45 s into the matches did not storm: 1 renewal, 0
401s, 0 errors, 3,266 decisions, $0.117. The not-yet-live window doesn't open on every renewal (2 of
5 probe renewals had none), so a single renewal can get lucky. It is recorded here because it shows
a storm needs a renewal that lands in that window.

**The forced path, live.** Neither match leg makes the *current* token 401. A probe did: it swapped
a provider's in-memory token for a bogus one and fired 12 concurrent `WorkersAIClient.ask` calls.
Wrangler's file was not touched, apart from the real renewal writing its new pair, as every renewal
does.

| Code | Variant | Renewals | Calls answered |
|---|---|---:|---:|
| develop | valid token on disk | 11 | 5 / 12 |
| this branch | valid token on disk | **0** (picked the disk token up) | **12 / 12** |
| develop | disk also shows the bogus token, so a real exchange is needed | 12 | 3 / 12 |
| this branch | same, run twice | **1**, **1** | **12 / 12**, **12 / 12** |

**Spend:** about **$0.37** in total: three match legs at $0.12 each, one aborted leg with a bad
margin (killed after 28 s, under $0.02), and the probes (~$0.001). The wrangler token checked OK
afterwards (`house_server.py --check-token`).

## Not fixed here: `fetch failed` under concurrent matches

Every leg, before and after, had pilot-side `[pilot error: fetch failed]` decisions: 8, 17 and 16
across the pair. They come in same-tick clusters of 3–4 bots and never reach the server. They are
a local connection failure between `jevSchemaPilot.ts` and `schema_server.py`, not Jev and not the
token. **Hypothesis (unverified):** `ThreadingHTTPServer`'s default listen backlog is 5
(`socketserver.TCPServer.request_queue_size`), and two matches put up to 12 pilots on one server.
Each failure is one held decision (0.2–0.5 % of calls). That matters for the practice panel and
the Jam, and it's worth its own look.

## Reproduce

The rig scripts are in the session scratchpad, not the repo. They come down to this:

```sh
# a private port; margin = token's seconds left + 30, so the first calls renew under load
python tools/jev/schema_server.py --port 8822 --budget-usd 0.40 --refresh-margin-sec <left+30>
npm run match -- --a prompts/pilots/house-hard.prose.md --a-schemas runs/house-tiers-schemas-hard-2026-09-30.json \
  --b prompts/pilots/house-violet.md --b-schemas runs/house-tiers-schemas-medium-2026-09-30.json \
  --jev-schema http://127.0.0.1:8822/ --seed 7 --cadence 2 --out x1.json &
npm run match -- --a prompts/pilots/house-violet.md --a-schemas runs/house-tiers-schemas-medium-2026-09-30.json \
  --b prompts/pilots/house-hard.prose.md --b-schemas runs/house-tiers-schemas-hard-2026-09-30.json \
  --jev-schema http://127.0.0.1:8822/ --seed 7 --cadence 2 --out x2.json &
wait; curl -s http://127.0.0.1:8822/health        # errors
grep -c "renewed" server.log; grep -c "answered 401" server.log
```

The tier prose and compiled schemas came in with PR #40.
