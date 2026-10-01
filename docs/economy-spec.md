# Economy spec — gold, levels and items for the Jam (eco-1)

**Status:** draft for Ceryce's rulings (§8). Spec only; nothing here is built yet.
**Written:** 2026-09-30, after Ceryce chose "minimal economy before the jam" (19:57 CT).
**Jam:** Fri 2026-10-16. Entry cutoff is midnight Central on Thu 10-15. Sign-ups close Tue 10-06.

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
| 1 | **Respawn becomes part of the ruleset.** Timer is `6 s + 3 s × level`. | Today a death is permanent (§1). That makes any risk to carried gold pointless and rewards hiding. |
| 2 | **One gold pool, and unspent gold is at risk.** On death, half of your unspent gold **goes to the bots that killed you**. | This is Ceryce's recollection of Dota. Neither Dota nor League actually does it (§2). For her principle it beats both: it creates a hold-vs-spend choice, a risk-while-carrying choice and a hunt-the-carrier choice from one rule. |
| 3 | **Kill gold 200, an assist pool of 100, first blood +100.** Minion last hit 15. Passive 0.5 gold/s. | One kill is worth about 13 last hits. Passive is a floor so even a weak bot gets one item. Most income has to be earned, and about a third of it should come from PvP. |
| 4 | **Tower gold is part team-wide, part split among the bots standing near it.** | This is the PvE that pulls bots together: objectives pay the bots that show up, so the other team has to show up too. |
| 5 | **Five levels from shared-proximity XP.** Each level gives +8 % max hp and +8 % attack damage. No level-up choice. | XP for being near a fight or a push, not for last hits, pays for grouping. A level-up choice would add a decision the translator can't express well. |
| 6 | **Four items in three slots, each with a real cost** (Amp, Road Case, Bass Strings, Metronome). A fifth, Tip Jar, is optional. | A bot can't own everything, and every item gives something up. Bass Strings heals only from damage dealt to enemy bearbots. |
| 7 | **Buy only at your own base. The prose declares a shopping list.** It is bought automatically when you're at base and can afford the next item. There is no new action kind. | The decision a bot makes during play is *when to go home*. That is a yes/no question Jev already answers well. A `buy` action would be a new failure mode in the translator. |
| 8 | **All of it runs outside the frozen sim**, as `src/economy.ts` plus one constants file. Match logs record it as `economy: "eco-1"`. | This is the same pattern as the balance study's `src/mapVariant.ts`. Old logs replay unchanged. |
| 9 | **Measure on Jev** with the balance study's metric tool, in four seed-paired conditions (§6). There are pre-registered pass/fail lines. | Standing rule: Jev, never qwen 9B. |
| 10 | **Entrant-facing changes land by Mon 10-05**, numbers freeze Thu 10-08, and there is a go/no-go gate on Sun 10-04 (§7). | Sign-ups close Tue 10-06. Entrants must see the rules they are writing against. |

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
- **The sim is frozen.** `src/sim/*`, `src/rng.ts`, `src/pilots/*` and `src/types.ts` are the v1 specimen, with hashes in `runs/historical-v1.md`. Jam tooling drives the sim from outside (`tools/match/headless.ts:44-47` reaches the private `tick`). The balance study's `src/mapVariant.ts` (branch `feat/balance-pvp`) is the precedent for a ruleset change applied from outside.

---

## 2. Dota 2 vs League of Legends gold — verified

Ceryce asked (20:01 CT) for the two models to be compared against primary sources. Every claim below
is quoted from the wikis, which were read through their MediaWiki APIs on 2026-09-30. The page
revision IDs are listed in §9.

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

**Recommendation: carried gold that drops to the killers (§3.3).** One number per bot covers what
Dota needs two pools for, and adds the transfer that Ceryce remembered. It turns out to be stronger
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
the risk.

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
| **Death drop** | 50 % of the victim's **unspent** gold | split equally among killer and assisters | §3.3 |
| Tower | 100 to every bot on the team, alive or dead, **plus 120 split among the team's bots within 300 of the tower** when it falls | team / bots present | The team share keeps a push worth doing. The local share is League's plating rule: the bots that show up are paid, so the defenders have to show up too, and the PvE objective becomes a team fight. |
| Nexus | — | — | The match ends. |

**Execution** is a death with no enemy bearbot damage in the window, i.e. killed by a tower or minion
alone. It pays no kill or assist gold, and the victim's drop **vanishes**: it costs the victim but
pays nobody. This follows League's execution rule and Dota's vanishing loss. Paying the defenders
would reward sitting under a tower, which is PvE.

**Expected income per bot over 600 s** (to be checked in §6):
- passive 300
- last hits 150–300
- towers about 150–250
- kills, assists and drops about 250–400

That's about **850–1250 in total**, with **about 30–40 % from PvP**. Three item slots cost 1000–1050,
so a typical bot finishes 2 items and a strong one finishes 3.

### 3.3 Carried gold and death

- A bot has **one gold number**. All gold, including passive, is **unspent and at risk until it buys an item**. Items are never lost.
- On a credited death, **`floor(0.5 × gold)`** leaves the victim and is split equally among the killer and the assisters (remainder to the killer). On an execution it vanishes.
- A bot's **bounty** is the most that killing it pays the enemy team: `200 + 100 + floor(0.5 × gold)` (kill + assist pool + drop). The assist pool is paid only when someone assists. The first-blood bonus is left out. Bounty is shown to everyone (§4.1). Hunting the carrier is a decision the bot can see and make.
- **What this does to a bot's choices:**
  - *Spend vs hold.* Going home costs tempo, often a wave. Staying out risks the gold.
  - *Risk while carrying.* A bot carrying 400 gold has a reason not to start a fight it isn't sure to win.
  - *Target selection.* Killing an enemy carrying 400 is worth 500 to the killing team, which is more than an item.
  - *A natural shutdown.* A bot that has been winning and hasn't been home is worth the most.
- **Snowball check.** The killer gets richer, but a rich killer is in turn worth more to kill. With
  no streak gold, no level term in the bounty and short respawns, the main brake is the bounty
  itself. Swinginess and comeback rate are measured in §6. If runaway shows up, cut the drop to 25 %
  or fall back to League-lite (§8 Q2).

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

There are **three slots**. Four items are always in the shop, and a fifth is optional. There's no
selling, no duplicates and no recipes. **Every item gives up something**, either a stat or what it is
useless for.

| Item | Cost | Gives | Gives up | Who wants it |
|---|---|---|---|---|
| **Amp** | 350 | attack damage +35 % | max hp −15 % | Glass cannon. A keytar that kites, or a violin that commits. |
| **Road Case** | 300 | max hp +35 % | move speed −12 % | Tanky but can't chase or escape. A drums frontline. |
| **Bass Strings** | 350 | heals 30 % of damage dealt **to enemy bearbots** (attacks and abilities) | Nothing from minions, towers or nexus | Only pays off while fighting bearbots. A PvP item by construction. Taken from the design doc's "bass … sustain = lifesteal". |
| **Metronome** | 350 | ability cooldowns −30 % | basic attack interval +15 % | An ability-first pilot: violin staccato 4 → 2.8 s, keytar chord 7 → 4.9 s. |
| *Tip Jar* (optional, cut first) | 200 | gold from kills, assists and drops +50 % | Your death drop is **100 %** of unspent gold, not 50 % | Bets on yourself. Pure risk-while-carrying. |

- **Stacking.** `stat = instrumentBase × (1 + levelBonus) × Π(1 + itemModifier)`. For example, drums with Road Case and Amp has `220 × 1.35 × 0.85 = 252` hp at level 1.
- **Three slots from four items**, so every build leaves one out. The choice is what to skip and in what order.
- **Late-game gold.** Once all slots are full, extra gold buys nothing and only raises the bot's bounty. That is deliberate. A bot that has won enough to fill every slot becomes a target, which is a comeback lever that costs nothing to build.
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
a new ruleset name, not a code change.

```json
{
  "name": "eco-1",
  "respawn": { "baseSec": 6, "perLevelSec": 3 },
  "gold": {
    "start": 0, "passivePerSec": 0.5, "minionLastHit": 15,
    "kill": 200, "assistPool": 100, "firstBlood": 100,
    "towerTeam": 100, "towerLocalPool": 120, "towerLocalRadius": 300,
    "deathDropFraction": 0.5, "executionDrop": "vanish"
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
    "metronome":    { "name": "Metronome",    "cost": 350, "mods": { "abilityCooldown": -0.30, "attackCooldownSec": 0.15 } },
    "tip-jar":      { "name": "Tip Jar",      "cost": 200, "mods": { "pvpGold": 0.5, "deathDropFraction": 1.0 }, "optional": true }
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
2. Resolve that tick's deaths: kill credit, then gold, then drops, then XP.
3. Resolve tower deaths: team gold, then local gold, then XP.
4. Pay passive gold.
5. Apply level-ups.
6. Respawn every bot whose timer has expired.
7. Auto-buy for every bot at the shop.
8. Re-derive stats.

### 3.9 How it runs outside the frozen sim

This is a ruleset layer, the same shape as `src/mapVariant.ts`. Nothing in `src/sim/*`, `src/types.ts` or `src/pilots/*` changes.

| Need | How, from outside | Precedent |
|---|---|---|
| Who damaged whom (kill credit, last hits, lifesteal) | Wrap four instance methods on the match: bearbot attack, ability, minion update and tower update. Diff every unit's hp before and after each call. | `tools/match/metrics.ts` (balance-pvp) does exactly this today. |
| Stats from levels and items | Write the bot's own mutable fields (`maxHp`, `attackDamage`, `moveSpeed`, `attackCooldownSec`) between ticks. | `applyMapVariant` writes `tower.attackRange`. |
| Ability cooldown −30 % | After each tick, a cooldown that *rose* means a cast just happened. Scale what remains. | — |
| Respawn | Between ticks, set `alive`, `hp`, `pos`, `recalling`, `buffs` and targets. Set the bot's private `pilotState.currentAction` to `hold`, reached by a cast exactly as `headless.ts` reaches `tick`. A revived bot is polled again on the next tick, because `pollPilots` skips only dead bots. | `headless.ts:44-47` |
| New observation fields | Wrap `pilot.decide(obs)` so the observation is extended before the pilot sees it. | `RunOptions.decisionPilotFor` (`headless.ts:63`) |
| Replay | The log records `economy: { name, builds }`. `checkpointOf` adds per-bot `[gold, xp, items]` **only when the log has an economy**, so every existing log replays bit-identically. | `MatchLog.map` in balance-pvp |

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

### 3.10 How it composes with the PvP balance study (`feat/balance-pvp`)

- **The layers are independent.** The map variant moves and re-ranges towers before the first tick. The economy hooks the tick and the pilot. The order is `applyMapVariant` and then attach the economy. A log records both `map` and `economy`.
- **Nothing in eco-1 touches tower range or placement, or bearbot attack range.** Those belong to the balance study.
  - Tower gold doesn't depend on where towers stand.
  - The local share's 300 radius is measured from the tower's actual position, so it follows any variant.
- **The economy is measured on whatever map the balance study ships as `DEFAULT_MAP`.** That avoids confounding the two changes. If the balance study changes its map after the economy is tuned, one re-run of §6 condition B1 confirms the economy still passes.
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
    "gold": 340,                 // unspent; at risk
    "bounty": 470,               // what killing you pays the enemy team: 200 + 100 + floor(0.5 × gold)
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
- **Found while scoping, not verified end-to-end:**
  - `schema_to_dict` writes only `schema.rules`.
  - For a tree with guards, that is just the root's own top-level rules (`translator.py:139-163`).
  - So a compiled guard tree appears to lose its guards on the way to `schema_server.py`.
  - This serializer is being changed for `build` anyway, so serialize `root` there (or fix it separately sooner).

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
- **Add an "Economy" section** with gold sources, the death drop, levels and the item table. **Generate it from `eco-1.json`** so the numbers can't drift, and mark them "provisional until Thu 10-08" (§7).
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
| Evolve | `tools/evolve/generation.mjs` `matchKey` (§7 P4), `fitness.mjs` | P4 |
| Docs | this spec; `docs/design.md` (a ruleset paragraph, as the balance study adds for the map); `docs/arena-runbook.md`; `docs/prose-to-schema-translator.md` (`build`, selector) | with each phase |

---

## 6. Measurement — judging the economy on Jev

The tool is the balance study's `tools/match/metrics.mjs`. It works by seed-pairing:
- **`measureLog`** measures one log;
- **`aggregate`** summarises a condition;
- **`paired`** gives bootstrap CIs on the per-seed differences.

**The backend is Jev, never qwen 9B** (standing rule). Use the TypeSafe default with Workers AI
fallback, cadence 2 s and the Jam roster.

### 6.1 Conditions (all on the balance study's shipped map)

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
2. If it still fails, rule on the fallback (League-lite, §8 Q2) and re-run B0 and B1 with it.

No third pass before the Jam.

---

## 7. Plan to hit the Jam

Today is Wed 09-30. The fixed dates are: sign-ups close Tue 10-06, the entry cutoff is midnight
Central Thu 10-15, and the Jam is Fri 10-16. Effort is agent working hours. Every phase is a PR into
`develop` that Ceryce merges.

| Phase | Dates | Effort | Contents | Done when |
|---|---|---|---|---|
| **P0 Rulings** | Thu 10-01 | — | Ceryce answers §8. The balance study ships `DEFAULT_MAP`. | Rulings recorded in this spec |
| **P1 Ruleset layer** | Thu 10-01 – Fri 10-02 | 12–16 h | `eco-1.json`, `src/economy.ts`, `src/attribution.ts`, respawn, items and levels, observation wrapper, auto-buy, log and checkpoint fields, wired into all five places that build a match, HUD, metric-tool respawn support. Tests: ledger arithmetic, determinism, replay of old logs unchanged, replay of eco logs verified. | `npm test` green; an eco-1 match replays OK; v1 logs bit-identical |
| **P2 Decision surface** | Fri 10-02 – Sun 10-04 | 12–16 h | Translator `build` + selector + prompt items block + wire format (+ guard serialization), `describe_observation`, transparency, house tiers and worksheets, entrants README, template and compile preview, Elysium panel | Compile preview shows a shopping list; house bots shop |
| **Gate** | **Sun 10-04, end of day** | — | **Go/no-go:** if P1 is not merged and P2 not in review, the Jam runs on map-only, and the economy moves to after the Jam. The entrant-facing text is not published. | Ceryce decides |
| **P2b Entrant freeze** | **Mon 10-05** | 1–2 h | Entrants README, template and preview merged in `jamobair-entrants`; `PROMPTLANE_REF` bumped. Announce to entrants. | Live before sign-ups close Tue 10-06 |
| **P3 Measure + one tune** | Mon 10-05 – Wed 10-07 | 4–6 h wall clock + 3 h analysis | §6 conditions A, R, B0, B1; one tuning pass if needed | Pass lines met, or fallback ruled |
| **Numbers freeze** | **Thu 10-08** | — | `eco-1.json` final; README tables regenerated. Only bug fixes after this. | — |
| **P4 Re-tune house + campaign** | Thu 10-08 – Sun 10-11 | 6–8 h + background | House tier check re-run on Jev (easy < medium ≤ hard); per-tier builds tuned. **Fix `matchKey`** (`tools/evolve/generation.mjs:121-123`) to include the ruleset (map + economy + translator version); it currently hashes only sides, seed, cadence and length, so old cached matches would be reused silently. Campaign 1's results are void under eco-1; **campaign 2** relaunches on eco-1 within the epoch caps Ceryce set. | Tier ordering holds; campaign 2 running |
| **P5 Rehearsal + buffer** | Mon 10-12 – Thu 10-15 | 4 h | Full Jam dry run on Elysium with entrant-shaped prose; runbook updated | Dry run clean |

**Things that must land before sign-ups close (Tue 10-06):** respawn and the economy rules in the entrants README, the
shopping-list template blank, the observation fields, the new selector, and a compile preview that
shows the shopping list. Numbers may still move until Thu 10-08, and entrants are told they are
provisional.

**What to cut first**, in order, if the schedule slips:
1. **Tip Jar** (it is already optional).
2. **Metronome.** It is the only item that needs the cooldown-rescaling hook; three items in three slots means everyone owns everything, so drop to two slots.
3. **The `highest_bounty_enemy` selector.** Bounty stays visible in the description, and "the enemy worth the most" degrades to `lowest_hp_enemy`.
4. **Levels and XP.** Gold and items carry the decision surface; levels are a power curve.
5. **The death drop**, i.e. the League-lite fallback.

**Never cut:** respawn (if ruled in), kill gold, the shopping list with default builds, shop-at-base,
and the before/after measurement.

---

## 8. Open for Ceryce

Each question lists the options with the recommendation first. **Q1–Q4 and Q10 block P1.** Q2's
answer selects the death rule in `eco-1.json`.

**Q1. Respawn.**
- **A (rec):** respawn at the lane spawn after `6 + 3 × level` s. This is the precondition for any gold risk.
- B: no respawn, and the economy without death mechanics (League-lite only). It keeps the specimen's "a death is final" feel, but kills snowball into 3v2s and the risk decisions disappear.
- C: a fixed 15 s respawn and no levels. Simpler, but late kills mean nothing more than early ones.

**Q2. The gold-at-risk model.**
- **A (rec):** one pool; half of unspent gold drops **to the killers** on death (your recollection of Dota). It gives the most PvP incentive and three bot decisions from one rule.
- B: Dota-faithful. Earned gold is at risk, but the loss **vanishes**, and passive gold is safe in a second pool. Death costs, but killing a carrier doesn't pay extra. It also needs a second number per bot.
- C: League-lite. Nothing is ever lost, with a flat kill bounty and assists. The simplest option, with no carrying-risk decision.
- D: A with a 25 % drop. Same shape and gentler, if A measures as runaway.

**Q3. How bots buy.**
- **A (rec):** a shopping list declared in prose and bought automatically at base. The decision during play is when to recall, and there's no new action kind.
- B: an explicit `buy` action with an `item` argument, valid only at base. More expressive ("buy Road Case if their violin is fed"), but it is a new kind in 8+ copies of the vocabulary, a new translator failure mode and a wasted 2 s decision.
- C: A, plus buying anywhere. Removes the spend-vs-hold choice; not recommended.

**Q4. Item set.**
- **A (rec):** Amp, Road Case, Bass Strings and Metronome, in 3 slots.
- B: those four plus Tip Jar.
- C: three items (cut Metronome) in 2 slots, which is the simplest build.
- D: A with 2 slots. Sharper choices, but full inventories sooner, so late gold is only bounty.

**Q5. Levels.**
- **A (rec):** 5 levels from proximity XP, automatic +8 % hp and damage.
- B: no levels. Gold and items only.
- C: A plus a choice at levels 3 and 5 (hp or damage). More strategy, but a second decision vocabulary for the translator.

**Q6. Passive income.**
- **A (rec):** 0.5 gold/s, at risk like all gold.
- B: none. Every gold is earned, but weak pilots may never buy anything.
- C: 0.5/s into a safe pool. This is Dota's reliable gold, and it brings Q2-B's second pool.

**Q7. Comeback mechanic.**
- **A (rec):** none in eco-1. Measure swinginess first, since the bounty of a rich bot is already a brake.
- B: a League-style objective bounty, where a tower pays the team behind in gold +10 % of the gold gap.

**Q8. Timeout tiebreak.**
- **A (rec):** unchanged. The sim decides by towers, then nexus hp, and the bracket by fewer deaths.
- B: the bracket adds **team gold earned** after deaths. Timeouts are then decided by who played more of the game, much of it PvP.

**Q9. Build visibility.**
- **A (rec):** enemy items are visible in the observation. It's a fair fight, and it lets prose say "if their violin has an Amp, stay grouped".
- B: hidden. Simpler description.

**Q10. Go/no-go date.**
- **A (rec):** Sun 10-04, end of day, as in §7.
- B: Tue 10-06, which risks publishing entrant rules that then get pulled.
- C: no gate; always ship the economy.

**Q11. Where the ruleset lives after the Jam.**
- **A (rec):** it stays an external layer for the Jam. If it proves out, write it into `prompts/v2.md` afterwards, since the prompt is the source.
- B: write `prompts/v2.md` now and regenerate. That isn't feasible before 10-16, and it would invalidate every measurement.

**Q12. A `nearest_ally` move selector.**
- **A (rec):** not in eco-1. Proximity XP and assists already pay for grouping.
- B: add it in P2 (about 1 h). Prose like "stay near an ally" becomes expressible, and grouping is the clause of your principle it serves most directly.

**Q13. Names.** Amp, Road Case, Bass Strings, Metronome and Tip Jar are working names. Rename freely.
Only the keys in `eco-1.json` are load-bearing.

---

## 9. Sources

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
- `feat/balance-pvp` working tree (2026-09-30): `src/mapVariant.ts`, `tools/match/metrics.ts`.
