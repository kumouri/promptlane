# OpenRouter hosted backend — Phase C proof run, 2026-09-22

Proof that `tools/model_server.py --backend openrouter` is real, not a code read: one real match
against OpenRouter's `qwen/qwen3-32b` (DeepInfra endpoint, pinned), paid from the host's live
`OPENROUTER_API_KEY`. Same seed and pairing as the checked-in `qwen3.5:9b` baseline
(`runs/jam-sample-drums-vs-violin.json`) for a direct comparison.

## Setup

- `python tools/model_server.py --backend openrouter --model qwen/qwen3-32b --port 8789 --provider DeepInfra --concurrency 6 --price-in-per-m 0.08 --price-out-per-m 0.28 --daily-budget-usd 2.0`
- `node tools/match/cli.mjs --a prompts/pilots/drums.md --b prompts/pilots/violin.md --seed 7 --cadence 2 --endpoint http://127.0.0.1:8789/`
- Log: `runs/openrouter-phase-c-proof-2026-09-22-drums-vs-violin-seed7.json`; verified with
  `node tools/match/cli.mjs --verify` — `120 checkpoints, 12000 ticks`, no divergence.

## `/health` before the run

```json
{"ok": true, "backend": "openrouter", "model": "qwen/qwen3-32b",
 "base_url": "https://openrouter.ai/api/v1", "concurrency": 6, "provider": ["DeepInfra"],
 "daily_budget_usd": 2.0, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
```

`qwen/qwen3-32b` is live on OpenRouter as of 2026-09-22 (fetched from
`https://openrouter.ai/api/v1/models` and `/models/qwen/qwen3-32b/endpoints`, not memory): DeepInfra
fp8 at $0.08/$0.28 per M tokens, matching `docs/hosted-model-options.md`. `google/gemma-4-31b-it`
is also live at the note's price. No slug 404s.

## Result: hosted `qwen/qwen3-32b` vs baseline `qwen3.5:9b`

Same seed (7), same pairing (drums=violet vs violin=green), same cadence (2s):

| | `qwen3.5:9b` (Ollama, serial) — `runs/jam-sample-drums-vs-violin.json` | `qwen/qwen3-32b` (OpenRouter, 6 parallel) — this run |
|---|---|---|
| Winner | draw, by **timeout** | draw, by **timeout** |
| Duration | 600s (full length) | 600s (full length) |
| Deaths | violet 3, green 3 (full wipe both sides) | violet 3, green 3 (full wipe both sides) |
| Towers lost | 0 / 0 | 0 / 0 |
| Real calls | 420 (violet 96, green 324) | **138** (violet 26, green 112) |
| Mean call latency | 1,783 ms (README figure; this log: 1,680/1,813 ms per side, serial) | **1,383 ms**, p90 **2,174 ms**, max 3,229 ms — 6 in flight |
| Wall clock | not logged for this exact log; the README's serial estimate for ~420 calls is ~12 min | **80 s** |
| Parse/call errors | 0 / 0 | 0 / 0 |

**The honest finding, as asked:** the hosted 32B model did *not* produce a winner on this seed —
it also drew by timeout, with both sides fully wiped (3/3 deaths) and no tower lost either side.
The premise that a bigger model "recalls" where `qwen3.5:9b` never does is **not confirmed by this
single match**; both backends produced the same qualitative outcome (mutual wipeout, timeout draw)
on the same seed. What changed is wall-clock and call count, not the outcome — call counts differ
(138 vs 420) because a different model produces a different sequence of replies from the same seed,
which is expected (§5.5: determinism covers the seed and the replies, not the model). A single
seed/pairing is not enough to conclude anything about play quality; a fair read needs multiple
seeds, which is future ladder/placement work, not this proof run.

**What is proven:** the backend is wired correctly end-to-end — JSON mode returns clean objects
(0 parse errors across 138 + 30 wiring-check calls), provider pinning held to DeepInfra, the
6-pilot lockstep round runs genuinely in parallel (mean 1.38 s/call vs Ollama's 6-caller serial
queue), and the match reached the full 600 sim-second length and verified byte-for-bit replayable.
The **9× wall-clock win** (80 s vs an estimated ~12 min serial-equivalent for the same call count)
is the real result, matching `docs/hosted-model-options.md` §6's prediction of parallel hosted APIs
finishing a full match in minutes instead of tens of minutes.

## Spend

| Call | Tokens in/out | Cost |
|---|---|---|
| 1-call smoke (`{"kind":"hold"}`, max_tokens 60) | 28 / 7 | $0.0000042 |
| Wiring check (10 sim-s, 30 real calls) | 25,536 / 880 | $0.0023 |
| Real proof match (138 real calls, full 600 sim-s) | 133,213 / 4,900 | $0.0120 |
| **Total, this job** | 158,777 / 5,787 | **$0.0143** |

Well under the $2 job cap; well under the $0.157-per-match full-length estimate in
`docs/hosted-model-options.md` because both sides wiped out before using their full call budget,
same as the `qwen3.5:9b` baseline did.
