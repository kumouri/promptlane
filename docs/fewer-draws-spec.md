# Fewer draws within 600 s — diagnosis and candidate mechanisms

Ceryce's ask (Thu 2026-10-01, 11:26 CT): "making the game harder to tie without making it longer;
draws are not exciting". Ruling (12:55 CT): **"Design pass now, no Jev"**.

- **Spend:** $0. No model call of any kind was made: no Jev, no schema server, no Workers AI, no
  Ollama.
- **Constraints kept:** match length stays 600 s; nothing touched the live arena or evolution
  campaign 2.
- **This is a design document.** It changes no sim or rules code. The last section is a
  pre-registered measurement plan for Ceryce to approve or not.

## Verdict

- **Every draw on record is the same draw:** equal towers and both nexuses at 2,200 hp.
  - **No nexus has ever lost a point of hp.** That holds in all 286 logged Jev matches (the economy
    gate, eco-3, side-fairness and Bandstands 1–5).
  - **No minion has ever come within 130 units of a nexus.**
  - So the second tiebreak, nexus hp, has never fired. "Decided" has only ever meant "one team lost
    fewer towers".
- **Draws come from symmetric pressure, not from too little pressure.**
  - When towers fall, they fall on both sides. Six of six A draws under `simultaneous-1` are 5–5,
    as are 11 of 13 B0 draws.
  - So a rule that only makes structures easier to kill does not break ties where towers already
    fall. On Jev's own eco-3 logs, re-scored with behaviour held fixed, ×2/×3 structure damage takes
    towers lost from 0.92 to 1.46 a match. But decided goes **down**, 58 % → 46 %, because the
    trailing side's tower falls too.
  - The same family is **+39 to +46 pp** on the Jam's own stack, where almost no tower falls
    (`own-lane-1`, `recall-2`, Bandstand). The sign depends on the regime.
- **Top pick: the Final Chorus.** The 10-minute match gets a decisive last act:
  1. at 8:00 a team ahead on towers wins on the spot;
  2. if towers are level, the last two minutes are sudden death: structures take ×3 damage, and
     the first tower to fall wins;
  3. if nothing falls, 10:00 ends it on today's tiebreak.

  Nothing is longer: decided matches end between 8:00 and 10:00.
  - **It is the only candidate positive in all five rule configurations simulated:** +33 pp on the
    Jam stack, +26 eco-only, +8 Bandstand-only, +20 and +22 on the logged eco-3 and A configurations,
    every 95 % CI above 0. The full table is [here](#5-the-numbers-every-candidate-in-every-configuration).
  - **Re-scored on Jev's own logs (open loop), it never lowers the decided share in any arm.**
    eco-3 goes 58 → 83 %, eco-2 50 → 79 %, respawn-only 25 → 58 %, Bandstands 3–4 0–25 → 25–100 %.
  - **The comebacks it removes don't exist in the data.** Of 286 matches, 95 had a tower lead at 8:00.
    None was overturned: 78 were held and 17 were equalised into draws.
- **A finer timeout tiebreak cuts draws on paper only.** Total tower hp left would split every
  logged draw except four identical hard-vs-hard mirrors. But it decides matches by a median gap of
  62–467 hp per arm, under half a tower. It makes no game more decisive, and it is treated that way below:
  a complement for the residual draws, not a fix.
- **Measurement plan for the Final Chorus on Jev:** 2 arms × 26 matches on the Jam stack, about
  **$4.70** (approve $5.00, ceiling $7.00). Its [details](#8-pre-registered-measurement-plan-final-chorus)
  are at the end. Not run: this pass had no Jev.
- **Measured on Jev, 2026-10-01, with the sample amended to 62 a side**
  ([`runs/final-chorus-2026-10-01.md`](../runs/final-chorus-2026-10-01.md)). **The primary line
  passes:** decided 18.3 % → 63.3 %, +45.0 pp [+31.7, +58.3], and every keep-line holds.
  - **Against the stand-in:** the total matches it, but the composition doesn't. House hard won no
    decided match on Jev, in either arm, where the sims had hard winning every medium–hard one.

## 1. What was measured, and how

Code: every replay and sim ran on `src/` as it is on `develop` at `2a3bf9f`. That is after #61
(eco-3), #62 (`own-lane-1`) and #63 (`river-2-set10`).

| what | source | n | how |
|---|---|---:|---|
| why matches reach 600 s | the Jev match logs on the `data-economy-gate-2026-10-03`, `data-economy-eco3-2026-10-01`, `data-side-fairness-2026-10-01`, `data-bandstand-{,2-,3-,4-,5-}*` prereleases | 286 matches | each log **replayed tick by tick** (its own decisions; no model), with a probe attached through `src/attribution.ts`: every hp of structure damage by source, every minion's fate, every second of every bearbot, every bearbot-on-tower episode. **All 286 replays verify** (same winner, end reason and tick count as the log) |
| what a mechanism would do with behaviour held fixed ("open loop") | the same 286 replays | 286 | re-score each match's per-tower damage timeline under the rule. Exact for "who leads at 8:00"; conservative otherwise (a tower that dies sooner stops shooting, which isn't credited) |
| what a mechanism would do with the bots reacting ("closed loop") | **free deterministic sims with scripted bots** (below) | 8,120 matches, plus 96 for validation | the real sim and the real rule layers (map, resolution, recall, objective, economy), the house tiers' compiled schemas, and each candidate as an outside-the-sim layer; every sim match is replay-verified through the same probe |

### The scripted bots: a calibrated, model-free stand-in for Jev

The harness has no model-free schema pilot: schema bots ask Jev each decision through
`schema_server.py`. So this pass wrote one, outside the repo:
- **What it is:** an "oracle".
  - It turns each condition in the house tiers' compiled schemas into a deterministic predicate on
    the `Observation`. For example, "hp below 65 % of its max hp", "at least two allied minions
    near", "an enemy tower visible".
  - It walks the cascade first-yes-wins with the root default last, as
    `fidelity_harness.run_prediction` and `translator.evaluate_schema` do.
  - It resolves the winning target with a port of `tools/jev/target_resolve.py` (`own-lane-1` and
    `first-min`).
- **Fidelity, checked against Jev's own answers.** Each logged decision's reply holds Jev's answer
  to every condition. Replaying 60 logs and asking the oracle the same observation:

| logs (60) | decisions | same rule fired | same action (kind, ability, target) |
|---|---:|---:|---:|
| gate A, medium vs hard | 12,460 | 96.4 % | 97.7 % |
| gate A, medium vs sample entrant | 13,349 | 96.6 % | 98.5 % |
| eco-3 B1, medium vs hard | 20,681 | 98.1 % | 98.2 % |
| eco-3 B1, medium vs sample entrant | 20,069 | 94.4 % | 94.7 % |
| Bandstand 5 P2 (all pairings) | 12,984 | 97.5–100 % | 98.4–100 % |
| Bandstand 5 O2 (all pairings) | 10,888 | 94.2–97.5 % | 95.5–97.5 % |
| **all** | **90,431** | **96.7 %** | **97.4 %** |

- **Calibration.** Four conditions were calibrated to how Jev actually reads them:
  - "affordable" with nothing left to buy;
  - "keytar cooldown 0" (Jev reads it as *any* cooldown);
  - "hp below 75 of its max";
  - "the Bandstand opens within 10 s".

  Bare "minions near" was also changed to count either team's minions, as Jev does.
- **Noise.** Jev's remaining disagreement is applied as seeded per-condition noise:
  P(Jev yes | oracle no) and P(Jev no | oracle yes), measured on those 90,431 decisions. Without it
  every seed of a pairing plays the same match.
- **Closed-loop check:** the noisy oracle replayed against the logged arms, with the same schemas,
  rules and seeds.

| arm (Jev logs vs oracle sims) | tower dmg/min | decided | deaths/match | bot-time at own fountain | in enemy tower range |
|---|---|---|---|---|---|
| eco-3 B1 medium–hard (12 vs 12) | 221 vs 199 | 67 % vs 83 % | 4.3 vs 4.2 | 29.8 % vs 34.4 % | 8.7 % vs 8.5 % |
| eco-3 B1 medium–entrant (12 vs 12) | 140 vs 110 | 50 % vs 50 % | 12.6 vs 11.5 | 32.7 % vs 33.2 % | 8.1 % vs 7.4 % |
| A `simultaneous-1` medium–hard (5 vs 12) | 215 vs 188 | 20 % vs 83 % | 2.2 vs 1.7 | 26.2 % vs 29.0 % | 8.3 % vs 7.4 % |
| A `simultaneous-1` hard–medium (5 vs 12) | 211 vs 200 | 60 % vs 42 % | 1.4 vs 1.0 | 26.2 % vs 29.6 % | 8.5 % vs 9.0 % |
| Bandstand 5 P2 medium–hard (2 vs 6) | 71 vs 63 | 0 vs 0 | 2.0 vs 1.5 | 24.7 % vs 27.3 % | 2.8 % vs 2.8 % |
| Bandstand 5 O2 medium–hard (2 vs 6) | 75 vs 76 | 0 vs 0 | 2.5 vs 1.7 | 17.2 % vs 21.1 % | 3.1 % vs 3.1 % |
| Bandstand 5 P2 hard–hard (4 vs 12) | 0 vs 42 | 0 vs 0 | 0 vs 1.7 | 23.8 % vs 27.2 % | 0.0 % vs 3.3 % |

- **How to read the check:**
  - The sims reproduce the levels: tower damage within about 10–20 %, plus deaths and where the bots
    spend their time.
  - Decided rates on 5-match Jev cells are noisy both ways.
  - **The known gap is the pure mirror.** Jev answered both sides of hard vs hard identically, so
    those four Jev matches are one match with 0 damage. The noise breaks that mirror, so the sims
    overstate variety in mirrors.
- **Caveat that matters for every closed-loop number below:** the oracle plays the house tiers and
  the sample entrant only. Real entrants' prose will behave unlike either. That is why each candidate
  is run on five configurations, from almost no pressure to towers falling on both sides, and why
  the top pick still needs the Jev measurement.

## 2. Diagnosis: why matches reach 600 s

### 2.1 The nexus is out of reach, so every draw is exact

| arm | n | decided | nexus kills | nexus hp lost, all matches | towers down / match | draws 6–6 | draws 5–5 or 4–4 | draws with a tower under 300 hp |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A (no economy), gate, sequential | 24 | 79.2 % | 0 | 0 | 1.42 | 0 | 5 | 0 |
| A (no economy), `simultaneous-1` | 10 | 40.0 % | 0 | 0 | 1.60 | 0 | 6 | 0 |
| R (respawn only), gate | 24 | 25.0 % | 0 | 0 | 0.75 | 12 | 6 | 6 |
| B0 (eco-2, no shop), gate | 24 | 45.8 % | 0 | 0 | 1.38 | 2 | 11 | 4 |
| B1 eco-2, gate | 24 | 50.0 % | 0 | 0 | 1.08 | 5 | 7 | 2 |
| B1 eco-3 | 24 | 58.3 % | 0 | 0 | 0.92 | 6 | 4 | 4 |
| Bandstand 3 P2 / O2 | 8 / 8 | 12.5 % / 25.0 % | 0 | 0 | 0.62 / 0.25 | 5 / 6 | 2 / 0 | 4 / 3 |
| Bandstand 4 P2 / O2 | 8 / 8 | 25.0 % / 0 % | 0 | 0 | 0.25 / 0 | 6 / 8 | 0 / 0 | 6 / 2 |
| Bandstand 5 P2 / O2 (`own-lane-1`) | 8 / 8 | 0 % / 0 % | 0 | 0 | 0 / 0 | 8 / 8 | 0 / 0 | 0 / 0 |

- **What "decided" means.** Every match in every arm ran the full 10:00. "Decided" (`match.ts`
  `decideByTiebreak`) is always the tower count. A tie is always equal towers **and** 2,200–2,200
  nexus hp.
- **How close a match came to a nexus kill:** never closer than 2,200 hp.
  - **The map:** each nexus sits inside a ring of its three inner towers. On `pvp-1`, adjacent inner
    towers are about 181 units apart and each covers 160, so the ring's coverage is closed.
  - **The bots:** they spend 0–1.3 % of their time within 250 of the enemy nexus. The house prose
    says it outright: "Never walk toward the enemy nexus without your minions."
- **Of 12 towers (10,800 hp), a match takes down 0–1.6.** On Bandstand 5 the whole match dealt
  370–445 hp to towers in total, about 4 % of the towers' hp.

### 2.2 Pushes stall at the wave, then at the tower

**What happens to a minion:**

| arm | killed by a minion | by a bearbot | by a tower | ever in an enemy tower's range | ever within 130 of the enemy nexus | wave contact, mean distance from lane centre (lane = 1) |
|---|---:|---:|---:|---:|---:|---:|
| A, `simultaneous-1` | 65.4 % | 9.3 % | 17.6 % | 19.4 % | 0 | 0.051 |
| R, gate | 59.4 % | 9.5 % | 23.5 % | 25.5 % | 0 | 0.045 |
| B1 eco-3 | 70.2 % | 5.9 % | 16.1 % | 17.8 % | 0 | 0.041 |
| Bandstand 4 P2 / O2 | 66.7 / 73.3 % | 8.2 / 5.3 % | 17.4 / 13.8 % | 19.6 / 13.9 % | 0 | 0.033 / 0.029 |
| Bandstand 5 P2 / O2 | 80.2 / 78.4 % | 2.5 / 3.8 % | 10.0 / 10.2 % | 10.7 / 9.8 % | 0 | 0.028 / 0.029 |

- **Wave parity is the first stall.**
  - Every 30 s each side sends three identical 60-hp minions down each lane.
  - They meet within 3–5 % of the lane's exact centre.
  - 57–80 % die to each other. Only 10–26 % ever reach an enemy tower's range.
  - There a tower (18 per shot, one shot a second) kills a minion in 4 shots. So a full surviving
    wave is 12 s of cover at most; a typical survivor is one or two damaged minions.

**A bearbot hitting a tower: episodes and how they end:**

| arm | episodes / match | mean length | mean damage | cover gone | recalled / ran home | walked off | bot died | tower died |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A, `simultaneous-1` | 39.1 | 3.7 s | 43 | 24 % | 68 % | 2 % | 1 % | 5 % |
| B1 eco-3 | 32.2 | 3.3 s | 45 | 27 % | 60 % | 1 % | 5 % | 5 % |
| Bandstand 4 P2 (`recall-2`) | 37.0 | 2.1 s | 28 | 71 % | 12 % | 14 % | 1 % | 1 % |
| Bandstand 5 O2 (`recall-2`, `own-lane-1`) | 10.9 | 1.2 s | 22 | 79 % | 10 % | 2 % | 8 % | 0 % |

- **The tower out-damaging the wave is the second stall, and the bots leaving is the third.**
  - Every house tier attacks a tower only with at least two allied minions near, and goes home when
    it sees a tower with none.
  - So a bot's tower hit lasts 1–5 s and deals 22–60 hp, against a 900-hp tower.
  - Under the specimen recall, two thirds of episodes end with the bot running home (hp low or
    shopping).
  - Under `recall-2`, three quarters end because the covering minions died.

**Where the bearbots' time goes (share of bot-seconds):**

| arm | dead | recalling | at own fountain | under own tower | neutral ground | at a Bandstand site | in enemy tower range | … with own minions too |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| A, gate, sequential | 22.4 % | 4.5 % | 21.6 % | 23.8 % | 20.3 % | – | 7.3 % | 3.6 % |
| A, `simultaneous-1` | 9.1 % | 5.9 % | 26.2 % | 26.3 % | 23.9 % | – | 8.4 % | 3.4 % |
| R, gate | 1.8 % | 6.1 % | 25.7 % | 35.0 % | 23.1 % | – | 8.3 % | 3.4 % |
| B1 eco-3 | 3.3 % | 5.8 % | 31.3 % | 30.4 % | 20.8 % | – | 8.4 % | 2.6 % |
| Bandstand 4 O2 | 7.4 % | 7.8 % | 20.1 % | 26.0 % | 32.4 % | 17.0 % | 6.3 % | 1.6 % |
| Bandstand 5 P2 | 7.4 % | 10.3 % | 24.4 % | 40.3 % | 16.3 % | – | 1.4 % | 0.3 % |
| Bandstand 5 O2 | 22.3 % | 6.5 % | 16.0 % | 22.7 % | 29.8 % | 17.4 % | 2.8 % | 0.5 % |

- **A sixth to a third of all bot-time is spent at the bot's own fountain**, and only 1.4–8.4 % in
  an enemy tower's range. 0.3–3.6 % is in range with minion cover, which is the only time the house
  tiers hit towers.
- **The stage pulls bots off the lanes.** In Bandstand 4 and 5's O2, 17 % of bot-time is at a
  Bandstand site.
- **With `own-lane-1` and no stage, Bandstand 5 P2 sits under its own towers** (40 % of bot-time,
  1.4 % in enemy range): the lane duel.

### 2.3 Structure damage doesn't escalate

Structure damage dealt per minute, both teams, hp/min:

| arm | 0–1 | 1–2 | 2–3 | 3–4 | 4–5 | 5–6 | 6–7 | 7–8 | 8–9 | 9–10 | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A, `simultaneous-1` | 8 | 214 | 402 | 460 | 422 | 228 | 116 | 95 | 120 | 67 | 2,132 |
| R, gate | 5 | 179 | 300 | 322 | 319 | 212 | 154 | 126 | 139 | 143 | 1,898 |
| B1 eco-3 | 38 | 80 | 249 | 189 | 238 | 240 | 260 | 170 | 162 | 181 | 1,806 |
| Bandstand 4 O2 | 10 | 59 | 164 | 239 | 94 | 100 | 145 | 141 | 119 | 155 | 1,226 |
| Bandstand 5 O2 | 4 | 20 | 81 | 50 | 57 | 35 | 47 | 35 | 41 | 74 | 445 |

Nothing in the game gets stronger toward the end:
- waves, towers and the nexus are the same at 9:00 as at 1:00;
- without an economy, damage peaks at minutes 2–4, then falls by half or more (A under
  `simultaneous-1`: 460 hp/min in minute 3, 67 in minute 9);
- with one, it is flat.

### 2.4 How ties happen: symmetric pressure

- **Where towers fall, they fall on both sides.** A `simultaneous-1`: all 6 draws are 5–5. B0: 11
  of 13 draws are 5–5 or 4–4. The house tiers are mirror-ish, and so is the map since #56.
- **That is why "more pressure" is regime-dependent (§5).** Raising damage turns a 6–6 into a 6–5
  when nobody was getting towers, but a 6–5 into a 5–5 when both sides were. Open loop on eco-3 B1:
  towers lost 0.92 → 1.46 a match, and decided 58 → 46 %.

### 2.5 By arm: the economy adds draws through respawn

- **A vs R** (gate, sequential): bot-time dead 22.4 % → 1.8 %; decided 79 % → 25 %.
  - Without respawn, a bot that dies is gone for good, and its lane falls. Respawn removes the one
    thing that made A decisive.
  - A's 79 % is also inflated by the pre-#56 violet tilt; under `simultaneous-1`, A is 40 %.
- **B1 eco-2 → eco-3:** decided 50 → 58 %. eco-3 is slightly better, but both are under A.
- **Respawn timers that grow late don't help, either (§4.5).**

### 2.6 By ruleset: the Bandstand and the lane fix

- **Bandstand O vs P:** the stage takes 10–17 % of bot-time, and towers take less damage (Bandstand
  4: 1,226 vs 1,471 hp a match).
- **Captures don't show up as tower damage:** every O arm dealt less tower damage than its P arm.
- **`own-lane-1` (#62) all but stopped tower damage in the no-stage game:** Bandstand 5 P2 dealt
  369 hp to towers a match, against Bandstand 4 P2's 1,471.
  - Every bot now meets its opposite number in its own lane.
  - The four hard-vs-hard P2 matches dealt 0.

### 2.7 By tier pairing

- **Mirrors are the hardest case.** Bandstand 5's four hard-vs-hard P2 matches are byte-identical
  (0 structure damage). In the sims, medium vs medium resolved 0 of 20 times in every arm except
  the Bandstand-siege and late-siege-wave ones. Identical pilots
  on a mirror map produce a mirror match. No timeout rule can honestly split that, and none should.
- **Unequal pairings carry the decisions.** Medium vs the sample entrant, and the entrant vs hard,
  are where nearly all decided matches are.

### 2.8 Late leads are held or equalised, never overturned

| arm | n | led at 8:00 | … leader won | … equalised (draw) | … overturned | level at 8:00 | … then decided |
|---|---:|---:|---:|---:|---:|---:|---:|
| A, gate | 24 | 21 | 19 | 2 | 0 | 3 | 0 |
| A, `simultaneous-1` | 10 | 4 | 4 | 0 | 0 | 6 | 0 |
| R, gate | 24 | 9 | 6 | 3 | 0 | 15 | 0 |
| B0, gate | 24 | 12 | 8 | 4 | 0 | 12 | 3 |
| B1 eco-2, gate | 24 | 10 | 6 | 4 | 0 | 14 | 6 |
| B1 eco-3 | 24 | 13 | 11 | 2 | 0 | 11 | 3 |
| Bandstands 3–5, P2 and O2 arms | 48 | 0 | – | – | – | 48 | 5 |
| **all 286 logged matches** | 286 | 95 | 78 | 17 | **0** | 191 | – |

- **In 286 matches the last two minutes have never produced a comeback.** They produced 17 draws
  (a lead equalised) and otherwise nothing that changed the result.

## 3. What would help, in one paragraph

A tie needs three things together:
- symmetric pressure;
- a nexus nobody can reach;
- a tiebreak that only counts whole towers.

Pressure won't be asymmetric just because we want it, and the nexus is a long way off: 2,200 hp
behind a closed ring, about ten times a whole match's structure damage. So the levers that work
change **what the end of the match asks**. Ask for "who is ahead now" earlier, and make the answer
to "who breaks the tie first" come quickly. A lever that only adds damage everywhere helps exactly
when nobody was taking towers, and hurts once both sides are.

## 4. The candidates

Each candidate covers:
- what it changes;
- which stall it targets;
- its expected effect: closed loop from §5's table, open loop from Jev's logs where the rule allows;
- its risks;
- its implementation size;
- the Jev cost to measure it properly.

Unit cost for the last item: a full 600 s Jev match on cadence 2 cost **$0.070–0.092**: eco-3 B1
$0.092 a match, Bandstand 5 P2 $0.083, O2 $0.070. A seed-paired two-arm test at 26 matches an arm
(§8's shape) is therefore about **$4.70**.

### 4.1 The Final Chorus (recommended)

**What changes.** All of it is inside the 600 s:
1. **At 8:00, a team ahead on towers wins.**
2. **If towers are level at 8:00:** from 8:00, damage to towers and nexuses is ×3. The first tower
   to fall ends the match for the team that took it.
3. **If nothing falls by 10:00:** today's tiebreak, or §4.6's finer one.

**Stall targeted.**
- **Symmetric pressure (§2.4).** A level game gets a race the first tower wins outright, instead of
  an answer that restores the tie.
- **Equalisers at the end (§2.8).** They were the only thing the last two minutes ever did to a lead.

**Expected effect.**
- **Closed loop:** +33 pp [+25, +42] on the Jam stack (26 % → 59 % decided). The other
  configurations: +26 eco-only, +8 Bandstand-only, +20 and +22 on the two logged configurations.
  All CIs are above 0, the only candidate with that property.
- **Open loop on Jev's logs:** decided rises or holds in every arm. eco-3 B1 58 → 83 %, eco-2 B1
  50 → 79 %, R 25 → 58 %, B0 46 → 83 %, Bandstand 3–4 P/O 0–25 → 25–100 %. Bandstand 5 P2 stays
  0 %; its matches dealt no tower damage to multiply.
- **How the sims end (Jam stack, 120 matches):**
  - 10 at 8:00 on a lead;
  - 61 in sudden death;
  - 49 still drawn at 10:00;
  - mean end 556 s;
  - 0 nexus kills.

**Risks.**
- **Snowball:** low by construction. It amplifies nothing before 8:00, and ×3 applies to both
  sides.
- **Jam fairness:**
  - violet's share of decided matches is 0.51 on the Jam stack and 0.47 eco-only;
  - in medium vs hard, hard wins every decided match, so skill order holds;
  - mirrors stay drawn: medium vs medium 0 of 20, hard vs hard 1 of 20.
- **The lost equaliser:** a team down a tower at 8:00 loses its two minutes to equalise. In the
  logs that only ever turned a loss into a draw (2–4 matches per 24).
- **Strategy:** entrants can read the clock. "Hold a lead to 8:00" and "all in at 8:00 when level"
  are both legitimate and both watchable.
- **Interaction with `river-2-set10`:** a Bandstand opening at 7:30 (`lastOpenSec` 540) runs into
  the Chorus. Encore's +15 % attack damage then helps its capturer win the race. That is a real
  link from the stage to the result, but small.
- **Interaction with `recall-2`:** a 4 s channel is a real cost in a two-minute race. That is
  intended pressure, not a bug.
- **Interaction with eco-3:** tower gold in the Chorus is moot once the match ends.
- **Interaction with `own-lane-1`:** none found; the Jam-stack sims use it.
- **Pilots:** they see `clockSec` today. An optional observation line ("Final Chorus: towers take
  triple damage, first tower wins") would let entrant prose refer to it, but the house tiers don't
  need it.

**Implementation size: medium-small.** Built as `final-chorus-1` (`src/finale.ts`), off by default.

- **The layer:** a named rule layer like `src/recall.ts`: `src/finale.ts` plus
  `src/finale/final-chorus-1.json`, about 120 lines.
  - ×3 is exact as an hp rescale of every structure at 8:00. The finish uses the match's own
    `finish`, the same way the other layers reach the frozen sim.
- **The plumbing** (`--finale` on the CLI, recorded in the log, applied on `--verify`, read by
  `metrics.ts`) and tests, about a day.
- **Optional:** a viewer banner and the observation line.

**Jev cost to measure:** ≈ $4.70 (§8).

### 4.2 Closing time: tower fatigue or an armor ramp

**What changes.** Late in the match, towers get weaker. There are two knobs:
- **fatigue:** tower damage ×⅓ from 4:00, so a minion survives 10 shots, not 4;
- **armor ramp:** structures take ×2 damage from 5:00 and ×3 from 8:00.

**Stall targeted.** The tower out-damaging the wave, and too little pressure (§2.2–2.3).

**Expected effect.**
- **The strongest gains in a low-pressure world:** fatigue +42 / +46 / +13 pp, ramp +39 / +40 /
  +12 pp on the Jam / eco-only / Bandstand-only stacks.
- **They go negative where towers already fall on both sides:** fatigue −2 and −30, ramp 0 and −25
  on the logged eco-3 and A configurations.
- **Open loop on Jev's eco-3 logs:** the ramp takes towers lost from 0.92 to 1.46 a match and
  decided from 58 % to 46 %.

**Risks.**
- **Backfires once entrants push.** Entrant prose that pushes harder than the house tiers moves the
  game toward the logged regimes, exactly where these fail.
- **Fatigue also changes the PvP game.** Tower shots at bearbots fall from 51 % to 40 % of tower
  shots on the Jam stack, and diving gets cheap. That is a direct hit on §9.8's keep-lines (time
  under an enemy tower, deaths under the killer's tower).
- **Amplifiers amplify any side lean.** On the logged A configuration (`first-min`), violet's share
  of decided matches went from 0.62 to 0.88 (ramp) and 0.93 (fatigue).

**Implementation size: small.** One constant change at a time, as a named layer.

**Jev cost to measure:** ≈ $4.70 per knob. It would also need a high-pressure line (prose
entrants) to be trusted.

### 4.3 Lane breach

**What changes.** Once a team destroys a tower, every later wave in that lane brings it one or two
extra siege minions (240 hp, 12 damage).

**Stall targeted.** Wave parity, but only after a lead exists. It converts a relative edge, not
absolute pressure.

**Expected effect.**
- **Nothing where no tower falls:** ±0 on all three own-lane stacks.
- **Helps where towers fall:** one minion +5 and +12 pp on the logged eco-3 and A configurations;
  two minions +5 and +20.
- **As an add-on to the Final Chorus:** +25 pp on logged A, against the Chorus's +22, and the same
  elsewhere.

**Risks.**
- **Snowball by design.** That is mild here: a lane, not the map.
- **It can reach the nexus.** Logged A with 2 a wave had 3 nexus kills in 40 matches.

**Implementation size: small-medium.** A wave hook and the tower-state read.

**Jev cost to measure:** ≈ $4.70, and only informative on a pushing line.

**Use:** a second-pass add-on if Jam entrants turn out to push more than the house tiers.

### 4.4 Bandstand siege

**What changes.** Capturing the Bandstand sends two (or three bigger) siege minions down every lane
for the capturing team. That converts the objective into structure damage.

**Stall targeted.** The stage pulling bots away while Encore never converts (§2.6).

**Expected effect.** The largest raw effect:
- Jam stack: +42 pp (two minions), +47 pp (three);
- Bandstand-only: +66 and +91 pp;
- 33–72 % of matches end in a nexus kill. The median nexus kill comes at 4:40–8:43, depending on
  the variant.

**Risks: disqualifying for the Jam as tuned.**
- **The stage becomes the whole game.** On the Bandstand-only stack, medium beats hard in 69 % of
  decided matches, because medium takes the stage 14–3 (Bandstand 5).
- **Snowball:** the first tower's taker wins 96–100 % of decided matches; comebacks 0–2 %.
- **It can't help mirrors.** Hard vs hard freezes at the stage (15 of 16 openings untaken in
  Bandstand 5).
- **It inherits every side lean the Bandstand has had.**

**Implementation size: small.** A capture hook into the objective layer.

**Jev cost to measure:** ≈ $4.70 on O2's lines.

**Use:** not before the Jam. If ever, as a much smaller reward, after the Bandstand's own §9.8
ruling.

### 4.5 Late siege waves; respawn ramp (both measured, neither recommended)

**Late siege waves.**
- **What changes:** from 3:00 or 4:00, each wave adds a siege minion.
- **Stall targeted:** the wave being out-damaged.
- **Expected effect:** +18 to +32 pp on the Jam stack, +18 eco-only, +7 Bandstand-only. 0 and −18 on
  the logged configurations: the same regime problem as §4.2, with more deaths (+2.4 a match).
- **Implementation size:** small.
- **Jev cost to measure:** ≈ $4.70.

**Respawn timers that grow after 4:00 (+3 or +6 s a minute).**
- **Why it was tried:** respawn is what made the economy add draws (§2.5).
- **Expected effect:** **−6 and −13 pp** on the Jam stack.
- **Why, not established.** A likely reason: the house tiers only hit towers with minion cover
  ("never stand at an enemy tower alone"), so an enemy's longer death opens no tower by itself.
- **Rejected.**

**Considered and rejected without a sim: a nexus exposure phase.**
- No minion has ever been within 130 units of a nexus, and bots are within 250 of one for 0–1.3 % of
  their time.
- Weakening the nexus does nothing until an inner tower ring is open, which 286 matches never got
  close to.

### 4.6 A finer timeout tiebreak (paper only; recommended as a complement)

**What changes.** At 10:00, after towers alive and nexus hp, compare total tower hp left, then
bearbot kills, then Bandstand captures.

**Stall targeted.** None. **Plainly: this cuts draws on paper without making any game more
decisive.** It relabels a level match as a win by whoever chipped more.

**Expected effect.**
- Total tower hp alone splits **every** logged draw except Bandstand 5 P2's four hard-vs-hard
  mirrors, which are identical (0 damage).
- The median gap in a split draw is 62–467 hp per arm, under half a tower.
- Kills and captures never got a turn.

**Risks.**
- **A 20-hp "win" will feel arbitrary to an entrant.** It must be shown as such in the result line
  and the viewer ("decided on tower hp, 6–6 towers").
- **It hides the problem in the metric.** Keep "decided before the tiebreak" as the line the game
  is judged on.

**Implementation size: tiny.** It replaces the frozen `decideByTiebreak` through the same outside
layer as §4.1.

**Jev cost to measure:** **$0.** It re-scores any log, and does so above.

**Use:** under the Final Chorus, it settles the matches that are still level at 10:00 (49 of 120 on
the Jam stack, mostly mirrors).

## 5. The numbers: every candidate in every configuration

- **Decided share, Δ against base**, seed-paired, with a 95 % bootstrap CI.
- **n per cell:** 120 on the own-lane stacks (6 tier pairings × 20 seeds) and 40 on the logged ones
  (2 × 20).
- **Common settings:** all `pvp-1`, `simultaneous-1`, cadence 2, the oracle with per-condition noise.

| mechanism | Jam stack | eco-only | Bandstand-only | logged eco-3 | logged A |
|---|---:|---:|---:|---:|---:|
| **base: decided** | **26 %** | **20 %** | **0 %** | **68 %** | **65 %** |
| **Final Chorus** (lead at 8:00 wins; else sudden death, ×3) | **+33 [+25, +42]** | **+26 [+18, +34]** | **+8 [+3, +12]** | **+20 [+8, +32]** | **+22 [+10, +38]** |
| … sudden death + ×3 when level, no win at 8:00 | +33 [+25, +42] | +26 [+18, +34] | +8 [+3, +12] | +5 [−10, +20] | −8 [−22, +8] |
| … Final Chorus + lane breach | +33 [+25, +42] | +26 [+18, +34] | +8 [+3, +12] | +20 [+8, +32] | +25 [+12, +40] |
| tower fatigue ×⅓ from 4:00 | +42 [+34, +52] | +46 [+37, +55] | +13 [+8, +20] | −2 [−22, +18] | −30 [−48, −12] |
| … ×½ from 5:00 | +34 [+26, +42] | +28 [+21, +37] | +2 [0, +4] | −18 [−32, −2] | −28 [−45, −12] |
| armor ramp ×2 at 5:00, ×3 at 8:00 | +39 [+31, +48] | +40 [+32, +49] | +12 [+6, +18] | 0 [−18, +18] | −25 [−42, −10] |
| … ×1.5 at 6:00, ×2 at 8:00 | +22 [+15, +30] | +15 [+9, +22] | +2 [0, +6] | +2 [−15, +18] | −20 [−35, −8] |
| lane breach, 1 siege minion | 0 | 0 | 0 | +5 [0, +12] | +12 [+2, +25] |
| … 2 siege minions | 0 | 0 | 0 | +5 [0, +12] | +20 [+8, +32] |
| Bandstand siege, 2 a lane | +42 [+32, +52] | – | +66 [+57, +74] | – | – |
| … 3 bigger | +47 [+38, +56] | – | +91 [+85, +96] | – | – |
| late siege waves, +1 from 4:00 | +18 [+10, +28] | – | – | – | – |
| … bigger, from 3:00 | +32 [+21, +42] | +18 [+10, +27] | +7 [+2, +12] | 0 [−20, +20] | −18 [−35, 0] |
| respawn ramp, +3 s/min after 4:00 | −6 [−11, −1] | – | – | – | – |
| … +6 s/min | −13 [−20, −7] | – | – | – | – |

**The configurations:**
- **Jam stack:** eco-3 + `river-2-set10` + `recall-2`, `own-lane-1`, the post-#57 house tiers
  (`prompts/pilots/house-*-eco.schemas.json`) and the sample entrant.
- **eco-only:** the same without the Bandstand.
- **Bandstand-only:** `river-2-set10` + `recall-2`, no economy (Bandstand 5's O2).
- **Logged eco-3:** eco-3 B1 exactly as logged (`first-min`, specimen recall, the gate's tiers).
- **Logged A:** side-fairness A exactly as logged (no economy, `first-min`, specimen recall).

**Jam stack, by pairing** (decided of 20: base → Final Chorus):

| pairing | decided of 20 |
|---|---|
| entrant–hard | 11 → 19 |
| hard–medium | 0 → 16 |
| medium–entrant | 18 → 20 |
| medium–hard | 2 → 15 |
| hard–hard | 0 → 1 |
| medium–medium | 0 → 0 |

## 6. Ranked recommendation

1. **The Final Chorus** (§4.1).
   - It is the only candidate that helps in every regime simulated, low-pressure and high.
   - It agrees with Jev's own logs re-scored open loop.
   - It never lengthens a match, and it removes no comeback the data has ever shown.
   - **Measure it on Jev (§8) before the Jam.**
2. **The finer tiebreak** (§4.6), **as a complement, not a fix.** Ship it with whatever ships, to
   settle the residual level matches, and keep judging the game on "decided before the tiebreak".
3. **Lane breach** (§4.3): held in reserve as a Final Chorus add-on, if Jam entrants push enough
   that towers fall on both sides.
4. **Closing time** (§4.2): strongest in today's low-pressure Jam stack, but it reverses sign
   exactly when entrants start trading towers, and fatigue cuts into §9.8's keep-lines. Not
   recommended without a high-pressure line.
5. **Late siege waves** (§4.5): the same regime problem, weaker.
6. **Bandstand siege** (§4.4): too swingy and stage-decided for the Jam as tuned.

**Not recommended:** the respawn ramp (measured negative) and a nexus exposure phase (nothing gets
near a nexus).

## 7. What this pass did not settle

- **The oracle is a stand-in.** It is 97.4 % action-faithful on 90k logged decisions, and it
  reproduces the logged arms' levels. But closed-loop, small decision differences compound. The
  Jev measurement is the test.
  *Correction, 2026-10-02: on the Jam stack's eco tiers it misread three conditions, and that, not
  compounding, put hard above medium in the sims (`runs/house-hard-2026-10-02.md` §2).*
- **Prose entrants were not simulated beyond the sample entrant.** The two logged configurations
  are the proxy for "towers fall on both sides".
- **Team fights, PvP damage and first blood weren't scored on the sims.** The metrics tool replays
  without the candidate layer. Proxies (bot-time in enemy tower range, tower shots at bearbots,
  deaths) barely moved under the Final Chorus. They are in §8 as keep-lines, not as results.
- **The analysis scripts are not in this PR.** They are scratch tools outside the repo: the replay
  probe, the oracle and its fidelity check, the sim runner, and the candidate layers. The oracle
  could become a tool, a free pre-screen for any rules change on the house tiers, as a follow-up if
  Ceryce wants one.

## 8. Pre-registered measurement plan: Final Chorus

**For Ceryce's approval.** She approved it on 2026-10-01 at 17:56 CT and raised the budget to $15 at
17:58. It ran that evening with the sample amended (the last subsection). The result is in
[`runs/final-chorus-2026-10-01.md`](../runs/final-chorus-2026-10-01.md).

**Prerequisites.**
- eco-3 is on `develop` (#61).
- `final-chorus-1` built as in §4.1 (named layer, CLI flag, log field, `--verify`, metrics) with
  tests green.
- No recompile of any tier.

**Lines** (both arms):
- `pvp-1`, `simultaneous-1`, `--targeting own-lane-1`, `--recall recall-2`, `--economy eco-3`,
  `--objective river-2-set10`;
- cadence 2, full 600 s;
- Jev (`jev-latest`) through one private `schema_server.py` with `--budget-usd 7.00`;
- house tiers from `develop` (`house-{medium,hard}-eco.schemas.json`) and the eco sample entrant
  (`sample-entrant-eco.schemas.json`).

**Arms.**
- **C0** = the lines;
- **C1** = the lines + `--finale final-chorus-1`.

**Slots** (identical in both arms, played C0 then C1 per slot):
- medium–hard, hard–medium, medium–entrant and entrant–hard, on seeds 3, 7, 11, 23, 42 and 101:
  24 pre-registered slots;
- hard–hard on seeds 7 and 11: 2 mirror slots, reported only.

That is 26 matches an arm, 52 in all, plus one 120 s smoke on C1's flags.

**Cost.**
- About $0.09 a match × 52 ≈ **$4.70**; C1 is slightly cheaper (mean end ≈ 556 s).
- Smoke ≈ $0.02.
- **Approve $5.00, ceiling $7.00.**

**Forecast, registered before the run:**
- **Closed loop (the Jam-stack sims):** C0 decided ≈ 26 %, C1 ≈ 59 %, Δ ≈ +33 pp [+25, +42].
- **Open loop:** C0's own logs re-scored under the Final Chorus are computed for free before C1 is
  read, and recorded next to the result.

**Primary line.**
- **Metric:** decided share before the timeout tiebreak, C1 − C0, seed-paired over the 24 slots.
- **Pass:** the 95 % bootstrap CI is wholly above 0 **and** C1's level is ≥ 50 %.

**Keep-lines.** Each fails only if its C1 − C0 CI is wholly on the bad side:
- violet's share of decided matches stays within 30–70 % (sign test reported);
- in medium–hard slots, hard's share of decided matches does not fall below C0's;
- PvP damage a minute, and team fights a match;
- bot-time under an enemy tower, and deaths under the killer team's tower (§9.8's lines);
- no match longer than 600 s (by construction; checked).

**Reported, not lines:**
- how matches ended (at 8:00 on a lead, in sudden death, at 10:00);
- mean end time and nexus kills;
- matches decided by ≥ 2 towers;
- the mirror slots;
- C0 vs C1 checkpoint divergence before 8:00. C1 changes nothing before 8:00, so any divergence
  measures Jev's own nondeterminism.

**Decision rule.**
- **Pass:** propose `final-chorus-1` for the Jam with the finer tiebreak underneath.
- **The primary line fails:** ship only the finer tiebreak, labelled as paper, and come back with
  the data.
- **A keep-line regresses:** Ceryce's call, as with §9.8.

### Amendment: a larger sample, registered before the first real match

**Recorded Thu 2026-10-01, 18:12 CT, after the smoke and before any real match of either arm.** No
result of this measurement had been seen. The sample is never extended after a result is seen.

- **Reason: Ceryce raised the budget.** She approved the run as above ($5.00, ceiling $7.00), then at
  17:58 CT raised it: "Give it $15." The extra budget buys statistical power, not new questions.
- **Measured unit cost.** The 120 s smoke on C1's flags (medium–hard, seed 7) cost **$0.0210** for 336
  Jev requests, so a full match is about **$0.105**. C1 runs a little shorter.
- **The amended slots**, identical in both arms, played C0 then C1 per slot, in this order:
  1. the 24 pre-registered slots above (medium–hard, hard–medium, medium–entrant, entrant–hard on
     seeds 3, 7, 11, 23, 42, 101);
  2. the 2 mirror slots above (hard–hard, seeds 7 and 11; reported only);
  3. **36 added slots:** the same four pairings on **seeds 5, 13, 17, 19, 29, 31, 37, 43, 47**.
- **So: 62 matches an arm, 124 in all**, about **$12.6** at the smoke's rate, against a **$15.00 hard
  stop** (`schema_server.py --budget-usd 15.00`). The runner stops launching slots if spent plus the
  measured average times the matches left would pass $14.50. A stop leaves whole C0/C1 pairs, and the
  original 26-a-side sample is played first.
- **Analysis, unchanged except for n.** The primary line and every keep-line are computed as above,
  seed-paired over the **60** non-mirror slots. The original 24 slots are also reported on their own,
  as the plan was first registered.
