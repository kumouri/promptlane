# The siege fact, and medium as a real placement bar — 2026-10-02

**Question.** Ceryce, 2026-10-02 15:20 CT, answering PR #88's three open calls: "Add it." / "Do it." /
"Do it."
- **A.** Give vocab-2 a stated siege fact, so Jev reads it instead of inferring it.
- **B.** Move medium (the placement bar) to #88-style vocab-2 prose, so medium is a real bar.
- **C.** Teach the three habits that decided #88 in the entrants template. That is a separate PR in
  `kumouri/jamobair-entrants`.

**Budget:** a Jev **hard stop of $2.50** for the whole job. Everything that can be done at $0 is done
first. Paid Jev runs only on the blocks in §1.4, and that plan is committed before the first paid call.

**Out of bounds:**
- `src/sim`;
- vocab-1, which stays byte for byte;
- easy's prose and schemas: the shopping sentence is the clause-coverage job's, `fix/vocab2-clause-coverage`;
- hard's prose and schemas;
- the translator guards: `fix/vocab2-clause-coverage` and `fix/vocab2-identity-rules-and-null-action`;
- the live arena and its backend (`:8790`, `:8797`).

## Verdict

*Written after the run. §0 and §1 were committed (`cc88a8a`, 15:48 CT) before any medium compile was
read and before the first paid call (about 15:50 CT).*

- **A, the siege line: done, and kept.** Lines R1, R2 and T1 PASS.
  - **Jev wasn't under-answering.** On #88's own logs it already answered the siege question to match
    the stated fact (§0.1). #88's "a fifth as often" was its stand-in misreading the question.
  - **With the line,** the siege answer matched the fact on all 358 re-asked states where it holds
    (352 without it) and all 600 where it doesn't. In every live match after it, it matched on 100 %
    of decisions, for every side.
  - **Nothing else moved:** the fired rule agreed with the old description's re-ask on 98.8–99.7 % of
    states, within Jev's own re-ask noise.
  - **The entrant's tower damage is unchanged:** 916 a match against #88's 910 on the same seeds. All
    four matches ended on #88's ticks, and three gave the entrant #88's exact numbers.
- **B, medium on vocab-2 prose: half done.** L1, L2 PASS; **L3 FAIL**.

| | old medium (#88, Jev) | new medium (Jev) |
|---|---|---|
| medium vs easy | 0 of 2 decided | **medium 4–0** |
| hard vs medium | hard 6–0 | **hard 3–1** |
| sample entrant vs medium | entrant 5–1 | **entrant 4–0** |
| medium's weakest tower, hp lost by 7:59 (vs entrant / vs hard) | 388 / 308 | **130 / 105** |
| medium's pressure on the entrant's weakest tower by 7:59 | 306 | 114 |

  - The ladder now orders **easy < medium < hard** on Jev.
  - **Medium is not yet a bar a plain entrant has to beat.** The siege entrant won all four, every one
    in sudden death, at 8:54–9:11. Before 8:00 the two were level (130 against 114 hp off the weakest
    tower).
  - **After 8:00 the entrant spent 31 % of its time on the 480 s tower rule, and medium 19 %.**
    Medium's idle rule is "wait for the wave at your own tower" (10 % of its time). That keeps it out
    of sight of the enemy towers the rush needs to see. That is a reading, not a test (§2.3).
- **C, the entrants template: done**, kumouri/jamobair-entrants#12 (docs only).
- **Spend: $2.102** of the $2.50 stop, by the two servers' ledgers: 26,521 requests, 0 errors, and 5
  calls failed over to Workers AI. Every compile, the stand-in and the smokes were free.
- **What Ceryce may want to decide** (§3): whether this medium ships as the bar (it orders the ladder
  but sits below the plain entrant), or medium's idle rule changes to "push down your lane". That
  would cost another small Jev block.
- **§4, the follow-up she queued ("Yes and queue."): medium's idle sentence now pushes the lane.**
  - The recompile is clean, and every sentence maps to its rule.
  - On Jev, medium beat the siege entrant 4–0 (M1 PASS) and easy 2–0 (M3 PASS).
  - **It also beat hard 2–0 (M2 FAIL)**, so medium now sits at or above hard.
  - $0.9858 of a $1.25 stop.
  - Keep it, revert to §2's medium, or retune hard: §4.4.

## 0. Diagnosis, at $0

### 0.1 Jev already answers the siege question right

The siege question is "is this bot inside an enemy tower's range AND does that tower have this bot's
own minions in its range?" Below, it is checked on every decision of #88's 20 Jev logs against the
fact the vocab-2 description states. The decisions come from the logs replayed with #88's probe, and
the fact from `vocab.TowerFact` (now `shooting_my_minions`).

| side | decisions | the fact holds | Jev said yes | P(yes \| holds) | P(yes \| doesn't) |
|---|---:|---:|---:|---:|---:|
| entrant3 | 8,849 | 2.79 % | 2.79 % | **100 %** (247 of 247) | **0.00 %** |
| hard | 4,445 | 2.50 % | 2.41 % | **95.5 %** (106 of 111) | **0.02 %** |

"Will an enemy tower shoot this bot" agrees with its fact on 100 % of decisions on both sides.

**So #88's "a fifth as often as the fact holds" was the stand-in's error, not Jev's.** #88's §2.2 said
the description states the siege on 10–13 % of decisions. That number was the stand-in's yes-rate, and
the stand-in's yes-rate was "inside an enemy tower's range" alone. Its pattern for the second half
(`tower has (my|this bot's|its) minions`) never matched the compiled wording, "does that tower *have*
this bot's *own* minions". Of the 1,641 decisions where it said yes, 0 differ from "in range"
(entrant3 drums 406 = 406, keytar 367 = 367, violin 383 = 383, and so on). It also ANDed "in range of
any enemy tower" with "any listed enemy tower has my minions", which can be two different towers.
- The scratch stand-in now has one atom for the whole question, judged per tower
  (`shooting_my_minions`). It agrees with the fact on every instrument.
- It was refitted on #88's Jev answers. Fired-rule agreement with Jev: easy 99.8 %, hard 95.0 %,
  medium 91.2 %, entrant3 89.7 %.
- #88's rankings don't move. In its cascades the siege rule sits under "the tower will shoot me", so
  "in range, and it won't shoot me" was already nearly the siege. Only the yes-rate comparison was
  wrong.

**What this means for A.** The siege holds on only ~2.8 % of decisions, and Jev already reads it. So a
summary line can't raise Jev's accuracy on it. Ceryce's call stands ("Add it."), so the line is added
(`580355b`, spec §8.8). The Noul docs' advice is behind it too: a two-part question is judged worse
than one stated fact. It gets a pre-registered guard (§1.4, block R): if it costs accuracy on the
siege question or moves any other decision, it is reverted.

**Why the siege rule still landed 48 % of the entrant's structure damage:** the rule is rare but
decisive. The way to make it fire more is play: walking into range with the wave. Vocabulary can't
do that.

### 0.2 Medium candidates on the stand-in

Six hand-written vocab-2 cascades, each with the wordings #88's compiles use, so the fitted noise
applies. They played easy (the current eco), hard (the current eco) and `sample-entrant-siege`
("entrant3"), both sides each. Old medium ("medium") played the same opponents for reference. Screens
1 and 2 played seeds 1–3, then 4–9 for the three that survived; screens 3–4 played seeds 1–9.

All the candidates share:
- the low-hp pair (below half: walk home with an enemy in sight, recall with none);
- the shop pair (with no enemy bearbot in sight but a minion or tower: walk home; with no enemy in
  sight: recall);
- the 480 s tower rush, "an enemy tower will shoot me → my own tower", and the siege rule;
- the ability rule; fight the nearest enemy bearbot, then the nearest enemy minion; walk with the wave.

They differ in:

| candidate | what differs | vs easy (W–L) | vs entrant3 (medium's W–L) | vs hard (medium's W–L) |
|---|---|---|---|---|
| old medium (#88 C/A on Jev) | vocab-1 worksheet cascade | 0–0, draws | 1–5 | 0–6 |
| MA | push down the lane when idle | 17–0 | 10–8 | 7–11 |
| MB | MA + the Bandstand right after the low-hp pair (old medium's spot) | 18–0 | 14–4 | 6–12 |
| MC | MA without the 480 s rush (seeds 1–3 only) | 6–0 | 4–2 | 2–3 |
| ME | MB with the rush under the tower-fire retreat (seeds 1–3 only) | 3–0, 3 draws | 2–4 | 1–5 |
| MG | MB, waiting at its own front tower (seeds 1–3 only) | 5–0 | 4–2 | 3–3 |
| **MF** | **MA, waiting at its own front tower when idle** | **17–0** | **9–9** | **1–17** |
| MF2 | MF, but keytar finishes kills like the others | 16–0 | 4–14 | 5–13 |
| MF3 | MF, but every instrument casts on any bearbot in sight | 12–0, 6 draws | 8–10 | 6–12 |

- **MF is the only candidate that orders the ladder with room on both sides.** It beat easy every
  decided match, hard beat it 17–1, and against the plain siege entrant it is a coin flip (9–9). That
  makes it a bar: an entrant has to play better than the sample to clear it.
- **MB is a higher bar** (14–4 over the entrant), but hard's margin over it is thin (12–6). The
  stand-in overstates how decisive play is (#88 §0.2), so on Jev that margin could vanish.
- **Keytar's chord on any bearbot in sight matters** (MF against MF2: 9–9 against 4–14). Old medium
  had exactly that rule (its rule 7), so the prose keeps it, scoped to keytar.

## 1. Method (written and committed before any compile is read or any Jev is spent)

### 1.1 What changes

- **A (done, `580355b`):** the siege summary line (spec §8.8).
- **B:** medium moves to prose.
  - `prompts/pilots/house-medium-eco.prose.md` (new) states MF in #88's house style. It is one file
    for both sides, like easy's and hard's.
  - `tools/arena/house.mjs` `HOUSE_TIERS_ECO.medium` points to it. The tier's compile keeps its
    name, `house-medium-eco.schemas.json`, because `HOUSE_TIER_ECO_SCHEMAS` derives it.
  - The old worksheet medium's compile moves to `house-medium-eco-worksheet.schemas.json`, byte for
    byte, beside its `house-eco-{violet,green}.md` pair. It stays only for
    `tools/match/measure_economy.mjs`, so the economy measurement's medium doesn't change under it
    (the same reason #88 kept `sample-entrant-eco`).
  - The plain (no-economy) tiers don't change.
- **C:** the entrants template and README, in their own PR.

### 1.2 How medium's schemas are made ($0)

`compile.py --vocab vocab-2 --economy eco-3-late --backend ollama` is the same translator entrants
use, on the host. There are up to six whole compiles (m1–m6), run until every instrument has a pass.
For each instrument, the first sample that passes all of these is taken, whole (nothing is spliced):

- **(a)** the low-hp pair: move home with an enemy minion, tower or bearbot in sight, then recall with
  none, both "below half";
- **(b)** the shop pair: move home when it can afford the next item, no enemy bearbot is in sight and
  an enemy minion or tower is; recall when it can afford it and no enemy is in sight;
- **(c)** the 480 s rule attacks `nearest_tower`, and comes before (d);
- **(d)** "will an enemy tower shoot this bot" → `own_tower`, before (e);
- **(e)** the siege rule asks "inside an enemy tower's range" and names this bot's own minions, and
  attacks `nearest_tower`;
- **(f)** the ability rule:
  - keytar: ability ready and an enemy bearbot in sight → chord on `nearest_enemy_bearbot`;
  - drums and violin: ability ready and an enemy bearbot under 100 hp → its own primary on
    `lowest_hp_enemy`;
  - no other instrument's ability;
- **(g)** an enemy bearbot → `nearest_enemy_bearbot`, then an enemy minion → `nearest_enemy_minion`,
  after (f);
- **(h)** walking with the wave → `nearby_minion`, never `nearest_ally`, after (g);
- **(i)** the root default (or a catch-all last rule) is `own_front_tower`;
- **(j)** the build is the prose's list, no rule names a shop item, and no rule goes home except (a)
  and (b).

The order checks are (c) < (d) < (e) < (f) < (g) < (h). (a) and (b) may come in either order
(#88's picks put the shop recall first; it fires only with no enemy in sight). If an instrument passes
in no sample, the sample that fails the fewest is used, and that is reported.

### 1.3 Stand-in check of the compiled medium ($0)

The compiled medium plays the fixed stand-in against easy, hard and entrant3 (seeds 1–3, both
sides). This catches a compile that plays nothing like MF. It is not a gate.

### 1.4 The Jev blocks

- **Servers:** two private `tools/jev/schema_server.py` processes, live Jev on TypeSafe:
  - "new" on `:8995`, from this branch, `--budget-usd 2.30`;
  - "base" on `:8996`, from a detached `origin/develop` worktree (`16a8c7a`, no siege line),
    `--budget-usd 0.15`, used by block R only.

  The live arena's `:8790` and `:8797` are not touched.
- **Lines, every match:** `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall
  recall-2 --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`, full
  600 s, as in #88.
- **Stub smoke, free:** `--stub`, 120 s at seed 7, each pairing, before the paid matches.

**Block R: re-asked replays (A).** The states are #88's recorded decisions, from its 20 Jev logs:
- entrant3: every decision where the siege holds (247), plus 300 drawn at random where it doesn't;
- hard: likewise (111 + 300);
- easy: 300 at random. Easy has the "inside an enemy tower's range" question the new line's wording
  is closest to.

The draw uses `random.Random(1)`, about 1,260 states in all. Each state is posted to both servers
with its own schema, the map, `own-lane-1` and `vocab-2`, so the old and the new description are asked
about the same moment. #88's recorded answers are a third reading.
- **R1, the siege fact is read:** under the new description, the siege question, pooled over entrant3
  and hard, has P(yes | holds) ≥ 0.95 and P(yes | doesn't) ≤ 0.01. Baseline (recorded): 0.986 and
  0.0001.
- **R2, nothing else moves:** for each side, the rule that fires under the new description matches
  the one that fires under the base re-ask on ≥ 97 % of states. Reported beside it: the base re-ask
  against the recorded rule, which is Jev's own re-ask noise.
- **If R1 or R2 fails, the line is reverted** before blocks T and L, and the report says so.

**Block T: the entrant's tower damage (A).** entrant3–easy and easy–entrant3, seeds 3 and 7: 4
matches. The baseline is #88's same four matches; Jev was near-deterministic on them.
- **T1, no harm:** entrant3's structure damage a match is at least 80 % of #88's on the same four.
  Reported: towers taken, deaths, and the siege rule's yes-rate against the fact.

**Block L: the ladder (B), after the medium schemas are committed.** 12 matches, 4 at a time, in this
order:

| pairing (violet–green) | seeds | matches | baseline (#88, Jev, old medium) |
|---|---|---:|---|
| entrant3–medium, medium–entrant3 | 3, 7 | 4 | entrant3 5–1 |
| hard–medium, medium–hard | 3, 7 | 4 | hard 6–0 |
| medium–easy, easy–medium | 3, 7 | 4 | 0 of 2 decided |

- **L1, medium above easy:** medium wins at least 2 of 4, and easy wins none.
- **L2, hard above medium:** hard wins at least 2 of 4, and medium wins at most 1.
- **L3, medium is a real bar:** entrant3 wins at most 2 of 4 (it won 5 of 6 against old medium).
- **L4, clean:** every match finishes and replay-verifies, with 0 server errors and 0 parse errors.
- **L5, spend:** at most $2.50 in all, by the two servers' ledgers.

**Order and the spend guard:**
- Blocks run R, then T, then L.
- The runner stops launching once the "new" server's spend plus the mean cost of a finished match ×
  the matches in flight passes **$2.25**, so a cut takes the end of L first.
- Nothing is extended, added or replayed after any result is seen. A match that crashes before it
  finishes is retried once.

**Reported, not lines:**
- end reasons and match length;
- structure damage, deaths, gold spent and unspent, towers taken, per side;
- the most-damaged tower's hp at 7:59;
- medium's time by rule, and how often its siege rule fired against the fact.

Jev is not deterministic (PR #37), and seeds 3 and 7 are not independent samples (#88 §2.4). With four
matches a pairing, a line is a direction, not a rate.

## 2. Result

### 2.1 The run

- **Timeline (CT):**
  - plan committed 15:48:17 (`cc88a8a`);
  - compiles m1–m3 started 15:48:28, read from 15:55;
  - block R about 15:50–15:52;
  - block T 15:52–15:54;
  - medium's schemas committed 16:02:39 (`c8c36ee`);
  - block L 16:03–16:15.
- **Compiles** (§1.2, free):
  - The clause-coverage job was compiling on the same host Ollama. m1's drums call timed out, so m1
    has no drums schema.
  - The picks, each the first sample to pass all ten points: **drums m2, keytar m1, violin m2.**
    m1's violin failed (i): its idle rule asked "is this bot at its own outermost standing tower?",
    and its root default was `push_lane`.
  - m3 was stopped unread once every instrument had a pass.
  - The screen script's first draft rejected "can this *bearbot* afford…" for containing "bearbot".
    That was a bug in the script, not in a compile. It was fixed to the criterion as written ("no
    enemy in sight", not "no enemy bearbot") before any pick was taken.
- **The stand-in check (§1.3)** of the compiled medium (seeds 1–3, both sides) played like MF: easy
  6–0, the entrant 4–2 over it, hard 5–1 over it.
- **Stub smokes:** T's two pairings and L's six, 120 s each, 0 errors.
- **The spend guard cut L early by mistake.** After 8 of L's 12 matches it stopped before medium–easy.
  It estimated a match at $0.20: it divided all spend, including the three matches still running, by
  the finished ones. The plan's guard is the mean of *finished* matches, $1.04 / 8 = $0.13, and
  $1.53 + 4 × $0.13 = $2.05 doesn't pass $2.25. So the four medium–easy matches were run as
  planned. They were launched at 16:12, after the first eight results had been seen; nothing else was
  added.
- **Every paid match finished first time** (no retries). All 16 replay-verify, with 0 parse errors on
  either side.
- **The two servers:** 26,521 requests, 0 errors, 5 failovers to Workers AI. $1.9982 on "new" and
  $0.1038 on "base".

| line | result | pass line | |
|---|---|---|---|
| R1 siege read (new description) | P(yes \| holds) **358/358 = 1.000**; P(yes \| doesn't) **0/600** | ≥ 0.95; ≤ 0.01 | **PASS** |
| R2 nothing else moves | fired rule = base re-ask on **99.7 %** (easy), **99.3 %** (entrant3), **98.8 %** (hard) | ≥ 97 % each | **PASS** |
| T1 the entrant's tower damage | **916** a match, #88's same four: 910 | ≥ 80 % of #88's | **PASS** |
| L1 medium above easy | medium **4–0** | medium ≥ 2, easy 0 | **PASS** |
| L2 hard above medium | hard **3–1** | hard ≥ 2, medium ≤ 1 | **PASS** |
| L3 medium is a real bar | entrant3 **4–0** | entrant3 ≤ 2 | **FAIL** |
| L4 clean | 16 of 16 verify; 0 server errors; 0 parse errors | all | **PASS** |
| L5 spend | **$2.102** | ≤ $2.50 | **PASS** |

### 2.2 The siege line (A)

| reading of the same 1,258 states | entrant3: P(yes \| holds), P(yes \| doesn't) | hard: P(yes \| holds), P(yes \| doesn't) |
|---|---|---|
| recorded in #88 | 247/247, 0/300 | 106/111, 0/300 |
| re-asked, without the line | 247/247, 0/300 | 105/111, 0/300 |
| re-asked, with the line | 247/247, 0/300 | **111/111**, 0/300 |

- **Where the line helps:** hard's keytar siege question (four flips) and drums question (two).
  Keytar's wording is "…this *bearbot's* own minions in its range to shoot first". Without the line
  Jev missed five or six of them; with it, none.
- **Which answers flipped between the two re-asks:** the most was entrant3's catch-all "is there no
  other rule matching?" (37 of 373). Six were hard's siege questions, all toward the fact, and four
  were hard's finish-kill question. Each of the rest flipped once or not at all. Easy's "is this
  bearbot inside an enemy tower's range?" never flipped (0 of 300), and that is the question the new
  line's wording comes closest to.
- **In the live matches after it** (T and L, 18,029 decisions by entrant3, hard and medium, the
  three sides that ask the siege question), the siege answer matched the fact on every decision. So
  did "will an enemy tower shoot this bot". The siege held on 0.9–3.3 % of decisions.
- **Block T replayed #88.** entrant3–easy and easy–entrant3 at seeds 3 and 7 ended on #88's ticks
  (508.35 s and 493.35 s). In three of the four, the entrant's structure damage, deaths, towers and
  result matched #88's to the decimal. In the fourth (entrant3–easy, seed 7) it dealt 951 against
  929.

### 2.3 Medium (B)

| side (block L) | W–L | structure damage a match | deaths a match | gold spent a match (side) | enemy half | towers taken a match |
|---|---|---:|---:|---:|---:|---:|
| medium vs easy | 4–0 | 1,397 | 1.0 | 1,525 | 20.2 % | 1.00 |
| entrant3 vs medium | 4–0 | 1,183 | 2.5 | 1,588 | 20.8 % | 1.00 |
| medium vs entrant3 | 0–4 | 1,044 | 1.2 | 2,275 | 13.0 % | 0 |
| hard vs medium | 3–1 | 997 | 1.5 | 3,162 | 19.8 % | 0.75 |
| medium vs hard | 1–3 | 584 | 3.8 | 1,525 | 18.3 % | 0.25 |

- **Every L match was decided in sudden death.** The first tower fell at 8:08–9:11, a tier-2
  tower every time.
- **The opponent's most-damaged tower, hp lost by 7:59:**

| pressure | #88 (old medium) | now |
|---|---:|---:|
| entrant3 on medium | 388 | 130 |
| medium on entrant3 | 306 | 114 |
| hard on medium | 308 | 105 |
| medium on hard | 419 | 308 |
| medium on easy | 100 (draws) | 568 |

  The new medium is a much harder tower to chip: it is in its lane, at its tower, and it sieges back.
- **Why the entrant still wins.** After 8:00, by share of time:

| | 480 s tower rule | low-hp pair | idle rule |
|---|---:|---:|---:|
| entrant3 | 31 % | 22 % | push down the lane, 6 % |
| medium | 19 % | 24 % | wait at its own tower, 10 % |

  The rush fires only with an enemy tower in sight. Waiting at its own tower, medium doesn't see
  one, so the entrant reaches a tower first. The stand-in had MF 9–9 with the entrant, and MA (the
  same cascade, pushing the lane when idle) 10–8. It ranked MF over MA because hard's margin over MA
  was thinner (11–7). On Jev the idle rule looks like the difference. This is a reading of four
  matches, not a test.
- **The stand-in was wrong about this pairing in the same direction as #88 warned:** it overstates
  how evenly two siege cascades trade, and it had no way to know that Jev's medium would see fewer
  towers after 8:00.

### 2.4 Caveats

- **Four matches a pairing, two seeds.** Seeds 3 and 7 are near-replays on Jev (the medium–easy pairs
  ended on the same tick both times), so L is closer to six distinct matches than twelve.
- **Untested on Jev:** easy vs hard, entrant3 vs hard, and medium with a lane-push idle rule.

## 3. What Ceryce may want to decide

1. **Ship this medium as the bar, or change its idle rule first.**
   - **As it is:** the ladder orders easy < medium < hard on Jev. Medium beat easy 4–0, which old
     medium never did. But the plain siege entrant beats it 4–0, so a sample-quality entrant still
     places above the bar.
   - **Change the idle sentence to "push down your lane toward the enemy base"** (MA). One sentence,
     one recompile, and a 4–8 match Jev block (about $0.50–1.05 at this run's $0.13 a match) to check
     that the entrant no longer clears it and hard still beats it.
   - **Make the new hard the bar.** Hard beat this medium 3–1, but hard vs the siege entrant has
     never been played on Jev.

   Ceryce chose the second ("Yes and queue."): §4.
2. **The siege line is in vocab-2** (spec §8.8). It changes what Jev reads for every vocab-2 schema,
   entrants' included, from the next server restart. On #88's states it changed no decision outside
   noise. Restarting the arena also picks up the new medium: the `house` ledger row records the new
   medium hash (below). Nothing in the arena was touched.
3. **The entrants repo's pin** (`PROMPTLANE_REF`) needs a bump after this merges, so the compile
   preview's translator prompt names the siege fact. That is optional: the description, not the
   pin, is what Jev reads at play.
4. **The clause-coverage job** owns easy's shopping sentence (#88's easy shopping rule). Nothing of
   easy's changed here.

## 4. Follow-up: medium pushes its lane when idle

**Ceryce, 2026-10-02 16:26 CT:** "Yes and queue." That is §3's second option. Medium's idle sentence
becomes "push down your lane". This section's plan (§4.1–§4.3) was committed before any recompile
was read and before the first paid call.

**Budget:** a Jev **hard stop of $1.25** for this follow-up, on its own server's ledger.

**Out of bounds:**
- easy's prose and schemas, which belong to the clause-coverage job;
- hard, the entrants, the translator, and vocab-1/vocab-2;
- the live arena and its backend (`:8790`, `:8797`).

### 4.1 What changes

- **`house-medium-eco.prose.md`, one sentence.** The fallback was "wait for the next wave at your
  own tower: move to the outermost standing tower of your own lane and wait there". It becomes
  "Your fallback, when none of the above applies, is to push down your lane toward the enemy base."
  That is hard-eco's fallback sentence, word for word. It is MA on the stand-in (§0.2).
- **`house-medium-eco.schemas.json`, a whole recompile ($0).** First `origin/develop` is merged in,
  so the compile uses #89's translator guards. The tool and flags are §1.2's: `compile.py --vocab
  vocab-2 --economy eco-3-late --backend ollama`.
  - The compiles are n1, then n2 and n3 only if an instrument has no pass yet.
  - Each instrument is taken whole from the first sample that passes §1.2's ten points. Point (i)
    changes: the root default (or a catch-all last rule) is `push_lane`, and no rule targets
    `own_front_tower`.
  - **If an instrument has no full pass after n3, no Jev is spent.** That is reported instead.
  - The screen's per-clause result for the picks is reported: which rule each prose sentence became.
  - **Amendment, committed after n1–n3 were screened and before any Jev:** the cap goes from n3 to
    §1.2's six compiles (n4–n6). Only keytar can still be picked from them, and nothing else in §4
    changes. n1–n3 gave drums n2 and violin n1 full passes, but no keytar pass. Every keytar sample
    compiled an extra bare "hp below half → walk home" first rule, so its low-hp recall could never
    fire (n3 failed on that alone, (j)). n1 and n2 also dropped the sight clauses from the shopping
    walk (b). Those are real compile failures, not screen bugs. If keytar still has no pass after n6,
    no Jev is spent.
- `tools/arena/test_house.mjs` pins the new sentence and the `push_lane` fallback. The README and
  the house hash row follow it.

### 4.2 The Jev block M

- **One server:** a private `tools/jev/schema_server.py` on live Jev (TypeSafe), started from this
  worktree, with `--budget-usd 1.20`. It refuses calls past that, as a backstop under the $1.25.
  A free `--stub` server on another private port runs the smokes.
- **Lines, every match:** §1.4's flags (`pvp-1`, `simultaneous-1`, `own-lane-1`, `recall-2`,
  `eco-3-late`, `river-2-set10`, cadence 2, `final-chorus-1`), full 600 s. The opponents are the
  committed `house-easy-eco`, `house-hard-eco` and `sample-entrant-siege` ("entrant3") schemas, as
  in block L.
- **Stub smoke, free:** 120 s at seed 7, each of the four pairings, before any paid match.
- **Round 1 (the question), 4 matches, in parallel:** entrant3–medium and medium–entrant3, seeds 3
  and 7. That is block L's first four, against the new medium.
- **Round 2 (the ladder), 4 matches, in parallel, in this order:** hard–medium s3, medium–hard s3,
  medium–easy s3, easy–medium s3. There is one seed per side order, because the budget doesn't
  cover two.
- **Spend guard:** round 2 starts only after round 1 has finished. It takes the mean cost of round
  1's finished matches, m. It launches the first k of round 2's four, where k is the largest number
  with ledger spend + k × m ≤ $1.20. Rounds are sequential, so no match is in flight when the guard
  reads the ledger (§2.1's mis-estimate can't recur).
- Nothing is extended, added or replayed after any result is seen. A match that crashes before it
  finishes is retried once, if the guard allows it.

| line | pass | fail | otherwise |
|---|---|---|---|
| **M1, medium is a real bar** (L3's line) | entrant3 wins at most 2 of 4 | entrant3 wins 3 or 4 | — |
| **M2, hard above medium** | hard wins both, or one with a draw | medium wins both, or one with a draw | INCONCLUSIVE |
| **M3, medium above easy** | medium wins both, or one with a draw | easy wins either | INCONCLUSIVE |
| **M4, clean** | every match finishes and replay-verifies; 0 server errors; 0 parse errors | any of those | — |
| **M5, spend** | at most $1.25 on the ledger | over it | — |

Matches cut by the guard count as not played, and a line short of its matches is INCONCLUSIVE.

**Reported, not lines:** side by side with block L's same seeds:
- winners, end reasons and match length;
- structure damage, deaths and towers taken, per side;
- the opponent's most-damaged tower's hp lost by 7:59;
- medium's time by rule after 8:00, chiefly the 480 s rule and the idle (push) rule.

Two seeds, and one seed for the ladder pairings, give a direction, not a rate (§2.4).

### 4.3 What is decided where

- **If M1–M3 pass,** the push-lane medium is the bar. It ships on #90's branch.
- **If M1 fails,** the push-lane medium still ships on the branch, because the sentence is Ceryce's
  ruling. The write-up says it doesn't hold the bar, and §3's third option (hard as the bar) is
  hers to call.
- **If M2 or M3 fails,** the ladder no longer orders. The write-up says so, and Ceryce decides
  between this medium and §2's.

### 4.4 Result

*Written after the run.*

- **Timeline (CT):**
  - plan committed 16:30:25 (`04585a9`);
  - compiles n1–n3, 16:32–16:37;
  - the amendment (§4.1) was committed after n1–n3 were screened (`fe5d5b1`);
  - keytar n4–n5, 16:38–16:40;
  - schemas committed (`5684a0c`);
  - stub smoke 16:41;
  - round 1, 16:41–16:46;
  - round 2, 16:46–16:51.
  The first paid call came after all of it was committed.
- **The compiles ($0).** Picks: drums n2, keytar n5, violin n1.
  - **Every pick maps the prose one sentence to one rule, in the prose's order:**
    - the low-hp walk and recall;
    - the shopping walk ("no enemy bearbot, an enemy minion or tower in sight") and the shopping
      recall;
    - the 480 s tower rule;
    - out of tower fire → `own_tower`;
    - the siege (this bot's own minions) → `nearest_tower`;
    - the ability (keytar chords any bearbot in sight; drums kick and violin staccato finish under
      100 hp on `lowest_hp_enemy`);
    - bearbot, then minion;
    - the wave → `nearby_minion`;
    - the default `push_lane` (violin also writes it as a last `true` rule).
  - No rule names an item, no rule goes home beyond the four, nothing targets `nearest_ally`, and
    nothing targets `own_front_tower`.
  - **The failures:**
    - drums n1: a bare "hp below half → home" first rule, and the shop walk without its sight
      clauses;
    - keytar n1: the same, plus a "480 s → `push_lane`" rule ahead of the tower rush;
    - keytar n2: a bare low-hp first rule and a bare shop walk;
    - keytar n3: the bare low-hp first rule alone;
    - violin n3: the bare low-hp rule and the bare shop walk;
    - keytar n4: a shop walk without "no enemy bearbot in sight".
- **Spend: $0.9858** of the $1.25 stop, on the server's ledger: 12,050 requests, 0 errors, 0
  failovers. Round 1 cost $0.4833 ($0.121 a match). The guard allowed all four of round 2:
  $0.483 + 4 × $0.121 = $0.97 ≤ $1.20. The smokes were free.
- **Every match finished first time** and replay-verifies, with 0 parse errors on either side.
  Every one was decided in sudden death.

| line | result | pass line | |
|---|---|---|---|
| M1 medium is a real bar | entrant3 **0–4** (medium won all four) | entrant3 ≤ 2 | **PASS** |
| M2 hard above medium | medium **2–0** | hard both, or one and a draw | **FAIL** |
| M3 medium above easy | medium **2–0** | medium both, or one and a draw | **PASS** |
| M4 clean | 8 of 8 verify; 0 server errors; 0 parse errors | all | **PASS** |
| M5 spend | **$0.9858** | ≤ $1.25 | **PASS** |

**Medium now beats the plain siege entrant, but it beats hard too.** The ladder orders easy <
medium, and medium ≥ hard. Here it is beside block L's same slots (entrant3 seeds 3 and 7; hard and
easy seed 3):

| side vs opponent | W–L, §2's medium | W–L, push-lane medium | opponent's weakest tower, hp lost by 7:59 (§2 → §4) | share of decisions after 8:00 on the 480 s rule (§2 → §4) | deaths a match (§2 → §4) |
|---|---|---|---:|---:|---:|
| medium vs entrant3 | 0–4 | **4–0** | 114 → **380** | 25 % → 27 % | 1.2 → 5.0 |
| entrant3 vs medium | 4–0 | **0–4** | 130 → 245 | 31 % → **17 %** | 2.5 → 2.0 |
| medium vs hard | 1–1 | **2–0** | 318 → 201 | 37 % → 30 % | 3.0 → 4.5 |
| hard vs medium | 1–1 | **0–2** | 104 → 244 | 42 % → 17 % | 1.5 → 2.0 |
| medium vs easy | 2–0 | 2–0 | 568 → 480 | 32 % → 29 % | 1.0 → 2.0 |

- **The column's measure differs from §2.3.** "Share after 8:00" here is the share of a side's
  decisions in sudden death (the probe's `rulesSD`), not §2.3's share of alive time. That is why
  §2's entrant reads 31 % / medium 25 % here, against §2.3's 31 % / 19 %. Both runs use the same
  script.
- **What changed is where the fight happens.**
  - Pushing when idle, medium now stands in the enemy's lane at 8:00. It took 380 hp off the
    entrant's weakest tower before sudden death, against 114, and took the first tower every time.
  - The entrant spent half as much of sudden death on its own tower rush (17 % against 31 %),
    because medium's wave and bearbots were in its way.
  - Medium pays for it in deaths (5.0 a match against the entrant, from 1.2), and still wins the
    race.
- **Against hard** the same thing happened. Hard dealt more structure damage than before (907 a
  match) and took no tower. Its 480 s rule fell from 42 % to 17 % of sudden death.
- **Caveats.** One seed for hard and easy, two for the entrant. Seeds 3 and 7 are near-replays on
  Jev (§2.4), so "4–0" is closer to two or three distinct matches than four. M2 is the opposite of
  block L's 3–1 for hard, on 2 matches against 4. That is a direction, not a rate. Untested on Jev:
  this medium at seed 7 against hard, and hard against the entrant.

**What Ceryce may want to decide** (§4.3: M2 failed, so it is hers):
1. **Keep the push-lane medium as the bar** (it's on the branch now, `5684a0c`). A plain siege
   entrant no longer clears it, but neither does the house's hard. Medium would sit at or above
   hard until hard is retuned.
2. **Go back to §2's medium** (`git revert 5684a0c`; its compile is `600602f7…`). The ladder orders,
   and a plain entrant clears the bar 4–0.
3. **Keep this medium and retune hard above it.** Hard-eco already pushes its lane when idle, so the
   gap is elsewhere. Against this medium, hard dealt 907 structure damage a match and took no tower.
   Finding the gap needs its own small Jev check, which this run didn't fund.

## Files

- **A:** `tools/jev/vocab.py` (`TowerFact.shooting_my_minions`, `FACTS_V2`),
  `tools/jev/fidelity_harness.py` (the summary line), `tools/jev/test_vocab.py`,
  `docs/vocabulary-spec.md` §8.8.
- **B:**
  - `prompts/pilots/house-medium-eco.prose.md` (new);
  - `prompts/pilots/house-medium-eco.schemas.json`;
  - `prompts/pilots/house-medium-eco-worksheet.schemas.json` (the old compile, byte for byte);
  - `tools/arena/house.mjs`, `tools/arena/test_house.mjs`;
  - `tools/match/measure_economy.mjs` and its test;
  - `prompts/pilots/README.md`, `docs/economy-spec.md` §4.4 and the closing notes,
    `docs/prompt-evolution-spec.md`.

| file (sha256, as `tools/arena/house.mjs` hashes it) | before | after |
|---|---|---|
| `house-medium-eco.schemas.json` | `91083d42…` (the worksheet medium; now `house-medium-eco-worksheet.schemas.json`) | `600602f7c415354ac8fb5f5355443ed3db4fe3d71c1fbd02c2e0fc405a8e2283` (§2's medium) |
| `house-medium-eco.schemas.json`, §4 | `600602f7…` | **`0df793ddea930264c5057d6a64e1f1649a8412df1dd26453864c7ddaeaad8b6d`** (the push-lane medium) |

- **§4:** `prompts/pilots/house-medium-eco.prose.md` (the idle sentence),
  `prompts/pilots/house-medium-eco.schemas.json`, `tools/arena/test_house.mjs`,
  `prompts/pilots/README.md`. Its logs, compiles n1–n5, scripts and the server's final `/health` are
  `medium-push-2026-10-02-data.zip` on the same prerelease, with `SHA256SUMS` inside.

- **C:** kumouri/jamobair-entrants#12 (`README.md` "Three habits that decide matches", and
  `entrants/_template/pilot.md`).
- **Logs and kit, not in git:** on the
  [`data-siege-fact-medium-bar-2026-10-02`](https://github.com/kumouri/promptlane/releases/tag/data-siege-fact-medium-bar-2026-10-02)
  prerelease as `siege-fact-medium-bar-2026-10-02-data.zip`, with `SHA256SUMS` inside:
  - the 16 paid logs, `runs/siege-fact-medium-bar-2026-10-02-<violet>-<green>-seed<N>.json`, and the
    8 stub smokes;
  - block R's sample and both re-asks (`sample-R.jsonl`, `R-new.jsonl`, `R-base.jsonl`);
  - the compiles m1–m2 and their logs;
  - the scratch kit: #88's stand-in with the siege atom fixed, `sf_*.py` (sample, replay, score,
    screen, assemble) and the runner;
  - every stand-in screen's probe output, the run logs, and both servers' final `/health`.

  To check a log, unzip at the repo root and run `npm run match -- --verify <log>`.
