# Frozen independent acceptance: original v1

Version: `promptlane-v1-acceptance-1`. Source: `prompts/initial_prompt.md`
and the initial `docs/design.md` at commit `5dde8b5`. The later recall lesson
is diagnostic context, **not** an additional generation requirement. Do not
change the original prompt or require a v2 recall channel, HP escape floor,
particular TypeScript class layout, telemetry API, or framework chosen by this evaluator.

This suite is withheld from the agent during scored initial generation. Freeze
the submission first. Run independent checks only afterwards; do not return
results, logs, adapters or test-driven repair advice until the initial score is
recorded. A repaired build is a different candidate, not the initial v1 score.

## Required gates

Every gate needs independent evidence. Missing instrumentation is `unverified`,
not a pass or automatic failure. Source inspection is useful for stack and
documentation but cannot establish gameplay. The IDs below are the executable
report IDs, independent of any implementation's symbols or DOM selectors.

| ID | Original requirement and observable pass condition |
| --- | --- |
| `launch` | `npm run dev` renders the actual arena in a browser without startup/runtime errors; independent human confirms it is not an empty canvas. |
| `map` | Diamond arena, river, jungle, top/mid/bottom lanes, two towers per lane per side (12 total), nexus per base, minimap. |
| `teams` | Two teams of three shared robot-bear chassis with instrument weapons; readable team distinction. |
| `minions` | Observe waves on all three lanes at successive 30 s simulation intervals; they walk and fight. Record times, not just a screenshot of static units. |
| `kits` | Drums tank: extra hp, short-range Kick taunt/knockback, Fill AoE slow. Keytar mage: ranged basic, Chord AoE burst, Glissando dash. Violin assassin: fast, Staccato strong stab, Solo burst + speed for 3 s. Music names and cooldowns; record effects and repeat-use cooldown evidence. |
| `baseline` | Fresh default Scripted 3v3 match reaches a destroyed nexus and winner. Record seed/default settings, starting configuration, elapsed simulation time and terminal evidence. A timeout/tower-count victory is explicitly **not** a pass. |
| `timeout` | When neither nexus is destroyed by 10 simulation minutes, most towers standing wins, then nexus hp. Test ties as far as the prompt specifies; it does not specify a final tie breaker. |
| `mock` | Switch one bear to Prompt-mock via its dropdown, select it, see meaningful current prompt/observation and mock reply in the panel; observe resulting action without an API key. |
| `http` | Configurable env URL, HTTP POST request using prompt+observation, valid returned action handling. Review config and capture local test-endpoint request/reply; no paid model needed. |
| `pilot-contract` | Shared asynchronous observation-to-action contract; compact plain JSON with self/allies/visible enemies, nearby minions/towers, lane, cooldowns and clock; move/attack/ability/recall/hold vocabulary. Scripted heuristic pushes lane, attacks nearest, uses ready abilities and recalls under 25% hp. Prompt pilot composes champion prompt file plus observation, calls pluggable model and parses action. Inspect semantics, not exact class or file names. |
| `async` | Delay the HTTP reply while observing clock, units and retained last action continue, then observe reply applied on the pilot cadence. Never require an exact 500 ms cadence; v1 says “e.g.” |
| `ui` | Start match, arena canvas, top clock/team scores, bear names/hp/instrument marks, selection prompt/reply panel, per-bear Scripted/Prompt-mock/Prompt-HTTP dropdowns. |
| `replay` | Fixed timestep and seeded RNG; replay a saved match log with the same recorded decisions and compare state/event checkpoints and final result. Record inputs, timings and outputs of both runs. Two screenshots or same-seed starts alone do not prove replay. |
| `presentation` | Canvas 2D, flat shapes/thick outlines, violet `#8e00ff`, green `#00ff0f`, black and white; no sprites required. |
| `prompts` | Three example prompt files, one per shipped instrument, in-character and each fewer than 40 lines. |
| `stack` | TypeScript, Vite, Canvas 2D; no game engine, physics library or UI framework. Source/package review, without reliance on specific file names beyond original required artifacts. |
| `documentation` | README Status reflects submitted functionality; design is unchanged from supplied canon or a contradiction is explicitly disclosed. Compare with the frozen generation inputs, not today's evolving repository. |

The suggested ten-line plan, one-question interaction and small Conventional
Commits are generation-process instructions; assess from the run transcript,
not by inventing proof from a final directory. They are outside this artifact
report. No unrequested visual polish or exact balance targets are gates.

## Exploratory robustness, not additional v1 gates

* `malformed-reply`: independently exercise malformed JSON, unknown action,
  rejected request, unavailable endpoint, very late response and rapid pilot
  switching. Record whether simulation continues, a safe previous action remains,
  stale results leak across pilots, and errors are visible. These stronger
  recovery guarantees were not explicitly required in v1. The specified
  nonblocking behavior itself is still the required `async` gate.
* `recall-balance`: record deaths/recalls and sustained progress over several
  seeds. Do not prescribe a v2 repair. A recall loop causing the observed default
  baseline to time out fails `baseline` on the original definition of done,
  regardless of whether this exploratory check passes.

## Decision rules

`pass` means independently demonstrated; `fail` means an observed contradiction;
`unverified` means evidence is absent or insufficient; `not-applicable` is allowed
only for an intentionally unconfigured command check. Every v1 gate applies.
Any required gate or attempted command/browser check failing makes overall
`fail`. Otherwise every required gate must pass for overall `pass`; remaining
cases are `unverified`. Exploratory failures never change the overall result.

Browser startup automation checks errors and visible nonzero canvas dimensions,
not canvas pixels' meaning. It cannot automatically clear even `launch`.
Install/typecheck/build success never proves a playable loop.
