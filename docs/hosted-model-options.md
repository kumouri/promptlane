# Hosted 30–40B models for jam matches: providers, feasibility, cost

*Research note, 2026-09-21. No provider account was created or charged; every price below is a public
list price fetched that day, with its source. Nothing here changes code.*

The question: instead of the host's local `qwen3.5:9b` through Ollama, could jam matches run on a
hosted 30–40B open model (OpenRouter, Hugging Face, or a rented GPU), and what would that cost?

**Short answer.** A full-length match is ≈1.8 M input tokens and ≈45 k output tokens. At 32B-class
open-model list prices that is **$0.15–0.20 per match, $2.5–3 for a 16-entrant jam day, $12–15 for a
75-match pre-jam ladder** — about a tenth of Haiku 4.5 through the API ($2 / match, $30 / day). The
bigger win than price is wall-clock: a hosted API answers the six pilots in parallel, so a full match
takes 5–10 minutes instead of 27–54 minutes on the serialised local Ollama. Renting a GPU costs about
the same as the per-token API for the same matches and only pays off if the GPU is kept busy the
whole time; it buys control (pinned model, no rate limits, cadence 0.5) rather than savings.

## 1. The workload, derived from the runner

Every number in this section comes from `tools/match/headless.ts`, `tools/match/cli.mjs`,
`tools/model_server.py`, `src/pilots/promptPilot.ts`, and the checked-in log
`runs/jam-sample-drums-vs-violin.json`, plus one measurement run made for this note (below).

| Symbol | Value | Where it comes from |
|---|---|---|
| Tick | 0.05 s sim (20 tps); a match is 600 sim-seconds = **12,000 ticks** | `TICK_DT`, `MATCH_DURATION_SEC` in `src/sim/match.ts`; `MAX_TICKS` in `headless.ts` |
| Polling | the game asks each pilot every 0.5 sim-s → 1,200 asks per pilot per match | README "Cadence"; `RecordingPilot.decide` |
| Cadence **C** | runner default `--cadence 2` (floor 0.5) → a real model call per pilot every 2 sim-s; between calls the bot repeats its last action | `cli.mjs` `parseArgs`, `RecordingPilot` |
| Pilots **N** | 6 per match (3 per side), all on `PromptPilot` | `JAM_ROSTER` |
| Calls per match | **1,800 at cadence 2** (300 rounds × 6) if all six bots stay alive for 600 s; **7,200 at cadence 0.5** | arithmetic; dead bots stop being polled |
| Observed calls | **420** in the checked-in sample (all six bots died by sim-second 260, then nothing was asked) | `runs/jam-sample-drums-vs-violin.json`: `stats.violet.calls`=96, `green.calls`=324 |
| Prompt **P** | voice file ≈375–390 tokens + fixed instruction ≈50 + observation 250 (match start) to ≈800 (busy lane) → **≈700 tokens early, ≈1,200 mid-fight; plan on 1,000** | measured: 50 prompts recorded from a real cadence-2 match through a recording stand-in for `model_server.py` were 2,389–2,974 chars; `o200k` tokeniser gave 679–720 tokens on the quiet ones; a synthetic busy observation (1 enemy bot, 6 enemy minions, 8 nearby minions, 2 towers) was 822 tokens on its own |
| Reply **R** | **≈21 tokens** mean, 27 max (one JSON object); server caps at `--max-tokens 120` | 420 real replies in the sample log; `OllamaBackend(max_tokens=120)` |
| Per-call latency today | 1,783 ms mean, 1,573 median, 3,089 p90, 9.8 s max on `qwen3.5:9b`; Ollama serialises the six callers | `ms` field of the sample log; README quotes 0.9 s on a quieter host |
| Matches **M** | 16-entrant single elimination = **15 matches** (8 entrants = 7); best-of-3 would be up to 45 | `docs/arena-site-spec.md` recommends single-elim for the jam |
| Pre-jam ladder | ≈5× the bracket → **75 matches** | brief |

So, per **full-length** match at cadence 2: **1.8 M input tokens, ≈45 k output tokens** (planning
figures, 1,000 in / 25 out per call). Input is >97 % of the token bill everywhere, so input price is
the number that matters. The sample match used about a quarter of that; the cleanroom v1 prompts
end by nexus kill even earlier. Budget on full-length, expect 25–60 %.

Two things about caching. Only the voice file + instruction (≈425 tokens) is a stable prefix; the
observation changes every call. That prefix is below Anthropic's 4,096-token cache minimum for Haiku
4.5, so prompt caching does nothing for this workload on Haiku (Sonnet 5's minimum is lower, but at
$2/M input the arithmetic still loses). Open-model providers that cache automatically would save at
most ≈40 % of input on the calls that hit.

**Entrant prompts are the wildcard.** The sample voice files are ≈380 tokens. An entrant who writes a
2,000-token prompt roughly doubles every number in this note for their matches. The entrants repo
could cap prompt length; that is a jam ruling, not a code change.

## 2. Option A — OpenRouter (per-token, one key, any model)

Live model list fetched 2026-09-21 from `https://openrouter.ai/api/v1/models` (443 models) and
`https://openrouter.ai/api/v1/models/{id}/endpoints`. Prices are per million tokens, cheapest live
endpoint shown; OpenRouter passes provider prices through with no markup
([FAQ](https://openrouter.ai/docs/faq)) but charges **5.5 % ($0.80 minimum) on card credit
purchases, 5 % crypto** — add that to everything below.

| Model (OpenRouter id) | Class | $ in / $ out per M | Cheapest endpoint (quant) | JSON mode / structured / tools | Notes |
|---|---|---|---|---|---|
| `qwen/qwen3-32b` | dense 32B | **0.08 / 0.28** | DeepInfra (fp8), 40 k ctx | yes / yes / yes | hybrid-thinking model: must send `reasoning: {exclude…}` / `enable_thinking=false` or the 120-token cap eats the reply |
| `google/gemma-4-31b-it` | dense 31B | **0.09 / 0.34** | DeepInfra (fp4); CoreWeave 0.10/0.34 fp4; bf16 from Novita/Crusoe 0.14/0.40 | yes / yes / yes (CoreWeave) | 14 endpoints, 262 k ctx; `:free` variant exists (see limits) |
| `mistralai/mistral-small-3.2-24b-instruct` | dense 24B | **0.094 / 0.25** | Venice (fp8); DeepInfra 0.075/0.20 | yes / yes / yes | `mistral-small-2603` (newest) is 0.15 / 0.60 |
| `qwen/qwen3.6-35b-a3b` | MoE 35B, 3B active | 0.15 / 1.00 | Parasail (fp8); Darkbloom 0.05/0.70 fp4 | yes / yes / yes | newest 30B-class Qwen; fast because only 3B params fire per token |
| `qwen/qwen3.8-27b` | dense 27B (newest dense Qwen) | 0.42 / 3.00 | — | yes / yes / yes | `:free` variant exists; paid price is 5× the 32B |
| `meta-llama/llama-3.3-70b-instruct` | dense 70B (ceiling reference) | **0.10 / 0.32** | DeepInfra (fp8) | yes / yes / yes | Groq 0.59/0.79 if you want ~300 tok/s |
| `openai/gpt-oss-120b` | MoE 120B, 5B active | 0.15 / 0.60 | — | yes / yes / yes | included because it is often the fastest "smart" option per dollar |

**Cost** (full-length match = 1.8 M in + 45 k out; jam day = 15 matches; ladder = 75; fee not
included — multiply by 1.055):

| Model | $ / match (full) | $ / match (observed 420 calls) | $ / jam day | $ / ladder | $ / match at cadence 0.5 |
|---|---:|---:|---:|---:|---:|
| qwen3-32b | 0.157 | 0.037 | 2.35 | 11.74 | 0.63 |
| gemma-4-31b-it | 0.177 | 0.041 | 2.66 | 13.30 | 0.71 |
| mistral-small-3.2-24b | 0.180 | 0.042 | 2.71 | 13.53 | 0.72 |
| qwen3.6-35b-a3b | 0.315 | 0.073 | 4.72 | 23.62 | 1.26 |
| qwen3.8-27b | 0.891 | 0.208 | 13.37 | 66.83 | 3.56 |
| llama-3.3-70b (ceiling) | 0.194 | 0.045 | 2.92 | 14.58 | 0.78 |
| gpt-oss-120b | 0.297 | 0.069 | 4.46 | 22.27 | 1.19 |

**Rate limits** ([docs](https://openrouter.ai/docs/api/reference/limits), as of 2026-09-21): paid
models have no platform request cap ("DDoS protection will block requests that dramatically exceed
reasonable usage"); a jam match is 3 requests/s, far below that. `:free` variants are **20 req/min
and 50 req/day** (1,000/day once $10 of credits has ever been bought) — one match at cadence 2
needs up to 1,800 calls, so free variants are only for a smoke test, never a bracket.

**Provider routing.** A match must be reproducible from its log, not from the model, so provider
drift between matches is tolerable, but for fairness a bracket should pin one provider (`provider:
{order: [...], allow_fallbacks: false}`) so every entrant faces the same weights and quantisation.
`:floor` sorts by price, `:nitro` by throughput; `require_parameters: true` with
`response_format: {type: "json_object"}` filters to endpoints that honour JSON mode, which would let
the pilot's regex-extract parser see clean objects. Quantisation varies by endpoint (fp4 / fp8 / bf16
above) — pin it, and record it in the match log's `backend` block.

**Wiring.** `tools/model_server.py` has `ollama`, `claude` and `echo` backends. An OpenRouter
backend is one more `Backend` subclass posting to `/api/v1/chat/completions` with a key from the
environment (`tools/` is not the frozen specimen; `src/` is). `ThreadingHTTPServer` already runs the
six callers concurrently, so the parallelism comes for free.

## 3. Option B — Hugging Face

### Inference Providers (per-token, pass-through)

HF routes to third-party providers at **the provider's own price with no markup**
([pricing](https://huggingface.co/docs/inference-providers/pricing)). Included credits are small:
**$0.10/month free, $2.00/month PRO ($9/mo), $2.00 per seat Team/Enterprise**; pay-as-you-go
beyond that needs a credit purchase. Model → provider → price fetched 2026-09-21 from
`https://router.huggingface.co/v1/models`:

| Model | Providers live (in / out $ per M) | Cheapest | $ / match | $ / jam day | $ / ladder |
|---|---|---|---:|---:|---:|
| `Qwen/Qwen3-32B` | nscale 0.08/0.25, deepinfra 0.08/0.28 | nscale | 0.155 | 2.33 | 11.64 |
| `google/gemma-4-31B-it` | deepinfra 0.13/0.38, novita 0.14/0.40 | deepinfra | 0.251 | 3.77 | 18.83 |
| `google/gemma-3-27b-it` | deepinfra 0.08/0.16 | deepinfra | 0.151 | 2.27 | 11.34 |
| `Qwen/Qwen3.6-35B-A3B` | deepinfra 0.10/0.95, scaleway 0.285/1.71 | deepinfra | 0.223 | 3.34 | 16.69 |
| `meta-llama/Llama-3.3-70B-Instruct` | novita 0.135/0.40, ovhcloud 0.74/0.74, together 1.04/1.04 | novita | 0.261 | 3.92 | 19.57 |
| `openai/gpt-oss-120b` | deepinfra 0.037/0.17, novita 0.05/0.25, groq 0.15/0.75, … (11 providers) | deepinfra | 0.074 | 1.11 | 5.57 |

Same providers as OpenRouter, same prices, same OpenAI-compatible endpoint
(`https://router.huggingface.co/v1`), so the two are interchangeable; no Mistral Small on HF's
router today. No card fee is documented, which makes HF ≈5 % cheaper than OpenRouter for the same
endpoint; OpenRouter has more endpoints per model and the routing controls above.

### Inference Endpoints (dedicated, per-hour)

A private vLLM/TGI endpoint, billed **per minute while initialising or running**
([pricing](https://huggingface.co/docs/inference-endpoints/pricing), AWS region, as of 2026-09-21):
**L40S 48 GB $1.80/h, A100 80 GB $2.50/h, A10G 24 GB $1.00/h, L4 24 GB $0.80/h, H200 141 GB
$5.00/h** (GCP: A100 $3.60/h, H100 $10.00/h). A 32B model in fp8 fits on one L40S; bf16 needs the
A100. Scale-to-zero exists but a scaled-to-zero endpoint still occupies quota and a 32B model takes
several minutes to come back, so for a jam you would keep it warm for the whole day — see §5 for
what that costs versus per-token. This is the most expensive way to run the same weights and the
only reason to pick it is wanting HF's console rather than an SSH box.

## 4. Option C — rent a GPU (Vast.ai, RunPod) and run vLLM or Ollama

What you need: a 32B dense model is ≈65 GB in bf16, ≈33 GB in fp8/AWQ-4bit, plus KV cache for six
concurrent ≈1.5 k-token contexts (small). So **48 GB (L40S, RTX 6000 Ada, A40) is enough with fp8;
80–96 GB (A100, H100, RTX PRO 6000) runs bf16 or the 70B in fp8.**

Live on-demand single-GPU offers, **Vast.ai**, fetched 2026-09-21 from the public offer search
(`https://console.vast.ai/api/v0/bundles/`, reliability ≥ 0.95, any verification; Vast bills per
second, storage and egress extra):

| GPU | VRAM | offers | min $/h | median $/h |
|---|---|---:|---:|---:|
| RTX 6000 Ada | 48 GB | 4 | 0.30 | 0.63 |
| L40S | 48 GB | 5 | 0.52 | 0.80 |
| RTX PRO 6000 (WS / Server / Max-Q) | 96 GB | 18 | 0.94 | 1.47–1.56 |
| H100 SXM | 80 GB | 3 | 1.74 | 2.67 |
| H100 NVL | 96 GB | 3 | 2.67 | 2.78 |
| RTX 5090 (for a 9–14B, not a 32B) | 32 GB | 54 | 0.43 | 0.69 |

**RunPod** list prices ([pricing](https://www.runpod.io/pricing), 2026-09-21; community / secure
cloud): **L40S $0.79 / $1.09**, A40 $0.35 / $0.49, RTX 6000 Ada $0.74 / $0.84, **A100 80 GB PCIe
$1.19 / $1.59**, RTX PRO 6000 96 GB $1.69 / $2.09, H100 PCIe $1.99 / $2.89, H100 SXM $2.69 / $3.49,
H200 $3.59 / $4.59. Network storage $0.05–0.14/GB-month.

**Setup effort** (both): pick an image with vLLM (RunPod has a one-click vLLM template; on Vast use
the `vllm/vllm-openai` image), `--model Qwen/Qwen3-32B --quantization fp8 --max-model-len 8192`,
wait for the 33 GB download (5–20 min depending on the host's link — Vast offers vary a lot here;
filter on `inet_down`), expose the port, point `model_server.py` at it. Budget 45 minutes the first
time, 15 after. Ollama works too (`ollama pull qwen3:32b`, it serialises less badly than the host
because the GPU is faster) but vLLM's continuous batching is what makes six parallel callers cheap.
Interruptible/spot pricing is roughly half the numbers above and is fine for a ladder, not for a live
bracket.

**Wall-clock per match on one rented GPU** (vLLM, 6 concurrent, 1 k prompt, 25-token reply): prefill
6 k tokens ≈ 0.3–0.6 s, decode 25 tokens ≈ 0.4–0.8 s on an L40S/H100 class card → **≈1–1.5 s per
round, 5–8 min per full match**; at cadence 0.5, 20–30 min. That is 8–10 matches per GPU-hour.

## 5. Option D — Claude via the existing `--backend claude`

What the runner actually does: `ClaudeBackend` **shells out to `claude -p --model <model>` per
decision** — the Claude Code CLI on the subscription. No API key is read; usage is drawn from the
plan's rolling usage window, so its marginal price is **$0** and its true cost is quota. It was wired
as a demo path: process start-up dominates at **≈10 s per decision** (README), six parallel spawns
per round still means ≈50 min per full match, and 1,800 spawns per match × 15 matches would exhaust a
plan's usage window mid-bracket. It is not a jam-day backend and the numbers below are for the
API-billed route it would need to become (one `Backend` subclass using the Anthropic SDK).

Anthropic API list prices ([pricing](https://platform.claude.com/docs/en/about-claude/pricing),
2026-09-21): **Haiku 4.5 $1 / $5 per M** (cache write $1.25, cache read $0.10), Sonnet 5 $2 / $10.
Batch API is 50 % off but asynchronous — useless for lockstep. Haiku 4.5's prompt-cache minimum is
4,096 tokens, above our ≈425-token stable prefix, so caching does not apply.

| Model | $ / match (full) | $ / match (observed) | $ / jam day | $ / ladder | $ / match at cadence 0.5 |
|---|---:|---:|---:|---:|---:|
| Haiku 4.5 (API) | 2.03 | 0.47 | 30.38 | 151.88 | 8.10 |
| Sonnet 5 (API) | 4.05 | 0.95 | 60.75 | 303.75 | 16.20 |

Latency through the API (not the CLI) would be ≈0.5–1 s per call, comparable to the open-model
APIs. Haiku is 10–13× the price of the 32B open models for this shape of workload because input
tokens dominate and Haiku's input price is 10× DeepInfra's.

## 6. Latency versus cadence

Lockstep means the sim waits for the slowest of the six replies each round; wall time per match =
rounds × slowest-call latency. At cadence 2 there are 300 rounds; at 0.5, 1,200.

| Backend | Calls in flight | Round time | Full match | 15-match jam day | Match at cadence 0.5 |
|---|---|---:|---:|---:|---:|
| Host Ollama `qwen3.5:9b`, measured 1.8 s/call, serial | 1 | 10.8 s | 54 min | 13.5 h | 3.6 h |
| Host Ollama at the README's 0.9 s/call | 1 | 5.4 s | 27 min | 6.8 h | 1.8 h |
| Hosted API (OpenRouter/HF), 6 parallel, ≈1 s p90 | 6 | ≈1 s | 5 min | 1.2 h | 20 min |
| Hosted API, pessimistic 2 s p90 | 6 | 2 s | 10 min | 2.5 h | 40 min |
| Rented GPU + vLLM, 6 concurrent | 6 | 1–1.5 s | 5–8 min | 1.5–2 h | 20–30 min |
| `claude -p` Haiku, ≈10 s/decision | 6 | ≈10 s | 50 min | 12.5 h | 3.3 h |

"A 2 s cadence with 6 pilots" is **3 requests per second, ≈3 k input tokens per second, ≈11 M
input tokens per hour** if the sim ran in real time. No hosted option above has a limit anywhere
near that; the constraint is the p90–p99 latency of a single call, because one slow reply stalls
all six. The runner's `--timeout 60` turns a hung call into a `hold`, so a provider hiccup costs a
decision, not a match. For the jam room the practical target is a full match in ≤10 min so a
16-entrant bracket fits in an afternoon with replays between rounds; only the parallel options
meet it.

The hosted API latencies are engineering estimates (TTFT 0.3–0.8 s + 25 tokens at 50–150 tok/s);
OpenRouter's public endpoint API does not return latency. **Before committing, run one cadence-2
match against the chosen endpoint (≈$0.20) and read `avgMs` from the log.**

## 7. Rented GPU versus per-token: break-even

Per-token cost for a full match is ≈$0.16 (qwen3-32b). A rented GPU at rate *r* $/h doing a match
every *m* minutes costs *r·m/60* per match, plus idle and setup time:

| GPU | $/h | $ / match at 6 min | $ / match at 10 min | Jam day (15 matches + 45 min setup) | Ladder (75 + 45 min) |
|---|---:|---:|---:|---:|---:|
| Vast L40S 48 GB (median) | 0.80 | 0.08 | 0.13 | 1.80–2.60 | 6.60–10.60 |
| RunPod L40S secure | 1.09 | 0.11 | 0.18 | 2.45–3.54 | 8.99–14.44 |
| Vast RTX PRO 6000 96 GB (median) | 1.47 | 0.15 | 0.25 | 3.31–4.78 | 12.13–19.48 |
| RunPod A100 80 GB PCIe secure | 1.59 | 0.16 | 0.27 | 3.58–5.17 | 13.12–21.07 |
| HF endpoint L40S | 1.80 | 0.18 | 0.30 | 4.05–5.85 | 14.85–23.85 |
| HF endpoint A100 80 GB | 2.50 | 0.25 | 0.42 | 5.62–8.12 | 20.62–33.12 |
| *per-token qwen3-32b, for comparison* | — | 0.16 | 0.16 | 2.35 (+5.5 % fee) | 11.74 |

Read it as: **a 48 GB card at Vast's median price breaks even with the per-token API only if it runs
a match every ≈12 minutes for the whole rental**, and anything 80 GB+ never wins on cost at this
volume. A jam day is hours of mostly-idle GPU (talking, replays, bracket admin) — per-token wins. A
ladder can be scripted back-to-back overnight on an interruptible instance, where the GPU roughly
ties per-token and additionally gives you cadence 0.5 for the same hours. The reasons to rent
anyway are non-monetary: a pinned model + quantisation for the whole event, no third-party rate
limits or outages during the bracket, and no per-token surprise if entrants write long prompts.

## 8. Should the arena treat the backend as per-tournament configuration?

Yes, and as immutable for the tournament's lifetime. Fairness needs every match in a bracket on the
same weights, quantisation and sampling settings; reproducibility needs the log to say which. The
match log already records `backend` from `GET /health` (`{backend, model, url, temperature,
max_tokens, think}`); the arena spec should:

- make `backend` a **tournament** property — `{kind: ollama | openrouter | hf | vllm | claude,
  model, provider/endpoint, quantization, temperature, max_tokens, cadence}` — set when the
  tournament is created and copied into every match log, not a per-match or per-entrant choice;
- let different tournaments differ (a pre-jam ladder on a $0.08/M endpoint, the jam bracket on the
  same model pinned to one provider, an exhibition on Haiku), since the runner is already
  backend-agnostic through the `POST {prompt} → {reply}` contract;
- show the backend on the bracket page next to the seed, because "which model played" is the
  first question a losing entrant asks;
- carry a per-tournament **spend cap** in the same object when the kind is metered — the numbers
  above are small, but an entrant prompt 5× longer than the samples at cadence 0.5 is a $4 match.

## 9. Recommendation

- **Jam day (Fri 2026-10-02):** OpenRouter (or HF's router, same endpoints) on
  `qwen/qwen3-32b` or `google/gemma-4-31b-it`, provider pinned, JSON mode on, `--cadence 2`;
  ≈$2.50–3 for the whole bracket plus a ≈$0.20 rehearsal match, and matches finish in 5–10
  minutes instead of half an hour. Keep the host's Ollama as the offline fallback.
- **Pre-jam ladder:** the same endpoint (≈$12–15 for 75 matches) unless the ladder wants cadence
  0.5 or is going to run for many GPU-hours back to back — then a Vast/RunPod L40S on an
  interruptible instance with vLLM, which ties on price and removes the rate-limit and
  prompt-length variables.
- **Do not** use `--backend claude` for either: it is a `claude -p` subscription shell-out, 10 s per
  decision, and a bracket would exhaust the plan's usage window. If Anthropic is wanted, wire the
  API (Haiku 4.5, ≈$2/match, ≈$30/day) as a comparator tournament, not the default.

## Sources (all fetched 2026-09-21)

- OpenRouter model list and per-model endpoints: `https://openrouter.ai/api/v1/models`,
  `https://openrouter.ai/api/v1/models/{author}/{slug}/endpoints`
- OpenRouter rate limits: https://openrouter.ai/docs/api/reference/limits
- OpenRouter fees and routing variants: https://openrouter.ai/docs/faq
- Hugging Face Inference Providers pricing and credits: https://huggingface.co/docs/inference-providers/pricing
- Hugging Face router model/provider prices: `https://router.huggingface.co/v1/models`
- Hugging Face Inference Endpoints GPU prices: https://huggingface.co/docs/inference-endpoints/pricing
- Vast.ai public offer search: `https://console.vast.ai/api/v0/bundles/` (query: single GPU, on-demand,
  rentable, reliability ≥ 0.95, VRAM ≥ 44 GB); marketing page https://vast.ai/pricing is JS-rendered
- RunPod GPU pricing: https://www.runpod.io/pricing
- Anthropic pricing: https://platform.claude.com/docs/en/about-claude/pricing; prompt-cache minimums:
  https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Workload: `tools/match/headless.ts`, `tools/match/cli.mjs`, `tools/model_server.py`,
  `src/pilots/promptPilot.ts`, `runs/jam-sample-drums-vs-violin.json`; token counts with the
  `o200k_base` BPE (Qwen/Gemma/Llama tokenisers land within ≈10 % on English + JSON).
