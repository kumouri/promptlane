# Late-game economy spec: recipe items, tier-3 passives and more levels

> "I think the other fix(es) are "higher tier" items that are made by combining prior items and
> paying a cost, and more levels." — Ceryce, Telegram, Fri 2026-10-02 02:32 CT
>
> "We could even make tier 3 items that have (really simple to implement) passives (like damage
> reduction, attack speed, and life steal, or something like those)" — Ceryce, Telegram, Fri
> 2026-10-02 02:33 CT

**Status:** the full version is built as the ruleset `eco-3-late`, which is off unless a match names
it (§11). Every number is still a proposal. The build took each §9 recommendation, and §9 still lists
what she needs to rule on.
**Written:** Fri 2026-10-02, on `develop` at `92e6044`.
**Spend:** $0. No model call of any kind was made, and nothing touched the live arena. The analysis
replays recorded match logs on local code. The tools are outside git, in
`C:\Users\willa\workspace\scratch\late-game-spec\`.
**Related:**
- [`economy-spec.md`](economy-spec.md) is the economy this extends (`eco-3`, §3, §13.6).
- [`vocabulary-spec.md`](vocabulary-spec.md) covers what a compiled rule can see and say. This spec
  adds item facts to the same description, and §7.3 shares its recompile window.
- The dive-trade analysis (Margo job 20261002-071601-4e15) is why this exists. Its `eco-4` (longer
  respawn timers) is the second factor of the measurement in §6.

---

## 0. The answer in one screen

**The problem (job 4e15).** The sample entrant beats the house by diving towers and dying, about 7
deaths per bot. Each death pays the defenders gold and XP, and **by about minute 5 neither buys
anything**:
- they fill 3 item slots at a median of 3.6–5.4 min;
- they hit the level-5 cap at 5.3–6.3 min;
- they end holding 890–1,320 gold (median per bot) that they can't spend.

**The proposal.** Three item tiers and three more levels:

| | What | Code |
|---|---|---|
| **Tier 1** | Today's four items, unchanged. | none |
| **Tier 2** | Four recipes. Each combines two tier-1 items and costs 250 gold. It gives a bit more than its two parts and **takes one slot instead of two**. | new: recipe purchase and build expansion |
| **Tier 3** | Each tier-2 item upgrades for 400 gold into a tier-3 item with one simple passive: toughness, attack speed, lifesteal or regeneration. | three are new numbers on existing stat paths; **regeneration is the only new code (3 lines)** |
| **Levels** | Cap 5 → **8**. Each level past 5 costs a flat **150 XP** (cumulative 710 / 860 / 1,010). Still +8 % hp and damage per level. | none (data only) |

**Sizing, on the logs** (§4: what each defender would have bought, given its recorded income and
recorded shop visits):

| | eco-3, as played | with this ladder |
|---|---|---|
| Unspent gold at the end, defenders vs the entrant (median per bot) | 890–1,320 | **130–360** |
| Tier 2 lands | — | 4.5–6.0 min |
| Tier 3 lands | — | 8.1–8.9 min (the richer half) |
| Defenders' level at the end (median) | 5, capped since about 6 min | 6–7 |
| Who reaches level 8 | — | 7–40 % of defenders, the first quarter at 8.4–9.5 min |

Gold and XP keep buying something until the last minute. Sides that aren't rich are barely
touched:
- **entrant bots:** they end with under one item and below level 5, both as played and under the
  ladder;
- **house vs house:** 0.1–0.4 tier-2 items per bot, and no change in results on paper.

**The paper effect on the dive (§5) is small, and it depends on whether the defender pushes.**
These re-scores keep every recorded death, hit and decision. Bots that adapt to the new rules would
play differently.
- **Against either hard tier the result is unchanged or one match apart.** Hard doesn't push. Towers
  and minions deal 77–80 % of the damage an entrant takes in its last 10 s (towers alone about
  60 %), so stronger defenders end the dive only 1–5 % sooner.
- **Against medium, which pushes, three entrant wins of 15 become medium wins.** Medium's extra
  structure damage is +154 to +322 hp a match.

**The sink multiplies whatever pushing the house does.** It doesn't create pushing. The lever that
makes a dive a losing trade is still a house tier that pushes while an enemy is respawning (job
4e15's third recommendation; [`vocabulary-spec.md`](vocabulary-spec.md) D3).

**Against the Jam (§8):**
- **The full version (18–22 h plus about $13 to measure) does not fit** before sign-ups close
  (Tue 10-06) alongside vocabulary stage A. Recommend after the Jam.
- **The Jam-sized version is levels only.** It is a data-only ruleset: 1–2 h, no translator change
  and no recompile. It respects the 2026-09-30 "minimal economy before the jam" ruling. It keeps XP
  mattering to the end, but it does nothing for gold.
- **A middle option fits only with a Sat 10-03 ruling:** one recipe and one upgrade per instrument,
  6 new items, all on existing stat paths. It is 12–15 h, has to ride vocab-2's Mon 10-05
  recompile, and carries medium-high risk.

> Ceryce's ruling, 2026-09-30 19:58 CT: "With the extra time and both Alex and Kristen ghosting me
> today let's go minimal economy before the jam."

This spec does not override that ruling. §8 sets out what each version costs against the dates, and
§9 asks her to choose.

---

## 1. What the logs say (the numbers this is sized from)

The data is the 158 logs job 4e15 used: 124 Final Chorus matches (conditions C0 without the finale
and C1 with it) and 34 house-hard matches.
- All are on `eco-3`, `pvp-1` and `simultaneous-1`. "hard-old" is the hard tier before PR #71 and
  "hard-new" is #71's.
- A new probe replayed every log on `develop` and sampled each bot's gold, XP, level, items and
  shop presence once a second. All 158 replayed with every checkpoint matching.
- "Income" is everything a bot earned, including the 100 start gold. It equals gold held, plus gold
  spent, plus gold lost to deaths.

**Per bot, median, for each side** (from `s1.out`):

| side vs opponent | income | gold at end (p75) | 3rd item | level 5 | XP at end | gold/min 0–5 → 5–10 | XP/min 0–5 → 5–10 |
|---|---:|---:|---:|---:|---:|---|---|
| hard-old vs entrant (C0) | 1,977 | 977 (1,695) | 4:33 | 6:00 | 880 | 222 → 178 | 102 → 76 |
| medium vs entrant (C0) | 2,614 | 1,320 (1,979) | 5:21 | 6:17 | 950 | 233 → 259 | 88 → 102 |
| hard-old vs entrant (C1) | 1,889 | 889 (1,234) | 4:35 | 5:34 | 770 | 220 → 130 | 94 → 62 |
| medium vs entrant (C1) | 2,480 | 1,138 (1,885) | 3:55 | 5:20 | 930 | 280 → 319 | 100 → 140 |
| hard-new vs entrant (HH) | 2,132 | 1,107 (1,280) | 3:39 | 5:23 | 870 | 283 → (ends early) | 104 → (ends early) |
| entrant (all five) | 782–1,149 | 103–151 | never | never | 440–510 | 92–132 → 65–156 | 50–52 → 30–48 |
| house vs house (all pairings) | 670–1,239 | 124–466 | mostly never | 7:35 – never | 430–710 | 70–182 → 60–160 | 38–76 → 52–78 |

- **Only the sides facing the entrant are rich.** Their unspendable surplus is income minus about
  1,000 gold of base items: **900–1,600 gold a bot**. House-vs-house sides rarely even fill three
  slots. A sink sized for the rich side is invisible to everyone else, which is what we want.
- **XP after the cap.** The rich sides end 210–390 XP past level 5's 560 (p75: 340–500), earned at
  62–140 XP a minute after 5:00.
- **Entrant bots end below level 5** (440–520 XP) and with under one item each. Every death costs
  half their carried gold, and the entrant team loses 1,500–1,900 a match that way (job 4e15).
  **Nothing in this spec reaches them** unless they change how they play.

---

## 2. The items

### 2.1 Rules

- **Three slots, as now.** No selling.
- **Tier 1:** the four eco-3 items, unchanged in name, cost and effect.
- **Tier 2: a recipe.** You must own both components. Pay the recipe cost **at your shop**. The
  components are consumed and the tier-2 item takes one slot, so **combining frees a slot**.
- **Tier 3: an upgrade.** You must own the tier-2 item. Pay the upgrade cost at your shop, and the
  tier-2 item becomes its tier-3 version. Slots don't change.
- **No two of the same item at once.** A component that was consumed can be bought again later.
- **Mods don't stack across a recipe.** The components leave your inventory, so only the combined
  item's mods count. Each item's mods are written out in full in the ruleset file, not derived
  from its parts.
- **Every item still gives something up.** A tier-3 item keeps its tier-2 drawback, except where
  the passive replaces it (Arpeggiator's attack speed replaces the Metronome's slower attacks).

### 2.2 The table

Costs are what you pay **at that step**. The total is everything that went into it.

**Tier 1, unchanged:** Amp 350, Road Case 300, Bass Strings 350, Metronome 350.

**Tier 2**, recipe cost 250:

| Item | = | Total | Gives | Gives up | Default for |
|---|---|---:|---|---|---|
| **Backline** | Road Case + Bass Strings | 900 | max hp +50 %; heals 40 % of damage dealt to enemy bearbots | move speed −12 % | drums |
| **Click Track** | Metronome + Amp | 950 | attack damage +50 %; ability cooldowns −35 % | max hp −15 %; basic attacks 15 % slower | keytar |
| **Fuzz Pedal** | Amp + Bass Strings | 950 | attack damage +50 %; heals 40 % of damage dealt to enemy bearbots | max hp −15 % | violin |
| **Tour Bus** *(full version only)* | Road Case + Metronome | 900 | max hp +50 %; ability cooldowns −35 % | move speed −12 %; basic attacks 15 % slower | violin's second recipe |

**Tier 3**, upgrade cost 400. Each takes its tier-2 item's stats and adds one passive:

| Item | from | Total | The passive | Gives up | Code |
|---|---|---:|---|---|---|
| **Wall of Sound** | Backline | 1,300 | **Toughness:** max hp +80 % in all (Backline +50 %). That's 20 % more hits to kill, the same as 1/6 damage reduction (§2.4). | move speed −12 % | new number, existing `maxHp` |
| **Arpeggiator** | Click Track | 1,350 | **Attack speed:** attack interval −25 %, replacing the Metronome's +15 %. That's 53 % more attacks per second than Click Track. | max hp −15 % | new number, existing `attackCooldownSec` |
| **Feedback** | Fuzz Pedal | 1,350 | **Lifesteal:** heals 70 % of damage dealt to enemy bearbots (Fuzz Pedal 40 %) | max hp −15 % | new number, existing `pvpLifesteal` |
| **Headliner** *(full only)* | Tour Bus | 1,300 | **Regeneration:** heals 2 % of max hp a second while alive | move speed −12 %; basic attacks 15 % slower | **new mod `regenPerSec`** |

**Why these four recipes.** The pairs are
`{Road Case, Bass Strings}`, `{Metronome, Amp}`, `{Amp, Bass Strings}` and `{Road Case, Metronome}`.
- The first three are the first two items of each instrument's eco-3 default build, so each default
  build reaches its recipe without changing its order.
- The four form two complementary splits of the four tier-1 items. So **any** three tier-1 items
  contain at least one recipe, and every recipe's leftover pair is itself a recipe. A bot can carry
  two tier-3 items.
- Amp + Road Case and Bass Strings + Metronome have no recipe, so the set stays at four.

**Why "+50" and not "the sum of the parts".** An earlier draft made tier 2 exactly its two parts.
Its only value was the freed slot, with +5 points on top. On the logs, the defenders' DPS at 8:00
then rose only ×1.04–1.10 over eco-3 as played: the gold was absorbed, but it bought almost no
power. With the numbers above it rises ×1.08–1.18, and max hp ×1.06–1.18. That is enough for gold
to matter, while house-vs-house results stay put on paper (§5.3). §9 D2 offers the lean numbers.

### 2.3 What a full ladder costs, and why 250 and 400

A default ladder (§2.5) runs: three tier-1 items, a recipe, the fourth tier-1 item, an upgrade, the
second recipe, and the second upgrade.

| Step | Cost | Running total |
|---|---:|---:|
| 3 tier-1 items | 1,000–1,050 | ≈ 1,000 |
| first recipe | 250 | 1,250 |
| the fourth tier-1 item | 300–350 | ≈ 1,600 |
| first upgrade | 400 | ≈ 2,000 |
| second recipe | 250 | ≈ 2,250 |
| second upgrade | 400 | ≈ 2,650 |
| (optional) a tier-1 item again in the freed slot | 300–350 | ≈ 3,000 |

- **A rich defender's median income is 1,890–2,610**, so the median one reaches its first tier-3
  item in the last two minutes. The deepest ladder, about 3,000, is more than anyone earned, so
  gold never stops buying something.
- **Recipe and upgrade costs were tried at three levels** (`s2-costs.out`; defenders vs the entrant,
  median unspent gold at the end, and tier 3 for the sides whose median reaches it):

  | Recipe / upgrade | Unspent at end | Tier 3 lands |
  |---|---|---|
  | 200 / 350 | 112–314 | 7:12–9:05, for 4 sides of 5 |
  | **250 / 400** | 127–355 | 8:06–8:51, for 3 sides of 5 |
  | 300 / 500 | 211–379 | 9:12, for 1 side of 5 |

  All three absorb most of the surplus. 250/400 puts tier 3 in the 8–9 min window, which is about
  when the Final Chorus starts (8:00). Cheaper turns gold into power sooner; dearer leaves tier 3
  out of most matches.
- **Headroom for the no-killer bounty.** Job 4e15's second recommendation pays the bounty even when
  no enemy bearbot gets the kill. It would add about 11 deaths × 190–270 gold a match, roughly
  700–1,000 per defender bot. The ladder's last 1,000 or so absorbs it. Without the ladder, job
  4e15 found only 18–52 % of that bounty could be spent.

### 2.4 The passives: what is new code and what is a new number

Ceryce asked for "really simple to implement" passives. Every item stat today is a multiplier that
`src/ruleset/stats.ts` writes into the bearbot's own fields between ticks, and lifesteal and the
ability-cooldown cut are applied after each tick (`src/economy.ts:422-433`).

| Passive | How | Verdict |
|---|---|---|
| **Attack speed** | the existing `attackCooldownSec` multiplier (the Metronome already uses it, +15 %) | **a new number.** No code. |
| **Lifesteal** | the existing `pvpLifesteal` mod (Bass Strings, `economy.ts:426-427`) | **a new number.** No code. |
| **Toughness** | the existing `maxHp` multiplier | **a new number.** No code. It is the stand-in for damage reduction, below. |
| **Regeneration** | a new mod key `regenPerSec`: in step 7 of the tick, a living bot gains `regenPerSec × maxHp × dt`, capped at max hp | **new code, trivial.** About 3 lines plus the type key and a test. No state, no timer. Only in the full version. |
| **Damage reduction, done for real** | The sim applies damage inside its private methods (`src/sim/match.ts:298, 314, 330, 365, 433`) and then calls `checkDeath`. Under `simultaneous-1`, a unit dealt lethal damage dies at the end of the step even if healed meanwhile (`src/resolution.ts:20-22`), so refunding a share after the hit can't save it. A real reduction would wrap `checkDeath` (which `resolution.ts:95-101` already wraps), with a per-bot hp watermark to recover each hit's size. A recall heal inside the tick breaks the watermark. | **Not simple.** That is state, ordering with another layer's wrapper, and an edge case. After the Jam, if ever. |
| Lifesteal from all damage | a sibling of `pvpDealt` counting minion damage | Trivial, but **never from structures**: healing from tower damage would pay for dives. Not proposed. |
| Bonus structure damage ("siege") | `attackDamage` is one number for every target, and per-attacker extra damage would have to bypass the sim's death check. The Final Chorus scales every structure's hp instead (`src/finale.ts:12-19`), which can't be done per attacker. | Not simple. Not proposed. |

**Toughness instead of damage reduction, honestly labelled.** Wall of Sound's +80 % max hp, against
Backline's +50 %, takes 1.8 / 1.5 = 20 % more hits to kill. That is exactly what a 1/6 damage
reduction does. The two differ only for heals, which fill a bigger pool more slowly in percentage
terms. Entrants see it written as "max hp +80 %", never as "damage reduction".

### 2.5 Shopping lists (`build`)

**What an entrant declares.** An ordered list of item names of any tier. Each entry is either:
- a **step**: a tier-1 purchase, a recipe, or an upgrade; or
- a **target**, such as "Wall of Sound", whose missing parts get filled in.

**Expansion (one rule, in `resolveBuild` in TypeScript and mirrored in `normalize_build` in Python;
§7):**
1. Walk the list in order. For each entry not yet in the plan, add its recipe tree depth-first,
   parts in their `from` order, then the entry itself. Skip anything the plan already holds at that
   point.
2. Check slots by walking the plan from an empty inventory. A tier-1 step that would need a fourth
   slot is dropped, with the note "no free slot — combine two items first". So is a recipe whose
   parts the plan never holds.
3. Cut the plan at **10 steps**. Nobody can afford more in 600 s; the deepest ladder is 9.
4. An empty result means the instrument's default ladder.

**The shop** (`shopFor`, extended): buy down the plan while the bot is at its shop and can afford
the next step. **It never skips a step**, exactly as now, so saving for an upgrade is still
implicit.

**The plan is what the log records** (`LogEconomy.builds`), so replay never re-expands it (§7.6).

**Default ladders** (eco-3's first three items unchanged, then the ladder):

| Instrument | Plan |
|---|---|
| drums | Road Case → Bass Strings → Metronome → **Backline** → Amp → **Wall of Sound** → **Click Track** → **Arpeggiator** |
| keytar | Metronome → Amp → Road Case → **Click Track** → Bass Strings → **Arpeggiator** → **Backline** → **Wall of Sound** |
| violin | Amp → Bass Strings → Road Case → **Fuzz Pedal** → Metronome → **Feedback** → **Tour Bus** → **Headliner** |

In the per-instrument version (§8.2), violin stops after Feedback, holding Road Case and Metronome,
because Tour Bus doesn't exist there.

**House builds.** The house tiers declare their lists in prose (`prompts/pilots/house-*-eco.prose.md`,
`house-eco-{violet,green}.md:10-13`). Each tier's eco-3 list gets the default ladder appended, and
the tiers keep their current first three. Easy keeps only its first three. Easy shops only when it
happens to be at base anyway, so a long list changes nothing for it, and keeping it short keeps
the tier order honest.

---

## 3. Levels

### 3.1 The curve

| Level | 1 | 2 | 3 | 4 | 5 | **6** | **7** | **8** |
|---|---|---|---|---|---|---|---|---|
| Cumulative XP | 0 | 80 | 200 | 360 | 560 | **710** | **860** | **1,010** |
| hp and damage vs base | — | +8 % | +16 % | +24 % | +32 % | **+40 %** | **+48 %** | **+56 %** |

- **Each level past 5 costs a flat 150 XP.** One kill (60 XP) is 40 % of a level, all the way to the
  cap, so XP keeps paying.
- **When it lands, from the logs** (`s2b.py`, defenders vs the entrant):
  - level 6: 64–96 % of them reach it, the median at 6:37–7:33 and the first quarter by 5:28–6:39;
  - level 7: 40–78 % reach it;
  - level 8, the cap: 7–40 % reach it. Where at least a quarter do (four of the five sides), that
    quarter is there by 8:26–9:32.
  So **the cap lands in the last minute and a half, and only for the richest quarter.**
- **Rejected curves:**
  - Continuing eco-3's +40 steps (800, 1,080, 1,400): level 8 is unreachable, so it's really 7 levels.
  - A flat 200 (760, 960, 1,160): only 4–13 % reach level 8.
- **Entrant bots and house-vs-house** end at level 4–5 as now. Their XP never gets past 560, where the
  old curve and the new one are identical.
- **No level-up choice** (economy spec Q5 option C stays rejected): the per-level gain is automatic,
  as now.

### 3.2 Respawn per level, and eco-4

The respawn timer is `baseSec + perLevelSec × level` (`economy.ts:474`), so higher levels mean longer
respawns:

| Level | 5 | 6 | 7 | 8 |
|---|---|---|---|---|
| eco-3 (6 + 3 × level) | 21 s | 24 s | 27 s | 30 s |
| eco-4 (10 + 5 × level) | 35 s | 40 s | 45 s | 50 s |

- **Only the rich side reaches levels 6–8**, and the house tiers are dead for just 1–5 % of a match
  (job 4e15). So the longer timers almost never apply. On paper they move no house-vs-house result
  (§5.3).
- **Under eco-4, a level-8 defender's death costs it 50 s.** That is inside the entrant's 44–60 s
  break-even from job 4e15. Killing the rich bot becomes a real comeback lever, which is the Dota
  shape.
- **Recommended: leave the formula linear** (data only). The alternative is a `respawn.maxLevel`
  knob that stops the timer growing past level 5. That is two lines of code and a new ruleset field
  (§9 D4).

---

## 4. Sizing: the arithmetic

**Method** (`ladder.py` and `s2.py`). For every bot in every log, the simulation keeps:
- its recorded income, second by second;
- its recorded deaths (the death loss is recomputed as half of what it now carries);
- the seconds it was at its shop.

It then buys down the new ladder and records its level from its recorded XP under the new curve.
- **Validation:** run on eco-3's items with each bot's recorded purchases, it reproduces the
  recorded end-of-match gold (median error 0, p90 1, max 350, the max being one bot).
- **What it ignores:**
  - behaviour change: a bot with a goal to save for might recall more;
  - feedback: a stronger defender may kill more and earn more;
  - killers' payouts: these stay as recorded, even when a richer-spending victim would carry less.

**Defenders facing the entrant** (median per bot; full ladder at 250/400; flat-150 levels):

| side vs opponent | gold at end, eco-3 → ladder (p75) | tier 2 at | tier 3 at | tier-2+ items held at end | level at end |
|---|---|---:|---:|---:|---:|
| hard-old (C0) | 977 → 224 (335) | 6:01 | — (some) | 1.31 | 7 |
| medium (C0) | 1,320 → 243 (383) | 5:54 | 8:51 | 1.47 | 7 |
| hard-old (C1) | 889 → 127 (289) | 5:47 | — (some) | 1.22 | 6 |
| medium (C1) | 1,138 → 355 (471) | 5:41 | 8:06 | 1.38 | 7 |
| hard-new (HH) | 1,107 → 171 (266) | 4:33 | 8:44 | 1.28 | 7 |

**Everyone else:** entrant bots hold 0.00–0.16 tier-2 items, and their end gold is unchanged.
House-vs-house sides hold 0.06–0.44, and their median end gold falls by 5–130.

**Per-instrument version** (3 recipes, 3 upgrades): the same within 0–60 gold (`s2.out`). Losing
Tour Bus and Headliner only matters to violin's second recipe, which few bots reach.

**Levels only:** end gold is unchanged (890–1,320), and the levels are as in §3.1. The XP surplus is
absorbed and the gold surplus isn't.

---

## 5. Paper effect on the dive trade

### 5.1 Method (`s3.py`): every recorded hit, re-weighted

This extends job 4e15's re-score and **ignores behaviour change**: every death, hit and decision
stays where it happened. For each structure hit, the re-score:
1. **Scales a bearbot's hit by its DPS ratio.** The ratio, new ruleset ÷ eco-3 as played, is its
   attack damage (levels and items) over its attack interval (items), at that second.
2. **Shortens the entrant's dive.** Its hits in the 15 s before each death shrink by `1/F`, where
   `F = 1 + s_b (k − 1)`:
   - `s_b` is the bearbot share of the damage it took in its last 10 s;
   - `k` is the mean DPS ratio of the enemy bearbots within 300 of it.
   Stronger defenders end the dive sooner.
3. **Scales each bot's hits by its alive-time ratio** under the arm's respawn rule, at its level
   under the new curve. This is job 4e15's method.
4. **Re-times every tower's fall** to the moment its re-weighted damage reaches 900. A tower that
   comes up short of its recorded fall has the deficit spread at its attackers' last-30-s rate, as
   job 4e15 did. Then the match is re-decided by job 4e15's rule.

**Checks:**
- The identity re-score reproduces **all 96** recorded Final Chorus and house-hard winners.
- The eco-4 arm reproduces job 4e15's table exactly.

**Not modelled:**
- defenders' extra hp, lifesteal and regeneration keeping them alive (they rarely die anyway);
- any change in who kills whom.

### 5.2 Results (matches with the entrant; the strong numbers of §2.2)

| Condition (matches) | eco-3, as played | levels only | late game (items + levels) | eco-4 timers | eco-4 + late game |
|---|---|---|---|---|---|
| C1: entrant vs hard-old (15) | entrant 13, draw 2 | entrant 12, draw 3 | entrant 12, draw 3 | entrant 10, draw 5 | entrant 10, draw 5 |
| C1: entrant vs medium (15) | entrant 8, medium 6, draw 1 | 8 / 6 / 1 | **entrant 5, medium 9**, draw 1 | entrant 5, medium 6, draw 4 | **entrant 2, medium 9**, draw 4 |
| HH: entrant vs hard-new (6) | entrant 6 | entrant 6 | entrant 6 | entrant 4, draw 2 | entrant 4, draw 2 |
| C0 (no finale): vs hard-old (15) | entrant 7, draw 8 | 7 / 8 | 7 / 8 | entrant 3, draw 12 | entrant 3, draw 12 |
| C0 (no finale): vs medium (15) | entrant 1, medium 1, draw 13 | same | medium 2, draw 13 | medium 1, draw 14 | medium 2, draw 13 |

The per-instrument version gives the same table as the full one, row for row.

**Lean numbers** (§9 D2): the late-game column for C1 vs medium is entrant 7, medium 7, draw 1.
Every other row is the same.

### 5.3 Why it is small, and where it isn't

- **Defenders do get stronger, but late** (`s4.py`, median vs eco-3 as played): DPS ×1.00 at 4:00,
  ×1.00–1.11 at 6:00 and ×1.08–1.18 at 8:00; max hp ×1.06–1.18 at 8:00.
- **The dive is killed by structures and minions.** Bearbots deal only 20–23 % of the damage an
  entrant takes in its last 10 s. Only about half the entrant's deaths come after 5:00, and 71–77 % have an enemy bearbot
  within 300. So `F` averages 1.01–1.05: the dive ends 1–5 % sooner, and the entrant loses 1–6 hp of
  tower damage a match.
- **The defenders' gain shows up as their own pushing:**
  - hard: +1 to +4 hp of structure damage a match (it doesn't push);
  - medium: **+154 hp (C0) and +322 hp (C1)** (it does).
  That is where every changed result comes from.
- **House vs house** (92 matches, every tier pairing in both datasets): 60 draws, hard-new 19 and
  medium 13 as played. Every arm gives the same result, except the strong late game, which turns one
  draw into a medium win. **No runaway on paper.**

**What it means.** Items and levels convert the defender's kill gold into power, but power only
wins matches through towers, and the hard tiers don't push. **Behaviour change is the whole
question.**
- Against medium, the paper already shows the trade turning: the entrant's 8 wins of 15 become 5,
  or 2 with eco-4's timers.
- Against hard, it needs the house push rule. The sink then makes each push count for 8–18 % more
  (DPS) late in the match.
- Expect the entrant prompt to adapt too: say, by diving less after 8:00 when tier-3 defenders are
  out. A re-score can't see that.

---

## 6. Measurement on Jev (pre-registered)

**Design: a 2 × 2 with job 4e15's timer arm, so the two changes are measured together and
separately.**

| Arm | Ruleset | Timers | Late game |
|---|---|---|---|
| C | `eco-3` (same-day control) | 6 + 3 × level | — |
| T | `eco-4` (job 4e15; plus its no-killer bounty if ruled) | 10 + 5 × level | — |
| L | `eco-3-late` | 6 + 3 × level | items + levels (or levels only, §9 D1) |
| TL | `eco-4-late` | 10 + 5 × level | items + levels |

**Basis:**
- the Jam stack: `pvp-1`, `simultaneous-1`, `final-chorus-1`, and the house tiers as merged,
  including #71's hard;
- the sample entrant;
- Jev with the TypeSafe default and Workers AI fallback, cadence 2 s;
- run sequentially, one batch per tool call.

**Matches:**
- each arm plays the entrant against hard and against medium, both sides, 6 seeds: 24 per arm, **96 in
  all**;
- a **guard block** of medium vs hard, both sides, 6 seeds, on T, L and TL: 12 each, **36**;
- **total 132 matches, about $13.20 at $0.10 a match.**

Job 4e15's own plan (C and T plus a guard on T) is 60 of these, about $6. The late-game arms add 72
matches, about $7.20. Measuring levels-only *and* items as separate arms adds 36 more, about $3.60.

**Wall clock:** Jam-shape matches have taken 15 s–2.6 min, so this is about 2–4 h.

**Pre-registered lines** (L vs C and TL vs T, read per opponent):

| # | Line | Pass | Paper prediction |
|---|---|---|---|
| 1 | Defenders' median unspent gold at the end, vs the entrant | ≤ 400 (from 890–1,320) | 130–360 |
| 2 | Defenders' XP still short of the cap at 8:00 (median) | > 0 | yes |
| 3 | Share of defenders at level 8 at the end | ≤ 50 % | 7–40 % |
| 4 | Medium's structure damage a match, vs the entrant | up | +154 to +322 |
| 5 | The entrant's decided-win share vs medium | down | 8/15 → 5/15 |
| 6 | The entrant's decided-win share vs hard | **no change expected**; read as a direction only | 13/15 → 12/15 |
| 7 | Guard: hard still beats medium (house order) | holds on L and TL | holds |
| 8 | Guard: economy §6.2's no-runaway lines (`absGoldDiffAt6` ≤ 0.25; comeback ≥ 20 % of decided) | hold | no change on paper |
| 9 | Draw rate | not above the timer-matched control + 10 pp | unchanged on L |

**Power.** 12 matches per pairing per arm detect only large effects (lines 5–6). These are a
direction check, not proof. Doubling to 12 seeds doubles the cost to about $26.

**A $0 check before any of this.** Once the late game is built, replay the 158 logs' decisions under
`eco-3-late`, plus `--verify` on fresh logs. This shows the shop, recipes and levels run
deterministically and an old log still replays byte-identical. Positions diverge, so it isn't
evidence about play.

---

## 7. What changes where

### 7.1 Ruleset file and versioning

- **New fields:** `tier` (1/2/3) and `from` (component keys) on items, `abbr` for the HUD (§7.5),
  and, in the full version, `regenPerSec` as a mod.
  - An item without `from` is tier 1, so every existing ruleset parses unchanged.
  - `cost` stays "what you pay at this step". A derived `totalCost` is used for `netWorth`
    (`economy.ts:290-292`), which today sums `cost` and would undercount a recipe. That only
    matters if `lossOfNetWorth` ever moves off 0.
- **Names** follow the economy's rule, "a changed number is a new name":
  - `eco-3-late`: eco-3 plus items and levels;
  - `eco-4-late`: job 4e15's `eco-4` plus items and levels;
  - `eco-3-lv8` / `eco-4-lv8`: the levels-only versions.
  Whatever ships gets one name, and the measured arms keep theirs.
- **Old logs replay byte-identical.** A log records its whole ruleset and each bot's plan
  (`LogEconomy`, `economy.ts:125-130`), and eco-1/2/3 have no `from`, so no new path runs for them.
  `eco-3.json` itself isn't touched: `test_economy.mjs:528-539` pins it as eco-2 with only gold
  changed.
- **`tools/evolve`:** the cache key already includes the economy name (`generation.mjs:147-148`).
  Campaign 2 keeps its pinned ruleset.

### 7.2 Engine (`src/economy.ts`)

| Where | Change |
|---|---|
| `ItemDef`, `EconomyRuleset` (:45-95) | `tier`, `from`, `abbr`; `regenPerSec` in the mods (full) |
| `resolveBuild` (:146-153) | §2.5's expansion and slot walk, replacing "dedupe, cut to slots" |
| `nextIndex`, `nextItem`, `shopFor` (:507-534) | A recipe step is buyable when every `from` is held and gold covers `cost`. It removes the components and adds the item in the first component's place. A tier-1 step needs a free slot. Never skip a step. |
| `netWorth` (:290-292) | sum `totalCost` |
| step 7 of `afterTick` (:422-433) | regeneration (full only), right after lifesteal |
| `observe` (:568-602) | `nextItem` gains `tier` and `from`; `shop` entries gain `tier` and `from`; everything else unchanged |
| `checkpoint` (:607-609) | unchanged: `items.join('+')` already carries any key |

### 7.3 What entrants see and can write

**Observation** (raw JSON, as chat pilots see it through `promptPilot.ts:40`):

```jsonc
"self": {
  "items": ["backline", "metronome"], "slotsFree": 1,      // a tier-2 item takes one slot
  "nextItem": { "item": "amp", "cost": 350, "tier": 1 },
  // later: { "item": "wall-of-sound", "cost": 400, "tier": 3, "from": ["backline"] }
  "level": 6, "xp": 760, "xpToNext": 100                   // null only at level 8
},
"shop": [ { "item": "backline", "cost": 250, "tier": 2, "from": ["road-case", "bass-strings"] }, … ]
```

**Jev's description** (`fidelity_harness.py` `_economy_self_sentences`, :118-168):
- *Items:* "Items: Backline (tier 2, made from Road Case and Bass Strings), Metronome (1 of 3 slots
  free)." Today it's "Items: … (N of M slots free)", and that formula still holds.
- *Next:* "Next on its shopping list: Wall of Sound, an upgrade of its Backline, 400 gold — it cannot
  afford it yet." Or: "Backline, combining its Road Case and Bass Strings, 250 gold — it can afford it
  now." The "can afford" clause is unchanged, so **"if I can afford my next upgrade" needs no new
  vocabulary.**
- *Allies and enemies:* items by name, with their tier ("Enemy bb-5 (level 7, items: Arpeggiator
  (tier 3)) is worth 410 gold if killed.").
- *Level:* already generic. "(the highest level)" comes from `xpToNext` being null, so level 8
  needs no change.

**Prose → schema** (these go into the translator tests and the entrants README):

| Prose | Compiles to |
|---|---|
| "Build toward Wall of Sound first, then Arpeggiator." | `build: [wall-of-sound, arpeggiator]`, which expands to Road Case → Bass Strings → Backline → Wall of Sound → Metronome → Amp → Click Track → Arpeggiator |
| "Buy Amp, Bass Strings, Road Case, then combine into Fuzz Pedal." | `build: [amp, bass-strings, road-case, fuzz-pedal]` (explicit steps, kept as written) |
| "When I can afford my next upgrade and no enemy is near, go home and buy it." | rule: *can it afford the next item on its list, and no enemy bearbot is visible?* → `recall` |
| "Once I have a tier-3 item, push towers with the wave." | rule: *it owns a tier-3 item and allied minions are near?* → `attack nearest_tower` |
| "Go after the enemy with the best items." | **not a target.** `highest_bounty_enemy` follows carried gold, not items. The condition is expressible (the description lists enemy items), but a selector is [`vocabulary-spec.md`](vocabulary-spec.md)'s business. |

**One recompile, not two.** The items block in the translator prompt and the description lines are
both compiler inputs. Changing them recompiles every entry (`vocabulary-spec.md` §6.2). If items
land before the Jam, they must land **in the same Mon 10-05 merge window as vocab-2**, so there is
one recompile and one announcement. Levels only changes neither, so it causes no recompile.

### 7.4 Translator, validator, schema server, qwen

- **Prerequisite bug fix.** `tools/jev/economy_rules.py:25` reads **`eco-2.json`**, not the shipped
  ruleset. It is harmless today because eco-2 and eco-3 have the same items, and its own comment
  (:22-24) says so. Under any item change it would describe and validate the wrong item set. Point
  it at the ruleset being compiled for: a `--economy` name, defaulting to `DEFAULT_ECONOMY`'s. Add
  it to the compiler hash, as `vocabulary-spec.md` §5.2 already proposes.
- **Validator** (`normalize_build`): accept keys of any tier and apply §2.5's expansion and slot walk.
  Notes in the transparency report:
  - "Wall of Sound needs Backline, made from Road Case and Bass Strings: added both";
  - "Metronome dropped: no free slot — combine two items first";
  - the 10-step cut.
  The repeat rule becomes "you can't hold two of the same item at once", not "an item can only be
  bought once".
- **Translator prompt** (`translator.py:265-268`): the items block groups items by tier, with one
  "made from" line each, generated from the ruleset as now. The instruction becomes: "emit `build`
  as the items in the order the prose wants them, any tier; parts are filled in for you".
- **Wire format** (`compile.py`): `build` is still a list of item keys, so `FORMAT_VERSION` stays 2.
  The compiled `build` is what was declared, and expansion happens at match start, so a schema
  compiled under eco-3 still plays (its keys are all tier 1).
- **Jev schema server** (`schema_server.py`): no decision change. `build` is loaded but never used for
  decisions. The new description sentences come from `fidelity_harness.py`.
- **qwen:** there is no qwen-specific item rendering. The only route is the translator prompt above,
  when `compile.py --backend ollama` uses qwen3.5:9b. Chat-model pilots see the raw observation
  fields.
- **Transparency** (`transparency.py:331-336`): "Shopping list: Road Case → Bass Strings → **Backline**
  → … (from your prose; parts filled in)".

### 7.5 Viewer and HUD

- `src/render.ts:731-733` shows `L{level} {gold}g` plus each item's first initial. Backline, Bass
  Strings and Click Track all start with B or C, and a tier-3 item deserves to read differently.
- Add an `abbr` per item in the ruleset (two letters: `Bk`, `Wa`, `Ct`, `Ar`, …). Show tier as weight:
  tier 1 plain, tier 2 bold, tier 3 bold and in the team colour.
- Levels up to 8 need no change.

### 7.6 Replay, metrics, house, entrants

- **Replay:** the log's ruleset and plan drive everything. Tests:
  - every checked-in eco log replays byte-identical;
  - an `eco-3-late` match replays OK under `--verify`;
  - expansion is deterministic, with a shared fixture run by both the TS and Python tests.
- **Metrics** (`tools/match/metrics.ts`):
  - `itemsAtEnd` (:807) counts items, which now undercounts a tier-2 item;
  - add `itemValueAtEnd` (sum of `totalCost`), `unspentAtEnd`, `tier2At`, `tier3At` and
    `levelAt480`. These read §6's lines 1–3.
- **House:** the ladders of §2.5, and a recompile of `house-*-eco.schemas.json`. The recompile is a
  translator run, so it is a model call at build time. Then a tier check on Jev, about $3–4 as in
  PR #71.
- **Entrants** (`jamobair-entrants`):
  - the economy table in the README is generated from the ruleset and gains the recipe tree;
  - the template's shopping-list blank reads "items or upgrades, in order; parts are filled in";
  - the compile preview shows the expanded plan;
  - bump the `PROMPTLANE_REF` pin.

---

## 8. Timing against the Jam

**Fixed dates:**
- the economy go/no-go is **Sun 10-04** at end of day;
- entrant-facing changes land by **Mon 10-05**;
- sign-ups close **Tue 10-06**;
- numbers freeze **Thu 10-08**;
- the training cutoff is **Fri 10-16 00:00 CT**, and the Jam is **Fri 10-16**.

**Competing for the same window:** vocabulary stage A (about 9 h, by Mon 10-05) and the economy gate
itself.

### 8.1 The full version: after the Jam

- **Scope:** 4 recipes, 4 upgrades (regeneration included), 8 levels, and everything in §7.
- **Effort:**
  - engine: 6–8 h;
  - Python (translator, validator, description, transparency): 5–7 h;
  - HUD and metrics: 2–3 h;
  - house ladders and recompile: 2 h;
  - entrants README and docs: 2 h.
  That is **18–22 h of agent work**, plus about **$13** and 2–4 h of matches for §6, plus about $3–4
  for the house tier check.
- **Against the dates:**
  - It can't be built, measured and announced by Mon 10-05 alongside stage A.
  - The earliest honest landing is Wed 10-07 to Thu 10-08. That is after sign-ups close, with
    entrants already writing against "3 slots, 4 items", and right at the freeze, with no slack for
    a tuning pass.
  - The economy spec's rule is that entrants see the rules they write against (`economy-spec.md:46`).
- **Recommendation: after the Jam,** measured by §6 first.

### 8.2 Jam-sized options

| | (a) **Levels only** *(recommended for the Jam)* | (b) Levels + one recipe and one upgrade per instrument |
|---|---|---|
| What | `eco-3-lv8` or `eco-4-lv8`: eco-3's file with thresholds `[0, 80, 200, 360, 560, 710, 860, 1010]` | (a) plus Backline, Click Track, Fuzz Pedal, Wall of Sound, Arpeggiator and Feedback. **All six use existing stat paths; no new mod.** |
| Code | **none.** The level cap is the thresholds' length (`economy.ts:82-83, 406, 573`). Add the registry line, update 2–3 test pins that say "level 5 (the highest level)" (`test_fidelity_harness.py:260-266`, `test_economy.mjs:347-357`), and change the README's level table. | §7 minus regeneration: engine recipes and expansion, the Python mirror, description, prompt, transparency, HUD, metrics, house ladders |
| Effort | 1–2 h | 12–15 h + about $13 to measure + about $3–4 for the house tier check |
| Recompile | **none** (no translator input changes) | every entry, once: **must share vocab-2's Mon 10-05 window** |
| Dates | Rule by the Sun 10-04 gate. Merge with the gate's ruleset (folded into whatever `eco-4` is ruled). It can be measured inside §6, or alone at 60 matches (about $6). | Rule by **Sat 10-03 noon**. Build Sat–Sun in parallel with stage A; both touch `translator.py` and `fidelity_harness.py`, so whichever merges second rebases. Measure Mon 10-05, announce Mon 10-05, freeze Thu 10-08. |
| Risk | low | **medium-high:** two compiler changes in one window, and the measurement and the announcement on the same day |
| What it fixes | XP keeps mattering to the end for the rich side | gold and XP both keep mattering; on paper the same as the full version (§4, §5.2) |
| What it doesn't | **gold:** defenders still end with 890–1,320 they can't spend | Tour Bus and Headliner, and the full ladder for violin |

**On the 2026-09-30 ruling.** (a) is within "minimal economy before the jam": it is a constants
change on the economy already built. (b) grows the economy before the Jam, and (b) and the full
version both need her to override that ruling explicitly. **The recommendation:**
1. (a) for the Jam, decided at the Sun 10-04 gate together with eco-4's timers.
2. The house push-while-they-respawn rule (`vocabulary-spec.md` D3), as the lever that actually
   decides the dive (§5.3).
3. The full ladder after the Jam, measured by §6.

---

## 9. Decisions for Ceryce

| # | Decision | Recommendation | Cost if yes |
|---|---|---|---|
| D1 | **Which version ships for the Jam?** (a) levels only, (b) levels + one recipe and one upgrade per instrument, (c) the full ladder, (d) nothing before the Jam | **(a)**, folded into the gate's ruleset; (b) only with an explicit override of the 09-30 ruling by **Sat 10-03 noon** | (a) 1–2 h, $0 to build; (b) 12–15 h + about $16; (c) doesn't fit before sign-ups (§8.1) |
| D2 | Item strength: **strong** (§2.2; tier 2 = parts + 15 points, tier-3 passives as listed) or **lean** (tier 2 = its parts + 5; smaller passives) | **strong.** Lean absorbs the gold but buys almost no power (DPS ×1.04–1.10 at 8:00). Neither moves house vs house on paper. | — |
| D3 | Level curve: **8 levels, flat 150 XP past 5** or 7 levels on eco-3's +40 steps | **8 / flat 150.** The cap lands in the last 1.5 min for the top quarter, and a kill stays 40 % of a level. | — |
| D4 | Respawn past level 5: keep `base + per × level` linear (L8 = 30 s on eco-3, 50 s on eco-4), or stop it growing past 5 | **linear.** Data only, it rarely fires, and killing the rich bot pays. | the knob: 2 lines + a ruleset field |
| D5 | Damage reduction: toughness (max hp) as the stand-in, or real damage reduction | **toughness** for anything before the Jam. Real damage reduction is not "really simple" (§2.4). | real damage reduction: about 25 lines, state, ordering with `resolution.ts` |
| D6 | Measurement: §6's 2 × 2 with eco-4's timers, 132 matches | **yes, about $13.** If D1 = (a), L is the levels-only ruleset and the cost is the same. | about $13 (about $26 at 12 seeds) |
| D7 | Recipe and upgrade costs | **250 / 400**: tier 3 lands with the Final Chorus (8–9 min) | — |
| D8 | Item names (economy-spec Q13 is still open) | Backline, Click Track, Fuzz Pedal, Tour Bus; Wall of Sound, Arpeggiator, Feedback, Headliner | — |

---

## 10. Reproducing the analysis

Everything is in `C:\Users\willa\workspace\scratch\late-game-spec\` (outside git; $0):
- `ledgerprobe.ts` / `.mjs` and `run-probe.sh`: replay all 158 logs on `develop` and sample each bot
  once a second. All 158 replay OK.
- `s1.py`: per-side income, XP, caps and surplus (`s1.out`).
- `ladder.py` and `s2.py`: the item and level proposal and the behaviour-fixed shop simulation, with
  the eco-3 validation (`s2.out`; cost variants in `s2-costs.out`). `s2b.py` gives level-reach shares
  (`s2b.out`).
- `s3.py`: the dive re-score for every arm, lean and strong, with the identity and eco-4 checks
  (`s3.out`). `s4.py` gives defender multipliers and the dive's damage mix (`s4.out`).
- Inputs: the logs and job 4e15's per-death probe output, in `C:\Users\willa\workspace\scratch\dive-trade\`.

---

## 11. As built: `eco-3-late`

**What it is.** `src/economy/eco-3-late.json` is eco-3's gold, respawn and tier-1 items plus §2.2's
eight items and §3.1's curve. `eco-3.json` and every other ruleset file are byte-identical to before.
It runs only when a match names it (`--economy eco-3-late`), and `DEFAULT_ECONOMY` is unchanged.

**§9, as built.** Each decision took the recommendation, and each is one ruleset edit to overrule:

| # | Built as |
|---|---|
| D2 | **strong** numbers (§2.2) |
| D3 | 8 levels, flat 150 XP past level 5 |
| D4 | respawn stays linear: level 8 waits 30 s on eco-3's timers. There is no `maxLevel` knob. |
| D5 | toughness (max hp +80 %) as the damage-reduction stand-in |
| D7 | recipe 250, upgrade 400 |
| D8 | Backline, Click Track, Fuzz Pedal, Tour Bus; Wall of Sound, Arpeggiator, Feedback, Headliner |

D1 (which version ships) and D6 (the Jev measurement) are hers. The build is the full version, so
`eco-3-lv8` and the per-instrument variant are not separate files. Either is a copy of
`eco-3-late.json` with items removed.

**Where the code is.**
- **Engine** (`src/economy.ts`):
  - `expandBuild` is §2.5 (a `shop.planSteps` field holds the 10-step cut). `hasRecipes` gates
    every new path, so a ruleset without recipes runs the old code.
  - The recipe-aware shop is `nextIndex` / `shopFor`.
  - `regenPerSec` is step 7, after lifesteal.
  - `totalCost` feeds `netWorth`.
  - `ShopEntry` carries `tier` and `from` only under recipes.
- **Python mirror:** `tools/jev/economy_rules.py` (`expand_build`, `normalize_build`).
  - It now reads the ruleset it is compiling for (`--economy`, default `eco-3`), not `eco-2.json`.
  - Both mirrors run the same cases, `tools/match/build_expansion_cases.json`.
- **HUD:** `src/render.ts` draws each `abbr`, with tier as weight.
- **Metrics:** `itemValueAtEnd`, `unspentAtEnd`, `tier2At`, `tier3At` and `levelAt480` are in
  `tools/match/metrics.ts`.

**Found while building** (each needs her call; nothing below is changed):
- **A declared list is taken as written.** Every compiled schema in the repo, house and sample
  entrant alike, declares three tier-1 items. Under `eco-3-late` those bots buy exactly those three
  and never a recipe. Only a bot that declares nothing gets the default ladder. So the gold sink
  reaches the house only after §7.6's ladders and recompile, and an entrant only once their prose
  names more.
- **"Append the default ladder" (§2.5 house builds) falls short for hard drums and all of easy.**
  Their first three items aren't the instrument default. The appended ladder then tries a fourth
  tier-1 item before combining, so that item is dropped and the second recipe with it. For example,
  hard drums ends Road Case → Bass Strings → Amp → Backline → Wall of Sound. The house prose should
  name §4's ladder explicitly instead: first three, first recipe, the fourth item, its upgrade, the
  second recipe and its upgrade.
- **Passives stack across two tier-3 items.** `[feedback, wall-of-sound]` is a legal plan, and it
  heals 110 % of the PvP damage dealt. Click Track plus Tour Bus cuts ability cooldowns by 70 %.
  Nothing caps either.
- **The arena compiles for the default ruleset.** `tools/arena/compile.mjs` passes no `--economy`,
  so a tournament switched to `eco-3-late` would drop recipe names from shopping lists as unknown.
  Switching it on means passing the tournament's economy there and in the compile cache key.
- **`economy_rules.py` is not in the arena's `COMPILER_FILES`.** It wasn't before this change either.
  Under the default ruleset its output is byte-identical, so no recompile is due. Adding it to the
  hash is vocabulary-spec §5.2's job.

**The paper analysis, re-run on the built code** ($0; recorded decisions only, no model). The tools
are in `C:\Users\willa\workspace\scratch\late-game-build\analysis\`.
- **Identity.** All 160 economy logs in the dive-trade set replay checkpoint-identical. The spec
  counted 158.
- **The rules match the paper.** The built `eco-3-late.json` equals `ladder.py`'s strong items,
  250 / 400 and the flat-150 curve. Every bot's §4 ladder passes through the built `expandBuild`
  unchanged.
- **Method.** Each log's decisions are replayed open-loop on the real engine under two arms:
  - **shipped:** each bot's declared list, as a new `eco-3-late` match would use it;
  - **ladder:** §4's ladders.

  Unlike §4, income and deaths are re-simulated, so a stronger defender's extra kills count. Unlike a
  live match, decisions are replayed rather than re-made.
- **Defenders vs the entrant, ladder arm** (median per bot). The §4 figure is in brackets.

  | | built (§4) |
  |---|---|
  | Unspent gold at the end | 183–271 (127–355) |
  | Tier 2 lands | 4:34–5:52 (4:33–6:01) |
  | Tier 3 lands | 8:41–9:41 where the median reaches it (8:06–8:51) |
  | Tier-2+ items held at the end | 1.20–1.42 (1.22–1.47) |
  | Level at the end | 6–7 (6–7) |
  | Share at level 8 | 7–31 % (7–40 %) |

  Entrant bots and house vs house are unchanged within noise.
- **Shipped arm.** Levels only, in effect: rich defenders still end with 732–1,297 unspent. That is
  the first finding above.
- **Results with the entrant** (§5.2's late-game column in brackets):

  | Condition | built |
  |---|---|
  | C1 vs hard-old | entrant 12, draw 3 (same) |
  | C1 vs medium | entrant 3, medium 8, draw 4 (5 / 9 / 1) |
  | HH vs hard-new | entrant 4, draw 2 (entrant 6) |
  | C0 vs hard-old | entrant 6, draw 9 (7 / 8) |
  | C0 vs medium | entrant 1, medium 3, draw 11 (medium 2, draw 13) |

  House vs house: none of the 94 results change, in either arm.
- **Verdict: the paper numbers held.** The direction and size match §4 and §5.2. The built code is a
  little harsher on the entrant than the re-score was, because a defender's extra kills now feed
  back. It is a replay of fixed decisions, so it is still no evidence about adapted play (§6).
