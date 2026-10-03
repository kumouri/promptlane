# Bots push to the base tower — 2026-10-02

**Question.** Ceryce, 2026-10-02 20:39 CT: "Agreed, change the bots now. And we should try it on pvp-2, or
at least eco on." On #96's `pvp-1-hp300-base700`, no base tower fell in 20 Jev matches
([`nexus-guard-2026-10-02.md`](nexus-guard-2026-10-02.md)). The bots took an outer tower and stopped.
Four times a base tower opened, and the attackers came within ~120 units, then moved or recalled. Margo
recommended a "push to their base tower once a lane is open" rule, and Ceryce agreed.

- **Budget:** Jev hard stop **$5.00**. $0 work first. Jev is spent only on §1.3's blocks, and this plan
  is committed before the first paid call.
- **Out of bounds:**
  - `src/sim` (frozen);
  - the live arena and its backend (`:8790`, `:8797`);
  - other jobs' branches and worktrees (`fix/vocab2-rule-order`, `fix/vocab2-clause-coverage`).

## Verdict

*Written after the run.*

## 0. What was built, at $0

### 0.1 The rule, and who gets it

One sentence goes right after "fall back to your own tower". Medium and hard (house prose) get:

> Take their base. Destroying the enemy base tower wins the match, and it can be hit once one of their
> inner towers is down, so if the enemy base tower can be hit, attack the enemy base tower.

The siege entrant gets the same in its voice ("…so when the enemy base tower can be hit, I attack the
enemy base tower.").

- **What stays above it:** the low-hp pair, shopping, hard's weakened-tower rule, the 8:00 close-out,
  and "an enemy tower will shoot you → fall back".
  - So a base tower with no minion of theirs in range still turns a bot back, and they hit it while
    their wave tanks it.
  - A lone bot under a base tower can't win the trade. The drums deal 7.3 a second and the violin 12.2;
    the tower deals 18 a second to one bot. Three bots take ~26 s to drop 700 hp.
- **Why below the fall-back, not above it:** above it, every bot would walk into base-tower fire alone
  as soon as any inner tower fell anywhere. The low-hp pair would send it home at half hp, about 6 s
  later for a drums.
- **Easy gets none.** In 17 recorded Jev matches with easy (#96's 9, #91's 8), easy took no enemy tower,
  and the other team's towers never fell (`easy_towers.py` in the data kit). A rule that waits for an
  enemy inner tower to fall would never fire. It would also contradict easy's "never stand inside an
  enemy tower's range". Easy stays the weakest tier by construction.
- **Hard stays medium plus one rule** (#94). Its push rule objects are medium's, byte for byte.
- **The pvp-2 entrant is unchanged.** It is #91's measured artifact, not played here.

### 0.2 What Jev is told: the base towers' status

Before this job, vocab-2 described a base tower as "Enemy tower tw-13 (mid, 700/700 hp)", like any
tower, and only within 390 units. A protected one read full hp, and nothing said it was protected or
that it wins. So a rule "attack the enemy base tower once it can be hit" had nothing to ask about.

- **One source of truth.** `src/baseTower.ts` adds `baseTowers` to every pilot's observation, on a
  base-tower map only:
  - both base towers, map-wide: `{id, pos, hp, maxHp, alive, canBeHit}`;
  - `canBeHit` is `BaseTowers.vulnerable`, the rule the sim applies at the end of every tick.
- **vocab-2 states it** (`docs/vocabulary-spec.md` §8.14):
  - "The enemy base tower tw-13 can be hit now: one of their inner towers is down. It has 412/700 hp,
    at (829,171), 183 units away, and destroying it wins the match." Or "…can't be hit yet: it takes no
    damage until one of their inner towers is down…";
  - the same for the bot's own;
  - the tower line says "(mid, base tower, …)".
- **One target, `enemy_base_tower`:** the id, from anywhere. The sim's `attack` walks to it.
- **Offered only to a vocab-2 compile told such a map** (`compile.py --map pvp-1-hp300-base700`). Every
  other map's description and every vocab-1 prompt is byte for byte as before (tests in
  `tools/jev/test_base_tower_vocab.py`; the vocab-1 golden test).
- `/health` says `base_towers`, and a base-tower match refuses a server that doesn't.
- #96's 16 N/AN Jev logs and #91's 6 P2A logs replay-verify on this branch.

### 0.3 `pvp-2-hp400-base950` (the brief's "pvp-2-base")

The brief asked for an opt-in `pvp-2-base`. It is named `pvp-2-hp400-base950`, by the repo's rule that
a changed number is a new name (#93, #96).
- **What it is:** pvp-2 (scale ×1.33, its tower spots, the boost, the teleport) with #96's rule. One
  base tower per team, 100 × 1.33 = 133 in front of the nexus, damageable once one of that team's inner
  towers is down. Its fall wins, as `endReason: 'nexus'`.
- **The hp, derived at $0 from #91's logs, not guessed** (`hp_derive.py`, the data kit):
  - #91's pvp-2 arm is #88's 20 matches re-played with `--map pvp-2`: same schemas, flags and seeds. So
    the pair differs only by the map.
  - Paired slot for slot, the weakest outer tower lost a **median 1.37×** as much by 7:59 on pvp-2
    (quartiles 1.04 / 1.37 / 1.89, 18 decided slots).
  - #93's counterfactual on the same pairs, a tower down before 8:00:

    | outer hp | pvp-1 (#88) | pvp-2 (#91) |
    |---:|---:|---:|
    | 300 | 16 of 20 | 18 of 20 |
    | 400 | 14 of 20 | **16 of 20** |
    | 500 | 4 of 20 | 14 of 20 |
    | 600 | 4 of 20 | 8 of 20 |

  - So pvp-2 at 400 drops a tower before 8:00 as often as pvp-1 does at #96's 300. #96's 300 / 500 / 700
    × 1.37, rounded to 50, is **400 / 700 / 950**.
  - #93's "~600" was for #93's own target: half the matches, pvp-1-hp400's rate. Matched to #96's 300,
    the same data says 400.
  - The inner and base numbers are the outer factor carried over. No inner tower took damage before
    8:00 in any of #91's logs, so there is nothing to fit them to.
- `tp_lane_tower` never picks a base tower (it is no lane's tower).

### 0.4 The compiles, and the by-hand screen

The rule-order fidelity check (`fix/vocab2-rule-order`) and clause coverage (`fix/vocab2-clause-coverage`)
weren't merged. So every compiled cascade was checked by hand against its prose.

- **How compiled:** `compile.py --vocab vocab-2 --economy eco-3-late --map pvp-1-hp300-base700 --backend
  ollama`. That is the entrant compile path, with the host translator, free. Jev plays the result.
- **What a sample must pass:**
  1. every rule the prose states is there, once, in the prose's order, with all its clauses;
  2. the push rule asks exactly the prose's clause ("can the enemy base tower be hit", nothing narrower);
  3. the push rule is `attack enemy_base_tower`;
  4. the push rule sits after the 8:00 close-out and the fall-back, and before the siege.
- **One exception, already in the shipped entrant on all three instruments:** the shopping recall
  lifted above the low-hp pair, and a catch-all "no other rule matches → push" that restates the
  default. These aren't counted against a sample, because only its push rule is taken.
- **Taken:** the first passing sample per instrument. Only its push rule object is used, placed right
  after the checked-in schema's fall-back rule. Every other rule object, the build and the default are
  byte for byte. Each schema records `"map": "pvp-1-hp300-base700"`.

| bot | instrument | samples | passed | taken | why the others failed |
|---|---|---:|---:|---|---|
| medium (and hard) | drums | 3 | 2 | s2 | s1: the shopping walk lost "no enemy bearbot in sight" |
| medium (and hard) | keytar | 22 | 1 | s18 | the push condition became "can this bearbot hit the enemy base tower?" (13; Jev could read it as "is it in my attack range"); shopping-walk clauses dropped (11); the close-out lost and the push rule above the fall-back (2). A sample can fail on more than one |
| medium (and hard) | violin | 3 | 1 | s2 | s1: shopping-walk clause dropped; s3: the low-hp rule split into three |
| siege entrant | drums | 3 | 1 | s3 | push rule above the fall-back and the close-out moved to last (2) |
| siege entrant | keytar | 6 | 1 | s5 | push rule above the fall-back, and the close-out lost (5) |
| siege entrant | violin | 3 | 2 | s1 | s3: the push condition became "(its inner towers are down)", meaning all of them |

**32 of 40 instrument compiles were rejected.** The push rule's target was right in all 40, and its condition
in 26. The rest of the rejections are order (the push rule above the fall-back, the close-out lost) and
the shopping rule's clauses.

### 0.5 The stand-in, before Jev ($0, ranking only)

#88's model-free stand-in for Jev (`pl_oracle_server.py`, #96's kit with its fitted rates). It got one
new atom: "can the enemy base tower be hit" reads `baseTowers.enemy.canBeHit`, the field vocab-2 states.
It overstates pre-8:00 tower damage by ~1.8× (#88 §0.2). It ranks; it is never a result.

The same 10 pairings × seeds 3, 7, 11 per cell, played by the bots before this job (`old`, develop at
`4c0bd26`) and after it (`new`). Every one of the 180 sims replay-verifies.

| cell | bots | base kills | Chorus lead | sudden death | 10:00 decided | draw | lane tower before 8:00 | inner tower ever | base opened | median length |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| J: base map, Jam stack | old | 0 | 22 | 8 | — | 0 | 23 | 0 | 0 | 8:00 |
| | new | **0** | 20 | 10 | — | 0 | 23 | 0 | 0 | 8:00 |
| E: base map, eco on, no Chorus | old | 0 | — | — | 22 | 8 | 22 | 0 | 0 | 10:00 |
| | new | **0** | — | — | 23 | 7 | 22 | 3 | 3 | 10:00 |
| P: `pvp-2-hp400-base950`, Jam stack | old | 0 | 19 | 11 | — | 0 | 20 | 0 | 0 | 8:00 |
| | new | **0** | 20 | 9 | — | 1 | 23 | 0 | 0 | 8:00 |

- **The stand-in forecasts no base kill, with the rule or without.** The wall is the inner tower, not
  the base tower.
  - Under the Jam stack, the first outer tower falls at a median 5:45–6:25. The Chorus then ends the
    match on a tower lead at 8:00, before any inner tower is down.
  - With no Chorus (E), the new bots took 3 inner towers, at 9:41, 9:55 and 9:56. Each opened a base
    tower with under 20 s left, and none was finished.
- **When the base tower was open, the rule fired:** 18 of 20 such answers were yes.
- **Noise costs something:** the stand-in's injected 3 % noise said yes on ~3 % of shut states. That is
  about 20 two-second walks toward a protected base a match. On Jev, that false-yes rate is §1.3's P0.

## 1. Method (written and committed before the first paid call)

### 1.1 What is compared

- **Code:** `feat/bots-push-to-base` at this commit (develop at `4c0bd26`, with #97's tower aggro).
- **Sides:** this commit's
  - `entrant3` = `sample-entrant-siege`;
  - `medium` = `house-medium-eco`;
  - `hard` = `house-hard-eco`;
  - `easy` = `house-easy-eco` (unchanged).
- **Every match:** `--resolution simultaneous-1 --targeting own-lane-1 --cadence 2`, the full 600 s,
  plus one of two configs:
  - **jam** (#90 §4.2, #93, #96): `--recall recall-2 --economy eco-3-late --objective river-2-set10
    --finale final-chorus-1`. This already includes the economy.
  - **arenaeco**: the live arena's config (#96 §0.4: no objective, no finale, plays to 10:00) with the
    economy on: `--economy eco-3 --recall recall-2 --objective none --finale none`.
- **Reading (b), "or at least eco on":**
  - The Jam ruleset (a) already plays with an economy (`eco-3-late`). What #96 played without one is
    the live arena (block AN), where a dead bot never respawns and 6 of 8 matches ended with a team
    wiped.
  - So (b) is #96's AN with the economy the go/no-go gate would ship.
  - **`eco-3`:** `docs/economy-spec.md` §13.6's recommendation for the gate ("ship eco-3"), and
    `tournament.economy` is the switch.
  - **With `recall-2`:** the economy's recall (economy-spec §9.10), which every tier's prose is written
    for ("a hit breaks a recall").
- **The baselines are already paid for:**
  - (a): #96's block N, 8 Jev logs, the same 8 slots with the bots before this job.
  - (b): #96's block AN (no economy, old bots), so E against AN moves two things at once. The stand-in's
    old/new split (§0.5) separates the bots.
  - (c): nothing on Jev; §0.5's stand-in only.

### 1.2 What is measured (every block, from the logs; tower times from exact replays)

1. **How matches end:** base kill, Chorus lead, sudden death, 10:00 decided, draw.
2. **First lane tower** and **first inner tower** down: how many before 8:00, median, earliest.
3. **Base towers opened, and how many were finished.** When one opened, where the attackers went (the
   push rule's fires).
4. **Length** (median, shortest) and **deaths** a match.
5. **Ladder:** easy < medium ≤ hard; the sample entrant against each. W–L per pairing.
6. **The push rule on Jev:** fires a match; the yes rate while the bot's enemy base tower could be hit,
   and while it couldn't.
7. **Hygiene:** every match finishes and replay-verifies; 0 server errors; 0 parse errors.
8. **Spend** ≤ $5.00 on the server's ledger.

**Forecast (§0.5), so the result can be read against it:** no base kill in any block. In J and P the
Chorus ends matches at 8:00 on a tower lead, with no inner tower down. In E, an inner tower falls late in
a few matches and opens a base tower that isn't finished.

### 1.3 The Jev blocks

- **One server:** a private `tools/jev/schema_server.py` on live Jev (TypeSafe), from this worktree, on
  `:9671`, with `--budget-usd 4.90`. That is the backstop under the $5.00 stop. A free `--stub` server on
  `:9672` ran the smokes: one 120 s match per block's map and config, all verified.
- **Order:**

| # | block | map | config | slots (violet–green, seed) | matches |
|---|---|---|---|---|---:|
| 0 | **P0** the fact read | — | — | 180 single decisions (below) | — |
| 1 | **J** (a) | `pvp-1-hp300-base700` | jam | #96's N, slot for slot: entrant3–medium 3, 7; medium–entrant3 3, 7; hard–medium 3; medium–hard 3; medium–easy 3; easy–medium 3. Then entrant3–hard 3, hard–entrant3 3, entrant3–easy 3, easy–entrant3 3 | 12 |
| 2 | **E** (b) | `pvp-1-hp300-base700` | arenaeco | entrant3–medium, medium–entrant3, hard–medium, medium–hard, medium–easy, easy–medium, entrant3–hard, hard–entrant3, entrant3–easy, easy–entrant3; seed 3 | 10 |
| 3 | **P** (c) | `pvp-2-hp400-base950` | jam | E's 10 slots, in E's order | 10 |

- **P0, the fact read** (`probe.mjs`, ~$0.01):
  - The states are real observations from scripted $0 matches: 60 per set, 20 per instrument, a fixed
    seed.
  - Each is asked through the server with medium's whole schema, so the push rule's question is asked
    among its neighbours, as in play.
  - The sets:
    - **absent:** `pvp-1-hp400`, no base tower. The house files now carry the rule on every map.
    - **shut:** the base map, the enemy's base tower not yet hittable.
    - **open:** the base map, the enemy's base tower can be hit.
  - **The line:** PASS iff yes ≥ 90 % on open, and ≤ 10 % on shut and on absent.
  - **The gate:** if yes is above 25 % on shut or absent, no block runs. The wording goes back to $0,
    because a bot that walks at a protected base every few decisions is worse than no rule.
- **The spend guard** (`ng_jev.mjs`, #96's runner with this worktree and the arenaeco config):
  - Waves of up to 4, block by block. Before each wave it launches the first k slots, where ledger
    spend + k × m ≤ **$4.80**.
  - m is the most expensive finished match: of this block, else of the run, else $0.15.
  - Once a slot is cut, nothing after it runs, so a cut takes P's last slots first.
  - **If P is cut, the remaining slots are $0 only (§0.5).** The write-up says how many of P's 10 ran.
- **Estimate:** J $1.40 (#96's N: $0.117 a match); E ~$1.40 (#96's NF, a 10:00 match with an economy:
  $0.141); P ~$1.20 (#91: $0.111). About $4.0 in all.
- **Never extended.** No match is added or replayed after any result is seen. A match that crashes
  before it finishes is retried once.
- Jev is not deterministic (PR #37), and seeds 3 and 7 are near-replays. The blocks are directions, not
  rates.

### 1.4 Amendment: the base-tower line reads as "an enemy tower in sight" (committed after §1.3's blocks were played and read, before its own paid calls)

This amendment is post hoc. §1.3's 32 matches were played and read before it was written, and none of
their lines change because of it.

- **What the blocks showed.** After 8:00, the close-out rule ("more than 480 s and you can see an
  enemy tower → attack the nearest enemy tower") won with **no target** in 36 % of its wins in E, 45 % in
  J and 66 % in P. Jev said an enemy tower was in sight, and the resolver found none listed within 390.
  So the bot attacked nothing and stood still for 2 s.
  - On #96's logs (the same map, the same rule, no base-tower line), that was 0 % in N and NF and 1 % in
    AN (`pb_closeout.py`).
  - The difference is §0.2's line: "The enemy base tower tw-13 … at (829,171), 1000 units away". It
    names an enemy tower with a position and a distance, map-wide.
- **The fix, fixed here before it is measured:** the status line no longer gives the position or the
  distance. When the base tower is beyond the 390 units towers are listed within, it says so first:
  - far: "Out of sight, map-wide: the enemy base tower tw-13 can be hit now (one of their inner towers
    is down; 412/700 hp), and destroying it wins the match." Or: "Out of sight, map-wide: the enemy base
    tower tw-13 can't be hit yet: it takes no damage until one of their inner towers is down."
  - near (listed above in the tower lines): "The enemy base tower is tw-13, listed above: it can be hit
    now (one of their inner towers is down), and destroying it wins the match." Or "…: it can't be hit
    yet: it takes no damage until one of their inner towers is down."
  - own: "Your base tower tw-12 can be hit now: one of your inner towers is down, and if it falls your
    team loses." Or "Your base tower tw-12 can't be hit yet."
  - The tower line's "(mid, base tower, …)" stays.
- **P1, the sight read** (`probe.mjs sight`, ~$0.02 each arm):
  - The states: 60 base-map states (20 per instrument, fixed seed) with no enemy bearbot, minion or
    tower listed. Clock set to 540 s and hp to 40 % of max, so:
    - the close-out is truly no;
    - "hp below half and an enemy minion, tower or bearbot in sight" is truly no;
    - "hp below half and no enemy in sight" is truly yes.
  - Asked with medium's whole schema under three descriptions:
    - **A:** no base-tower line, as before this job;
    - **B:** §0.2's wording, as played in §1.3;
    - **C:** the fix.
  - **The line:** C passes iff its yes rates on the close-out and the low-hp walk are each within 5
    points of A's, and its yes rate on the low-hp recall is no more than 5 points below A's.
- **P0′:** §1.3's P0 again, under C, with the same line (open ≥ 90 %; shut and absent ≤ 10 %).
- **No match is re-played.** §1.3's results stand as played, with this defect named beside them.
- **Spend:** the server's ledger stops at $4.90 as before. These arms cost about $0.06.

## Files

- `src/baseTower.ts`: `baseTowers` in the observation (`BaseTowerObservation`).
- `src/mapVariant.ts`: `pvp-2-hp400-base950` (`PVP_2_BASE_TOWER_MAP`).
- `src/teleport.ts`: a teleport tower's tier may be 3.
- `tools/jev/vocab.py`:
  - `FACTS_BASE`;
  - `map_has_base_tower`;
  - `TELEPORT_MAPS` / `BASE_TOWER_MAPS`;
  - the new map's mirror.
- `tools/jev/fidelity_harness.py`: `_base_tower_lines`, and the base tower's own line.
- `tools/jev/target_resolve.py`: `enemy_base_tower`; `tp_lane_tower` skips a base tower.
- `tools/jev/translator.py`: `BASE_SELECTORS`, offered on a base-tower map; the schema records the map.
- `tools/jev/schema_server.py`: `/health` `base_towers`.
- `tools/match/jevSchemaPilot.ts`, `headless.ts`, `cli.mjs`, `tools/arena/queue.mjs`:
  `baseTowerUnsupported`.
- `tools/jev/compile.py`: `--map` help.
- `prompts/pilots/`:
  - `house-medium-eco`, `house-hard-eco` and `sample-entrant-siege` (prose and schemas);
  - the README.
- **Tests:**
  - `tools/jev/test_base_tower_vocab.py` (new);
  - `tools/match/test_base_tower.mjs`;
  - `tools/arena/test_house.mjs`;
  - `tools/jev/test_vocab.py`, `test_pvp2.py`.
- **Docs:** `docs/vocabulary-spec.md` §8.14; `docs/arena-runbook.md` (`tournament.map`).
- **Logs, not in git:** on the `data-bots-push-to-base-2026-10-02` prerelease (§2).
