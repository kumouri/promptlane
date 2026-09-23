# Prose-to-schema translator — research and dev

*Ceryce, 2026-09-23 13:14 CT: "prose-to-schema translator research and dev" — option 1 of
`docs/jev-decision-model-research.md` §6. This memo answers the question that spawned it: can the
jam stay a prompt-writing competition (entrants write a prose `pilot.md`) while Jev runs what they
wrote? Everything below is either measured on the real files in this repo (labelled **measured**,
with the code that produced the number checked in) or an inference from those measurements
(labelled **inferred**). No arena, backend, model_server, or sim code was touched — per the task's
scope boundary, this is translator + offline harness code only, in `tools/jev/`.*

## The short answer

**Not reliably, not with a one-shot LLM translator and no human check.** The translator gets the
letter of a pilot's rules right often enough to be useful, but it silently mis-prioritized the single
most safety-critical rule in one of three real pilots, three times in three independent runs (§4.2).
**The mitigation this memo argues for — and the one thing that makes the jam's premise defensible at
all — is the design requirement already stated in the brief: the entrant must see the translated
schema and be able to catch exactly this kind of error before it runs.** Without that step, "prompt
writing" quietly becomes "hope the model got it right." With it, the competition is honestly
described as prompt writing *plus* proofreading a decision table — a real, but smaller, shift in
what skill is being tested than memo §6 worried about. Detail and numbers below.

## 1. What's actually expressible — measured on the real files

**Scope note.** There is no `entrants/` directory in this repo — real submitted entries live in the
private `jamobair-entrants` repo, which this session has no access to. The real prose that exists
here, in the exact entrant contract shape (free voice-driven prose ending in the fixed
OBSERVATION/reply-JSON instructions, per `tools/arena/pages/contract.mjs`), is the three reference
pilots the jam's starter template is built from (`prompts/pilots/README.md`): `drums.md`,
`keytar.md`, `violin.md`. These are what's measured below — not a stand-in, but not a sample of real
entrant diversity either; a real cohort's prose will vary more than three house-written examples do.

**Method** (`tools/jev/expressibility.py`, reconstruction-verified against the checked-in files
character-for-character — see the module for the full method and every labelled segment): each
file is split into exact substrings and every substring labelled one of:

- **`rule`** — a condition on Observation state that resolves to a bounded choice: a threshold
  ("below a quarter health"), a presence check ("an enemy bearbot is close enough to touch"), an
  ordering ("nearest... first,... second,... last"), or a selection among visible candidates
  ("throw it at the densest cluster"). Counted as `rule` even when the selection criterion is
  qualitative, because Jev's `choice`/`score` primitives are built for exactly that kind of ranked
  judgment among enumerated options (`docs/jev-decision-model-research.md` §1) — the *state* is
  still bounded, even if the wording is soft.
- **`open_strategy`** — decision-relevant prose that does *not* reduce to a condition on state or a
  bounded choice: patience/urgency framing ("don't wait for a 'perfect' moment"), unthresholded
  resource judgment ("it is not free, so don't burn it just because it's up"), continuous behavior
  with no discrete trigger ("keep repositioning toward the next isolated target"). This is the
  content Jev's typed questions structurally cannot take, because there is no free-text "use your
  judgment" question type.
- **`voice`** — identity, tone, in-character justification. Zero decision content; removing it
  changes nothing about what action gets picked.
- **`boilerplate`** — the fixed OBSERVATION/reply-JSON tail, identical mechanism across all three
  files (this is the same content the earlier memo measured for `drums.md` alone at 26%; this
  measurement gets 26.3% for the same file by the same character-count method — a useful
  cross-check, not a new number).

| file | total chars | `rule` | `open_strategy` | `voice` | `boilerplate` |
|---|---:|---:|---:|---:|---:|
| `drums.md` | 1,548 | 41.7% | 3.4% | 28.6% | 26.3% |
| `keytar.md` | 1,561 | 48.0% | 4.4% | 23.4% | 24.3% |
| `violin.md` | 1,638 | 42.6% | 17.4% | 16.9% | 23.1% |
| **all three** | **4,747** | **44.0%** | **8.6%** | **22.9%** | **24.5%** |

**Reading this measured split:** just under half of these three pilots' *content* (44.0%, ignoring
the fixed boilerplate) is, in principle, expressible as Jev conditions/choices/ordering. Another
8.6% is decision-relevant but not reducible to that shape at all — and that 8.6% turns out to
matter more than its size suggests: §4.3 below shows it is close to exactly where the built
translator's predictions diverge from ground truth. The remaining ~23% (voice) changes nothing about
what a schema-driven bot would do; it is pure entrant expression, and it is the first and largest
thing lost by construction, independent of how good any translator is (§5).

## 2. Translator design

**Architecture:** one-shot, submission-time translation. An entrant's `pilot.md` prose goes through
an LLM once, producing an **ordered list of `{condition, action}` rules plus one unconditional
default** — the same "take the FIRST rule that matches" shape as `house-violet.md`'s own seven
rules, which the earlier memo already flagged as "the closest thing in this repo to what Jev's
choice/noul primitives are for" (§6). Each condition becomes one Jev `noul` question; all of one
pilot's conditions are answered in a single `systemone` call per decision (matching Jev's own
one-call, parallel-questions design), and the rule cascade (first "yes" wins) runs in plain Python —
exactly the same posture `tools/jev/rules.py::first_match` already uses for house-violet.md.

**Design requirement: the entrant must be able to read the schema their prose became.** This is not
a nicety layered on afterward — it is the single mitigation that makes §4.2's failure mode
survivable. `translator.render_markdown()` produces exactly this: a plain rule-by-rule table
(condition → plain-English action description), no code, no Jev wire format, readable without
knowing anything about `noul` questions or `systemone` calls. Example (the real translated output
for `drums.md`, `runs/jev-translator-schema-drums-2026-09-23.md`):

| # | Condition | Then |
|---|---|---|
| 1 | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | is an enemy bearbot within melee range of an ally? | use **kick** targeting: the enemy nearest to this bearbot's own lowest-hp ally |
| 3 | is an enemy bearbot within melee range? | use **kick** targeting: the nearest visible enemy |
| 4 | are there multiple enemy bearbots bunched up near this bot? | use **fill** targeting: the enemy with the most other enemies near it |
| — | *(none of the above)* | **move** toward the enemy nexus |

An entrant reading this can check it against what they meant to write, in under a minute, without
touching a JSON schema. **Whether they reliably *would* is untested** — this memo did not run a
user study; it only establishes that the artifact exists and is legible, and shows one concrete case
(§4.2) where a careful read of exactly this kind of table would catch a real bug.

**Model: host Ollama's `qwen3.5:9b`** (`$OLLAMA_HOST`, `tools/model_server.py`'s own
`DEFAULT_OLLAMA_MODEL`) — already configured in this repo, confirmed reachable on this host, and
free (local inference). Not Jev: Jev has no free-text output primitive at all
(`docs/jev-decision-model-research.md` §1), so it structurally cannot produce a schema — only answer
pre-declared questions against it. Not OpenRouter: also available (`$OPENROUTER_API_KEY` is set on
this host) but there is no reason to spend real money on a task a local model already handles, and
using it keeps the translation step's cost trivially reportable as real ($0, not "free" hiding real
compute — wall-clock and token counts are still measured; see §4.1).

**Target vocabulary — the one place prose nuance is deliberately flattened.** Jev's questions judge
*conditions*, but nothing in this pipeline asks Jev to pick *which entity*. Once a rule fires, its
target is resolved deterministically in Python (`tools/jev/target_resolve.py`) from a **fixed,
10-item vocabulary** (`home`, `push_lane`, `nearest_enemy`, `lowest_hp_enemy`,
`densest_cluster_enemy`, `isolated_enemy`, `nearest_tower`, `threatened_ally_enemy`,
`nearby_minion`, `none`). The translator's job is to pick the closest-matching selector for what the
prose says ("densest cluster" → `densest_cluster_enemy`, "softest target" → `lowest_hp_enemy`), not
to invent new ones. **This is a real, named simplification, not a hidden one**: it is a smaller
version of the same idea the memo's §6 flagged for the whole translation layer, applied specifically
to targeting. A `choice` question per rule per candidate set (Jev picking the target directly,
scored against the visible entity list) is the natural next version and was not built here — kept
out for scope and time, not because it wouldn't work.

## 3. Evaluation harness and methodology

**Why synthetic Observations, not replayed match logs.** The obvious plan — replay
`drums.md`/`keytar.md`/`violin.md`'s real logged decisions the way the existing house-violet.md
harness replays its worksheet — doesn't work here. Checked (`runs/jam-sample-drums-vs-violin.json`,
`runs/openrouter-phase-c-proof-2026-09-22-*.json`): `decisions[]` for these three pilots is only
`{tick, bot, reply, action, ms}` with no self-reported worksheet (unlike house-violet.md), and
`checkpoints[]` gives bare `[hp,x,y,alive,recalling]` per bearbot every 100 ticks with no per-entity
id, cooldown map, or minion/tower identity — and decision ticks don't even land on checkpoint
boundaries (cadence puts a decision roughly every 40 ticks at `tickDt=0.05`; checkpoints are every
100). There is no real `Observation` to recover from the checked-in data for these pilots at all —
a smaller version of the same gap `tools/jev/harness.py`'s own module docstring found for
house-violet.md's worksheet.

So `tools/jev/scenarios.py` builds 12 hand-designed `Observation` objects, in the exact contract
shape `tools/arena/pages/contract.mjs`'s `EXAMPLE_OBSERVATION` documents, each targeting a specific
decision boundary named in the prose: the quarter-health recall line (including the exact boundary
value), melee vs. ranged distance, ability cooldown, a clustered vs. an isolated enemy, a threatened
ally, and a "softest" (lowest-hp) vs. nearest target trade-off. No distance/range field is
precomputed — only raw `pos: {x,y}`, same as the real game gives its pilots.

**Ground truth, and why it's independent of both the translator and Jev.** For each (pilot,
scenario) pair, ground truth is: take the entrant's actual, untranslated prose file, build the exact
prompt the real game would build (`ground_truth.py::build_prompt` is a line-for-line port of
`src/pilots/promptPilot.ts`'s `PromptPilot.buildPrompt`, same `REPLY_INSTRUCTION`, same assembly
order), send it to the same `qwen3.5:9b` via a live Ollama call, and parse the reply with a port of
`parseAction`. **This is the actual A/B the research question is about** — prose run live
(freeform) vs. prose translated once then run on Jev (bounded) — not the translator grading its own
homework, and not Jev's own answers used as their own check.

**Prediction:** the translated schema's conditions, bound to that scenario's Observation, sent to
Jev as one `systemone` call (live, via `WorkersAIClient`, the same backend
`runs/jev-suitability-harness-2026-09-22.md` already validated), the rule cascade applied in Python,
the winning rule's target resolved via `target_resolve.py`.

**Metrics:** `kind_agreement` (do both pick the same `ActionKind` — `move`/`attack`/`ability`/
`recall`/`hold`, always defined); `ability_agreement` (conditioned on both picking `ability`, do
they name the same one); `target_id_agreement` (conditioned on both producing a string entity id —
not a position — do they name the same entity). No bucket engineering: both systems choose among the
same real candidate ids in the same Observation, so exact comparison is possible and is the
stricter, more honest bar.

Code: `tools/jev/{scenarios,translator,target_resolve,ground_truth,fidelity_harness}.py`. Run it:

```
python tools/jev/fidelity_harness.py                                          # dry run, stub Jev, no Jev network
python tools/jev/fidelity_harness.py --live --schemas-out <dir> --out <path>  # real Jev via Workers AI
```

## 4. Results

### 4.1 Cost and scale

Two full live runs against `--backend workers-ai` (the same account the existing suitability harness
verified working, `runs/jev-suitability-harness-2026-09-22.md`): 3 pilots × 12 scenarios = 36
(pilot, scenario) pairs, one `systemone` call each (all of a pilot's rule conditions batched per
call, matching Jev's own design).

| | value | how measured |
|---|---:|---|
| Jev input tokens | 23,742 | real `usage.input_tokens`, not estimated |
| **Jev cost** | **$0.000997** | `estimate_cost_usd`, TypeSafe's published $0.042/M input, free output |
| Jev mean latency | ~0.65 s | wall-clock around each `client.ask` call |
| Jev failures/429s | 0 | — |
| Translation calls | 3 (one per pilot) | host Ollama `qwen3.5:9b`, ~5–8 s each |
| Ground-truth calls | 36 (one per pilot × scenario) | same model, same host |
| **Translation + ground-truth cost** | **$0** | local inference, `$OLLAMA_HOST` already running on this box |

Budget given: at most $1.00 of Jev spend. Actual: **$0.001**, about a tenth of a cent — the full
run could be repeated roughly 1,000 times inside the stated budget.

### 4.2 The keytar case — a reproducible translation failure, not noise

Overall `kind_agreement` (measured, live): **drums 50.0%, keytar 8.3%, violin 58.3%, all three
38.9%** (n=12 per pilot, 36 total). Keytar is not a slightly-worse number — it is close to what
random guessing among five action kinds would produce, and it has a specific, diagnosable cause.

`keytar.md`'s prose states, in its own words: *"Recall the moment you're below a quarter health, no
exceptions"* — the same unconditional-override framing `drums.md` ("Retreat only when you're really
hurt... below a quarter health") and `violin.md` ("the instant you drop under a quarter health,
recall, no matter how close the kill looked") also use. In both `drums.md` and `violin.md`, the
translator correctly promoted this to **rule 1** — the actual highest-priority check, run before
anything else, matching the prose's clear intent regardless of where the sentence sits in the file.

For `keytar.md`, it did not. **Run three times independently** (temperature 0.2, not deterministic):

| run | recall rule's position (of 5) |
|---|---:|
| live evaluation run | 4th |
| repro run 1 | 5th (last) |
| repro run 2 | 5th (last) |

Every time, an earlier rule like `is the primary ability 'chord' off cooldown?` — missing the
prose's own conjunction ("...the instant it's off cooldown," itself gated on "throw it at the
densest cluster of enemies **you can see**") — fires whenever Chord's cooldown is simply at zero,
independent of whether an enemy is even visible. Since Chord's cooldown is zero in most of the test
scenarios (by design — the scenarios test other boundaries), this rule wins the cascade almost every
time and the recall rule, sitting near the bottom, rarely gets evaluated at all. The concrete
consequence, from the live run: in the `low_hp_recall_under_pressure` scenario — self at 20% hp, the
exact case the prose says has "no exceptions" — ground truth (live prose) correctly moved to
retreat; **the translated schema fired an ability instead.**

**This is exactly the failure mode a legible schema is supposed to catch.** Reading
`runs/jev-translator-schema-keytar-2026-09-23.md` (the entrant-facing rendering), rule 3 reads "is
the primary ability 'chord' off cooldown?" with no mention of an enemy at all, sitting above the
recall rule — a five-second read for anyone comparing it to their own prose. Root cause of *why*
`keytar.md` translates worse than the other two is not identified here — flagged, not solved.

### 4.3 The second gap: "move toward" has no place in the action vocabulary

Where kinds disagreed but weren't the keytar failure above, one pattern repeats across all three
pilots: ground truth frequently chose `move` with a target near or at an enemy's position — i.e.,
*close the distance without committing to attack yet* — while the translated schema, once a rule
fires, only ever produces `attack`/`ability` against a resolved target (there is no "move toward
candidate X" action in the 10-selector vocabulary tied to a non-`move` rule). This shows up most in
`violin.md` (`kind_agreement` 58.3%, the best of the three, but several disagreements are exactly
this shape — e.g. `ranged_enemy_far`: ground truth `move` toward the distant enemy, predicted `move`
too but via a different rule/selector; `melee_range_enemy_ability_ready`: ground truth `move`
away, predicted `move` toward the enemy) and matches §1's measured finding almost exactly:
`violin.md` has the highest `open_strategy` share of the three files (17.4%, more than double
`drums.md`'s or `keytar.md`'s), and `open_strategy` is defined as exactly this kind of
continuous-positioning, no-discrete-trigger prose ("keep repositioning toward the next isolated
target"). **The measured expressibility gap and the measured fidelity gap point at the same content
class, independently** — that's a real cross-check, not a coincidence read into small numbers.

**Where the translated schema does agree with ground truth on a target, it agrees well**: `target_
id_agreement` (both sides producing a specific entity id, not a position) was **80% for drums (4/5)**
and **100% for violin (2/2)** — small samples, but a signal that once the *rule* fires correctly, the
Python target-resolution step (§2) tracks the prose's intent (nearest/lowest-hp/clustered/isolated)
reasonably well. `ability_agreement` had too few comparable rows (n=0–1 per pilot) to say anything.

## 5. Can the jam's premise survive this, and what does the entrant lose?

**Measured, this run:** a one-shot LLM translator, unaided, correctly preserves an entrant's stated
priority order in 2 of 3 real pilots and silently breaks it in the third, reproducibly. Action-kind
fidelity against live ground truth ranges from 50–58% (drums, violin) down to 8.3% (keytar) when
the priority break happens. Roughly 44% of a real pilot's content is cleanly schema-expressible,
~23% is voice with zero decision content, and the remaining ~9% (`open_strategy`) is exactly where
the built translator's predictions diverge most, even when rule order is right.

**Inferred, from those numbers, answering the question directly:**

- **The jam's premise — "write your bearbot's personality in prose" — does not survive intact.**
  ~23% of these three pilots is pure voice; none of it changes what a schema-driven bot does. That
  loss is structural, not a translator bug: even a perfect translator produces a bot with the same
  personality-free behavior. What an entrant *writes* can still be voice-rich; what actually *runs*
  cannot be, by construction, once Jev is in the loop.
- **The competition partially survives as "prompt writing plus proofreading a decision table."**
  The design requirement in §2 — a legible schema the entrant reads back — is not optional
  decoration; §4.2 is a specific, real instance of the exact failure it exists to catch. An entrant
  who reads their translated schema and notices "wait, my recall rule is 4th, not 1st" fixes a bug a
  silent pipeline would have shipped into the match. That requires a *new* skill (reading a decision
  table critically) layered on top of the old one (voice-writing prose) — which is closer to memo
  §6's "different creative acts, different skill, different entry bar" worry than to "a faster
  version of the same competition." It is real mitigation, not a full fix: it depends on the entrant
  actually doing the check, which this memo did not test.
- **What's lost, concretely, ranked by how much of this run's evidence backs it:** (1) voice/tone —
  measured, total, unavoidable; (2) fine-grained positioning judgment ("keep repositioning,"
  "don't wait for a perfect moment") — measured as the hardest-to-translate content class (§1) and
  independently measured as the largest source of live disagreement (§4.3); (3) correct rule
  *priority* when the translator's inference is wrong — measured as real but pilot-dependent, not
  universal, and specifically the kind of error a legible schema gives an entrant a chance to catch
  before it ships (§4.2).

**What would raise confidence before betting a jam on this:** more than 3 real pilots (ideally from
`jamobair-entrants`, with permission), more than 12 scenarios per pilot, a repeat of §4.2's
three-run reproducibility check across all three pilots (only keytar was checked three times), and
an actual test of whether an entrant, shown their translated schema, catches a planted bug like the
one in §4.2 — none of which this budget-constrained pass attempted.

## Sources

- This repo: `tools/jev/{expressibility,scenarios,translator,target_resolve,ground_truth,
  fidelity_harness}.py` (all new, this task); `tools/jev/{client,rules,serializer,harness}.py`
  (existing, read and reused, not modified); `prompts/pilots/{drums,keytar,violin,house-violet,
  house-green,README}.md`; `tools/arena/pages/contract.mjs`; `src/pilots/promptPilot.ts`;
  `tools/model_server.py`; `docs/jev-decision-model-research.md`; `runs/
  jev-suitability-harness-2026-09-22.md`.
- Raw results: `runs/jev-translator-fidelity-2026-09-23.json` (full per-scenario detail),
  `runs/jev-translator-schema-{drums,keytar,violin}-2026-09-23.{md,json}` (translated schemas,
  both the entrant-readable rendering and the machine JSON).
