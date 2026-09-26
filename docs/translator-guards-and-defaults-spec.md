# Translator guard trees, layered defaults, and the numeric tracer — spec

*Ceryce, 2026-09-25 ~22:05 CT, following up on `docs/translator-transparency.md`'s 63.9% prose-fidelity
number (23/36, `runs/jev-prose-fidelity-2026-09-23.json`): the 2026-09-25 entrant-compile reports
(`runs/entrant-compile-{drums,keytar,violin}-{ollama,openrouter}-2026-09-25.md`) show three concrete
failure classes on top of that baseline. This memo specs the fix for all three and reports Phase 0's
result — the calibration check that gates whether the guard-tree design (class 1) is worth building at
all. **It does not build the guard tree or the default-ordering logic** — those are gated on this spec
and on Phase 0, per the brief. Phase 3 (the numeric tracer, class 3) is small, deterministic, and
low-risk enough that it is built and shipped in this same change; see §4.*

## 0. The three failure classes, with the real evidence

| # | Class | Ceryce's ruling | Real example |
|---|---|---|---|
| 1 | Advisory/gating prose Jev's types can't hold | Guard questions around inner rules — a flat first-match list becomes a tree | violin.md: *"you only take fights you can win in one phrase"*; keytar.md: *"don't wait for a 'perfect' moment"*; violin.md: *"it is not free, so don't burn it just because it's up"* (Solo); violin.md: *"keep repositioning toward the next isolated target"*; drums.md: *"Walk in front. Take the hits meant for someone else."* |
| 2 | Real default rules dropped | Add them as fallback/default rules; open question is ordering | keytar.md: *"Poke minion waves with your basic attack while nothing else demands attention"*; drums.md: *"Push the lane. march toward the enemy nexus alongside your minions unless a fight has started"* |
| 3 | Tracer false alarms | Normalize prose into a numbers-not-number-words form, for the trace check only | *"below a quarter health"* doesn't token-overlap with a rule worded *"below 25% of max"* |

Class 1 and class 2 are different bugs with different fixes, and it matters that they stay separate:
class 1 is prose that genuinely cannot become a single `noul` condition (it's a *judgment*, not a
fact about state) and needs a new schema shape (the tree, §2). Class 2 is prose that already fits the
existing shape — an unconditional fallback action — but the current translator either invents an
unrelated condition for it or drops it as `unclaimed_rule` because it has no condition to trace by
overlap in the first place (an unconditional sentence shares no "if/when/below" vocabulary with
anything). §3 specs how multiple such defaults nest and order. Class 3 is a pure string-matching gap
in the *existing* provenance/priority-guard machinery, unrelated to schema shape, and is built now
(§4).

## 1. What's measured vs. assumed in this document

**Measured, this pass:**
- Phase 0's guard-noul calibration (§2.4): a real, live Jev call against real synthetic states, scored
  against a real (if small) ground truth.
- The three failure-class examples in §0's table: real prose, real checked-in compile output
  (`runs/entrant-compile-*-2026-09-25.md`), not invented illustrations.
- The number-normalizer (§4): real code, real tests, wired into the existing trace/provenance path
  and verified against the full existing test suite (`tools/jev/test_*.py`, 269 tests;
  `npm run test:arena`, 96 tests — see §6).

**Assumed / not yet measured, flagged as such throughout:**
- The tree schema (§2) and default-ordering rules (§3) are **designed, not implemented or measured**.
  No live fidelity number exists yet for either. §2.4's calibration is necessary-but-not-sufficient
  evidence that guards are worth building; it is not a measurement of the tree itself, which doesn't
  exist yet.
- The "two defaults at the same level" tie-break (§3.3) is specified for a case **none of the three
  reference pilots actually contains** — flagged explicitly where it's introduced, not measured
  against real prose.
- Whether the guard-tree design, once built, actually moves the 36-scenario prose-fidelity number
  from 63.9% past 80% is an open question this spec does not answer. §5 says exactly what would need
  to be measured, and how, to find out.

## 2. The guard-question tree

### 2.1 Why a flat list can't hold class-1 prose

The shipped translator (`translator.py`) produces one flat, ordered list of `{condition, action}`
rules plus one `default_action` — first `noul` that answers "yes" wins
(`fidelity_harness.run_prediction`, mirroring `rules.first_match`). Every condition in that list has
to be a single yes/no fact about the current `Observation` ("is hp below a quarter of max?", "is an
enemy within melee range?"). Violin's *"you only take fights you can win in one phrase"* doesn't fit
that shape: it isn't one fact about the state, it's a **verdict** that should change which *set* of
rules even applies — if the fight is winnable, the opener/ultimate rules matter; if it isn't, a
completely different set (wait, reposition, don't engage) should be checked instead. Forcing this into
one more flat `noul` alongside "is Staccato off cooldown?" throws away the fact that it's supposed to
*gate a whole sub-strategy*, not compete with unrelated rules for first-match position.

### 2.2 Schema shape

A **guard** is a new kind of node that answers one `noul` question and, depending on the answer, hands
control to one of two **cascades** — an ordered sub-list of nodes with its own optional local default
(§3). A **cascade** is the generalization of today's flat `rules` list:

```
Cascade := { "nodes": [Node, ...], "default": Action | null }
Node    := RuleNode | GuardNode
RuleNode  := { "type": "rule",  "id": str, "condition": str, "criteria": {true, false}, "action": Action }
GuardNode := { "type": "guard", "id": str, "condition": str, "criteria": {true, false},
                "then": Cascade, "else": Cascade }
Action  := { "kind": one of ACTION_KINDS, "ability": str|null, "target_selector": str|null }   # unchanged from today
```

`TranslatedSchema.rules: list[TranslatedRule]` becomes `TranslatedSchema.root: Cascade`. A pilot with
no class-1 prose translates to a `root` whose `nodes` are all `RuleNode`s and whose `default` is the
same `default_action` shipped today — **the flat case is a Cascade with zero guards, not a different
code path.** This is a compatibility property, not just a convenience: `parse_schema`,
`enforce_absolute_priority`, and every existing test that only ever sees flat rules keeps working
unchanged against a `root` with no `GuardNode`s in it.

**Evaluation stays one systemone call per decision.** Every node's condition anywhere in the tree
(root rules, every guard, every branch's rules) is collected into one flat list of `noul` questions
up front, exactly like today's per-rule batching — Jev answers all of them in parallel, in one call,
regardless of which branches turn out to matter. The tree-walk that turns those answers into one
action is Python, after the call returns, same posture as `rules.first_match` and
`fidelity_harness.run_prediction` today. This preserves the cost profile: a tree with N total
conditions costs the same one call as a flat list of N conditions costs today (§2.4's calibration,
3 guard wordings × 12 scenarios, cost $0.000328 total — guards are not more expensive to ask, only
different in what happens with the answer).

**Walk order, depth-first, first-true-wins within a cascade:**

```
def evaluate(cascade, answers):
    for node in cascade.nodes:
        if answers[node.id] is True:
            if node.type == "rule":
                return node.action
            branch = evaluate(node.then, answers)
            if branch is not None:
                return branch
            return cascade_default(node.then)   # see below — NOT a fall-through to the next sibling
    return cascade_default(cascade)

def cascade_default(cascade):
    if cascade.default is not None:
        return cascade.default
    return None   # escalate to the parent cascade's default — see §3.1
```

**Decision, stated explicitly because it isn't obvious:** once a guard's own condition answers
`True`, evaluation commits to that branch. If nothing in the branch fires and the branch has no local
default, evaluation does **not** fall back to the guard's own siblings in the parent cascade — it
escalates to the nearest enclosing default (§3.1). The alternative (treat an all-false branch as if
the guard itself had answered "no", and keep checking siblings) would make a guard's answer
non-binding, which defeats the reason a guard exists: violin's "can this bot win" question is supposed
to *partition* the decision space, not just add one more competing condition.

**The priority guard (`enforce_absolute_priority`) is unchanged in scope: it only ever reorders
`root.nodes`.** An unconditional-override sentence ("no exceptions", "no matter", …) means "before
everything else, period" — the correct place for that is position 0 of the *root* cascade, checked
before any guard's own condition, which already guarantees it fires before anything nested inside any
branch could. `enforce_absolute_priority` does not need to search inside guard branches for this
reason, and — flagged as a real, currently-unhandled edge case, not silently assumed away — if the
translator mis-nests an override rule inside a guard's branch instead of the root, today's matching
(root-only) will not find it there and will raise `SchemaValidationError` (no matching rule at the
root), the same "missing override, don't ship it" behavior it has today for a fully dropped rule. That
is a safe failure (loud, not silent), but it is a case this spec defers to Phase 1 implementation
rather than solving here.

### 2.3 Rendering: `render_markdown` and the transparency view

**Quick-view table.** Today's flat `| # | Condition | Then |` table gains a **Branch** column so a
guard's two branches are visible without expanding anything, and a guard's own row points at its
branches by number instead of naming an action:

| # | Branch | Condition | Then |
|---|---|---|---|
| 1 | — | is this bot's hp below a quarter of its max? | **recall** home |
| 2 | — | *(guard)* can this bot win the fight it's in? | → 2a if yes, 2b if no |
| 2a | if guard 2 = yes | is Staccato off cooldown and a target in range? | use **staccato** |
| 2b | if guard 2 = yes, none of 2a matched | *(guard 2's own "yes" default)* | **move** toward the chosen target |
| 2c | if guard 2 = no | *(guard 2's own "no" default)* | **move** targeting: the farthest isolated visible enemy |
| — | — | *(none of the above — root default)* | **hold** |

**Rule detail.** Each `GuardNode` gets its own subsection, same shape as today's per-rule detail
(`transparency.render_report_markdown`'s `## Rule detail`), but naming both branches and, for each,
either its rules (rendered exactly like today's per-rule blocks, nested one level) or its local
default with the same "no strong match" honesty today's rules have when nothing traces to it. A
worked mock-up, using violin's real guard (Phase 1 would render this from a real translation; this is
hand-built to show the shape):

> ### 2. `can_win_fight` — can this bot win the fight it's in?
>
> - **What Jev is asked:** Jev is asked one `noul` question, verbatim: "can this bot win the fight it
>   is currently in or about to enter, by itself, right now?" — yes means a winnable target is
>   present; no means it isn't.
> - **From your prose:**
>   > you only take fights you can win in one phrase.
> - **If yes →** (2a) is Staccato off cooldown and a target in range? → use **staccato**; else (2b,
>   this branch's own default) **move** toward the target picked above.
> - **If no →** (2c, this branch's own default) **move** targeting: the farthest isolated visible
>   enemy — *"keep repositioning toward the next isolated target"*.

**Dropped section, unchanged in kind.** Prose that's advisory even after the guard fix (Solo's *"it is
not free, so don't burn it just because it's up"* — a resource judgment with no stated threshold, not
resolved by adding a guard) still shows up under "Advisory prose Jev's question types structurally
can't take," with the same reason text as today. **The guard-tree design narrows class 1, it does not
eliminate it** — some of what's currently dropped as `open_strategy` becomes a guard-gated rule
(fights you can win / can't), and some genuinely stays advisory (resource judgments with no named
threshold, continuous positioning with no discrete trigger beyond "the next isolated target," which
§3's default-binding already covers). Overstating how much class 1 shrinks would be exactly the kind
of false precision this whole transparency effort exists to avoid.

### 2.4 Phase 0 — the guard-noul calibration (measured, this change)

**Question:** can Jev answer a *judgment* guard question — not a state-presence/threshold fact, but
the same strategic call the pilot author was making — well enough to gate a sub-cascade on it? If not,
the tree design in §2.2–2.3 is moot regardless of how well it's built.

**Method** (`tools/jev/guard_noul_calibration.py`): three wordings of violin's guard
("can this bot win the fight it's in", "should this bot commit fully", "is a beatable target
visible") asked together in one `systemone` call per scenario, against all 12 of `scenarios.py`'s
synthetic `Observation`s built for `violin` (the same states `fidelity_harness.py` already uses).
Scored against violin's own prose-derived ground-truth labels
(`runs/prose-ground-truth-violin.json`, #25 §4.4) on the 4 scenarios where that label is unambiguously
"commit" (`ability`) or "don't commit" (`hold`); the other 8 scenarios' labels are `move`/`recall`
(closing distance on an already-picked target, or overridden by the health rule) and aren't about this
guard, so they're recorded but not scored.

**Result, live, `runs/guard-noul-calibration-2026-09-25.{md,json}`:**

| | Result |
|---|---|
| Main wording (`guard_can_win`) vs. prose labels | **4/4 (100%)** |
| Majority vote across 3 wordings vs. prose labels | **4/4 (100%)** |
| All 3 wordings agreeing with each other, all 12 scenarios | **4/12 (33.3%)** |
| Cost | 7,814 input tokens, $0.000328 |

**Reading this honestly.** n=4 is small — one scenario is 25 points, and a perfect score on 4 cases is
real evidence for *this specific wording, on these specific states*, not proof the design generalizes.
The more load-bearing number is the third row: the three wordings agreed with each other on only 4 of
12 scenarios overall. `guard_favorable_target` ("is there a beatable target visible") is a softer
question than `guard_can_win`/`guard_commit_now` and Jev answered it that way — "yes" far more often,
including on scenarios with no fight in progress at all
(`ability_on_cooldown_enemy_present`, `softest_target_selection`). **A guard-tree cascade commits to
one wording per guard and lives with it every decision for the rest of the match; this run shows that
choice is not interchangeable.** The headline pass (§2.4's 100%/100%) is a green light to proceed to
Phase 1 for *this exact wording pattern* — not a blank check to phrase any future guard however the
translator happens to generate it. **Phase 1 should re-run this same calibration shape (small,
cheap — $0.0003 this run) against whatever wording the translator actually produces for a given
pilot's guard, before trusting that guard's answers**, rather than assuming Phase 0's result transfers.

**What this does not test:** whether the *translator* (the LLM step that turns prose into a schema)
can reliably recognize class-1 prose and phrase a good guard condition for it in the first place. §2.4
only tests whether Jev can answer a *given* guard question well — a necessary precondition, not the
whole risk. That's Phase 1's job to measure.

## 3. Default ordering

### 3.1 The rule

**A default binds to the innermost enclosing guard branch it was written for, becoming that branch's
own trailing default — checked only after every explicit rule in that branch, before escalating
anywhere else.** The schema's single `root.default` remains the outermost, last-resort fallback for
the whole tree — used only when the root cascade's own rules/guards all fail *and* every guard branch
actually entered along the way also had no local default of its own. This is Margo's proposed rule,
adopted as specified: it means an entrant's "while nothing else demands attention, do X" and "if the
fight is unwinnable, do Y instead" don't compete with each other or get flattened into one global
catch-all — each stays scoped to where the entrant wrote it.

**Escalation, concretely, for the tree in §2.2's example:** if branch 2a (guard 2 = yes) has no rule
fire and no local default, evaluation does not fall through to sibling node 3 or to `root.default` —
it stops at 2's own "yes" branch's default if one exists. If guard 2's "yes" branch has genuinely no
default at all (not even one derived from advisory prose), only then does it escalate to `root.default`.
A default is never "skipped" silently past a level that has one.

### 3.2 Worked example — violin, a full tree with three defaults at three levels

Violin's prose gives three fallback-shaped statements, at three different scopes:

1. Root level (implicit): nothing in violin's prose reads as a lane-push default the way drums'/
   keytar's do — violin explicitly isn't a lane-pusher ("keep repositioning... rather than sitting in
   a lane pushing minions like a bruiser would"). Root's own `default` is therefore the safest literal
   reading: `hold` (scout/wait), not `push_lane`. This is flagged in `runs/prose-ground-truth-
   violin.json` itself as an ambiguous judgment call (`empty_lane_push`/`minion_wave_poke`'s
   rationale) — the guard-tree design does not resolve that ambiguity, it just gives it a concrete,
   labeled home (`root.default`) instead of leaving it implicit in whatever the translator happens to
   invent.
2. Guard 2's "yes" branch (can win) local default: *"closing distance on a target that's about to get
   away"* — when the opener/ultimate rules don't fire (out of range, on cooldown) but the fight is
   still judged winnable, move toward the chosen target rather than falling all the way to root's
   `hold`. This default is scoped to *inside* "can win" — it should never fire when the guard itself
   said no.
3. Guard 2's "no" branch local default: *"keep repositioning toward the next isolated target"* — the
   literal text of the class-1 sentence that motivated building the guard in the first place. This
   maps cleanly onto the existing `isolated_enemy` target selector plus `move`, with no new
   vocabulary needed (§2.3's worked mock-up).

**Why this is the right worked example, not a convenient one:** it shows a default existing at every
level the schema has (root, then-branch, else-branch), each traceable to a different sentence, none of
which the flat translator can currently place correctly — today it either invents an unrelated
condition for the "no fight" fallback or drops the "keep repositioning" line as `open_strategy`
(§0's table). The tree doesn't just hold class-1 content — it's what makes class-2 ordering coherent
once class-1 exists.

### 3.3 Two defaults at the same level

**Not observed in any of the three reference pilots** — flagged here as a designed-for case, not a
measured one, because a real entrant's prose (broader and less curated than three house-written
files) can plausibly contain it. If two default-shaped sentences are found at the same cascade level
with no guard distinguishing them, the rule is: **prose order is the tiebreak (the sentence appearing
earlier in the file wins the position), and the transparency view flags both explicitly** — *"these
two sentences both read as this branch's default; the earlier one was used — check this by hand"* —
rather than the translator silently picking one. This matches the standing design principle
(`docs/prose-to-schema-translator.md` §2, `translator-transparency.md` §1): an honest "I had to guess"
is more useful to an entrant than a confident wrong answer, and cheaper to build than resolving the
ambiguity automatically would be.

**Illustrative (not real) example**, to make the rule concrete: if a pilot's prose read, in separate
paragraphs, *"When nothing else is going on, poke the wave"* and, elsewhere, *"If nothing else is
happening, advance down the lane,"* both are default-shaped at the root level with no guard between
them. Per the rule above: "poke the wave" wins the position (it appears first), "advance down the
lane" becomes `root.default`'s *reported alternative* in the transparency view's flag, and the entrant
sees both quoted with a note that they read as competing defaults.

## 4. The numeric tracer (built and shipped in this change)

**Problem, measured:** `translator.enforce_absolute_priority`'s paragraph matching and
`transparency.py`'s finer-grained rule-provenance matching both work by token overlap
(`translator._tokenize`/`_rule_tokens`/`_match_rule_for_paragraph`, reused by
`transparency._best_match`). Prose phrased as *"below a quarter health"* shares zero tokens with a
rule condition phrased numerically as *"below 25% of max"* — "quarter" and "25" are different strings
— so a correct translation can show up as `⚠ no strong match found in the prose for this rule` purely
because of word choice, not because the translation is actually wrong. This is exactly the false-alarm
risk named in the task: an entrant sees a warning next to a rule that is, in fact, a faithful
translation of their own sentence.

**Design (`tools/jev/number_normalize.py`):** a fixed, deterministic lookup table — not an LLM call —
applied only inside the trace/overlap tokenizer (`translator._tokenize`, which both
`enforce_absolute_priority` and `transparency.py` already import and use), never to the prose an
entrant reads (`render_markdown`/`render_report_markdown` still quote the original text verbatim).
`quarter`→`25`, `half`→`50`, `three-quarters`→`75`, and the digit words `zero`–`ten`/`hundred` are
normalized; the result is idempotent and case-insensitive.

**Non-quantity exclusions, the part that has to be right or the fix causes new false matches:**
- **Ordinals are excluded entirely, not just special-cased.** `first`/`second`/`third`/`last` never
  appear in the word→digit table at all. Two real pilots use them for priority/sequence, not a
  count: keytar.md's *"Chord first, basic-attack second, never melee"* and drums.md's *"...
  threatening an ally first, the nearest enemy bearbot second, minions last."* `third` specifically is
  excluded even as a fraction word (1/3) because it is ambiguous with the ordinal on its own, and
  neither real pilot uses it as a fraction — excluding it is safer than guessing from local context.
- **A fixed idiom-exclusion list** (`NON_QUANTITY_PHRASES`) protects number words inside specific
  phrases from substitution, checked before word-level replacement: violin.md's *"you only take
  fights you can win in one phrase"* — "one phrase" means a single exchange, not a countable quantity,
  and normalizing it to "1 phrase" would risk a spurious match against an unrelated rule that
  legitimately mentions the count 1 (e.g. "exactly one enemy is isolated").

**A real bug this surfaced and fixed during implementation, not a hypothetical:** normalizing
`quarter` → `25` initially *broke* the recall rule's own provenance match
(`test_transparency.py::test_recall_rule_traces_to_its_source_sentence`), because
`transparency._significant` drops any token shorter than 3 characters to avoid spurious short-word
ties (`it's` → `it`, `s`) — and `"25"` is 2 characters, so the very token the normalizer exists to
produce was being filtered out downstream. Fixed by exempting pure-digit tokens from that length
filter (`transparency._significant`, `t.isdigit()`), since a short numeric threshold is exactly the
signal being normalized for, not noise. Caught by the existing test suite, not by manual inspection —
worth naming as a concrete demonstration of why "wire a new normalizer into two files, read only the
new file's diff" is not enough; the full suite (§6) is what caught it.

**Known gap, stated plainly:** no semantic inference. *"more than one of them is bunched up"* (drums'
Fill trigger) does not become "≥2" — the normalizer maps `one`→`1` and stops there; it does not know
"more than one" implies a threshold of 2. This is a real, currently-unclosed gap in class 3, separate
from the quarter/half case it does close.

## 5. What "80%" is measured against

**Same 36-scenario harness, same metric, same baseline.** The target is `docs/prose-to-schema-
translator.md` §4.4's prose-fidelity number: 3 pilots × 12 scenarios (`scenarios.py`, unchanged),
scored per-pilot against each pilot's own prose-derived ground-truth labels
(`runs/prose-ground-truth-{drums,keytar,violin}.json`), via `tools/jev/prose_fidelity_report.py`
against a fresh `fidelity_harness.py --live` run. Current baseline: **23/36 (63.9%)**. "Fix at least 6
of the 13 misses" means **29/36 (80.6%) or better** — the next whole-scenario step below is 28/36
(77.8%), so 29 is the first passing count, not a rounding convenience.

**What this spec does not change about the metric itself:** the comparison stays kind/ability/target
agreement against the same hand-labeled prose ground truth, at the same n=36 (one scenario = 2.8
points, same caveat #25's memo already carries). A guard answering correctly still has to produce the
same right *action* as today's metric checks for — the tree changes how the action is derived, not
what "correct" means.

**Recommended addition, not yet built:** a per-guard diagnostic breakdown (which guard nodes existed,
what they answered, whether that matched a prose-derivable expectation), generalizing
`guard_noul_calibration.py`'s scoring across all three pilots' guards once Phase 1 exists. Without it,
a regression specifically in guard accuracy could hide inside an unchanged aggregate kind_agreement
number the same way §4.3's run-to-run variance already showed aggregate numbers can mask what's
actually moving. This is scoped as part of Phase 4 below, not built in this change.

## 6. Phases

| Phase | What | Status |
|---|---|---|
| 0 | Guard-noul calibration (§2.4) — measure whether Jev can answer a judgment guard question before writing any tree code | **Done, this change.** 4/4 (100%) main wording and majority vote; 33% cross-wording unanimity flagged as a real design constraint. `runs/guard-noul-calibration-2026-09-25.{md,json}`. |
| 1 | Implement the tree schema (§2.2) in `translator.py`: `Cascade`/`RuleNode`/`GuardNode` dataclasses, tree-walk evaluation, translation-prompt changes so the model can emit a guard for class-1-shaped prose. Re-run Phase 0's calibration shape against the translator's *actual* guard wording per pilot before trusting it (§2.4). | **Built and tested, 2026-09-25 late.** `Cascade`/`GuardNode`/`evaluate_cascade`/`collect_nodes`/`display_rows`, full backward compatibility (all 269 pre-existing tests pass unmodified). **The re-calibration step could not run**: qwen3.5:9b (`think:false`, matching the shipped translator) produced zero guards across 6 live attempts on violin.md (the clearest class-1 pilot), across two prompt variants including a worked JSON example — see §7. |
| 2 | Implement default ordering (§3) in `translator.py`/`transparency.py`: innermost-branch binding, root escalation, same-level tie-break plus the transparency flag (§3.3). | **Built and tested, 2026-09-25 late.** Innermost-binding/escalation were structural properties of Phase 1's `Cascade.default` (`EvaluateCascadeTests`); `resolve_default_tie` implements §3.3's tie-break, tested against the spec's own illustrative example -- not wired into `translate_pilot`/`parse_schema` (no real pilot has this shape, and the wire format needs a translation-time detector this pass didn't build). |
| 3 | Numeric tracer (§4) | **Done, this change.** `tools/jev/number_normalize.py`, wired into `translator._tokenize`, 10 new tests (`test_number_normalize.py`) plus the `transparency._significant` fix it required; full existing suite still green (269 Python tests via `npm run test:tools`, 96 Node tests via `npm run test:arena`, run 2026-09-25). |
| 4 | Re-run the 36-scenario prose-fidelity harness (§5) with Phases 1–3 shipped; confirm ≥29/36 or report the honest shortfall; add the per-guard diagnostic breakdown. | **Measured live, 2026-09-25 late — falls short.** Two live runs both landed at **17/36 (47.2%)**, below the 63.9% (23/36) baseline and well short of the 29/36 (80%) target, a 12-scenario shortfall. Zero guards fired in either run (per §7, the translator never emitted one). Per-guard diagnostic breakdown (`fidelity_harness.guard_diagnostics`) is built and tested; it reports `{}` for every pilot this run since none produced a guard. See §7 for the honest read. |
| 5 | Update `docs/prose-to-schema-translator.md`, `docs/translator-transparency.md`, `docs/entrant-compile-preview.md` for the new schema shape; re-run live entrant-compile smoke checks for all three reference pilots (`tools/jev/test_compile.py`'s byte-exact reproduction test will need new checked-in fixtures once the schema shape changes). | **Done, this change.** Docs updated with dated addenda; fixtures regenerated for the Branch-column render shape; live entrant-compile smoke checks re-run for drums/keytar/violin (§7). |
| 6 | Controlled A/B (§8, 2026-09-26): is §7's 47.2% shortfall caused by the guard-aware prompt itself, or ordinary model variance? Old prompt (Arm A) vs. new prompt (Arm B), same harness, 4 interleaved live runs each. | **Measured live, 2026-09-26.** Arm A mean 61.8% (range 58.3–69.4%, reproduces the 63.9% baseline); Arm B mean 49.3% (range 41.7–58.3%) — a real, if noisy, 12.5-point drop concentrated almost entirely in keytar. Harness-parity cross-check confirmed this branch scores a flat schema identically to `develop`'s. See §8 for full detail and the recommendation. |

## 7. What Phases 1, 2, and 4 actually measured (2026-09-25 late, following up on §0–§6 above)

**The guard tree is built and correct, verified against hand-built fixtures — but qwen3.5:9b
essentially never chooses to use it.** `translator.py` now has `Cascade`/`GuardNode`, a completed
`evaluate_cascade` (the spec's own §2.2 pseudocode only ever recurses into a guard's `then` branch,
never `else` — literally read, it can never produce the "no" branch's action at all, which
contradicts §3.2's own worked example; implemented here as a guard always committing to one of its
two branches, symmetrically, and tested at every escalation depth), and rendering/transparency
support for the Branch column and guard subsections from §2.3. All backward-compatible: the full
pre-existing 269-test suite passed unmodified throughout.

**Live guard emission, measured:** the translation prompt describes the guard option in prose and,
after the first attempt produced zero guards, gained a worked JSON example of exactly the shape
violin.md's "you only take fights you can win" should produce. Both versions were tried live against
violin.md, `qwen3.5:9b`, `think:false` (matching the shipped translator's own setting) — **0 of 6
attempts (3 per prompt version) produced a guard node.** A quick diagnostic (`think:true` on the same
prompt) shows why enabling reasoning isn't a cheap fix: the model spent its entire 4,000-token budget
in `<thinking>` and produced zero output tokens (`done_reason: "length"`), so this would need a much
larger, slower, and more expensive call, not a one-line config flip. **Read honestly: whether the
*translator* can reliably recognize class-1 prose and choose to phrase a guard for it — §2.4's own
stated scope note, "this is Phase 1's job to measure" — comes back negative for this exact model and
prompt.** The guard-tree machinery itself is not shown to be wrong; it has simply not yet been
exercised live by anything past a hand-built test fixture.

**36-scenario live fidelity, measured, twice:**

| | run 1 | run 2 |
|---|---:|---:|
| drums vs. prose | 41.7% (5/12) | 66.7% (8/12) |
| keytar vs. prose | 33.3% (4/12) | 8.3% (1/12) |
| violin vs. prose | 66.7% (8/12) | 66.7% (8/12) |
| **overall** | **47.2% (17/36)** | **47.2% (17/36)** |

Both runs used the same guard-aware translator on the same three pilots and landed on the identical
overall count by a different per-pilot route (keytar collapsed in run 2 where it had been mid-pack in
run 1) — the same kind of run-to-run instability `docs/prose-to-schema-translator.md` §4.3 already
documented for `qwen3.5:9b` at temperature 0.2 (drums and violin moved by double digits between runs
A and B there too), not a new phenomenon this change introduced. **Neither run reaches the 63.9%
(23/36) baseline, let alone the 29/36 (80%) target — a real, measured shortfall, not a rounding
artifact.** Zero guards fired in either run, so none of this shortfall is guard-specific; it is
ordinary flat-rule translation quality, the same class of variance already on record.

**Best read of why, stated as a hypothesis, not a confirmed cause (no controlled ablation was run —
that would need a third live run on the OLD, pre-guard prompt, which this pass didn't budget for):**
the guard-related prompt additions (a new paragraph plus a worked JSON example) make the translation
prompt meaningfully longer without ever being used by this model, which may be diluting the
instruction density around ordinary rule quality for pilots that end up producing none. This is
plausible, not proven; it is reported as a hypothesis precisely so it isn't quietly used to justify
shrinking the guard prompt without measuring the effect first (the same overfitting risk this spec
already flags for prompt changes made after seeing harness numbers). **This spec's prompt was
finalized before any harness run in this pass — no prompt edits were made after seeing the 47.2%
number**, so the shortfall is reported as-is rather than chased.

**Concrete per-scenario misses (run 1), for the record:** drums missed `empty_lane_push`,
`melee_range_enemy_ability_ready`, `ranged_enemy_far`, `ally_under_threat`,
`isolated_vs_grouped_enemy`, `enemy_tower_only`, `minion_wave_poke` — several against a spurious
extra `hold` rule (`"is there a valid target to interact with?"`) the translator invented instead of
using `default_action` for the same purpose. keytar missed 8 of 12, most through an overbroad
"avoid melee/attack range" rule pre-empting ability rules the prose calls for — the same shape of
bug §4.2 diagnosed before the priority guard existed, on a different rule this time. violin missed 4
of 12, mostly `move` where `ability`/`hold` was called for — the same "move toward" vocabulary gap
§4.3 already named as a structural, not guard-related, limitation.

**A second, real bug the guard prompt introduced, found live and mitigated (not just theorized):**
`qwen3.5:9b` sometimes named a rule `guard_<something>` (leaking the new concept's vocabulary) while
still emitting a plain-rule `action` with no `"kind"` — neither a valid rule nor a valid guard, and
every one of `translate_pilot`'s 3 retries repeated the same mistake. Measured on `violin.md` (the
pilot whose prose most invites a guard): **6 of 17 live compiles failed this way before a fix
(≈35%)**, with zero such failures on `drums.md`/`keytar.md` across the same batches. The prompt now
explicitly forbids a `"guard_"`-prefixed id without the full `type`/`then`/`else` shape, and the retry
message names the exact failure instead of a generic "failed to parse". Measured after: **1 of 21
failed the same way (≈5%)** — reduced, not eliminated, and reported as a residual risk rather than a
closed one. Full detail and the checked-in sample batch: `docs/entrant-compile-preview.md`'s
2026-09-25 (late) update.

## 8. The A/B: is the 47.2% shortfall guard-specific? (measured, 2026-09-26)

**Ceryce's ruling, 2026-09-26 00:14 CT: §7's "not a guard-specific regression" claim was untested —
the branch changed the translation prompt (a new guard paragraph plus a worked JSON example) and that
prompt change already produced one new failure mode. "Job it": run the controlled A/B.** Arm A is
the translation prompt exactly as on `origin/develop` at `b927d7f` (copied verbatim into
`tools/jev/ab_prompt_harness.py::old_translation_prompt`, verified byte-for-byte identical to
`git show origin/develop:tools/jev/translator.py`'s `_translation_prompt` for a fixed input, since
`TARGET_SELECTORS`/`ACTION_KINDS` are unchanged between branches). Arm B is this branch's HEAD
prompt (`translator._translation_prompt`, imported directly, unmodified). Both arms use the same
model (`qwen3.5:9b`, `think:false`), the same three pilots, the same 36 scenarios, and the same
downstream harness/scoring (`fidelity_harness.run_pilot`/`summarize`/`prose_fidelity_report.py`,
imported unchanged — the new script only swaps which prompt-builder produces the translation
request). Four live runs per arm, interleaved (A1, B1, A2, B2, A3, B3, A4, B4), not batched by arm,
so drift in the local Ollama/Jev servers hits both arms alike.

**Verdict: the new prompt measurably lowers prose fidelity, and it is not just re-hitting the same
47.2% twice — it is a real, if noisy, drop relative to a same-day Arm A baseline that itself
reproduces the original 63.9% number.**

| | Arm A (old prompt) | Arm B (new, guard-aware prompt) |
|---|---:|---:|
| run 1 | 22/36 (61.1%) | 21/36 (58.3%) |
| run 2 | 21/36 (58.3%) | 15/36 (41.7%) |
| run 3 | 25/36 (69.4%) | 16/36 (44.4%) |
| run 4 | 21/36 (58.3%) | 19/36 (52.8%) |
| **mean** | **61.8%** | **49.3%** |
| **range** | **58.3% – 69.4%** | **41.7% – 58.3%** |

Gap between arm means: **12.5 points**, or 4.5 scenarios' worth at n=36 (2.8 points/scenario) — real,
though every individual run sits inside normal `qwen3.5:9b`-at-temperature-0.2 variance (§4.3 already
documented double-digit per-pilot swings on identical prose), and the ranges touch at 58.3%. Read
honestly: this is a moderate-confidence signal from 4 runs per arm, not a proof at the scenario level
— but the direction is consistent (Arm A ≥ Arm B in 7 of 8 same-numbered-run comparisons) and the
magnitude is in the same neighborhood as §7's original single-draw 63.9%-vs-47.2% (16.7-point) gap,
not a different phenomenon.

**Does Arm A reproduce the 23/36 (63.9%) baseline?** Yes, closely — mean 61.8%, and 23/36 (63.9%)
itself sits inside Arm A's [58.3%, 69.4%] range. The baseline was not stale and the environment did
not move; §7's own two live runs on the new prompt (both landing at exactly 17/36/47.2%) turn out, by
this A/B, to have been an unlucky-but-real pair from Arm B's distribution, not an artifact of a
broken harness.

**Per-pilot detail, all 4 runs each arm** (translator-vs-prose fidelity rate):

| pilot | Arm A (4 runs) | Arm B (4 runs) |
|---|---|---|
| drums | 50.0%, 50.0%, 66.7%, 58.3% | 58.3%, 66.7%, 50.0%, 58.3% |
| keytar | 75.0%, 75.0%, 75.0%, 66.7% | 50.0%, 8.3%, 33.3%, 33.3% |
| violin | 58.3%, 50.0%, 66.7%, 50.0% | 66.7%, 50.0%, 50.0%, 66.7% |

**keytar is where the whole gap lives.** drums and violin are statistically indistinguishable
between arms (both arms bounce around the same 50–67% band on both pilots). keytar alone drops from
a consistent 67–75% under the old prompt to 8–50% under the new one — the same pilot §4.2 already
flagged as the one whose base translation behaves differently from the other two for reasons that
were never root-caused. This A/B does not explain *why* keytar specifically destabilizes under the
longer, guard-aware prompt; it only confirms that it does, consistently, across four independent
live runs.

**Compile failures, `guard_`-named-no-action failures, guard nodes emitted (both arms, 4 runs × 3
pilots = 12 translations each):** zero of any of the three, in both arms. No guard-shaped node was
ever emitted by either prompt in this A/B's 24 total live translations, and the
retry-message fix from §7 (forbidding a `guard_`-prefixed id without the full `type`/`then`/`else`
shape) produced zero repeats of that failure mode here — consistent with, not a contradiction of,
§7's own "reduced to ≈5%" residual-risk figure at this much smaller n.

**Harness cross-check (requested explicitly, to rule out "the new harness scores flat schemas
differently"):** one Arm A schema (`drums`, captured live from `ab_prompt_harness.py`, saved as
`runs/ab-harness-crosscheck-reference-schema-drums-2026-09-26.json`) was run through **both**
this branch's `fidelity_harness.py --reference-schemas-dir` (`runs/ab-harness-crosscheck-
head-2026-09-26.json`) and `origin/develop`'s own unmodified `fidelity_harness.py` (via a temporary
detached worktree at `b927d7f`, `runs/ab-harness-crosscheck-develop-2026-09-26.json`), same schema,
two separate live Jev calls. **The predicted action matched on all 12/12 scenarios between the two
harnesses** — the one scenario where the two runs' `kind_agreement` differed
(`ability_on_cooldown_enemy_present`, HEAD 6/12 vs develop 5/12 overall) was a difference in the
*ground-truth* qwen-on-prose call (an independent, unrelated live model call each harness makes
fresh), not in the schema-evaluation/scoring code — `ground_truth.py` is untouched by this branch and
is exactly the kind of run-to-run model variance §4.3 already put on record. **This branch's harness
scores a flat cascade identically to develop's**, confirmed by this direct comparison, not assumed.

**What this does and does not settle.** It settles the question this section exists to answer: the
guard-aware prompt is not innocent — it correlates with a real, repeated prose-fidelity drop,
concentrated in one pilot (keytar), on a model that (per §7) never actually uses the guard shape it
was given room for. It does not identify a root cause inside the prompt diff (more text? the worked
JSON example specifically? something keytar-shaped that interacts badly with either?) — that would
need an ablation between "guard prose paragraph, no JSON example" and "JSON example, no guard prose,"
which this pass did not run. Four runs per arm is more than one, but still a small-n live measurement
on a non-deterministic model; a stronger future test would run 8–10 per arm and/or hold `keytar.md`
out as its own comparison given it carries the entire measured effect here.

**Recommendation, stated as a recommendation, not a decision:** given a mean 12.5-point drop
concentrated entirely in one of three reference pilots, on a model that never exercises the new guard
machinery the prompt asks it to consider, shipping the guard-aware prompt as the *default* trades a
measured fidelity cost for a feature this model does not use. Merging the guard-tree machinery itself
(`Cascade`/`GuardNode`/`evaluate_cascade`/rendering — all correct, tested, and backward-compatible per
§7) is not in question; what this section argues against is defaulting *every* pilot's translation
prompt to guard-aware wording when nothing in this repo's three reference pilots, on this model,
currently benefits from it, and keytar measurably loses from it.

## Sources

- This repo, this change: `tools/jev/guard_noul_calibration.py` (new, Phase 0, live-run),
  `tools/jev/test_guard_noul_calibration.py` (new, 7 tests, no network); `tools/jev/number_normalize.py`
  (new, Phase 3), `tools/jev/test_number_normalize.py` (new, 10 tests); `tools/jev/translator.py`
  (`_tokenize` now normalizes numbers for the trace check only — the rest of the file, including
  `enforce_absolute_priority`'s scope and `render_markdown`, is unmodified); `tools/jev/transparency.py`
  (`_significant` now exempts pure-digit tokens from its length filter — the rest of the file,
  including `build_report`'s scope, is unmodified); `tools/jev/ab_prompt_harness.py` (new, §8's A/B —
  measurement only, does not edit `translator.py`/`fidelity_harness.py`/`transparency.py`; reuses
  `fidelity_harness.run_pilot`/`summarize` and `translator.parse_schema`/`enforce_absolute_priority`
  unchanged, and carries `origin/develop`'s pre-guard-tree translation prompt verbatim as a local
  constant for Arm A).
- Read and reused, not modified: `tools/jev/{client,scenarios,fidelity_harness,rules,target_resolve,
  expressibility,segment,prose_fidelity_report,ground_truth}.py`; `prompts/pilots/{drums,keytar,
  violin}.md`; `runs/prose-ground-truth-{drums,keytar,violin}.json`;
  `runs/jev-prose-fidelity-2026-09-23.json`.
- New artifacts, this change: `runs/guard-noul-calibration-2026-09-25.{md,json}` (Phase 0's live
  result); `runs/ab-arm-{a,b}-run{1,2,3,4}.json` and `runs/ab-arm-{a,b}-run{1,2,3,4}-prose-fidelity.
  json` (§8's 8 live A/B runs, raw and scored); `runs/ab-harness-crosscheck-{reference-schema-drums,
  head,develop}-2026-09-26.json` (§8's harness-parity cross-check).
- Prior work this spec extends: `docs/prose-to-schema-translator.md` (PR #25 — the translator, the
  priority guard, the 63.9%/47.2% prose-fidelity split this spec's §5 target is drawn from);
  `docs/translator-transparency.md` (the transparency view, the keytar revision loop, the jam-rule
  options); `docs/entrant-compile-preview.md` (PR #31 — the three compile doors, the 2026-09-25
  entrant-compile reports §0's table quotes from).
