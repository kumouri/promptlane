# House hard on the Jam stack: why it lost the tower race, and the fix — 2026-10-02 run

**Question.** In the Final Chorus measurement ([`final-chorus-2026-10-01.md`](final-chorus-2026-10-01.md))
house hard won no decided match: 0 of 9 without the Final Chorus and 0 of 24 with it. Medium beat
it 11–0 and the sample entrant 13–0, and the eco-3 check had medium beating it 3–0. The free
stand-in sims had hard winning every decided medium–hard match. Why does hard lose? Why did the
stand-in disagree? Can the house tier be fixed without touching the game?
- **Ruling:** Ceryce, Fri 10-02 00:16 CT: "That's what I'd like to look at now that the final rules
  have been decided." The Jam ruleset here includes the Final Chorus (`final-chorus-1`). Its
  default is not flipped here; that is a separate change she owns.
- **Budget:** $5.00 hard stop on Jev.
- **Scope:** only the economy-aware hard pilot (`prompts/pilots/house-hard-eco.prose.md` and its
  compiled schemas). The sim, the rules, the replay checker, medium, easy and the sample entrant are
  untouched.

## Verdict

*Pending: the Jev measurement below is pre-registered and has not been run yet.*

## 1. Why hard loses: it doesn't go where towers are taken

**Source:** the 124 Final Chorus logs (`data-final-chorus-2026-10-01`), replayed tick by tick on
this branch's code, every layer attached, all 124 replay-verified. The probe is per bot: where each
bot spends its time, the damage it deals and takes, its deaths, and the rule it last fired. The 12
eco-3 check logs (`data-economy-eco3-check-2026-10-01`) show the same pattern without the Final
Chorus.

**C1 (with the Final Chorus), medium against hard, both orientations, 30 matches:**

| per team, per match | hard | medium |
|---|---:|---:|
| structure damage by its bearbots | **164** | **640** |
| structure damage by its minions | 137 | 181 |
| towers taken | 0 | 11 |
| PvP damage dealt | 857 | 3,546 |
| deaths | 3.43 | 2.27 |

| per bot, share of alive time | hard drums | hard keytar | hard violin | medium drums | medium keytar | medium violin |
|---|---:|---:|---:|---:|---:|---:|
| on the opponent's side | 11.7 % | **2.5 %** | 5.1 % | 30.5 % | 17.0 % | 19.1 % |
| at its own fountain | 30.2 % | 34.2 % | 31.8 % | 20.2 % | 31.0 % | 25.6 % |
| under its own tower | 28.1 % | 45.0 % | 43.2 % | 26.9 % | 33.6 % | 27.0 % |

- **In the eco-3 check (no Final Chorus), the same:** hard's bearbots dealt 204 structure damage a
  match against medium's 698, and hard took no tower.
- **What hard's rules had it doing** (all 60 medium–hard logs, share of alive time by the rule that
  last fired):
  - the low-hp pair (walk home under 65 % of max hp, recall when out of sight): 22–26 %;
  - the three Bandstand rules: 17–21 %;
  - **the root default, "go home and wait for the next wave": 15–19 %;**
  - attacking a tower: 0.6–3.4 %. Medium: 2.3–3.7 % on its tower rule, plus its ability and
    bearbot attacks, which also hit towers.
- **Where hard took its damage** (C1, PvP taken per match, by the rule hard was following):

| hard's rule at the time | PvP taken | PvP dealt | deaths |
|---|---:|---:|---:|
| contest the Bandstand (a `move`: it walks in and doesn't hit back) | 1,214 | 0.3 | 0.10 |
| walk home under 65 % of max hp, an enemy in sight | 1,157 | 3.3 | **3.33** |
| hunt the carrier (attack the richest bearbot) | 790 | 736 | 0 |

- **So hard loses a tower race because it isn't in it.**
  - It leaves fights early at 65 % of max hp and is chased down on the walk home (3.33 of its 3.43
    deaths a match).
  - When no rule applies it goes home, so it spends a sixth of its time walking back to its base.
  - It hits towers only with two allied minions near. Under the Final Chorus's ×3, chip damage is
    what takes the first tower, and medium deals four times as much.
  - Its Bandstand contest rule walks it into fights without hitting back. This costs PvP, not
    towers. The fix leaves it in, because removing it made no difference in the stand-in.
- **How sure:** high on the mechanism. These are measured on the logs, not inferred. The fix below
  changes three of the four, and the corrected stand-in's ablations show which ones carry the gain
  (§3).

## 2. Is it the compiler, Jev, or the strategy? The strategy

- **The compiler is faithful.** Hard-eco's checked-in schema says what its prose says, rule for rule
  and in order (`house-hard-eco.schemas.json` against `house-hard-eco.prose.md`).
- **Jev reads hard's conditions faithfully.** On the 60 medium–hard logs, a deterministic
  reading of each condition, corrected as below, agrees with Jev on 95–97 % of hard's rule choices
  and 96–98 % of its actions.
  - Hard's 65 % trigger is read exactly: Jev says yes below 60 % of max hp, no above 70 %, and
    flips inside the 60–70 % band.
- **So it is hard's strategy, as written, that loses under these rules.** Jev plays the prose as
  written, and the prose plays passively.

### Why the stand-in disagreed: it misread three conditions, and medium idled in the sims

The fewer-draws stand-in (an "oracle": regex predicates on the observation, `docs/fewer-draws-spec.md`
§1) has a fidelity table of 97 % on 90k decisions. It parses the plain tiers' wordings. It does not
parse three of the eco tiers' wordings, which the Jam-stack sims used:

| condition (eco schemas on `develop`) | what Jev answers | what the stand-in answered |
|---|---|---|
| medium, rule 1: "is this bot's hp below 75 and is an enemy bearbot, minion **or** tower in sight?" (no comma before "or") | low hp **and** an enemy in sight | "hp below 75", with or without an enemy |
| hard, rule 1: "… below 65 % of its max hp AND is an enemy minion, enemy tower, or enemy bearbot in sight?" | low hp and **any** enemy in sight | low hp and an enemy **tower** in sight |
| hard, rule 8: "carry >= 300 gold and enemy bearbot in sight has more hp than this bot?" | yes on 3 % of decisions | "an enemy bearbot in sight": yes on 37 % |

- **The first one decides it.** In the sims, a medium bot below 75 hp with no enemy in sight still
  matched rule 1 ("walk home") before rule 2 ("recall"), so it walked home and never recalled. A
  bearbot doesn't heal at its fountain without a recall, so it stood there.
  - In the forecast's own sims, **medium spent 86–90 % of its time at its fountain**. On Jev it was
    20–31 %.
  - Hard was beating an idle medium. The entrant beat medium 20–0 in those sims, against 8–6 on Jev.
- **Reproduced:** the stand-in as it was, in this run's harness on `develop`'s schemas, has hard
  winning 29 of 29 decided medium–hard matches (the forecast had 31 of 31). With the three
  conditions read as Jev reads them, medium wins 14 of 16.
- **Corrected and recalibrated** on the 120 paired Final Chorus logs, the stand-in agrees with Jev
  on 92–98 % of rule choices for all of medium, hard and the sample entrant. Besides the three fixes:
  - medium's "hp below 75" is read as Jev reads it (below 75 hp, plus a band just under 75 % of max);
  - "can afford its next item" with nothing left to buy is read as gold ≥ 350;
  - "at home" is read as `atShop`;
  - "its minions" (the entrant's violin) counts either team's minions.
- **So the Final Chorus write-up's reading needs correcting.** It said the stand-in's per-decision
  fidelity "didn't carry the tier ranking through closed loop". The ranking failed because three
  conditions were misread, not because small errors compounded. The stand-in is scratch tooling,
  outside the repo, and it is not changed here.

## 3. The fix: hard goes and takes the towers

Only `house-hard-eco.prose.md` changed, in four places; everything else in the prose is as before.

| | before | after |
|---|---|---|
| low-hp pair (walk home if an enemy is in sight, else recall) | below **65 %** of max hp | below **50 %** (drums 110, keytar 70, violin 75) |
| "Take the objective": attack the nearest enemy tower when… | **two** allied minions are near | **an** allied minion is near |
| new rule, after "never carry a fortune…" | — | "If it is more than **480 seconds** into the match and you can see an enemy tower, attack the nearest enemy tower." |
| fallback when no rule applies | go home and wait for the next wave | **push down your lane toward the enemy base** (`push_lane`) |

- **Why these four, from the corrected stand-in's ablations** (20 seeds a pairing, both orientations):
  - **The lane-push fallback and the lower trigger carry the gain against medium.** With the other
    three changes but the trigger left at 65 %, hard won 24–2 of 26 decided; at 40 %, 39–0 of 39.
    The lower trigger alone (40 %, nothing else changed) went 7–7.
  - **50 %, not 40 %:** 40 % puts drums (88 hp) back near the flat 90 hp that Bandstand 4 moved away
    from. 50 % (110 hp) won 30–0 of 30 decided, and 55 % 29–1.
  - **The 480-second rule decides the easy matches.** Without it hard drew 37 of 40 against easy;
    with it, 18 of 40 were decided, all for hard. Against medium it adds little.
  - **The one-minion tower rule adds little:** 25–4 with two minions against 23–5 with one, on an
    otherwise like variant. It stays as compiled, since it is what a "takes towers" tier says.
  - **Tried and dropped:** removing the Bandstand contest rule (no gain); "ability on any bearbot",
    which made hard worse; requiring an allied minion for the 480-second rule (weaker).
- **The 480-second rule is a clock, not a Final Chorus rule.** Jev's description states the clock
  ("N sim-seconds into the match"), so hard pushes late with or without the Final Chorus.
- **How the schemas were made: the repo's house-pilot path.**
  - `python tools/jev/compile.py … --backend ollama` was run three times on the edited prose.
  - **The Bandstand paragraph was left out of those compiles.**
    - Hard's Bandstand rules are the plain tier's, spliced byte for byte (`test_house.mjs` checks
      it), so they never come from this compile.
    - With them in, the cascade (16 rules) overran the translator's 1,800-token reply. All three
      full-prose attempts failed with truncated JSON.
  - **All three samples compiled the changes the same way**, and named only what Jev's description
    states. From the first (`runs/house-hard-eco-compile-2026-10-02.md`), four parts were spliced in
    as before (Bandstand 3 and 4):
    - the low-hp pair;
    - the 480-second rule;
    - the one-minion tower rule;
    - the root default.
  - Every other rule object, the build and the notes are byte for byte.
- **Old logs replay unchanged.** A match log carries its own decisions, and replay doesn't consult
  the pilot files. The house's ledger row records the new schema hash, as for every earlier change.
- **Not changed:** the plain hard (`house-hard.prose.md`, `house-hard.schemas.json`, the qwen side
  files). It is played only without an economy, and the Jam plays with one.

### What the corrected stand-in forecasts (free)

`final-chorus-1` on, the Jam lines, 30 seeds per pairing (60 for both orientations together), the
checked-in schemas:

| pairing (both orientations) | decided | hard's wins | the other side's wins |
|---|---:|---:|---:|
| medium vs hard, `develop`'s hard | 16 of 40 | 2 | 14 |
| **medium vs hard, this hard** | **52 of 60** | **48** | **4** |
| easy vs hard, this hard | 21 of 60 | 21 | 0 |
| sample entrant vs hard, `develop`'s hard | 29 of 40 | 1 | 28 |
| sample entrant vs hard, this hard | 39 of 60 | 11 | 28 |
| medium vs hard, this hard, **no Final Chorus** | 40 of 60 | 39 | 1 |

- **The cost is deaths.** Hard now dies 13–16 times a match against medium in the sims (10 against
  easy), against 3.4 on Jev before. Under the Final Chorus a death costs gold and time, not the match.
- **The stand-in is a stand-in.** It played the old hard right only after three fixes. The Jev run
  below is the test.

## 4. Pre-registered Jev measurement

**Written and committed before any real match.** The commit time is in the git log of this file,
and the first match's log carries its `createdAt`.

- **Code:** `fix/house-hard-tier` at this commit.
- **Backend:** Jev on one private `tools/jev/schema_server.py` on `:8931`, with `--budget-usd 5.00`
  as the hard stop. The live arena's `:8790` and `:8797` are not touched.
  - TypeSafe, failing over to Workers AI per call, as in every Jam-stack run.
- **Smoke, free first:** `schema_server.py --stub` on `:8932`, one medium–hard match, seed 7, 120 s,
  on this code. It checks the plumbing, costs $0, and is not part of the sample.
- **Lines (every match):**
  - `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall recall-2 --economy eco-3
    --objective river-2-set10 --cadence 2 --finale final-chorus-1`, full 600 s;
  - house sides play their tier's economy-aware prose with its checked-in schemas;
  - the sample entrant plays `sample-entrant-eco.{prose.md,schemas.json}`.
- **Unchanged from `develop`** (git blob ids):
  - `house-medium-eco.schemas.json` `92b05f8…`;
  - `house-easy-eco.schemas.json` `97b2756…`;
  - `sample-entrant-eco.schemas.json` `ba65498…`.
  - (These are the sha256s of the working-tree bytes. `git diff origin/develop` on all three, and on
    the medium and easy prose, is empty.)

**The sample: 34 matches, in this order, 4 at a time.** Seeds are the Final Chorus run's.

| block | pairings (violet–green) | seeds | matches |
|---|---|---|---:|
| **P** (primary) | medium–hard, hard–medium | 3, 7, 11, 23, 42, 101, 5, 13, 17 | 18 |
| **E** (guard) | hard–easy, easy–hard | 3, 7, 11 | 6 |
| **C** (control) | medium–easy, easy–medium | 3, 7 | 4 |
| **S** (guard) | entrant–hard, hard–entrant | 3, 7, 11 | 6 |

- **Spend guard.** The runner stops launching matches once the projected spend passes $4.75:
  spent so far, plus cost per request × the mean calls of the finished matches × the matches left.
  The server stops at $5.00.
- **What a stop means.** A block cut short is reported as cut, with what it played.
- **Never extended.** No match is added or replayed after any result is seen. One exception: a
  match that crashes before it finishes is retried once, as in the Final Chorus runner.

**The lines.** Decided = a winner by any end reason (a tower lead at 8:00, the first tower in sudden
death, nexus, or a tower lead at 10:00).
1. **Primary: hard is above medium (P).** Over P's 18 matches pooled, PASS iff:
   - at least 6 are decided;
   - **hard wins at least 2/3 of the decided ones;**
   - and the one-sided exact binomial test against 50 % gives p < 0.05.
   - Fewer than 6 decided is INCONCLUSIVE, and that is not a pass.
2. **Guard: hard doesn't lose to what it should beat (E).** Easy's share of the decided hard–easy
   matches is below 50 %. No decided match passes.
3. **Guard: hard doesn't dominate what it shouldn't (S).** Hard is a step above medium, not a wall.
   This fails only if at least 3 entrant matches are decided **and** hard wins every one of them.
   - Reference: in the Final Chorus run the entrant won all 20 decided entrant–hard matches.
4. **Control: medium's share against easy is unchanged (C).** Medium wins at least half of the
   decided medium–easy matches, or none is decided.
   - Medium's and easy's files are byte-identical to `develop`, so this checks the run, not the
     change.

**Overall PASS = 1 and 2 and 3 and 4.**

**Reported, not lines:**
- end reasons and match length;
- structure damage per team, deaths, and time on the opponent's side, per tier;
- how Jev answered the new 480-second rule against the true clock;
- spend.

## 5. Result

*Not run yet.*

## Files

- **This page;** `runs/house-hard-eco-compile-2026-10-02.md` (the kept compile's transparency report,
  of the prose without its Bandstand paragraph);
- `prompts/pilots/house-hard-eco.{prose.md,schemas.json}`, `prompts/pilots/README.md`,
  `tools/arena/test_house.mjs`.
- **The diagnosis probe, the corrected stand-in and the sim runner are scratch tools, outside the
  repo.** They will go into the measurement's log zip.
