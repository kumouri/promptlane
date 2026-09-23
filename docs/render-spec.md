# Elysium viewer — isometric 2.5D render spec

**Status: PHASE 1 BUILT — 2026-09-22** (branch `feat/render-phase1`). §14's phase 1 — entity/pilot
silhouettes (§6/§7), hit/death/ability feedback (§8, feedback bullets), the live-view motion-pacing
fix (§8, mechanism), and the HUD legibility pass (§9) — is built, on the unchanged top-down camera.
**Phase 2 (§4, the isometric transform) is still spec only, not built.** §16 records what actually
shipped, where it deviates from what this document imagined, and why. Originally written 2026-09-22
in response to Ceryce's
one-line brief (Telegram, 2026-09-22 20:46 CT): *"spec out making the game look decent in elysium. I'm
thinking like fixed perspective isometric 2.5D or something, so we can see creeps vs bearbots and the
drum bot vs the violin bot, etc. I'm not tied to anything other than 'enough to make it fun to watch'."*
Sections 1-15 below are that original design document, left as written (design intent, not a
build log) except where a phase 1 footnote marks a spot where the build deviated. §16 is the build
log.

Read with: [`../src/render.ts`](../src/render.ts) (the renderer phase 1 rewrote), [`../src/sim/map.ts`](../src/sim/map.ts),
[`../src/sim/entities.ts`](../src/sim/entities.ts), [`../src/sim/match.ts`](../src/sim/match.ts),
[`../src/live.ts`](../src/live.ts), [`arena-site-spec.md`](arena-site-spec.md) §3.4 (live stream) and
§6 (jam-day sequence, round-one remote viewing), [`design.md`](design.md) (presentation-layer ethos).

---

## 1. What this replaces

`src/render.ts` (156 lines) is the current renderer: an orthographic top-down read of `Match`, drawn
straight onto a square canvas with no rotation — `ctx.translate/scale` only. Every unit is a filled
circle (nexus, minion, bearbot) or a filled square (tower); team is color (`#8e00ff` / `#00ff0f`);
a bearbot's instrument is a single black letter (`D`/`K`/`V`) drawn on top of its circle. That letter
is exactly what Ceryce is asking past — legible in a full-size window, unreadable once the window is
small (a phone, a shrunk browser tab), and not a silhouette.

**Rendering is a pure read of match state and stays that way.** Every match is re-simulated and
replay-verified (`verifyReplay`) before it counts; a renderer that perturbs the sim, `src/rng.ts`, or
tick order breaks that guarantee. Nothing below touches `src/sim/*`, `src/rng.ts`, `src/pilots/*`, or
`src/types.ts`. The one place this spec proposes touching code outside `render.ts` is the live-view
*pacing* in `src/live.ts`/`src/main.ts` (§9) — still a pure external driver of the frozen sim, the same
pattern those files already use.

## 2. The world, exactly (no guessing)

From `src/sim/map.ts`, `src/sim/entities.ts`, `src/sim/match.ts`:

| Fact | Value |
|---|---|
| World | 1000×1000 square. Bases at `(100,900)` (violet) and `(900,100)` (green) — opposite corners on the line `x+y=1000` |
| River | the band `\|x−y\| < 55` (the *other* diagonal), purely visual |
| Lanes | `top`: via `(100,100)`; `mid`: the straight `(100,900)→(900,100)` diagonal; `bottom`: via `(900,900)` — always drawn violet-base → green-base |
| Nexus | 1 per team, r=55, 2200 hp, at each base |
| Tower | 12 total (2 tiers × 3 lanes × 2 teams), r=28, 900 hp, at path fractions 0.22/0.42 from each team's own base |
| Bearbot | 6 total, fixed roster: `{drums:top, keytar:mid, violin:bottom}` per side, r=14. Spawns at path fraction 0.08 (violet) / 0.92 (green) |
| Minion | r=8, 60 hp, waves of 3 per team per lane (18/wave) every 30 sim-seconds, up to 20 waves in a 600 s match |
| Sim tick | fixed 20 Hz (`TICK_DT = 0.05 s`) |
| Ranked cadence | `tournament.cadenceSec = 2` — a pilot's action is re-decided every 2 sim-seconds; between decisions it keeps its last action and the sim keeps ticking at 20 Hz underneath it |
| Real-time pace | on `qwen3.5:9b`, a cadence-2 match runs ≈2.5× slower than real time (a 10 sim-min match takes ≈25 real min) — every ~2 sim-seconds of new information takes ≈5 real seconds to arrive in the live view |
| Stats the sim actually tracks | hp/maxHp, position, alive, ability cooldowns, tower kills per side. **No gold, income, vision, or "power" stat exists anywhere in `src/sim/`.** Do not invent one. |

**Measured, not assumed — max concurrent entities.** I ran three real mock-backend matches
(`node tools/match/cli.mjs --model mock`, seeds 7/11/42, drums-vs-violin/drums-vs-drums/keytar-vs-keytar,
full 600 s) and read every checkpoint (`src/replay.ts` `checkpointOf`, one every 5 sim-seconds) for
`minions.length`. All three peaked at **23 concurrent minions**, around the t=480s mark, on top of the
20 entities that always exist (2 nexus + 12 towers + 6 bearbots, alive or not — dead ones still render,
dimmed). Worst case observed: **~55 simple shapes on screen at once.** Caveat: the mock pilot's
decisions don't depend on the prompt file, so all three samples share the same wave-clearing rhythm —
this is a measurement of the *sim's mechanics* (spawn rate, aggro radius, tower/attack damage — none of
which vary by model), not a survey of real model behavior, and checkpoints are 5-sim-seconds apart so
the true instantaneous peak could be a little higher between samples. I did not have a real
`qwen3.5:9b` log handy to cross-check; do one before treating 55 as gospel, but there is no
architectural reason to expect an order-of-magnitude difference — minions die to tower/bearbot damage
on a fixed clock regardless of who is piloting. Either way, this is nowhere near a Canvas2D performance
concern (§10).

## 3. "Fun to watch," made testable

Her one line — *"enough to make it fun to watch"* — becomes these acceptance criteria. A build is
correct against this spec when a person who has never seen promptlane, watching **alone in their own
browser tab, on whatever device and at whatever moment they opened it, with nobody there to explain
what they're looking at**, can do all seven without being told anything except "watch this":

1. **Say which team is ahead**, within 3 seconds, from the HUD alone (score/clock), without counting
   individual HP bars.
2. **Point at a creep and point at a bearbot** and correctly name which is which, within 3 seconds,
   by silhouette/size alone — not by reading a label, not by knowing which one moves smarter.
3. **Told "the drums bot is the tank," find it on screen within 5 seconds** by its distinct silhouette
   — lane position (drums is always top) is allowed to help, but the bot must also be identifiable
   after it leaves its lane to fight or roam.
4. **During a team fight (3+ units clustered), still count roughly how many units are there and which
   team has more** — not see one indistinguishable blob.
5. **Watching live, does not describe the game as "freezing then teleporting."** Motion between the
   ~2-sim-second/~5-real-second update batches reads as continuous, even though the underlying data
   arrives in chunks (§9).
6. **A tower falling, a nexus falling, or a bearbot dying is obvious the instant it happens** — a
   flash or an animation, not a health bar quietly hitting zero that nobody was staring at.
7. **Which base belongs to which team is unambiguous within 2 seconds**, at any point in the match.

Everything else in this document exists to make these seven true.

## 4. Projection — recommendation: yes, true isometric, here is the transform

Her instinct is right, and it does real work beyond "looks nicer": it is the only lever here that adds
genuine elevation (nexus looms, towers stand tall, creeps sit on the ground), and it gives the three
lanes distinct screen silhouettes (below), which the current top-down square render does not.

*(An earlier pass argued this also "improves the screen composition for a widescreen projector."
That premise is gone — there is no projector, no shared screen, and no fixed room to compose for.
Every spectator watches in their own browser, at whatever window size, aspect ratio and zoom level
they have, including a phone. That cuts the other way if anything: the isometric diamond is wider
than it is tall, so it is *harder*, not easier, to fit into a narrow or portrait viewport than the
current square top-down render — a phase-1/phase-2 canvas-fit pass has to handle that shape
honestly rather than assuming a wide screen to compose for. The elevation and lane-silhouette wins
above don't depend on screen shape, so they stand on their own; the widescreen-composition claim
doesn't, and is withdrawn.)*

**The transform.** Don't rotate the raw `(x, y)` axes — align the isometric axes with the map's own
diagonals, which are already meaningful:

```
u = x − y            (river axis: river is u ≈ 0)
v = x + y            (base-to-base axis: both bases sit exactly on v = 1000)

screenX = u · kx
screenY = v · ky − h(entity) · kz      (ky = kx / 2, the classic 2:1 iso ratio)
```

`h(entity)` is a small per-kind constant "visual height" (nexus tallest, tower next, bearbot low with
an idle bob, minion ~0) that lifts the *sprite* up the screen while a soft ground-shadow ellipse stays
drawn at the un-lifted `(u, v)` position — the standard cheap trick for reading height without any
real 3D. `kx`/`ky` are just a canvas-fit scale, chosen the same way `render.ts` already computes
`scale` today.

**What this does to the map, concretely** (worth stating because it changes the mental picture anyone
who has seen the current top-down build already has):

- **River becomes a vertical band down the center of the screen** (u ≈ 0 for the whole river), running
  full height, since the river's diagonal is `x = y`.
- **Both bases land at the same screen height**, one far left (violet, u = −800) and one far right
  (green, u = +800), because both satisfy `v = 1000`.
- **Mid lane becomes a straight horizontal line** connecting the two bases directly through screen
  center — and it crosses the river at the exact center of the screen, which is the map's actual
  river/mid chokepoint. That's a legible, "aha" landmark for free.
- **Top and bottom lanes become two arcs** bowing away from that mid-line — top lane peaks near the
  top of the screen (through the `(100,100)` corner, `v = 200`), bottom lane dips near the bottom
  (through `(900,900)`, `v = 1800`). The three lanes go from "three roughly-parallel diagonal
  corridors" (today, genuinely a little same-y from a distance) to three shapes with different screen
  silhouettes — a horizontal line and two arcs — which is a second free legibility win.

**Cost, honestly:**

- **Relearning.** Anyone who knows the current top-down layout (corner-to-corner diamond) has to
  relearn "bases are left/right, not top-left/bottom-right." One-time cost, paid once per person.
- **Hit-testing.** `render.ts` already threads a `selectedBotId` through for highlighting, but there is
  **no click-on-canvas selection today** — selection only happens via the roster list in `main.ts`
  (`row.addEventListener('click', …)`, `src/main.ts:153`). If canvas-click selection is added later,
  the inverse transform is one extra step (solve `u, v` back from `screenX, screenY`, test world-space
  distance against each entity's radius, prefer the top-most/last-drawn hit) — more math than today's
  trivial affine inverse, but still O(entity count) per click and not a real cost at ~55 entities.
  Recommend leaving canvas-click selection out of phase 1 (§11) and keeping the roster list, which is
  unaffected by any of this.
- **Every lane-path/jungle-dot computation in `render.ts` needs to run through the transform** instead
  of the current straight scale+offset. Mechanical, not risky — same shapes, new coordinates.
- **It is more work than *not* doing it.** The alternative (below) is real and cheaper.

**Alternative considered: keep the top-down camera, fake depth with shadows + sprite lift only (no axis
rotation).** Draw a ground-shadow ellipse at the true `(x, y)` and lift the body sprite by `h(entity)`
in screen-Y only, no `u/v` rotation. This gets *some* of the "2.5D" read (towers loom, nexus looms)
for a fraction of the cost (no new coordinate system, no relearning, no hit-testing change), but it
does **not** deliver the "fixed perspective isometric" look she specifically named, and it doesn't
deliver the lane-silhouette win above. **I recommend the true isometric
transform** because it's what she asked for and it's the one part of this spec that measurably helps
"fun to watch" beyond what shape/color work alone can do — but see Open Decision 2 (§13): whether it
ships in phase 1 or after.

## 5. Depth and draw order

Sort by **ground depth `v = x + y`, ascending** (draw what's furthest into the screen first) — not by
the elevated `screenY`, so a tall unit (nexus) doesn't wrongly draw in front of something at a greater
depth just because its lifted sprite is higher on screen. Tie-break, in order:

1. **Kind priority**: nexus/tower (map furniture) → minion → bearbot (the units eyes track, drawn last
   so they're never hidden behind a creep at the same depth).
2. **Entity id**, for a stable tie-break — without one, two units at near-identical depth will flicker
   their draw order frame to frame as floating-point rounding shifts which one is "first."

**Stacking.** The sim already staggers a spawned wave's three minions with an 18-unit lateral jitter
(`match.ts` `updateMinionWaves`, perpendicular to lane direction) — that survives the transform (it's
a real world-position offset, not a rendering trick) and already prevents dead-on overlap within one
wave. It does **not** prevent overlap when a wave meets a bearbot, or when multiple waves + bearbots
converge in a fight. For that: a small per-id deterministic offset (a hash of the entity id, not
random per-frame — must be stable across frames or units visibly jitter) nudges near-coincident units
apart by a few world units, enough to separate silhouettes without misrepresenting position. If more
than, say, 6 units occupy a very tight cluster (a real team fight), consider a small stacked "+N" badge
on the densest cluster rather than trying to keep spreading them — six-plus overlapping silhouettes at
small scale stop being legible no matter how they're offset, and the badge answers acceptance
criterion 4 ("roughly how many, which team has more") more honestly than pretending they don't overlap.

## 6. Entity vocabulary — silhouette, not color or a letter

Team color is spent on **side**. A letter is exactly what she's asking past. Every kind needs a
silhouette distinguishable at small size, by shape alone:

- **Nexus** — the tallest thing on the map (biggest `h(entity)`), a broad base shape (today's circle is
  fine as a footprint) with height/glow that reads as "the thing you're defending," visually distinct
  from a tower at a glance by scale and by having no lane-direction orientation (it's not a "gate,"
  it's the end of the map).
- **Tower** — medium height, a narrow silhouette (today's square works as a footprint; add height so it
  visibly "stands" rather than sitting flat) oriented along the lane, static.
- **Minion (creep)** — smallest, ground-level (no lift), a simple rounded shape with no ornamentation —
  it should read as "background unit" even before you're close enough to see color.
- **Bearbot** — noticeably larger than a minion (already true: r=14 vs r=8, keep that ratio or grow it
  slightly under the iso scale so it stays legible at small scale — a phone, a shrunk browser window
  — since it's just as often viewed up close as from a full-size desktop), a distinct chassis silhouette (e.g. a
  rounded body with small limb/ear nubs — "a bear," per `design.md`'s canon that every champion is the
  *same* chassis) so "bearbot" reads as one consistent shape family across all three instruments, with
  the instrument as an add-on marker (§7), not a different base shape. This also matters for a subtle
  but real point: the *chassis* shape is what says "this is a champion, not a creep or a structure" —
  the instrument marker is a second, independent layer of information on top of it.

## 7. Per-pilot (per-instrument) identity

Three kits to distinguish — drums / keytar / violin — plus the house bot, which is **not a fourth
identity**: it's just another prompt driving the same three instrument bearbots (`prompts/pilots/README.md`
confirms the house pair plays the same fixed roster). "Readable apart at a glance" means three
silhouette markers, cheap to draw procedurally (no art dependency, §12):

- **Drums** — a compact double-circle motif (a kit seen from above: a small ring inside a larger one),
  read as "solid/round" — matches its role as the tank.
- **Keytar** — a long diagonal bar with 2–3 small notches (keys), read as "angular/linear" — matches
  its role as the ranged mage.
- **Violin** — a narrow body-and-scroll silhouette (or an F-hole notch cut into an otherwise round
  shape), read as "thin/curved" — matches its role as the assassin.

These are 3-to-6-stroke procedural shapes, not sprites, drawn as a small marker on the chassis (not
replacing it). A genuine free assist here: **lane position already tells you the instrument** — the
roster is fixed (`drums:top, keytar:mid, violin:bottom`) for both sides, always (`JAM_ROSTER` in
`src/replay.ts`). The silhouette marker is what keeps identity legible once a bearbot leaves its lane
to fight or roam, which happens constantly — lane position alone fails acceptance criterion 3 the
moment a fight starts.

## 8. Motion between rounds — the actual mechanism, not a guess

This is worth tracing precisely, because the fix is not in `render.ts` and I want to say exactly why.

**The sim already computes smooth motion.** It ticks at a fixed 20 Hz regardless of decision cadence;
between two pilot decisions a bearbot keeps executing its last action every tick (`match.ts`
`updateBearbots`). So the *data* for smooth per-tick motion already exists — this was never a
simulation-fidelity problem.

**The live viewer discards it anyway, and I traced why.** In `src/main.ts` `attachMatch`
(`src/main.ts:324`), `catchUp = v.mode === 'live' && !feed.meta?.finished` is computed **once**, at
match start, and never re-evaluated. For a genuinely live (unfinished) match this is `true` for the
*entire match*, which makes `Ticker`'s `speed()` return `Infinity` forever, not just during the initial
catch-up a late joiner needs. In `Ticker.run()` (`src/live.ts`), `Infinity` speed means `target =
limit()` immediately, so the *whole* newly-unlocked tick range (all ~40 ticks in a cadence-2 round) is
consumed in one synchronous inner-loop pass before the outer loop ever calls `await frame()`. The
browser's own `requestAnimationFrame` render loop (`main.ts` `loop()`) only gets to paint *after* that
burst finishes, so it only ever sees the state at the end of each round — a hard teleport every ~5 real
seconds. This is exactly the "hard-snap ceiling" named in the brief, and it is a **pacing bug in
`live.ts`/`main.ts`, not a limitation of the sim or a reason to invent client-side interpolation.**

**What must not change, and why.** The browser is only allowed to tick forward as far as
`feed.lastRoundTick` — the last tick whose asks are *all* answered. Stepping past that would call
`ReplayPilot.decide()` on a bot whose next decision hasn't arrived yet, which returns `hold`
(`src/replay.ts`) — a fabricated action that, when the real decision later arrives, has already
diverged from what the server actually did. **No form of client-side prediction is safe here**; any
fix has to work only with ticks the server has already confirmed.

**The fix: meter the release of confirmed ticks instead of bursting them.** `catchUp` should only be
true while the client is *genuinely* behind (e.g., more than one round behind the frontier — the case
a fresh page load or a reconnect needs). Once caught up to near the frontier, `speed()` should meter
newly-unlocked ticks across roughly the real-world interval until the *next* round is expected — a
simple moving average of recent round-to-round arrival times, seeded with a conservative default
before any history exists — rather than draining them instantly. This recovers the sim's true,
already-computed 20 Hz motion for free: no interpolation math, no extra render-side state, because the
per-tick positions are already correct — they just need to be *revealed* to `render()` one or a few
ticks at a time instead of forty at once. This is exactly the pattern `Ticker` already uses for
**replay** at speed 1×/4×/16× (a finite `speed()` naturally metes out ticks a few per frame, which is
why replay does not have this problem today) — live mode just needs the same treatment instead of a
permanently-`Infinity` speed.

This is a small, additive, isolated change to `src/live.ts`/`src/main.ts`'s pacing policy. It does not
touch `src/sim/*`, the replay/verification contract, or `render.ts`. See Open Decision 4 (§13) for
whether it's in scope for this pass.

**Hit/death feedback**, cheap and procedural, layered on top of the above:

- **Hit flash**: a brief white outline flash on any unit whose hp just dropped, so damage reads even
  if you weren't staring at its HP bar (acceptance criterion 6).
- **Ability casts**: a radial pulse at the cast point for the two AoE abilities (`fill`, `chord`); a
  short directional streak/afterimage for the two dashes (`glissando`, and violin's `staccato` lunge);
  a brief status ring/tint on a slowed target (`kick`, `fill`) and on a `solo`-buffed violin bot.
  All six ability effects are enumerated in `src/sim/entities.ts` `INSTRUMENTS` — nothing to guess here.
- **Death**: a short fade + drop in `h(entity)` (the unit visually settles to the ground) over ~300–400 ms,
  rather than an instant disappearance — reinforces criterion 6 for bearbots and towers especially.

**Replay vs. live.** Replay already paces ticks at the chosen speed through the same `Ticker`, so it
does not have the burst problem — but the interpolation/feedback layer above should be built as a
function of "the two most recent known states + elapsed wall time," not as a growing animation queue,
so it stays correct if a future scrub/seek feature jumps replay to an arbitrary tick (not built today,
but worth not architecting against).

## 9. What the viewer shows besides the field

- **Per-unit HP bars** — already exist, keep them, they answer "who's winning this individual fight."
- **Team score** — the existing top-bar `VIOLET N — N GREEN` (towers destroyed by the other side,
  `match.towersDestroyedBy`) already answers acceptance criterion 1. **Do not invent a fabricated
  "power" or "gold" gauge** — the brief and `design.md` are both explicit that the sim has no such
  stat, and inventing one to look like a broadcast HUD would be showing something that isn't real.
- **Clock** — already exists (`clockText`, MM:SS countdown), keep it.
- **Legibility pass for arbitrary viewports.** The current `.topbar`/`.score` CSS was sized for
  someone sitting at a laptop keyboard, but every spectator now watches on their own device — a
  desktop monitor, a laptop, or a phone held at arm's length — with nobody there to point at the
  screen and say "look, top bar." A phase-1, CSS-only pass (responsive score/clock type, higher
  contrast, thicker strokes on lane/river borders, a floor on minimum legible size at narrow widths)
  is cheap and directly serves acceptance criteria 1 and 7 — flagging it here so it isn't dropped as
  "just styling."

## 10. Performance budget

Worst case measured (§2): ~55 simple shapes (circles/polygons, a handful of strokes each, small HP
bars) plus a few dozen small procedural markers (instrument icons, status rings). This is trivial for
Canvas2D — thousands of simple shapes at 60 fps is normal; nothing here is a WebGL or sprite-batching
case. The only real performance-adjacent risk is **the interpolation/feedback layer holding per-frame
allocations** (e.g., allocating a new object per unit per frame for lerp state) — keep that data
reused/mutated in place, the same way `Match` already mutates positions in place, rather than
reallocating every frame. No entity-count-driven risk exists at this scale.

## 11. Asset strategy

**Recommendation: procedural canvas drawing, same as today — no sprites, no new asset pipeline.**
Every shape in §6/§7 (chassis silhouettes, instrument markers, status rings, hit flashes) is a handful
of `ctx.arc`/`ctx.lineTo` calls, exactly like the current renderer's circles and squares. This:

- ships with zero art dependency and zero risk of missing assets by any deadline;
- matches `design.md`'s explicit, standing ethos — *"Presentation layer stays minimal… polish is not
  the point"* — this is a MOBA built from one prompt, not an art demo;
- degrades to nothing worse than "simple flat shapes," which is already the acceptable baseline today.

**Authored sprite art** would look better, but needs an artist, a time budget, and an answer to "what
renders until the sprites exist" (the honest answer is "the procedural fallback," which argues for
building the procedural version regardless, sprites or not). This is a real either/or — see Open
Decision 3 (§13).

## 12. Dependency cost

**No new render/game library.** The repo is Vite + TypeScript with a 156-line hand-rolled Canvas2D
renderer and no game engine today. At ~55 simple shapes, raw Canvas2D is not the bottleneck for
anything in this spec — a library like PixiJS would buy sprite batching and a scene graph neither of
which this workload needs, at the cost of a new dependency, a WebGL context to manage alongside the
existing DOM overlay (roster list, prompt panel), and a real learning-curve tax on a 156-line file.
Nothing here earns that cost. Everything above (transform, draw order, silhouettes, interpolation) is
buildable as an evolution of the existing `ctx.arc`/`ctx.fillRect` style in `render.ts`.

## 13. Open decisions for Ceryce

**1. Ship before or after the Oct 2 jam?** *Recommend, revised: phase 1 before, phase 2 (the
isometric camera) after — the original "after, full stop" recommendation doesn't survive its own
premise.* It rested on round one being a passive screen share (`arena-runbook.md` §6) while only the
semis/final carried real stakes, "live in front of people." Neither half of that is true: there is no
room, no projector, and no co-located audience, ever — every round, round one included, is watched by
someone alone in their own browser tab, arriving whenever they choose, with no operator there to
explain what they're looking at. That makes self-explanation (acceptance criteria 1–4, 6, 7) matter
for round one exactly as much as for the final, not less, which argues for landing the cheap,
low-risk phase-1 work (entity silhouettes, hit/death feedback, the live-motion pacing fix, HUD
legibility — §14) *before* the jam rather than after it, so round one isn't watched, unexplained, on
the renderer's weakest form.

What still argues for "after," and does so on its own footing, unrelated to who's in a room: schedule
risk alone. The isometric camera (§4, phase 2) is the single biggest diff here — the one thing that
changes the map's mental model and touches hit-testing/coordinate-system assumptions — and it was
raised as a feature idea while she was resting, not under jam pressure. Landing it in the same two
weeks as the actual dress rehearsal (`arena-site-spec.md` §6 Phase B) still competes with rehearsal
time for no jam-day payoff, since top-down vs. isometric doesn't change whether any of the seven
acceptance criteria pass. Cost of recommended: two ship dates instead of one, and phase 1 needs real
rehearsal time of its own, not a landing the night before. Cost of the alternative (hold everything,
phase 1 included, until after): the jam — round one included — is watched by people with no one to
ask, on the renderer's current weakest form (a single letter distinguishing bearbots, health bars that
don't flash), which is exactly the case this spec exists to fix.

**2. If it ships, entity/HUD readability first or the isometric camera first?** *Recommend: entity
silhouettes (§6/§7), the live-motion fix (§8), and the HUD legibility pass (§9) first, on the current
top-down camera; the isometric transform (§4) as a later phase.* Five of the seven acceptance criteria
(1, 2, 3, 4, 6) are answered by shape/motion/HUD work alone, independent of camera angle, and that work
is lower-risk (no hit-testing/coordinate-system change). The isometric camera is real, is what she
asked for by name, and is the highest-ceiling single change — but it's also the biggest single diff to
land and the one thing that makes anyone relearn the map. Cost of recommended: what ships first still
"looks top-down" rather than "isometric," which may read as underdelivering on the literal ask. Cost of
the alternative (camera first): more risk/time before any of the cheaper, high-value wins land.

**3. Asset strategy: procedural (§11) or commission sprite art?** *Recommend: procedural.* Ships with
no art dependency or deadline risk, matches the project's stated minimal-presentation ethos. Cost of
recommended: it will never look as good as authored art. Cost of the alternative: needs an artist and a
time budget neither of which is scoped here, plus a real answer for what renders in the meantime.

**4. Include the live-motion pacing fix (§8), or leave live choppy and only make replay/local-match
look better this pass?** *Recommend: include it — and the remote viewing model makes the case
stronger, not weaker.* It's a small, additive, isolated change to `src/live.ts`/`src/main.ts`'s
pacing policy — it doesn't touch the sim or the replay-verification contract — and it directly
answers the brief's constraint 3 ("the gap between rounds... treat it as a first-class design
problem, not an afterthought") and acceptance criterion 5. Nobody watches from a fixed seat for the
whole match; every spectator opens the page whenever they choose, mid-round as often as not, so the
live view's catch-up behavior — recovering to the sim's real per-tick motion instead of bursting to
the frontier — is a primary path every spectator hits, not an edge case reserved for a late arrival.
Cost of recommended: it's the one piece of this spec that touches decision-arrival timing logic
rather than pure drawing, so it carries slightly more risk than a rendering-only change. Cost of the
alternative: the isometric, better-silhouetted viewer would still visibly "freeze then teleport"
every ~5 seconds in live mode, for every spectator watching live in every round, which is the single
complaint most likely to undercut "fun to watch" precisely because there's no one there to explain
the freeze-then-teleport away as normal.

## 14. Phasing

**Phase 1 — BUILT 2026-09-22, see §16.** (recommended before the jam — see Open Decision 1): entity
silhouettes (§6/§7) on the current top-down camera, hit/death feedback (§8, feedback bullets), the
live-motion pacing fix (§8, mechanism), and the HUD legibility pass (§9). Shippable and testable
against acceptance criteria 1, 2, 3, 4, 5, 6 without touching the camera at all.

**Phase 2** (recommended after the jam — see Open Decision 1): the isometric transform (§4) — camera, lane/river geometry, draw-order-by-depth (§5),
elevation (`h(entity)`). Answers acceptance criterion 7 more strongly (the base-color contrast becomes
part of screen composition, not just something to notice) and delivers the literal "fixed perspective
isometric 2.5D" look.

**Deliberately not in either phase**: sprite art (§11, unless Open Decision 3 goes the other way);
canvas-click-to-select (§4, hit-testing cost noted but not required — roster-list selection is
unaffected and sufficient); a fabricated "power"/gold HUD stat (§9 — explicitly rejected, not deferred);
fog of war / vision-limited spectator view (the sim's `VISION_RADIUS`/`AGGRO_RADIUS` are pilot-only
concerns — a spectator broadcast is and should stay omniscient, matching today's renderer).

## 15. Harder than it looks

- **The live "hard snap" is a pacing bug, not a rendering limitation** (§8) — the single most
  consequential finding here. Whoever implements this needs to know the fix lives in
  `src/live.ts`/`src/main.ts`, not in `render.ts`, or they will reach for client-side interpolation
  against a symptom instead of the cause, or worse, reach for speculative prediction past the
  confirmed frontier, which is unsafe (§8, "what must not change, and why").
- **The isometric transform changes which screen region each lane occupies**, not just how it's drawn
  — anyone with the current top-down mental map (including anyone who has seen a demo or a screenshot)
  has to relearn "bases are left/right." Small but real, and worth saying out loud rather than
  discovering it live.
- **The max-concurrent-entity measurement (§2) is from the deterministic mock backend on three
  matchups whose decision logic doesn't actually vary by prompt file** — it's a real measurement of the
  sim's *mechanics* (which don't vary by model), but not a survey of real model behavior. Cheap to
  close before treating it as final: run one real `qwen3.5:9b` log and check the same checkpoint field.

## 16. Phase 1 — as built (2026-09-22, branch `feat/render-phase1`)

Entity/pilot silhouettes (§6/§7), hit/death/cast feedback (§8), the live-motion pacing fix (§8), and
an HUD/viewport legibility pass (§9) are built, on the unchanged top-down camera and world/lane
geometry. `src/sim/*`, `src/rng.ts`, `src/pilots/*`, `src/types.ts` are untouched, per `npm run
test:arena`'s replay/verify tests staying green throughout. Where this section says the build
deviates from §1-§15 above, that text is left as originally written (design intent), not edited to
match.

**§6/§7 shapes, built largely as specced**, with one addition and one honest deviation:

- Nexus: a pulsing glow (outer ring + bright core) instead of a flat fill, giving it the "the thing
  you're defending" read §6 asked for without the elevation §4 would have given it (elevation is
  phase 2). Not specced explicitly; a reasonable reading of "height/glow" that doesn't require §4.
- Tower: drawn as a square rotated to the lane's own tangent direction (`nearestSegmentAngle` in
  `render.ts`) plus an inset "turret" square, so it visibly "stands" and is "oriented along the
  lane" per §6 without elevation. **Deviation**: the rotation is lane-angle + 45°, which produces a
  diamond for the top/bottom lanes' near-axis-aligned segments but cancels back to a plain
  axis-aligned square for the mid lane (whose segment is already ~45°/-45°) — mid-lane towers render
  as a square, same silhouette as before phase 1. Cosmetic, not a functional gap (§6 explicitly
  allows "today's square works as a footprint"); a future pass could pick an offset that never
  cancels, but that wasn't worth a special case for phase 1.
- Bearbot chassis: circle body + two small ear-bump circles, as §6 asked. Instrument markers
  (§7) are procedural strokes as specced — drums a double ring, violin a narrow oval with two
  f-hole-style notches. **Deviation from the first draft, corrected during the build**: keytar's
  three "key" notches were first drawn *parallel* to the diagonal bar (per a literal reading of "a
  long diagonal bar with 2-3 small notches"), which at bearbot scale just thickened the bar instead
  of reading as separate keys (confirmed by rendering it in isolation and inspecting the pixels —
  see the PR description's acceptance-criterion-3 verification). Redrawn with the notches
  *perpendicular* to the bar instead, which reads clearly at both debug and true in-game scale.

**§8 hit/death/cast feedback, built as a `RenderFx` class** (`src/render.ts`) holding the previous
frame's hp/alive/cooldown/position per entity id, keyed off wall-clock timestamps so every effect's
remaining life is `now() - startedAt` rather than a growing queue (§8's own forward-looking
constraint, for a possible future replay scrub). Two deviations, both forced by "pure read of
`Match` state, don't touch the sim":

- **Cast-pulse origin.** §8 says the radial pulse for `fill`/`chord` should be "at the cast point."
  `fill`'s effect genuinely *is* centered on the caster (`sim/match.ts` `applySlowAround(bot.team,
  bot.pos, ...)`), so that one is exact. `chord` (`aoe-burst`) resolves its actual detonation point
  from the ability's target inside the sim and never writes it back onto the `Bearbot`, so
  `render.ts` has no way to recover it without either touching `sim/match.ts` (not allowed) or
  reaching into the `Action` the pilot returned (not available to the renderer either — it only sees
  `Match` state). Both pulses draw at the caster's current position instead; for `chord` specifically
  this can visibly differ from where the burst actually landed (up to 180 units away, its range).
  Flagging this plainly rather than smoothing it over, per the brief.
- **Cooldown-transition cast detection**, not an actual "ability used" event. `RenderFx.trackBot`
  infers a cast from `cooldowns[name]` going from 0 to non-zero between two *rendered* frames. At
  1× (live or replay) this is exact — the sim can't recast an ability faster than one render frame.
  At high replay speed (16×) or during live catch-up, `Ticker` can step many sim ticks between two
  rendered frames; a bearbot that used and off-cooldown-recast the same ability within that window
  would show one pulse instead of two. Not exercised by anything in `test:arena` today (kick/fill's
  shortest cooldown is 6s, chord/glissando 7-9s — all far longer than one render frame even at 16×),
  but worth knowing if a future ability has a sub-second cooldown.
- **Minions get no death-fade.** `sim/match.ts` `updateMinions` splices a dead minion out of
  `match.minions` the same tick it dies, so no state survives into the next render call to animate a
  fade for — `RenderFx` would have to invent a "ghost minion" from nothing, which isn't a read of
  `Match` state anymore. §8's death bullet says this "reinforces criterion 6 for bearbots and towers
  especially," and §6 already frames minions as the deliberately unornamented "background unit," so
  minions keep the pre-phase-1 instant-disappear behavior. Towers, the nexus and bearbots all persist
  with `alive: false` after death and get the full fade-then-permanent-dim-husk treatment.

**§8 live-motion pacing fix, built as `LivePacer`** (`src/live.ts`), wired into `src/main.ts`'s
`attachMatch`. Confirms the trace in §8 exactly: the bug was `catchUp` being computed once and never
re-evaluated, making `Ticker.speed()` return `Infinity` for an entire live match instead of only the
initial catch-up. `LivePacer` still returns `Infinity` while more than one round's worth of ticks are
confirmed-but-unrendered (a fresh load or a reconnect — real catch-up, not prediction); once within
one round of the frontier, it releases ticks at a speed held constant between round arrivals and
recomputed only when a round actually lands, seeded conservatively (a full cadence) before any real
arrival-timing exists, and refusing to fold backlog-burst arrivals into its moving-average estimate
(see `render.ts`'s and `live.ts`'s own doc comments for why a *continuously* time-varying `speed()`
would have starved `Ticker`'s own stepping loop instead of fixing it). Tested directly in
`tools/arena/test_browser.mjs` (three new cases); not something a screenshot can show, per the
brief's own framing of this as logic, not drawing.

**§9 HUD/viewport legibility, built as a CSS-only pass** (`src/style.css`) plus a small render-side
contrast bump (lane/river borders): responsive topbar type via `clamp()`, a `flex-wrap` topbar so
buttons don't force horizontal overflow, and — found only by actually screenshotting a narrow
viewport, not by inspection — the sidepanel's fixed 340px width made the roster/prompt panel
completely unreachable below about 720px wide (`overflow: hidden` on `body` meant there was no way
to scroll to it). Fixed with a `max-width: 720px` media query that stacks `.main` into a column
(canvas on top, roster below, independently scrollable). Left as `render-spec.md` §4 already flagged:
a short/wide landscape phone viewport (e.g. 667×320) still needs a scroll to reach the roster below
the square canvas — nothing is unreachable, but it isn't one screenful. A canvas-aspect cap (e.g.
`min(vw, vh*k)`) would fix that too; out of scope for a "CSS-only pass."

**Verified, not just written** — see the PR description for the acceptance-criteria-by-criteria
detail: a real (non-mock) desktop screenshot, a phone-portrait (375×667) and short-landscape
(667×320) screenshot, isolated synthetic scenes for the instrument markers and for every §8 effect
(hit flash, death fade → husk, cast pulse, cast streak) rendered through the real `render()` function
in an actual browser via Playwright (installed ad hoc into the gitignored `artifacts/` directory for
this verification, not added as a project dependency), and the full `test:arena` + `test:tools` gates.
