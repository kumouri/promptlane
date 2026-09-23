# Jev suitability harness — everything but the paid call, 2026-09-22

Builds the test `docs/jev-decision-model-research.md` (memo, PR #20, branch
`docs/jev-preview-research`) proposes: replay `prompts/pilots/house-violet.md`'s seven-rule decision
table against real logged decisions in `runs/house-prompt-2026-09-21-r*.json`, as Jev `questions`,
and compare Jev's answers to what the ruled `qwen3.5:9b` backend actually did. Code:
`tools/jev/{client,rules,serializer,harness}.py` + `tools/jev/test_*.py`. **No paid call was made —
there is no `TYPESAFE_API_KEY` on this host, and none was obtained, per the brief.**

## Run it

```
python tools/jev/harness.py                                # dry run, stub client, no network (default)
TYPESAFE_API_KEY=... python tools/jev/harness.py --live     # the real thing, once a key exists
```

The key is read from `$TYPESAFE_API_KEY` only (`tools/jev/client.py::resolve_api_key`, mirrors
`tools/model_server.py`'s posture exactly). No key, no file, nothing to gitignore beyond what
`.gitignore` already covers (`.env*`) — this harness never writes one.

## What "Observation snapshot" actually turned out to mean

The brief assumed the checked-in run logs contain the raw `Observation` object
(`tools/arena/pages/contract.mjs`: `self`, `allies`, `visibleEnemies`, `nearbyMinions`,
`nearbyTowers`). Read in full, they don't. `decisions[]` holds `{tick, bot, reply, action, ms,
cached}` — `action` is the *parsed reply*, i.e. the five worksheet fields house-violet.md's model
self-reports (`hp`, `wave`, `tower`, `foe`, `cd`) plus the `kind`/`target`/`ability` it chose. No
positions, no per-ability cooldown map, no minion identities, no enemy `kind`/hp beyond a bare id.
`checkpoints[]` (every 100 ticks) has even less for this purpose — per-bearbot `[hp,x,y,alive,
recalling]`, tower/nexus hp arrays, and a bare minion *count*, no cooldowns or identities at all.

So this harness replays the **worksheet**, not the Observation: the reduced fields the ruled model
already extracted before deciding, which is exactly the subset six of the seven rules consume. Full
detail and the one real gap this creates (rule 3's violin/drums variant needs a foe's `kind`/hp,
which isn't in the logs) is in `tools/jev/rules.py`'s module docstring — flagged there and in the
harness's own per-question output, not smoothed over.

## Rule → question mapping (full detail: `tools/jev/rules.py`)

| Rule | house-violet.md | Jev question | Type |
|---|---|---|---|
| 1 | hp < 75 → recall | `q1_low_hp_recall` | noul |
| 2 | tower not null and wave = 0 → go home | `q2_tower_no_wave_go_home` | noul |
| 3 | ability ready (instrument-gated) → ability | `q3_ability_ready` | noul (reduced — see below) |
| 4 | foe not null → attack foe | `q4_foe_present_attack` | noul |
| 5 | tower not null → attack tower | `q5_tower_present_attack` | noul |
| 6 | foe null, tower null, wave ≥ 1 → ride wave | `q6_wave_present_ride` | noul |
| 7 | otherwise → wait at home | *(no question — unconditional default)* | — |

All six questions go into **one `systemone` call per snapshot** (matching Jev's own design: every
question answered in parallel, one call, no free text). The harness applies them in rule order in
Python (`rules.first_match`) — Jev is asked to judge each *condition*, not to run the cascade
itself, so a wrong final action traces back to exactly which condition it got wrong.

**q3's reduced condition.** Violin/drums need "foe is a bearbot with hp < 100"; the logs don't carry
foe kind or hp, so q3 asks the same reduced condition — cd = 0 and foe present — for every
instrument. Predicted `ability` firings for violin/drums are expected to over-trigger relative to
the true rule whenever the real foe was a minion or a bearbot ≥ 100 hp. Documented in code
(`rules.py`), and the wording actually sent to Jev says so too for violin/drums.

## The state paragraph (full detail: `tools/jev/serializer.py`)

TypeSafe's docs (fetched 2026-09-22) say `state` accepts "String, JSON object, or array of text
values"; the only concrete style guidance found anywhere is the launch post's own line: *"The
`state` is also a short, dense, and detailed paragraph, to emphasize the difference in sampling
methodology"* (https://typesafe.ai/blog/introducing-system-one-models-and-jev). So: prose, not raw
JSON.

**The numbers decision.** Every rule is a numeric/threshold or presence comparison, so there's no
way to omit numbers — the comparison *is* the thing under test (Simon Willison's independent
caveat: Jev is "not great with numbers, dates," https://simonwillison.net/2026/Sep/21/jev/, is the
central risk this whole harness exists to probe). Chosen encoding: spell out both the raw value and
its threshold-relative meaning in the same clause — `"cd is 0.0 seconds, meaning the ability is off
cooldown and ready to use"` rather than just `"cd is 0.0"`. Example paragraph (real snapshot, r1
tick 1):

> This is a violet-team bearbot playing keytar, 0.1 sim-seconds into the match (tick 1). Its own hp
> is 140, which is at or above the 75-hp recall threshold. No allied minions are in its wave right
> now (wave count 0). An enemy tower or nexus is visible, id tw-7. No enemy bearbot or minion is
> currently targeted as a foe. Its instrument ability's cooldown is 0.0 seconds, meaning the
> ability is off cooldown and ready to use.

**What I'd try instead** if results are inconclusive or make the numbers-risk look worse than it
is, cheapest first (all are one-function edits — `serializer.py`'s module docstring has the same
list, kept in sync here): (1) bare numbers, no interpretive clause, to isolate whether the
interpretation is helping or just padding tokens; (2) numbers spelled as words ("sixty-one") —
digit-vs-word tokenization is a known sharp edge for small/decision models generally, and Willison's
caveat doesn't say which failure mode Jev has; (3) a structured JSON `state` object instead of
prose, since the docs accept that too.

## Dry run — stubbed client, real snapshots

```
$ python tools/jev/harness.py
```

runs clean end to end: **263 snapshots**, one per house-violet.md decision across all four checked-in
logs that was a real (non-cached) model call with a valid, rule-producible action —

| file | house-violet.md snapshots |
|---|---:|
| `house-prompt-2026-09-21-r1-house-vs-drums-seed7.json` | 101 |
| `house-prompt-2026-09-21-r2-drums-vs-house-seed11.json` | 0 (violet plays `drums.md` this run; green is `house-green.md`, out of scope) |
| `house-prompt-2026-09-21-r3-house-vs-drums-seed11.json` | 101 |
| `house-prompt-2026-09-21-r4-house-vs-house-seed7.json` | 61 |
| **total** | **263** |

Instrument split: keytar 115, violin 45, drums 103. `tools/jev/test_harness.py` locks these numbers
in against the checked-in files.

The stub (`StubSystemOneClient`, seeded, no network) answers each question from its own
rule-derived ground truth with a 10%-by-default induced error rate, so the dry run exercises both
the agree and disagree paths through the report — a stub that was always right would leave the
disagreement code untested. **These numbers are a plumbing check, not a suitability signal** — they
say the harness works, nothing about whether Jev is actually good at this:

- Overall bucket agreement: **31.9%**
- Per-rule (per-question) accuracy: 88.2%–90.9% across all six questions (close to the ~90%
  built into the stub's error rate, as expected)

**The interesting finding sits underneath that overall number, not in it.** Running the dry-run
client at `error_rate=0` — i.e. a hypothetical Jev that answers every single condition *exactly as
the rules say it should* — does **not** reach 100% overall agreement (`test_harness.py`'s
`test_zero_error_stub_answers_every_condition_correctly` locks this in). Ground truth here is *what
`qwen3.5:9b` actually did*, and this repo's own compliance measurement
(`runs/house-prompt-2026-09-21.md`, "Compliance" section) already shows that model disobeying its
own worksheet in a large minority of cases — the hp<75→recall rule alone fires only 46% of the time
it should. A perfect rule-follower disagrees with that ground truth exactly where the ruled model
broke its own rules, which is real signal about the baseline this test is measuring against, not a
flaw in the harness.

## Cost estimate for the real run

263 snapshots × 6 questions/snapshot, ~438 estimated input tokens/snapshot (state paragraph +
every question's instructions + criteria text, ~4 chars/token, `tools/jev/client.py::
estimate_request_tokens`) = **~115,200 input tokens total**, at $0.042/M input, output free:

**≈ $0.0048** for the full scoped test (all 263 house-violet.md snapshots). For scale: the
Phase C OpenRouter proof spent $0.0143 for 138 calls
(`runs/openrouter-phase-c-proof-2026-09-22.md`); this is fewer dollars for roughly double the
calls, mostly because Jev's output is free and each call here is small (one short paragraph, six
short questions). Comfortably inside "a few cents, not a few dollars."

## Where the memo and the checked-in data disagree

Flagged, not smoothed over, per the brief:

- **The memo's "904 real calls" doesn't match the logs.** `docs/jev-decision-model-research.md`
  cites 904 real calls across the four house-prompt runs, sourced to `runs/
  house-prompt-2026-09-21.md`'s own prompt-budget section. Counting `decisions[]` entries with a
  `reply` present (i.e. not cached) directly from the four checked-in JSON logs gives **764**, not
  904 — both sides, both prompt files, all four files. Scoped to house-violet.md alone (this
  harness's dataset), it's 263. I did not chase down the 904/764 gap further; it doesn't change
  anything this harness needed to build, but it's a real discrepancy between a cited number and the
  data it cites.
- **No confirmed `model` value for the raw HTTP endpoint.** `docs.typesafe.ai/api.md` says `model`
  is a required string but gives no example value. The closest evidence is Pydantic AI's
  integration, which addresses Jev as `"typesafe:jev-latest"`, and Cloudflare Workers AI's catalog,
  which pins `jev-1.13.0`. `client.py`'s `DEFAULT_MODEL = "jev-latest"` is inferred from the first
  of those, not confirmed by TypeSafe's own reference — overridable with `--model`.
  `docs.typesafe.ai/sdk/python` does show a real Python SDK call shape (`client.system_one(state=,
  questions={...})`, `Noul`/`Choice`/`Score` question types), which this harness's `client.py`
  cites and mirrors the wire shape of, but does not depend on the `typesafe_sdk` package itself
  (stdlib `urllib`, matching `tools/model_server.py`'s own convention).
- **No ToS, no confirmed free-tier/card requirement.** Neither the memo nor anything fetched for
  this harness found a TypeSafe terms-of-service document or said whether a card is required to get
  a key. Unverified, not assumed.
