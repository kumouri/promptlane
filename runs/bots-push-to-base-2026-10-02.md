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

*Written after the run. §0–1.3 were committed (`9482949`, 21:39 CT) before the first paid call; §1.4
(`67c0499`) and §1.5 (`fea6c33`) before their own.*

- **Built:**
  - the push-to-base rule in medium, hard and the siege entrant, right after the fall-back. Easy gets
    none (§0.1).
  - vocab-2's base-tower status, from the sim (`baseTowers`), and the `enemy_base_tower` target;
  - the opt-in map `pvp-2-hp400-base950` (the brief's "pvp-2-base"), its hp derived from #91's paired logs
    (§0.3).
- **No base tower fell in any of the 34 Jev matches**, on either map, with the Chorus or without, as the
  stand-in forecast. #96's was 0 of 20.
- **The wall is the inner tower and the clock, not the base tower:**
  - No inner tower fell before 8:00 in any block.
  - Under the Jam ruleset, the Chorus ends the match at 8:00, on a tower lead or in sudden death, before
    any inner tower is down.
  - Every base tower that opened (5) opened at 8:07–9:36, with 0 to 50 s left. None was finished.
- **The rule reads right on Jev:**
  - It said yes to a shut or absent base tower **0 times** in 40,323 decisions and 240 probe states.
  - It said yes to an open one 111 of 111 times in play, and 54 of 60 in the probe (90 %, P0′; the
    misses are keytar).
- **But this job's own description line had a defect**, found in the blocks and fixed (§1.4–1.5):
  - Jev read the map-wide "enemy base tower … 1000 units away" as an enemy tower in sight.
  - After 8:00, the close-out rule then attacked nothing in 36–66 % of its wins.
  - All 32 block matches played with it. It touches play after 8:00 (the sudden-death race and the
    ladder there), not the headline: the stand-in reads the observation, not the text, and also gives no
    base kill.
  - The fixed wording plus a resolver fallback took it to 2 % in E′. After E′'s opening, the close-out
    went at the base tower 21 times of 34, and time ran out (34 of 700 hp).
- **Ladder** (J + E + P, 32 matches): easy < medium ≤ hard holds.
  - Medium beat easy 6–0; hard against medium 3–1–2.
  - The siege entrant beat easy 6–0, went 4–4 with medium and 2–3–1 with hard.
- **Rejected compiles:** 32 of 40 instrument compiles, by the by-hand order and clause screen (§0.4).
- **Spend: $4.3053 of the $5.00 stop**, on the servers' ledgers:
  - 34 matches;
  - 0 errors;
  - 13 TypeSafe read timeouts failed over. Workers AI answered 922 of 47,945 decisions, the same Jev
    model.

| map, ruleset (Jev) | n | base kill | Chorus lead | sudden death | 10:00 decided | draw | lane tower before 8:00 (median) | inner tower down | base tower opened (time left) | finished | median length | deaths a match |
|---|---:|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|
| #96 N: `pvp-1-hp300-base700`, Jam, old bots | 8 | 0 | 5 | 3 | — | 0 | 5 (6:34) | 0 | 0 | 0 | 8:00 | 5.4 |
| **J: same, new bots** (N's 8 slots) | 8 | **0** | 3 | 5 | — | 0 | 6 (5:55) | 1 (8:07) | 1 (8:07, as sudden death ended it) | 0 | 8:04 | 5.0 |
| **J: all 12** | 12 | **0** | 6 | 6 | — | 0 | 10 (5:31) | 1 (8:07) | 1 (8:07, 0 s) | 0 | 8:00 | 5.2 |
| #96 AN: same map, live arena (no economy), old bots | 8 | 0 | — | — | 8 | 0 | 8 (4:01) | 3 (8:11–9:58) | 3 (107, 108, 2 s) | 0 | 10:00 | 3.1 |
| **E: same map, arena + `eco-3` + `recall-2`** | 10 | **0** | — | — | 7 | 3 | 7 (6:06) | 2 (9:29, 9:36) | 2 (30, 23 s) | 0 | 10:00 | 8.2 |
| E′: 2 of E's slots, fixed line + fallback | 2 | 0 | — | — | 2 | 0 | 2 (6:32) | 1 (9:09) | 1 (50 s) | 0 | 10:00 | 7.5 |
| **P: `pvp-2-hp400-base950`, Jam** | 10 | **0** | 8 | 2 | — | 0 | 10 (6:09) | 1 (9:10) | 1 (9:10, as sudden death ended it) | 0 | 8:00 | 5.3 |

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
- **vocab-2 states it** (`docs/vocabulary-spec.md` §8.14; the wording below is what §1.3's blocks played, and
  §1.4 replaced it):
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

**#98's clause-coverage check** (`translator.enforce_clause_coverage`) merged after the run. Run over the
nine shipped schemas, each scoped to its instrument as the translator does, it passes every one
(`check_coverage.py` in the data kit). The rule-order check (`fix/vocab2-rule-order`) wasn't merged when
this was written.

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

### 1.5 Amendment: P1 and P0′ as measured, a resolver fallback, and E′ (committed after P1/P0′ were read, before E′'s paid calls)

Post hoc, like §1.4. Nothing in §1.3 or §1.4 is changed by it.

- **P1** (60 states, no enemy listed, clock 540 s, hp 40 %):

  | arm | close-out yes (truth no) | low-hp walk yes (truth no) | low-hp recall yes (truth yes) |
  |---|---:|---:|---:|
  | A: no base-tower line | 0 | 0 | 60 |
  | B: §0.2's line, as played | 28 | 7 | 60 |
  | C: §1.4's fix | 6 | 0 | 60 |

  **C fails §1.4's line** on the close-out (10 points over A; the line was 5). It passes the walk and the
  recall. All 6 of C's yeses are the 6 states whose enemy base tower could be hit; it said no in all 54
  where it couldn't (`p1_states.mjs`). So once the base tower is open, Jev counts it as an enemy tower in
  sight.
- **P0′ under C: PASS.** Open 54 of 60 (90 %), shut 0 of 60, absent 0 of 60. P0 under B had been 53, 0, 0.
- **That residual is the case that matters.** An opening comes late (§0.5, §2), and after 8:00 the
  close-out sits above the push rule. So with the base tower open, the close-out wins and, finding no
  tower listed, attacks nothing.
  - Moving the push rule above the close-out would move it above the fall-back too, and the close-out sits
    above the fall-back on purpose (#88's sudden-death rush).
- **The fix, in the resolver:** on a base-tower map, a vocab-2 `nearest_tower` that finds no enemy tower
  listed resolves to the enemy base tower when it can be hit. That is the one enemy tower the description
  names. Shut, or on any other map, it resolves to nothing, as before (tests in
  `test_base_tower_vocab.py`). The close-out's misread then sends the bot to the base tower, which is
  what the push rule would have done.
- **E′, the only paid block of this amendment:**
  - E's two slots whose base tower opened (entrant3–easy 3 and medium–easy 3), re-played on this
    commit's code (C's wording and the fallback), arenaeco, `pvp-1-hp300-base700`.
  - Reported beside E: when the base tower opened, which rules won after it, the base tower's hp lost,
    and the end.
  - Never extended. The private server's cap is the room left under $4.90 ($0.86 at the restart).
  - Jev replays easy's matches near-identically (#88, #91), so an opening is likely to recur, not certain.

## 2. Result

*Written after the run.*

### 2.1 The run

- **Timeline (CT):**
  - the plan was pushed at 21:39 (`9482949`); P0 ran right after;
  - J, E and P ran 21:40–22:16, in plan order. The guard never cut a slot, and nothing was retried,
    added or replayed;
  - §1.4 was pushed at 22:20 (`67c0499`), then P1 arms A and B ran;
  - the fixed wording was committed (`1b91e17`), then P1 C and P0′ ran;
  - §1.5 was pushed at 22:27 (`fea6c33`), and E′ ran 22:27–22:30.
- **Clean:**
  - 34 of 34 match logs replay-verify (`--verify`), plus the 3 stub smokes;
  - 0 parse errors and 0 call errors on either side;
  - 0 server errors.
- **Spend: $4.3053** on the four server processes' ledgers (`health-*.json`):

| item | cost |
|---|---:|
| P0 (180 calls) | $0.0162 |
| J (12) | $1.4331 |
| E (10) | $1.3653 |
| P (10) | $1.2143 |
| P1 arms A, B (120 calls) | $0.0099 |
| P1 arm C, P0′ (240 calls) | $0.0210 |
| E′ (2) | $0.2455 |
| **total** | **$4.3053** |

### 2.2 How matches end, slot for slot

Winner and end, then (first lane tower down; first inner tower down; base tower opened). Times are
exact, from replays. Sudden death and the Chorus lead are the Final Chorus's (`src/finale.ts`). "10:00"
is the sim's tower-count tiebreak.

| slot (violet–green, seed) | #96 N (old bots) | J | E | P |
|---|---|---|---|---|
| easy–medium 3 | medium, lead 8:00 (6:34) | medium, lead 8:00 (6:34) | medium, 10:00 (6:34) | medium, lead 8:00 (6:47) |
| entrant3–medium 3 | entrant3, SD 8:24 | medium, SD 8:07 (5:35; inner 8:07, which ended it) | medium, 10:00 (8:03) | medium, lead 8:00 (5:38) |
| entrant3–medium 7 | medium, lead 8:00 (6:00) | entrant3, SD 8:56 (6:15) | | |
| hard–medium 3 | medium, SD 8:01 | hard, SD 8:14 (3:43) | draw, 10:00 (9:20) | hard, SD 8:03 (6:28) |
| medium–easy 3 | medium, lead 8:00 (6:34) | medium, lead 8:00 (6:34) | medium, 10:00 (6:09; inner 9:29, base opened, 0 lost) | medium, lead 8:00 (6:51) |
| medium–entrant3 3 | medium, lead 8:00 (6:41) | entrant3, SD 8:01 (8:01) | entrant3, 10:00 (6:06) | medium, SD 9:10 (5:50; inner 9:10, which ended it) |
| medium–entrant3 7 | entrant3, lead 8:00 (4:12) | entrant3, lead 8:00 (4:11) | | |
| medium–hard 3 | hard, SD 8:35 | medium, SD 8:10 (8:10) | draw, 10:00 (8:57) | hard, lead 8:00 (7:14) |
| entrant3–hard 3 | | hard, lead 8:00 (5:26) | entrant3, 10:00 (5:27) | hard, lead 8:00 (3:57) |
| hard–entrant3 3 | | entrant3, SD 8:08 (4:11) | draw, 10:00 (6:06) | hard, lead 8:00 (3:31) |
| entrant3–easy 3 | | entrant3, lead 8:00 (6:30) | entrant3, 10:00 (6:30; inner 9:36, base opened, 34 lost) | entrant3, lead 8:00 (7:08) |
| easy–entrant3 3 | | entrant3, lead 8:00 (4:28) | entrant3, 10:00 (4:28) | entrant3, lead 8:00 (5:49) |

E′ re-played E's two opening slots on the fixed code:
- entrant3–easy: entrant3 at 10:00 (6:30; inner 9:09, base opened with 50 s left, 34 lost);
- medium–easy: medium at 10:00 (6:34; no inner tower this time).

### 2.3 Against the questions (§1.2)

1. **How matches end:**
   - **Base kills: 0 of 34.**
   - The Jam ruleset ended every J and P match at 8:00–9:10: Chorus lead 14, sudden death 8.
   - The arena with an economy (E) played every match to 10:00: 7 decided by the tower count, 3 draws.
2. **First towers:**
   - A lane tower fell before 8:00 in 10 of 12 J (median 5:31, earliest 3:43), 7 of 10 E (6:06, 4:28)
     and 10 of 10 P (6:09, 3:31). N was 5 of 8.
   - **No inner tower fell before 8:00 in any block.** Inner towers fell at 8:07 (J), 9:29 and 9:36 (E),
     9:09 (E′) and 9:10 (P).
3. **Base towers opened, and finished:**
   - 5 opened, none finished.
   - Two opened on the tick the inner tower's fall ended the match in sudden death (J, P).
   - Three opened with 23, 30 and 50 s left (E, E′).
   - In E, every decision after the opening went to the close-out or a retreat: the close-out sits above
     the push rule, and with §0.2's line it attacked nothing (§1.4).
   - In E′, on the fixed code, the close-out went at the base tower 21 times of its 34 wins. The bots
     arrived from across the map and took 34 of its 700 hp before 10:00.
4. **Length and deaths:**
   - Median 8:00 (J, P) and 10:00 (E).
   - Deaths a match: J 5.2 (N 5.4), P 5.3, E 8.2. E respawns, where #96's AN, with no economy, had 3.1.
     Easy died 0.1 times a match.
5. **Ladder** (J + E + P): easy < medium ≤ hard holds.
   - Medium beat easy 6–0.
   - Hard against medium went 3–1 with 2 draws (J 1–1, E 0–0–2, P 2–0).
   - **The siege entrant:** easy 6–0; medium 4–4 (J 3–1, E 1–1, P 0–2); hard 2–3, 1 draw (J 1–1, E 1–0–1,
     P 0–2).
6. **The push rule on Jev:**
   - **Shut or absent: 0 yes** in 38,721 J/E/P decisions, 1,602 in E′, and 240 probe states (P0, P0′).
   - **Open: yes 61 of 61 (E) and 50 of 50 (E′).**
   - It never won a decision, because every opening came after 8:00 and the close-out sits above it.
   - Probe: P0 53/60 on open (B), P0′ 54/60 (C). Every miss is keytar.
7. **Hygiene: PASS** (§2.1).
8. **Spend: PASS**, $4.3053.

### 2.4 Why still no base kill

- **Under the Jam ruleset, the Chorus decides first.** A base kill needs an outer (300), an inner (500)
  and the base tower (700) before 8:00.
  - The bots take the first outer tower at a median of ~5:30–6:10.
  - No inner tower was down at 8:00 in any of 22 J and P matches.
  - Then a tower lead wins, or sudden death's first tower does.
- **Softer inner towers don't change that under the Chorus** (stand-in, $0, ranking only, not
  pre-registered; `stand/in300`). The same 30 slots on the base map with inner towers at 300:
  - Jam stack: no inner tower before 8:00, 0 base kills.
  - Arena + eco: inner towers fell in 12 of 30 (median 9:10). That opened 12 base towers, finished 0.
    The bots got there late, and the close-out still sat above the push rule.
- **Without the Chorus, time runs out.** E's and E′'s openings came at 9:09–9:36.
  - #96's AN, with no economy (no respawn), opened two at 8:11–8:12 with 107 s left, and its old bots never
    hit them.
  - The economy brings the defenders back, and the inner tower holds longer.

### 2.5 Caveats

- 8–12-match blocks. Seeds 3 and 7 are near-replays on Jev, and Jev replays easy's matches near
  identically. These are directions, not rates.
- §0.2's defective line was in all 32 block matches. It changes post-8:00 play, so the sudden-death
  results and the ladder are of the bots with it. The base-tower count doesn't rest on it (§2.4).
- E against #96's AN changes two things at once, the bots and the economy. The stand-in's old/new split
  (§0.5) is the only separation, and it found nothing between them.
- E′ is 2 matches, chosen after E was read (§1.5 says so).

## 3. What Ceryce may want to decide

1. **What to try next for base kills.** The data points at the inner tower and the 8:00 Chorus, not the
   base tower. Each is unmeasured on Jev:
   - **A "lane open" rule:** once an enemy outer tower is down, push that lane's inner tower with the wave.
     That is Margo's original wording; the brief fixed the trigger at an inner tower down. It needs a
     map-wide "their towers down" fact; vocab-2 only lists dead towers within 390.
   - **A later Chorus, or none, on base-tower maps.** With no Chorus (E), inner towers fall after ~9:10.
   - **Lower inner hp.** Alone it doesn't beat the Chorus (§2.4).
2. **The close-out rule outside the Chorus.** Its reason ("at eight minutes every tower drops to a
   third") is only true with the Chorus. In the arena's config it still fires after 8:00, above the push
   rule. It would need a "the match has the Chorus" fact to be conditional. Not changed here.
3. **Keep the resolver fallback (§1.5)?** It is its own commit (`6f88bbe`). It turns the close-out's
   misread into a walk to the open base tower instead of nothing.
4. **The placement bar moved.** `house-medium-eco.schemas.json` changed (one rule, inert without base
   towers: 0 yes in 60 pvp-1 probe states). A ladder restarted on it records a new `house` hash.

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
- **Logs, not in git.** On the
  [`data-bots-push-to-base-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-bots-push-to-base-2026-10-02)
  prerelease:
  - the 34 paid logs, `runs/bots-push-to-base-2026-10-02-<block>-<violet>-<green>-seed<N>.json` (block J, E,
    P or Eprime), and the stub smokes;
  - `runs/bots-push-to-base-2026-10-02-analysis/`:
    - the probes (`probe-*.json`, `p1-*.json`);
    - the 240 stand-in sims (`stand/old`, `stand/new`, `stand/in300`) with their exact falls and summaries;
    - all 40 compile samples (`compiles/`) and the pre-job schemas (`old/`);
    - the kit:
      - `kit/ng_jev.mjs`, `ng_stand.mjs` (#96's, with this worktree and `arenaeco`);
      - `pl_oracle*.py` (with the base-tower atom);
      - `probe.mjs`;
      - `pb_analyze.py`, `pb_opened.py`, `pb_targets.py`, `pb_closeout.py`, `pb_tables.py`, `p1_states.mjs`;
      - `ng_falls.mjs` / `ng_replay.mjs`, `tower_ids.mjs`;
    - `hp_derive.py`, `easy_towers.py`;
    - the plans, the run log, and each server's final `/health`.

  To check a log, unzip at the repo root and run `npm run match -- --verify <log>`.
