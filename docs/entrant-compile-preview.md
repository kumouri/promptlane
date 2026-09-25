# Entrant compile preview — three ways to try your prose before the jam

The InRhythm AI Jam (Friday 2026-10-02, arena = Elysium) runs entrants on **Jev**. Each entrant's
prose `pilot.md` is compiled once into a Jev rule cascade by the prose-to-schema translator
([`prose-to-schema-translator.md`](prose-to-schema-translator.md),
[`translator-transparency.md`](translator-transparency.md)), and Jev answers the cascade's yes/no
questions every decision. Entrants need to see what their prose compiles to *before* jam day. This
doc covers the three ways they can, all built on one code path.

## Rulings (Ceryce, 2026-09-25)

| When | Ruling, verbatim | What it decided |
|---|---|---|
| 10:42 CT | *"Feels like enough of one, I think. Especially for a first jam. With the transparent translator they should be fine as long as they don't come day of without having tried it through the translator/parser/compiler."* | The jam runs entrants on Jev, with their prose compiled by the transparent translator. |
| 10:43 CT | Asked how entrants try their prose before Oct 2 — (1) a PR bot in jamobair-entrants, (2) a command they run locally, (3) Margo compiles on request: *"1, 2, and a live version in elysium."* | Build three ways in: the PR bot, the local command, and a live panel in Elysium. Margo-on-request was not picked. |

Both are also rows 20–21 of the arena's ruling table ([`arena-site-spec.md` §7](arena-site-spec.md)).

## The three doors

| Door | How an entrant uses it | Where it lives |
|---|---|---|
| **A. Local command** | `python tools/jev/compile.py entrants/<you>/pilot.md` (or `npm run compile -- <file>`) in a promptlane checkout. It needs only Python 3.11+, no `pip install`. Add `--backend ollama` for free local compiles, or `--backend openrouter` with your own `OPENROUTER_API_KEY`. | `tools/jev/compile.py` |
| **B. Elysium panel** | Open **Compile** in Elysium's nav, paste the prose, and read the view. Optionally click **Run a quick practice match vs the house bot**: Jev plays exactly the rules just shown. | `tools/arena/compile.mjs`, `tools/arena/pages/compile.mjs` |
| **C. PR bot** | Open or update a PR touching `entrants/<you>/pilot.md` in jamobair-entrants. The bot comments the view on the PR and updates that one comment on every push. | `jamobair-entrants/.github/workflows/compile-preview.yml`, `tools/compile_preview.py` |

**One code path.** B and C don't reimplement anything. The arena runs `compile.py --stdin --format
json` as a child process. The PR bot checks out promptlane at a pinned ref and runs the same file.
`compile.py` itself adds no translation logic of its own:

- `translator.translate_pilot` (prompt, parse, retries, priority guard) and
  `transparency.render_report_markdown` are used unchanged.
- `translate_pilot` gained one optional `generate` argument, so the same translation can run on
  OpenRouter or under a token cap.
- `compile.py` supplies what entrants need on top: arbitrary prose, all three instruments, a
  choice of backend, a spend cap, and JSON output.

## What the view shows

One prompt drives all three of an entrant's bearbots, so every instrument is compiled separately.
A preview is a short header followed by one transparency report per instrument. The report format
is the one [`translator-transparency.md` §1](translator-transparency.md#1-the-transparency-view)
documents:

- a quick-view table: condition → action, in cascade order;
- per rule: the literal `noul` question Jev is asked, what yes/no mean, why the rule sits where it
  does (including priority-guard promotions), and the prose sentence(s) it traces back to, or
  `⚠ no strong match`;
- **Dropped**, quoted, with a reason for each: rule-like sentences no compiled rule traces back to
  (check these by hand), advisory prose Jev's question types can't take, and voice.

**Automatic labels.** The rule / advisory / voice split was hand-labelled for the three reference
pilots only. `transparency.py` refused other prose rather than guess. For entrant prose,
`tools/jev/segment.py` labels each sentence with a small word list:

- **rule**: a condition cue plus an action or entity cue;
- **advisory**: an action or judgment cue with no condition;
- **voice**: everything else.

A report built this way says so at the top. Byte-exact copies of the reference pilots keep their
hand labels.

The labeller is tuned toward calling things rules. Measured against the hand labels:

| Pilot | Rule-prose characters also labelled rule | Overall character agreement |
|---|---:|---:|
| drums.md | 88% | 67% |
| keytar.md | 100% | 83% |
| violin.md | 95% | 65% |

The bias is deliberate. A sentence wrongly called a rule shows up under "check this by hand", a
false alarm the entrant can dismiss. A rule sentence misfiled as voice would hide a dropped
instruction, and that is the failure this view exists to prevent. `test_segment.py` fails the build
if rule recall on any reference pilot drops below 85%.

## Backends, spend caps, keys

| | Ollama (default) | OpenRouter |
|---|---|---|
| model | `qwen3.5:9b` (the translator's measured model) | `qwen/qwen3.5-9b` (same model, hosted) |
| key | none | `$OPENROUTER_API_KEY`, read from the environment only; never logged, echoed or sent to a browser |
| cost per compile (3 instruments) | $0 | ≈$0.0006 (measured: $0.0005–$0.0011) |
| select | `--backend ollama` (`$OLLAMA_HOST`, default `127.0.0.1:11434`) | `--backend openrouter` |

`$JEV_COMPILE_BACKEND` sets the default backend.

**Spend caps:**

- `compile.py --max-total-tokens` (default 60,000) is a hard cap. A call is refused *before* it is
  made unless the tokens already spent, plus that call's worst case (prompt estimate + 1,800
  completion tokens), fit under the cap. So a run never overshoots the cap.
- The arena passes `compile.maxTokensPerCompile` (20,000).
- The PR bot passes its own per-run cap (see the entrants repo's workflow).

**Exit status:**

| Code | Meaning |
|---|---|
| 0 | everything compiled |
| 1 | an instrument failed to compile; the view says which |
| 2 | bad usage, or the backend was unreachable |
| 3 | the token cap stopped the run |

## Door B in Elysium: limits and the practice match

The panel is on by default (`compile.enabled`). It compiles with `compile.backend` (default
`ollama`; set `openrouter` plus `OPENROUTER_API_KEY` in the arena's environment for the hosted
model). All calls happen server-side.

**Limits** (config `compile`, all in memory, reset on restart):

| Limit | Default | When exceeded |
|---|---|---|
| per client IP, rolling minute | 3 | 429 with `Retry-After` |
| per client IP, Central day | 20 | 429 |
| everyone, Central day | 400 | 429 |
| compiles at once | 1 | 503 |
| tokens per compile | 20,000 | passed to `compile.py` as its cap |

Invalid prose (same validator as the entrants repo) and "busy" refusals don't spend quota.

**Client IP behind a proxy.** The arena binds 127.0.0.1, and behind the Cloudflare Tunnel every
request arrives from 127.0.0.1. Set `compile.ipHeader: "cf-connecting-ip"` there, or all visitors
share one bucket. Whether and how Elysium is exposed publicly is Ceryce's call and out of scope
here.

**Practice match.** It is offered only when `compile.practiceBackend` names a `kind:
"jev-schema-http"` backend: `tools/jev/schema_server.py` on `127.0.0.1:8797`, live Jev via Workers
AI, with a `--budget-usd` cap (default $0.50). How it plays:

- Each compile is cached for 2 hours under a random id. The practice job carries those exact
  schemas, so the match plays the rules the entrant just read, not a fresh sampled translation.
- `Queue.decisionPilotFor` routes the practice side to `tools/match/jevSchemaPilot.ts`, which posts
  `{schema, observation}` per decision. The server decides with `fidelity_harness.run_prediction`
  unchanged: one Jev call per decision, the first "yes" in cascade order wins, and the target is
  resolved in Python.
- The house plays green as usual.
- It counts as a quick test: same quota, never ranked, replay-verified.
- The match log records each of the entrant's decisions as `{rule, action, answers, ms}`, so the
  match page shows which rule fired.

**Run it** (runbook §1b has the operator steps):

    python tools/jev/schema_server.py            # live Jev (Workers AI); --stub for $0 plumbing runs
    # runs/arena/config.json: "compile": {..., "practiceBackend": "jev-schema"}

## Door C: the PR bot

Lives in [kumouri/jamobair-entrants](https://github.com/kumouri/jamobair-entrants):
`.github/workflows/compile-preview.yml` plus `tools/compile_preview.py`.

**What it does:**

- Runs on `pull_request_target` for changes to `entrants/**/pilot.md`, one run per PR at a time
  (a concurrency group with cancel-in-progress).
- Reads the changed pilot files from the PR head through the GitHub API, as data only. It never
  checks out or executes PR code.
- Runs this repo's `tools/jev/compile.py`, checked out at a pinned SHA, on OpenRouter under a
  per-run token cap.
- Upserts one sticky comment, found by a hidden marker.

It reads the repository secret `OPENROUTER_API_KEY`. Until an organizer adds it, the bot posts a
"not configured yet" comment and passes.

## Measured (2026-09-25)

**Reproduces the checked-in runs, byte for byte.** `tools/jev/test_compile.py` parses each
checked-in transparency run (drums, keytar, violin, and keytar's ORIGINAL bad compile) back into
the schema it rendered. It then feeds that schema through `compile.py` exactly as an entrant's
prose would go, and requires identical output. All four pass.

**Live compiles.** Translation is sampled, so a live compile can't be byte-compared.
`runs/entrant-compile-{drums,keytar,violin}-{ollama,openrouter}-2026-09-25.md` are six live compiles
of the reference pilots. Compared with the checked-in runs:

| | checked-in | Ollama (live) | OpenRouter (live) |
|---|---|---|---|
| drums | 5 rules, recall first, default push lane, 1 unclaimed | same shape; 2 unclaimed | same actions in the same order as checked-in |
| keytar | 5 rules, recall promoted by the guard | 5 rules, recall promoted by the guard; same actions in order except the basic attack targets the nearest enemy, not a minion | 5 rules, recall already first, one extra glissando rule |
| violin | 7 rules, recall first | 5 rules, recall first, same first four actions | 5 rules, recall first, default moves to isolated enemy (as checked-in's rule 6) |

Across all six live compiles:

- the Dropped → advisory and voice sections are identical to the checked-in runs (these come from
  the hand labels, so they are deterministic given the prose);
- recall is the first rule;
- run-to-run rule-set variation is what [`prose-to-schema-translator.md`
  §4.3](prose-to-schema-translator.md) already documented for this model.

Ollama took 8–19 s per instrument. OpenRouter took 3–5 s and $0.0002.

**Door B live** (arena on :8795, dev mode, house on the mock model so the shared :8787 model server
was untouched):

- Compile: violin.md compiled through the panel's API on OpenRouter in 6 s, 4,558 tokens, $0.0006.
- Rate limit: a 4th compile inside a minute got `429` with `Retry-After: 49`.
- Practice match: finished in 140 s wall, 3 sim-minutes, 36 checkpoints replay-verified. It made
  129 live Jev calls costing $0.0037. 5 calls ran past the 30 s pilot timeout and held; that is the
  designed transport-failure path. The fixture held 3.9% of the entrant side's decisions.
- What the match showed: violin.md's compiled cascade only ever moved. It fired `reposition_next`
  84 times and the default 40 times, and never attacked. One practice match surfaces exactly the
  kind of "the rules aren't what I meant" signal the panel exists for.

**Door C dry run:** `compile_preview.py --dry-run` against the real compiler on OpenRouter:

- the entrants template as a fake entry: 3 calls, 4,629 tokens, $0.0005;
- drums.md as a fake entry: $0.0006;
- the no-key path: posts the "not configured" comment and exits 0.

`act` wasn't used; the dry-run harness plus the offline tests
(`tools/test_compile_preview.py`) cover the logic.

**Total model spend for this work:** under $0.02 (OpenRouter compiles plus Jev). The cap was $3.

## Not done / known limits

- **Per-day limits reset on restart.** Door B's limits live in memory, so an arena restart resets
  them. That's acceptable while it binds 127.0.0.1; revisit before any public exposure.
- **Practice uses the mock model in the live proof above.** The measured match ran the house on the
  mock model. On the real ladder the house plays `tournament.backend` (qwen3.5:9b), so a practice
  match takes the usual quick-test wall time.
- **Automatic labels are a heuristic.** Their measured agreement is above. They were not validated
  on real entrant prose, because none existed yet.
- **The PR bot's pin needs a bump.** It is pinned to a commit on this branch; move it to develop's
  merge commit once this merges.
