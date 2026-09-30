# Prompt evolution for the house bots: spec and v0

*Written 2026-09-30. The loop is **Ceryce's design**. Her ask (2026-09-30 01:10 CT, verbatim excerpt):*

> *"we also need to test how decent our house bots are. I'd like it if we had like easy medium and
> hard and they were differentiated by STRATEGY instead of just by stats, etc. So we'll need to do
> some prompt engineering and testing, I'm thinking this is actually a really good chance to practice
> our autonomous prompt evaluation skills. You can generate prompts, translate them to jev, play
> games, pick the best ones, make single changes to it (or go with some sort of a genetic algorithm
> or something) and then test it again. At the end of each epoch (which would be X number of
> generations) you would update the opponents so they were using the prompt that just won, and then
> you start trying to beat that prompt."*

*Follow-up, 01:11: "Alternatively you can make up a rubric of how well each position was played by
the prompt and grade against that, somewhat more traditional." Ruling, 01:12: **both in parallel**.
Quick strategy tiers for Friday are a separate job; this harness starts now and is practice. Margo
added three suggestions that Ceryce **has not ruled on**. They appear in §6 as proposals, and the
decisions they need are listed in §10.*

**Status.** v0 is built (`tools/evolve/`, §8). One smoke generation ran on the Jam's real backend
(§9). **No campaign has been launched.** Launching one is Ceryce's call after she reads this spec.
Numbers marked *measured* come from `runs/prompt-evolution-smoke-2026-09-30*.{md,json}`. Anything
else is labelled as an estimate.

## 1. Goal

Produce house-bot prompts at three tiers (easy, medium, hard) that differ in **strategy**, not only
in strength. Do it with an autonomous loop, so the loop is also practice in evaluating prompts
without a human reading every game. Every tier bot is prose that goes through the same translator
as an entrant's (`tools/jev/compile.py`) and is played by Jev (`tools/jev/schema_server.py`), the
Jam's own path (ruling 2026-09-25). A tier bot therefore plays under exactly the constraints an
entrant does.

Out of scope here: the Friday tiers (separate job), changing the sim (`src/sim` is frozen), and the
arena's placement rules (`docs/arena-site-spec.md` §3.5).

## 2. The loop (Ceryce's design) and how v0 runs it

```
 epoch e: opponents O_e                      (epoch 0: the first seed prompt)
 ┌──────────────── generation g ─────────────────────────────────────────────────┐
 │ parents P_g ──mutate: ONE change each──▶ children C_g                         │
 │ P_g ∪ C_g ──compile (translator → Jev rule cascade)──▶ phenotypes             │
 │ every candidate × every opponent × epoch seeds × both sides ──play (Jev)──▶  │
 │ score (Jam tie order) → seed-paired mean + 95% CI → rank → top μ survive      │
 └───────────────────────────────────────────────────────────────────────────────┘
 after X generations: best non-opponent plays HELD-OUT seeds; if it passes the
 pre-registered test (§5.1) it becomes the opponent ("start trying to beat that prompt")
```

| Her step | v0 | Where |
|---|---|---|
| generate prompts | seed prompts given at `init`; children by mutation | `generation.mjs::initCampaign`, `mutate.py` |
| translate them to Jev | `compile.py --format json` once per genome, cached. The compiled cascade is the phenotype Jev plays, as at the Jam, where prose is compiled once. | `adapters.mjs::makeCompile` → `tools/arena/compile.mjs::spawnCompile` |
| play games | `npm run match` with both sides' compiled schemas on `schema_server.py` (the new `--a-schemas/--b-schemas/--jev-schema` flags) | `adapters.mjs::makePlayMatch`, `tools/match/cli.mjs` |
| pick the best ones | seed-paired mean score with a bootstrap interval; the top `population.parents` survive; parents compete with their children | `fitness.mjs`, `generation.mjs` |
| make single changes | one change per child, with a seeded **focus** (a threshold, a priority swap, add / delete / sharpen one rule, ability timing). "One change" is **checked**, not trusted: at most 3 added+removed sentences by sentence diff, otherwise retried with the reason. | `mutate.py` |
| (or a genetic algorithm) | not built. Crossover is §10 Q9. | — |
| epoch = X generations, then the opponents become the winner | `epoch.generations` (default 3). At the boundary the best non-opponent must pass §5.1 on held-out seeds. `epoch.opponents: "latest"` (her design, the default) **replaces** the opponents. | `generation.mjs` (epoch block) |

**Genome and phenotype.** A genome is prose, identified by the first 12 hex digits of its sha256.
The phenotype is what the prose compiled to. Translation is sampled, so one genome can compile two
ways; v0 compiles each genome once and evaluates that compile. §4 covers what that costs.

## 3. Fitness

**Per match: the Jam's own advancement order.** `fitness.mjs::jamScore` calls the arena's
`rating.mjs::bracketWinner` (ruling Q7). The order is the sim's result (nexus kill, or its timeout
tiebreak), then fewer deaths, then more tower hp left. That gives 1 / 0 for the prompt. Two tiebreaks
are **excluded** and score ½ instead: "fewer parse/call errors" measures the backend, not the
prompt, and "higher ladder seed" is a coin toss.

**Per candidate: a seed-paired mean.** Every candidate plays every opponent on the same seeds, from
both sides. The unit of evidence is **one seed**: the mean over both sides and all opponents.
`fitnessOf` reports that mean, a seeded percentile-bootstrap 95% interval over the seed units, and
W-D-L. It never treats the two sides of one seed as independent. Ranking is by mean, then Elo, then
id.

**Elo is reported, not selected on (v0).** The arena's Elo (`rating.mjs::eloUpdate`, K 32) is
folded over the generation with the opponents pinned at 1000, the way a new ladder entrant is placed
against the fixed house bar. It is order-dependent over a handful of games, so it doesn't decide
anything yet. Proposal (c) would change that (§6).

**Behaviour descriptors are recorded for every genome but select nothing (v0):**

- `aggression`: share of real decisions that are attack or ability;
- `recallRate`: share that are recall;
- `spread`: mean pairwise distance between the side's living bearbots over the checkpoints (low
  means the band moves together).

Every genome also gets per-instrument **rule-fire counts**: which compiled rule decided how often.
The mutator reads these, so it can see a rule that never fires. That is v0's crude stand-in for
proposal (c).

## 4. Noise: what varies, what was measured, how it is handled

Five things make one match a poor measurement. Four of them were measured in the smoke.

| Source | Measured | Handling |
|---|---|---|
| **Seed** (map and minion RNG) | — | The same seeds for every candidate in an epoch (common random numbers), so candidates are compared on the same draws. Parents' matches are reused inside an epoch (content-addressed). Held-out seeds for promotion (§5.1), so a winner can't be tuned to the epoch's seeds. |
| **Side** | On seed 455922465, **green won all 3 decided quick matches**, whichever prompt played it. The one other match was a full draw. | Both sides of every seed, always. The side bias cancels in the pair. The first campaign should measure side bias over many seeds. |
| **Jev's answers** | **Jev is not deterministic.** Replaying a smoke match (same seed, same compiled schemas) gave identical observations up to tick 172, but only 98 of 190 per-question answers were exactly equal (p90 \|Δ\| 0.14, max 0.69). Actions diverged at 8.6 s. **The result flipped**: a full draw the first time, a tower-hp loss for violet the second. | A match is a sample, not a fact. Replaying one is not a check; it is another sample. The interval is over seeds, and every seed-match is one draw of Jev. More seeds is the only cure. |
| **Translation** | Not measured here. The translator docs record that compiling the same prose twice can differ (`docs/entrant-compile-preview.md`). | v0 evaluates one compile per genome, which matches what the Jam does. Tier **certification** re-compiles (§5.2). |
| **Match shape** | The same pair disagreed across shapes. At quick shape (180 s, cadence 4) `d9489a934697` beat the seed 0.75. At the Jam shape (600 s, cadence 2) the seed beat it **on both sides** (tower hp). | Nothing is counted at quick shape. The smoke used it for plumbing only. Campaigns use the Jam shape (the default). |

**Why the smoke's scores say little.** In all 7 matches between drums-derived prompts, all six
bearbots died inside the first ~66 sim-seconds. Each match was then decided by minions chipping
towers. The prompts' own play hardly entered into it. That describes the seed prompt the smoke used
(`drums.md`, "walk in front, take the hits"), not the harness. The house prose, compiled, survived
the whole match. It is still the reason §10 Q8 recommends better seed prompts.

**Games per comparison.** To promote, the lower bound of the 95% interval on the seed-paired mean
must be above ½. The seed-unit standard deviation σ is not measured yet: the smoke had one seed. For
80% power, the seeds needed are roughly n ≈ ((1.96 + 0.84) σ / (μ − ½))²:

| True mean μ vs the opponent | σ = 0.25 (draw-heavy) | σ = 0.35 | σ = 0.5 (all decisive) |
|---:|---:|---:|---:|
| 0.60 | 49 | 96 | 196 |
| 0.65 | 22 | 43 | 87 |
| 0.75 | 8 | 16 | 32 |

So 16 held-out seeds (32 matches, the default `epoch.promotionSeeds`) reliably catches only a
**large** improvement, about 0.75 at σ 0.35. A 0.6 prompt needs around 100 seeds. The recommended
defaults are 4 epoch seeds (screening) and 16 promotion seeds; the first campaign's measured σ
should revise both (Q5).

## 5. Pre-registration

These are fixed **before** any campaign runs. A result that misses them is reported as a miss; the
thresholds don't move afterwards. The numbers are recommendations until Ceryce rules on Q5 and Q10.

### 5.1 Promotion (a winner replaces the opponent)

At the end of an epoch, the best candidate that isn't already an opponent plays every current
opponent on `epoch.promotionSeeds` **held-out** seeds, both sides, at the Jam shape. It is promoted
only if **the lower bound of the seeded-bootstrap 95% interval of its seed-paired mean is above
0.5, over at least `promotionSeeds` seeds** (`fitness.mjs::promotionDecision`). A tie or a narrow
edge is not a win. A failed test is recorded in `gen-<n>.json` with its reason, and the opponents
stay.

### 5.2 A tier is achieved when all of these hold

Certification runs against a fixed **reference panel**, not against the evolving opponent. That way
"hard" means the same thing next week. The panel is the three starter pilots (`drums.md`,
`keytar.md`, `violin.md`, as the entrant template is built from them), the compiled
`house-violet.md` prose, and a **floor** bot whose prose only says to walk home and wait there. All play at the Jam
shape, 8 paired seeds per panel member, both sides.

1. **Strength band.** Seed-paired mean over the panel, with a 95% interval, where:
   - **hard**: lower bound > 0.60;
   - **medium**: interval inside [0.35, 0.65];
   - **easy**: upper bound < 0.45, **and** it beats the floor bot with lower bound > 0.5 (easy means
     weaker, not broken).
2. **Order.** Hard beats medium and medium beats easy, head to head, each with lower bound > 0.5
   over 16 seeds.
3. **Strategy, not stats** (her requirement). Each tier names its archetype **in advance**, for
   example easy = *turtle* (farms with the wave, recalls early), medium = *lane pusher*, hard =
   *grouped skirmisher*. Every pair of tiers must differ on at least one descriptor by a
   pre-registered margin: |Δ aggression| ≥ 0.15, or |Δ recall rate| ≥ 0.05, or |Δ spread| ≥ 150.
   Each tier's descriptors must also point the way its archetype says (a turtle's recall rate above
   the panel mean, for instance). Two tiers that differ only in win rate fail this, whatever their
   strength. There is a hint the descriptors can tell strategies apart: the compiled house prose
   measured aggression 0.31 with 0 deaths, against ~0.55 and a full wipe for the drums-derived
   prompts. One match each, so it is only a hint.
4. **Translation robustness.** One fresh compile of the tier's prose, re-run on 8 panel seeds, lands
   in the same band.

If no prompt meets a band, the finding is "tier not achieved, and here is how close we got".

## 6. Proposals, not yet ruled on (Margo's)

Each proposal comes with a note on what it would cost and what v0 already does toward it. The
decisions themselves are §10 Q1–Q3.

**(a) Quality-diversity (MAP-Elites) over behaviour descriptors.** Keep the best prompt in each cell
of a grid, for example aggression × spread, so easy/medium/hard come from **different cells** and
differ in strategy by construction, not only in strength. *v0 already:* computes and stores the
descriptors for every genome (§3). *Not built:* the archive, cell selection, and cell-wise
replacement. *Cost:* a 3×3 grid is up to 9 elites, and each needs enough seeds to trust. That is
roughly 9× the matches of a single lineage per generation (§7).

**(b) Hall-of-fame league.** Each generation plays the pool of past champions, not only the latest.
That stops rock-paper-scissors cycling, where A beats B, C beats A, and B beats C. *v0 already:*
`epoch.opponents: "hall-of-fame"` appends champions instead of replacing them (tested; not the
default, since the default is her design). *Not built:* a cap on the pool, or weighting by age.
*Cost:* matches grow linearly with the pool size. The smoke already saw a non-transitive-looking
flip, though that was across match shapes (§4), so it doesn't count as evidence of cycling.

**(c) Rating decides survival; a rubric decides the next mutation.** Fitness is a rating
(Elo / TrueSkill over paired seeds). A per-position LLM-as-judge rubric (her 01:11 suggestion)
grades how each bearbot's position was played, plus an **archetype adherence** row, and serves as
the **diagnostic that picks the single change**. *Goodhart warning:* if the rubric were the fitness,
the loop would optimise for what the judge likes to read, not for winning. That is why this keeps
it as the diagnostic. *Rubric/win-rate disagreement is itself a finding:* a prompt the judge scores
high that keeps losing (or the reverse) is logged, not averaged away. *v0 already:* fitness is the
match score (the mean decides; Elo is reported), and the mutator gets a diagnostic of rule-fire
counts, decision mix, deaths and towers per parent. *Not built:* the judge, its rubric, TrueSkill.

## 7. Compute budget

**Measured on the Jam backend** (Workers AI Jev via `schema_server.py`, 2026-09-30, 1,331 calls, 0
errors):

| Quantity | Value |
|---|---|
| Jev call latency | mean 0.37 s, max ~1.1 s |
| Wall time per lockstep round (3–4 parallel calls) | 0.48–0.56 s |
| Jev input tokens per call | ~900 |
| Jev cost | $0.050 for 1,331 calls = **$0.038 per 1,000 calls** |
| Jam-shape match, all six dead by ~66 s | **15–18 s** wall, 95–131 calls, ~$0.005 |
| Jam-shape match, one side survives all 600 s (compiled house prose) | **157 s** wall, 904 calls, $0.034 |
| Jam-shape match, both sides survive | *estimate*: ~300 rounds × ~0.6 s ≈ **3 min**, ~1,800 calls, ~$0.07 |
| Compile, OpenRouter `qwen/qwen3.5-9b` | $0.001–0.002 and 8–34 s per genome (3–5 calls) |
| Mutation, Haiku 4.5 via the `claude` CLI | 35–43 s per child; 2 of 2 valid on the first attempt; subscription, not billed per token |

Evolved prompts that are worth anything will survive, so plan on the **one-survives to
both-survive** rows.

**One epoch at the recommended first-campaign size**: μ = 2 parents, 3 children each, 4 epoch seeds,
1 opponent, X = 3 generations, 16 promotion seeds.

| | Matches | Wall, sequential | Jev $ |
|---|---:|---:|---:|
| 3 generations × 6 new children × 4 seeds × 2 sides, plus the epoch's parents once (2 × 4 × 2) | 160 | 7–8 h | $5.4–11 |
| Promotion: 1 × 16 held-out seeds × 2 sides | 32 | ~1.5 h | $1.1–2.2 |
| **Epoch total** | **~190** | **~8.5–9.5 h** | **~$6.5–13.5** |
| Compile (18 genomes) and mutation (18 children) | — | ~20 min | ~$0.04 + subscription |

Scaling: hall-of-fame (b) multiplies matches by the pool size (×3 at a cap of 3). MAP-Elites (a) by
up to the number of cells. Certifying three tiers (§5.2) is 3 × 5 panel members × 8 seeds × 2 sides
plus 3 head-to-heads × 16 seeds × 2 sides, about 340 matches: ~15–17 h and ~$12–24.

**Concurrency is unmeasured.** One match drove ~345 Jev calls a minute with no throttling. Running
matches in parallel would cut wall time about linearly, *if* Workers AI keeps latency and doesn't
throttle. Measure that before relying on it.

**Must not slow the Jam.** By default the harness uses **no local GPU**: compile on OpenRouter,
mutation on the `claude` CLI, Jev on Workers AI. So it doesn't compete with local `qwen3.5:9b`
matches. It **does** share the Cloudflare account's Jev with the Jam: the practice panel, and the
Jev house bot if it goes live. Don't run a campaign from Thu 2026-10-01 17:00 CT (entrant cutoff)
through the end of the Jam. Run it on its own `schema_server.py` port, never on the arena's 8797.

## 8. v0 as built

```
npm run evolve -- init   --name <c> --seed-prompt <prose.md> [--seed-prompt …] [--config overrides.json]
npm run evolve -- step   --name <c> [--generations N]      # run or resume the next generation(s)
npm run evolve -- status --name <c>
npm run evolve -- report --name <c> --out runs/<c>.md
```

`step` needs `python tools/jev/schema_server.py --port <p>` running, with
`jevSchemaEndpoint` in the config pointing at it. The default backends need `$OPENROUTER_API_KEY`
for the compile and the `claude` CLI for mutation. Both are campaign config (`compile.backend`:
ollama/openrouter; `mutation.backend`: claude/ollama/openrouter, through
`tools/jev/llm_backends.py`).

| File | What |
|---|---|
| `tools/evolve/evolve.mjs` | CLI |
| `tools/evolve/generation.mjs` | `initCampaign`, `runGeneration`: plan → mutate → compile → play → rate → select → epoch; defaults in `DEFAULT_CAMPAIGN` |
| `tools/evolve/fitness.mjs` | `jamScore`, `summarizeSide` (descriptors, rule-fire counts), `fitnessOf`, `bootstrapCI`, `promotionDecision`, `eloFold` |
| `tools/evolve/store.mjs` | the population store (layout in its docstring) |
| `tools/evolve/seeds.mjs` | `deriveSeed`, `mulberry32`, `pick` |
| `tools/evolve/adapters.mjs` | the real dependencies: compile, match and mutation, each existing tooling called as its own users call it |
| `tools/evolve/mutate.py` | the single-change operator and its sentence-diff check |
| `tools/evolve/report.mjs` | Markdown report from the store alone |
| `tools/match/cli.mjs` | **extended**: `--a-schemas`/`--b-schemas`/`--jev-schema` play a side's compiled schemas on `schema_server.py` (the Jam's shape) through `jevSchemaPilot.ts`. The log keeps the prose as the side's prompt and adds `sides.<team>.schemas`. |

**Reused, not duplicated:** `rating.mjs` (Elo, `bracketWinner`), `queue.mjs::finalFromLog`,
`compile.mjs::spawnCompile`, `prompts.mjs::validatePromptText`, `npm run match` and its `--verify`,
`jevSchemaPilot.ts`, `schema_server.py`, `llm_backends.py`.

**Store.** Defaults to `runs/evolve/<name>/`, which is git-ignored (`/runs/*/`), like every per-run
directory. Everything is plain JSON and Markdown, and every write is atomic (temp file + rename).
Genomes, compiles and matches are content-addressed, so "is it done?" means "does the file exist?".

**Resumable.** Each step persists before the next starts. A mutation outcome is saved per slot before
it is used, so a resume never asks the model twice. Killing `step` anywhere and re-running redoes
nothing that finished. This is tested with a crash mid-play, and live: the finished smoke generation
re-ran with every backend unreachable and reproduced its ranking exactly.

**Deterministic.** Match seeds, mutation foci and bootstrap resamples are pure functions of the
campaign seed and a label (`seeds.mjs`). Two stores with the same config and the same (fake)
dependencies plan and rank identically (tested). Jev and the LLMs are not deterministic (§4). The
harness pins everything around them, and it saves their outputs so they are never re-drawn.

**Tests** (no model, no network beyond a loopback fake): `npm run test:evolve` (19: seeds, store,
scoring, CI, promotion, Elo, pairings, a full generation on fakes, crash-resume, determinism,
invalid mutations, compile failures, both epoch modes, and `npm run match`'s schema mode against an
in-process fake schema server, replay-verified), and `tools/evolve/test_mutate.py` (7, on
`llm_backends.ScriptedBackend`). Both run in CI.

**Not built in v0:** crossover/GA (Q9), racing (adaptive seeds per candidate), parallel matches, the
rubric judge (c), MAP-Elites (a), the tier-certification runner (§5.2), a pool cap for (b), and a
per-campaign spend cap (each backend has its own cap: `schema_server.py --budget-usd`,
`compile.maxTokensPerCompile`, `mutation.maxTotalTokens`).

## 9. Smoke run (2026-09-30)

One generation, on purpose tiny: seed `drums.md`, 1 parent × 2 children, 1 paired seed, quick shape
(180 s, cadence 4), live Jev, compile on OpenRouter, mutation on Haiku. It ran end to end in about 3
minutes. The rest is in `runs/prompt-evolution-smoke-2026-09-30.md` (summary and measurements),
`-report.md` (generated), `-genomes.json` (prose, lineage, compiled schemas), and flat match logs.
All 8 live logs pass `npm run match -- --verify`. Plumbing: proven. Strategy: nothing to read, as
§4 explains.

## 10. Open decisions for Ceryce

The recommendation is listed first. Where the harness has a config switch, the default is her
original design until she rules.

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Adopt quality-diversity, proposal (a)? | full MAP-Elites / **archetype lineages**: three lineages, each seeded with prose written for one archetype, plus the §5.2 descriptor gate / strength-only | **Archetype lineages first.** They get strategy-different tiers for about ⅓ of MAP-Elites' matches, and the descriptors v0 records will show whether a grid is worth it. |
| Q2 | Opponents at the epoch boundary: latest only (hers) or a hall of fame, proposal (b)? | latest / hall-of-fame (uncapped) / **hall-of-fame capped at the last 3** | **Capped at 3.** Cycling guard at ≤3× the matches. The switch is built; the cap is ~5 lines. |
| Q3 | Rubric: as fitness, as the mutation's diagnostic (proposal c), or not at all? | **diagnostic only** / fitness / none | **Diagnostic only**, with an archetype-adherence row and every rubric/win disagreement logged. As fitness, it invites Goodhart. |
| Q4 | Match shape that counts | **Jam shape (600 s, cadence 2)** / quick (180 s, cadence 4) | **Jam shape.** Quick and Jam shape ranked the same pair oppositely in the smoke. |
| Q5 | Seeds per comparison | epoch **4** / 8; promotion 8 / **16** / 32 | **4 screening, 16 promotion**, then revise from the first campaign's measured σ (§4 table). |
| Q6 | When and how much | spend cap; hours | **$15 cap for the first epoch**. Sequential matches until concurrency is measured. **Not Thu 17:00 CT through the Jam.** Its own schema-server port. |
| Q7 | Epoch length X (her parameter) | 2 / **3** / 5 generations | **3**, about 9 h an epoch at the recommended size (§7). |
| Q8 | Seed prompts | `drums.md` (the smoke's; suicidal) / **house prose + the three starters + the Friday tier prompts** | **The Friday tier prompts plus house and starters**, so evolution starts where the quick tiers ended. |
| Q9 | Crossover (the "genetic algorithm" option) | **single change only for now** / rule-level crossover | **Single change first.** Each generation's effect stays attributable, which is the practice goal. Add crossover once single changes plateau. |
| Q10 | Tier bands and margins (§5.2) | as written / adjusted | Rule on them **before** the first campaign. They are the pre-registration. |

## 11. Found along the way

- **`schema_server.py` read its Workers AI token once** and answered every decision `401` after
  the hour-long OAuth token lapsed. With a lapsed token, every decision in a practice match, and in
  any Jev match in the Jam's shape, would hold. Fixed separately in **PR #36**, merged 2026-09-30:
  it now uses the self-renewing provider the house and team servers already use.
- **Per-instrument clauses leak across instruments in the translator.** Compiling `house-violet.md`
  ("keytar only: …, violin only: …, drums only: …") put a `keytar_ready → chord` rule into the
  **drums** schema, and it fired 2 times in ~900 decisions. Worth knowing for the Friday tiers,
  which will compile house-style prose.
