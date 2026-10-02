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
(`580355b`, spec §8.7). The Noul docs' advice is behind it too: a two-part question is judged worse
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

- **A (done, `580355b`):** the siege summary line (spec §8.7).
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

*Written after the run.*
