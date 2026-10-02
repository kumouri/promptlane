# Prompt evolution for the house bots: spec and v0

> **Rulings, 2026-09-30 01:50–02:08 CT (Ceryce, over Telegram).** Recorded in this revision:
>
> - **§10 Q1, Q2, Q3, Q5, Q6 ruled as recommended** ("rec on all", 01:50): archetype lineages;
>   hall of fame capped at the last 3; rubric as diagnostic only; 4 screening and 16 promotion
>   seeds; a $15 cap on the first epoch and no campaign from Thu 17:00 CT through the end of the Jam.
>   **Q4, Q7, Q8 and Q9 are still open**; she hadn't seen them yet. (Ruled later that day; below.)
> - **§5.2, the tier pre-registration (Q10), ruled** (01:54–01:57). The Friday medium house tier joins
>   the reference panel. The medium band is now a point-estimate rule. **Head-to-head order is no
>   longer a certification criterion.** Non-transitivity is a finding, so the full head-to-head
>   matrix is reported. Strategy margins are now one reference-panel standard deviation, not fixed
>   numbers.
> - **§3 descriptors redefined, her design** (02:07, confirmed 02:08). *Aggression* and *caution*
>   (which replaces *recall rate*) now count moves toward or away from enemy bearbots in the bot's
>   own vision, weighted by hp.
> - **Code changed to match:** `fitness.mjs` (the new descriptors); `adapters.mjs::makeObserve`
>   (replays each match to recover what the pilots saw); `headless.ts::verifyReplay` (an
>   observation hook); `generation.mjs` (default opponents are now a hall of fame capped at 3).
>
> **Later rulings, 2026-09-30, recorded with the spend enforcement.** Q4 (Jam shape), Q7 (3
> generations an epoch), Q8 (seed prompts: the Friday tiers, house and the three starters) and Q9
> (single change, no crossover) were ruled as recommended. **Budget, 03:07 CT:** *"if epoch 1
> doesn't take $15, you can go on to epoch 2 ... but don't use more than $25 total."* **The blackout
> moved with the Jam:** no campaign activity from Fri 2026-10-16 00:00 CDT (midnight going into the Jam) through the end of the Jam
> (Fri 2026-10-16). Both are now enforced in code (`budget.mjs`, §7).
>
> **Campaign 1 rulings, 2026-09-30 07:34–07:35 CT (Telegram pickers).** (1) **"Epoch 2 = what's
> left of $25"**: epoch 1 is capped at $15, and epoch 2's cap is $25 minus what epoch 1 actually
> spent, not another flat $15. There are still at most 2 epochs, and $25 is still the hard total
> (§7, enforced in `budget.mjs`). (2) **"Hard lineage only, first"**: the first campaign evolves only
> the hard archetype lineage. Easy and medium lineages are later campaigns (§6). (3) **"Medium
> (the placement bar)"**: the first opponent is the medium house tier. The invocation for
> campaign 1 is in §10.
>
> **Campaign 2 rulings, 2026-09-30 21:34–21:35 CT.** *"You should probably end the evo campaign
> making new house bots at the next Epoch or something and start from there on the new branch."*
> Budget picker: **"Bigger: $40 total"**. The accepted plan: seed from campaign 1's champion, play
> the new rules (pvp-1, eco-2, simultaneous-1), cap the first epoch at $20, give epoch 2 what's left
> of the $40 under campaign 1's rule, and keep the same blackout. The invocation is in §10.

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
added three suggestions. They appear in §6 as proposals. Ceryce ruled on all three on 2026-09-30
(§10 Q1–Q3).*

**Status.** v0 is built (`tools/evolve/`, §8). One smoke generation ran on the Jam's real backend
(§9). Campaign 1 ran on the original rules and stopped at its $25 total cap. Campaign 2 starts
from its champion on the new rules (§10). Numbers marked *measured* come from
`runs/prompt-evolution-smoke-2026-09-30*.{md,json}`. Anything else is labelled as an estimate.

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
 epoch e: opponents O_e                      (epoch 0: the --opponent-prompt(s), else the first seed prompt)
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
| epoch = X generations, then the opponents become the winner | `epoch.generations` (default 3). At the boundary the best non-opponent must pass §5.1 on held-out seeds. The default, `epoch.opponents: "hall-of-fame"` with `epoch.hallOfFameCap: 3` (Q2, ruled), **adds** the winner to the opponents and drops the oldest past three. `"latest"`, her original design, **replaces** them. | `generation.mjs` (epoch block) |

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

**Behaviour descriptors are recorded for every genome but select nothing during evolution.** They
are what §5.2's strategy test reads. *Aggression* and *caution* are **Ceryce's design** (ruled
2026-09-30 02:07, confirmed 02:08: "Perfect, love it"). Her words:

> *"Aggression should include moving toward observed enemy bears, and "recall rate" should include
> share of decisions that included moving away from a bear in vision. … I'll take just share of
> time moving toward and away, weighted by health; so moving toward someone with anything above 50%
> HP is weight 1, then as your HP lowers weight increases at least geometrically. Similarly, moving
> away when your HP is above 50% is weight 1, scaling up at least geometrically up to 100% HP."*
>
> *02:08, correcting the second rule: "And right, I meant anything under 50% for the moving away."*

Per side, per match, over the side's real (non-cached) decisions, with `hp%` the deciding bot's own
hp at that decision:

- `aggression` = Σ w↑ over the decisions that are **attack** or **ability**, or a **move toward**
  an enemy bearbot in vision, divided by the number of real decisions.
  w↑ = 2^(max(0, 50 − hp%)/10). That is 1 at or above half hp, 2 at 40%, 4 at 30%, 32 at 0.
- `caution` (replaces v0's `recallRate`) = Σ w↓ over the decisions that are **recall**, or a
  **move away** from an enemy bearbot in vision, divided by the number of real decisions.
  w↓ = 2^(max(0, hp% − 50)/10). That is 1 at or below half hp, 2 at 60%, 32 at 100%.
- `spread` (unchanged): mean pairwise distance between the side's living bearbots over the
  checkpoints. Low means the band moves together.

Definitions, as built (`fitness.mjs::summarizeSide`, `moveBearing`, `towardWeight`, `awayWeight`):

- **In vision** means the bot's **own** observation, fog included: what its pilot was shown when it
  chose, which is `visibleEnemies` with `kind: "bearbot"`.
- **Toward / away** is the sign of the move's direction against the direction to the **nearest**
  enemy bearbot in vision. A move square to that bear, a move to where the bot already stands, or
  any move with no enemy bearbot in vision counts as neither.
- The score is a **weighted sum over decisions, not a 0–1 share**. §5.2's margins are in units of
  the reference panel's own standard deviation, so the scale doesn't matter.
- **Where hp and vision come from.** The match log stores actions, not observations. So
  `adapters.mjs::makeObserve` replays each finished match through the unchanged sim
  (`headless.ts::verifyReplay`, the replay behind `npm run match -- --verify`) and collects the
  observation behind every decision. A replay that diverges from the log's own checkpoints returns
  nothing, and the descriptors stay `null`. It never estimates them.
- Any number measured before this revision used v0's unweighted shares, `(attack + ability) /
  decisions` and `recall / decisions`. It can't be compared with these numbers.

**v2, described by Ceryce and not built.** She would ideally weight each decision by the evaluated
bear's type and the type of the bear it moves toward or away from, by the two bears' relative
power, by the relative power of each team's units within the evaluated bear's view, and by each
team's overall power. The hp-only weights above are the version she accepted for now.

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
**large** improvement, about 0.75 at σ 0.35. A 0.6 prompt needs around 100 seeds. The defaults are
4 epoch seeds (screening) and 16 promotion seeds (Q5, ruled 2026-09-30). The first campaign's
measured σ should revise both.

## 5. Pre-registration

These are fixed **before** any campaign runs. A result that misses them is reported as a miss; the
thresholds don't move afterwards. Ceryce ruled on both parts, Q5 and Q10, on 2026-09-30 between
01:50 and 01:57 CT.

### 5.1 Promotion (a winner replaces the opponent)

At the end of an epoch, the best candidate that isn't already an opponent plays every current
opponent on `epoch.promotionSeeds` **held-out** seeds, both sides, at the Jam shape. It is promoted
only if **the lower bound of the seeded-bootstrap 95% interval of its seed-paired mean is above
0.5, over at least `promotionSeeds` seeds** (`fitness.mjs::promotionDecision`). A tie or a narrow
edge is not a win. A failed test is recorded in `gen-<n>.json` with its reason, and the opponents
stay.

### 5.2 A tier is achieved when all of these hold

*Ruled 2026-09-30 01:54–01:57 CT (Q10). Changes from the first draft: the panel gains the Friday
medium tier, the medium band is a point-estimate rule, head-to-head order is no longer a criterion
but a reported finding, and the strategy margins are a standard-deviation rule.*

Certification runs against a fixed **reference panel**, not against the evolving opponent. That way
"hard" means the same thing next week. The panel is:

- the three starter pilots (`drums.md`, `keytar.md`, `violin.md`, as the entrant template is built
  from them);
- the compiled `house-violet.md` prose;
- a **floor** bot whose prose only says to walk home and wait there;
- **the Friday medium house tier**, once it exists (ruled 01:55). It comes from the separate
  house-tiers job (branch `feat/house-tiers`), which may not be merged yet. It joins the panel
  **when merged**. Any certification run before then says it ran without it.

All play at the Jam shape, 8 paired seeds per panel member, both sides.

1. **Strength band.** Seed-paired mean over the panel, with a 95% interval [lo, hi], where:
   - **hard**: lo > 0.60;
   - **medium** (ruled 01:55): the **point estimate** is in [0.35, 0.65], **and** the interval is
     clear of both thresholds on either side of it: lo ≤ 0.60 (so it doesn't already qualify as
     hard) and hi ≥ 0.45 (so it doesn't already qualify as easy). The whole interval does **not**
     have to fit inside [0.35, 0.65]; she chose this over the first draft's whole-interval rule.
   - **easy**: hi < 0.45, **and** it beats the floor bot with lo > 0.5 (easy means weaker, not
     broken).

   The three bands don't overlap, so a prompt lands in at most one.
2. **Head-to-head: reported, not required** (ruled 01:54). The first draft required hard to beat
   medium and medium to beat easy, head to head. **That is no longer a certification criterion.**
   Ceryce:

   > *"On 3, it's a finding. It's why ranking top players and teams in esports (and sports) is
   > hard. Because each has a different strategy and play style and they may be good against the
   > "best" and bad against the "rest" so they do poorly except when they're fighting the best."*

   So certification reports the **full head-to-head matrix** between the tiers: each pair's
   seed-paired mean and 95% interval over 16 seeds, both sides. A cycle (A beats B, B beats C, C
   beats A) is recorded as a **finding**, not a failure. If a cycle appears and the tiers need a
   single ranking, use the methods in Balduzzi, Tuyls, Pérolat and Graepel, *"Re-evaluating
   Evaluation"*, NeurIPS 2018 ([arXiv:1806.02643](https://arxiv.org/abs/1806.02643)):
   **Nash averaging** (§4.1), which rates each player against the maximum-entropy Nash mixture of
   the field, and **multidimensional Elo (mElo)** (§3.1), which adds a cyclic component that plain
   Elo can't represent. The paper's case is exactly this one: Elo has no predictive power in
   rock-paper-scissors-like games.
3. **Strategy, not stats** (her requirement). Each tier names its archetype **in advance**, for
   example easy = *turtle* (farms with the wave, recalls early), medium = *lane pusher*, hard =
   *grouped skirmisher*.
   - **Margins, ruled 01:57, a rule and not fixed numbers.** "I prefer the standard deviation rule."
     Before any campaign, measure each descriptor (aggression, caution, spread; §3) on every panel
     member over its panel matches. The margin for that descriptor is the **sample standard
     deviation across the panel members**. Freeze it as part of the pre-registration. Every pair
     of tiers must differ on at least one descriptor by **at least one panel standard deviation**.
     The first draft's fixed numbers (0.15 / 0.05 / 150) are withdrawn. They were on v0's
     unweighted scale anyway.
   - Each tier's descriptors must also point the way its archetype says. For instance, a turtle's
     caution is above the panel mean.
   - Two tiers that differ only in win rate fail this, whatever their strength.

   There is a hint the descriptors can tell strategies apart: under v0's unweighted definition,
   the compiled house prose measured aggression 0.31 with 0 deaths, against ~0.55 and a full wipe
   for the drums-derived prompts. That was one match each, on the old scale, so it is only a hint.
4. **Translation robustness.** One fresh compile of the tier's prose, re-run on 8 panel seeds, lands
   in the same band.

If no prompt meets a band, the finding is "tier not achieved, and here is how close we got".

## 6. Proposals (Margo's), ruled 2026-09-30

Each proposal comes with a note on what it would cost and what v0 already does toward it. Ceryce
ruled on all three at 01:50 CT, each as recommended (§10 Q1–Q3):

- **(a)** Not full MAP-Elites yet. **Archetype lineages** instead: three lineages, each seeded
  with prose written for one archetype, plus the §5.2 descriptor gate. *There is no multi-lineage
  support in one campaign.* Each lineage runs as its own campaign instead: its archetype's prose goes
  in as `--seed-prompt`, and its opponents go in as `--opponent-prompt`. Opponents are played but
  never evolved, so the seeds are the lineage's only parents.
  **Order, ruled 2026-09-30 07:34–07:35 CT:** the **hard lineage first, alone** ("Hard lineage
  only, first"), against the **medium house tier** ("Medium (the placement bar)"). The easy and
  medium lineages are later campaigns. Campaign 1's invocation is in §10.
- **(b)** A **hall of fame capped at the last 3 champions**. *Built*: it is now the default.
- **(c)** The rubric is **diagnostic only**. *The judge is not built.*

**(a) Quality-diversity (MAP-Elites) over behaviour descriptors.** Keep the best prompt in each cell
of a grid, for example aggression × spread, so easy/medium/hard come from **different cells** and
differ in strategy by construction, not only in strength. *v0 already:* computes and stores the
descriptors for every genome (§3). *Not built:* the archive, cell selection, and cell-wise
replacement. *Cost:* a 3×3 grid is up to 9 elites, and each needs enough seeds to trust. That is
roughly 9× the matches of a single lineage per generation (§7).

**(b) Hall-of-fame league.** Each generation plays the pool of past champions, not only the latest.
That stops rock-paper-scissors cycling, where A beats B, C beats A, and B beats C. *Built:*
`epoch.opponents: "hall-of-fame"` appends champions instead of replacing them. Since the Q2 ruling
it is the default, with `epoch.hallOfFameCap: 3`, which keeps the three most recent champions as
the opponents. `state.json`'s `champions` still records every champion. Both behaviours are tested.
*Not built:* weighting by age.
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

Scaling: the hall of fame (b), now the default, multiplies matches by the pool size. The first
epoch has one opponent (in campaign 1, the medium house tier). The pool grows by one per promotion, to ×3 at the cap of 3.
Archetype lineages (Q1) multiply the whole budget by 3 if all three run. Full MAP-Elites (a) would
multiply it by up to the number of cells. Certifying three tiers (§5.2) is 3 tiers × 6 panel
members × 8 seeds × 2 sides, once the Friday medium joins, plus the 3 head-to-heads × 16 seeds × 2
sides for the matrix. That is about 385 matches: ~17–19 h and ~$13–27.

**Spend and timing, ruled (Q6, 2026-09-30 01:50 CT; budget 03:07 CT; epoch 2 at 07:34 CT).** The
first epoch has a **$15 cap**. A second epoch may run only if the first spent less than $15.
**Epoch 2's cap is whatever is left of the $25 after epoch 1** ("Epoch 2 = what's left of $25"):
if epoch 1 spends $9, epoch 2 may spend up to $16. The whole campaign spends at most **$25**.
**No campaign activity from Fri 2026-10-16 00:00 CDT (midnight going into the Jam) through the end of the Jam (Fri 2026-10-16).** Moved from Thu 10-15 17:00 CT by Ceryce, 2026-10-01 18:44 CT: *"Training cutoff is 20261016T00:00.00-5"*.

**Enforced in code, `tools/evolve/budget.mjs`.** `step` wraps every paid dependency
(`guardDeps`). Before each paid call, it checks the call's **reserve** against the caps. The reserve
is the most one call of that kind is expected to cost. After the call, it writes the call's real
cost to the store's `spend.json`:

| Paid call | Cost charged | Reserve |
|---|---|---|
| mutation | the mutator's `usage.cost_usd`. For the `claude` backend that is what the metered API would have billed, not real dollars. It is counted anyway, so the cap errs low. | $0.10 |
| compile | compile.py's `usage.cost_usd` (OpenRouter's own figure when it sends one) | $0.02 |
| match | the campaign's own `schema_server.py` `/health` `cost_usd`, read before and after. Exact only because matches run **one at a time on a server nothing else uses**. | $0.15 |

- A call is refused when its reserve would push the campaign past `budget.totalCapUsd` ($25), or
  the current epoch past its cap (`budget.mjs::epochCapUsd`). The first epoch's cap is
  `budget.firstEpochCapUsd` ($15). Each later epoch's cap is `totalCapUsd` minus what the epochs
  before it spent, so after the first epoch the epoch cap and the total are the same limit.
- No epoch starts after an epoch that spent its cap. If epoch 1 takes its whole $15, there is no
  epoch 2.
- No more than `budget.maxEpochs` (2) epochs run. Nothing past epoch 2 was ruled.
- Nothing paid starts inside a `budget.blackouts` window, or close enough to one that it could still
  be running when the window opens. The margin is the match wall cap, 22.5 min at the Jam shape.
- A cost that can't be read is charged the reserve. That covers a missing `usage`, a crash, and a
  schema server that restarted mid-match. So is a call the process died inside: it is written as
  pending before it starts.
- If the Jev spend can't be read at all, no match starts.
- A refusal is a clean stop, not a failure. Nothing is recorded as a failed mutation or compile.
  `step` exits **3**, while other errors exit 2. Re-running `step` after the window, or with a raised
  cap, resumes exactly where it stopped.
- `status` prints the ledger's totals by epoch and by kind, and the current epoch's cap.
- `schema_server.py --budget-usd` is still worth setting to the remaining total. It is a
  per-process backstop, and a restart resets it.

**Concurrency is unmeasured.** One match drove ~345 Jev calls a minute with no throttling. Running
matches in parallel would cut wall time about linearly, *if* Workers AI keeps latency and doesn't
throttle. Measure that before relying on it.

**Must not slow the Jam.** By default the harness uses **no local GPU**: compile on OpenRouter,
mutation on the `claude` CLI, Jev on Workers AI. So it doesn't compete with local `qwen3.5:9b`
matches. It **does** share the Cloudflare account's Jev with the Jam: the practice panel, and the
Jev house bot if it goes live. Don't run a campaign from Fri 2026-10-16 00:00 CDT (midnight going into the Jam) (the entrant cutoff)
through the end of the Jam; `budget.mjs` refuses to. Run it on its own `schema_server.py` port,
never on the arena's 8797. The campaign default is `http://127.0.0.1:8813/`.

## 8. v0 as built

```
npm run evolve -- init   --name <c> --seed-prompt <prose.md> [--seed-prompt …]
                         [--opponent-prompt <prose.md> …] [--config overrides.json]
npm run evolve -- step   --name <c> [--generations N]      # run or resume the next generation(s)
npm run evolve -- status --name <c>
npm run evolve -- report --name <c> --out runs/<c>.md
```

With `--opponent-prompt`, those prompts are the first opponents and are never evolved. The seeds
are then the only parents: one lineage, one campaign (§6). Without it, the first seed prompt is
both the first opponent and a parent.

`step` needs `python tools/jev/schema_server.py --port <p>` running, with
`jevSchemaEndpoint` in the config pointing at it (default port 8813, the campaign's own). `step`
exits 3 when the spend caps or the blackout stop it (§7), and 2 on any other error. The default backends need `$OPENROUTER_API_KEY`
for the compile and the `claude` CLI for mutation. Both are campaign config (`compile.backend`:
ollama/openrouter; `mutation.backend`: claude/ollama/openrouter, through
`tools/jev/llm_backends.py`).

| File | What |
|---|---|
| `tools/evolve/evolve.mjs` | CLI |
| `tools/evolve/generation.mjs` | `initCampaign`, `runGeneration`: plan → mutate → compile → play → rate → select → epoch; defaults in `DEFAULT_CAMPAIGN`. The match `shape` names its ruleset (`map`, `economy`, `objective`); every match plays it explicitly and `matchKey` hashes it with the sim version, so a cached match is never reused under other rules. A campaign created before that has no ruleset in its shape: it keeps its old keys and plays the runner's defaults |
| `tools/evolve/fitness.mjs` | `jamScore`, `summarizeSide` (descriptors, rule-fire counts), `towardWeight`/`awayWeight`/`moveBearing` (§3), `fitnessOf`, `bootstrapCI`, `promotionDecision`, `eloFold` |
| `tools/evolve/store.mjs` | the population store (layout in its docstring) |
| `tools/evolve/seeds.mjs` | `deriveSeed`, `mulberry32`, `pick` |
| `tools/evolve/budget.mjs` | the spend caps and the blackout (§7): `guardDeps` checks every paid call and charges it to `spend.json`; `assertMayContinue`, `epochCapUsd`, `spendTotals`, `CampaignStop` |
| `tools/evolve/adapters.mjs` | the real dependencies: compile, match, observe (the replay behind the §3 descriptors) and mutation, each existing tooling called as its own users call it |
| `tools/evolve/mutate.py` | the single-change operator and its sentence-diff check |
| `tools/evolve/report.mjs` | Markdown report from the store alone |
| `tools/match/cli.mjs` | **extended**: `--a-schemas`/`--b-schemas`/`--jev-schema` play a side's compiled schemas on `schema_server.py` (the Jam's shape) through `jevSchemaPilot.ts`. The log keeps the prose as the side's prompt and adds `sides.<team>.schemas`. |
| `tools/match/headless.ts` | **extended**: `verifyReplay` takes an optional `onObservation(decision, obs)`, called with a copy of what each pilot saw at each logged decision |

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

**Tests** (no model, no network beyond a loopback fake): `npm run test:evolve` (35: seeds, store,
scoring, the §3 weights, bearings and weighted descriptors, CI, promotion, Elo, pairings, a full
generation on fakes, opponent prompts that are played but never evolved, campaign 1's `init` on
the real hard and medium prompts, crash-resume, determinism, invalid mutations, compile failures,
both epoch modes, the ruled defaults, the hall-of-fame cap, observations reaching the ranking,
`npm run match`'s schema mode against an in-process fake schema server, replay-verified, and the
observe adapter's replay on a real match log, including a diverged replay giving no descriptors,
and the spend caps and blackout: every paid call charged by epoch and kind, a cap stopping before
the call that would pass it and resuming once raised, epoch 2's cap as what's left of the $25, the
total cap, the epoch-1 gate and the epoch limit, the blackout and its margin, and unreadable,
restarted or interrupted costs charged the reserve), and `tools/evolve/test_mutate.py` (7, on
`llm_backends.ScriptedBackend`). Both run in CI.

**Not built:** crossover/GA (Q9), racing (adaptive seeds per candidate), parallel matches, the
rubric judge (c), several archetype lineages in one campaign (Q1; each lineage runs as its own
campaign, §6) and MAP-Elites (a), the tier-certification runner and
its head-to-head matrix (§5.2), and the v2 power-weighted descriptors (§3). Concurrent matches
would also break the Jev ledger's before/after reading (§7).

## 9. Smoke run (2026-09-30)

One generation, on purpose tiny: seed `drums.md`, 1 parent × 2 children, 1 paired seed, quick shape
(180 s, cadence 4), live Jev, compile on OpenRouter, mutation on Haiku. It ran end to end in about 3
minutes. The rest is in `runs/prompt-evolution-smoke-2026-09-30.md` (summary and measurements),
`-report.md` (generated), `-genomes.json` (prose, lineage, compiled schemas), and flat match logs.
All 8 live logs pass `npm run match -- --verify`. Plumbing: proven. Strategy: nothing to read, as
§4 explains.

## 10. Decisions for Ceryce

The recommendation is listed first. Ceryce ruled over Telegram on 2026-09-30 between 01:50 and
02:08 CT. At 01:50 she ruled Q1, Q2, Q3, Q5 and Q6 with "rec on all", so each one is the
recommendation. Q10 was ruled piece by piece from 01:54 to 01:57. Q4, Q7, Q8 and Q9 were ruled
later on 2026-09-30, each as recommended, with the budget at 03:07 CT. Epoch 2's cap, campaign 1's
lineage and campaign 1's first opponent were ruled with Telegram pickers at 07:34–07:35 CT (Q6, Q1,
Q8; campaign 1 is below the table).

| # | Question | Options | Recommendation | Status |
|---|---|---|---|---|
| Q1 | Adopt quality-diversity, proposal (a)? | full MAP-Elites / **archetype lineages**: three lineages, each seeded with prose written for one archetype, plus the §5.2 descriptor gate / strength-only | **Archetype lineages first.** They get strategy-different tiers for about ⅓ of MAP-Elites' matches, and the descriptors will show whether a grid is worth it. | **RULED 2026-09-30 01:50 CT: archetype lineages.** Each lineage runs as its own campaign (§6). **07:34–07:35: the hard lineage first, alone** ("Hard lineage only, first"). Easy and medium are later campaigns. |
| Q2 | Opponents at the epoch boundary: latest only (hers) or a hall of fame, proposal (b)? | latest / hall-of-fame (uncapped) / **hall-of-fame capped at the last 3** | **Capped at 3.** Cycling guard at ≤3× the matches. The switch is built; the cap is ~5 lines. | **RULED 01:50: hall of fame capped at 3.** Built; now the default (`epoch.opponents: "hall-of-fame"`, `epoch.hallOfFameCap: 3`). |
| Q3 | Rubric: as fitness, as the mutation's diagnostic (proposal c), or not at all? | **diagnostic only** / fitness / none | **Diagnostic only**, with an archetype-adherence row and every rubric/win disagreement logged. As fitness, it invites Goodhart. | **RULED 01:50: diagnostic only.** The judge is not built. |
| Q4 | Match shape that counts | **Jam shape (600 s, cadence 2)** / quick (180 s, cadence 4) | **Jam shape.** Quick and Jam shape ranked the same pair oppositely in the smoke. | **RULED 2026-09-30: Jam shape.** The default. |
| Q5 | Seeds per comparison | epoch **4** / 8; promotion 8 / **16** / 32 | **4 screening, 16 promotion**, then revise from the first campaign's measured σ (§4 table). | **RULED 01:50: 4 screening, 16 promotion.** These are the defaults. |
| Q6 | When and how much | spend cap; hours | **$15 cap for the first epoch**. Sequential matches until concurrency is measured. **Not from midnight going into the Jam through its end.** Its own schema-server port. | **RULED 01:50: $15 cap for epoch 1**, and at 03:07 epoch 2 only if epoch 1 spent under $15, **$25 total**. **07:34: epoch 2's cap is what's left of the $25** after epoch 1 ("Epoch 2 = what's left of $25"), not another $15. **No campaign from Fri 2026-10-16 00:00 CDT (midnight going into the Jam) through the end of the Jam** (moved with the Jam to Fri 2026-10-16). Enforced by `budget.mjs` (§7). |
| Q7 | Epoch length X (her parameter) | 2 / **3** / 5 generations | **3**, about 9 h an epoch at the recommended size (§7). | **RULED 2026-09-30: 3.** The default. |
| Q8 | Seed prompts | `drums.md` (the smoke's; suicidal) / **house prose + the three starters + the Friday tier prompts** | **The Friday tier prompts plus house and starters**, so evolution starts where the quick tiers ended. | **RULED 2026-09-30: the Friday tier prompts (house-easy, medium, house-hard), house and the three starters.** Campaign 1 narrows this (07:34–07:35): its only seed is `house-hard`, and medium is its opponent, not a seed. |
| Q9 | Crossover (the "genetic algorithm" option) | **single change only for now** / rule-level crossover | **Single change first.** Each generation's effect stays attributable, which is the practice goal. Add crossover once single changes plateau. | **RULED 2026-09-30: single change, no crossover.** The only operator built. |
| Q10 | Tier bands and margins (§5.2) | as written / adjusted | Rule on them **before** the first campaign. They are the pre-registration. | **RULED 01:54–01:57, adjusted** (§5.2): the Friday medium joins the panel when merged; the medium band is a point estimate in [0.35, 0.65] with the interval clear of the hard and easy thresholds; head-to-head order is a reported finding (full matrix), not a criterion; the margins are ≥ 1 panel standard deviation per descriptor, measured before evolving. |

### Campaign 1: the hard lineage vs medium (ruled 2026-09-30 07:34–07:35 CT)

```
npm run evolve -- init --name campaign-1-hard \
  --seed-prompt prompts/pilots/house-hard.prose.md \
  --opponent-prompt prompts/pilots/house-violet.md
```

- **Lineage: hard only** ("Hard lineage only, first"). The seed is `house-hard.prose.md`, the hard
  tier's entrant-style prose. This spec defines no other hard-archetype variants. The harness
  compiles the prose itself, so the committed `runs/house-tiers-schemas-hard-2026-09-30.json` is a
  reference, not an input. A fresh compile also picks up the PR #39 translator fix (§11).
- **First opponent: the medium house tier** ("Medium (the placement bar)"). That is
  `house-violet.md`, the prose the medium tier was compiled from for the Jev sanity run
  (`runs/house-tiers-{compile,schemas}-medium-2026-09-30.*`). It is played and never evolved.
  Promoted champions join it in the hall of fame, up to the cap of 3.
- **Everything else is the default** (`DEFAULT_CAMPAIGN`): the Jam shape, 4 screening and 16
  promotion seeds, 3 generations an epoch, μ = 2 parents × 2 children, and the budget above. With
  one seed, generation 0 has one parent, and from generation 1 there are two. Nothing is in
  `--config`.

**How it ended.** It stopped on its $25 total cap at $24.88 on 2026-10-01 03:55 CT, partway through
generation 5. Epoch 1 spent $7.71 and epoch 2 spent $17.17. The champion is `45b17e27e139`, a
one-number child of `house-hard.prose.md`'s line: it finishes kills below 120 hp instead of 100. It
was promoted at the end of generation 2 (lower bound 1.000 over 16 held-out seeds) and went 8-0-0 in
generations 2–4. All of this was on the original rules: the v1 map, no economy, sequential
resolution.

### Campaign 2: the hard lineage on the new rules (ruled 2026-09-30 21:34–21:35 CT)

```
npm run evolve -- init --name campaign-2-hard \
  --seed-prompt runs/evolve-campaign-1-champion-45b17e27e139-2026-10-01.md \
  --opponent-prompt prompts/pilots/house-eco-violet.md \
  --config runs/evolve-campaign-2-config-2026-10-01.json
```

- **Seed: campaign 1's champion.** `runs/evolve-campaign-1-champion-…md` is a byte copy of its
  genome, so the seed keeps the id `45b17e27e139`. It is the only seed. Campaign 1's other
  survivor, `f47f80d588d7`, is the champion's own child, and the harness runs from one seed, as
  campaign 1 did.
- **First opponent: the medium house tier as it plays under the economy.** That is
  `house-eco-violet.md`, the file `tools/arena/house.mjs` picks for medium under `--economy`
  (`prompts/pilots/README.md`). It is campaign 1's opponent with the economy rules added.
  **Its phenotype is the house's checked-in compile, not a fresh one.**
  `compiled/91083d425da8.json` in the store wraps `prompts/pilots/house-medium-eco.schemas.json`
  in compile.py's shape and was written before the first `step`. In the dry run, a fresh sampled
  compile of this prose failed on keytar (`unknown target_selector 'nearest_minion'`). The harness
  records a failed compile for the rest of the generation and never retries it, so the step
  stopped with "no opponent compiled". The checked-in file is the cleanest of four samples, and it
  is what the house plays on a Jev ladder, so the campaign plays the real placement bar.
- **The new rules, pinned in the shape:** `map: pvp-1`, `economy: eco-2`, `objective: none` (the
  Bandstand hasn't passed its gate), `recall: none` and `resolution: simultaneous-1`. `matchKey`
  hashes all five, and the store is new, so no campaign 1 match is reused.
- **Budget:** the first epoch is capped at $20 and the total at $40. Epoch 2 gets what's left of
  the $40, under campaign 1's rule: it runs only if epoch 1 stayed under its cap, and there are at
  most 2 epochs. The blackout is unchanged.
- **Its own Jev server on port 8823** (`jevSchemaEndpoint`). 8790, 8797, 8813 and 8851 belong to other servers.
- **Targeting: `first-min`.** The shape predates the targeting rule (`tools/jev/target_resolve.py`),
  so its matches resolve "the nearest allied minion" with the plain `min()` that sent green's bots
  up the top lane from the fountain (`runs/bandstand-4-2026-10-01.md`). Every pairing is played
  from both sides, so that lean doesn't favour a genome by side. A campaign created since names
  `targeting: own-lane-1` in its shape, and `matchKey` hashes it.
- **Vocabulary: `vocab-1`** (ruled 2026-10-02, [`vocabulary-spec.md`](vocabulary-spec.md) §7 D7).
  The shape names none, so every genome compiles with `--vocab vocab-1` (`adapters.mjs
  campaignVocab`) and its matchKeys don't move. A campaign created since names `vocab: vocab-2`, what
  entrants compile under, and `matchKey` hashes it.
- **Everything else is the default**, as in campaign 1.

## 11. Found along the way

- **`schema_server.py` read its Workers AI token once** and answered every decision `401` after
  the hour-long OAuth token lapsed. With a lapsed token, every decision in a practice match, and in
  any Jev match in the Jam's shape, would hold. Fixed separately in **PR #36**, merged 2026-09-30:
  it now uses the self-renewing provider the house and team servers already use.
- **Concurrent matches on one schema server set off a token-renewal storm.** Every 401 forced its
  own renewal. A brand-new token 401s for its first ~0.5 s, so each renewal caused the next. Fixed
  in `tools/jev/client.py` (one renewal per credential, no retry on a token still warming up); see
  `runs/jev-client-renew-2026-09-30.md`. This removes the token obstacle to parallel matches. It
  does not measure Workers AI throughput, so "Concurrency is unmeasured" (§7) still stands.
- **Per-instrument clauses leak across instruments in the translator.** Compiling `house-violet.md`
  ("keytar only: …, violin only: …, drums only: …") put a `keytar_ready → chord` rule into the
  **drums** schema, and it fired 2 times in ~900 decisions. Fixed in **PR #39**. The rate was far
  higher than those firings suggest: 39 of 51 live compiles of `house-violet.md` leaked. The
  translator now sets aside lines marked for another instrument and removes any rule that still
  fires another instrument's ability (`docs/translator-guards-and-defaults-spec.md` §10). The
  `house-violet` schemas stored in this smoke run's genomes are the leaked ones; recompile any
  house-style prose compiled before that merge, including the Friday tiers.
