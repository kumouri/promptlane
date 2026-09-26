# Translator transparency, the keytar revision loop, and jam-rule options

*Ceryce, 2026-09-23 14:57 CT: "we should also attempt to improve on the prompt->jev prompt
translator to see if we can make it transparent, or we could modify the rules or something… I just
kind of want this to still be relevant to their work so they learn some prompt engineering shit but
we can't use Jev at work. But I also am super interested in Jev and this seems like such a good
situation for it."*

**The success criterion is hers, and it's the whole point:** jam entrants must come away with
prompt-engineering skills that *transfer* to their jobs, where Jev isn't available, while Jev keeps
running underneath. A design that makes the jam easier but teaches nothing transferable fails, even
with good fidelity numbers.

**What this memo adds on top of `docs/prose-to-schema-translator.md` (PR #25).** That memo built the
translator and argued a legible schema is "the single mitigation that makes [translation error]
survivable" — but said plainly it never tested whether an entrant reading the schema would actually
catch a bug, and never gave them anything to trace a rule back to their own words. This pass does
three things: (1) makes provenance and drops visible, not just the condition/action table; (2) turns
the keytar bug into a concrete, working prose-revision loop; (3) lays out jam-rule options against
the transfer criterion above and recommends one. **The translator itself (`translator.py`) is
unchanged** — everything here is a new downstream module (`tools/jev/transparency.py`) plus one
prose file (a revision of keytar.md's Chord sentence, kept as a demo artifact, not shipped as the
new keytar.md). Because the translator's own logic didn't change, this pass did not re-run the live
Jev fidelity harness from #25 — see §4 for why that's the right call, not a shortcut.

## 1. The transparency view

`tools/jev/transparency.py` builds a `TransparencyReport` from a `TranslatedSchema` (translator.py's
output) plus the pilot's hand-labeled prose segments (`expressibility.py`, already verified
byte-for-byte against the checked-in files in #25). It adds, per rule, three things
`translator.render_markdown` didn't have:

- **Provenance** — which exact sentence(s) in the entrant's prose the rule traces back to, found by
  token-overlap against the prose's own `rule`-labeled segments (reusing the same matching primitive
  `translator.enforce_absolute_priority` already uses for the priority guard, at finer grain). If no
  segment overlaps enough, the report says so explicitly rather than forcing a weak match — an honest
  "no strong match" is more useful to an entrant checking their schema than a wrong attribution.
- **What Jev is literally asked** — the condition string *is* the `noul` question verbatim (this
  pipeline asks Jev exactly one yes/no question per rule, per `docs/prose-to-schema-translator.md`
  §2's design), spelled out with what each answer maps to.
- **Order, and why** — position in the cascade, and, for any rule the priority guard moved, the exact
  reason (unconditional-override language in the prose) instead of leaving the entrant to infer it
  from the validation-notes footer alone.
- **What was dropped, with equal visual weight to what was kept.** Every `voice` and `open_strategy`
  segment (per #25's expressibility labels) is quoted, not summarized, with a fixed reason. A third,
  new category — **`unclaimed_rule`** — flags prose that *reads* like a bounded rule but that no
  translated rule traces back to at all; this is the category most likely to be a real bug rather than
  an expected, structural loss (voice and open_strategy are expected losses; an unclaimed rule
  sentence usually isn't).

**Design choice: provenance is computed independently of the translation model, not self-reported by
it.** An earlier version of this idea considered asking the translator to also emit a `"source"`
field per rule. Rejected: that just adds one more thing the same model can get wrong or paraphrase
inaccurately, on top of the translation itself, and — more importantly — it would have required
re-running #25's whole live fidelity harness to confirm the new field didn't perturb rule quality.
Post-hoc token matching against segments *hand-labeled independently of the translator* (#25's
`expressibility.py`) is both cheaper to verify and a stricter check: if a rule can't be traced back by
matching its own words against the prose's words, that itself is informative, not just a missing
feature.

**Scope, same as #25's:** `expressibility.FILES` only has hand-labeled segments for the three real
reference pilots (`drums.md`, `keytar.md`, `violin.md`) — there's no `entrants/` directory in this
repo (see that module's docstring for why). `transparency.build_report` raises `KeyError` for any
other pilot file name unless the caller passes segments explicitly; a report built without real
hand-labeled segments would be guessing at exactly the thing this module exists to make honest.
**Update 2026-09-25:** the jam needs per-entrant reports, so `tools/jev/segment.py` now supplies
automatic word-list labels for any prose, and a report built on them says so at the top — the
entrant compile preview (`tools/jev/compile.py`, [`entrant-compile-preview.md`](entrant-compile-preview.md))
is where that happens, with the labeller's measured agreement against these hand labels.

**Update 2026-09-25 (late):** the quick-view table gains a **Branch** column (`—` for every row on a
schema with no guards, which is every live translation this pass produced — see
`docs/translator-guards-and-defaults-spec.md` §7), and each `GuardNode` gets its own "Rule detail"
subsection (what Jev is asked, source sentence, **If yes →** / **If no →** branch summaries) in place
of the plain condition/action block. `build_report` now also tries an `open_strategy`-labeled
segment against a guard node before dropping it as advisory — that's the whole reason a guard exists:
class-1 prose (§0 of the spec) is, by construction, exactly the content the hand labels call
`open_strategy`, not `rule`, so without this a guard's own source sentence could never be traced at
all. The four checked-in transparency runs referenced above were regenerated for this render shape;
`tools/jev/test_compile.py`'s byte-exact reproduction test still passes against the new fixtures.

**One real rendered rule** (from `runs/jev-translator-transparency-keytar-2026-09-23.md`, drums'
recall rule, chosen because it shows every part of the view working at once):

> ### 1. `recall_low_hp` — is this bot's current health below a quarter of its max health?
>
> - **Then:** **recall** home
> - **What Jev is asked:** Jev is asked one `noul` question, verbatim: "is this bot's current health
>   below a quarter of its max health?" -- yes means this bot's hp is less than 25% of its max hp; no
>   means this bot's hp is greater than or equal to 25% of its max hp.
> - **Order:** moved to position 1 of 5 by the automatic priority guard -- the prose uses
>   unconditional-override language for this rule, so it is checked before every other rule
>   regardless of where the translator originally placed it (see the note below).
> - **From your prose:**
>   > Recall the moment you're below a quarter health, no exceptions —

And a dropped entry from the same file, shown with the same formatting weight as a kept rule:

> ### Advisory prose Jev's question types structurally can't take
>
> decision-relevant prose that doesn't reduce to a condition on state or a bounded choice
> (patience/urgency framing, unthresholded resource judgment, continuous positioning with no discrete
> trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' type, so this
> content structurally cannot become a rule.
>
> > don't wait for a "perfect" moment, waiting is how it goes to waste.

Full rendered reports for all three real pilots are checked in:
`runs/jev-translator-transparency-{drums,keytar,violin}-2026-09-23.md`.

## 2. The keytar revision loop — a live-reproduced bug, and a working fix

**The lesson, stated plainly (this is what's meant to transfer to work, not Jev-specific):**
ambiguous modifier attachment in a sentence changes what a model does with it, and the fix is to make
the sentence's logic explicit rather than trusting a reader (human or model) to resolve the ambiguity
the way you meant.

**The specific ambiguity in keytar.md's own words:** *"Chord ... throw it at the densest cluster of
enemies or minions you can see the instant it's off cooldown."* Grammatically, "you can see" reads
most naturally as modifying "enemies or minions" — i.e., part of *which* target to pick — but the
entrant's actual intent (confirmed by every other ability rule in this file, and by drums.md's and
violin.md's parallel recall-override sentences) is almost certainly that visibility gates *whether
the rule fires at all*, not just which target it picks once it fires.

**Measured: this ambiguity is a live, reproducible translator failure, not a hypothetical.** In
informal exploratory sampling this session (12 live local translations of the unmodified file,
`qwen3.5:9b`, temperature 0.2, free/local via host Ollama — same setup #25 used for translation),
the Chord/AoE rule's trigger condition included explicit visibility wording in most runs but dropped
it entirely in at least two, e.g. `"is the cooldown of 'chord' ready?"` with no visibility or
presence check anywhere in the condition, criteria, or ability fields. In the rigorously tracked
demonstration run for this section (`tools/jev` scratch script, not checked in — the artifacts below
are what's kept), **the very first live attempt on the unmodified file reproduced it**: rule
`aoe_burst`, condition `"is the cooldown of 'chord' ready?"` (n=1 attempt to reproduce; this is not a
rate claim, just confirmation the failure is real and easy to hit).

The transparency view catches this on its own, independent of anyone reading the prose side by side:
rule 3's **From your prose** field reads *"⚠ no strong match found in the prose for this rule"* —
because a condition that only mentions cooldown doesn't share enough wording with the Chord sentence
(which is mostly about the target and the visibility clause) to be traced back to it confidently. An
entrant seeing that warning next to their headline ability has a concrete reason to go check, even
without knowing anything about the underlying bug. Full artifacts:
`runs/jev-translator-transparency-keytar-ORIGINAL-bad-compile-2026-09-23.md` (rendered) and
`runs/jev-translator-schema-keytar-ORIGINAL-bad-compile-2026-09-23.json` (raw).

**The revision** (`runs/keytar-revised-chord-trigger-2026-09-23.md`, one sentence changed, nothing
else touched) splits the ambiguous sentence into an explicit two-part trigger and a separate
target-selection instruction:

> Original: *"Chord (AoE burst, long range) is your headline move — throw it at the densest cluster
> of enemies or minions you can see the instant it's off cooldown, don't wait for a 'perfect' moment,
> waiting is how it goes to waste."*
>
> Revised: *"Chord (AoE burst, long range) is your headline move. Throw Chord only when BOTH are
> true: it is off cooldown, AND you can currently see at least one enemy or minion. The instant both
> are true, throw it — don't wait for a 'perfect' moment, waiting is how it goes to waste. Once both
> are true, pick whichever cluster of what you can see is densest as the target."*

**Measured: this reliably fixes the trigger.** 6/6 live translations of the revised sentence (same
model, same temperature, same host) produced a Chord condition explicitly requiring both clauses,
worded near-identically each time: `"is Chord off cooldown AND is at least one enemy or minion
visible?"` (4 of 6 runs used this exact string; the other two paraphrased the same two-clause AND,
e.g. `"is the 'chord' ability off cooldown AND is there at least one visible enemy or minion?"`).
Compare to run-to-run wording *instability* on the original sentence (§4.3 of #25's memo already
documented drums/violin moving by double digits run to run) — the revision didn't just fix
correctness, it visibly tightened variance too, which is itself evidence the ambiguity was the
source of some of that variance, not just this one failure mode. Artifacts:
`runs/jev-translator-schema-keytar-REVISED-good-compile-2026-09-23.{md,json}`.

**This is the loop as a practice, generalized:** entrant writes prose → reads the transparency
view → a rule shows `⚠ no strong match` or a condition that looks thinner than what they meant →
entrant rewrites the *one ambiguous sentence*, using an explicit conjunction instead of a modifier
they assumed would attach the way they meant → re-translate → the condition now visibly names both
clauses. Nothing about this loop is Jev-specific: "rewrite the ambiguous modifier as an explicit
AND" is exactly the move that fixes the same class of bug against ChatGPT, Claude, or any other
production LLM an entrant might prompt at work.

## 3. Jam-rule options

All four keep the entrant contract's existing shape (one prose `pilot.md`, no code) — none require
a `jamobair-entrants` validator rewrite, per §6 option 2's concern in the earlier research memo.
Scored against Ceryce's stated criterion: **does the practiced skill transfer to a job where Jev
doesn't exist?**

| | **A. Prose-only, schema shown (read-only)** | **B. Prose + one mandatory revision round** | **C. Hybrid: chat model and Jev both run the prose** | **D. Jam stays on chat model; Jev is a side exhibit** |
|---|---|---|---|---|
| **What entrants practice** | Prompt writing, same as today; the compiled view is available but nothing requires them to act on it. | Prompt writing, then reading a compiled decision table and rewriting ambiguous wording against it — the keytar loop, for real, under time pressure. | Prompt writing, same as today; comparison is a spectacle, not something entrants must engage with. | Prompt writing, unchanged. |
| **Transfers to work?** | High, but the disambiguation lesson likely goes unpracticed by anyone who doesn't dig in unprompted. | **Highest** — "write a prompt, see what a model actually does with it, tighten the wording" is the literal professional loop, model-agnostic. | Same as A — the comparison itself doesn't force any new skill. | Full — identical to the jam as already run once. |
| **Extra effort for Ceryce** | Moderate: wire the transparency renderer into the submission flow, one-way. | Higher: needs a two-phase submission (draft → shown schema → locked revision → final), plus a firm deadline for the revision window. | Highest: doubles match infra (two backends per pilot) and raises "which run counts for the bracket" as an open question. | Lowest of any Jev-touching option: no changes to the entrant pipeline at all; a demo booth using what's built here. |
| **Main risk** | The core lesson (disambiguate your grammar) stays optional and may not land for most entrants. | Adds a required step and deadline to event logistics; needs a rule that the revision may only tighten wording, not rewrite from scratch, or it stops being the same exercise. | Doesn't teach the lesson at all unless entrants proactively investigate; scoring ambiguity risks controversy. | Doesn't test Jev at jam stakes/scale — the technical question from the earlier memo (`docs/jev-decision-model-research.md` §6) goes unanswered again. |

**Recommendation: B**, with **D as the fallback** if there isn't organizer bandwidth to build the
two-phase submission flow before 2026-10-02. B is the only option whose core mechanic *is* the
transferable skill Ceryce named — using Jev's rigidity as the thing that makes an ambiguous sentence's
consequences visible and forces the fix, rather than as a cosmetic backend swap. It keeps the win
condition simple (one final prose file per entrant, same downstream judging infra), keeps the entrant
contract's shape intact, and turns the keytar bug from a footnote in a research memo into the day's
actual teaching moment. The cost is real — a second submission phase and a hard deadline for the
revision window, and a rule limiting the revision to wording tightening (not a fresh draft) so it
stays the exercise it's meant to be — but it's bounded, not open-ended.

## 4. What's measured, what's inferred, and why nothing here needed a live Jev re-run

**Measured, this pass, $0.00 Jev spend (budget was $1.00):** everything in §1 and §2 above — the
transparency report's structure and its rendered outputs for all three real pilots; the keytar
bug's live reproduction (n=1 attempt, immediate); the revision's fix rate (6/6 live translations).
All of it is translation-only (`qwen3.5:9b` via host Ollama, free/local) — **no Jev call was made for
this task at all**, and that's a deliberate scope call, not an oversight: `translator.py`'s own logic
is byte-for-byte unchanged (`transparency.py` is a new, purely additive module that reads a
`TranslatedSchema` after the fact), so #25's live fidelity numbers (`runs/jev-translator-fidelity-
2026-09-23.json`, run B: 38.9% kind_agreement; §4.4's prose-fidelity split: 63.9% translator vs.
47.2% qwen-on-prose) still describe exactly what ships. The task brief says to re-run the fidelity
eval *if the translator changes* — it didn't, so re-running would have spent budget re-measuring a
number that can't have moved, not validating new work. The one file that did change,
`keytar-revised-chord-trigger-2026-09-23.md`, is kept as a demo artifact under `runs/`, not as a
replacement for `prompts/pilots/keytar.md` — the real keytar.md is untouched, matching this task's
"don't touch arena Backend/model_server/sim code, and don't run matches" boundary read broadly (no
change to what any pilot file, live match, or scoring path does).

**Inferred:** that the `unclaimed_rule` dropped-content category will, in practice, correlate with
real translation bugs more than with translator idiosyncrasy — this pass observed one strong instance
(the keytar Chord bug) but did not run a controlled study across many pilots to confirm the general
rate. That a mandatory one-round revision window (option B) is enough exposure for most entrants to
internalize "check the compiled view, fix ambiguous wording" — untested with real entrants, same
caveat #25's memo already carried for whether anyone reads the schema at all.

**What would raise confidence before betting a jam on this:** a handful of held-out entrant-style
prose files (ideally sourced with permission from `jamobair-entrants`) run through the transparency
view cold, to see whether the `unclaimed_rule` flag and the "no strong match" warning actually
correlate with bugs a human reviewer would also flag, rather than firing on stylistic noise; and a
small real trial of option B's revision round (even 3-4 volunteer writers, one revision cycle each)
to see whether the loop demonstrated here in one file generalizes to prose nobody on this project
wrote.

## Sources

- This repo: `tools/jev/transparency.py` (new), `tools/jev/test_transparency.py` (new, 10 tests, no
  live calls); `tools/jev/{translator,expressibility,scenarios}.py` (existing, read and reused, not
  modified); `docs/prose-to-schema-translator.md` (§2, §4.2 — this memo extends both);
  `docs/jev-decision-model-research.md` §6 (the entrant-contract options this memo's §3 responds to
  directly); `prompts/pilots/{drums,keytar,violin}.md` (unmodified).
- New artifacts, this pass: `runs/jev-translator-transparency-{drums,keytar,violin}-2026-09-23.md`
  (transparency reports for the three real pilots, unmodified prose); `runs/keytar-revised-chord-
  trigger-2026-09-23.md` (the one-sentence prose revision, demo only, not the shipped keytar.md);
  `runs/jev-translator-transparency-keytar-ORIGINAL-bad-compile-2026-09-23.md` (rendered) and
  `runs/jev-translator-schema-keytar-ORIGINAL-bad-compile-2026-09-23.json` (raw) for the
  live-reproduced bug; `runs/jev-translator-schema-keytar-REVISED-good-compile-2026-09-23.{md,json}`
  for the fixed compile.
