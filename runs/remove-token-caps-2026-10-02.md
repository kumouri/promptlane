# No token caps on the prose-to-Jev path, 2026-10-02

**Ruling (Ceryce, 2026-10-02 17:59 CT).** "Get rid of any fucking token caps."
- Earlier the same day, at 11:43, she said: "If there's no reason for a limit, there's NO LIMIT."
- At 15:14 she said the prose-to-Jev translation "HAS to be right".

So this change removes every token cap outright. It does not swap in a derived or proportional
cap. Where something really dangerous needed guarding, it is guarded by wall-clock time instead (§4).

**Question.** #92 (`runs/vocab2-guard-scope-2026-10-02.md`) found that #88's house-hard-eco prose
compiled 0 of 12 times under vocab-2. All 36 replies were cut at the translator's 1,800-token reply
cap, before any check ran, and develop failed the same way. So any entrant prose that long failed.
This job set out to:
1. find out whether the cap ever had a reason;
2. remove every token cap on the path;
3. verify the result at $0.

**Budget:** $0. Every compile ran on the host's Ollama (`qwen3.5:9b`). No Jev call and no paid
model call was made. The OpenRouter numbers below are read off public price lists, not spent.

## Verdict

1. **The 1,800-token reply cap never had a reason.** It arrived with the first translator commit
   (`a63d9e3`, 2026-09-23) with no note. Door A copied it as `MAX_COMPLETION_TOKENS` (`12d9f74`).
   The per-run caps had one stated reason: a spend ceiling, "at most $0.009 a run". That is a
   dollar promise expressed in tokens.
2. **No runaway generation was found to guard against.**
   - Under the cap, 264 different recorded replies held 0 loops (#89's and #92's data).
   - Without it, 111 replies held 0 loops and every one ended on its own (`done_reason: "stop"`).
   - The longest reply was 3,312 tokens. The largest prompt plus reply was 6,850 tokens, of the
     model's 32,768-token window.
3. **house-hard-eco now compiles: 12 of 12 runs and 36 of 36 instruments.** Before, it was 0 of
   12. All 42 of its replies ran 2,198 to 2,644 tokens, so the old cap would have cut every one.
4. **No regression against #92's table.**
   - Every row has p ≥ 0.115.
   - The sample entrant compiled 36 of 36, house-easy 12 of 12 and siege 12 of 12.
   - With nothing cut, the sample entrant needed fewer calls: a median of 3.5 per run, against 4.
5. **What compiles is not yet all right (§6).** These are the first whole compiles of a 16-rule
   cascade, so they show two defects that were hidden while nothing compiled:
   - The 9B often moves the finish-kill, tower-fire and 480-second rules below "push with your
     wave". That rule almost always fires, so the moved rules rarely do.
   - #87's negation check removes a correct shopping rule in 3 of 36 schemas.
   Neither is caused by removing the cap.
6. **Two Ollama facts the design rests on, measured on the host (§4):**
   - By default, Ollama silently drops the start of a prompt that is over the context window.
     `"truncate": false` makes that an error instead.
   - `"shift": false` would end a runaway at a full window. But in Ollama 0.35 it restarts the
     shared model on every flip, so it is not used.

## 1. Every token cap on the path, and what happened to it

| Where | Cap | Since | Reason on record | Now |
|---|---|---|---|---|
| `translator.translate_pilot`, its own Ollama call | 1,800-token reply, 90 s | `a63d9e3` 09-23 | none | vocab-2: no cap, 900 s; vocab-1: unchanged |
| `llm_backends.MAX_COMPLETION_TOKENS` (Ollama `num_predict`, OpenRouter `max_tokens`) | 1,800-token reply | `12d9f74` 09-25 | none | gone; `VOCAB1_MAX_COMPLETION_TOKENS` is sent for vocab-1 only |
| `llm_backends.TokenBudget` / `BudgetExceeded` | refuses a call whose worst case could pass the run cap | `12d9f74` | "the ceiling the PR bot and the Elysium panel promise" | gone |
| `compile.py --max-total-tokens` | 60,000 a run, exit 3 | `12d9f74` | the same | still accepted, does nothing (the entrants' pinned bot passes it); exit 3 is retired |
| arena `compile.maxTokensPerCompile` | 20,000 a compile | `e3e11ba` 09-25 | the same | gone |
| arena `compile.maxPromptBytes` | 16 KB of prose | `e3e11ba` | none; entries have had no size cap since 09-22 | gone; the 64 KB transport limit on any request body stays |
| evolve `mutation.maxTotalTokens`, `compile.maxTokensPerCompile`, `MAX_PROSE_BYTES` | 30,000 / 20,000 / 16 KB | `40602de` 09-30 | mirrored the panel | gone |
| jamobair-entrants `MAX_TOTAL_TOKENS` | 60,000 a run | `bf5eb2d` 09-25 (20k), `efa3c1c` 10-02 (60k) | "at most $0.009 a run" | gone, in a separate entrants PR |

**Retries** go through the same `generate`, so they had the same caps, and lose them the same way.
`max_attempts` (3) is a count of attempts, not tokens, and is unchanged.

**Left alone, on purpose:**
- **Dollar budgets.** These are not token caps:
  - the Jev schema server's `--budget-usd`, and the house and team servers' equivalents;
  - the arena's `dailyBudgetUsd` and `maxUsdPerMatch`;
  - evolve's `budget.mjs`;
  - `backend_parity.py`'s `budget_usd`.
- **`tools/model_server.py --max-tokens 120`.** This is the game path, one small JSON action per
  decision, not the translation.
- **`ab_prompt_harness.py`'s 1,800.** It reproduces a recorded A/B exactly.
- **`ground_truth.py`'s default of 120.** This is the ground-truth action reply.
- **Character limits on prose quoted back in retry messages.** For example, "write one rule for the
  whole sentence: <first 200 characters>". These are not token caps. Changing them would change
  the retry prompts that the clause-coverage job is editing, so they are listed here for a ruling.
- **The web form's 32 KB submission limit** (`submissions.maxPromptBytes`). A larger entry still
  goes in by pull request.

**vocab-1** is the frozen research vocabulary. Its request body stays byte-identical, with
`num_predict` 1,800, the same keys in the same order, and no `truncate`. This is pinned by
`test_llm_backends.test_vocab1_body_is_byte_identical_to_the_recorded_one`. Its 90 s and 120 s
timeouts are kept too. All 120 vocab-1 prompts are byte-identical to #92's. Two things change for
vocab-1 as for everyone:
- No run is refused for its token total any more.
- `compile.py`'s JSON no longer has a `cap_tokens` key.

## 2. Was there a reason? (step 1, for the record)

- **The 1,800 reply cap.** It is in `a63d9e3` with no comment, commit note or doc line. The research
  ground truth next to it uses `num_predict` 120 for a one-object reply, so 1,800 reads as "big
  enough for a schema". No measurement of reply lengths or loops was ever recorded. Since vocab-2,
  replies have run into it repeatedly: #79, #88 and #89 hit it, and in #92's batch 42 of 129
  replies were cut by it, 5 of them on the sample entrant.
- **The 90 s and 120 s per-call timeouts and the arena's 240 s.** These have no reason recorded.
- **The run caps.** These had a stated reason, the spend ceiling ("so a run can never overshoot
  its cap", "at most $0.009 a run"). The 17:59 ruling overrides it. The realistic cost without it
  is in §5.4.

## 3. Runaway generation, measured

| Replies | Loops | Notes |
|---|---:|---|
| #89 and #92 data, under the cap: 264 different replies from 89 run dirs | 0 | 48 cut by the cap (calibration: 3.45 characters a token); finished replies p50 ≈1,245, p90 ≈1,529 tokens |
| This batch, no cap: 111 replies | 0 | every reply `done_reason: "stop"`; p50 1,436, p90 2,435, max 3,312 tokens |

A loop means a 200-character window repeated three or more times, or one rule id written three or
more times. The 3,312-token reply was a retry, after the unfinished-guard check rejected the first
one. It wrapped each of 23 rules in its own guard node, and was rejected again. It was long, not
looping.

## 4. The safeguard, and two Ollama probes

These probes were all $0 and ran on the host's Ollama 0.35. The scripts are in the data release.

| Probe | Result |
|---|---|
| prompt over the window (dolphin3, `num_ctx` 512), default | answered "OK" from a prompt silently cut to 258 of 1,531 tokens |
| the same with `"truncate": false` | HTTP 400 "request (1531 tokens) exceeds the available context size (512 tokens)" |
| endless count, `num_ctx` 256, `"shift": false` | stopped at the full window, `done_reason: "length"`, 177 tokens |
| the same, default | still generating at the client's 45 s timeout; Ollama ended the request when the client hung up (logged at 45.0 s) and unloaded the model |
| `shift` false, then not, on `qwen3.5:9b` | the llama-server restarts on every flip (`--context-shift --keep 4` appears and disappears on its command line); 5–30 s each |
| `truncate` false, then not, on `qwen3.5:9b` | 0 restarts in 4 alternating calls |

So an uncapped Ollama request:
- sends no `num_predict`;
- sends `"truncate": false`, so a prompt over the window fails loudly instead of losing the start
  of the prose;
- does not send `"shift": false`. In this Ollama version, flipping it restarts the shared model for
  every other caller. The first version of this change sent it, and in this job's probes it
  restarted the model under the clause-coverage batch running alongside.

A reply that never ends is stopped by `llm_backends.CALL_TIMEOUT_SEC`, which is 900 s per call.
Ollama cancels the generation when the client hangs up. Measured speed was 81–94 tokens/s (p10–p90).
At that speed, filling the whole 32,768-token window takes about 6.4 minutes, so the timeout never
cuts a reply that could be valid. OpenRouter's providers stop at the model's context window.

## 5. $0 verification

**Setup.**
- The code was a frozen merge of this branch with #92, on develop with #90 and #91. #92 was open.
- Each prose file was compiled with `compile.py`'s own arguments as #92's batch: `--vocab vocab-2
  --economy eco-3-late --backend ollama`.
- Every reply was recorded with Ollama's own counts and timings.
- The batch is house-hard-eco ×12, the sample entrant ×12, house-easy-eco ×4 and siege ×4.
- p is a two-sided Fisher test against #92's batch, run with #87's `tally.py` unchanged.

**One confound.** #90 merged after #92's batch and added a siege fact to vocab-2's facts list. So
the vocab-2 prompts are not byte-identical to the ones #92's batch sent; all 120 vocab-1 prompts
are. The cleaner measure of this change is per reply (§5.2). A reply at or under 1,800 tokens is
one the old cap would have let through unchanged.

### 5.1 house-hard-eco

| | #92 (1,800 cap) | **no caps** |
|---|---:|---:|
| runs compiled | 0/4 (develop: 0/12) | **12/12** |
| instrument compiles | 0/12 | **36/36** |
| replies cut | 36/36 | 0/42 |
| reply tokens | (cut at 1,800) | 2,198 – 2,644, p50 2,336 |
| model calls per run | 9 (every attempt failed) | 3 in 9 runs, 5 in 3 |
| tokens per run, median | 51,840 | 18,783 |
| whole-compile wall time | ~300 s, failing | p50 125 s, max 222 s |

A screen of the 36 schemas (`hard_screen.py`) looked for each of the prose's 18 rules by action,
target and key words:

- All 18 are present in 24 of 36. Each of the other 12 is missing one:
  - "if your side is weaker, fall back to your own tower" is missing 9 times; the 9B left it out;
  - "afford, enemy minion or tower in sight, go home" is missing 3 times; the negation check
    removed it (§6).
- The default is `push_lane` in all 36.
- Order is the prose's in 20 of 36. In the other 16, see §6.

### 5.2 Every reply

| | replies | past 1,800 tokens (the old cap would have cut them) | shipped replies past 1,800 |
|---|---:|---:|---:|
| house-hard-eco | 42 | 42 | 36 of 36 |
| sample entrant | 44 | 2 | 1 of 36 |
| house-easy-eco | 13 | 0 | 0 |
| siege | 12 | 0 | 0 |

The sample entrant's two:
- s9 violin, 1,878 tokens. Its first reply passed every check and shipped. Under the cap it would
  have been cut, and the compile would have needed a retry.
- s11 drums, 3,312 tokens. This is the guard-per-rule retry in §3; it was rejected and not shipped.

Every other reply in the batch was within the old cap, so the cap could not have changed it.

### 5.3 Against #92's table (sample entrant, 12 runs each)

| | #92 | **no caps** | p |
|---|---:|---:|---:|
| compiled | 36/36 | **36/36** | 1.00 |
| recall present / gated / in tower range | 35/35/0 | 35/35/0 | 1.00 |
| back off present / before recall | 33/27 | 32/29 | ≥ 0.78 |
| home: 300 gold / afford / no minions | 26/35/7 | 32/34/11 | ≥ 0.13 |
| home: afford clause lost | 4 | 0 | 0.12 |
| afford sentence: joint / split-ok / afford-only / none | 9/4/23/0 | 8/0/26/2 | ≥ 0.12 |
| inverted negation | 0 | 0 | 1.00 |
| parking rule | 0 | 1 | 1.00 |
| whole draws passing #84's screen | 5/12 | 6/12 | 1.00 |
| typed guard in any reply | 0/58 | 0/44 | 1.00 |
| model calls per run, median | 4 | 3.5 | |
| tokens per run, median | 19,270 | 17,032 | |

The one parking rule (s7 drums, "is this bot at its base?") came from a 1,436-token reply. That
reply was within the old cap, so it is sampling noise, not this change.

**house-easy-eco:** 12/12 compiled (#92: 12/12), 3 calls in 3 of 4 runs.
**siege:** 12/12 (#92: 12/12), 3 calls in every run.

### 5.4 Time and cost

| | p50 | max |
|---|---:|---:|
| generation speed, tokens/s | 83 | p90 94 |
| Ollama eval seconds per call | 16.5 | 35.4 |
| wall seconds per call (includes waiting behind the clause-coverage batch on the same Ollama) | 29.0 | 49.8 |
| whole compile, 3 instruments one at a time: house-hard / sample / easy / siege | 125 / 95 / 83 / 89 s | 222 / 152 / 94 / 92 s |

**Wall-clock limits.** The per-run wall clocks are not token caps. They do have to fit a valid
uncapped compile:
- The arena's `compile.timeoutSec` was 240 s, barely above the 222 s worst. It is now 900 s: 3
  instruments × 3 attempts × the 50 s slowest call, doubled.
- The entrants bot's 540 s and its 10-minute job are raised in the entrants PR.

**Cost on OpenRouter.** This is `qwen/qwen3.5-9b` at $0.10 per million tokens in and $0.15 out,
from this batch's own prompt and reply counts:

| prose | per compile, median | max |
|---|---:|---:|
| house-hard-eco | $0.0022 | $0.0037 |
| sample entrant | $0.0022 | $0.0031 |
| house-easy-eco | $0.0015 | $0.0020 |
| siege | $0.0016 | $0.0016 |

- **A PR-bot run of three hard-eco-sized pilots:** about $0.011, about 95,000 tokens. That would
  have overrun the bot's old 60,000-token cap.
- **One runaway call at the dearest listed provider:** at most $0.059 (235,929 tokens out at $0.25
  per million). In practice the per-call timeout ends it sooner.

## 6. Fidelity defects that whole compiles now show (not fixed here)

1. **Rule order on a long cascade.** 16 of 36 hard-eco schemas move rules out of the prose's
   order. The usual move puts the 480-second tower rule, and sometimes the tower-fire retreat and
   both finish-kill rules, after the Bandstand rules. That puts them below "push with your wave
   (if an allied minion is near you)", which nearly always fires, so they would rarely run.
   Example: s7 keytar is 1–6, 11, 12, 13, 14, 15, 16–18, 9, 10, 8, 7. It also invents a last rule,
   "is there no other rule matching?". No check catches a rule that leaves the prose's order.
2. **The negation check removes a correct rule.** In s5, s6 and s10 keytar, #87's `enforce_negation`
   tied the shopping rule ("can afford … no enemy bearbot … an enemy minion or tower in sight") to
   the sentence "Never stand in an enemy tower's fire". It rejected the rule twice, then dropped it
   on the last attempt.
3. **Coverage.** "Fight under your own tower" is missing from 9 of 36 schemas. That is the
   clause-coverage job's territory.

The checked-in `house-hard-eco.schemas.json` is still the hand-spliced compile from #88. Whether
to recompile it whole now is a separate call, given items 1 and 2.

## Data

The `data-remove-token-caps-2026-10-02` prerelease holds every reply with its Ollama counts and
timings, the check log, the saved schemas, the reports, the probe outputs, and the scripts:
`rec_verify.py`, `batch.sh`, `lengths.py`, `hard_screen.py`, `analyze.py`, `cost.py` and
`probe_*.py`.
