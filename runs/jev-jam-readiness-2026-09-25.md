# Jev house bot — jam readiness, 2026-09-25

**Still SHADOW ONLY.** `house.backend` stays `null` in every shipped config; going live is
Ceryce's call (one config change: `docs/arena-runbook.md` §6, *5.3 Jam day with the Jev house
bot*). Brief (Ceryce, 2026-09-25 10:37 CT): *"Do it. I think we might have to go with Jev if Qwen
is THAT bad at following its prompts."* The jam is Fri 2026-10-02.

Three things changed, each measured or tested:

1. **Rule 3 is exact on the live path.** Before, the live Jev house bot asked the offline harness's
   approximate rule 3 ("cd 0 and any foe") for every instrument, because the offline logs had no
   foe kind or hp (`runs/jev-house-bot-2026-09-23.md`). A live match has both, so now
   `tools/match/jevPilot.ts::extractWorksheet` sends `foeKind`/`foeHp`, and violin/drums get
   house-violet.md's real condition: *the foe is a bearbot with less than 100 hp*. The offline
   harness keeps the labelled approximation, and its state text is byte-identical to before
   (`tools/jev/rules.py`, LIVE PATH note).
2. **The Workers AI token renews itself.** Before, the server read wrangler's OAuth token once,
   and it expired about an hour later, mid-match. Now `house_server.py` renews it once less than
   900 s is left (one 600 s match plus slack), writes the new token pair back to wrangler's config,
   and on a 401 renews once more and retries once.
3. **The house bot never stops playing.** If Jev still can't answer, the server decides with the
   same seven rules evaluated in code (`"fallback": "rules-in-code"`, `!!! FALLBACK` on stderr,
   counted in `/health`). If the server itself is down, the arena's pilot does the same in
   TypeScript. Before, both cases held.

## Rule 3: before / after

Ground truth throughout is house-violet.md's **real** seven rules, applied to the exact live
worksheet (`rules.ground_truth_answers` with the foe's kind and hp). **Before** is the old live
path: foe detail dropped, the approximate q3, and the state text giving only the foe's id
(`house_server.py --approx-q3`, kept for this measurement only). **After** is the path as it now
ships.

### Offline intent check: real live worksheets, both arms asked to Jev

Corpus: `runs/jev-jam-readiness-worksheets-2026-09-25.json`, 8,790 worksheets that
`tools/jev/capture_house_worksheets.mjs` captured from six rules-in-code house-vs-house matches at
the **real jam shape** (600 s, cadence 2, seeds 1–6; no model, $0). Of those, 1,356 are *contested*:
a violin or drums bot, ability ready, a foe present, and neither rule 1 nor rule 2 already applies.
In that situation the two versions of rule 3 disagree whenever the foe is a minion or a bearbot at
100 hp or more, and they do in 1,080 of the 1,356.

Sample: 120 contested (60 where the true rule is *ability*, 60 where it isn't) + 80 from the rest,
each asked to Jev twice (400 calls; `tools/jev/jam_readiness_report.py offline`, output
`runs/jev-jam-readiness-offline-2026-09-25.json`).

| | Before (approx q3) | After (exact q3) |
|---|---:|---:|
| Ability fired where the true rule says no (contested) | **60 / 60** | **0 / 60** |
| Ability missed where the true rule says yes (contested) | 0 / 60 | 0 / 60 |
| Non-contested bucket agreement | 78 / 80 | 79 / 80 |
| **Bucket agreement, weighted to the 8,790-worksheet population** | **85.6%** | **98.9%** |

Before, Jev did exactly what it was asked: it fired the ability whenever it was ready and any foe
was present. That is an over-fire on 1,080 of 8,790 decisions (12.3%). After, it matches the real
rule on all 120 contested cases. The only other misses are a separate issue, in both arms and
unrelated to rule 3: Jev put q4 ("is a foe present?") at exactly 0.5 with no foe present, and the
cascade counts ≥ 0.5 as yes. That is 1–2 of 80.

### Live A/B: Jev house (violet) vs qwen3.5:9b house (green)

`tools/jev/run_house_bench.mjs`, 4 matches per arm, seeds 1–4, the same **quick** shape as
2026-09-23 (cadence 4, 180 s): not the jam shape, because qwen serialises on the one local GPU. The
two arms ran at once against one qwen server and two Jev servers, and only the Jev server's q3
differed. Every Jev decision's logged worksheet is scored against the true rule
(`jam_readiness_report.py bench`; logs `runs/jev-jam-readiness-bench-{approx,exact}-2026-09-25.json`).

| Jev side | Before (approx q3) | After (exact q3) |
|---|---:|---:|
| Real decisions | 516 | 494 |
| **Agreement with the true rules** | **85.5%** | **100.0%** |
| Ability fired where the true rule says no | **71 / 71** | **0 / 56** |
| Buckets: ability / attack foe / attack tower | 104 / 16 / 2 | 29 / 65 / 5 |
| Buckets: go home / ride wave / recall | 172 / 221 / 1 | 190 / 197 / 8 |
| Own bearbot deaths (of 12) | 0 | 2 |
| Low-hp recall compliance (real hp < 75) | 1/1 | 8/8 |
| Call errors / fallbacks | 0 / 0 | 0 / 0 |
| Latency mean / p50 / p90 (s) | 1.188 / 0.373 / 0.822 | 0.884 / 0.373 / 0.730 |
| qwen side: deaths / parse errors / recall compliance | 5 / 2 / 10 of 13 | 4 / 8 / 11 of 26 |

All 8 matches were draws at the 180 s cap (as all 20 were on 2026-09-23).

**What the fix changed in play.** Most of the old live path's ability uses were misfires. Among
contested decisions, *every* ability it used was one the real rule forbids (71 of 71). The fix
turns those into the plain attacks the real rule asks for: attacks on foes went up about 4×
(16 → 65), abilities went down about 3.5× (104 → 29). Engagement overall (ability + attack) is
about the same: 122 before, 99 after.

**What it did not change: the house bot is still passive.** About 78% of Jev decisions are *go
home* or *ride wave* in both arms (393/516 before, 387/494 after). This is the finding from
2026-09-23: house-violet.md checks rule 2 (go home) and rule 6 (ride the wave) before combat. The
100% agreement shows Jev now plays house-violet.md *exactly as written*, so the passivity comes
from the rules, not from Jev misreading them. The bot is faithful to the prompt, and the prompt's
priority order is what makes it passive. Changing that means editing house-violet.md, which this
brief doesn't cover.

Small-sample caveats: 4 matches per arm at the quick shape, and qwen's own play differs from run to
run (its recall compliance moved from 77% to 42% between arms with nothing on its side changed).
Deaths (0 vs 2) are too few to read. The rule-3 agreement numbers are the robust result, and they
agree with the offline check.

## Token renewal and fallback: what was tested, and how

| Behaviour | Evidence |
|---|---|
| Renew inside the margin, write the rotated pair back | Stub tests (`tools/jev/test_token_refresh.py`: temp wrangler config, fake exchange) **and real**: `house_server.py --check-token` renewed the real token twice today (about 2 h past expiry → 3,599 s left; later a forced renewal at 2,157 s left). `npx wrangler whoami` still reads the written-back file as logged in. |
| Found on the first real renewal | dash.cloudflare.com returns `403 error code: 1010` to Python-urllib's default User-Agent. Every renewal would have failed. Fixed with an explicit UA; a probe with a bogus refresh token then got the OAuth server's own `400 invalid_grant`. |
| Pick up a token another process renewed, instead of spending the rotated refresh token | Stub test. Live: after the forced renewal, the two running servers kept working on their in-memory token (the old access token stays valid), with 0 errors. |
| 401 → one forced renewal → one retry; a second 401 propagates | Stub `/ai/run` server tests only. A real 401 can't be made on demand: renewal didn't revoke the old token. |
| Fallback on transport / 401 / budget, `RECOVERED` after | `tools/jev/test_house_server.py`, including a 200-over-HTTP fallback against a failing client |
| Server unreachable → the arena's pilot decides by rules in code, never holds, counts call errors | `tools/arena/test_queue.mjs`, with the house backend pointed at a dead port |

Not observed live: a renewal happening *inside* a running server during a match. The bench
finished with ~36 min left on the token, inside its 60-minute life. The code path is the same one
`--check-token` ran for real.

## Spend

Jev calls today (Cloudflare Workers AI, real `usage.input_tokens` × $0.042/M):

| Run | Calls | Input tokens | Cost |
|---|---:|---:|---:|
| Offline intent check (200 worksheets × 2 arms) | 400 | 343,928 | $0.0144 |
| Live bench, before arm (`--approx-q3`) | 516 | 432,786 | $0.0182 |
| Live bench, after arm | 494 | 420,233 | $0.0176 |
| **Total** | **1,410** | **1,196,947** | **$0.0502** |

The cap was $2.00. The opponent (qwen3.5:9b on local Ollama) and the worksheet capture cost $0.
The one extra token-test call per server is under $0.0001.

## Reproduce

```
node tools/jev/capture_house_worksheets.mjs --seeds 1-6 --out runs/jev-jam-readiness-worksheets-2026-09-25.json
python tools/jev/jam_readiness_report.py offline --worksheets runs/jev-jam-readiness-worksheets-2026-09-25.json --out runs/jev-jam-readiness-offline-2026-09-25.json
python tools/model_server.py --backend ollama --model qwen3.5:9b --ollama-url http://127.0.0.1:11999 --port 8797
python tools/jev/house_server.py --port 8798 --budget-usd 0.90                  # after
python tools/jev/house_server.py --port 8796 --budget-usd 0.90 --approx-q3      # before
node tools/jev/run_house_bench.mjs --matches 4 --seed-start 1 --cadence 4 --max-sim-sec 180 --jev-endpoint http://127.0.0.1:8798/ --qwen-endpoint http://127.0.0.1:8797/ --out runs/jev-jam-readiness-bench-exact-2026-09-25.json
node tools/jev/run_house_bench.mjs --matches 4 --seed-start 1 --cadence 4 --max-sim-sec 180 --jev-endpoint http://127.0.0.1:8796/ --qwen-endpoint http://127.0.0.1:8797/ --out runs/jev-jam-readiness-bench-approx-2026-09-25.json
python tools/jev/jam_readiness_report.py bench runs/jev-jam-readiness-bench-approx-2026-09-25.json runs/jev-jam-readiness-bench-exact-2026-09-25.json
```
