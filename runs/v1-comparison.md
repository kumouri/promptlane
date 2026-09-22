# v1 comparison: historical specimen vs. the two cleanroom Claude submissions

Same evaluator revision, same gate definitions, same read-only method: a per-specimen headless
adapter that imports the specimen's own simulation and scripted pilot unchanged, drives full 3v3
Scripted matches at the specimen's own tick, and records outcomes; plus a headless-Chromium
context capture and the unchanged `acceptance/evaluate.py` import. Details and hashes per row:
[historical-v1.md](historical-v1.md), [fable-v1-001.md](fable-v1-001.md),
[opus-v1-001.md](opus-v1-001.md). The historical row was captured earlier with a narrower adapter
(three seeds, no mock/probe experiments); columns it did not measure say so.

| | Historical specimen | fable-v1-001 | opus-v1-001 |
|---|---|---|---|
| Provenance | Root `src/` at `ad11d51`, not a scored cleanroom run | `claude-fable-5-1`, 965 s active, cleanroom | `claude-opus-5`, 1,808 s active, cleanroom |
| Adapter scheduler | Private `tick()` at `TICK_DT`, `setImmediate` flush per frame | `Match.step()` at 50 ms, `setImmediate` flush per frame (browser 1× loop) | `world.step(); runner.onTick(); await settle()` per frame (the specimen's own loop) |
| Seeds run | 1, 1, 42 | 1, 1, 42, 2, 3, 7 | 1, 1, 42, 2, 3, 7 |
| End condition | 3/3 timeout at 10:00, all draws | 6/6 nexus destroyed (5/5 distinct seeds) | 6/6 nexus destroyed (5/5 distinct seeds) |
| Simulated duration | 600 s every match | 04:31 – 09:30 | 07:02 – 09:56 |
| First bearbot death | never (0 deaths in 3 matches) | 00:33 – 00:42 | 00:08 – 00:10 |
| Bearbot deaths, seed 1 (V / G) | 0 / 0 | 22 / 25 | 30 / 30 |
| Recalls started, seed 1 | 38 (all 38 completed heals) | 62 / 59 (35 / 30 completed) | 37 / 35 (8 / 7 completed) |
| Towers razed, seed 1 | 0 | 9 | 10 |
| Minions observed, seed 1 | 360 | 456 | 480 |
| Same-seed repeat | trace equal | trace + end state equal | trace + end state equal |
| Log-based replay | not performed | per-tick trace and end state identical (5,296 entries) | per-tick trace and end state identical (4,036 entries) |
| Mock PromptPilot path | not exercised | 896 decisions, 0 parse errors; browser dropdown path shows persona + observation + JSON reply | 685 decisions, 0 parse errors; browser dropdown path shows persona + observation + JSON reply |
| Delayed reply (async) | not exercised | order retained 61/61 ticks, applied after release; browser: 3 s HTTP delay, clock ran on | same |
| Timeout rule observed | timeout at 10:00, draws (towers 6/6, nexus equal) | dead heat and nexus-hp branches; towers branch by source only | towers branch ×3; nexus-hp and draw branches by source only |
| Browser full match | startup smoke only (no Start) | default seed 1: 4× ended 08:25 / 08:14 (frame-batching), 1× ended 09:30 = adapter | default seed 7: 4× and 1× both ended 08:53 = adapter |
| Evaluator gates pass / unverified / fail | 0 / 17 / 0 (+ install, typecheck, build, browser pass) | 12 / 5 / 0 (+ install, typecheck, build, browser pass) | 12 / 5 / 0 (+ install, typecheck, build, browser pass) |
| Overall | unverified | unverified (visual gates need a human) | unverified (visual gates need a human) |

Unverified in both cleanroom rows, identically: `launch`, `map`, `teams`, `ui`, `presentation`
(screenshots attached as context; no human looked) and exploratory `malformed-reply` (not driven).
The `timeout` passes carry the branch-coverage disclosure above.

## What this decides about v2

On both cleanroom specimens the historical no-first-blood behaviour did **not** recur: every
default Scripted match on five distinct seeds ended by nexus destruction, first blood came inside
the first minute (Fable) or the first ten seconds (Opus), and recalls — though frequent — were
routinely interrupted or followed by a return to lane rather than becoming a stall. The historical
timeout-draw is therefore a property of that specimen, not a property of the v1 prompt: the v1
prompt, unchanged, produced winnable matches on both strong-model runs. A v2 revision does not need
a recall-loop repair clause to get winnable baselines; whatever v2 changes should be motivated by
the gaps this pass could not close — the visual gates, malformed-reply recovery, full timeout-branch
coverage, and (for Fable) the browser loop's frame-timing dependence above 1× — or by design goals
outside the definition of done.

Harness caveats that stay attached to that sentence: one run per setup is a demonstration, not a
statistic; both runs used a mature Claude Code setup with different active times (965 s vs
1,808 s) and their self-reports were not used as evidence; the historical specimen came from a
different model and harness with the recall lesson deliberately excluded from all three; the
adapters model the 1× browser loop and are not human observation; and nothing here ranks the two
models as models — the two specimens differ in kit numbers, map, pacing and death rate, and both
cleared the same twelve gates.
