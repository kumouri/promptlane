# Base tower: one tower in front of the nexus, and downing it wins — 2026-10-02

**Question.** Ceryce, 2026-10-02 19:39 CT: "I'm still not sure if matches mostly going to towers
instead of nexus kills is wanted… In most MOBA games the Nexus itself is easy to kill with some hard
towers in front of it you have to take down. Can we try 300, 500, one tower in front of the Nexus at
700 and if you down that you win?"

On `pvp-1-hp400` (#93), towers fall before 8:00, but matches are won by a tower **lead** at the Final
Chorus (`src/finale.ts`) or in sudden death. They are almost never won by a nexus kill. This job
builds the map she asked for and measures how matches end on it, both under the Jam ruleset (the
Chorus on) and as the live arena runs today. It also answers her question about tower aggro (§0.5).

- **Budget:** Jev hard stop **$4.00**.
  - $0 work comes first: the sim, replays, the counterfactual, and the stand-in (ranking only).
  - Jev is spent only on §1.3's blocks, and that plan is committed before the first paid match.
- **Out of bounds:**
  - `src/sim` (frozen);
  - the live arena and its backend (`:8790`, `:8797`);
  - other jobs' branches and worktrees.

## Verdict

*Written after the run. §0–1 were committed (`e2c70f1`, amended `de206ad`) before the first paid
match.*

- **Built:** `pvp-1-hp300-base700`, opt-in.
  - Outer towers 300, inner 500.
  - One 700-hp base tower 100 units in front of each nexus. It can be hit only once one of its team's
    inner towers has fallen.
  - **Downing it wins, as a nexus kill (`endReason: 'nexus'`)**: the nexus falls with it.
  - `pvp-1` stays the default. §0.1 has every choice and the readings not built.
- **On Jev, no base tower fell in any of the 20 matches played on it, Chorus or not.** The bots take
  an outer tower, and almost never the inner tower behind it.

| block (8 matches unless noted) | base-tower kill | Chorus lead | sudden death | 10:00, more towers | 10:00 draw | decided | lane tower before 8:00 | inner tower before 8:00 | median length |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Jam ruleset (Chorus on)** | | | | | | | | | |
| M: pvp-1 (#90 §4) | — | 0 | 8 | — | — | 8 | 0 | 0 | 8:42 |
| T: `pvp-1-hp400` (#93) | — | 5 | 3 | — | — | 8 | 6 | 0 | 8:00 |
| **N: new map** | **0** | 5 | 3 | — | — | 8 | 5 | 0 | 8:00 |
| NF: new map, Chorus off (4) | **0** | — | — | 2 | 2 | 2 of 4 | 2 | 0 | 10:00 |
| **As the live arena runs (no Chorus, economy, recall or objective)** | | | | | | | | | |
| AP: pvp-1 (today's arena) | — | — | — | 3 | **5** | 3 | 2 | 0 | 10:00 |
| AH: `pvp-1-hp400` | — | — | — | 6 | 2 | 6 | 5 | 2 | 10:00 |
| **AN: new map** | **0** | — | — | 8 | 0 | **8** | 8 | 0 | 10:00 |

- **The Chorus doesn't pre-empt base kills; there are none in reach for it to pre-empt.**
  - At 8:00 in N, no inner tower had fallen (the most any had lost was 63 of 500), so no base tower
    was even open.
  - With the Chorus off (NF, the same slots), the two extra minutes produced:
    - one inner tower down, at 9:44;
    - one base tower opened, which took 116 of its 700;
    - no kill;
    - two draws.
  - **The Chorus is the decisiveness lever, not the nexus-kill lever.** On these bots, the
    nexus-kill lever is how far they push.
- **The live arena today (AP) draws 5 of 8:** no Chorus, and no respawn (§0.4). The new map
  decides all 8, but by the 10:00 tower count, never by a base kill.
  - In AN, a base tower was opened 3 times, at 8:12 or later, and none was hit. Six of AN's 8
    matches had a whole team dead by the end.
- **The stand-in called it:** 0 base kills in 54 stand-in matches on the new map (§0.3). The $0
  forecast for N held, except that N had 5 of 8 first towers before 8:00, not 6.
- **Aggro (§0.5):**
  - A bearbot that attacks an enemy bearbot under that enemy's tower, while its own minions are in
    the tower's range, is never shot. 0 of 135 such divers died within 5 s, against about 1 in 10
    of the others.
  - It comes up about 1.5 times a match, as a single hit of about 12. That is 0.6 % of PvP damage.
  - MOBA-style aggro would change little until bots dive.
- **Spend: $3.4338 of the $4.00 stop**, on one server's ledger: 36 matches, 46,534 requests, 0
  errors, 0 failovers. Every log replay-verifies.

## 0. Design and diagnosis, at $0

### 0.1 The map: `pvp-1-hp300-base700` (opt-in)

pvp-1's geometry and tower range, with:
- **outer towers 300 hp, inner towers 500**, through the variant's `towerHp` (#93);
- **one base tower per team, 700 hp**, through a new `baseTower` field on the variant
  (`src/baseTower.ts`);
- the nexus unchanged at 2200.

`DEFAULT_MAP` stays `pvp-1`. A variant without `baseTower` attaches nothing, so every older log
replays. Block M's and T's 16 Jev logs re-verify on this branch. The name carries the numbers,
because a changed number is a new name.

**Decisions, and why:**

| question | decision | why |
|---|---|---|
| where it stands | 100 units in front of the nexus centre, on the mid lane, toward the map centre (× the map's scale) | Every lane ends at the nexus, so it is in front of the nexus from all three lanes. It sits clear of the nexus (55 + 28 < 100) and of the inner towers (mid inner 81 away). It covers the nexus and the last ~200 units of the top and bottom lanes. |
| what it is | a tower in the sim's own `match.towers`: lane `mid`, **tier 3** at runtime, the map's 160 range, 18 damage a second, minions first | The frozen sim then shoots with it, lets minions and bearbots target it, observes it, checkpoints it, and counts it for the Chorus and the 10:00 tiebreak, all unchanged. A log on this map has 14 towers. |
| **downing it wins** | its nexus falls with it on the same tick, so the sim ends the match its own way: **`endReason: 'nexus'`** | Ceryce asked for it to be treated as the nexus kill. Every reader already treats `'nexus'` as "the base was taken": the viewer's "NEXUS DESTROYED", `load.mjs`'s `nexus-kill`, the metrics, and the Chorus's own rule that "a nexus kill still ends the match, before or during sudden death". A new reason would need every one of them changed and would say nothing new. On this map a nexus can only fall with its base tower, and the log records the map, so the reading is unambiguous. `result.baseTower` records when each base tower opened and fell. |
| **can it be hit while the inner towers stand?** | **No (`needsInnerDown: true`):** it takes no damage until at least one of its team's inner towers has fallen, in any lane | This is the MOBA convention: Dota's backdoor protection, and League's nexus turrets. It is also her own words: "hard towers in front of it you have to take down". Without it, a bot could walk past both lane towers and win on one 700-hp target, and the lane towers would be optional. One field; `false` is the other reading. |
| does the old nexus still exist? | Yes, unchanged, as the thing the base tower guards. It **can't be hurt while its base tower stands**, and falls with it | That leaves exactly one structure that wins, the base tower, as she asked. The nexus stays for the viewer, the sim's own win path, and the replay's id base. |
| both base towers fall on one tick | a **draw** (`'nexus'`, no winner) | Left to the sim, its nexus loop checks violet's first, so green would win. That is the same side bias the `simultaneous-1` resolution removed. |

**How "takes no damage" works from outside the frozen sim:**
- The sim applies damage in a dozen places (attacks, abilities, AoE, minions).
- So at the end of each tick, just before the sim's own `checkWinConditions`, a protected base
  tower or nexus is put back to full hp and alive.
- A protected structure has never kept damage, so "full" is exactly what it had. The Chorus rescales
  `maxHp` too, so this holds in sudden death. One tick can't take a protected structure from full
  to 0.
- Hits on it still reach attribution listeners before they are undone, so the metrics tool's
  structure damage includes them.

**Readings of her words, and the alternatives not built:**
- "300, 500": outer 300, inner 500, the same tiers #93 cut. Inner 500 stays tougher than the outer
  300.
- "one tower in front of the Nexus": one per team, not League's two.
- Not built, each a one-field change:
  - (a) no backdoor protection;
  - (b) the base tower opens only when the inner tower of the **same lane** falls (it guards all
    three lanes, so any lane opens it);
  - (c) the nexus stays separately killable after its base tower (she said downing it wins);
  - (d) a new end reason such as `'base-tower'`.

**What Jev sees:**
- The base tower is in the observation's own tower list, like any tower. vocab-2 describes it as
  "Your/Enemy tower tw-N (mid, 700/700 hp)".
- No description, compile or prompt changed.
- No house or entrant rule targets it by name. "Nearest enemy tower" picks it only when it is the
  nearest enemy tower listed. In practice, that means a bot already at that lane's inner tower or past
  it.
- A protected base tower reads as full hp: the description doesn't say it is protected.

### 0.2 What the bots deal before the Chorus (recorded Jev logs, $0)

#93's method:
- A tower's hp changes nothing in the sim until it dies.
- So in a recorded match, the first tower that would fall at hp H is the first one whose lost hp
  reaches H.
- The base tower stands from tick 0, so this is a forecast, not exact. It shoots near its base, and
  its line is in the description of bots near it.

On #90 §4's block M (pvp-1) and #93's block T (`pvp-1-hp400`), the same 8 slots and the same bots:
- **The first lane tower at 300 would fall before 8:00 in 6 of 8, on both.**
  - The median is 6:23 on M and 6:00 on T, the earliest 4:15.
- **No inner tower is close.**
  - Before 8:00, no inner tower in M or T lost more than 86 hp. T's damage came after its own first
    fall; M's inner towers took none.
  - So no base tower can open before the Chorus. To win, a team must drop an outer (300) and an inner
    (500), then a 700 base tower, in one push.

### 0.3 The stand-in, after the first fall ($0, ranking only)

#88's model-free Jev stand-in (`pl_oracle_server.py`, #93's kit with its rates), 6 pairings × 3 seeds
per condition. It overstates pre-8:00 tower damage by about 1.8× (#88 §0.2), so it is generous to
pushing. It ranks; it is never a result.

| condition | base-tower kills | Chorus lead | sudden death | 10:00 tiebreak decided | draw | lane tower before 8:00 | inner tower fell at all | median length |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Jam, pvp-1 | — | 1 | 17 | 0 | 0 | 1 of 18 | 0 | 8:21 |
| Jam, `pvp-1-hp400` | — | 9 | 9 | 0 | 0 | 10 | 1 | 8:02 |
| **Jam, new map** | **0** | 9 | 9 | 0 | 0 | 10 | 0 | 8:03 |
| Jam without the Chorus, pvp-1 | — | — | — | 11 | 7 | 0 | 0 | 10:00 |
| Jam without the Chorus, `pvp-1-hp400` | — | — | — | 12 | 6 | 7 | 1 | 10:00 |
| **Jam without the Chorus, new map** | **0** | — | — | 13 | 5 | 14 | 0 | 10:00 |
| arena, pvp-1 | — | — | — | 0 | **18** | 0 | 0 | 10:00 |
| arena, `pvp-1-hp400` | — | — | — | 10 | 8 | 7 | 1 | 10:00 |
| **arena, new map** | **0** | — | — | 13 | 5 | 7 | 1 | 10:00 |

- **No base tower fell in any of the 54 stand-in matches on the new map, Chorus or not.**
  - Without the Chorus, an inner tower took at most 466 of its 500 by 10:00 (median 213).
  - The two extra minutes don't get a push through the second tower.
  - **If the stand-in is right, it is not the Chorus that keeps nexus kills away. It is that today's
    bots never push past one tower.**
- **The arena is a different game: no economy means no respawn.**
  - The specimen sim never respawns a bearbot; respawn is part of the economy layer.
  - On the arena config, a median of 1 bot of 6 is alive at 10:00, and a whole team was wiped in 45
    of 54 stand-in matches.
  - The survivors still don't take the inner tower.
  - On pvp-1 every stand-in arena match was a draw: no tower fell, so the 10:00 tiebreak found the
    towers level and the nexuses untouched.

### 0.4 What the live arena actually plays

`tools/arena/queue.mjs` with `config.example.json`, the live config's shape:
- map pinned to `pvp-1`;
- economy `none`; no objective, recall or finale;
- the runner's default resolution (`simultaneous-1`) and targeting (`own-lane-1`);
- cadence 2;
- the full 10:00.

So a match ends by a nexus kill or by the sim's 10:00 tiebreak: more towers standing wins, then
nexus hp, else a draw. Block A* plays exactly those lines (§1.1).

### 0.5 Ceryce's aggro question: towers shoot minions first, and never switch to a diver

**The rule.** `updateTowers` in `src/sim/match.ts` (frozen):
- Each tower takes the enemy units in its range, minions first, then bearbots, in array order (not
  nearest).
- It shoots one of them each second.
- Nothing changes its target when a bearbot attacks an enemy bearbot under it.
- So a bearbot that brings its minions into an enemy tower's range can hit the enemy bearbots there,
  and the tower shoots the minions.

**What it does in the logs.** Measured at $0 on 74 recorded Jev matches: #88's 20, #90 §2's 16, #90
§4's 8 and #93's 30 (22 of them on `pvp-1-hp400`). Each was replayed, and all 74 verify.

Definitions (`ng_dives.mjs` in the data kit), for a PvP hit (a bearbot's attack or ability on an
enemy bearbot):
- **under tower:** the attacker, at the hit, is within the range of a living tower of the victim's
  team;
- **shielded:** that tower has at least one of the attacker's minions in range, so by the sim's rule
  it shoots a minion, not the attacker;
- **episode:** consecutive under-tower hits by one attacker under one tower, with gaps under 2 s.

| | count | share |
|---|---:|---:|
| PvP hits | 21,448 (289,266 damage) | |
| … from under the victim's tower | 884 (11,418 damage) | 4.1 % of PvP hits |
| … of those, **shielded** (the tower had the attacker's minions in range) | **125** (1,607 damage) | 14.1 % of under-tower hits; **0.6 % of all PvP damage** |
| dive episodes | 710 | in 74 matches |
| … shielded | **108** | 15.2 %; in 44 of 74 matches; median 1 hit, about 12 damage |
| attacker died within 5 s of the episode | shielded **0 of 108**; unshielded 65 of 602 (10.8 %) | |

- **The rule does what she suspected:** a diver with minions under the tower is never punished.
  No shielded diver died within 5 s, against one in nine unshielded.
- **It almost never comes up:**
  - About 1.5 shielded dives a match, each a single hit of about 12.
  - Shielded dives are 0.6 % of all PvP damage, and all of them happened under outer towers.
- In 705 of the 710 episodes, the victim stood under its own tower too.
- Today's bots rarely fight under an enemy tower at all: 4.1 % of their PvP hits.
- **So MOBA-style aggro (a tower switches to a bearbot that attacks an enemy bearbot under it)
  would change little in today's matches.** It would matter for bots that learn to dive.
- Nothing here changes the rule. Another job may build tower aggro next; this counter and its
  baseline were handed to it.

## 1. Method (written and committed before the first paid match)

### 1.1 What is compared

- **Code:** `feat/map-nexus-guard` at this commit (develop with #94 and #95 merged in).
- **Sides:** #93's, byte for byte (schema hashes match the logs):
  - `entrant3` = `sample-entrant-siege`;
  - `medium` = `house-medium-eco`;
  - `easy` = `house-easy-eco`;
  - `hard` = #93's `house-hard-eco`, schemas `b95e59ca`.
    - #94 merged into develop while this job ran and replaced that schema with hard3.
    - This branch merges develop. So the paid runner reads #93's hard from the schemas and prose that
      block T's log recorded, not from `prompts/pilots/`. The other three still read from
      `prompts/pilots/`, unchanged by #94/#95.
- **Slots, every block:** #90 §4's block M = #93's block T, slot for slot (violet–green, seed):
  - entrant3–medium 3, 7;
  - medium–entrant3 3, 7;
  - hard–medium 3;
  - medium–hard 3;
  - medium–easy 3;
  - easy–medium 3.
- **Every match:** `--resolution simultaneous-1 --targeting own-lane-1 --cadence 2`, the full 600 s,
  plus one of three configs:
  - **jam** (#90 §4.2 / #93): `--recall recall-2 --economy eco-3-late --objective river-2-set10
    --finale final-chorus-1`;
  - **arena** (§0.4): `--recall none --economy none --objective none --finale none`;
  - **jamnf**: jam without the Chorus (`--finale none`).
- **Already paid, and reused as the Jam baselines:** M (pvp-1) and T (`pvp-1-hp400`), 8 Jev logs
  each. Both re-verify on this branch.

### 1.2 What is measured (every block, from the logs; tower times from exact replays)

1. **How matches end:**
   - base-tower kill (`'nexus'` on the new map);
   - Chorus tower lead;
   - sudden death;
   - the 10:00 tiebreak with a winner (and on what: towers or nexus hp);
   - draw.
2. **First lane tower down:** how many before 8:00; median and earliest. Also inner towers down, and
   base towers opened.
3. **Match length:** median and shortest.
4. **Decisiveness:** decided matches out of played.
5. **What the Chorus does to base kills:** N (Chorus on) against NF (the same map and slots without
   it). Also: at 8:00 in N, how far each match was from a base kill (an inner tower down? a base
   tower open?).
6. **Hygiene, a line:** every match finishes and replay-verifies; 0 server errors; the job's spend
   ≤ $4.00 on the server's ledger.

**Forecasts ($0, §0.2–0.3), stated so the result can be read against them:**
- **N:** a lane tower before 8:00 in about 6 of 8, and **no base-tower kill**. The Chorus (lead or
  sudden death) decides about 8 of 8, near 8:00.
- **AN:** no base-tower kill. More matches decided than AP, by the tiebreak's tower count.
- **AP:** mostly draws.
- **AH:** between AP and AN.
- **NF:** no base-tower kill. If that holds, the Chorus is not what keeps nexus kills away.

### 1.3 The Jev block

- **One server:** a private `tools/jev/schema_server.py` on live Jev (TypeSafe), from this worktree,
  on `:9571`, with `--budget-usd 3.90`. It refuses calls past that, as a backstop under the $4.00
  stop. A free `--stub` server on `:9572` runs the smokes.
- **Stub smoke, free:** 120 s at seed 7, entrant3–medium, once per block's map and config, before any
  paid match.
- **Blocks, in this order:**

| block | map | config | slots | matches |
|---|---|---|---|---:|
| **N** | `pvp-1-hp300-base700` | jam | §1.1's 8 | 8 |
| **AN** | `pvp-1-hp300-base700` | arena | §1.1's 8 | 8 |
| **AP** | `pvp-1` | arena | §1.1's 8 | 8 |
| **AH** | `pvp-1-hp400` | arena | §1.1's 8 | 8 |
| **NF** | `pvp-1-hp300-base700` | jamnf | entrant3–medium 3, medium–entrant3 3, hard–medium 3, medium–easy 3 | 4 |

- **The spend guard** (`ng_jev.mjs`, #93's `pl_jev.mjs` with a per-block config):
  - Matches run in waves of up to 4, block by block.
  - Before each wave it launches the first k slots, where ledger spend + k × m ≤ **$3.80**.
  - m is the most expensive finished match so far: of this block, else of the run, else $0.15. A Jam
    match cost $0.114 in #93; an arena match is unmeasured.
  - Once a slot is cut, nothing after it runs, so a cut takes NF first, then AH.
- **Never extended.** No match is added or replayed after any result is seen. A match that crashes
  before it finishes is retried once.
- Jev is not deterministic (PR #37), so comparisons are block against block. Seeds 3 and 7 were
  near-replays in #88/#90. The blocks are directions, not rates.

## 2. Result

*Written after the run.* The plan was pushed at 20:02 CT (`e2c70f1`). Its amendment, pinning #93's
hard after #94 merged, was pushed at 20:04 (`de206ad`). The first paid match started at 20:05:15 CT.

### 2.1 The run

- Five stub smokes (one per block's map and config), plus one with the pinned hard, all clean before
  any paid match. The first smoke pass wrote its logs into the worktree: a relative `--out`, fixed in
  the runner. Those logs were deleted and the smokes re-run; nothing was paid.
- Blocks N, AN, AP, AH and NF played in plan order, 20:05–20:28 CT. The guard never cut a slot.
  Nothing was retried, added or replayed.
- **36 matches for $3.4338** on the server's ledger:

| block | matches | cost | per match |
|---|---:|---:|---:|
| N (Jam) | 8 | $0.9353 | $0.117 |
| AN (arena) | 8 | $0.6519 | $0.081 |
| AP (arena) | 8 | $0.6688 | $0.084 |
| AH (arena) | 8 | $0.6146 | $0.077 |
| NF (Jam, Chorus off) | 4 | $0.5632 | $0.141 |

- 46,534 requests, 0 errors, 0 failovers.
- **36 of 36 logs replay-verify**, with 0 parse errors. Hygiene line (§1.2.6): **PASS**.

### 2.2 How matches end, slot for slot

Winner and end, then (first lane tower down; inner tower down). Tower times are exact (each log
replayed). "10:00 towers" is the sim's tiebreak deciding on towers standing. No match reached its
nexus-hp step: in all 19 decided 10:00 matches, the tower counts differed.

| slot (violet–green, seed) | M: pvp-1 | T: hp400 | **N: new map** | NF: new, no Chorus |
|---|---|---|---|---|
| easy–medium 3 | medium, SD 8:27 | medium, lead 8:00 (6:38) | medium, lead 8:00 (6:34) | |
| entrant3–medium 3 | medium, SD 8:57 | medium, lead 8:00 (7:07) | entrant3, SD 8:24 | draw (8:04) |
| entrant3–medium 7 | medium, SD 8:31 | entrant3, SD 8:03 | medium, lead 8:00 (6:00) | |
| hard–medium 3 | medium, SD 8:55 | medium, SD 8:08 | medium, SD 8:01 | draw (7:30; inner 9:44, base opened, 116 lost) |
| medium–easy 3 | medium, SD 8:05 | medium, lead 8:00 (7:03) | medium, lead 8:00 (6:34) | medium, 10:00 towers (6:34) |
| medium–entrant3 3 | medium, SD 8:53 | entrant3, SD 8:28 (6:36) | medium, lead 8:00 (6:41) | medium, 10:00 towers (8:06) |
| medium–entrant3 7 | medium, SD 8:31 | medium, lead 8:00 (7:40) | entrant3, lead 8:00 (4:12) | |
| medium–hard 3 | medium, SD 9:25 | medium, lead 8:00 (7:42) | hard, SD 8:35 | |

| slot | AP: pvp-1 (arena) | AH: hp400 (arena) | **AN: new map (arena)** |
|---|---|---|---|
| easy–medium 3 | draw, no tower | draw, no tower | medium, 10:00 towers (3:33) |
| entrant3–medium 3 | draw, no tower | entrant3, 10:00 towers (2:54; inner 5:06) | entrant3, 10:00 towers (4:01; inner 8:13, base opened, 0 lost) |
| entrant3–medium 7 | draw, no tower | medium, 10:00 towers (4:03; inner 6:33) | medium, 10:00 towers (6:33; inner 9:58, base opened, 0 lost) |
| hard–medium 3 | medium, 10:00 towers (6:35) | medium, 10:00 towers (3:09) | medium, 10:00 towers (3:29) |
| medium–easy 3 | draw, no tower | medium, 10:00 towers (5:29) | medium, 10:00 towers (4:31) |
| medium–entrant3 3 | medium, 10:00 towers (8:05) | entrant3, 10:00 towers (8:58) | entrant3, 10:00 towers (4:06) |
| medium–entrant3 7 | draw, no tower | draw, no tower | entrant3, 10:00 towers (4:01; inner 8:12, base opened, 0 lost) |
| medium–hard 3 | medium, 10:00 towers (6:52) | medium, 10:00 towers (3:03) | medium, 10:00 towers (2:35) |

### 2.3 Against the questions (§1.2)

1. **How matches end:**
   - Base-tower kills: **0 of 20** on the new map (N 0/8, NF 0/4, AN 0/8).
   - Under the Jam ruleset, the new map ends like T: 5 Chorus leads and 3 sudden deaths.
   - As the arena runs, every match goes to 10:00. The tower count decides 3 of 8 on pvp-1, 6 on
     hp400 and 8 on the new map.
2. **First tower:**
   - Before 8:00:
     - N: 5 of 8 (median 6:34, earliest 4:12); T: 6 of 8 (7:05); M: 0.
     - AN: 8 of 8 (median 4:01, earliest 2:35); AH: 5; AP: 2.
   - Inner towers before 8:00: 0 in every block but AH (2). Inner towers ever: AN 3, NF 1, AH 2.
     Each one opened its team's base tower when it fell (AH has no base towers).
3. **Length:**
   - Jam: N median and shortest both 8:00, like T. M's median was 8:42.
   - Arena: every match runs the full 10:00.
4. **Decisiveness:** N 8/8 (like M and T), NF 2/4, AP 3/8, AH 6/8, AN 8/8.
5. **The Chorus and base kills:**
   - In N, at 8:00, no match had an inner tower down or a base tower open. The most any inner tower
     had lost was 63 of 500.
   - The Chorus ended matches that were nowhere near a base kill.
   - Without it (NF), 10:00 came first in all 4, and 2 of 4 drew.
6. **Hygiene:** PASS (§2.1).

### 2.4 Why nobody reaches a base tower

- **A base kill needs one push to take a 300 outer, a 500 inner and a 700 base tower.**
  - In 36 Jev matches, the pushers took the outer tower, early on this map (N's median 6:34, AN's
    4:01), and stopped there.
  - The arena's no-respawn games had a whole team dead by the end in 19 of 24 matches (AP 7, AH 6,
    AN 6).
  - Even so, the inner tower fell in only 3 of AN's 8, and then only after 8:00.
- **When a base tower did open, the attackers came close and then backed off.** This is from
  replaying the 4 matches where one opened (`ng_opened.mjs`):
  - In AN entrant3–medium 3 and medium–entrant3 7, it opened at 8:12–8:13. All three attackers were
    alive for the remaining 1:47.
    - The closest any came was 119–121 units, and none was ever within its own attack range of the
      base tower.
    - Their decisions after the opening: 82–87 moves, 15–20 recalls and 31–33 tower attacks, which
      never touched the base tower (it ended at 700).
  - The other two openings came at 9:44 (NF hard–medium) and 9:58 (AN entrant3–medium 7), with 16 s
    or less left.
    - In NF, two attackers got within range for a few seconds and took 116.
  - The schemas' default walks straight at the enemy base (`push_lane`). Their attack rules wait for
    an enemy tower in sight, and their hurt rules send a bot home under 50 % hp.
  - The base tower stands 81 from the mid inner tower and shoots like any tower, so the walk in is
    under fire. The attackers turned back before they reached it.
  - This is read from positions and action kinds, not from each decision's reply.
- **So the levers, for Ceryce to rank:**
  1. **A push rule** in the house tiers and the sample entrant: "an enemy inner tower is down and
     the base tower is in sight → attack it". It is a schema change, and the map is unchanged.
  2. **Lower hp** on the inner or base tower.
  3. **A later Chorus**, or none: more time. NF says time alone barely helps (one inner tower in 4
     matches).
  4. Turning the backdoor protection off (`needsInnerDown: false`). It is one field, but no bot
     reached an open base tower anyway.

### 2.5 Caveats

- 8-match blocks (4 for NF). Seeds 3 and 7 are near-replays on Jev (#88 §2.4). These are directions,
  not rates.
- The arena blocks use the house tiers and the siege entrant, the same bots as the Jam blocks, not
  the ladder's real entrants.
- A protected base tower reads as full hp in the description, and nothing tells Jev it is protected
  (§0.1). No bot tried to hit one, so this didn't come up.
- The dive counts on this job's 36 new logs match §0.5:
  - 28 shielded hits of 7,448 PvP hits;
  - 27 shielded episodes, and none of those divers died within 5 s.

## Files

- `src/baseTower.ts` (new): the base tower, its protection, and its win.
- `src/mapVariant.ts`: `baseTower` on a variant, and `PVP_BASE_TOWER_MAP` (`pvp-1-hp300-base700`).
- `src/mapRules.ts`: attaches it.
- `src/replay.ts`: `result.baseTower`, and what `'nexus'` means on this map.
- `tools/match/headless.ts`: records the summary, and exports for the tests.
- `tools/match/test_base_tower.mjs` (new, in `npm run test:match`).
- `tools/match/cli.mjs`: `--map` help.
- `tools/jev/vocab.py` and its test: the name in the Python mirror.
- `docs/arena-runbook.md`: the `tournament.map` row.
- **Logs, not in git.** On the
  [`data-nexus-guard-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-nexus-guard-2026-10-02)
  prerelease:
  - the 36 paid logs, `runs/nexus-guard-2026-10-02-<block>-<violet>-<green>-seed<N>.json`, and the
    stub smokes;
  - the analysis kit:
    - `ng_dives.mjs` (the dive counter, §0.5);
    - `ng_falls.mjs` / `ng_replay.mjs` (exact tower falls);
    - `ng_ends.py` / `ng_push.py` / `ng_tiebreak.py` / `ng_cf300.py`;
  - the stand-in kit (`ng_stand.mjs`, the oracle and its plans) and all 162 stand-in sims;
  - #93's pinned hard, the plans, the run log, and the server's final `/health`;
  - every output table.

  To check a log, unzip at the repo root and run `npm run match -- --verify <log>`.
