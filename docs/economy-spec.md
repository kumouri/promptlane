# Economy spec — gold, levels and items for the Jam (eco-1)

**Status:** P1's blocking questions are ruled: Q1, Q2, Q3, Q4 and Q10 (Telegram, 2026-09-30
20:35–20:37 CT; §8). The river objective's four, Q14–Q17, are ruled too (Telegram, 2026-09-30
20:47–20:48 CT; §8, §9), all option A. The spec body below reads against those rulings. Q5–Q9 and
Q11–Q13 are still open. **P1 (§7) is built**, off by default until the go/no-go gate; §11 records
how it was built and the choices the spec left open. **The river objective (O1 and O2) is built**,
also off by default until its own go/no-go at the same gate; §12 records how, and its §9.8
measurement. **The redesign after that measurement failed, `river-2` and `recall-2`, is ruled
(Ceryce, 2026-09-30 23:00 and 23:02 CT; Q18) and built**, both opt-in. §9.10 has the design, the
design check and its measurement. **The income tuning pass and P2's house side are built** (§13): the
ruleset is now `eco-2`, the house tiers shop on purpose, and §6's measurement is one command (§13.5).
§6 ran on `eco-2` and missed three level lines narrowly. The one tuning pass, `eco-3`, passed every
scorable line, and it is the recommendation for the gate (§13.6).
The entrant-facing part of P2 (README, template, compile preview) waits for the gate.
**Written:** 2026-09-30, after Ceryce chose "minimal economy before the jam" (19:57 CT). §9, the
neutral river objective, was added the same evening after she backed the idea (20:34 CT).
**Jam:** the date is unsettled (2026-10-02). The milestones this spec plans against (the go/no-go
gate, entrant-facing changes landing, sign-ups closing, the numbers freeze, the entry cutoff, the
Jam) and their order stand. Their dates live only in [the Jam calendar](arena-runbook.md#the-jam-calendar).

> "The MVP was supposed to have the minimum version of stats, items, gold, and leveling to give the
> bots more strategy surface." — Ceryce, 2026-09-30 19:54 CT
>
> "we should aim for a game that at least ENABLES exciting play, and that means it encourages player
> vs player interaction instead of player vs environment; even the player vs environment parts
> should encourage team fights and such." — Ceryce, 2026-09-30 19:46 CT

Every mechanic below is judged against that second quote. The test for each one is: **does it make
bearbots fight bearbots, and does its PvE part pull them toward one another?** If a mechanic only
adds numbers, it is cut.

---

## 0. The recommendation in one screen

| # | Recommendation | Why, in one line |
|---|---|---|
| 1 | **Respawn becomes part of the ruleset.** Timer is `6 s + 3 s × level`. *Ruled, Q1.* | Today a death is permanent (§1). That makes any risk to carried gold pointless and rewards hiding. |
| 2 | **Dota's two-pool shape, every knob a constant.** Unspent gold sits in an at-risk pool and a safe pool; which sources feed the safe pool, how much of the at-risk pool a death costs, and how much of that loss the killers get are all in `eco-1.json`. **The default:** safe pool empty, half of unspent gold lost on death, **all of it to the bots that killed you**. *Ruled, Q2.* | The default is Ceryce's recollection of Dota, which neither game actually ships (§2). For her principle it beats both: hold-vs-spend, risk-while-carrying and hunt-the-carrier from one rule. Modelling it the Dota way means it can be tuned toward Dota or League by editing numbers (§3.3). |
| 3 | **Kill gold 200, an assist pool of 100, first blood +100.** Minion last hit 15. Passive 0.5 gold/s. *(eco-1's starting values. The income tuning pass doubled PvP gold and raised the rest: `eco-2`, §13.1.)* | One kill is worth about 13 last hits. Passive is a floor so even a weak bot gets one item. Most income has to be earned, and about a third of it should come from PvP. |
| 4 | **Tower gold is part team-wide, part split among the bots standing near it.** | This is the PvE that pulls bots together: objectives pay the bots that show up, so the other team has to show up too. |
| 5 | **Five levels from shared-proximity XP.** Each level gives +8 % max hp and +8 % attack damage. No level-up choice. | XP for being near a fight or a push, not for last hits, pays for grouping. A level-up choice would add a decision the translator can't express well. |
| 6 | **Four items in three slots, each with a real cost** (Amp, Road Case, Bass Strings, Metronome). No Tip Jar. *Ruled, Q4; names still placeholders (Q13).* | A bot can't own everything, and every item gives something up. Bass Strings heals only from damage dealt to enemy bearbots. |
| 7 | **Buy only at your own base. The prose declares a shopping list.** It is bought automatically when you're at base and can afford the next item. There is no new action kind. *Ruled, Q3.* | The decision a bot makes during play is *when to go home*. That is a yes/no question Jev already answers well. A `buy` action would be a new failure mode in the translator. |
| 8 | **All of it runs outside the frozen sim**, as `src/economy.ts` plus one constants file. Match logs record it as `economy: "eco-1"`. | This is the same pattern as the balance study's `src/mapVariant.ts`. Old logs replay unchanged. |
| 9 | **Measure on Jev** with the balance study's metric tool, in four seed-paired conditions (§6). There are pre-registered pass/fail lines. | Standing rule: Jev, never qwen 9B. |
| 10 | **A go/no-go gate at end of day, then entrant-facing changes land, then the numbers freeze** (§7). *Ruled, Q10.* | Entrant-facing changes land before sign-ups close. Entrants must see the rules they are writing against. |
| 11 | **A neutral river objective, the Bandstand** (§9). It alternates between two river sites outside every tower's range. A team takes it by holding the stage, and any enemy on the stage freezes the capture. The reward is a 45 s team Encore buff, plus gold and XP when the economy is on. Bots reach it through one new move selector, with no new action kind. It has its own layer and its own gate, and is measured on Jev before the gate. | `pvp-1` cut team fights from 4.6 to 2.75 a match by removing the one spot both teams converged on. This puts a shared spot back on neutral ground, and only PvP can win it. |

---

## 1. Where the game is today (facts this spec is built on)

All `file:line` references are on `develop` at `850c7c7`.

- **No economy exists.** `docs/render-spec.md`: "No gold, income, vision, or 'power' stat exists
  anywhere in `src/sim/`." Gold was never in `prompts/initial_prompt.md`.
- **No respawn.** `checkDeath` sets `alive = false` (`src/sim/match.ts:390-395`), and nothing ever
  sets it back. Bearbots are only created in the constructor (80-91). The entrants README says the
  same: "There is no respawn: a dead bearbot stays dead for the match."
- **Stats are per-bot mutable fields**, read every tick:
  - the fields are `maxHp`, `moveSpeed`, `attackRange`, `attackDamage` and `attackCooldownSec` (`src/sim/entities.ts:69-90`);
  - recall heals to `bot.maxHp` (`match.ts:251`).
  - Ability damage and cooldowns come from the shared `INSTRUMENTS` table (`entities.ts:27-67`), so per-bot changes to those need a wrapper (§3.9).

  | Instrument | hp | speed | range | dmg / interval | abilities (cd) |
  |---|---|---|---|---|---|
  | drums (tank) | 220 | 55 | 40 | 8 / 1.1 s | kick 6 s, fill 10 s |
  | keytar (mage) | 140 | 60 | 160 | 10 / 1.3 s | chord 7 s, glissando 9 s |
  | violin (assassin) | 150 | 75 | 45 | 11 / 0.9 s | staccato 4 s, solo 40 s |

- **Pace.**
  - A match is 600 s (`match.ts:19`).
  - Waves come every 30 s, with 3 minions per lane per team (60 hp, 6 dmg).
  - Each team has 6 towers (900 hp, 18 dmg, range 160) and a nexus (2200 hp).
  - At timeout the sim's tiebreak is towers alive, then nexus hp (`match.ts:490-500`).
  - The bracket adds "fewer deaths" before tower hp (`tools/arena/rating.mjs:127-144`).
  - Recent test matches were mostly timeout draws.
- **Jam shape.** It's 3v3 with the Jam roster (`src/replay.ts:26-33`): drums top, keytar mid and violin bottom on each side. Decisions come every 2 s (`tools/match/cli.mjs:53`). Entrants write prose, which the translator (`tools/jev/translator.py`) compiles into a cascade, and Jev answers each rule's yes/no question against a prose description of the observation (`tools/jev/fidelity_harness.py:93-146`).
- **The sim is frozen.** `src/sim/*`, `src/rng.ts`, `src/pilots/*` and `src/types.ts` are the v1 specimen, with hashes in `runs/historical-v1.md`. Jam tooling drives the sim from outside (`tools/match/headless.ts:44-47` reaches the private `tick`). The balance study's `src/mapVariant.ts` (PR #48; `pvp-1` is `DEFAULT_MAP`) is the precedent for a ruleset change applied from outside.

---

## 2. Dota 2 vs League of Legends gold — verified

Ceryce asked (20:01 CT) for the two models to be compared against primary sources. Every claim below
is quoted from the wikis, which were read through their MediaWiki APIs on 2026-09-30. The page
revision IDs are listed in §10.

### 2.1 Dota 2: reliable and unreliable gold

**The two pools, current page text** (Dota 2 wiki, *Gold*):

> "**Reliable gold**: Passive gold receive every seconds; Gold gained from activating bounty runes.
> **Unreliable gold**: Any other source (Hero kills, Creep kills, Building destroys, Hand of Midas,
> Track, etc)."
>
> "Dying only takes away gold from the unreliable gold pool. Buying items uses up the unreliable gold
> first before falling back to reliable gold. Buyback uses reliable gold first."

**Death loss** (*Gold* §Death and *Death* §Gold): "A hero loses the following amount of unreliable
gold every time it dies. Dying does not take away reliable gold." The formula is
**`GoldLoss = NetWorth / 40`**. That is 2.5 % of net worth, and it can only come out of the unreliable pool.
**Neither page says the lost gold goes to anyone.** It vanishes.

**The killer's reward is computed separately.** It doesn't come out of the victim's loss:

- Hero kill bounty is `125 + 8 × victim level + streak gold (+135 first blood)`. It is unreliable for the killer. The 125 base dates from 7.31, 2022-02-23.
- Shutdown (streak) gold is `5k² + 5k` for a streak of k = 3…10, which gives 60 / 100 / 150 / … / 550 (7.31).
- "AoE" assist gold goes to every allied hero within 1500 of the victim who assisted, including the killer. It scales with the **victim's net worth**. The changelog gives the 7.33 formula (2023-04-20) as `10 + (50 + VictimNetWorth × 0.037) / NumHeroes`. The body of the Gold page still shows the older `(30 + NW × 0.038) × k / N`, so the page lags its own changelog.
- **Net effect:** a rich victim does pay more, through the assist term, but the gold they lose on death isn't what pays it.

**Buyback** is an instant respawn at the fountain. It costs `floor(200 + NetWorth / 13)`, "only takes from reliable gold first, and then from unreliable gold", and lengthens the next death timer. Its purpose is joining a decisive team fight or defending the base while dead. That is the main use of reliable gold.

**Other sources:**
- Passive income is 90 gold/min at 0:00, rising slowly. It is reliable.
- Lane creep bounties are roughly 34–72 depending on type. They are unreliable.
- A tower pays every player on the team (90–145 by tier) plus a last-hit bonus, all unreliable.

**History, which explains both recollections:**

| Version | Date | What changed (changelog / version page) |
|---|---|---|
| 6.68 (WC3 DotA) | 2010-07-26 | Reliable gold introduced: "Any bounty you get from hero kills or from the extra 'AoE kill gold' bonus … is added to your reliable gold pool. Unreliable Gold: Everything else (creep kills, neutrals, etc)." |
| 7.26b | 2020-04-28 | "Reliable gold is now given only for passive income." "Hero kills, building destructions, killing Roshan, Couriers, gold transmuted from Hand of Midas, self Track no longer grant reliable gold." |
| (later, patch not pinned) | — | The current page lists bounty runes as reliable too. |

**Checking the two recollections:**

- **Ceryce:** "two pools … one of them you lose part of to the enemy when you are killed by them, as extra gold … money you make from creeps can't be 'stolen'."
  - *Two pools, and part of one is lost on death:* **right.**
  - *Lost to the enemy as extra gold:* **not in the current rules.** The loss vanishes. The killer's bounty is a separate formula, though it does grow with the victim's net worth through assist gold.
  - *Creep gold is safe:* **wrong in every version.** Creep gold has been unreliable since the mechanic was introduced in 6.68.
- **Margo:** creep gold unreliable; hero-kill, assist and Roshan gold reliable; lost gold vanishes.
  - *Creep gold unreliable:* **right.**
  - *Kill, assist and Roshan gold reliable:* **right from 6.68 to 7.26a, wrong since 7.26b (2020-04-28).** Today only passive income and bounty runes are reliable, so every bit of earned gold is at risk until it's spent.
  - *Lost gold vanishes:* **right**, as far as both pages say.

### 2.2 League of Legends: one pool, nothing lost, bounties do the work

**No gold is lost on death.**
- The *Gold* article lists starting gold, passive income, bounties and selling. Neither it nor *Champion gold bounties* describes any gold leaving a champion on death.
- Death changes only the victim's **bounty**, meaning what they are worth to the enemy.

**Kill gold** (*Champion gold bounties*):
- "The slain champion's full gold bounty is granted to the champion who is credited the kill."
- Base bounty is 300 at levels 1–6, rising to 420 at level 18 (V25.09, 2025-04-30).
- First blood is +100 (restored in V26.01).
- "Assist bounties are always half of the kill bounty … capped at 50% of the base amount", "shared equally among every assistor". They are reduced to 50–100 % early in the game.

**Kill credit** (*Kill*):
- Any enemy-champion damage or crowd control within **15 s** credits a kill on Summoner's Rift.
- A champion killed by a tower or minion with no champion involvement is "executed": "An executed champion's gold bounty is not dispensed nor affected."

**Bounties grow with gold earned. These are not streak tiers.** League removed streak tiers in V14.21 (2024-10-23). Current rules (V26.03, 2026-02-04):
- **Accrual:** a champion accrues 1 bounty per **3** gold earned from kills and assists, and 1 per **20** gold from minions and monsters (1 per 7 while in a negative state).
- **On death:** bounty depreciates 1 per 3.5 gold paid out. If the champion had shutdown gold, all of it is paid instead.
- **Shutdown gold** is anything above base + 100. One kill pays at most base + 700.
- **Floor:** the minimum bounty is 50.

**Comeback systems:**
- **Shutdown suppression.** "After 6:00 game time, if a team is not convincingly winning then Shut Down gold is … reduced by 30% / 60% / 90% / 100%." (V25.06/V25.09)
- **Objective bounties.** These are paid to the losing team for taking objectives. From the V25.09 notes: "Objective bounty accrual is now based on the enemy's gold lead exclusively. Objective bounties now scale at a rate of 10% of the team gold deficit, capped at 1000 per objective." The wiki has no standalone article on objective bounties (the link is a redlink), so this comes from the V25.09 patch-notes page plus *Champion gold bounties* "Other rules".

**Other sources:**
- Passive income is 20.4 per 10 s, starting at 1:05.
- Turrets pay global and local gold. Outer-turret plating is split "equally among nearby allies upon being destroyed".

### 2.3 Which mechanics serve Ceryce's principle and give bots decisions

| Mechanic | More PvP? | PvE that feeds fights? | Decision it creates for a bot | Cost to us |
|---|---|---|---|---|
| Dota at-risk pool (loss vanishes) | Yes. Dying costs, so fights carry stakes. | No | Spend vs hold. Risk while carrying. | Low |
| **At-risk gold that goes to the killers** (Ceryce's version) | **Yes, twice.** Dying costs, and killing a carrier pays. | No | Spend vs hold. Risk while carrying. **Who to hunt.** | Low. One extra rule. |
| League bounty accrual (worth = gold earned) | Yes. The fed bot becomes a target. | No | Who to hunt | Medium. A second counter per bot. |
| Dota AoE/assist gold by proximity | Yes. Being near a kill pays. | — | Group up | Low |
| Dota buyback (reliable pool) | Yes, but late game | — | Save for a buyback | High. A second pool and a new action. |
| League objective bounty (pays the team behind) | Indirect | **Yes.** Objectives become fights. | Contest or concede | Medium |
| League turret plating split among nearby allies | — | **Yes.** Pushes pay whoever shows up. | Group the push | Low |
| Shared XP by proximity (both games) | — | **Yes** | Stay near allies | Low |

**Ruled (Q2): Dota's two-pool shape, defaulting to carried gold that drops to the killers (§3.3).**
The model has Dota's at-risk and safe pools, with every knob a constant, so it can be moved toward
Dota or League as measurement comes in. Its default leaves the safe pool empty and pays the whole
loss to the killers. That default is the transfer Ceryce remembered, and it turns out to be stronger
for her principle than what either game ships.
- A bot holding gold has a reason to go home and spend it.
- A bot that can't go home yet is a richer target.
- The bot hunting it can see how much it is worth (§4.1, `bounty`).

That covers Dota's spend-vs-hold, League's "kill the fed one", and a natural shutdown, all in one
rule. The League philosophy since V14.21, where bounty tracks gold earned, comes for free: unspent
gold *is* the bounty.

Add the cheap PvE-to-fight levers on top:
- tower gold split among the bots present (League plating);
- XP shared by proximity (both games);
- assist credit by proximity (Dota AoE gold).

**Simpler fallback, "League-lite":** gold is never lost. There is a flat kill bounty, an assist split
and first blood. The economy still exists, but there is no risk-while-carrying decision.
Spend-vs-hold reduces to "go home when you can afford something". It is the right fallback if
measurement (§6) shows carried-gold drops make matches runaway, or if the translator can't express
the risk. Under the ruled model it is a preset, not a rewrite: set the death-loss fraction to 0
(§3.3).

**Deferred, not cut forever:**
- *Buyback* needs a second pool and a new action.
- *Objective bounties* need a team-lead model, so they're held until swinginess has been measured (§8 Q7).

---

## 3. The minimal economy: `eco-1`

All numbers are starting values, chosen to be measured (§6). The reasoning is beside each. Every
value lives in one constants file (§3.7), and nothing is hard-coded anywhere else.

### 3.1 Respawn (prerequisite)

A dead bearbot comes back at its lane spawn point (`pathT` 0.08 / 0.92, the same place it started)
with full hp after **`6 + 3 × level` seconds**: 9 s at level 1, 21 s at level 5.

- **Why it's needed.** Without respawn a death is permanent. Losing carried gold is then
  irrelevant, kill gold buys items for a 3v2 that's already decided, and the safest strategy is to
  never fight. That is the specimen's historical failure, where low-hp retreats prevented first blood.
- **Why these numbers.** 9–21 s is 1.5–3.5 % of a 600 s match. That is long enough for a kill to
  open a window to push (one wave is 30 s), and short enough that a death early on doesn't decide the
  match. Timers that scale with level make late kills worth more, as in both games.
- **Shopping on respawn.** Spawn points are within the shop radius: the top and bottom spawns are 128 path units from base and mid is 90, against a shop radius of 150. So respawning *is* a shopping trip, like buying while dead in Dota.

### 3.2 Gold sources

| Source | Gold | Who gets it | Reasoning |
|---|---|---|---|
| Passive | 0.5 / s from 0:00, so 300 per match | each bot | A floor, so every bot gets about one item even if its pilot never earns. It's kept small so most income is earned. Dota pays 90/min and League about 122/min, but their matches are 3–4 times longer. |
| Minion last hit | 15 | the bearbot that dealt the killing damage | Minions killed by minions or towers pay nothing, as in League and as in the metric tool's proxy. 15 makes a kill worth about 13 last hits (League is about 15, Dota about 3–4). |
| **Bearbot kill** | **200** | the credited killer | Kill credit goes to the **last enemy bearbot that damaged the victim within 10 s**. A minion or tower may land the blow, as in League's 15 s rule. 10 s matches the metric tool's `ASSIST_WINDOW_SEC`. |
| Assist pool | 100, split equally | assisters | An assister is any other enemy bearbot that damaged the victim within 10 s, **or stood within 250 of it at death**. That is Dota's proximity assist; 250 is the metric tool's `FIGHT_RADIUS`. Being in the fight pays. |
| First blood | +100 | the killer of the first credited kill | Both games have it (Dota 135, League 100). It is a direct answer to "no first blood". |
| **Death drop** | default: 50 % of the victim's **at-risk** gold, all of it paid on | split equally among killer and assisters | §3.3; every number is a knob |
| Tower | 100 to every bot on the team, alive or dead, **plus 120 split among the team's bots within 300 of the tower** when it falls | team / bots present | The team share keeps a push worth doing. The local share is League's plating rule: the bots that show up are paid, so the defenders have to show up too, and the PvE objective becomes a team fight. |
| Nexus | — | — | The match ends. |

**Execution** is a death with no enemy bearbot damage in the window, i.e. killed by a tower or minion
alone. It pays no kill or assist gold, and the victim's loss **vanishes**, whatever the killer share
is set to: it costs the victim but pays nobody. This follows League's execution rule and Dota's vanishing loss. Paying the defenders
would reward sitting under a tower, which is PvE.

**Expected income per bot over 600 s** (to be checked in §6):
- passive 300
- last hits 150–300
- towers about 150–250
- kills, assists and drops about 250–400

That's about **850–1250 in total**, with **about 30–40 % from PvP**. Three item slots cost 1000–1050,
so a typical bot finishes 2 items and a strong one finishes 3.

*Checked by the economy slice: eco-1 paid 59 gold/min/bot. Every source was short because bots
took far fewer last hits, towers and kills than this estimate assumed, not because each one paid
too little. The band is kept and the prices are raised: `eco-2`, §13.1.*

### 3.3 Carried gold and death

> "Start with half drops to the killers, but model it the dota way so we can tune it to be like dota
> or league as we find things out." — Ceryce, 2026-09-30 20:36 CT (Q2)

**The model is Dota's shape, with every knob a constant** (`gold.pools` and `gold.death` in §3.7):

- **Two pools per bot.** Unspent gold is either **at risk** (Dota's unreliable) or **safe** (Dota's
  reliable). Every income source has a ledger key (`passive`, `minion`, `kill`, `assist`, `drop`,
  `first-blood`, `tower-team`, `tower-local`). **`pools.safeSources`** lists the keys paid into the
  safe pool; everything else is paid into the at-risk pool. Items are never lost.
- **Spending** takes from the at-risk pool first, then the safe pool, as in Dota.
- **Death loss.** On a death the victim loses
  `loss = min(atRisk, floor(lossOfAtRisk × atRisk + lossOfNetWorth × netWorth))`, where net worth is
  both pools plus the cost of every item owned. Only the at-risk pool can pay it.
- **Who gets it.** On a credited death, `floor(toKillers × loss)` is split equally among the killer
  and the assisters (remainder to the killer). The rest vanishes. On an execution all of it vanishes.

**The default (Q2 option A, the ruling's "start with half drops to the killers"):** `safeSources`
empty, `lossOfAtRisk` 0.5, `lossOfNetWorth` 0, `toKillers` 1.0. All gold, passive included, is at
risk until it is spent, and half of it goes to the bots that killed you. Everything else in this
spec is written against this default.

**Presets** — each is an edit to `eco-1.json` plus a new ruleset name, no code change:

| Preset | `safeSources` | `lossOfAtRisk` | `lossOfNetWorth` | `toKillers` | What it plays like |
|---|---|---|---|---|---|
| **Default (Q2-A)** | — | 0.5 | 0 | 1.0 | Carried gold drops to the killers. |
| Gentler (old Q2-D) | — | 0.25 | 0 | 1.0 | The same, if the default measures as runaway. |
| Dota-like | `passive` | 0 | 0.025 (net worth / 40) | 0 | Earned gold is at risk, passive is safe, the loss vanishes. |
| League-like | any | 0 | 0 | — | Nothing is ever lost; kill and assist gold do the work. |

- A bot's **bounty** is the most that killing it pays the enemy team: kill + assist pool +
  `floor(toKillers × loss)`, which is `200 + 100 + floor(0.5 × atRisk)` under the default. The
  assist pool is paid only when someone assists. The first-blood bonus is left out. Bounty is shown
  to everyone (§4.1). Hunting the carrier is a decision the bot can see and make. Under a preset with
  `toKillers` 0 the bounty is flat, and the carrier-hunting decision goes away.
- **What this does to a bot's choices:**
  - *Spend vs hold.* Going home costs tempo, often a wave. Staying out risks the gold.
  - *Risk while carrying.* A bot carrying 400 gold has a reason not to start a fight it isn't sure to win.
  - *Target selection.* Killing an enemy carrying 400 is worth 500 to the killing team, which is more than an item.
  - *A natural shutdown.* A bot that has been winning and hasn't been home is worth the most.
- **Snowball check.** The killer gets richer, but a rich killer is in turn worth more to kill. With
  no streak gold, no level term in the bounty and short respawns, the main brake is the bounty
  itself. Swinginess and comeback rate are measured in §6. If runaway shows up, move to the gentler
  preset, or to Dota-like or League-like, by editing the constants (the Q2 ruling's "as we find
  things out").

### 3.4 Experience and levels

- **XP sources** (shared by proximity, not by last hit):
  - **Enemy minion dies:** 10 XP to *each* friendly bearbot within 300.
  - **Enemy bearbot dies:** 60 XP to the killer and to each assister.
  - **Enemy tower falls:** 40 XP to each friendly bearbot within 300.
- **Levels:** 1–5. The cumulative XP thresholds are `[0, 80, 200, 360, 560]`.
- **Each level above 1 gives:** max hp +8 % and attack damage +8 % of the instrument's base, so level 5 is +32 %. Current hp rises by the same amount as max hp. Respawn time rises 3 s per level.
- **Reasoning.**
  - Proximity XP without a split means a bot standing next to an ally gains the same XP as alone, but *two* bots level instead of one. Grouping pays, which is the "PvE parts should encourage team fights" clause.
  - About 30 enemy minions die near a laner per match, which is about 300 XP or level 3 from farming alone. **Level 4–5 needs kills or towers**, so the last levels are PvP and objective rewards.
  - The per-level bonus is small on purpose. Levels should add up rather than decide fights, and items are where choice lives.
- **No level-up choice** (no skill points or talents). It would be a second decision vocabulary for
  the translator. The spend decision already carries most of the strategic weight. It is listed as an
  option in §8 Q5.

### 3.5 Items

There are **three slots** and **four items** (Q4, ruled). There's no
selling, no duplicates and no recipes. The names are placeholders until Q13 is ruled. **Every item gives up something**, either a stat or what it is
useless for.

| Item | Cost | Gives | Gives up | Who wants it |
|---|---|---|---|---|
| **Amp** | 350 | attack damage +35 % | max hp −15 % | Glass cannon. A keytar that kites, or a violin that commits. |
| **Road Case** | 300 | max hp +35 % | move speed −12 % | Tanky but can't chase or escape. A drums frontline. |
| **Bass Strings** | 350 | heals 30 % of damage dealt **to enemy bearbots** (attacks and abilities) | Nothing from minions, towers or nexus | Only pays off while fighting bearbots. A PvP item by construction. Taken from the design doc's "bass … sustain = lifesteal". |
| **Metronome** | 350 | ability cooldowns −30 % | basic attack interval +15 % | An ability-first pilot: violin staccato 4 → 2.8 s, keytar chord 7 → 4.9 s. |

*Tip Jar* (200: +50 % gold from kills, assists and drops, but your death drop is 100 %) was the
optional fifth item. Q4 ruled it out of eco-1.

- **Stacking.** `stat = instrumentBase × (1 + levelBonus) × Π(1 + itemModifier)`. For example, drums with Road Case and Amp has `220 × 1.35 × 0.85 = 252` hp at level 1.
- **Three slots from four items**, so every build leaves one out. The choice is what to skip and in what order.
- **Late-game gold.** Once all slots are full, extra gold buys nothing and only raises the bot's bounty. That is deliberate. A bot that has won enough to fill every slot becomes a target, which is a comeback lever that costs nothing to build. (On recorded eco-3 logs the defenders hit that wall by about minute 5. [`late-game-economy-spec.md`](late-game-economy-spec.md) proposes recipes and more levels as the sink.)
- **Default builds** apply when a pilot names no items, so a pilot that ignores the economy still gets items:
  - drums: Road Case → Bass Strings → Metronome
  - keytar: Metronome → Amp → Road Case
  - violin: Amp → Bass Strings → Road Case

**Which stats each mechanic touches:**

| Mechanic | maxHp | attackDamage | moveSpeed | attackCooldownSec | ability cooldowns | heal |
|---|---|---|---|---|---|---|
| Level | +8 %/lvl | +8 %/lvl | | | | |
| Amp | −15 % | +35 % | | | | |
| Road Case | +35 % | | −12 % | | | |
| Bass Strings | | | | | | 30 % of PvP damage dealt |
| Metronome | | | | +15 % | −30 % | |

Attack range is untouched on purpose, because range is what the balance study's map variants are
measured against (§3.10).

### 3.6 The shop

- **Where:** within **150** of your own base. That covers the recall endpoint (< 20 from base) and every respawn point.
- **When:** whenever an alive bot is in the shop radius, has a free slot, and can afford the **next item on its shopping list**. That item is bought at once, without spending a decision or a tick. The list is followed in order; an unaffordable next item is not skipped. So **saving for an item is implicit**: the gold waits until there is enough.
- **Shopping list:** the item list the entrant's prose declares (§4.3), or the instrument default.
- **Why only at base, and not anywhere.** Buying anywhere removes the spend-vs-hold choice: gold would be spent the moment it was earned, and carried gold would never be at risk. Buying at base turns *recall* into the economic decision, and recall is already in the action vocabulary and in every pilot's prose.

### 3.7 The constants file — single source of truth

One file, `src/economy/eco-1.json`, is read by the TypeScript layer, the Python translator and serializers, the
house bots, and the generator for the README table. Changing a number is an edit to that file plus
a new ruleset name, not a code change. (As built, each item also carries its `gives` and `givesUp`
text, which the translator prompt and Jev's description read; the block below shows the numbers.)

```json
{
  "name": "eco-1",
  "respawn": { "baseSec": 6, "perLevelSec": 3 },
  "gold": {
    "start": 0, "passivePerSec": 0.5, "minionLastHit": 15,
    "kill": 200, "assistPool": 100, "firstBlood": 100,
    "towerTeam": 100, "towerLocalPool": 120, "towerLocalRadius": 300,
    "pools": { "safeSources": [] },
    "death": { "lossOfAtRisk": 0.5, "lossOfNetWorth": 0, "toKillers": 1.0 }
  },
  "credit": { "windowSec": 10, "assistRadius": 250 },
  "xp": {
    "radius": 300, "minion": 10, "kill": 60, "tower": 40,
    "thresholds": [0, 80, 200, 360, 560],
    "perLevel": { "maxHp": 0.08, "attackDamage": 0.08 }
  },
  "shop": { "radius": 150, "slots": 3 },
  "items": {
    "amp":          { "name": "Amp",          "cost": 350, "mods": { "attackDamage": 0.35, "maxHp": -0.15 } },
    "road-case":    { "name": "Road Case",    "cost": 300, "mods": { "maxHp": 0.35, "moveSpeed": -0.12 } },
    "bass-strings": { "name": "Bass Strings", "cost": 350, "mods": { "pvpLifesteal": 0.30 } },
    "metronome":    { "name": "Metronome",    "cost": 350, "mods": { "abilityCooldown": -0.30, "attackCooldownSec": 0.15 } }
  },
  "defaultBuilds": {
    "drums":  ["road-case", "bass-strings", "metronome"],
    "keytar": ["metronome", "amp", "road-case"],
    "violin": ["amp", "bass-strings", "road-case"]
  }
}
```

### 3.8 Ticking order (deterministic)

The economy uses no RNG. Each tick runs in this order:

1. Run the sim tick. Inside it, the attribution hooks record every hp change with its source (§3.9).
2. Resolve that tick's deaths: kill credit, then gold, then the death loss and its payout, then XP.
3. Resolve tower deaths: team gold, then local gold, then XP.
4. Pay passive gold.
5. Apply level-ups.
6. Respawn every bot whose timer has expired.
7. Auto-buy for every bot at the shop.
8. Re-derive stats.

With the river objective on, its update runs right after the sim tick, before step 2 (§9.6, §12:
it does not depend on steps 2–3, and steps 4–8 see its rewards on the same tick), and step 8
includes the Encore modifier through the shared derivation.

### 3.9 How it runs outside the frozen sim

This is a ruleset layer, the same shape as `src/mapVariant.ts`. Nothing in `src/sim/*`, `src/types.ts` or `src/pilots/*` changes.

| Need | How, from outside | Precedent |
|---|---|---|
| Who damaged whom (kill credit, last hits, lifesteal) | Wrap four instance methods on the match: bearbot attack, ability, minion update and tower update. Diff every unit's hp before and after each call. | `tools/match/metrics.ts` (balance-pvp) does exactly this today. |
| Stats from levels and items | Write the bot's own mutable fields (`maxHp`, `attackDamage`, `moveSpeed`, `attackCooldownSec`) between ticks, through the one stat derivation shared with the river objective (§9.6). | `applyMapVariant` writes `tower.attackRange`. |
| Ability cooldown −30 % | After each tick, a cooldown that *rose* means a cast just happened. Scale what remains. | — |
| Respawn | Between ticks, set `alive`, `hp`, `pos`, `recalling`, `buffs` and targets. Set the bot's private `pilotState.currentAction` to `hold`, reached by a cast exactly as `headless.ts` reaches `tick`. A revived bot is polled again on the next tick, because `pollPilots` skips only dead bots. | `headless.ts:44-47` |
| New observation fields | Wrap `pilot.decide(obs)` so the observation is extended before the pilot sees it. | `RunOptions.decisionPilotFor` (`headless.ts:63`) |
| Replay | The log records `economy: { ruleset, builds }`: the whole ruleset object, as `MatchLog.map` records the whole variant, so retuning `eco-1.json` can never change an old replay. `checkpointOf` adds per-bot `[atRisk, safe, xp, items]` **only when the log has an economy**, so every existing log replays bit-identically. | `MatchLog.map` in balance-pvp |

**Where it must be applied.** Everywhere a match is built:
- `tools/match/headless.ts`, in **both** `runMatch` and `verifyReplay`, which have duplicate tick loops;
- `src/live.ts` and the browser replay view;
- `tools/arena/live.mjs` and the arena queue;
- `tools/match/metrics.ts`.

**Shared attribution module.** `metrics.ts` and the economy need the same damage attribution. Extract
it once, as `src/attribution.ts`, rather than having two wrappers nest around the same methods.
Whichever of the two PRs merges second rebases onto the first.

**The project's principle.** `docs/design.md` says "the prompt is the source" and that a game change
is the next prompt (`prompts/v2.md`), not a patch. An external ruleset layer is Jam tooling, as the
map variant is. If the economy proves out, it should be written into `prompts/v2.md` after the
Jam (§8 Q11).

### 3.10 How it composes with the PvP balance study (PR #48, merged)

The balance study is merged. `pvp-1` is `DEFAULT_MAP`: both towers of every lane are pulled back,
and range stays 160. The findings that matter here come from `runs/balance-pvp-2026-09-30.md`
(8 seed-paired Jev matches):

- First kills came earlier, and swinginess rose (+31.5 per minute).
- **Team fights fell, from 4.6 to 2.75 a match.** On v1, most team fights formed in the overlap of the two mid outer towers. That was the one point both teams had a reason to stand on, and `pvp-1` removed it.
- The study names "a neutral objective that pulls the teams together" as the next step.

eco-1 speaks to that gap without a new map feature. Tower gold is partly split among the bots
present (§3.2) and XP is shared by proximity (§3.4), so a push pays whoever shows up, and the
defenders have to show up too. Proximity assist credit (§3.2) does the same for kills.

Those levers pay for showing up at something that already happens. They do not create a new place
to meet. The **neutral river objective (§9)** is that place, and it pays the same way: a team share
plus a local pool split among the bots present, and XP to the bots present. It is its own layer with
its own constants file (`river-1.json`), because its main reward, the Encore buff, has to work even
if the economy is cut. The swinginess increase is why §6 sets a no-runaway line.

- **The layers are independent.** The map variant moves and re-ranges towers before the first tick. The economy hooks the tick and the pilot. The order is `applyMapVariant` and then attach the economy. A log records both `map` and `economy`.
- **Nothing in eco-1 touches tower range or placement, or bearbot attack range.** Those belong to the balance study.
  - Tower gold doesn't depend on where towers stand.
  - The local share's 300 radius is measured from the tower's actual position, so it follows any variant.
- **The economy is measured on `DEFAULT_MAP`, currently `pvp-1`.** That avoids confounding the two changes. If the balance study changes its map after the economy is tuned, one re-run of §6 condition B1 confirms the economy still passes.
- **Respawn changes the balance study's world.** Its runs are measured where a death is final. Condition R in §6 (respawn only) shows how much of any change is down to respawn rather than gold. Tell the balance study's owner before that run.
- **The metric tool needs two changes:**
  - it must allow more than one death per bot (`aliveSec`, first-blood logic);
  - it must read the real gold ledger when a log has an economy. Its `GOLD` proxy stays for logs without an economy, so before/after can also be compared proxy-to-proxy.

---

## 4. The decision surface for bots

### 4.1 New observation fields

The economy layer adds these fields before the pilot sees the observation. The existing fields are
unchanged.

```jsonc
{
  "self": {
    // …existing fields…
    "gold": 340,                 // unspent, both pools
    "goldAtRisk": 340,           // the part a death can take; equals gold under the default (§3.3)
    "deathLoss": 170,            // what you would lose if you died now
    "deathPayout": 170,          // how much of that loss the killers would get (floor(toKillers × deathLoss))
    "bounty": 470,               // what killing you pays the enemy team: 200 + 100 + floor(toKillers × deathLoss)
    "level": 3, "xp": 230, "xpToNext": 130,
    "items": ["amp"], "slotsFree": 2,
    "nextItem": { "item": "bass-strings", "cost": 350 },   // null when the list is done or slots are full
    "atShop": false
  },
  "allies":         [{ "id": "bb-2", /* … */ "level": 2, "gold": 120, "items": ["road-case"] }],
  "visibleEnemies": [{ "id": "bb-5", "kind": "bearbot", /* … */ "level": 3, "bounty": 410, "items": ["metronome"] }],
  "respawning":     [{ "id": "bb-6", "team": "green", "inSec": 7 }],
  "shop": [{ "item": "amp", "cost": 350 }, { "item": "road-case", "cost": 300 }, { "item": "bass-strings", "cost": 350 }, { "item": "metronome", "cost": 350 }]
}
```

- **Enemy gold:** shown only as `bounty`, which is what you'd get for the kill.
- **`respawning`:** lets a pilot say "push while one of theirs is dead" or "don't fight while one of ours is". Both are team-fight reasoning.
- **Not in eco-1:** enemy XP. It's hidden, and nothing decides on it.

**What Jev sees.** Jev reads prose, not JSON. So `describe_observation`
(`tools/jev/fidelity_harness.py:93-146`) gets one line per field, written so the stakes are explicit:

> You are level 3 (130 XP to level 4). You carry 340 unspent gold; if you die, 170 of it goes to the
> bots that killed you, and killing you is worth 470 to them. Items: Amp (2 of 3 slots free). Next on
> your shopping list: Bass Strings, 350 gold — you cannot afford it yet. You are not at your base.
> Enemy bb-5 (keytar, level 3) is worth 410 gold if killed. Enemy bb-6 respawns in 7 s.

The death sentence is generated from the knobs, so it stays true under any preset ("…170 of it is
lost, and none goes to the killers" under Dota-like; omitted when the loss is 0).

### 4.2 Actions

- **No new action kind is recommended.** The vocabulary stays `move | attack | ability | recall | hold`, and copies of the list in 8+ places stay unchanged.
- The decisions the economy adds are expressed this way:

  | Decision | How a pilot expresses it |
  |---|---|
  | when to go spend | a `recall` rule ("if I can afford my next item and no enemy is in sight, go home") |
  | when carrying is too risky | the conditions of existing rules ("if I'm carrying more than 300 gold, don't start fights") |
  | who to hunt | **one new target selector, `highest_bounty_enemy`** |
  | what to buy | a static shopping list (§4.3) |

- **Rejected alternatives** are in §8 Q3:
  - a `buy` action with an `item` field;
  - a level-up choice.

  Either would add a new `kind`, an argument the translator has to fill and validate (like `ability`, which already needed an instrument-scope guard), and a 2-second decision spent on shopping.

### 4.3 Translator and schema (`tools/jev/`)

**Schema** (`translator.py`):
- `TranslatedSchema` gains `build: tuple[str, ...] | None`. It is an ordered list of ≤ `shop.slots` unique item keys.
- `None` means the instrument's default build is used, and the transparency view says so.

**Prompt** (`_translation_prompt`, 189-249):
- An items block is **generated from `eco-1.json`**: name, cost, gives and gives up, one line each.
- It includes the instruction: "If the prose names items or a shopping order, emit `build` in that order; otherwise omit it."
- The `highest_bounty_enemy` selector and its description are added to `TARGET_SELECTORS`.

**Validation:**
- Unknown or duplicate items are dropped and get a validation note.
- A list longer than the slot count is truncated, with a note.
- Item names are matched case-insensitively against the item's name or key, through a tolerant normaliser like the one `number_normalize.py` uses.

**Conditions need no new vocabulary.** Conditions are free-text yes/no questions answered against
the description (§4.1). "I'm carrying at least 300 gold" or "I can afford my next item" work as soon
as `describe_observation` prints those facts. This is the main reason the economy is cheap to bolt
onto the translator.

**Target selector** (`target_resolve.py`): `highest_bounty_enemy` means the visible enemy bearbot
with the largest `bounty`. If there's none, it falls back to `nearest_enemy`, the same fallback
pattern as the other enemy selectors.

**Wire format** (`compile.py:58-105`):
- Add `"build"` and bump `FORMAT_VERSION` to 2. `schema_from_dict` reads a missing `build` as `None`.
- **Guards now survive the wire format.** While scoping this spec, `schema_to_dict` was found to
  write only `schema.rules`, so a compiled guard tree lost its guards on the way to
  `schema_server.py`. PR #49 fixed that: the serializer walks `schema.root`. `build` is added
  alongside the same tree.

**Who consumes the build.** The economy layer reads the build, and Jev never does.
- `cli.mjs` and the arena queue already load the compiled schema per side, and pass `schema.build` to the economy layer when the match starts.
- The log records the builds, so replay doesn't need the schema.

**Transparency** (`transparency.py`): renders "Shopping list: Amp → Bass Strings → Road Case (from
your prose)" or "(default for violin — your prose names no items)".

**Tests:**
- `test_translator.py`, `test_compile.py`, `test_schema_server.py` and `test_transparency.py` get build cases;
- `scenarios.py` synthetic observations get the new fields.
- `scenarios.py:35` `MAX_HP` (300/170/140) is already out of step with the sim (220/140/150). Fix it while that file is open.

**Unchanged:** `jevSchemaPilot.ts` already posts the raw observation, so the new fields reach Jev with no change.

### 4.4 House bots and the worksheet format

House tiers come in two kinds:
- hand-rendered worksheet cascades: `prompts/pilots/house*.md`, mirrored by `tools/jev/rules.py` and `team_rules.py`;
- authored prose: `house-easy.prose.md`, `house-hard.prose.md`.

**Worksheet keys added:**

```
"gold": self.gold
"next": self.nextItem.cost, or null when nextItem is null
"home": self.atShop
```

**New rules per tier.** These keep the existing order and are inserted after the low-hp recall:

| Tier | Shopping rule | PvP rule | Build |
|---|---|---|---|
| easy | none. It buys only when it happens to be at base (low-hp recall, respawn). | none | default |
| medium | `next` is not null **and** `gold ≥ next` **and** `foe` is null → recall | — | default |
| hard | the medium rule, **plus** `gold ≥ 300` **and** foe is a bearbot with more hp than you → go home | `foe` = highest-bounty visible bearbot, not lowest-hp | per instrument, tuned in §7 P4 |

**Code changes that go with it:**
- `rules.py` and `team_rules.py` gain `gold`, `next` and `home` on `Worksheet`.
- `serializer*.py` states them next to their thresholds, as it does today ("you carry 340 gold; your next item costs 350 — not yet affordable").
- `jevPilot.ts` `extractWorksheet` reads the three new fields.
- Worksheet house files declare their build in a `Build:` header line, read by `tools/arena/house.mjs`.
- Prose house files declare it in prose, which the translator compiles.

### 4.5 How entrant prose expresses it

Each sentence below should compile to the schema shown. These go into the translator's tests and the
entrants README.

| Prose | Compiles to |
|---|---|
| "Buy the Amp first, then Bass Strings, then a Road Case." | `build: [amp, bass-strings, road-case]` |
| "When I can afford my next item and no enemy is in sight, head home to shop." | rule: *can afford next item and no visible enemy bearbot?* → `recall` |
| "Go after whichever enemy is worth the most gold." | rule: *enemy bearbot visible?* → `attack highest_bounty_enemy` |
| "If I'm carrying more than 300 gold, don't start fights — go spend it." | rule: *carrying > 300 gold and enemy bearbot visible?* → `recall` |
| "If one of theirs is dead, push the tower with the wave." | rule: *an enemy is respawning and allied minions nearby?* → `attack nearest_tower` |

"Stay near an ally" is **not** expressible in eco-1: no selector targets an ally. A
`nearest_ally` move selector would be the cheapest addition that rewards grouping directly, but it
is out of scope here (§8 Q12).

### 4.6 Starter template and entrants README (`jamobair-entrants`)

**`entrants/_template/pilot.md`** gets two blanks, placed after the retreat blank:

```
____ (Your shopping list: up to three of Amp, Road Case, Bass Strings, Metronome, in the order you
want them. Leave it blank and you get your instrument's default.)
____ (When to go home and spend. Gold you haven't spent is at risk: if you die, half of it goes to
whoever killed you.)
```

**`README.md` / `entrants/README.md`:**
- **Replace** "There is no respawn: a dead bearbot stays dead for the match" with the respawn rule.
- **Add an "Economy" section** with gold sources, the death drop, levels and the item table. **Generate it from `eco-1.json`** so the numbers can't drift, and mark them "provisional until the numbers freeze" (§7).
- **Extend the observation contract** with §4.1's fields. It currently quotes `src/types.ts`; it will quote the economy layer's extended type instead.
- **Add the new selector** to the "what the compiler understands" list.
- **Give two worked examples** of shopping prose with their compiled output.

**Other surfaces:**
- **`tools/compile_preview.py` and the PR bot** (entrants worktree `ci/jev-compile-preview`): show the shopping list in the preview comment. The `PROMPTLANE_REF` pin must be bumped after the translator change merges.
- **Elysium compile panel** (`tools/arena/compile.mjs`, `pages/`): show the shopping list. `contract.mjs` is unchanged because there is no new action kind.

---

## 5. Who and what must change — the file list

| Area | Files | Phase |
|---|---|---|
| Ruleset layer | new `src/economy.ts`, `src/economy/eco-1.json`, `src/attribution.ts` (extracted from `tools/match/metrics.ts`) | P1 |
| Match plumbing | `tools/match/headless.ts` (`runMatch` **and** `verifyReplay`), `cli.mjs`, `load.mjs`, `src/replay.ts` (log field, checkpoint), `src/live.ts`, `tools/arena/live.mjs`, `tools/arena/queue.mjs` | P1 |
| Viewer | `src/render.ts`: gold, level and items in the HUD; respawn instead of a permanent corpse | P1 |
| Metrics | `tools/match/metrics.ts`: multiple deaths per bot, real ledger, economy metrics (§6) | P1/P3 |
| Translator | `tools/jev/translator.py`, `fidelity_harness.py`, `target_resolve.py`, `compile.py`, `transparency.py`, `scenarios.py`, tests | P2 |
| House | `prompts/pilots/house*.md`, `*.prose.md`, `tools/jev/rules.py`, `team_rules.py`, `serializer*.py`, `tools/match/jevPilot.ts`, `jevTeamPilot.ts`, `tools/arena/house.mjs` | P2 |
| Entrants | `jamobair-entrants`: `README.md`, `entrants/README.md`, `entrants/_template/pilot.md`, `tools/compile_preview.py` | P2 |
| River objective (§9) | new `src/objective.ts`, `src/objective/river-1.json`, `src/ruleset/stats.ts` (the stat derivation shared with the economy); the same match plumbing, viewer and metrics files as above; `target_resolve.py`, `translator.py` (`bandstand` selector), `fidelity_harness.py` (description lines), house tiers, entrants README and template | O1/O2 |
| Evolve | `tools/evolve/generation.mjs` `matchKey` (§7 P4), `fitness.mjs` | P4 |
| Docs | this spec; `docs/design.md` (a ruleset paragraph, as the balance study adds for the map); `docs/arena-runbook.md`; `docs/prose-to-schema-translator.md` (`build`, selectors including `bandstand`) | with each phase |

---

## 6. Measurement — judging the economy on Jev

The tool is the balance study's `tools/match/metrics.mjs`. It works by seed-pairing:
- **`measureLog`** measures one log;
- **`aggregate`** summarises a condition;
- **`paired`** gives bootstrap CIs on the per-seed differences.

**The backend is Jev, never qwen 9B** (standing rule). Use the TypeSafe default with Workers AI
fallback, cadence 2 s and the Jam roster.

The river objective is measured separately, on the map-only game, by §9.8.

### 6.1 Conditions (all on the balance study's shipped map)

*As built (§13.5): "eco-1" below is played as `eco-2`, the tuned ruleset, and R as `respawn-1`.
`tools/match/measure_economy.mjs` runs the whole table.*

| Id | Ruleset | Prompts | Answers |
|---|---|---|---|
| **A** | map only (today's game) | current house tiers | baseline |
| **R** | map + respawn only (no gold) | current house tiers | how much of the change is respawn |
| **B0** | map + eco-1 | **unchanged** prompts (default builds; nobody shops on purpose) | the economy's mechanical effect |
| **B1** | map + eco-1 | **economy-aware** prompts: the §4.4 house tiers and two sample entrant prose files using §4.5 | the decision surface in use |

**Pairings:**
- house-medium vs house-hard;
- house-medium vs a sample entrant.

There are **12 seeds** per pairing per condition, so 4 × 2 × 12 = **96 matches**. Jam-shape matches
have taken 15 s–2.6 min each, so allow ≤ 4–5 h of wall clock. Run them sequentially (the Jev token
renewal history argues against parallel runs), as a background job, one batch per tool call.
Reported spend is checked against the `tools/evolve/budget.mjs` caps.

### 6.2 What is read, and the pre-registered lines

**Existing `matchValues` metrics** (B1 vs A, with the paired 95 % CI):

| Metric | Wanted | Pass line |
|---|---|---|
| `pvpShareOfBotDamage` | ↑ | CI above 0 |
| `engagedPvp`, `teamFightsPerMin` | ↑ | CI above 0 on at least one; neither CI below 0 |
| `firstBloodRate` / `firstBloodSec` | ↑ / earlier | rate not lower |
| `decided` (non-draw share) | ↑ | not lower |
| `deathsUnderEnemyTower`, `deathsToTowers` | not ↑ | CI not above 0 (the economy must not pay for dives) |
| `swinginess`, `leadChanges` | not collapsed | `leadChanges` ≥ 50 % of A's |

**New economy metrics**, added to `metrics.ts`. They are read from the ledger when the log has an economy:

| Metric | Pass line (B1) |
|---|---|
| gold/min per bot, by source (passive, minion, kill, assist, drop, tower-team, tower-local, first blood) | total 85–125/min (§3.2) |
| **PvP share of earned gold** (kill + assist + drop + first blood) ÷ all non-passive | median ≥ 35 % |
| items owned per bot at end | median ≥ 2 |
| first item time | median ≤ 4:30 |
| carried gold at death (median) | between 50 and 300. Near 0 means the risk never bites; huge means nobody shops. |
| shopping recalls (a recall at > 50 % hp that ends in a purchase) | > 0 for medium and hard. B1 only. |
| `absGoldDiffAt6` ÷ total team gold | median ≤ 0.25 (no runaway) |
| comeback rate: the team behind in gold at 5:00 wins | ≥ 20 % of decided matches |

- **R vs A** explains any change in PvP and deaths that comes from respawn alone.
- **B0 vs R** isolates the gold.
- **B1 vs B0** shows whether the decision surface is being used. If B1 ≈ B0, bots aren't using the economy.

**After the run, if any pass line fails:**
1. **One** tuning pass on the constants, without changing the design, then re-run B1 only.
2. If it still fails, rule on a preset (gentler, Dota-like or League-like, §3.3) and re-run B0 and B1 with it.

No third pass before the Jam.

---

## 7. Plan to hit the Jam

Written Wed 09-30. The Jam's dates are unsettled ([the Jam calendar](arena-runbook.md#the-jam-calendar)). The phases below are ordered against
its milestones and carry dates only where the work is already done. Effort is agent working hours. Every phase is a PR into
`develop` that Ceryce merges.

| Phase | Dates | Effort | Contents | Done when |
|---|---|---|---|---|
| **P0 Rulings** | Thu 10-01 | — | Ceryce answers §8. Q1–Q4 and Q10, the ones that block P1, were ruled Wed 09-30 evening. (The balance study's `pvp-1` already shipped as `DEFAULT_MAP`, PR #48.) | Rulings recorded in this spec |
| **P1 Ruleset layer** | Thu 10-01 – Fri 10-02 | 12–16 h | `eco-1.json`, `src/economy.ts`, `src/attribution.ts`, respawn, items and levels, observation wrapper, auto-buy, log and checkpoint fields, wired into all five places that build a match, HUD, metric-tool respawn support. Tests: ledger arithmetic, determinism, replay of old logs unchanged, replay of eco logs verified. | `npm test` green; an eco-1 match replays OK; v1 logs bit-identical |
| **O1 Objective layer** (§9) | Thu 10-01 – Fri 10-02, alongside P1 | 6–8 h | `river-1.json`, `src/objective.ts`, the shared `src/ruleset/stats.ts`, the `bandstand` observation block, log and checkpoint fields, the same five call sites, the stage and Encore in `src/render.ts`, and the §9.8 objective metrics. It is built by a separate agent and does not depend on the economy. Of P1 and O1, whichever merges second rebases onto the first (both touch `headless.ts` and the observation wrapper). Tests: determinism; capture, contest and drain arithmetic; v1 and `pvp-1` logs bit-identical; a river-1 match replays OK. | `npm test` green; a river-1 match replays OK |
| **P2 Decision surface** | from Fri 10-02, up to the gate | 12–16 h | Translator `build` + selector + prompt items block + wire format, `describe_observation`, transparency, house tiers and worksheets, entrants README, template and compile preview, Elysium panel | Compile preview shows a shopping list; house bots shop |
| **O2 Objective surface + measurement** | up to the gate | 4–6 h + about 2 h wall clock | The `bandstand` selector and its fallback, description lines, the house-tier Bandstand rules (§9.7), then the §9.8 run: P vs O, 48 matches on Jev, map-only, plus one tuning pass if needed | The §9.8 verdict is written up before the gate |
| **Gate** | **the go/no-go gate, end of day** | — | **Go/no-go:** if P1 is not merged and P2 not in review, the Jam runs on map-only, and the economy moves to after the Jam. The entrant-facing text is not published. **The objective has its own go/no-go at the same time:** it ships if O1 is merged and §9.8 passes (or Ceryce rules per Q17), whatever the economy's verdict. Without the economy it ships with the Encore only (§9.5). | Ceryce decides |
| **P2b Entrant freeze** | **entrant-facing changes land** (the day after the gate) | 1–2 h | Entrants README, template and preview merged in `jamobair-entrants`; `PROMPTLANE_REF` bumped. Announce to entrants. If the objective is go, this includes the Bandstand README section and template blank. | Live before sign-ups close |
| **P3 Measure + one tune** | after the gate, up to the numbers freeze | 4–6 h wall clock + 3 h analysis | §6 conditions A, R, B0, B1; one tuning pass if needed. If both ship, add B1 + objective against B1 (§9.8, 12 matches per condition). | Pass lines met, or fallback ruled |
| **Numbers freeze** | **the numbers freeze** | — | `eco-1.json` and `river-1.json` final; README tables regenerated. Only bug fixes after this. | — |
| **P4 Re-tune house + campaign** | after the numbers freeze | 6–8 h + background | House tier check re-run on Jev (easy < medium ≤ hard), with the objective on if it shipped; per-tier builds tuned. **Fix `matchKey`** (`tools/evolve/generation.mjs:121-123`) to include the ruleset (map + economy + objective + translator version); it currently hashes only sides, seed, cadence and length, so old cached matches would be reused silently. Campaign 1's results are void under eco-1 or river-1; **campaign 2** relaunches on the shipped ruleset within the epoch caps Ceryce set. | Tier ordering holds; campaign 2 running |
| **P5 Rehearsal + buffer** | the days before the entry cutoff | 4 h | Full Jam dry run on Elysium with entrant-shaped prose; runbook updated | Dry run clean |

**Things that must land before sign-ups close:** respawn and the economy rules in the entrants README, the
shopping-list template blank, the observation fields, the new selector, and a compile preview that
shows the shopping list. If the objective is go, the same deadline applies to the Bandstand rules,
its observation fields, the `bandstand` selector and its template blank. Numbers may still move until
the numbers freeze, and entrants are told they are provisional.

**What to cut first**, in order, if the schedule slips:
1. ~~Tip Jar~~ (ruled out by Q4).
2. **Bandstand gold and XP.** The objective keeps the Encore, which is the part that pulls teams together. The economy loses a source it doesn't need.
3. **Metronome.** It is the only item that needs the cooldown-rescaling hook; three items in three slots means everyone owns everything, so drop to two slots.
4. **The `highest_bounty_enemy` selector.** Bounty stays visible in the description, and "the enemy worth the most" degrades to `lowest_hp_enemy`.
5. **Levels and XP.** Gold and items carry the decision surface; levels are a power curve.
6. **The death drop**, i.e. the League-like preset (`lossOfAtRisk` 0). This is a constants edit, not a code cut.

**The objective as a whole is not on this list.** It is the only part of the spec aimed directly at
the team fights `pvp-1` lost, so it is not traded against economy items to save time. It is cut
only by its own gate: O1 not merged by the gate, or a §9.8 keep-line still regressing after the
one tuning pass.

**Never cut:** respawn (if ruled in), kill gold, the shopping list with default builds, shop-at-base,
the Bandstand's contest rule and Encore (once the objective passes its gate), and the before/after
measurement.

---

## 8. Open for Ceryce

Each question lists the options with the recommendation first. **Q1–Q4 and Q10 blocked P1, and all
five are ruled** (Telegram pickers, 2026-09-30, times America/Chicago; her answers are quoted
verbatim). Q5–Q9 and Q11–Q13 are open, and P1 builds their recommendations as constants. **Q14–Q16
blocked O1 and Q17 the go/no-go gate; all four are ruled** (Telegram pickers, 2026-09-30
20:47–20:48 CT), each option A.

**Q1. Respawn.** **RULED 20:35:** "Respawn, timer grows with level" → **option A.**
- **A (rec, ruled):** respawn at the lane spawn after `6 + 3 × level` s. This is the precondition for any gold risk.
- B: no respawn, and the economy without death mechanics (League-lite only). It keeps the specimen's "a death is final" feel, but kills snowball into 3v2s and the risk decisions disappear.
- C: a fixed 15 s respawn and no levels. Simpler, but late kills mean nothing more than early ones.

**Q2. The gold-at-risk model.** **RULED 20:36, answered in chat:** "Start with half drops to the
killers, but model it the dota way so we can tune it to be like dota or league as we find things
out." → **Dota's two-pool shape with every knob a constant, defaulting to option A** (safe pool
empty, loss 0.5 of the at-risk pool, 100 % to the killers). B and C become presets of the same model,
and D is the "gentler" preset (§3.3). The options as they were put:
- **A (rec, the ruled default):** one pool; half of unspent gold drops **to the killers** on death (your recollection of Dota). It gives the most PvP incentive and three bot decisions from one rule.
- B: Dota-faithful. Earned gold is at risk, but the loss **vanishes**, and passive gold is safe in a second pool. Death costs, but killing a carrier doesn't pay extra. It also needs a second number per bot.
- C: League-lite. Nothing is ever lost, with a flat kill bounty and assists. The simplest option, with no carrying-risk decision.
- D: A with a 25 % drop. Same shape and gentler, if A measures as runaway.

**Q3. How bots buy.** **RULED 20:36:** "Prose shopping list, auto-bought at base" → **option A.**
- **A (rec, ruled):** a shopping list declared in prose and bought automatically at base. The decision during play is when to recall, and there's no new action kind.
- B: an explicit `buy` action with an `item` argument, valid only at base. More expressive ("buy Road Case if their violin is fed"), but it is a new kind in 8+ copies of the vocabulary, a new translator failure mode and a wasted 2 s decision.
- C: A, plus buying anywhere. Removes the spend-vs-hold choice; not recommended.

**Q4. Item set.** **RULED 20:36:** "Amp, Road Case, Bass Strings, Metronome; 3 slots" → **option A.**
No Tip Jar. The names are still placeholders (Q13 is open).
- **A (rec, ruled):** Amp, Road Case, Bass Strings and Metronome, in 3 slots.
- B: those four plus Tip Jar.
- C: three items (cut Metronome) in 2 slots, which is the simplest build.
- D: A with 2 slots. Sharper choices, but full inventories sooner, so late gold is only bounty.

**Q5. Levels.**
- **A (rec):** 5 levels from proximity XP, automatic +8 % hp and damage.
- B: no levels. Gold and items only.
- C: A plus a choice at levels 3 and 5 (hp or damage). More strategy, but a second decision vocabulary for the translator.

**Q6. Passive income.** Under the Q2 ruling the pool is a knob (`pools.safeSources`), so every
option here is a constants edit.
- **A (rec):** 0.5 gold/s into the at-risk pool, like all gold. This is the Q2 default.
- B: none. Every gold is earned, but weak pilots may never buy anything.
- C: 0.5/s into the safe pool (`safeSources: ["passive"]`). This is Dota's reliable gold, and the
  first step of the Dota-like preset. It no longer costs a second pool to build; Q2's model has one.

**Q7. Comeback mechanic.**
- **A (rec):** none in eco-1. Measure swinginess first, since the bounty of a rich bot is already a
  brake under the Q2 default. That brake holds only while `toKillers` > 0: a Dota-like preset makes
  the bounty flat, and would bring this question back.
- B: a League-style objective bounty, where a tower pays the team behind in gold +10 % of the gold gap.

**Q8. Timeout tiebreak.**
- **A (rec):** unchanged. The sim decides by towers, then nexus hp, and the bracket by fewer deaths.
- B: the bracket adds **team gold earned** after deaths. Timeouts are then decided by who played more of the game, much of it PvP.

**Q9. Build visibility.**
- **A (rec):** enemy items are visible in the observation. It's a fair fight, and it lets prose say "if their violin has an Amp, stay grouped".
- B: hidden. Simpler description.

**Q10. Go/no-go date.** **RULED 20:37:** "Sun 10-04, end of day" → **option A**, a go/no-go.
- **A (rec, ruled):** Sun 10-04, end of day, as in §7. *(That date no longer holds: the go/no-go
  gate stands, and its date is in [the Jam calendar](arena-runbook.md#the-jam-calendar).)*
- B: Tue 10-06, which risks publishing entrant rules that then get pulled.
- C: no gate; always ship the economy.

**Q11. Where the ruleset lives after the Jam.**
- **A (rec):** it stays an external layer for the Jam. If it proves out, write it into `prompts/v2.md` afterwards, since the prompt is the source.
- B: write `prompts/v2.md` now and regenerate. That isn't feasible before the Jam, and it would invalidate every measurement.

**Q12. A `nearest_ally` move selector.**
- **A (rec):** not in eco-1. Proximity XP and assists already pay for grouping.
- B: add it in P2 (about 1 h). Prose like "stay near an ally" becomes expressible, and grouping is the clause of your principle it serves most directly.

**Q13. Names.** Amp, Road Case, Bass Strings and Metronome are working names, and so are
Bandstand and Encore (§9). Rename freely. Only the keys in `eco-1.json` and `river-1.json` are
load-bearing, plus the selector name `bandstand`, which entrants' compiled schemas will carry.

**Q14. How the river objective is taken** (§9.4). **RULED 20:47–20:48:** "Hold the stage; any enemy
freezes it" → **option A.**
- **A (rec, ruled):** hold the stage. Any bearbot of one team inside the 60 radius moves a shared bar
  (15 / 10 / 7.5 s for 1 / 2 / 3 bots). Any enemy on the stage freezes it, and an empty stage drains.
  Against opposition, only PvP wins it. The layer reads positions only. **Cost:** about 6–8 h (O1).
- B: a damage race. It is a neutral bearbot-sized unit with hp, and the team that lands the last hit
  takes it. This is familiar from Roshan and Baron. The first team to arrive can finish it before the
  other team gets there, and the damage is PvE. **Cost:** the layer has to intercept `attack` and
  `ability` aimed at a unit the frozen sim can't see, and re-implement range, cooldown and damage
  outside the sim. It also needs a new `kind: "neutral"` in `visibleEnemies` and a new attack
  selector. That adds about 6 h and a new determinism risk.
- C: a channel. One bot stands still on the stage for 8 s, and any damage it takes resets the
  channel. **Cost:** it is cheap to build (about the same as A). But it rewards one bot, not a group,
  and a single keytar poke from range 160 cancels it, so it favours whoever brought the keytar rather
  than whoever brought the team.

**Q15. Where and how often** (§9.2–§9.3). **RULED 20:47–20:48:** "Two river sites taking turns" →
**option A.**
- **A (rec, ruled):** two river sites, (300, 300) and (700, 700), alternating. One is open at a time. The
  first opens at 1:30, the next 75 s after each capture, with 20 s warning and none after 9:00. Every
  lane gets near-side objectives. **Cost:** nothing beyond the layer itself; alternating is a few
  lines.
- B: one fixed site, top-side. It is simplest for prose ("the Bandstand" is always in the same place).
  **Cost:** it is always the drums' and keytars' fight. The violin, which gained the most from
  `pvp-1`, is 849 away every time.
- C: the map centre (500, 500). It is equidistant from all three lanes. **Cost:** it sits in mid's
  132-unit neutral stretch, where the waves already meet, so it adds a reason to stand where mid
  already fights instead of a new shared point. On v1 it would be under both mid towers.
- D: both sites open at once. **Cost:** this splits the teams. It works against team fights, which
  are the thing the objective is for.

**Q16. The reward** (§9.5). **RULED 20:47–20:48:** "Encore buff + gold + XP" → **option A.**
- **A (rec, ruled):** a 45 s team Encore (+15 % attack damage, +10 % move speed, lost on death), plus 40
  gold to every bot on the team, 60 gold split among the capturers, and 40 XP to each capturer when
  the economy is on. It works under every Q2 preset, and as Encore only if the economy is cut.
  **Cost:** one stat derivation shared with the economy (§9.6).
- B: Encore only, in every case. It is simplest, and the objective never interacts with the Q2 gold model.
  **Cost:** the objective doesn't feed the economy, so the spend-vs-hold loop gets no new income
  event to plan around.
- C: gold and XP only. **Cost:** if the economy is cut, the objective pays nothing, so it needs a
  separate fallback. Gold is also slower to turn into a fight than a buff that is live right now.
- D: A, plus a League-style objective bounty that pays the team that is behind. **Cost:** it needs
  the team-lead model that Q7 defers until swinginess is measured.

**Q17. Shipping and the gate.** **RULED 20:47–20:48:** "Own go/no-go on 10-04, with or without the
economy" → **option A.**
- **A (rec, ruled):** the objective has its own go/no-go at the Sun 10-04 gate. It is measured on the
  map-only game before the gate (§9.8), and it ships with or without the economy. If the team-fight
  target misses but nothing regresses, it still ships, as better than nothing. **Cost:** one more
  layer to keep green through the Jam, and about $3 of Jev.
- B: ship it only if the economy ships. **Cost:** if the economy slips, the team-fight loss from
  `pvp-1` goes into the Jam unanswered.
- C: after the Jam. **Cost:** the Jam runs on `pvp-1` as it is, with about 2.75 team fights a match.

**Q18. The Bandstand redesign after the failed §9.8 run** (`river-2`, `recall-2`; §9.10). **RULED
2026-09-30 23:00 CT, corrected 23:02 CT** (Telegram, in chat, not a picker). Her two messages, verbatim:

> "Uncaptured stages close after 30s if no one is on it, 45s if someone is on it. Having more of one
> team than the other will lower the lower number teams control, but it won't raise the control of the
> higher team. Make recall a channeled 4s teleport, interrupted by any damage except in the last 0.5s
> of its channel. Capturing down to 7.5s, 5s, 3s (1, 2, 3 people). We want a team that coordinated
> before the time to be able to take it before any player can make it there to interrupt them. If these
> tweaks don't work we'll look into having them in opposing corners of the jungle with a longer capture
> time and a weaker buff, maybe just gold and exp for your team or something, so they aren't as
> impactful but still work at least getting the one on your side when it's up, and if the enemy team is
> doing well enough or focuses on it or something they can possibly cover both and use that to
> snowball. In the last situation we would also probably make them both trigger at the same time every
> 90s or something."
>
> — Ceryce, 2026-09-30 23:00 CT

> "Then make it linear, 7.5 / 5 / 2.5. Correct on both assumptions"
>
> — Ceryce, 2026-09-30 23:02 CT, correcting the 3 s above and confirming Q18a and Q18b as read below

What is ruled, as built (§9.10):

- **Q18a, close timer (ruled: the reading she confirmed at 23:02).** An open stage nobody has captured
  closes 30 s after opening. If any bot is on the stage at that moment, the window extends, closing at
  45 s after opening at the latest. A closed-uncaptured stage schedules the next one exactly like a
  capture does: the other site, 75 s later, none after 9:00.
- **Q18b, control (ruled: the reading she confirmed at 23:02).** A stage has one owning team's
  control bar, 0 to full. Uncontested, the bots on it raise their team's control at the new rates.
  - With both teams present and equal numbers, nothing moves.
  - Otherwise the team with **more** bots lowers the outnumbered team's control, at the outnumbering
    margin's rate. Its **own** control never rises while any enemy is on the stage.
  - An empty stage still drains (15 s for a full bar).
- **Q18c, capture times (ruled, corrected at 23:02).** Full in **7.5 / 5 / 2.5 s** for 1 / 2 / 3 bots.
  This is linear, not the 3 s of the 23:00 message.
- **Q18d, recall (ruled).** A 4.0 s channel at the bot's position, then a teleport to its own
  fountain, with a full heal on arrival as today. It replaces the 3× run.
  - Damage taken in the first 3.5 s cancels the channel: the bot stays where it is, and the recall
    must be issued again. Damage in the last 0.5 s does not cancel it.
  - Choosing another action also cancels it.
- **Q18e, the design goal (ruled).** A team that coordinated before the opening can take the stage
  before any enemy can get there to interrupt. It is checked in §9.10, with no number adjusted beyond
  hers.
- **Q18f, the fallback (not to be built unless these tweaks fail).** Both stages go in opposing
  corners of the jungle, with a longer capture time and a weaker buff (perhaps gold and XP for the team
  only), both triggering at once every 90 s or so.

---

## 9. Neutral river objective: the Bandstand (`river-1`)

> "I like neutral river objective idea." — Ceryce, 2026-09-30 20:34 CT

**Ruled 2026-09-30 20:47–20:48 CT (Telegram pickers), all option A:** Q14 "Hold the stage; any enemy
freezes it" (§9.4), Q15 "Two river sites taking turns" (§9.2–§9.3), Q16 "Encore buff + gold + XP"
(§9.5), Q17 "Own go/no-go on 10-04, with or without the economy" (§9.9). The design below is the
ruled design.

**Redesigned 2026-09-30 23:00 CT (Q18) after `river-1` failed §9.8.** Ceryce's words, verbatim, are in
§8 Q18. §9.1–§9.9 describe `river-1`, which stays so its logs replay. **§9.10 is `river-2` and
`recall-2`:** what changes, the design check and their measurement.

She was replying to the PvP balance study ([`runs/balance-pvp-2026-09-30.md`](../runs/balance-pvp-2026-09-30.md),
PR #48). Its `pvp-1` map, now `DEFAULT_MAP` in [`src/mapVariant.ts`](../src/mapVariant.ts), pulled
every tower back so each lane has ground no tower covers. On 8 seed-paired Jev matches:

- **What `pvp-1` won:** PvP damage 143 → 180 per minute; PvP damage on neutral ground 21 % → 62 %;
  deaths under the killer team's tower 96 % → 55 %; bot-time under an enemy tower 17.0 % → 10.4 %.
- **What it lost:** team fights per match **4.6 → 2.75**. On v1, 34 of 52 team fights started inside
  both mid outer towers' range, the one spot both teams had a reason to stand on. `pvp-1` removed
  that spot and put nothing in its place.

The Bandstand is that replacement, on neutral ground: a place both teams have a reason to be at the
same time. It is judged by the same test as the rest of this spec. **Its PvE part (the objective)
only pays out if the team wins the PvP around it.**

### 9.1 What it is

- **The Bandstand** is a neutral stage that rises out of the river. A team takes it by **playing a
  set** on it, which means having bearbots on the stage with no enemy bearbot there.
- **Taking it earns an Encore** for the whole team: a short buff, plus gold and XP when the economy
  is on (§9.5).
- **Every bearbot can hear it from anywhere.** That is the in-world reason its state is global in the
  observation (§9.7), even though bearbot vision is only 260 (`src/sim/match.ts:22`).
- **Only one Bandstand is open at a time.** It alternates between two river sites.

### 9.2 Where it sits on `pvp-1`

Both sites are on the river line `x = y`, one between each pair of adjacent lanes:

| Site | Position | Between |
|---|---|---|
| **top-side** | (300, 300) | top and mid |
| **bottom-side** | (700, 700) | mid and bottom |

The capture circle has a **radius of 60**.

The line `x = y` is the map's mirror axis. Reflecting `(x, y) → (y, x)` swaps the two bases and maps
every violet tower onto its green twin. So every distance below is **identical for both teams**, and
both teams have the same instrument in each lane. Distances use the same path maths as
`laneCoverage()` in `src/mapVariant.ts`:

| From the top-side site (bottom-side is its mirror) | Distance | Notes |
|---|---:|---|
| Nearest `pvp-1` towers: violet top outer (100, 420), green top outer (420, 100) | 233 | 73 beyond tower range 160 |
| Mid outer towers, `pvp-1` | 362 | |
| Nearest towers on v1, for reference | 213 | 53 beyond range |
| Top lane (nearest point) / mid lane / bottom lane | 200 / 283 / 600 | |
| Each team's base | 632 | |
| Centre of the top and of the mid lane | 283 | walk 5.1 / 4.7 / 3.8 s (drums / keytar / violin) |
| Centre of the bottom lane | 849 | walk 15.4 / 14.1 / 11.3 s |
| Respawn points (§3.1): top / mid / bottom | 513 / 553 / 604 | |

**What this geometry gives:**

- **No tower covers any part of the circle.** Its nearest edge is 173 from the nearest tower, and
  tower range is tested centre to centre. That holds on v1 too, but the objective is measured only
  on `pvp-1` (§9.8).
- **Nobody can see it from the middle of a lane.** Vision is 260 and the nearest lane centre is 283
  away, so a pilot has to be told about the Bandstand rather than see it (§9.7).

**Why two sites that alternate.** Each site is 283 from two lane centres and 849 from the third.

- With **one fixed site**, it would always be the drums' and keytars' fight, and never the violin's.
  The violin gained the most from `pvp-1` (study §3).
- **Alternating** means openings 1, 3, 5 … are top-side and 2, 4, 6 … are bottom-side. Every lane
  gets near-side objectives, and the far laner can rotate in within about 11–15 s.

**Why not the centre (500, 500).**

- It is *in* the mid lane, inside mid's 132-unit neutral stretch, where the minion waves meet. The
  Bandstand would be one more reason to stand where mid already fights, not a new shared point.
- On v1 the centre is inside both mid outer towers' range (91 away), so it would not survive a map
  change back.

This is Q15-C.

### 9.3 Timing

| Rule | Value | Reasoning |
|---|---|---|
| First opening | **1:30** (90 s), announced 20 s ahead | In the study's baseline, 0 of 52 team fights started before 5:00, and first blood on `pvp-1` averaged 6:00. An early shared point gives the early game a reason to meet. 1:30 is after three waves, so the lanes have formed. |
| After a capture | the next opening comes **75 s later, at the other site**, announced 20 s ahead | 75 s is two and a half waves. That is long enough to use a 45 s Encore and go home to shop, and short enough that 4 or more contests fit into 600 s. |
| If nobody takes it | it stays open until captured (`river-1`; `river-2` closes it after 30–45 s, §9.10) | A stand-off is still a meeting point. |
| Last opening | no opening after **9:00** (540 s) | A reward with no time left to use it is noise. |

If every set is quick, there are at most 7 openings: 1:30, 3:00, 4:30 … 9:00. A realistic match has
4–6.

### 9.4 How it is taken: hold the stage, not a damage race

Capture progress is **one signed bar**, from −1 (green has it) to +1 (violet has it). It is updated
every tick from the positions of alive bearbots within 60 of the site.

| Who is on the stage | What the bar does |
|---|---|
| One team only, with *n* bearbots | It moves toward that team at `rate(n) / 15` per second, where `rate` is 1 / 1.5 / 2 for 1 / 2 / 3 bots. From empty, a capture takes **15 s / 10 s / 7.5 s**. Any progress the other team had is wiped out first. |
| Both teams (**contested**) | It **freezes** (`river-1`; under `river-2` the bigger group lowers the other team's progress, §9.10). |
| Nobody | It drains toward 0. A full bar empties in 15 s. |

When the bar reaches ±1, the reward is paid (§9.5), the stage closes, and the next timer starts.

**Why hold-the-stage rather than a damage race (Q14).**

- **Against opposition, PvP is the only way to take it.** One enemy body on the stage freezes the
  bar. To finish the set, a team has to kill that enemy or drive it off: a team fight, on neutral
  ground.
  - In a damage race (Roshan, Baron), the team that arrives first can finish the objective while the
    other team is still walking. That is PvE that ends before the fight starts.
  - Hitting a neutral is also exactly the kind of damage the principle wants less of.
- **Grouping pays, but slowly enough that the enemy can answer.** Two bots capture in 10 s. An enemy
  needs about 4–5 s to walk from an adjacent lane centre, plus at most one 2 s decision.
- **It needs no new action, only a destination.** "Go to the Bandstand" is a `move` (§9.7).
- **It is cheap outside the frozen sim.** The layer only reads positions.
  - A damage race would need the layer to intercept `attack` and `ability` aimed at an entity the sim
    doesn't know about. The sim's `findUnit` can't see it.
  - So range, cooldown and damage would have to be re-implemented outside the sim.

### 9.5 The reward, and how it ties to the economy

When the bar reaches ±1:

| Part | Value | Who gets it | Without the economy? |
|---|---|---|---|
| **Encore** (buff) | **45 s** of attack damage **+15 %** and move speed **+10 %**. Basic attacks only: ability damage comes from the shared `INSTRUMENTS` table (§1). **Lost on death.** | every alive bearbot on the capturing team | **Yes.** This is the part that always ships. |
| Team gold | **40** | every bot on the team, alive or dead | eco only |
| Local gold | **60**, split equally | the team's bearbots on the stage at the moment of capture | eco only |
| XP | **40** | each bearbot on the stage at the moment of capture (the same as a tower) | eco only |

**Why this shape.**

- **The buff is a fight window, not a siege tool.** A team with Encore has 45 s in which a fight is
  in its favour, so it has a reason to force one.
- **Encore holders are worth killing,** because the buff ends when they die.
- **The move speed helps the team regroup** after the set.
- **Rejected: a bonus to tower damage.** It would turn the objective into a siege, and the fights
  would move back under towers, where `pvp-1` just moved them away from.
- **The gold copies the tower rule (§3.2):** a team share plus a share split among the bots who
  showed up. A capture is worth 40 × 3 + 60 = 180 per team, against 420 for a tower. That is
  enough to matter, but it is not the main income.

**Under the Q2 model.** The Bandstand is just one more gold source with its own ledger keys,
`bandstand-team` and `bandstand-local`. Like every source, it feeds the at-risk pool unless its key
is listed in `eco-1.json`'s `pools.safeSources` (§3.3).

| Q2 preset | What happens to Bandstand gold |
|---|---|
| Default or gentler | At risk like all gold, and part of it drops to the killers by §3.3. |
| Dota-like | It is earned gold, so it is at risk, and the loss vanishes. |
| League-like | It is paid and never lost. |

**If the economy is cut at the go/no-go gate.**

- The gold and XP lines drop out with `eco-1.json`. The Encore stays.
- The Bandstand is then a pure tempo objective, which is still a reason for both teams to meet.
- The objective layer does not depend on the economy (§9.6), so it can ship on its own (Q17).

**Effect on the economy's numbers.**

- With about 3 captures per team, Bandstand gold adds roughly 150–200 per bot per match. §3.2's
  850–1250 becomes about 1000–1450.
- It is objective gold, not PvP gold, so it **dilutes** the PvP share of earned gold.
- §6.2's gold lines are pre-registered for eco-1 alone. With the objective on, they are read with
  Bandstand gold excluded, and Bandstand gold is reported beside them.

**Snowball check.**

- Encore covers 45 s of every ~90 s cycle and ends on death.
- The gold is less than half a tower's.
- The site alternates, so neither team keeps an advantage from a lane that happens to sit near it.
- The capture-split line in §9.8 measures whether one team gets it for free.

### 9.6 Implementation: outside the frozen sim

This is a third ruleset layer, the same shape as `src/mapVariant.ts` and the economy (§3.9).

- **New files:** `src/objective.ts`, and `src/objective/river-1.json` as the single source of truth
  for every number in §9.2–§9.5.
- **Unchanged:** everything in `src/sim/*`, `src/types.ts` and `src/pilots/*`.

```json
{
  "name": "river-1",
  "sites": [{ "id": "top-side", "x": 300, "y": 300 }, { "id": "bottom-side", "x": 700, "y": 700 }],
  "radius": 60,
  "schedule": { "firstOpenSec": 90, "afterCaptureSec": 75, "warnSec": 20, "lastOpenSec": 540 },
  "capture": { "setSec": 15, "rateByCount": [0, 1, 1.5, 2], "drainSec": 15 },
  "encore": { "durationSec": 45, "mods": { "attackDamage": 0.15, "moveSpeed": 0.10 }, "lostOnDeath": true },
  "economy": { "goldTeam": 40, "goldLocalPool": 60, "xpCapturer": 40 }
}
```

| Need | How, from outside | Precedent |
|---|---|---|
| Who is on the stage | Read alive bearbots' `pos` between ticks | `applyMapVariant` and `metrics.ts` read entity positions |
| The Encore buff | Write `attackDamage` and `moveSpeed` between ticks. The sim reads both every tick (`match.ts:240`, `298`). | §3.9 items; `applyMapVariant` writes `attackRange` |
| Avoiding two writers for one stat | **One stat derivation, `src/ruleset/stats.ts`:** `stat = base × (1 + level) × Π(1 + item) × (1 + encore)`. Both layers register a multiplier with it, and it is the only code that writes the fields. Without the economy, level and items are empty. | — |
| Losing Encore on death | When a bot's `alive` turns false, clear its Encore. A respawned bot comes back without it. | §3.9 respawn |
| Observation fields | The same `pilot.decide` wrapper as §4.1 | `RunOptions.decisionPilotFor` |
| Replay | The log records the `river-1` ruleset whole (like `map`). `checkpointOf` adds the bar, the status, the site and each bot's Encore expiry **only when the log has an objective**. No RNG is used. v1 and `pvp-1` logs without the field replay bit-identically. | `MatchLog.map` |
| Viewer | `src/render.ts`: the stage disc on the river, the bar as a ring in the leading team's colour, a countdown while upcoming, and an Encore glow on buffed bots | — |

**Tick order** (as built; §12 says why it differs from the draft's "between steps 3 and 4").

1. The sim tick runs.
2. The objective runs:
   1. clear Encore on dead bots;
   2. count bots on the stage;
   3. move the bar;
   4. on a capture, grant Encore, then gold and XP if the economy is on;
   5. advance the schedule;
   6. expire finished Encores and derive stats.
3. Then the economy's steps 2–8 run (deaths, towers, passive gold, levels, respawn, auto-buy,
   deriving stats), if it is on.

**Where it must be applied.** The same places as §3.9:

- `tools/match/headless.ts`, in **both** `runMatch` and `verifyReplay`;
- `src/live.ts` and the replay view;
- `tools/arena/live.mjs` and the arena queue;
- `tools/match/metrics.ts`.

The order is `applyMapVariant`, then attach the objective, then attach the economy: each layer wraps
the match's `tick`, so the one attached last runs last. The evolution harness's `matchKey` (§7 P4)
includes the objective's name (`shape.objective`).

### 9.7 The decision surface for bots

**New observation fields.** These are added by the same wrapper as §4.1:

```jsonc
{
  "self":   { /* … */ "encoreSec": 0 },              // seconds of Encore left; 0 = none
  "allies": [{ "id": "bb-2", /* … */ "encoreSec": 21 }],
  "visibleEnemies": [{ "id": "bb-5", "kind": "bearbot", /* … */ "encore": true }],
  "bandstand": {
    "site": "top-side",                  // the open or next site
    "pos": { "x": 300, "y": 300 }, "radius": 60,
    "status": "open",                    // "upcoming" | "open" | "closed" (between sets) | "done" (no more this match)
    "opensInSec": null,                  // set while upcoming or closed
    "progress": -0.4,                    // −1..+1 from YOUR team's side: +1 = your team takes it
    "contested": false,                  // both teams on it right now
    "alliesOn": 0                        // your team's bearbots on it
  }
}
```

The Bandstand is audible everywhere, so `progress` and `contested` are global. **How many enemies are
on it is not shown.** A falling `progress` tells you the enemy is there, but their numbers and
positions are visible only within normal vision.

**What Jev sees.** `describe_observation` (`tools/jev/fidelity_harness.py:93`) gets one line per
state, written so the stakes are explicit:

> The Bandstand at the top-side river is open. The enemy team is 40 % of the way to taking it and
> none of your team is on it. Taking it gives your whole team Encore (+15 % attack damage, +10 % move
> speed for 45 s) and 40 gold each.
>
> Your team has Encore for 21 more seconds. Enemy bb-5 has Encore.

In a match without an objective, the description says "There is no Bandstand in this match." That
is what makes the paired measurement in §9.8 clean.

**Actions. No new action kind** (the same reasoning as Q3-A).

- Going to the Bandstand is a `move`. Fighting on it is the existing `attack` and `ability`.
- **One new move selector, `bandstand`,** resolves to `bandstand.pos` while its status is `upcoming`
  or `open`.
- While the stage is `closed` or `done`, the selector falls back to `push_lane`, so a stale "go take
  the Bandstand" rule moves the bot up its lane instead of parking it.
- Move targets are already selectors (`home`, `push_lane`, `nearby_minion` in `TARGET_SELECTORS`,
  `tools/jev/translator.py:61`). This adds one more of the same kind, like `highest_bounty_enemy`
  (§4.2).

**Translator and schema.**

- `TARGET_SELECTORS` gains `"bandstand"`, and `target_resolve.py` gains its branch and fallback.
- **No new schema field.** The selector is a value of the existing `target_selector`, so
  `FORMAT_VERSION` does not change for it.
- **Version coupling.** A schema that uses `bandstand` fails validation on an older server or
  translator. So `PROMPTLANE_REF` in `jamobair-entrants` must be bumped after the merge, the same as
  §4.6.
- **Conditions need no new vocabulary.** "The Bandstand is open", "the enemy is taking it", "we have
  Encore" are yes/no questions about the description.
- **Tests:**
  - `test_target_resolve.py`: the selector, including the `closed` → `push_lane` fallback;
  - `test_translator.py`: the selectors listed in the prompt;
  - `test_fidelity_harness.py`: the description lines;
  - `scenarios.py`: synthetic observations gain the `bandstand` block.
- **Docs:** `transparency.py` renders the new selector as "move to the Bandstand", and
  `docs/prose-to-schema-translator.md` (its selector list, line 168) gains it.

**House bots** (worksheet keys as built, §12: `stand` = status, `standIn`, `standDist`, `standBar` =
progress, `contested`; `encore` was not needed by any tier's rule and is not a key):

| Tier | Bandstand rule, inserted after the low-hp recall |
|---|---|
| easy | none. Easy stays easy. |
| medium | stand open **and** no visible foe **and** hp > 50 % → `move bandstand` |
| hard | the medium rule, **plus:** (stand contested, or `standBar` < 0) **and** hp > 40 % → `move bandstand`; **plus:** stand upcoming within 10 s **and** `standDist` < 400 → `move bandstand`. With Encore, `foe` is the lowest-hp visible bearbot. |

**Entrant prose.** These sentences go into the translator tests and the entrants README:

| Prose | Compiles to |
|---|---|
| "When the Bandstand opens, go take it." | rule: *the Bandstand is open?* → `move bandstand` |
| "If the enemy is taking the Bandstand, go stop them." | rule: *the enemy team is making progress on the Bandstand?* → `move bandstand` |
| "If the Bandstand is contested and a teammate is on it, join the fight." | rule: *the Bandstand is contested and an ally is on it?* → `move bandstand` |
| "While we have Encore, go after their weakest bot." | rule: *your team has Encore and an enemy bearbot is visible?* → `attack lowest_hp_enemy` |
| "Leave the Bandstand alone unless I'm above half health." | rule: *hp below half?* placed before the Bandstand rule → the lane default |

**The starter template** (`entrants/_template/pilot.md`) gets one blank:

```
____ (The Bandstand: when should you go to the river and play the stage, and when should you leave it alone?)
```

The entrants README gets a "River Bandstand" section generated from `river-1.json`, as §4.6 does for
the economy.

### 9.8 Measurement on Jev

**The backend is Jev, never qwen 9B** (standing rule). The setup is the TypeSafe default, cadence 2 s
and the Jam roster, with the balance study's metric tool.

| Id | Ruleset | Prompts |
|---|---|---|
| **P** | `pvp-1`, no objective | objective-aware house medium and hard (§9.7), compiled once |
| **O** | `pvp-1` + `river-1` | **the same compiled schemas** |

**Why the same compiled schemas.** The only difference between P and O is the layer.

- In P, the description says there is no Bandstand, and the selector falls back to `push_lane`. So
  the Bandstand rules should not fire.
- The run logs which rule fired. **Any Bandstand rule firing in P is reported**, as Jev answering a
  question about something that isn't there.

**Run size.**

- **Pairings:** medium vs hard and hard vs hard. These are the balance study's pairings, so its 4.6
  and 2.75 are comparable.
- **Seeds:** 7, 11, 42 and 101 (the study's), plus 8 new ones. That is 12 seeds per pairing,
  **24 pairs and 48 matches**.
- **Spend:** about $3, at the study's $1.44 for 24 matches.
- **Time:** at most about 2 h of wall clock, run sequentially, one batch per tool call.
- **If the economy also ships,** P3 (§7) adds one more condition: B1 + objective against B1, on
  medium vs hard with 12 seeds.

**Pre-registered lines.** All are O − P, seed-paired, with 95 % bootstrap intervals over the 24 pairs.

*The target:*

| Metric | Pass line |
|---|---|
| `teamFightsPerMatch` | O mean **≥ 4.6** (v1's level) **and** the Δ CI lies wholly above 0 |

*Keep `pvp-1`'s gains.* For each metric, O must stay on `pvp-1`'s side of the midpoint between v1 and
`pvp-1`, so it keeps at least half the gain. Its Δ CI must also not lie wholly on the wrong side of 0.

| Metric | v1 → `pvp-1` | O must be |
|---|---|---|
| `pvpDamagePerMin` | 143 → 180 | ≥ 161, and the CI not wholly below 0 |
| `pvpDamageNeutral` | 20.7 % → 62.3 % | ≥ 41.5 %, and the CI not wholly below 0 (the Bandstand is neutral ground, so this should rise) |
| `underEnemyTower` | 17.0 % → 10.4 % | ≤ 13.7 %, and the CI not wholly above 0 |
| `deathsUnderEnemyTower` | 95.8 % → 54.8 % | ≤ 75.3 %, and the CI not wholly above 0 |
| `firstBloodSec` | 443 → 360 | ≤ 402, and the CI not wholly above 0 |

*The objective is in use* (new metrics, §9.6):

| Metric | Pass line |
|---|---|
| Bandstand captures per match | median ≥ 3 |
| Contested share: openings during which both teams were on the stage at some tick | ≥ 50 % |
| Team fights starting within 250 of an open Bandstand | mean ≥ 1 per match. The new fights should be *at* the objective. |
| Capture split: matches where the team with fewer captures still took at least 1 | ≥ 50 %. Otherwise one team gets the buff for free. |

**Reported, not pass lines:**

- `opponentSide`. The stage straddles `x = y`, so this metric moves for purely mechanical reasons.
- `decided`, `towersDestroyed`, `engagedPve`, `swinginess`, and the win rate of the team that took
  more Bandstands.

**Metric tool changes:**

- read the log's `objective`;
- add the four new values above, per match;
- draw the sites on the heatmaps.

These are in `tools/match/metrics.ts` (the `objective` and `bandstandRuleFires` fields, and
`bandstandVerdict` with this section's lines as `BANDSTAND_PREREG`). `npm run metrics -- --group P …
--group O … --prereg bandstand` prints the verdict table.

**After the run:**

1. **Every line passes:** it ships, provided the gate in §7 is met.
2. **The target fails but no keep-line regresses:**
   - Do **one** tuning pass, in this order of preference:
     1. set length 15 → 20 s, so contests last longer;
     2. radius 60 → 80;
     3. Encore +15 → +20 %.
   - Re-run O only, on the same seeds.
   - If the target still fails, Ceryce rules whether it ships anyway (it did no harm) or is cut (Q17).
3. **A keep-line regresses:** one tuning pass; if it still regresses, the objective is **cut**.

There is no third pass before the Jam.

### 9.9 Plan, cut order and decisions

- **Plan:** phases O1 and O2 in §7.
- **Gate:** the objective has its own go/no-go at the §7 gate.
- **Cut order:** in §7.
- **Decisions:** Q14–Q17 in §8, all **ruled option A** on 2026-09-30 20:47–20:48 CT; the redesign,
  Q18, ruled 23:00–23:02 CT (§9.10).

The objective is built and measured on the **map-only** game, so its verdict is known **before** the
go/no-go gate, whatever the economy's state.

### 9.10 The redesign: `river-2` and `recall-2` (Q18)

**Why.** On Jev, `river-1` stalemated: in 12 of 12 hard-vs-hard matches the first stage opened at
1:30 and stayed contested to the end, with 0 captures and 0 deaths
([`runs/bandstand-2026-09-30.md`](../runs/bandstand-2026-09-30.md)). Two things made that possible. A
team could rotate one bot home (the specimen's recall is a 3× run, about 3 s from mid) and back while
the others kept one body on the stage, and any one enemy body froze the bar forever. Ceryce's redesign
(§8 Q18, verbatim there) closes both doors.

**What changes.** Both are opt-in layers outside the frozen sim, each with its own name so it can be
measured on and off:

| | `river-1` | `river-2` (`src/objective/river-2.json`) |
|---|---|---|
| Capture, 1 / 2 / 3 bots | 15 / 10 / 7.5 s | **7.5 / 5 / 2.5 s** (`setSec` 7.5, `rateByCount` [0, 1, 1.5, 3]) |
| Both teams on it | frozen | equal numbers: frozen. **The bigger group lowers the other team's progress** at `rate(margin)` (a margin of 1 lowers it as fast as one bot raises it; a margin of 2, as two do), and never raises its own (`capture.contest: "outnumber"`) |
| Nobody takes it | open until captured | **closes 30 s after opening**; if a bot is on it then, on the first tick it is empty, and **at 45 s at the latest** (`close`) |
| After a close | — | the next opening exactly as after a capture: the other site, +75 s, none after 9:00 |
| Sites, warning, Encore, gold, XP, drain | | unchanged |

| | specimen recall | `recall-2` (`src/recall.ts`, `src/recall/recall-2.json`) |
|---|---|---|
| What it is | a run home at 3× speed, healed on arrival | a **4.0 s channel standing still**, then a **teleport to the fountain**, healed |
| Interrupted by | nothing (another action cancels it) | **damage in the first 3.5 s**, from any source; another action. Not by damage in the last 0.5 s |

**The design check (Q18e).** *A team standing on the stage when it opens must finish before any enemy
can get there.* The table uses straight-line travel (the sim has no walls) to the stage's edge (a bot
counts at centre distance ≤ 60). It starts from every lane midpoint and both fountains, at each
instrument's speed (drums 55, keytar 60, violin 75), and with each movement ability if it is off
cooldown. Encore is left out: it lasts 45 s and no stage opens within 75 s of a capture, so no bot has
it at an opening. Margin = enemy arrival − capture time; **a negative margin means an enemy can
arrive in time to interrupt.** The table is for the top-side site; bottom-side is its mirror (the top
and bottom lanes swap).

| From | Distance to the edge | drums | keytar | keytar glissando (140 dash) | violin | violin solo (×1.6 for 3 s) | Margin walking: 3 / 2 / 1 bots (2.5 / 5 / 7.5 s) | Margin with an ability ready |
|---|---:|---:|---:|---:|---:|---:|---|---|
| top lane midpoint (100, 100) | 223 | 4.05 s | 3.71 s | 1.38 s | 2.97 s | 1.86 s | **+0.47** / −2.03 / −4.53 | −1.12 / −3.62 / −6.12 |
| mid lane midpoint (500, 500) | 223 | 4.05 s | 3.71 s | 1.38 s | 2.97 s | 1.86 s | **+0.47** / −2.03 / −4.53 | −1.12 / −3.62 / −6.12 |
| bottom lane midpoint (900, 900) | 789 | 14.34 s | 13.14 s | 10.81 s | 10.51 s | 8.71 s | +8.01 / +5.51 / +3.01 | +6.21 / +3.71 / +1.21 |
| either fountain | 572 | 10.41 s | 9.54 s | 7.21 s | 7.63 s | 5.83 s | +5.13 / +2.63 / +0.13 | +3.33 / +0.83 / −1.67 |

- **Three bots meet the goal against every walking enemy.** The closest call is a violin from an
  adjacent lane midpoint, by 0.47 s. The drums and keytar need 1.2–1.6 s longer than the set.
- **It fails against two abilities from the adjacent lanes.** The keytar's glissando arrives at
  1.38 s and the violin's solo at 1.86 s, if either is off cooldown and its pilot uses it toward the
  stage at the opening. The far lane and both fountains are safe for three bots even then.
- **Two bots or one bot do not meet the goal** from an adjacent lane midpoint, even against a walking
  enemy: the closest enemy needs 2.97 s, and the sets are 5 and 7.5 s. From the far lane they do. From
  a fountain, two bots do and one bot only just does (+0.13 s walking).
- **In practice an enemy also has to decide to go.** Jam pilots decide every 2 s. Everybody hears the
  20 s warning, so an enemy that pre-positions contests from the first tick. The check is about the
  enemy who did not.
- As ruled, no number was adjusted to make a row pass.

**How it was built, and the choices the ruling left open:**

- *Close timer.* "The window extends, closing at 45 s at the latest" is read this way: from 30 s on,
  the stage closes on the first tick nobody is on it, and at 45 s regardless. A capture on the tick the
  timer runs out counts as a capture. A closed opening records `closedSec`.
- *Control.* `river-2` keeps `river-1`'s one signed bar, so "one owning team's control" is the side
  the bar leans to.
  - "At the outnumbering margin's rate" uses the capture rates: a margin of 1 lowers the bar by 1/7.5
    per second, and a margin of 2 by 1/5. (3 v 0 is not contested.)
  - The bar stops at 0 and never crosses.
  - `river-1`'s "the other team's progress is wiped out first" is kept, since Q18 did not touch it: a
    team alone on the stage zeroes the other side's progress before raising its own.
- *Recall.* The layer swaps a `recall` action for `hold` before the sim ticks, so the 3× run never
  starts. It watches hp across the sim's own tick, and any loss there is damage, from a bearbot, a
  minion or a tower.
  - `hold` does not cancel the channel (the sim's recall also survives `hold`). A `recall` asked again
    continues it. Any other action cancels it.
  - An interrupted bot is set to `hold`. Under the Jam's 2 s cadence the sim still polls every 0.5 s
    and gets the pilot's last action back. So a pilot that still wants to recall issues it again within
    0.5 s, and the channel starts again from 0.
  - The teleport lands on the fountain (`BASE`, where the specimen's recall heals). With the economy
    on, the shop sees the bot there on the same tick.
  - A channel ends on death.
- *Tick order.* `recall-2` attaches right after the map, before the objective and the economy. So it
  wraps the sim's tick directly, and the objective's count already has the teleported bot off the stage.
- *Observation and Jev.* Neither layer adds an observation field.
  - Jev's Bandstand description is unchanged and still true ("nobody can take it until one side
    leaves").
  - Its Encore and gold numbers come from `river-1.json`, which `river-2` shares (a test pins that).
- *House tiers.* Unchanged. Hard's "contest it" rule says: if the stand is contested, or the bar leans
  to the enemy, and hp is over 40 %, go to the Bandstand. That expresses the new mechanics as it is,
  because under `river-2` going there is how the bigger group forms. Their *recall* rules were
  another matter (below): on 2026-10-01 every tier's recall became "an enemy in sight → move home",
  then "no enemy in sight → recall" (`prompts/pilots/README.md`, "Recall: out of reach first").
- *Replay.* A log records `recall` and the `river-2` ruleset whole. Checkpoints gain the open tick
  (`o`, `river-2` only) and every bot's channel start (`r`). Logs without them replay as before: the
  first run's 48 `river-1` logs and the committed v1, `pvp-1` and economy logs all still verify.
- *Off by default.* `--objective river-2` and `--recall recall-2` turn them on. So do the arena's
  `tournament.objective` and `tournament.recall`, and an evolve campaign's `shape.objective` and
  `shape.recall`. `DEFAULT_RECALL` is the specimen's recall until Ceryce rules otherwise.
- *Economy P2* (§13). P2's house tiers were written against the specimen's 3× recall.
  - When `recall-2` is ruled in, P2 picks it up with `measure_economy.mjs --recall recall-2` (under a
    new `--date`), or `--recall` / `shape.recall` / `tournament.recall` elsewhere. Without the flag,
    the plan is unchanged.
  - The metric tool's shopping-recall count (§13.2) reads a `recall-2` channel as the recall, so it
    works under either rule.
  - Its tiers' recall rules needed rewriting, not just re-measuring. A recall now costs 4 s standing
    where the bot is, and a hit cancels it. So "recall below X hp" in a lane or a fight gets
    interrupted by the minions and kills the bot (the measurement below shows exactly that).
  - The channel rewards walking out of reach first (`move home`), then recalling. The eco tiers'
    low-hp and shopping recalls now do that (2026-10-01, with the plain tiers').

**Measurement.** [`runs/bandstand-2-2026-09-30.md`](../runs/bandstand-2-2026-09-30.md): 12 seed pairs
on Jev, §9.8's lines unchanged, $1.39.

- **As briefed (`recall-2` on in both arms): FAIL, 7 of 10 lines.** That comes from `recall-2`
  meeting today's house tiers, not from the objective. Their low-hp recall fires mid-lane, the
  minions interrupt every channel, and 31 of 65 deaths come before the first stage opens. That leaves
  0 team fights in either arm.
- **`river-2` alone (the specimen recall), against the first run's P on the same seeds: 8 of 10
  pass.** Hard vs hard no longer freezes (0 → 1.83 captures a match), and captures are back to a
  median of 3.5 a match. The misses are team fights (3.92 against 4.6; the Δ CI is wholly above 0) and
  the contested share (49.2 % against 50 %).
- **A new one-sidedness.** In hard vs hard, violet took all 11 captures, each uncontested. §13.3's
  finding is the likely cause, though it is not traced here: on `pvp-1` the frozen sim gives violet's
  minions an edge.
- **What it needs before `recall-2` can be judged:** house tiers that walk out of reach before they
  recall.

**Re-measurement with those tiers, on the fixed map.**
[`runs/bandstand-3-2026-10-01.md`](../runs/bandstand-3-2026-10-01.md): `simultaneous-1`, sides
balanced, 8 seed pairs, §9.8's lines unchanged, $2.28.

- **The tiers now walk out of sight before they recall.** No `recall-2` channel was broken by
  damage; most got home.
- **As briefed (P2 vs O2): FAIL, 5 of 10.** Captures (median 4.0) and the split now pass, and team
  fights rise 0 → 1.88 (CI above 0). The misses:
  - team fights (1.88 against 4.6);
  - PvP damage (96.5 against 161);
  - the contested share (45.2 %);
  - fights at the stage (0.88);
  - first blood, which comes later with the objective.
  - Every remaining death is a hard bot whose 90-hp trigger fires too late to leave on foot.
- **`river-2` with the specimen recall, on the fixed map: 6 of 10.** That is down from 8. Deaths
  under the killer's tower (79.2 %, from 11 deaths) and the capture split (37.5 %) now miss.
- **Violet still takes most captures** (42–16 across both objective arms). Yet a scripted mirror
  match with `river-2` and `recall-2` stays exact, so the cause is not the sim or the layers.

**Hard leaves earlier, and a Bandstand mirror probe.**
[`runs/bandstand-4-2026-10-01.md`](../runs/bandstand-4-2026-10-01.md): the same 8 slots, §9.8's lines
unchanged, $2.04.

- **Hard's low-hp trigger is now 65 % of max hp** (drums 143, keytar 91, violin 97.5), derived from
  Bandstand 3's walks home. Deaths before 1:30 fell from 15 to 0, and no channel was broken.
- **As briefed (P2 vs O2): FAIL, 7 of 10.** PvP damage, first blood and the capture split now
  pass. The target (team fights 3.25 against 4.6), the contested share (48.8 %) and fights at the
  stage (0.63) miss, and no keep-line regresses. So §9.8's single tuning pass is next.
- **Jev reads the Bandstand the same for both sides** (400 mirrored states, ids swapped too).
- **The pilot path does not.** The nearest-allied-minion target (`tools/jev/target_resolve.py`)
  breaks a three-lane tie at the fountain on float noise. Green bots are sent up the top lane (135 of
  136), and violet's mostly down mid. Capture splits and side reads wait on that fix.
  *(Fixed 2026-10-01 as the targeting rule `own-lane-1`: from its own fountain, "the nearest
  allied minion" is the start of the bot's own lane, and near-ties break side-symmetrically.
  `tools/match/test_targeting.mjs` drives it from both fountains of a real mirror match.)*

**The lane fix, and §9.8's one tuning pass.**
[`runs/bandstand-5-2026-10-01.md`](../runs/bandstand-5-2026-10-01.md): the same 8 slots, both arms
on `own-lane-1`, $1.24.

- **The pass took §9.8's first knob, a longer set:** `river-2-set10`, one bot fills it in 10 s
  instead of 7.5 (×4/3, as 15 → 20 s), nothing else changed. P2 was played again too, because the
  lane fix moves both arms.
- **The violet lean is gone at this sample size:** captures 12–8, hard vs hard 2–1, first openings
  2–2 (4 untaken).
- **As pre-registered: FAIL, 6 of 10.** All four "in use" lines pass (contested 86.8 %, fights at
  the stage 2.0 a match). The target misses (2.75 against 4.6, Δ CI wholly above 0). Three
  keep-lines miss on their Δ-CI clause only, every level staying on `pvp-1`'s side.
- **Against Bandstand 4's P2 (§9.8's "re-run O only"): 9 of 10**, only the target missing.
- **Why the readings differ:** with every bot in its own lane, the no-objective game became lane
  duels (0 team fights, first blood at 136 s). And §9.8's levels were set on `first-min` play.
- **Hard vs hard is a mirror now.** P2's four hard-vs-hard matches are byte-identical, and in O2
  equal numbers freeze the stage (15 of 16 openings closed untaken).
- **Ceryce rules at the gate:** under Q17 (ship or cut), or by the letter (a keep-line still
  regresses, so cut).

---

## 10. Sources

All were read through each wiki's MediaWiki API (`action=parse`) on **2026-09-30**. Revision IDs are
given so a later reader can see exactly what was cited.

**Dota 2 wiki (dota2.fandom.com)**
- *Gold*, rev 2234694 — <https://dota2.fandom.com/wiki/Gold>. Covers: the reliable/unreliable definitions and spend order; the death section; periodic gold; the hero kill, streak and assist formulas; building and creep bounties; recent changes (7.31, 7.32, 7.33).
- *Gold/Changelogs*, rev 2239846 — <https://dota2.fandom.com/wiki/Gold/Changelogs>. Covers the 6.68 reliable-gold introduction and the 7.26b reliable-gold change.
- *Death*, rev 2239490 — <https://dota2.fandom.com/wiki/Death>. Covers `GoldLoss = NetWorth/40` from unreliable gold and the buyback cost and rules.
- *Heroes/Mechanics#Buyback* (the redirect target of *Buyback*), rev 2237098 — <https://dota2.fandom.com/wiki/Buyback>
- *Version 6.68*, rev 2078978 — release date DotA 2010-07-26: "Added reliable vs unreliable gold mechanic."
- *Version 7.26b*, rev 1971103 — release date 2020-04-28: "Reliable gold is now given only for passive income."
- Version pages 7.31 (2022-02-23) and 7.33 (2023-04-20), for the dates of the kill-bounty and assist-formula changes.

**League of Legends wiki (wiki.leagueoflegends.com)**
- *Champion gold bounties*, rev 4040646 — <https://wiki.leagueoflegends.com/en-us/Champion_gold_bounties>. Covers: base bounty, first blood, assist bounty, accrual and depreciation, shutdown and extended bounties, suppression; patch history V14.21–V26.03.
- *Gold*, rev 4039269 — <https://wiki.leagueoflegends.com/en-us/Gold>. Covers starting and passive gold, turret global/local gold and plating, and selling.
- *Kill*, rev 4053216 — <https://wiki.leagueoflegends.com/en-us/Kill>. Covers kill credit (15 s on Summoner's Rift) and execution.
- *V25.09* patch page, rev 4057851, released 2025-04-30 — objective bounty formula ("10% of the team gold deficit, capped at 1000 per objective").
- *V14.21* (released 2024-10-23; the kill-bounty rework that removed streak tiers) and *V26.03* (released 2026-02-04; current accrual and depreciation rates).
- The wiki has **no** standalone "Objective bounties" article (the link is a redlink, checked 2026-09-30). The objective-bounty rule above comes from patch-note pages.

**Repo**
- `src/sim/match.ts`, `src/sim/entities.ts`, `src/sim/map.ts` and `src/types.ts` at `850c7c7`.
- PR #48 (balance study, merged 2026-09-30): `src/mapVariant.ts`, `tools/match/metrics.ts` and
  `runs/balance-pvp-2026-09-30.md`.

---

## 11. P1 as built

PR "feat(economy): P1 ruleset layer" (2026-09-30), on `develop` after #47 and #50. What the spec
above did not decide, and what the build decided, so a later tuning pass knows what is a rule and
what is a default:

- **Where things live.** `src/economy.ts` (the layer), `src/economy/eco-1.json` (every number),
  `src/attribution.ts` (damage attribution, extracted from `tools/match/metrics.ts` and shared),
  `tools/jev/economy_rules.py` (the translator's reader of the same JSON). Tests:
  `tools/match/test_economy.mjs` (one per rule, plus replay determinism) and
  `tools/jev/test_economy_rules.py`.
- **Off by default.** `DEFAULT_ECONOMY` is none until the go/no-go gate (Q10). Opt in with
  `npm run match -- --economy eco-1`, the arena's `tournament.economy`, or an evolve campaign's
  `shape.economy`.
- **Open questions built at the recommendation, as constants:** Q5 (five levels, +8 % hp and attack
  damage, no choice), Q6 (0.5 gold/s into the at-risk pool), Q7 (no comeback mechanic), Q9 (enemy
  items visible). Q8 (tiebreak) is untouched: the sim's tiebreak is frozen and the bracket's is the
  arena's.
- **Choices the spec left open:**
  - *Amp and levels scale basic attacks only.* Ability damage comes from the sim's shared
    `INSTRUMENTS` table, so scaling it needs a wrapper (§3.9); P1 leaves abilities at base.
  - *Respawn resets ability cooldowns to ready* and clears buffs, targets and recall; the bot comes
    back holding and is asked again on its next tick.
  - *Passive gold is paid to dead bots too*, in whole coins (one coin every 2 s at 0.5/s), so there
    is no fractional gold anywhere.
  - *Several deaths in one tick resolve in roster order*, each against the victim's gold at that
    moment; a bot killed in the same tick it was paid a drop can lose part of that drop.
  - *XP goes to every credited bot, dead or alive.* Kill XP goes to the killer and assisters even if
    one of them died in the same exchange; tower and minion XP go to living bots in range.
  - *Remainders.* The drop's remainder goes to the killer (§3.3). The assist pool's and the tower
    local pool's go to the first recipient in roster order.
  - *An item already owned is passed over*, never bought twice, even if it appears on the list.
  - *Stats are re-derived every tick* from instrument base × level × items; a bot with no levels
    and no items gets its exact base values back, so the layer never drifts a stat.
- **Observation.** §4.1 as written, plus `deathPayout`. `describe_observation` turns the fields into
  sentences for Jev, and an observation without them reads exactly as before.
- **Translator.** `build` on the schema (validated, wire format v2), an items block in the prompt
  generated from `eco-1.json`, and a "Shopping list:" line in the transparency view. The
  `highest_bounty_enemy` selector, the house worksheet keys and tiers, and the entrant README and
  template are P2. The first three are built (§13.2); the entrant-facing part waits for the gate.
- **Metrics.** A log with an economy is measured with the economy attached: bots can die more than
  once, gold is the real ledger, and `economy` carries the §6.2 numbers (gold per minute by source,
  PvP share of earned gold, items, first item time, carried gold at death, gold-diff share at 6:00,
  comeback). Shopping recalls are not measured yet.
- **Evolve.** A campaign's `shape` now names `map` and `economy`, every match plays them explicitly,
  and `matchKey` hashes them with the sim version (§7 P4). A campaign created before this keeps its
  old keys, so its cache stays valid.
- **Jev smoke** (3 full matches, $0.236): [`runs/economy-p1-smoke-2026-09-30.md`](../runs/economy-p1-smoke-2026-09-30.md).
  Earn, buy, die, drop to the killers and respawn all happen on Jev, and every log replay-verifies.
  With prompts that ignore the economy, deaths were rare (0, 1 and 7) and income in the two quiet
  matches was well under the §3.2 band.
- **Pre-gate slice, A vs B0** (24 seed-paired matches, medium vs hard, $1.66):
  [`runs/economy-slice-2026-09-30.md`](../runs/economy-slice-2026-09-30.md). eco-1 raises the
  PvP share of bot damage and engaged-PvP time a little and doesn't add dives. With today's prompts,
  income is 59 gold/min/bot against the 85–125 band, short in every earned source. Deaths are too
  rare to judge the death economy. The tuning pass that answers it is §13.1, and the slice's
  all-timeout, all-violet result is explained in §13.3.

## 12. The Bandstand as built

PR "feat(objective): the Bandstand" (2026-09-30), on `develop` after #51 (economy P1). What §9 did not
decide, and what the build decided:

- **Where things live.** `src/objective.ts` (the layer), `src/objective/river-1.json` (every
  number), and two hooks shared with the economy in `src/ruleset/`: `stats.ts` (the one stat
  derivation; each layer registers a multiplier) and `rewards.ts` (the reward sink). Tests:
  `tools/match/test_objective.mjs` (one per rule, replay determinism, old logs). The Jev side is in
  `tools/jev/` (`bandstand` selector, description lines), the house rules in `prompts/pilots/`.
- **Off by default.** `DEFAULT_OBJECTIVE` is none until the go/no-go gate (Q17). Opt in with
  `npm run match -- --objective river-1`, the arena's `tournament.objective`, or an evolve campaign's
  `shape.objective`.
- **How the objective and the economy connect.** Neither imports the other.
  - *Stats.* Both register a multiplier with `src/ruleset/stats.ts` (`setStatMultiplier`: the
    objective as `encore`, the economy as `economy`) and both write stats only through its
    `deriveStats`, which computes `base × Π multipliers`. Whichever layer derives last, the value is
    the same, so an Encore on a level-3 bot with an Amp is `base × level × Amp × Encore`. A bot with
    no modifiers keeps its base values bit-for-bit, so pre-objective economy logs still verify.
  - *Gold and XP.* The objective pays only through a `RewardSink` on the match
    (`src/ruleset/rewards.ts`). `attachEconomy` registers its own (`Economy.rewards`), so: objective
    alone → the Encore only; both → `bandstand-team` (40 to every bot of the team, alive or dead),
    `bandstand-local` (60 split among the capturers, remainder to the first in roster order) and 40
    XP per capturer, into the pools by the economy's own `pools.safeSources` rule.
  - *Ledger.* `GOLD_SOURCES` gains `bandstand-team` and `bandstand-local`. The metric tool's §6.2
    gold lines read `ECO_1_GOLD_SOURCES` (everything else), as §9.5 pre-registered, and report
    Bandstand gold beside them (`bandstandGoldPerMinPerBot`).
  - *Tick order.* The objective attaches before the economy, so its update runs right after the
    sim, then the economy's steps run. The draft put it between the economy's steps 3 and 4; it does
    not read anything steps 2–3 write, and this way the economy's level-ups, respawns and shop see
    Bandstand gold and XP on the same tick. The one visible difference: team gold paid to a bot that
    dies on the capture tick is in its at-risk pool when that death resolves.
- **Choices §9 left open:**
  - *"Any progress the other team had is wiped out first"* is read as: the bar snaps to 0 the first
    tick one team has the stage alone while the bar leans the other way, then moves toward it.
  - *On the stage* is centre within 60 of the site, inclusive. Dead bots never count.
  - *Encore* goes to every living bot of the capturing team; a second capture refreshes it to a new
    45 s rather than stacking.
  - *The schedule* runs in ticks: an opening due at exactly `lastOpenSec` opens; one due later never
    does (`done`). A `done` stage shows the last site.
  - *`alliesOn` counts you*; `selfOn` says whether you are on it. `opensInSec` is whole seconds,
    rounded up.
  - *The description* ends with the Bandstand lines, and an observation without the objective ends
    with "There is no Bandstand in this match." This sentence is new in every Jev description.
- **House tiers.** Medium's worksheet gains `stand` and the one §9.7 rule; hard's gains `stand`,
  `standIn`, `standDist`, `standBar` and `contested` and its three rules, all right after the low-hp
  recall. The checked-in compiled schemas (`prompts/pilots/house-{medium,hard}.schemas.json`) gained
  the same rules spliced in after each instrument's recall, with every other rule byte-identical, so
  the §9.8 run measures exactly one change. `house-hard.prose.md` gained the matching sentences.
  The Jev house bot's code mirror (`tools/jev/rules.py`) asks the medium rule only when the
  observation has a Bandstand.
- **Not built here:** the entrants README section and template blank (`jamobair-entrants`, §9.7)
  are a separate PR in that repo, to merge only if the objective is go at the gate, followed by the
  `PROMPTLANE_REF` bump. `team_rules.py` and `team-qwen.md` are not house tiers and are unchanged.
- **Measurement (§9.8):** [`runs/bandstand-2026-09-30.md`](../runs/bandstand-2026-09-30.md). **FAIL by
  the pre-registered lines.** The target passed (team fights 2.46 → 6.29 a match, Δ CI [+1.21, +6.50]);
  deaths-under-tower and first blood failed on 8 deaths, and captures (median 0.5) and the split
  (20.8 %) failed because hard-vs-hard turned every match into one stage contested to the end.
  The tuning pass is not run (it would pass the $5 ceiling, and §9.8's levers don't address a
  stalemate); Ceryce rules at the gate. Spend $3.96.
- **The redesign** (`river-2`, `recall-2`; Q18) is built and measured in §9.10.

---

## 13. Income tuning pass and P2 as built

PR "economy P2 + the income tuning pass" (2026-09-30), on `develop` after #51 and #52. It is built so
§6's measurement can run before the go/no-go gate. Nothing entrant-facing changed: not the entrants
repo, the template or the README. `DEFAULT_ECONOMY` is still none.

### 13.1 The income tuning pass: `eco-2`

**Why.** The slice measured eco-1 at **59 gold/min/bot** (0 of 12 matches in the 85–125 band). It
was short in every earned source: minion 10.5, towers 10.9, PvP 9.0 a minute. The prices were not
the problem. The slice's own ledgers show the bots did far less than §3.2 assumed:

| per match, 12 eco-1 slice matches | median (range) | what §3.2's estimate assumed |
|---|---|---|
| minion last hits, all six bots | 43 (34–50) | 60–120 (10–20 per bot) |
| towers destroyed | 2 (mean 1.58; 1–2) | about 3–5 |
| bearbot deaths | 1 (mean 1.17; 0–3) | about 5–8 |

So constants alone can't reach §3.2's mix. They can still bring a plausible match into the band,
and that is what this pass does. The design and the band are unchanged (§6.2 allows one constants
pass).

**Method.** Each slice match was replayed with its own ruleset, and every bot's ledger was read by
source at 5:00, 6:00 and 10:00. A source's gold is (events × price), so a new price rescales that
source exactly *for those events*. The death drop is half of carried gold, so it was scaled with the
bot's other income. This holds behaviour fixed and asks what these 12 matches would have paid. It
can't see the feedback, where richer bots buy earlier and then fight differently. The Jev smoke
(§13.4) checks that.

**Candidates.** All keep the design, the items and the death knobs.

| | passive /s | last hit | kill / assist pool / first blood | tower team / local pool | median gold/min/bot (range) | in band | PvP share of earned | \|gold diff\| ÷ gold @6:00, median (max) |
|---|---|---|---|---|---|---|---|---|
| eco-1 | 0.5 | 15 | 200 / 100 / 100 | 100 / 120 | 59.2 (45.5–76.8) | 0 / 12 | 28.3 % | 0.245 (0.510) |
| everything ×1.5 | 0.75 | 25 | 300 / 150 / 150 | 150 / 180 | 90.6 (69.7–117.3) | 7 / 12 | 27.0 % | 0.241 (0.502) |
| earned-heavy | 0.6 | 30 | 300 / 150 / 150 | 175 / 200 | 86.6 (65.1–115.3) | 6 / 12 | 23.8 % | 0.294 (0.526) |
| PvE-heavy | 0.75 | 30 | 325 / 175 / 150 | 150 / 180 | 95.5 (72.5–124.1) | 9 / 12 | 26.2 % | 0.235 (0.501) |
| **eco-2 (chosen)** | **0.75** | **25** | **400 / 200 / 150** | **125 / 150** | **90.8 (67.9–121.6)** | **8 / 12** | **32.5 %** | **0.210 (0.536)** |

eco-2 by source, per bot per minute: passive 45.0, minion 17.6, kill 7.8, assist 3.9, drop 3.2,
first blood 1.7, tower team 9.9, tower local 3.8.

**Why these numbers.**
- **Passive 0.5 → 0.75/s.** It is the only lever that lifts every bot equally. It is also the only
  one that *narrows* the gold gap, because both teams are paid it. It stays about half of income, as
  under eco-1 (51 % → 50 %). It goes no higher because passive is a floor (§3.2), and "most income
  is earned" has to come true as play improves.
- **PvP doubled: kill 400, assist pool 200, first blood 150.** PvP had the widest gap to §3.2, and it
  is what Ceryce's principle asks the economy to pay for. Doubling it moves the PvP share from 28 %
  toward §6.2's 35 %. It also brings the bounty (kill + assist pool + half the carried gold) to
  600 or more. That is worth more than an item, which makes hunting the carrier a real decision.
  Raising PvP did not widen the 6:00 gold gap on these matches; it fell.
- **Last hit 15 → 25.** This is the steady earned income. A kill stays worth about 16 last hits
  (eco-1: 13).
- **Towers +25 % only (125 + 150).** A tower pays one team, so it widens the gap. It is also PvE,
  which is not what the economy is for. The earned-heavy and PvE-heavy rows show what leaning on
  towers does: more income, a lower PvP share, a wider gap.

**After, on Jev** (§13.4, B1 shape, 4 matches): median **99.6** gold/min/bot (83.1–113.0), 3 of 4 in
band. Deaths rose to 3 a match, so PvP carried more than the replay predicted (57 % of earned
gold). Last hits paid about what they did under eco-1, because bots that walk home to shop spend
less time in lane.

**Names.** `src/economy/eco-2.json` is eco-1 with only the gold block's seven prices changed. A
test pins that. `eco-1` stays registered, so `--economy eco-1` still reproduces the slice. Old logs
carry their whole ruleset and replay unchanged. The translator's items reader points at `eco-2.json`.
Items are identical in both, so its prompt is right for either. The same holds for `eco-3` (§13.6).

**The likely next knob.** If §6 confirms the smoke's first-item time (5:08 against ≤ 4:30), the
pass §6.2 allows has `gold.start`, which is 0 today. Something like 100 moves the first item about a
minute earlier. It also adds 10 gold/min/bot to income, because start gold is paid as passive. §6
confirmed the late first item, and §13.6 pairs this knob with a smaller kill bounty.

### 13.2 P2 as built

- **`highest_bounty_enemy`** (§4.2–§4.3) is in the translator's vocabulary and
  `tools/jev/target_resolve.py`. It targets the visible enemy bearbot with the largest `bounty`. Ties
  go to the nearer one. With no bounty-bearing bearbot in sight it falls back to `nearest_enemy`,
  which covers both "no bearbot visible" and "no economy". There is no new action kind.
- **Economy-aware house tiers** (§4.4). They are picked automatically whenever a match has an
  economy (`tools/arena/house.mjs` `HOUSE_TIERS_ECO`; the CLI's `house:<tier>`; the arena's
  `tournament.economy`). With no economy nothing changes, so the placement bar doesn't move. The
  table and the files are in `prompts/pilots/README.md`.
  - easy declares Road Case → Metronome → Amp, and never goes home only to shop.
  - medium keeps its worksheet. It adds keys `gold`, `next` and `home`, and the rule "next item
    affordable and no foe in sight → recall to shop" right after the low-hp recall and the
    Bandstand rule.
  - hard has the same rule. It adds "carrying ≥ 300 with a stronger enemy bearbot in sight → recall
    to spend it", and it attacks the enemy worth the most gold instead of the lowest-hp one.
  - Since 2026-10-01 every recall in these tiers first leaves reach for `recall-2` (§9.10): the
    low-hp and shopping recalls each became "an enemy in sight → move home", then "no enemy in
    sight → recall", and hard's 300-gold rule walks home instead. The pilots README has the rules.
  - Every tier declares its shopping list in prose, and it compiles to `build`.
- **Compiled on the entrants' translator** (`compile.py --backend ollama`, qwen3.5:9b) into
  `house-<tier>-eco.schemas.json`, which is what Jev plays. Medium was sampled four times, and the
  sample whose questions all name things Jev's description states was kept. The selection rule is in
  the pilots README.
- **The Bandstand's house rules (§12) are carried over unchanged.** The eco tiers were compiled
  before #53 merged. Its rules were then added the way #53 added them to the plain tiers: the
  identical rule objects spliced in after each instrument's low-hp recall, plus the matching
  worksheet key and prose. So B1's tiers differ from B0's only by the economy. Without the
  objective those rules can't match.
- **Not built: the worksheet keys in the shadow Jev worksheet bot.** `tools/jev/rules.py`,
  `team_rules.py`, `serializer*.py`, `house_server.py` and `jevPilot.ts`'s `extractWorksheet` still
  mirror the plain medium cascade. That bot is shadow-only. The Jam and §6 play compiled schemas on
  `schema_server.py`, which get the economy through `describe_observation` (P1) and need no worksheet
  code. It is listed for whoever makes the worksheet bot live.
- **`respawn-1`**, condition R. It has respawn and nothing else: every gold and XP source is 0, and
  `observe: false` keeps the gold, level and shop fields out of the observation. Pilots see only who
  is respawning.
- **Metrics.** Shopping recalls (§6.2) are counted per side. A shopping recall is a recall started
  above half hp that buys on the way in. Under `recall-2` the channel is the recall (§9.10). The §6.2 economy lines are now rows of `npm run metrics`'
  table (means; the spec's medians are in `--json`). Caveat: a tier whose low-hp recall fires above
  half hp is counted when that recall happens to buy. Medium's 75 %-of-max retreat does, which is
  why the slice already shows medium at 2.0 a match.
- **The sample entrants** for §6's second pairing are `prompts/pilots/sample-entrant.prose.md`
  (economy-blind) and `sample-entrant-eco.prose.md` (the same plus §4.5's sentences), both compiled.
  §6.1 asks for "two sample entrant prose files" in B1; this build reads that as one entrant in two
  versions, so that B1 − B0 is the same entrant learning the economy.
- **A finding for the entrant README (P2b).** §4.5's own example, "Buy the Amp first, then Bass
  Strings, then a Road Case", compiled into `build` *and* into three rules of the form "can it
  afford the Road Case? → go home". For two of three instruments those rules sat above the low-hp
  recall (`runs/sample-entrant-eco-compile-buy-phrasing-2026-09-30.md`). Such a rule keeps firing
  after the item is owned. "Our shopping lists, in order: …" compiled to `build` only, every time it
  was tried (the house tiers and the eco sample entrant). The README's worked example should use the
  list form, or the translator needs a guard; this PR does neither.

### 13.3 Why every slice match timed out, and why violet won every tiebreak

The slice had 24 timeouts in 24 matches, and all 10 decided matches went to violet (house medium).
Briefly investigated, without touching the win condition:

**Timeouts are the house prompts, against the frozen sim's structure hp. The economy plays no part.**
- In all 24 slice matches each team destroyed at most one tower, and no bearbot ever damaged a
  nexus. Bots dealt about 180 structure damage a minute, both teams together.
- To end a match, a team has to deal about 4,000 down one lane: two 900-hp towers and a 2,200-hp
  nexus. Each team dealt about 900 a match, roughly 4.5× short.
- Minion waves alone take nothing. In 600 s with every bearbot holding at base, no tower fell on
  `pvp-1` or `v1`, on 8 seeds each.
- So a match ends only when bots press structures. The house tiers are built not to: they leave an
  enemy tower when their wave isn't there, and they recall early (medium at 75 % of max hp, hard
  below 90).
- eco-1 didn't move structure damage: −5.8/min [−32, +19]. The P2 smoke's four matches timed out
  too.

**Violet's tiebreaks are the map, on the frozen sim. The tiers play no part.**
- With every bearbot holding at base (no pilots in the lanes), violet's minions spent 48 one-second
  samples under green towers per match on `pvp-1`, against green's 2. That held on all 8 seeds.
  Violet minions lived 8 % longer (5,478 vs 5,062 minion-seconds).
- On `v1` the same run is exactly even, 741 vs 741.
- Part of the cause is update order. The frozen sim spawns and updates violet's minions first, so in
  a mirror minion fight violet swings first. Re-ordering green's minions first every tick cut the
  edge to 36 vs 18, but did not flip it. The rest of the asymmetry is elsewhere in the frozen sim and
  was not traced.
- On `v1`, the outer towers (at 0.42 of the lane) cover the point where the waves meet, and that
  washes the edge out. `pvp-1` pulled them back to 0.30, which left it.
- The house tiers attack towers only with their wave. Violet's surplus minions give violet's bots the
  cover green's never get. Violet took the first tower in 23 of 24 slice matches, and the timeout
  tiebreak counts towers alive.
- The house-tier study's all-violet result (`runs/house-tiers-2026-09-30.md`) was on `v1`, where the
  bot-free run is even. This doesn't explain that one.

**What it means for §6.** A pairing keeps each tier on one side. So winner-based reads ("decided",
comeback, any "medium beats hard") are side effects. The paired economy and PvP metrics compare like
with like and are not affected. Not done, and Ceryce's call:
- swap sides on half the seeds (this breaks pairing with the slice);
- or fix the minion asymmetry outside the frozen sim, which would be a new map variant.

**Traced and fixed (2026-10-01):** [`runs/side-fairness-2026-10-01.md`](../runs/side-fairness-2026-10-01.md).
- **The cause is all update order, for bearbots as well as minions.** The `pvp-1` geometry is
  mirror-exact: spawning green first within each wave gives exactly 2 vs 48.
- **The fix is a tick resolution, not a map variant.** `simultaneous-1` (`src/resolution.ts`) is
  recorded in the log and on by default for new matches. With it, bots at base are 0 vs 0.
- **Old logs replay unchanged.** A log without the field replays on the sequential order.
- **The runner pins it.** `measure_economy.mjs` passes `--resolution`, and won't mix resolutions
  within one `--date`.

### 13.4 Smoke on Jev

[`runs/economy-p2-smoke-2026-09-30.md`](../runs/economy-p2-smoke-2026-09-30.md): 4 full matches,
medium-eco vs hard-eco, eco-2, $0.34, 0 errors, every log replay-verifies.
- Income median 99.6 gold/min/bot, 3 of 4 matches in band.
- Shopping recalls 4.00 (medium) and 4.25 (hard) a match, against 2.0 and 0.17 in the slice.
- All 24 bots bought their declared list in order. Median items at the end: 2.
- First item still 5:08.

### 13.5 Running §6

**The plan.** 4 conditions × 2 pairings × the slice's 12 seeds = 96 matches.
`tools/match/measure_economy.mjs` plays them on one Jev server:
- seed by seed;
- side names held at `medium` / `hard` / `entrant` so `metrics` pairs across conditions;
- an existing log is skipped, so re-running the same command resumes.

```sh
python tools/jev/schema_server.py --port 8851 --budget-usd 9.50
node tools/match/measure_economy.mjs --jev-schema http://127.0.0.1:8851/ --date 2026-10-03 --parallel 2
npm run metrics -- --group A runs/economy-measure-2026-10-03-A-*.json --group R runs/economy-measure-2026-10-03-R-*.json \
  --group B0 runs/economy-measure-2026-10-03-B0-*.json --group B1 runs/economy-measure-2026-10-03-B1-*.json \
  --json runs/economy-measure-2026-10-03-metrics.json --md runs/economy-measure-2026-10-03-metrics.md
npm run metrics -- --group B0 runs/economy-measure-2026-10-03-B0-*.json --group B1 runs/economy-measure-2026-10-03-B1-*.json \
  --md runs/economy-measure-2026-10-03-b1-vs-b0.md
```

- **Expected cost: about $8** ($7.5–8.5). That is 72 matches with today's prompts at about $0.078
  each: the Bandstand run's medium-vs-hard rate, with the tiers' dormant Bandstand rules. The 24 B1
  matches cost about $0.09–0.095: the smoke's $0.085, plus those same rules, which the eco tiers now
  carry. The server's `--budget-usd 9.50` stops the run under Ceryce's $10.
- **Wall time:** about 2.5 h at `--parallel 2`, as the slice ran, or about 4.5 h one at a time.
  Either way it outlives a 10-minute tool call, so run it detached (a Margo job, or `nohup`).
- `--dry-run` prints every match command without running anything.
- The logs are gitignored and go on a data release, as the slice's did. The 2026-10-03 run's logs
  are on `data-economy-gate-2026-10-03`.

### 13.6 The §6 result

[`runs/economy-gate-2026-10-03.md`](../runs/economy-gate-2026-10-03.md) scores the 96 matches.
They were played before #56, on the sequential order.

- **Pass:** every line on what the economy is for. That covers PvP share of damage, engagement, first
  blood, no dive tax, lead changes, PvP share of earned gold, items, carried gold at death and
  shopping recalls. B1 ≠ B0.
- **Fail, narrowly:**
  - income is 128.4 against 85–125;
  - the first item comes at 4:44 against ≤ 4:30 (medium vs hard is at 5:07, which confirms §13.4);
  - the gold gap at 6:00 is 0.261 against ≤ 0.25.
- **Unscorable on the old order:** `decided` and comeback, which are winner reads.
- **The proposed single pass (§6.2), `eco-3`:** `gold.start` 100, `kill` 250, `assistPool` 125.
  - `gold.start` alone raises income, because start gold is paid as passive.
  - Then re-run B1 only. This proposed `--resolution sequential`; the re-run used `simultaneous-1`
    (below).
- **The recommendation for the go/no-go gate is go** on the economy.

**The tuning pass, run:** [`runs/economy-eco3-2026-10-01.md`](../runs/economy-eco3-2026-10-01.md).
- **`eco-3`** is `src/economy/eco-3.json`: `eco-2` with only those three prices changed, and a test
  pins that.
- **The run:** B1's 24 matches on Jev, played by `measure_economy.mjs --conditions B1 --economy eco-3`.
  It cost $2.21.
- **Resolution:** played after #56 under `simultaneous-1`, the resolution the Jam plays. The gate was
  sequential.
  - `eco-3`'s economy lines are level reads, so this doesn't touch them.
  - The paired lines against A now cross resolutions. A 5-seed anchor says that biases the PvP lines
    against `eco-3`, not for it.
- **Every scorable line passes:**
  - income 122.0;
  - first item 3:28;
  - gap at 6:00 0.186;
  - PvP share of earned 75.1 %, items 3, carried gold at death 162 and shopping.
  - Every paired line against A passes too.
- **Comeback is scorable now: 12 of 14.** `decided` still isn't, because A was played on the old
  order.
- **The ledger forecast held:** income −11.0 against −9.5 forecast, and PvP share of earned −7.3pp
  against −7.4pp.
- **Caveats:**
  - The lines are pooled medians, and medium vs hard's own first item is 4:47. The entrant pairing
    carries the pass.
  - Both presets were measured on the eco tiers from before #57 and on `first-min` targeting.
- **The check on the shipping code:** [`runs/economy-eco3-check-2026-10-01.md`](../runs/economy-eco3-check-2026-10-01.md).
  - It ran 12 medium-vs-hard matches on `eco-3`, each seed both ways, with today's tiers (#57, #60)
    and `own-lane-1` (#62). It cost $1.40.
  - Every line it can score passes. The house pairing's first item is 4:16, against 4:47 before.
  - Income fell to 96.7 as tower gold collapsed, and items are thin (median 2, mean 1.85).
  - Tiers and targeting changed together, so their effects can't be separated. The entrant pairing
    wasn't re-run.
  - Its recommendation is unchanged: ship `eco-3`, and on a GO flip the default to it.
- **Recommendation for the gate: ship `eco-3`.** Nothing flips automatically. `DEFAULT_ECONOMY`
  stays none, and §6's conditions stay `eco-2` until Ceryce rules.
