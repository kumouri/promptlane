# Prose-to-schema translator — research and dev

*Ceryce, 2026-09-23 13:14 CT: "prose-to-schema translator research and dev" — option 1 of
`docs/jev-decision-model-research.md` §6. This memo answers the question that spawned it: can the
jam stay a prompt-writing competition (entrants write a prose `pilot.md`) while Jev runs what they
wrote? Everything below is either measured on the real files in this repo (labelled **measured**,
with the code that produced the number checked in) or an inference from those measurements
(labelled **inferred**). No arena, backend, model_server, or sim code was touched — per the task's
scope boundary, this is translator + offline harness code only, in `tools/jev/`.*

## The short answer

**Not reliably, not with a one-shot LLM translator alone — but a targeted structural guard fixes the
one failure mode that mattered most, and the case for keeping a human in the loop anyway still
stands.** The translator gets the letter of a pilot's rules right often enough to be useful, but it
silently mis-prioritized the single most safety-critical rule in one of three real pilots, three
times in three independent runs (§4.2). That specific bug is now fixed by
`translator.enforce_absolute_priority` — a rule-order guard added and verified in this same change,
not a hypothetical — but it only catches prose that uses explicit override language ("no
exceptions," "no matter"); it is a patch for one diagnosed failure mode, not a general fidelity
guarantee. **The mitigation this memo still argues for — and the one thing that makes the jam's
premise defensible even with the guard in place — is the design requirement already stated in the
brief: the entrant must see the translated schema and be able to catch whatever the automated checks
don't.** Without that step, "prompt writing" quietly becomes "hope the model (and its guardrails)
got it right." With it, the competition is honestly described as prompt writing *plus* proofreading
a decision table — a real, but smaller, shift in what skill is being tested than memo §6 worried
about. Detail and numbers below.

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

**Priority guard, added after §4.2's bug was found.** A rule cascade is first-match-wins, so a rule
that's translated correctly but placed in the wrong position is exactly as broken as a rule that's
missing. `translator.enforce_absolute_priority` scans the *original prose* (not the schema, not the
model's opinion of its own output) for a small set of phrases that mark a sentence as an
unconditional override rather than routine emphasis — `"no exceptions"`, `"without exception"`,
`"no matter"`, `"regardless of"`, `"unconditionally"` — and, whenever the translator placed the
matching rule anywhere but first, promotes it and records a plain-English note in the schema's
`validation_notes`, which `render_markdown` prints directly under the rule table so the entrant sees
it without reading code. Deliberately excludes `"always"`/`"never"`: both appear in `drums.md`'s
ordinary ability-usage language ("on cooldown, always, no hesitation") with no override meaning at
all, and a test locks in that they don't cause a false promotion
(`test_translator.py::test_always_and_never_are_not_treated_as_override_markers`). If an override
paragraph doesn't match any translated rule well enough, the guard raises rather than silently doing
nothing — a missing override rule can't be fixed by reordering, so it's treated the same as a
JSON-parse failure and retried.

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

*This section reports two live runs: **run A**, the translator before the priority guard (§2)
existed, and **run B**, the same 36 (pilot, scenario) pairs after `enforce_absolute_priority` was
added. Both are real, both are kept — run A is what §4.2 diagnoses, run B is what confirms the
fix and what §4.3/§5's numbers are drawn from, since it reflects the code actually shipped in this
change. The two runs also aren't a clean A/B in the scientific sense: translation and ground truth
both come from `qwen3.5:9b` at temperature 0.2, not 0, so some of the difference between them is
real run-to-run variance, not just the fix — called out explicitly below, not glossed over.*

### 4.1 Cost and scale

Two full live-Jev runs (run A and run B) against `--backend workers-ai` (the same account the
existing suitability harness verified working, `runs/jev-suitability-harness-2026-09-22.md`): 3
pilots × 12 scenarios = 36 (pilot, scenario) pairs each, one `systemone` call per pair (all of a
pilot's rule conditions batched per call, matching Jev's own design).

| | run A | run B | how measured |
|---|---:|---:|---|
| Jev input tokens | 23,742 | 23,418 | real `usage.input_tokens`, not estimated |
| **Jev cost** | **$0.000997** | **$0.000984** | `estimate_cost_usd`, TypeSafe's $0.042/M input, free output |
| Jev mean latency | ~0.65 s | ~0.75 s | wall-clock around each `client.ask` call |
| Jev failures/429s | 0 | 0 | — |
| Translation calls | 3 | 3 | host Ollama `qwen3.5:9b`, ~5–8 s each |
| Ground-truth calls | 36 | 36 | same model, same host |
| **Translation + ground-truth cost** | **$0** | **$0** | local inference, `$OLLAMA_HOST` already running on this box |

Budget given: at most $1.00 of Jev spend. Actual, both runs combined: **~$0.002**, about a fifth of a
cent — the full pair of runs could be repeated roughly 500 times inside the stated budget.

### 4.2 The keytar case — found, reproduced, and fixed in this change

Run A's overall `kind_agreement` (measured, live): **drums 50.0%, keytar 8.3%, violin 58.3%, all
three 38.9%** (n=12 per pilot, 36 total). Keytar was not a slightly-worse number — it was close to
what random guessing among five action kinds would produce, and it had a specific, diagnosable
cause.

`keytar.md`'s prose states, in its own words: *"Recall the moment you're below a quarter health, no
exceptions"* — the same unconditional-override framing `drums.md` ("Retreat only when you're really
hurt... below a quarter health") and `violin.md` ("the instant you drop under a quarter health,
recall, no matter how close the kill looked") also use. In run A, `drums.md` and `violin.md`'s
translations correctly promoted this to **rule 1** — the actual highest-priority check, run before
anything else, matching the prose's clear intent regardless of where the sentence sits in the file.

`keytar.md`'s did not. **Reproduced three times independently** (temperature 0.2, not deterministic):

| run | recall rule's position (of 5) |
|---|---:|
| run A (live evaluation) | 4th |
| repro run 1 | 5th (last) |
| repro run 2 | 5th (last) |

Every time, an earlier rule like `is the primary ability 'chord' off cooldown?` — missing the
prose's own conjunction ("...the instant it's off cooldown," itself gated on "throw it at the
densest cluster of enemies **you can see**") — fired whenever Chord's cooldown was simply at zero,
independent of whether an enemy was even visible. Since Chord's cooldown is zero in most of the test
scenarios (by design — the scenarios test other boundaries), this rule won the cascade almost every
time and the recall rule, sitting near the bottom, rarely got evaluated at all. The concrete
consequence, from run A: in the `low_hp_recall_under_pressure` scenario — self at 20% hp, the exact
case the prose says has "no exceptions" — ground truth (live prose) correctly moved to retreat;
**the translated schema fired an ability instead.**

**The fix: `translator.enforce_absolute_priority` (§2).** Rather than special-case keytar, it scans
any pilot's prose for the override phrases named in §2 and promotes the matching rule if the
translator placed it anywhere else, raising instead of silently doing nothing if no rule matches at
all. Verified against the real file, not just the test fixtures — re-running the live translator on
`prompts/pilots/keytar.md` after adding the guard:

```
1 recall_low_hp | is this bot's current hp below a quarter of its max hp?
2 panic_dash_out | is a visible enemy inside melee range of this bot?
...
notes: ('priority guard: promoted rule(s) recall_low_hp to the top of the cascade -- the prose uses
unconditional-override language for them (no exceptions) but the translator placed them lower...')
```

— recall is rule 1, every time this was checked after the fix, and the note explaining *why* the
rule moved ships inside the entrant-facing schema itself
(`runs/jev-translator-schema-keytar-2026-09-23.md`, regenerated post-fix), not buried in a log only
a researcher would read. **This is exactly the failure mode a legible schema is supposed to catch,
demonstrated concretely rather than just argued for**: the automatic note is the machine equivalent
of "a five-second read for anyone comparing it to their own prose," which is what the pre-fix version
of this document said an entrant would have had to do by hand.

**What the fix does and does not cover.** Run B (post-fix, full re-run): keytar's `kind_agreement`
rose from **8.3% to 50.0%** — the single largest swing in this whole exercise, and directly
attributable to the fix (the recall-position bug is gone; §4.3 covers what run B's numbers say about
the rest). But the guard only fires on prose using one of five specific override phrases. A pilot
that means "no exceptions" without ever writing a phrase like it — `drums.md`'s own "Retreat only
when you're really hurt" carries the same intent without any of the five trigger phrases, and only
translated correctly in both runs by chance, not because the guard caught anything — would get no
help from this guard at all. **It is a patch for one diagnosed, reproduced failure, not a general
solution to translation-order fidelity.** Root cause of *why* the base translator treats `keytar.md`
differently from the other two in the first place is still not identified — flagged, not solved.

### 4.3 The second gap: "move toward" has no place in the action vocabulary, and real run-to-run variance

Run B's overall `kind_agreement` was **38.9%** — identical to run A's, but redistributed: **drums
33.3% (down from 50.0%), keytar 50.0% (up from 8.3%), violin 33.3% (down from 58.3%)**. Keytar's
rise is the fix (§4.2). Drums' and violin's *drops*, despite both still correctly placing their
recall rule first in run B, are real and worth taking at face value rather than explaining away:
both translation and ground truth are sampled from `qwen3.5:9b` at temperature 0.2, so re-running the
exact same 24 (pilot, scenario) pairs produced different rule wording, different ground-truth replies
on some scenarios, and a different overall split — **one-run numbers in this whole memo, run A's and
run B's alike, should be read as "what happened this time," not as a stable rate.** That the overall
total landed on exactly 14/36 both times is very likely coincidence, not a hidden invariant; it was
not investigated further.

Independent of which run, one pattern repeats across both: ground truth frequently chose `move` with
a target near or at an enemy's position — i.e., *close the distance without committing to attack
yet* — while the translated schema, once a rule fires, only ever produces `attack`/`ability` against
a resolved target (there is no "move toward candidate X" action tied to a non-`move` rule in the
10-selector vocabulary). This matches §1's measured finding: `violin.md` has the highest
`open_strategy` share of the three files (17.4%, more than double `drums.md`'s or `keytar.md`'s), and
`open_strategy` is defined as exactly this kind of continuous-positioning, no-discrete-trigger prose
("keep repositioning toward the next isolated target"). **The measured expressibility gap and the
measured fidelity gap point at the same content class, independently** — that's a real cross-check,
not a coincidence read into small numbers, even though the exact percentage it produces run-to-run
moved by double digits.

**Where the translated schema does agree with ground truth on a target, it agrees well, in both
runs**: `target_id_agreement` (both sides producing a specific entity id, not a position) was **100%
for drums (5/5, up from 4/5 in run A) and 100% for violin (2/2, both runs)**; `ability_agreement` had
one comparable row in each run (too few to trend) but agreed in run B (1/1) versus disagreeing in run
A (0/1). Small samples throughout, but a consistent signal that once a rule fires, the Python
target-resolution step (§2) tracks the prose's intent (nearest/lowest-hp/clustered/isolated)
reliably — the fidelity loss measured in this section is concentrated in *which rule fires and what
kind of action it produces*, not in *which entity gets picked once a rule fires*.

### 4.4 Separating translator error from ground-truth noise: a reference-schema ceiling and a prose-derived ground truth

**The problem with every number above.** Every fidelity figure in §4.2/§4.3 is *translator vs.
qwen's own live behavior*. That behavior is not a reliable oracle: `runs/house-prompt-2026-09-21.md`
independently measured `qwen3.5:9b` following its own pilot's low-hp recall rule only ~46% of the
time, and this section reproduces that instability directly — asked live, `think:false`, against
`low_hp_recall_under_pressure` (self at 20% hp, every one of the three pilots' prose says recall
"no exceptions" / "no matter" / "only when really hurt"), qwen answered `move` for keytar, `attack`
for drums, and `attack` for violin — **zero of three pilots' own ground truth recalled at the exact
boundary their own prose names.** A low translator-vs-qwen score is therefore ambiguous: it cannot
tell you whether the translator is wrong or whether qwen is wrong, and §4.3's numbers already show a
translator that places recall correctly (both drums and violin, both runs) still gets marked wrong
against qwen on that exact scenario. This section measures both sides against a THIRD, model-
independent source instead, to answer the question this memo is actually about: does the translated
pilot do what the entrant *wrote*, not what one non-deterministic model happens to do that run.

**Two new artifacts, both hand-authored and explicitly not a human gold standard.** Per this task's
own instruction, both were produced by a Claude subagent — not a human, and the doc says so plainly
— that read only the three pilots' raw prose (pasted inline) and the exact `Observation` JSON for
all 36 (pilot, scenario) pairs (`scenarios.py`, generated fresh and handed over, containing no
translator output), and was explicitly barred from reading `translator.py`, anything under `runs/`,
or this document, so its output is blind to both the translator's schemas and to qwen's answers:

- **A reference schema per pilot** (`runs/reference-schema-{drums,keytar,violin}.json`, same JSON
  shape `translate_pilot` produces): one careful reading of each pilot's prose into a rule cascade,
  written before looking at any translator output. Each carries a `_provenance` field naming exactly
  this. `fidelity_harness.py --reference-schemas-dir` (new in this change, `load_reference_schema`)
  runs it through the *identical* downstream pipeline as the translator's own schema — same rule
  cascade, same target resolution, same live Jev `systemone` call, same qwen ground truth — so it
  measures a ceiling: how well a *correct* translation can score against qwen, isolating "the
  translator is wrong" from "qwen is an unreliable judge."
- **Prose-derived ground-truth labels**, 12 per pilot (`runs/prose-ground-truth-{drums,keytar,
  violin}.json`): for each scenario, what the prose itself says to do, judged fresh against the
  Observation each time (not just replayed from the reference schema above, and before seeing any
  model's answer). The subagent flagged its own genuinely ambiguous calls in each label's
  `rationale` field (edge cases neither pilot's prose resolves cleanly: towers, exactly-25%-hp,
  "has a fight started" at medium range) — read those before trusting any single label at face
  value.

**Run C — the ceiling** (reference schema vs. live qwen ground truth, same 36 pairs, live Jev):
`kind_agreement` **drums 50.0% (6/12), keytar 25.0% (3/12), violin 58.3% (7/12), overall 44.4%
(16/36)**. This lands almost exactly on the *independently derived* 43.7% "perfect-rule-follower"
ceiling this repo already measured by a completely different method
(`docs/jev-decision-model-research.md`'s companion memo, commit `1cd44ee`, a different dataset and
harness entirely) — two unrelated methodologies landing within one percentage point of each other is
a real cross-check, not a coincidence worth ignoring. **Read together with run B's 38.9%, this is
the headline finding of this section: even a hand-authored, blind, "correct" translation cannot beat
~44% against qwen ground truth, because qwen itself is the bottleneck, not translation quality.**

**Prose-fidelity — scoring run B (the checked-in, post-fix translator run) and qwen-on-prose against
the prose-derived labels instead of against each other** (`tools/jev/prose_fidelity_report.py`, pure
offline comparison, no new Jev/Ollama calls — reuses run B's stored predictions and ground-truth
replies):

| pilot | translator vs. prose (n=12) | qwen-on-prose vs. prose (n=12) |
|---|---:|---:|
| drums | **75.0%** (9/12) | 41.7% (5/12) |
| keytar | **58.3%** (7/12) | 41.7% (5/12) |
| violin | **58.3%** (7/12) | 58.3% (7/12) |
| **all three** | **63.9%** (23/36) | **47.2%** (17/36) |

**This is the number that actually answers the research question, and it says something run B's raw
`kind_agreement` badly understated: the fixed translator (63.9%) is *more* faithful to what entrants
wrote than qwen itself is when reading that same prose live and unconstrained (47.2%) — by 16.7
points overall, more than 6 scenarios' worth of swing at this sample size (below).** Keytar
specifically: run B's raw `kind_agreement` (50.0%) made the post-fix translator look merely
"average, same as the others" — but scored against what keytar's prose actually says, the fixed
schema is *right more often than qwen is* (58.3% vs. 41.7%), including on `low_hp_recall_under_pressure`
itself, where the translator (now correctly prioritized, §4.2) says recall and qwen does not.

**n and what a swing is worth, stated plainly per-figure, not just once at the top.** Every per-pilot
rate above is n=12 — one scenario is **8.3 percentage points**. Every "all three" rate is n=36 — one
scenario is **2.8 percentage points**. Concretely: drums' 75.0% vs. keytar/violin's 58.3% is a
2-scenario (16.7-point) gap, inside the range a single re-sample of `qwen3.5:9b` at temperature 0.2
could plausibly produce on its own (§4.3 already showed drums and violin move by double digits
between run A and run B on identical prose) — **not** read as "the translator understands drums
better," just noted as the honest size of the gap. The 63.9% vs. 47.2% *overall* translator-vs-qwen
prose-fidelity gap, by contrast, is 6 scenarios' worth on n=36 — large enough, and consistent enough
across all three pilots individually (translator ≥ qwen in every row above), to treat as a real
signal rather than sampling noise, even though this memo still only has one draw of it.

## 5. Can the jam's premise survive this, and what does the entrant lose?

**Measured, across both runs:** a one-shot LLM translator, unaided (run A), correctly preserved an
entrant's stated priority order in 2 of 3 real pilots and silently broke it in the third,
reproducibly (3/3 independent translations). A targeted structural guard, built and verified in this
same change, fixed that specific failure — keytar's fidelity rose from 8.3% to 50.0% (run B) — but
covers only prose using one of five specific override phrases, not translation-order fidelity in
general. Even with the fix, run B's remaining numbers (drums 33.3%, violin 33.3%) show real
run-to-run variance of double digits on the *same* 24 (pilot, scenario) pairs, from `qwen3.5:9b`'s
own non-determinism at temperature 0.2 — a second, independent reason not to trust any single
fidelity percentage in this memo as a stable rate. Roughly 44% of a real pilot's content is cleanly
schema-expressible, ~23% is voice with zero decision content, and the remaining ~9% (`open_strategy`)
is measurably where translated schemas diverge from ground truth most, in both runs, even when rule
order is right.

**Inferred, from those numbers, answering the question directly:**

- **The jam's premise — "write your bearbot's personality in prose" — does not survive intact.**
  ~23% of these three pilots is pure voice; none of it changes what a schema-driven bot does. That
  loss is structural, not a translator bug: even a perfect translator produces a bot with the same
  personality-free behavior. What an entrant *writes* can still be voice-rich; what actually *runs*
  cannot be, by construction, once Jev is in the loop.
- **The competition partially survives as "prompt writing plus proofreading a decision table" —
  and automated guards narrow, but do not close, how much proofreading that requires.** The design
  requirement in §2 — a legible schema the entrant reads back — is not optional decoration; §4.2 is a
  specific, real instance of the exact failure it exists to catch, and the priority guard added in
  this change shows that some such failures can also be caught *before* the entrant ever sees the
  schema. But the guard is narrow by construction (five phrases, one failure shape), and §4.3's
  run-to-run variance means even a passing schema today could translate differently tomorrow from the
  identical prose file. An entrant who reads their translated schema and checks it against what they
  meant fixes bugs neither the guard nor a single passing test run would catch. That requires a *new*
  skill (reading a decision table critically) layered on top of the old one (voice-writing prose) —
  which is closer to memo §6's "different creative acts, different skill, different entry bar" worry
  than to "a faster version of the same competition." It is real mitigation, not a full fix: it
  depends on the entrant actually doing the check, which this memo did not test, and on a translator
  whose output is stable enough to check *once* — which run B's variance says is not yet true.
- **What's lost, concretely, ranked by how much of this run's evidence backs it:** (1) voice/tone —
  measured, total, unavoidable; (2) fine-grained positioning judgment ("keep repositioning,"
  "don't wait for a perfect moment") — measured as the hardest-to-translate content class (§1) and
  independently measured as the largest source of live disagreement in both runs (§4.3); (3) correct
  rule *priority* when the translator's inference is wrong and the prose doesn't happen to use one of
  the guard's five trigger phrases — demonstrably real (§4.2), now partially mitigated by a shipped
  fix rather than only a proposal, but not eliminated; (4) *stability* itself — the same prose file
  translating differently on different runs (§4.3) is a cost independent of any single run's fidelity
  number, and nothing built here addresses it.

**What would raise confidence before betting a jam on this:** more than 3 real pilots (ideally from
`jamobair-entrants`, with permission), more than 12 scenarios per pilot, more than two live runs per
pilot (so §4.3's variance can be quantified rather than just observed once), a temperature-0 or
majority-vote translation mode to test whether variance is a sampling artifact or a deeper
instability, broadening the priority guard's phrase list against a larger prose corpus, and an actual
test of whether an entrant, shown their translated schema, catches a planted bug like the one in
§4.2 — none of which this budget-constrained pass attempted.

## Sources

- This repo: `tools/jev/{expressibility,scenarios,translator,target_resolve,ground_truth,
  fidelity_harness}.py` (all new, this task, `translator.py` including the `enforce_absolute_priority`
  guard added after §4.2's bug was found); `tools/jev/test_{expressibility,scenarios,target_resolve,
  translator}.py` (new tests, `test_translator.py::EnforceAbsolutePriorityTests` covers the guard,
  including the keytar-shaped repro and the drums-shaped "always"/"never" false-positive check);
  `tools/jev/{client,rules,serializer,harness}.py` (existing, read and reused, not modified);
  `prompts/pilots/{drums,keytar,violin,house-violet,house-green,README}.md`;
  `tools/arena/pages/contract.mjs`; `src/pilots/promptPilot.ts`; `tools/model_server.py`;
  `docs/jev-decision-model-research.md`; `runs/jev-suitability-harness-2026-09-22.md`.
- Raw results: `runs/jev-translator-fidelity-2026-09-23.json` and
  `runs/jev-translator-schema-{drums,keytar,violin}-2026-09-23.{md,json}` are **run B** (post-fix) —
  what's actually checked in and what §4.3/§5 are drawn from. Run A (pre-fix) is documented only in
  §4.2's prose; its raw JSON was superseded when run B was generated and was not separately kept, so
  run A's numbers in this doc are the only surviving record of it.
