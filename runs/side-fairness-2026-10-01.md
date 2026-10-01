# Side fairness: why `pvp-1` favoured violet, and the fix — 2026-10-01

**Question.** The economy P2 job ([`docs/economy-spec.md`](../docs/economy-spec.md) §13.3) found
that on `pvp-1` the game favours violet. With every bearbot holding at base, violet's minions
spent 48 one-second samples a match under green towers, against green's 2. On `v1` it was 741
against 741. Re-ordering green's minions first cut the edge to 36 vs 18 but did not flip it, and
the rest was not traced. Violet took the first tower in 23 of 24 slice matches, so "medium beats
hard" was really "violet beats green". What is the whole cause, how much does each part add, and
what makes the two sides symmetric without changing how any old log replays?

## Verdict

- **The whole cause is the frozen sim's update order. The `pvp-1` geometry is mirror-exact.**
  - `src/sim/match.ts` resolves its bearbot step and its minion step one unit at a time, in array
    order. Violet's bots come first in the roster. Violet's minions are pushed first in every wave,
    and older waves come before newer ones.
  - Spawn green first within each wave, keeping everything else, and the result is exactly
    mirrored: **2 vs 48**, minion-seconds 5,062 vs 5,478, against 5,478 vs 5,062.
  - Nothing is left over for the map to explain.
  - The P2 job's "green first every tick" isn't the mirror of spawn order. It also moves green's
    newest wave ahead of violet's older survivors. That is why it only reached 36 vs 18.
- **Order biases a fight in three ways.** They point different ways, and lane geometry decides
  which ones apply. That is why the edge looked like more than one cause:
  1. **The kill volley.** The first side to update lands its whole volley before the victim fires
     its last shot. On mid at 49.2 s, the first wave's 3-v-3 ends with violet's two survivors on 114
     hp against green's 108.
  2. **The approach.** When one unit's step closes the gap to attack range, the unit that updates
     *after* it swings first. On top and bottom at 52.3 s, this hands green the first hit.
  3. **Older before newer.** A wave's survivor acts before the next enemy wave. The as-played and
     green-first runs part ways at 75.75 s, at the second wave in top and bottom.
- **The map decides whether the order bias shows.** On `v1` the outer towers (0.42 of the lane)
  cover the point where waves meet: 90 units from each tower on mid, against a range of 160. Tower
  fire then settles the wave fight, the same way for both teams. `pvp-1` pulled the towers back to
  0.30, leaving that point uncovered. So the order bias decides the fight, and violet's survivors
  walk on to green's tower.
- **Bearbots are biased the same way.** In a mirror match (the same symmetric scripted pilot on all
  six bots, minions already fixed), the mid duel at 282.85 s goes to the side whose bots update
  *second*. Violet loses 2 bots to 1 and 779 tower hp to 30. Flip the bot order and the result
  flips exactly.
- **The fix: `simultaneous-1`, a versioned tick resolution, on by default for new matches**
  (`src/resolution.ts`). It replaces the bearbot and minion steps on the match instance with the same
  rules resolved simultaneously; the sim's own source is not touched. Every unit alive at the start of
  a step acts on the step's start positions, lives and slows. Moves land together at the end. Damage
  lands at once, but a unit taken to 0 dies at the end of the step, after everyone has acted.
- **Symmetry after the fix:**
  - **Bots at base, `pvp-1`, 8 seeds:** **0 vs 0** samples under enemy towers, minion-seconds
    **5,229 vs 5,229**.
  - **`v1`:** unchanged at 741 vs 741.
  - **Mirror match:** a scripted mirror match stays its own exact mirror image every tick for 600 s,
    and bot order no longer matters. Both are tests in `tools/match/test_resolution.mjs`.
- **Old logs replay exactly as before.** A log records `resolution` only when it isn't
  sequential. A log without the field replays on the specimen's own order.
  - **Checked across 489 distinct match logs on this machine:** every log in the repo and in every
    promptlane worktree, including the running gate job's and Bandstand v2's (#55) logs.
  - **What was compared:** each replayed on `origin/develop` (`4ba0054`, after #55) and on this
    branch. Both verify every one, and the full `npm run metrics` JSON is byte-identical for all
    489.
  - **What they covered:** v1, pvp-1, respawn-1, eco-1, eco-2, river-1, river-2, recall-2.
  - The only logs that differ are this run's 10 new `simultaneous-1` logs. Develop can't replay
    them, and this branch verifies them.
- **Jev check, sides swapped, $0.76:** house medium vs house hard on `pvp-1`, 5 seeds, each played
  both ways (10 full matches), all under `simultaneous-1`.
  - **The tiers came out level:**
    - first tower: medium 5, hard 5;
    - decided matches: 2 each;
    - towers lost: 8 each;
    - deaths: medium 10, hard 8.
  - **Violet still took the first tower in 8 of 10.** Two-sided sign test p ≈ 0.11. In the slice
    it was 23 of 24 (p < 0.0001).
  - **The pilot path is side-neutral to within Jev's own noise.** Asked twice about the same
    state, Jev fired the same rule 98.8 % of the time. Asked about the state and its mirror image,
    97.5 % (402 observations from these logs). The action mix for the same states seen as violet
    and as green is level: attack 85 vs 90, ability 41 vs 38.
  - So the 8 of 10 is consistent with chance, but 10 matches can't rule out a smaller edge. A
    larger side-swapped run would.

## Bots at base: what each order does

Every bearbot holds at its spawn for 600 s; minions only. A "sample" is one minion inside an enemy
tower's range at a whole second. 8 seeds. Every seed gives the same numbers: the seed only jitters a
spawning minion for the one tick before it snaps onto its lane.

| map | minion order | violet under green towers | green under violet towers | minion-seconds V / G |
|---|---|---|---|---|
| v1 | as the sim does it | 741 | 741 | 3,999 / 3,999 |
| pvp-1 | as the sim does it | **48** | **2** | 5,478 / 5,062 |
| pvp-1 | green first, every tick (the P2 job's test) | 36 | 18 | 5,372 / 5,138 |
| pvp-1 | violet and green alternate first, tick by tick | 52 | 2 | 5,486 / 5,036 |
| pvp-1 | towers green first (minions as the sim) | 48 | 2 | 5,478 / 5,062 |
| pvp-1 | spawn order with green first in each wave (the exact mirror) | **2** | **48** | 5,062 / 5,478 |
| pvp-1 | **`simultaneous-1`** | **0** | **0** | **5,229 / 5,229** |
| v1 | `simultaneous-1` | 741 | 741 | 3,999 / 3,999 |

- **Per lane, as the sim does it:** mid violet 18; top violet 15, green 1; bottom the same as top.
- **Per lane, green first:** mid flips cleanly to green 18. Top and bottom still go violet, 18
  each, because of effects 2 and 3 above.
- **Tower order does nothing:** a tower can't hurt a tower, so no tower's update changes what an
  enemy tower sees.
- **Geometry:** a tick-by-tick mirror trace ((x, y) → (y, x) maps each lane onto itself and swaps
  the bases) has violet's and green's minions within 1.3 × 10⁻¹¹ of each other's mirror image
  until the first fight resolves.

## What `simultaneous-1` changes, exactly

The rules don't change: the same stats, ranges, aggro radius, targeting and tie-breaks.
`src/resolution.ts` restates the specimen's bearbot loop body and minion step with these
differences:

- Positions, lives (`alive`) and the slow and solo timers are read as they were at the start of the
  step. A slow cast this step applies from the next.
- Each unit's move is held until every unit of that step has acted, then all moves land.
- Damage lands at once (attribution, last hits and lifesteal see each hit as it happens). A unit
  taken to 0 hp is noted, not killed. It still acts this step, and it dies at the end of the step
  even if something healed it meanwhile. Two bots that kill each other on the same tick both die
  (a test).
- The tower step is untouched: no tower's update changes what an enemy tower sees.

**Replay.** `MatchLog.resolution` is set to `simultaneous-1` by the runner (`runMatch`, the CLI,
the arena, the evolution harness). `verifyReplay`, `npm run metrics` and the browser's
replay/live view attach whatever the log names. A log without the field replays sequentially,
which is every log written before this change. Dropping the field from a `simultaneous-1` log makes
its replay diverge (a test), so the field is load-bearing, not decoration. A later change to the
resolution is a new name; `simultaneous-1` stays as written so its logs replay.

**Attribution.** `src/attribution.ts` now counts a hit as the kill when it takes a still-living
unit from above 0 hp to 0 or below, and stops damage at 0. Under the sequential order a living unit
never has hp ≤ 0, so that branch never runs and every old log measures byte-identically (the 489
above).

**What pins it.**
- `npm run match -- --resolution sequential` plays the old order.
- An evolution campaign created before this change has no `shape.resolution`, so it keeps playing
  `sequential` (its cache was built on it). A new campaign hashes `resolution=simultaneous-1` into
  its match keys.
- `measure_economy.mjs` passes `--resolution` explicitly. It refuses to add matches to a date whose
  existing logs were played under another resolution, so a resumed run never mixes the two.

## Jev check: seed-paired, sides swapped

House medium (`house-violet.md` + `house-medium.schemas.json`) vs house hard (`house-hard.prose.md` +
`house-hard.schemas.json`). Settings:
- `pvp-1`, no economy, no objective, cadence 2, full 600 s, `--resolution simultaneous-1`;
- one `schema_server.py --jev-backend typesafe` on its own port, capped at $0.95;
- 0 call errors and 0 failovers;
- all 10 logs replay-verify.

| seed | violet | green | first tower taken by | result | deaths V–G | towers lost V–G |
|---|---|---|---|---|---|---|
| 7 | medium | hard | violet (medium) @335s | draw | 1–0 | 1–1 |
| 7 | hard | medium | violet (hard) @270s | draw | 2–1 | 1–1 |
| 11 | medium | hard | violet (medium) @305s | draw | 1–2 | 1–1 |
| 11 | hard | medium | violet (hard) @300s | violet (hard) | 0–1 | 0–1 |
| 42 | medium | hard | green (hard) @350s | draw | 3–1 | 1–1 |
| 42 | hard | medium | green (medium) @340s | green (medium) | 1–1 | 1–0 |
| 101 | medium | hard | violet (medium) @245s | violet (medium) | 2–0 | 0–1 |
| 101 | hard | medium | violet (hard) @295s | violet (hard) | 1–0 | 0–1 |
| 3 | medium | hard | violet (medium) @335s | draw | 0–1 | 1–1 |
| 3 | hard | medium | violet (hard) @335s | draw | 0–0 | 1–1 |

- **By tier:**
  - first tower: medium 5, hard 5;
  - decided matches: medium 2, hard 2;
  - towers lost: medium 8, hard 8;
  - deaths: medium 10, hard 8.
- **By side:**
  - first tower: violet 8, green 2;
  - decided matches: violet 3, green 1;
  - towers lost: violet 7, green 9;
  - deaths: violet 11, green 7.
- **Each seed's first tower went to the same side both ways round.** The seed has no lever in
  these matches: it only jitters a minion for one tick. Jev is not deterministic, and two same-seed
  runs diverge within a minute (`runs/house-tiers-2026-09-30.md`). So this pattern is post hoc, and
  nothing in the sim explains it. The mirror test proves the sim plays a symmetric pilot
  symmetrically.
- **Is the pilot path the leftover edge? Measured: no, not detectably.**
  - What Jev sees (`describe_observation`, `tools/jev/fidelity_harness.py`) is not mirror-blind. It
    says "violet-team" or "green-team" and gives raw coordinates and entity ids.
  - So 402 real observations from these 10 logs (every 40th real decision) went to Jev three ways:
    as played, as played again, and mirrored (teams swapped, every (x, y) → (y, x)).
  - **Same rule, asked twice:** 98.8 %.
  - **Same rule, as played vs mirrored:** 97.5 %. Only 5 of 397 states with a stable answer
    changed under the mirror.
  - **Action mix, the same states seen as violet / as green:** move 228 / 230, attack 85 / 90,
    recall 48 / 44, ability 41 / 38.
  - $0.054.
- **Not done:** a run big enough to bound a residual edge. At about $0.074 a match, 24 more
  side-swapped matches would be about $1.80.

**The logs** are on the
[`data-side-fairness-2026-10-01`](https://github.com/kumouri/promptlane/releases/tag/data-side-fairness-2026-10-01)
prerelease as `side-fairness-match-logs-2026-10-01.zip` (856 KB, sha256
`2d7a7c0f3be39b5034eb97d3a80e138e823d327299c882bcf7a5a2723398ae43`). Inside are:
- the 10 logs (`side-fairness-2026-10-01-{mv,hv}-seed<N>.json`, where `mv` is medium violet);
- the probe's 402 rows (`side-fairness-2026-10-01-jev-mirror-probe.json`);
- a `SHA256SUMS`.

Unzip at the repo root, then `npm run match -- --verify runs/<log>`.

**Cost.** **$0.7623** by the schema servers' own ledgers: matches $0.7085 and probe $0.0538, at
TypeSafe's $0.042 per million input tokens. Output tokens are unmetered. TypeSafe's API reports
tokens, not dollars, so the ledger is the record.

## What this means for results measured so far

All of these were played on the sequential order. On `pvp-1` that gives violet extra minions in
every lane. On `v1` it still gives violet's bearbots the first swing in a trade.

- **Winner, side and tier reads on `pvp-1` are side effects, not findings.**
  - The economy slice's "all 10 decided matches went to violet (house medium)".
  - The P2 smoke's and slice's "medium beats hard", and violet's 23 of 24 first towers.
  - The first Bandstand run's capture split: 24 of 29 captures by medium's violet side, a split of
    20.8 %.
  - The redesign's (#55, `runs/bandstand-2-2026-09-30.md`) "new one-sidedness": in hard vs hard
    under `river-2`, violet took all 11 captures, every one uncontested. That pairing is a mirror
    (the same tier on both sides). Its doc names §13.3's minion edge as the likely cause, inferred
    rather than traced. This trace supplies the mechanism: green's bots stay in a lane that violet's
    waves press. So `river-2`'s 50 % split, which passed only through medium vs hard, needs
    re-measuring under `simultaneous-1`.
  - None of them can be read as about the tiers or the Bandstand. They need re-measuring under
    `simultaneous-1` with sides swapped.
- **Paired deltas stand as like-for-like comparisons.** This covers the PvP study's map deltas, the
  slice's eco-1 vs off, and the Bandstand's P vs O. Both arms of every pair ran on the same order,
  with the same side assignment.
- **But they were measured in a violet-tilted game, and two may move.**
  - The PvP study compared `pvp-1` (tilted) with `v1` (even minions). So its map deltas include the
    tilt: "bot-time on the opponent's side 17.4 % → 21.5 %" may be partly violet riding a minion
    surplus.
  - The Bandstand's hard-vs-hard stalemate is a mirror pairing, so it is likelier to survive. It
    still needs a check.
- **The house-tier study (`v1`).** Its bots-at-base run is even. But "every one of the 6 decided
  matches went to violet" is what effect 1 and the bearbot order would do. That is a candidate
  explanation, not a measured one.
- **Running or just landed, both on `pvp-1`.** Each ran from its own worktree on the order it
  started with, so neither was changed mid-run.
  - **The economy gate run (job 9b9a).** All four conditions share the tilt, so §6.2's paired
    economy metrics stay internally comparable. Its winner, comeback and "decided" reads are side
    effects. Its matches are not comparable with matches played after this lands.
    - If it is resumed from a checkout that has this change, `measure_economy.mjs` will refuse to
      mix: pass `--resolution sequential` to finish it as it started.
  - **Bandstand v2 (job ccf8).** Merged as #55 while this ran. Its capture splits and win reads by
    side are confounded, as above. Its `recall-2` finding (minions interrupt every channel, so bots
    die standing in lane) is about the recall rule, not the side, and should hold.
- **Evolution campaign 1** keeps its sequential order: its shape predates the field. Its
  candidates play both sides of every seed, so its fitness is side-balanced anyway.
- **The arena and the entrants preview** play `simultaneous-1` once they run code with this change
  (the entrants repo after its `PROMPTLANE_REF` bump). Ladder results from before are on the old
  order. The ladder alternates sides by placement seed, which balances them only on average.
