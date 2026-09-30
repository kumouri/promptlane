# Prompt-evolution harness: smoke run and backend measurements, 2026-09-30

**A smoke run, not a campaign.** One tiny generation proves the v0 harness (`tools/evolve/`)
works end to end on the Jam's real backend. The measurements beside it feed the budget and noise
sections of [`docs/prompt-evolution-spec.md`](../docs/prompt-evolution-spec.md). Whether and how to
launch a campaign is Ceryce's call; that spec lists the open decisions. The loop is her design.

## Setup

| | |
|---|---|
| Harness | `npm run evolve -- init --name smoke-2026-09-30 --seed-prompt prompts/pilots/drums.md --config <below>`, then `step` |
| Config | seed 20260930; 1 parent × 2 children; 1 epoch seed (455922465), both sides; quick shape (180 s, cadence 4, plumbing only); epoch length 2, so no promotion test ran |
| Jev | `tools/jev/schema_server.py --port 8805 --budget-usd 0.50`, a private port, live Workers AI, **with the token fix of PR #36**, since merged (without it every call 401s, see below) |
| Compile | `compile.py` on OpenRouter `qwen/qwen3.5-9b` (the translator's model, hosted), so the local GPU was never touched |
| Mutation | `tools/evolve/mutate.py` on Haiku 4.5 through the `claude` CLI |
| Wall time | 06:28:13 → 06:31:13 UTC, **3 min** for the whole generation |

## The generation

Generated report: [`prompt-evolution-smoke-2026-09-30-report.md`](prompt-evolution-smoke-2026-09-30-report.md).
Prose, lineage, mutation outcomes and compiled schemas:
[`prompt-evolution-smoke-2026-09-30-genomes.json`](prompt-evolution-smoke-2026-09-30-genomes.json).

| Slot | Focus (seeded) | The one change (the mutator's own words) | Checked diff |
|---|---|---|---|
| g0-p0-c0 → `d9489a934697` | add one rule for a situation the prose does not cover yet | *"Added one sentence specifying that drums should recall when low on health and safe from immediate threats…"* | 1 sentence added |
| g0-p0-c1 → `d17d715bf190` | swap the priority of two existing rules | *"Prioritized attack targeting before lane pushing…"* | 1 sentence moved (2 in the diff) |

| Genome | Mean score | W-D-L vs seed | Elo |
|---|---:|---|---:|
| `d9489a934697` (survives) | 0.75 | 1-1-0 | 1016 |
| `d17d715bf190` | 0.50 | 1-0-1 | 1000.7 |
| `7edc45a304cf` (seed = opponent) | ½ by definition | — | 1000 |

**Don't read strategy into this.** One seed, quick shape, and in every match all six bearbots died
inside ~62 sim-seconds, so minions chipping towers decided the rest. Green won all three decided
matches whichever prompt played it: side, not prompt. The Jam-shape check below reverses the
ranking.

Plumbing: 165 Jev calls, 0 errors. Both mutations were valid single changes on the first attempt.
Three compiles, all three instruments each; two needed translator retries inside `compile.py` (4 and 5 calls for 3 instruments). All four match
logs pass `npm run match -- --verify`.

**Resume, live.** The finished store was copied and `state.json` rewound to generation 0. `step` was
then re-run with the schema server stopped, no OpenRouter key and a PATH without `claude`. It made no
calls, reused every saved mutation, compile and match, and reproduced the ranking and survivors
exactly.

## Measurements for the spec

All at the same seed (455922465), on the same private schema server. Logs are flat files beside this
one (`prompt-evolution-smoke-2026-09-30-measure-*.json`); all four pass `--verify`. In every
checked-in log, `promptFile`/`schemaFile` were rewritten from absolute to repo-relative paths before
check-in (the harness now passes relative paths itself); both are metadata, and every log re-verified
after the rewrite. They point into the git-ignored store; the same prose and schemas are in
`-genomes.json`.

| Run | Shape | Result | Wall | Jev calls | Notes |
|---|---|---|---:|---:|---|
| `replay-2e46`: smoke match `2e46…` again, same schemas and seed | quick | violet **0** by tower hp; the original was a **full draw** | — | 36 | **Jev is not deterministic** (below) |
| `full-d948-v-7edc` | **Jam** (600 s, cadence 2) | seed (green) wins by tower hp | 17.8 s | 131 | all six dead by 66 s |
| `full-7edc-v-d948` | Jam | seed (violet) wins by tower hp | 15.4 s | 95 | all six dead by 66 s: at Jam shape the seed beats `d9489a934697` on **both** sides |
| `full-house-v-7edc`: `house-violet.md` prose, compiled like an entrant's, vs the seed | Jam | house wins at timeout; 0 deaths vs 3, took 2 towers | **157.3 s** | 904 | long-survival bound: 292 rounds at 0.54 s/round |

**Jev determinism.** Comparing the replay to the original by (tick, bot): the sim was identical up
to tick 172. Even there, only **98 of 190** per-question Jev answers were exactly equal (median
\|Δ\| 0, p90 0.14, max 0.69). The first differing action came at tick 172 (8.6 s), the deaths
diverged after it, and the result flipped. A match with a fixed seed and fixed schemas is still a
random draw.

**Jev throughput and cost** (the server's `/health` at the end, all runs above): 1,331 requests, 0
errors, mean 0.373 s, 1,195,818 input tokens (~900/call), **$0.0502**, which is $0.038 per 1,000
calls. One surviving side drove ~345 calls a minute with no throttling.

**Other spend.** Compile: 4 genomes (3 smoke + house), 15 calls, 37,955 tokens, $0.0057 on
OpenRouter. Mutation: 2 calls on Haiku through the `claude` CLI (subscription). The CLI reports a
notional $0.066.

## Found along the way

- **`schema_server.py` token bug.** It read the Workers AI token once at startup. On this host, the
  on-disk wrangler token had expired on 2026-09-26, so the unmodified server answered the first
  decision `502 workers-ai 401`. Its own retry couldn't renew a plain string. Fixed in PR #36 (merged
  2026-09-30). With the fix, the server renewed the token (`expires in 3599s`) and
  answered 200.
- **Translator leak.** Compiling `house-violet.md` put `keytar_ready → chord` (and
  `violin_ready → staccato`) into the **drums** schema, from the prose's "keytar only: … / violin
  only: …" lines. It fired 2 times out of the drums bot's decisions in `full-house-v-7edc`.

## Reproduce

```
python tools/jev/schema_server.py --port 8805 --budget-usd 0.50
npm run evolve -- init --name smoke-2026-09-30 --seed-prompt prompts/pilots/drums.md --config smoke-config.json
npm run evolve -- step --name smoke-2026-09-30
npm run evolve -- report --name smoke-2026-09-30 --out runs/prompt-evolution-smoke-2026-09-30-report.md
# a Jam-shape match between two stored genomes:
npm run match -- --a <store>/genomes/<v>.md --a-schemas <store>/compiled/<v>.json \
    --b <store>/genomes/<g>.md --b-schemas <store>/compiled/<g>.json --jev-schema http://127.0.0.1:8805/ --seed 455922465
```

`smoke-config.json`:
`{"seed": 20260930, "shape": {"cadenceSec": 4, "maxSimSec": 180}, "evaluation": {"seedsPerEpoch": 1}, "population": {"parents": 1, "childrenPerParent": 2}, "epoch": {"generations": 2, "promotionSeeds": 8}, "mutation": {"backend": "claude", "model": null}, "compile": {"backend": "openrouter", "model": null}, "jevSchemaEndpoint": "http://127.0.0.1:8805/"}`.
Jev answers are sampled, so a re-run gives different matches (see above). The checked-in logs are
what this run drew.
