# Tower aggro: towers retarget a bearbot that hits theirs under them — 2026-10-02

**Question.** Ceryce, 2026-10-02 19:42 CT: "Allow towers to retarget. Start with only retargeting if
they deal damage to an enemy player in range of the tower."

Today's tower (`src/sim/match.ts` updateTowers, frozen) shoots enemy minions first and a bearbot only
when no enemy minion is in range, first in array order. It never switches. So a bearbot can hit an
enemy bearbot under that enemy's tower for free while its own wave stands there.

- **Budget:** Jev hard stop **$3.00**. Everything that can be done at $0 is done first. Jev is spent
  only on §1.3's blocks, and that plan is committed before the first paid match.
- **Out of bounds:** `src/sim` (frozen), the live arena and its Jev backend (`:8790`, `:8797`), the
  main checkout, the translator (`translator.py`, `compile.py`: two other jobs are working there), and
  the other jobs' branches (`feat/map-nexus-guard`, `fix/vocab2-rule-order`,
  `fix/vocab2-clause-coverage`).

## Verdict

*Written after the run. §0 and §1 were committed (`485c6cd`) and pushed at 20:10:42 CT, before the
first paid match (20:11:57 CT). After the run the branch was rebased onto #96 (nexus-guard), so that
commit is now `3e2b020`, with the plan text unchanged.*

- **Built:** `--tower-aggro aggro-1`, opt-in and off by default everywhere.
  - **Trigger:** an enemy bearbot damages a bearbot of the tower's team while the **attacker** is
    inside the tower's range.
  - **Effect:** the tower shoots that attacker for **3 s** from the hit (refreshed by each further
    hit), or until it leaves the range or dies.
  - **Unchanged:** minion damage doesn't count, and everything else is the specimen's.
  - **Scope:** every tower, including any a map adds. #96's base tower (`pvp-1-hp300-base700`,
    merged during this job) gets it with no change; that is tested, not measured on Jev. `src/sim` is
    untouched.
  - **Replay:** all 74 older paid Jev logs (§0.4) replay byte for byte, before and after the rebase
    onto #96, and so do this run's 20.
- **Jev reads it perfectly.** On the 160 asks where a tower was locked on the bot, "will an enemy
  tower shoot this bot?" came back yes 160 times. On the other 26,386 asks it agreed with the fact every
  time, as before.
- **On Jev the rule fires in 18 of 20 matches,** about 11 shots a match on a locked attacker. 70 of
  the 220 went where today's tower would not have shot (it would have hit a minion or another
  bearbot), and 8 killed.
- **It doesn't deter the dive, and nothing in the prose tells the bots to avoid it.** Shielded dives:
  23 before, 24 after. Their cost went up instead:
  - deaths under an enemy tower 41 → 53;
  - tower kills 21 → 34;
  - the siege entrant's deaths doubled (17 → 34).
- **Lines:** G1 PASS, G2 PASS, G3 PASS (18 of 20, exactly the bar), G4 PASS, G6 PASS, G7 PASS.
  **G5 FAIL:**
  - medium beat easy 4–0;
  - **hard3 took 1 of 8 against medium** (1–5–2; the baseline was 4 of 8).
  - That drop doesn't trace to the towers. In the 4 hard3 slots where aggro changed no tower shot
    at all, hard3 went 1–1–2 against 3–1 before. Both draws had zero aggro shots (§2.3).
- **Spend: $2.4893 of the $3.00 stop**, 20 paid matches. Everything else was free.
- **Live arena:** untouched. Turning it on is one config key plus a Jev backend restart (§3).

## 0. The rule, and what $0 says

### 0.1 Reading the sentence

- **"retargeting":** the tower switches its target to the attacker.
- **"if they deal damage to an enemy player":** an enemy bearbot deals damage (an attack or an
  ability, a killing blow included) to a bearbot of the tower's team. A minion or a tower hitting a
  bearbot doesn't count. Neither does a bearbot hitting a minion or a structure.
- **"in range of the tower":** the **attacker** is inside the tower's attack range. The tower can only
  shoot what is in its range, and this is the MOBA convention her sentence comes from.
  - The other reading is the **victim** inside the range. Under it, a keytar (range 160) could hit a
    defender standing at the tower's edge from outside the tower's range, and draw a lock the tower
    can't act on. Under this rule that hit is still free.
  - In the recorded Jev matches the two readings nearly coincide: in 705 of 710 under-tower episodes
    the victim was inside the range too (§0.4).
- **"Start with only":** nothing else about targeting changes. Minions first otherwise, and the
  specimen's array-order pick.

### 0.2 The rule as built: `aggro-1`, opt-in

`--tower-aggro aggro-1` (`src/towerAggro.ts`, constants in `src/towerAggro/aggro-1.json`):

- **Trigger:** the hit above. Every living tower of the victim's team whose range holds the attacker
  locks on it.
- **How long: 3 s from the hit**, refreshed by every further qualifying hit. It ends early when the
  attacker leaves the tower's range or dies. After that the tower goes back to the specimen's pick.
- **Several at once:** the most recent qualifying hit wins.
- **Which towers:** every entry of `match.towers`. So a map that adds towers, like the base or
  nexus-guard towers on `feat/map-nexus-guard`, gets the rule with no change. A nexus doesn't shoot.
- **Why 3 s, not "until it leaves range":**
  - The tower's commitment scales with the attacker's aggression. One poke costs at most three tower
    shots (54 hp): more than a third of a keytar's or a violin's hp (140, 150) and a quarter of a
    drum's (220).
  - 3 s is more than twice the slowest basic attack's cooldown (1.3 s). So a bot that keeps trading
    under the tower keeps the lock the whole time, and pressing on gets the sticky rule's result.
  - A single poke doesn't become "leave or die", which a 1 s, 18-damage tower shooting a 140 hp bot
    for as long as it stands there would be.
  - It's also the shape of the convention behind her sentence: Dota's creep aggro lasts a couple of
    seconds.
- **Applied from outside the frozen sim,** like `finale`, `recall-2`, `pvp-2` and `pvp-1-hp400`:
  - the layer replaces the instance's tower step with the specimen's own loop plus the lock;
  - it hears hits through `src/attribution.ts`;
  - it attaches right after the map's own layers and before the recall, the economy and the metrics,
    so their attribution wraps the new tower step.
- **Recorded whole** as `MatchLog.towerAggro`; each tower's lock is in every checkpoint (`a`); the
  counters are in `result.towerAggro`. A log without it attaches nothing.
  - The 74 paid Jev logs of §0.4 replay and verify on this branch, byte for byte.
  - So do the committed `runs/` logs in the test suite.
- **Threaded everywhere a match is built:** `runMatch`/`verifyReplay`, `metrics.ts`, the live viewer
  (`src/live.ts`), the arena (`tournament.towerAggro`), the CLI (`--tower-aggro`) and evolve
  (`shape.towerAggro`). Off by default everywhere.

### 0.3 What Jev is told (vocab-2 only; vocabulary-spec §8.12)

The observation carries `towerAggro` and each listed tower's lock (`aggro: {target, leftSec}` or
null). vocab-2 reads them. vocab-1, and any observation without them, reads byte for byte as before.

- **"Will an enemy tower shoot this bot?"** reads true while an in-range enemy tower is locked on it,
  whatever minions are in range, and false for one locked on an ally. Medium, hard and the entrant ask
  exactly this question, every instrument, and fall back to their own tower when it holds. Easy doesn't
  ask it.
- **Per tower:** "…and it is shooting you, not your minions, because you hit its team's bearbot inside
  its range (for up to 2.4 s more, or until you leave its range)". A lock on an ally names the ally;
  an own tower names the enemy it is shooting.
- **The rule, every decision while the match has it:** "Towers retarget: a tower shoots a bearbot that
  damages a bearbot of the tower's team while standing inside the tower's range, instead of minions,
  for 3 s after the hit or until it leaves the range. So an enemy tower will shoot you if you hit its
  team's bearbot while you are inside its range, and your tower will shoot an enemy bearbot that hits
  you or an ally inside its range." (TypeSafe's state guidance: keep the policy and the current facts
  together in the state; the question stays the judgment.)
- **A server from before the rule** would keep saying the tower shoots minions first, so a match with
  the rule refuses a schema server whose `/health` doesn't list it (`tower_aggro`).
- **Not done:** the translator prompt doesn't list the fact (`facts_for` is unchanged). A compile
  doesn't know the match's tower rule, and `translator.py` belongs to two open jobs. The measured
  schemas are precompiled anyway.

### 0.4 The baseline: tower dives in recorded Jev play ($0)

The dive counter is `feat/map-nexus-guard`'s (`ng_dives.mjs`, used as-is, not duplicated). Its
definition, per PvP hit:

- **Under tower:** the attacker is within `t.attackRange` of a living tower of the victim's team.
- **Shielded:** that tower has at least one living minion of the attacker's team in range, so
  today's tower shoots the minion, not the attacker. This is the dive `aggro-1` changes.
- **Episode:** same attacker and tower, gaps under 2 s.

On the 74 paid Jev logs of #88, #90 and #93 (re-run on this branch: identical counts, every log
verifies):

- 21,448 PvP hits. 884 of them (4.1 %) came from under the victim's tower, and **125 were shielded:
  0.56 % of all PvP damage**.
- 710 under-tower episodes, 108 of them shielded, in 44 of 74 matches. The median shielded episode is
  one hit, about 12 damage.
- **No shielded diver died within 5 s (0 of 108).** Unshielded divers did: 65 of 602 (10.8 %).

So the free dive is real but small. It happens about 1.5 times a match, and it's one poke, not a
sustained fight.

### 0.5 Counterfactual: when would a tower shot change? ($0)

The 74 recorded logs, replayed with `aggro-1` forced on and the logged decisions. Up to the first tower
shot that goes somewhere else, the match is the recorded one. After it, nothing is valid.

- **A shot changes in 59 of 74 matches**, all before 8:00: median 1:55, earliest 0:10.
- Forced over the whole replay (rough: the decisions no longer fit after the divergence), about
  **4 retargeted shots a match**, median.
- What this can't see: Jev reads one more sentence every decision under the rule. Any change in its
  answers from that sentence alone shows only on Jev.

### 0.6 The stand-in (ranking only, never a result)

#88's model-free stand-in for Jev (`pl_oracle_server.py`, from #93's kit, with `PL_WT` pointing here so
its "will an enemy tower shoot me" atom reads the lock). The 10 slots of §1.1, off and on, on both
maps: 40 matches.

| | pvp-1 off | pvp-1 `aggro-1` | hp400 off | hp400 `aggro-1` |
|---|---:|---:|---:|---:|
| decided | 10 | 10 | 10 | 10 |
| median length | 8:49 | 8:39 | 8:05 | 8:09 |
| first tower before 8:00 | 0 | 0 | 2 | 2 |
| shielded dive episodes | 9 | 19 | 13 | 12 |
| deaths / under an enemy tower | 105 / 57 | 101 / 56 | 90 / 49 | 84 / 39 |
| aggro shots / retargeted / kills | — | 136 / 52 / 1 | — | 148 / 49 / 5 |
| hard3 vs medium | 0–4 | 2–2 | 2–2 | 2–2 |

- The rule fires in every stand-in match, about 14 tower shots a match on a locked attacker, 5 of
  them at a target today's tower would not have picked. It almost never kills.
- **Nothing outside the stand-in's ±3/12 noise moves.** The stand-in has no rule that avoids hitting
  under a tower. It can only react: fall back once the lock reads "will shoot you". The Jev house
  tiers and the entrant are in the same position, because their prose has no such rule either.

### 0.7 The paired baseline on Jev ($0, already paid)

The 20 recorded Jev logs §1.3 repeats slot for slot: #90 §4's block M and #93's block T (minus their two
pre-#94 hard slots), plus #94's HD-a and HD-b. All 20 played today's schemas: every side's `schemas`
equals today's file.

| | pvp-1 (M + HD-b) | pvp-1-hp400 (T + HD-a) |
|---|---:|---:|
| decided | 10 of 10 | 10 of 10 |
| end reasons | sudden death 10 | chorus lead 5, sudden death 5 |
| median / shortest | 8:41 / 8:05 | 8:01 / 8:00 |
| first tower before 8:00 | 0 | 6 |
| shielded dive episodes (hits) | 14 (14) | 9 (9) |
| deaths / under an enemy tower / tower kills | 43 / 23 / 15 | 47 / 18 / 6 |
| "will an enemy tower shoot you?" agrees with the fact | 13,669 of 13,669 | 13,034 of 13,034 |
| medium vs easy | 2–0 | 2–0 |
| hard3 vs medium | 2–2 | 2–2 |
| entrant3 vs medium | 0–4 | 2–2 |

## 1. Method (written and committed before the first paid match)

### 1.1 What is compared

- **Code:** `feat/tower-aggro` at this commit.
- **Sides:**
  - `entrant3` = `sample-entrant-siege`;
  - `medium` = the push-lane medium, `house-medium-eco`;
  - `easy` = `house-easy-eco`;
  - `hard3` = today's `house-hard-eco` (#94).
- **Lines, every match:** #90 §4.2's Jam stack, with the finale on: `--resolution simultaneous-1
  --targeting own-lane-1 --recall recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2
  --finale final-chorus-1`, full 600 s. `--map` per block, and **`--tower-aggro aggro-1`**.
- **The "off" side is already paid for:** §0.7's 20 logs, slot for slot.
- **The slots (10 a map):**
  - entrant3–medium: 3, 7;
  - medium–entrant3: 3, 7;
  - easy–medium: 3;
  - medium–easy: 3;
  - hard3–medium: 3, 7;
  - medium–hard3: 3, 7.

### 1.2 Lines, and why

| line | pass | fail |
|---|---|---|
| **G1, the rule fires in Jev play** | a locked tower fires at least one shot (`aggroShots` > 0) in **≥ 10 of 20** | under 10 |
| **G2, Jev reads the lock** | on answered asks where an in-range enemy tower is locked on the bot, "will an enemy tower shoot this bot?" is answered yes on **≥ 90 %**; and on every other ask it agrees with the fact on **≥ 98 %** (§0.7: 100 %) | either fails. Under 20 locked asks: INCONCLUSIVE |
| **G3, still decisive** | **≥ 18 of 20** decided (§0.7: 20 of 20) | 17 or fewer |
| **G4, length** | per map, the median within **1:00** of §0.7's; no match ends before **5:00** | either fails |
| **G5, the ladder holds (easy < medium ≤ hard)** | medium beats easy in **≥ 3 of 4**; hard3 takes **≥ 4 of 8** against medium (§0.7: 4 of 8) | medium wins 1 or fewer of 4 against easy, or hard3 takes 2 or fewer of 8. Anything between (medium 2 of 4, hard3 3 of 8): INCONCLUSIVE |
| **G6, clean** | all 20 finish and replay-verify; 0 server errors; 0 parse errors | any of those |
| **G7, spend** | the whole job ≤ **$3.00** on the server's ledger | over it |

- **Why G1 at half:** the counterfactual (§0.5) changes a shot in 80 % of the recorded matches, and
  the stand-in fires in all of them. Under half on Jev would mean the rule rarely matters as Jev plays.
- **Why G2:** her rule only works on the bots if Jev believes the description. 90 % is below the
  stand-in's 94–98 % and far below the 100 % Jev gives the unlocked fact today. The new sentence must
  not cost that 100 %, so the bar there is 98 %.
- **Why G3 to G5:** "start with only" this is a mechanic, not a balance pass. These lines say it
  doesn't break what #88–#94 built: decided matches, length, and the tier order.
- **Reported, not lines:**
  - shielded dive episodes and hits (the nexus-guard counter, unchanged), and whether the diver died
    within 5 s;
  - deaths, deaths under an enemy tower, tower kills;
  - the aggro counters (triggers, triggers with minions, shots, retargeted shots, kills);
  - first tower before 8:00; end reasons; entrant3 against medium;
  - a slot-for-slot table against §0.7.
  - A fall in dives isn't a line. The bots' prose has no rule that avoids hitting under a tower, so
    any deterrence can only come from Jev reading the rule sentence, and §0.4's base rate (about 1.2
    shielded episodes a match here) is too low for 20 matches to tell a change from noise.

### 1.3 The Jev block

- **One server:** a private `tools/jev/schema_server.py` on live Jev (TypeSafe, Workers AI fallback),
  from this worktree, on `:9661`, with `--budget-usd 2.95`. It refuses calls past that, as a backstop
  under the $3.00 stop. A free `--stub` server on `:9662` runs the smokes.
- **Stub smoke, free:** 120 s at seed 7, one match per distinct pairing per map, before any paid match.
  They must finish, verify and show `tower-aggro=aggro-1`.
- **Blocks, in this order:**

| block | map | slots | matches |
|---|---|---|---:|
| **A** | `pvp-1-hp400` | §1.1's ten | 10 |
| **B** | `pvp-1` | §1.1's ten | 10 |

- **The spend guard** (`ta_jev.mjs`, #93's `pl_jev.mjs` with this worktree and the flag):
  - Waves of up to 4. A wave starts only once the last has finished, so nothing is in flight when the
    guard reads the ledger.
  - Before each wave it launches the first k slots where ledger + k × m ≤ **$2.85**. m is the mean
    cost of this run's finished matches, or $0.15 before any has finished (#93: $0.114).
  - Once a slot is cut, nothing after it runs, so a cut takes the end of B first.
  - Expected: 20 × $0.114 ≈ $2.28.
- **Never extended.** No match is added or replayed after any result is seen. A match that crashes
  before it finishes is retried once.
- Jev isn't deterministic (PR #37), so a seed doesn't replay a baseline match. The comparison is block
  against block, and seeds 3 and 7 were near-replays in #88/#90.

## 2. Result

### 2.1 The run

- Blocks A and B played in plan order, 20:11–20:33 CT, in waves of 4. The guard never cut a slot.
  Nothing was retried, added or replayed.
- **20 matches for $2.4893** on the server's ledger ($0.124 a match): 29,453 requests, 0 errors,
  0 failovers. 20 of 20 logs replay-verify, with 0 parse errors and 0 call errors.
- The free stub smoke (12 matches, 120 s) finished and verified first. Its first pass ran each slot
  twice because of a relative `--out` path in the scratch runner (stub only, $0). The runner was
  fixed before any paid match.

| line | result | pass line | |
|---|---|---|---|
| **G1** the rule fires | a locked tower fired in **18 of 20** | ≥ 10 | **PASS** |
| **G2** Jev reads the lock | locked: yes on **160 of 160**; others agree **26,386 of 26,386** | ≥ 90 %; ≥ 98 % | **PASS** |
| **G3** still decisive | **18 of 20** decided (2 draws at 10:00) | ≥ 18 | **PASS** (at the bar) |
| **G4** length | median pvp-1 **8:49** (was 8:41), hp400 **8:09** (was 8:01); shortest 8:00 | within 1:00; none before 5:00 | **PASS** |
| **G5** the ladder | medium beat easy **4–0**; hard3 took **1 of 8** against medium (1–5–2) | ≥ 3 of 4; ≥ 4 of 8 | **FAIL** |
| **G6** clean | 20 of 20 verify; 0 server errors; 0 parse errors | all | **PASS** |
| **G7** spend | **$2.4893** | ≤ $3.00 | **PASS** |

### 2.2 Before and after, slot for slot (Jev)

"Off" is §0.7's recorded match in the same slot. "On" is this run, with `aggro-1`. Dives are shielded
episodes (nexus-guard's counter). "Under a tower" is a bearbot death whose killing hit landed inside a
living enemy tower's range.

| map | slot (violet–green, seed) | off: winner, end, length | on: winner, end, length | shielded dives off → on | deaths under a tower off → on | aggro shots (retargeted) |
|---|---|---|---|---:|---:|---:|
| pvp-1 | entrant3–medium 3 | medium, SD, 8:56 | medium, SD, 8:04 | 2 → 2 | 4 → 5 | 12 (7) |
| pvp-1 | entrant3–medium 7 | medium, SD, 8:30 | entrant3, SD, 8:06 | 5 → 4 | 3 → 5 | 14 (9) |
| pvp-1 | medium–entrant3 3 | medium, SD, 8:52 | medium, SD, 8:53 | 1 → 1 | 4 → 3 | 23 (3) |
| pvp-1 | medium–entrant3 7 | medium, SD, 8:30 | medium, SD, 8:56 | 2 → 3 | 3 → 3 | 19 (1) |
| pvp-1 | easy–medium 3 | medium, SD, 8:26 | medium, SD, 8:48 | 0 → 0 | 1 → 1 | 18 (2) |
| pvp-1 | medium–easy 3 | medium, SD, 8:05 | medium, SD, 8:03 | 0 → 0 | 1 → 1 | 23 (3) |
| pvp-1 | hard3–medium 3 | medium, SD, 8:54 | medium, SD, 8:49 | 2 → 2 | 2 → 2 | 8 (4) |
| pvp-1 | hard3–medium 7 | medium, SD, 8:18 | medium, SD, 8:10 | 2 → 2 | 1 → 5 | 9 (4) |
| pvp-1 | medium–hard3 3 | hard3, SD, 8:56 | draw, 10:00, 10:00 | 0 → 0 | 3 → 3 | 0 (0) |
| pvp-1 | medium–hard3 7 | hard3, SD, 9:32 | hard3, SD, 9:14 | 0 → 0 | 1 → 3 | 1 (0) |
| pvp-1-hp400 | entrant3–medium 3 | medium, lead, 8:00 | medium, SD, 8:06 | 2 → 2 | 1 → 2 | 8 (7) |
| pvp-1-hp400 | entrant3–medium 7 | entrant3, SD, 8:02 | medium, SD, 8:10 | 2 → 2 | 5 → 4 | 9 (7) |
| pvp-1-hp400 | medium–entrant3 3 | entrant3, SD, 8:28 | medium, SD, 8:04 | 1 → 3 | 3 → 2 | 12 (10) |
| pvp-1-hp400 | medium–entrant3 7 | medium, lead, 8:00 | medium, SD, 8:26 | 4 → 2 | 2 → 3 | 19 (4) |
| pvp-1-hp400 | easy–medium 3 | medium, lead, 8:00 | medium, lead, 8:00 | 0 → 0 | 1 → 3 | 15 (2) |
| pvp-1-hp400 | medium–easy 3 | medium, lead, 8:00 | medium, lead, 8:00 | 0 → 0 | 1 → 3 | 15 (2) |
| pvp-1-hp400 | hard3–medium 3 | hard3, SD, 8:09 | medium, SD, 8:10 | 0 → 0 | 1 → 1 | 5 (0) |
| pvp-1-hp400 | hard3–medium 7 | medium, lead, 8:00 | medium, SD, 8:23 | 0 → 0 | 2 → 2 | 3 (1) |
| pvp-1-hp400 | medium–hard3 3 | hard3, SD, 8:32 | medium, SD, 8:08 | 0 → 1 | 2 → 2 | 7 (4) |
| pvp-1-hp400 | medium–hard3 7 | medium, SD, 9:59 | draw, 10:00, 10:00 | 0 → 0 | 0 → 0 | 0 (0) |

| | pvp-1 off | pvp-1 on | hp400 off | hp400 on |
|---|---:|---:|---:|---:|
| decided | 10 | 9 | 10 | 9 |
| median length | 8:41 | 8:49 | 8:01 | 8:09 |
| first tower before 8:00 | 0 | 0 | 6 (6:35–7:39) | 3 (5:00, 5:00, 5:13) |
| shielded dive episodes | 14 | 14 | 9 | 10 |
| deaths / under an enemy tower / tower kills | 43 / 23 / 15 | 62 / 31 / 22 | 47 / 18 / 6 | 55 / 22 / 12 |
| aggro shots / retargeted / kills | — | 127 / 33 / 4 | — | 93 / 37 / 4 |
| medium vs easy | 2–0 | 2–0 | 2–0 | 2–0 |
| hard3 vs medium | 2–2 | 1–2–1 | 2–2 | 0–3–1 |
| entrant3 vs medium | 0–4 | 1–3 | 2–2 | 0–4 |

### 2.3 Reading it

- **The mechanic works as specified, on Jev.**
  - Qualifying hits locked a tower 205 times. 25 of those locks were shielded dives, the free hit the
    rule exists for.
  - Every one of the 160 asks taken under a lock said "an enemy tower will shoot you". So the house
    tiers' and the entrant's existing fall-back rule fires on it.
- **Deterrence: none.** Shielded dives were 23 before and 24 after, and none of those divers died
  within 5 s, before or after. Nothing in medium's, hard's or the entrant's prose says "don't hit
  their bearbot under their tower". So nothing avoids the dive in advance; a bot only falls back once
  it is already locked. The rule sentence alone didn't change that. The punishment lands elsewhere:
  - deaths under an enemy tower rose 41 → 53;
  - tower kills rose 21 → 34, 8 of them by a locked tower;
  - **the siege entrant took most of it:** 17 → 34 deaths across its 8 matches. It went 1–7 against
    medium (was 2–6). It stands in the enemy lane with its wave, which is where locks happen.
- **hard3's 1 of 8 isn't the towers.**
  - In 4 of the 8 hard3 slots, aggro moved no tower shot at all (0 retargeted), so the sim's tower
    fire was the specimen's. In those 4, hard3 went 1–1–2, against 3–1 before.
  - Both draws (medium–hard3 3 on pvp-1, medium–hard3 7 on hp400) had **zero** locks. In each, the
    towers were level at the Chorus (6–6). Then one tower per side fell on the same tick in sudden
    death, which keeps the towers level (`src/finale.ts`), and the match ran to the 10:00 tiebreak
    level.
  - What differs in those slots is Jev itself: it is not deterministic (PR #37), and every
    description carries one more sentence. Eight matches can't tell those two apart.
  - hard3 and medium were already level (2–2, 2–2, #94). The pre-registered line fails, and the
    likeliest reading is noise around level, not a ladder the rule broke.
- **pvp-1-hp400 dropped fewer first towers before 8:00, but earlier ones** (3 at 5:00–5:13, against
  6 at 6:35–7:39). The two 5:00 falls are the easy–medium mirror pair, which Jev plays near-identically;
  the third is entrant3–medium 7, at 5:13.
  A locked tower shoots a bearbot instead of a minion, so a wave lives longer, which should push a
  tower down sooner, not later. Two slots moving the same way at once is weak evidence either way.
- **Length and decisiveness hold.** All 20 baseline matches were decided. Neither of the two draws
  here involved the rule (zero locks).

### 2.4 Caveats

- 20 matches, against 20 recorded ones that were played hours earlier. Jev isn't deterministic, so
  a slot's "off" and "on" are two draws of Jev, not one match with and without the rule.
- Every "on" description carries the rule sentence whether or not a lock is ever drawn. A
  sentence-only block (the sentence stated, the towers unchanged) would split Jev's reading from the
  mechanic. That wasn't pre-registered, and it wasn't run.
- The stand-in (§0.6) overstates fights, and it ranks; it is never a result.

## 3. What Ceryce may want to decide

1. **Keep `aggro-1` as specified, or change one constant first.** It does what she asked. On Jev it
   costs the attacker (more deaths under towers), but it doesn't stop the dive, because no bot's
   prose avoids one. If the goal is fewer dives rather than costlier ones, the next lever is in the
   prose, not the tower:
   - the house tiers (and the entrant template) could learn "don't hit an enemy bearbot while you
     are inside its tower's range";
   - or the vocabulary could give that its own fact ("you are inside the range of a tower that would
     lock on you if you hit its bearbot").
2. **The other readings,** unmeasured:
   - the victim in range instead of the attacker (§0.1);
   - a sticky lock until the attacker leaves range (§0.2's alternative).
3. **Turning it on:**
   - the arena: `tournament.towerAggro: "aggro-1"`, plus a restart of the arena's Jev backend from
     the same checkout so its `/health` lists the rule;
   - the Jam stack's CLI: `--tower-aggro aggro-1`.

   Off by default, like every ruleset layer before it.
4. **hard3 against medium:** if G5 matters for the ladder, an 8-match re-run with the rule **off** on
   today's code would show whether 1 of 8 is Jev's variance. About $1.
5. **The translator** doesn't list the fact yet (§0.3). Wiring it in is a small change for whichever
   translator job is open once theirs land.

## Files

- `src/towerAggro.ts`, `src/towerAggro/aggro-1.json` (new): the rule.
- `src/replay.ts`: `MatchLog.towerAggro`, `result.towerAggro`, the checkpoint's `a`.
- `tools/match/headless.ts`, `cli.mjs` (`--tower-aggro`), `metrics.ts`, `jevSchemaPilot.ts`
  (`towerAggroUnsupported`); `src/live.ts`; `tools/arena/{server,queue,live}.mjs`
  (`tournament.towerAggro`); `tools/evolve/{adapters,generation}.mjs` (`shape.towerAggro`).
- `tools/jev/vocab.py` (`TowerFact` reads the lock; `FACTS_AGGRO`; `TOWER_AGGRO_RULES`),
  `fidelity_harness.py` (the tower lines), `schema_server.py` (`/health` `tower_aggro`).
- Tests: `tools/match/test_tower_aggro.mjs` (in `npm run test:match`), `tools/jev/test_tower_aggro.py`.
- Docs: `docs/vocabulary-spec.md` §8.12, `docs/arena-runbook.md` (`tournament.towerAggro`).
- **Logs, not in git.** On the
  [`data-tower-aggro-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-tower-aggro-2026-10-02)
  prerelease:
  - the 20 paid logs, `runs/tower-aggro-2026-10-02-<A|B>-<violet>-<green>-seed<N>.json`, and the 12
    stub smokes;
  - the 40 stand-in matches, the probe, dive and counterfactual outputs, the scratch kit, the run log
    and the server's final `/health`.

  The 20 "off" logs are on `data-tower-hp-2026-10-02` and #90's data (`kit/baseline-map.json` maps
  each slot). To check a log, unzip at the repo root and run `npm run match -- --verify <log>`.
