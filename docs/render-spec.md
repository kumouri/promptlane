# Elysium viewer — isometric 2.5D render spec

**Status: SPEC ONLY — nothing in this document is built.** Written 2026-09-22 in response to Ceryce's
one-line brief (Telegram, 2026-09-22 20:46 CT): *"spec out making the game look decent in elysium. I'm
thinking like fixed perspective isometric 2.5D or something, so we can see creeps vs bearbots and the
drum bot vs the violin bot, etc. I'm not tied to anything other than 'enough to make it fun to watch'."*
This is a design document and a set of decisions, not an implementation. No renderer code was written
or prototyped for it.

Read with: [`../src/render.ts`](../src/render.ts) (the renderer this replaces), [`../src/sim/map.ts`](../src/sim/map.ts),
[`../src/sim/entities.ts`](../src/sim/entities.ts), [`../src/sim/match.ts`](../src/sim/match.ts),
[`../src/live.ts`](../src/live.ts), [`arena-site-spec.md`](arena-site-spec.md) §3.4 (live stream) and
§6 (jam-day sequence, round-one screen share), [`design.md`](design.md) (presentation-layer ethos).

---

## 1. What this replaces

`src/render.ts` (156 lines) is the current renderer: an orthographic top-down read of `Match`, drawn
straight onto a square canvas with no rotation — `ctx.translate/scale` only. Every unit is a filled
circle (nexus, minion, bearbot) or a filled square (tower); team is color (`#8e00ff` / `#00ff0f`);
a bearbot's instrument is a single black letter (`D`/`K`/`V`) drawn on top of its circle. That letter
is exactly what Ceryce is asking past — legible up close, invisible from across a room, and not a
silhouette.

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
correct against this spec when a person who has never seen promptlane, watching a **screen share or a
projector from across a room**, can do all seven without being told anything except "watch this":

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
genuine elevation (nexus looms, towers stand tall, creeps sit on the ground), and it improves the
screen composition for a **widescreen projector** (constraint 5), which the current top-down square
render does not.

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
improve the lane-silhouette or widescreen-composition wins above. **I recommend the true isometric
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
  slightly under the iso scale so it survives distance-viewing), a distinct chassis silhouette (e.g. a
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
- **Legibility pass for distance viewing** (constraint 5: this is a projected/shared screen, not a
  laptop). The current `.topbar`/`.score` CSS was sized for someone sitting at a keyboard. A phase-1,
  CSS-only pass (larger score/clock type, higher contrast, thicker strokes on lane/river borders) is
  cheap and directly serves acceptance criteria 1 and 7 — flagging it here so it isn't dropped as
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

**1. Ship before or after the Oct 2 jam?** *Recommend: after.* Round one is a screen share of this
exact page (`arena-runbook.md` §6); the semis/final are live in front of people, and Phase B's own
checklist still has an unchecked "dress rehearsal on the projector" item. Landing a renderer rewrite
into that window adds risk to an already-tight schedule for a feature she raised while resting, not
under jam pressure. Cost of recommended: the jam itself is watched on today's top-down/letter renderer.
Cost of the alternative (ship before): real engineering time competes with the rehearsal in the same
two weeks.

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
look better this pass?** *Recommend: include it.* It's a small, additive, isolated change to
`src/live.ts`/`src/main.ts`'s pacing policy — it doesn't touch the sim or the replay-verification
contract — and it directly answers the brief's constraint 3 ("the gap between rounds... treat it as a
first-class design problem, not an afterthought") and acceptance criterion 5. Cost of recommended: it's
the one piece of this spec that touches decision-arrival timing logic rather than pure drawing, so it
carries slightly more risk than a rendering-only change. Cost of the alternative: the isometric,
better-silhouetted viewer would still visibly "freeze then teleport" every ~5 seconds in live mode,
which is the single complaint most likely to undercut "fun to watch" for the people it matters most for
(the live semis/final, watched by a room).

## 14. Phasing

**Phase 1** (if greenlit — see Open Decision 1): entity silhouettes (§6/§7) on the current top-down
camera, hit/death feedback (§8, feedback bullets), the live-motion pacing fix (§8, mechanism), and the
HUD legibility pass (§9). Shippable and testable against acceptance criteria 1, 2, 3, 4, 5, 6 without
touching the camera at all.

**Phase 2**: the isometric transform (§4) — camera, lane/river geometry, draw-order-by-depth (§5),
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
