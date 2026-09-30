# Jev servers: `fetch failed` under concurrent matches, fixed (2026-09-30)

The Jev client fix (PR #42, `runs/jev-client-renew-2026-09-30.md`) found `[pilot error: fetch
failed]` decisions in every leg where two matches shared one `schema_server.py`: 8, 17 and 16 per
pair. They came in same-tick clusters of 3–4 bots and never reached the server. This run finds the
cause, fixes it, and measures before and after on live Jev. Nothing ran on qwen.

## Cause: a listen backlog of 5

All three Jev servers were already `ThreadingHTTPServer`, so a single-threaded server was never the
problem. The listen backlog was. `socketserver.TCPServer.request_queue_size` defaults to **5**. Every
bot in a match asks on the same tick, each on a fresh connection, because the handlers speak
HTTP/1.0 and nothing is kept alive. One match is 6 bots. Two matches on one server are 12 connects
in the same instant. Past the fifth one still waiting to be accepted, **Windows refuses the
connection**. Node's fetch reports that as a bare `fetch failed`, with `ECONNREFUSED` on
`err.cause`, which the pilots used to drop.

Evidence, from cheapest to live:

**1. Synthetic, $0.** The real handler on a `ThreadingHTTPServer`, with `decide()` replaced by a
0.45–1.35 s sleep (Jev's latency), and N concurrent POSTs per round from Node's fetch:

| Backlog | Concurrent per round × rounds | Failed | Cause |
|---|---|---:|---|
| 5 (stdlib) | 6 × 60 (one match) | **0** / 360 | — |
| 5 (stdlib) | 12 × 30 (two matches) | **66** / 360 | all `ECONNREFUSED` |
| 5 (stdlib) | 24 × 20 | **159** / 480 | all `ECONNREFUSED` |
| 128 | 12 × 30 | **0** / 360 | — |
| 128 | 24 × 20 | **0** / 480 | — |
| 128 | 64 × 10 | **0** / 640 | — |

One match fits in 5 and two don't, which is exactly the pattern PR #42 saw.

**2. Socket level.** Against a server that isn't accepting, the stdlib default queues exactly 5
connects and refuses the sixth (`test_local_http.py`'s Windows-only control test pins this).
Backlog 128 queues all 32.

**3. Live on Jev**, below: 13 `ECONNREFUSED` before, 0 after.

The keep-alive/agent-limit theory on the client side doesn't fit. Every failure is a refused
*connect*, none is a reset on a reused socket, and one match alone never fails.

## The fix

- `tools/jev/local_http.py`: `BurstTolerantHTTPServer`, a `ThreadingHTTPServer` with
  `request_queue_size = 128` and daemon threads. `schema_server.py`, `house_server.py` and
  `team_server.py` all serve with it.
- `tools/model_server.py`, the chat-model server the arena also shares across matches, had the same
  stdlib default. It gets the same 3-line subclass (the file stays standalone).
- The pilots (`tools/match/jevPilot.ts`, `jevSchemaPilot.ts`, `jevTeamPilot.ts`) now report the
  cause: `[pilot error: fetch failed <- ECONNREFUSED]` instead of `[pilot error: fetch failed]`.
  The house pilot's fallback line carries it too. A future transport failure is diagnosable from
  the match log alone.

## Tests

- `tools/jev/test_local_http.py`: a burst of 32 connects all queue on the new class; on Windows,
  the stdlib default refuses past 5 (the bug, pinned); every server's `serve()` (schema, house,
  team, `model_server.py`) listens with backlog 128.
- `tools/evolve/test_match_schema.mjs`: a schema pilot pointed at a closed port holds and replies
  `[pilot error: fetch failed <- ECONNREFUSED]`.
- Full suites: `npm run test:tools` (341), `test:arena` (101), `test:evolve` (27), `tsc --noEmit`
  all pass.

## Live check on Jev

Same rig as PR #42: two Jam-shape matches (cadence 2, 600 sim-s) **at the same time** on one
private `schema_server.py` (`--budget-usd 0.40`): hard vs medium and medium vs hard, seed 7, PR #40's
compiled tier schemas. Ports **8843** (before) and **8844 / 8845** (after), never the arena's 8797.
"Before" is develop's `tools/jev` (`017a30f`); "after" is this branch. Both legs used this branch's
match runner, so both report the cause. Both used develop's `client.py`, without PR #42.

| Leg | Pilot calls | Reached the server (requests + errors) | `fetch failed <- ECONNREFUSED` | Other held decisions | Jev $ |
|---|---:|---:|---:|---:|---:|
| **Before**, develop, backlog 5 | 3,164 | 3,151 | **13** (5 ticks, clusters 4/4/3/1/1) | 0 | 0.113 |
| **After** #1, backlog 128 | 3,411 | 3,411 | **0** | 17 (Workers AI 401 → 502) | 0.124 |
| **After** #2, backlog 128 | 3,204 | 3,204 | **0** | 0 | 0.116 |

Pilot calls minus what reached the server is exactly the refused connects, in every leg.

After #1's 17 held decisions are the **token** bug PR #42 fixes, not this one. Mid-leg, Workers AI
answered 401 on the current token, and develop's `client.py` stormed through renewals (the server
log has 25 `answered 401` lines). Every one of those calls reached the server. After #2, the clean
repeat, held nothing.

**Spend:** $0.353 of Jev (three legs). The synthetic runs cost nothing.

## Reproduce

The rig scripts are in the session scratchpad, not the repo. The live legs are PR #42's recipe,
with `schema_server.py` on a private port and the default `--refresh-margin-sec`. Count the cause
in the logs:

```sh
node -e 'for (const f of process.argv.slice(1)) { const l = require(f);
  console.log(f, l.decisions.filter(d => (d.reply ?? "").includes("ECONNREFUSED")).length) }' x1.json x2.json
```

The synthetic check needs no Jev. Put `schema_server.serve()` around a backend whose `decide()`
sleeps about 1 s, then fire 12 concurrent fetches per round. Set
`ThreadingHTTPServer.request_queue_size = 5` to see the refusals come back.
