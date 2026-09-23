# Shared team intent — Jev vs qwen/qwen3-32b, 2026-09-23

Written first and committed alone, before either pilot exists, per Ceryce's brief (Telegram,
2026-09-23 14:57 CT): "write a qwen team prompt and a jev team prompt... they should encode the
same intent so the test is more a model test than a prompt writing test." This document is that
intent. `prompts/pilots/team-qwen-{drums,keytar,violin}.md` (prose) and `tools/jev/team_rules.py`
(schema/questions) are both derived from it, in a later commit, and neither is the source of truth
— this file is.

**This is a new design, not a replay of `house-violet.md`.** `runs/jev-house-bot-2026-09-23.md`'s
central finding was that the existing house prompt's rule order checks "no wave near tower → go
home" (rule 2) and "no foe/tower → ride wave" (rule 6) *before* "foe present → attack" (rule 4),
and that Jev answered the earlier movement questions "yes" far more readily than qwen did in
practice — so Jev's bearbots rode waves and went home instead of ever reaching the attack rule
(76 attacks vs qwen's 378 over 20 matches, zero Jev-side deaths because a bot that rarely fights
rarely dies). That is a confound in the *rule order*, not evidence about combat skill, and this
design's cascade is built specifically so it cannot recur: engaging a present, fightable foe is
rule 2, immediately after emergency self-preservation and before any positioning/regroup rule.

## The strategy, in plain language

Three roles, one shared doctrine:

- **Drums (top)** is the frontline. It walks in front, absorbs hits meant for allies, and fights
  the longest before pulling out — it only recalls when critically hurt. Its ability is an
  aggressive taunt/short-range tool: use it on cooldown against any foe in range, no hesitation.
- **Keytar (mid)** is the flexible fighter. It engages readily but not recklessly — it recalls
  earlier than drums — and its ability is a general-purpose damage tool, used on cooldown whenever
  a foe is present.
- **Violin (bottom)** is the backline. Like keytar it recalls at a moderate HP threshold, but its
  ability is a finishing tool held for weakened targets — a bearbot already below half health —
  rather than fired on cooldown against anything.

**When to fight.** Engage whenever a foe (enemy bearbot or minion) is visible and this bearbot's
own HP is above its recall threshold. Target the lowest-HP visible enemy bearbot if one exists,
otherwise the nearest enemy minion — focus fire, not whichever entity happens to be listed first.
Use the instrument ability instead of a plain attack whenever it's off cooldown and its own
condition (above) is met.

**When to retreat.** Recall immediately once HP drops below the role's threshold, before
considering anything else — a bearbot that is about to die is never the right bearbot to also be
mid-fight or mid-push. This check comes first in the cascade and nothing overrides it.

**When to push towers.** Attack an enemy tower or nexus only when this bearbot's own minion wave
(one or more allied minions nearby) is there too — never push a tower alone into its range-160
counter-hit. If a tower is visible but the wave isn't there, go home to meet the next one rather
than trade into the tower solo.

**When there's nothing to fight or push.** Ride with the nearest allied minion wave, advancing
down the lane. With no foe, no tower, and no wave either, wait at home for the next wave.

## The rule cascade (source of truth for both derivations)

Applied first-match-wins, exactly like `house-violet.md`'s "take the FIRST rule that matches" —
the mechanism entrants and the house bot already use, kept identical so the *cascade shape* isn't
itself a confound between the two teams.

| # | Condition | Action | Fixes the prior confound? |
|---|---|---|---|
| 1 | own HP below this instrument's recall threshold | `recall` | — (self-preservation is always first) |
| 2a | a foe is present, HP is above the recall threshold, ability is off cooldown, and the instrument's ability-use condition is met | `ability` on the foe | **yes — engagement now precedes positioning** |
| 2b | a foe is present and HP is above the recall threshold (2a not met) | `attack` the foe | **yes** |
| 3 | no foe, a tower/nexus is visible, and the allied wave (≥1 minion nearby) is present | `attack` the tower | — |
| 4 | no foe, a tower/nexus is visible, no allied wave present | `move` home (regroup, don't push alone) | — |
| 5 | no foe, no tower, an allied wave is present | `move` to ride with the nearest allied minion | — |
| 6 | otherwise (no foe, no tower, no wave) | `move` home, wait for the next wave | — |

Rule 2 (engage) sits second, right after the one rule that must always win (emergency recall), and
strictly before rules 3–6, which are all about *positioning* when there is nothing to fight. That
ordering is the deliberate fix: no bearbot on this design can reach a "go home" or "ride wave"
decision while a fightable foe is in front of it, the way the old cascade allowed.

## Per-instrument parameters

| Instrument | Recall threshold (HP) | Ability-use condition |
|---|---:|---|
| drums | 20% maxHp | any foe present, ability off cooldown |
| keytar | 35% maxHp | any foe present, ability off cooldown |
| violin | 35% maxHp | foe is a bearbot below 50% of its maxHp, ability off cooldown |

Thresholds are read as a fraction of `maxHp`, not a fixed HP number — `house-violet.md`'s original
75-HP cutoff was a fixed number tuned to that prompt's particular maxHp assumptions; this design
uses a percentage so the same cascade means the same thing regardless of a bearbot's actual maxHp
(`tools/arena/pages/contract.mjs`'s `Observation.self.maxHp` field, read directly by both
derivations).

## "Can't be matched" — where prose and schema diverge despite the same intent

| What | Prose (qwen) can do | Schema (Jev) can do | Consequence |
|---|---|---|---|
| **Target selection among several candidates** | The model itself reads the full `visibleEnemies` list and picks "the lowest-hp visible enemy bearbot" by reasoning over the JSON in the prompt, every call. | Jev is only ever asked *whether a condition holds* (`noul`), never *which* entity — asking it to rank N candidates would mean either an unbounded `choice` per tick (cost/latency) or a fixed small set. This design picks the target in **code** (`tools/match/jevPilot.ts`'s existing `extractWorksheet`, unchanged, already does "lowest-hp visible bearbot, else nearest minion") before Jev is ever called. | Jev's team never demonstrates target *selection* — only the engage/retreat/push *decision* — even though the intent document describes both as the same doctrine. Flagged, not hidden: this is the single largest gap between what the two media can express under this harness's existing plumbing. |
| **Threshold precision** | "critically hurt", "above half health" — human-readable, can stay approximate in the prompt text. | Every threshold must be a literal number compiled into the question's `instructions`/`criteria` text up front — there is no equivalent of "the model infers a reasonable cutoff." | Both pilots are written to the *same* literal percentages (table above) so this isn't actually a gap in this build, but it would be if either pilot's threshold language were left vague. |
| **Cross-rule nuance in one sentence** | A single sentence can blend multiple conditions with a tie-break ("attack whatever's nearest and threatening an ally first, the nearest enemy bearbot second, minions last" — `drums.md`'s own style). | Jev's questions are independent `noul` judgments composed by a fixed rule-order cascade in code; there is no per-call blending of "threat to an ally" as a tie-break signal, because that signal isn't in the worksheet Jev is handed at all. | This design's intent document does **not** ask for that particular nuance (see cascade table — target selection is HP-based only, not threat-based), specifically so this gap doesn't matter for *this* test. A richer intent that used threat-to-ally tie-breaking would widen this gap. |
| **Self-explanation** | The model's reply can (in principle) be prompted for a reasoning trace; this harness doesn't ask for one, but the medium supports it. | Jev returns a probability per question and nothing else — no rationale, ever, by construction. | Not exercised by this harness either way (neither pilot is asked to explain itself), noted for completeness only. |

## What "intent-compliance" means for the offline check

Per scenario (one worksheet — hp/wave/tower/foe/cd/instrument — drawn from the checked-in
`runs/house-prompt-2026-09-21-r*.json` logs, the same corpus `tools/jev/harness.py` already reads
for exactly this reason), **ground truth is the cascade table above, evaluated as a pure function
of the worksheet** — not what qwen3.5:9b did in that log originally (that model was playing
`house-violet.md`'s *different* prompt), and not what either team's model actually says. Each
team's real output (Jev's answers→bucket, or qwen32b's real JSON reply→bucket) is compared against
that same ground truth. Agreement measures how faithfully each *encoding* reproduces the intent
document's own cascade when a real model reads it — the offline half of "how much of any in-game
gap is the model, how much is the encoding" that the task brief asks for.
