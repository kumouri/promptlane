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

*Written after the run.*

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
  them taken away from a minion. It almost never kills.
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

*Written after the run.*

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
