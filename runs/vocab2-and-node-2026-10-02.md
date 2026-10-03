# vocab-2: the AND node, one Jev question per condition, 2026-10-02

**Question.** PR #98 (merged 87eaf87) made every vocab-2 rule state every condition its sentence states,
but in ONE Jev question: "can this bot afford its next item and is no enemy in sight?". TypeSafe's
[Noul](https://docs.typesafe.ai/primitives/noul.md) page says: *"Ask one yes/no question per Noul. If a
question has two conditions, such as 'Is the customer angry and asking for a refund?', the model has to
judge both at once and the value means less. Ask two Nouls and combine them in code."*
- **Ceryce, 2026-10-02 21:58 CT:** "Build it." That is the AND node #98 §6 left open.
- **Standing rulings:** translation fidelity first (15:14, "It HAS to be right"); no token caps (17:59).
- **Budget:** $0 first. Then one pre-registered Jev block, hard stop **$2.00**, with its plan committed before
  the first paid call (§J below).

(The results sections are added after the batches run. This file was first committed with only the plan,
before any paid call.)

## J. The Jev block (pre-registered, committed before its first paid call)

Two parts, on Jev (`jev-latest` over TypeSafe direct). The spend caps sum to under $2.00:
- **J1** (answer accuracy) stops itself at **$0.30**. Its $0 stub run estimates $0.154.
- **J2** (matches) runs on a server with `--budget-usd 1.60`, and its runner stops launching at **$1.50**.
  #90's identical lines cost about $0.115 a match, so the 8 matches should come to about $0.95.

Code: `feat/vocab2-and-node` b48b6d7, frozen by `git archive`. Scripts, inputs and logs go on the
`data-vocab2-and-node-2026-10-02` prerelease.

### J1. Compound vs split, on real game states, truth from the sim

- **States.** I replayed #90's 24 Jev-played matches (`data-siege-fact-medium-bar-2026-10-02`; easy,
  medium, hard and the siege entrant, Jam lines) through the unchanged sim. That gave every bot's
  observation every 10 s: 7,028 states. All 24 logs replay on this branch.
  - For each condition: up to 10 states where it holds, 10 near misses (exactly one of its conditions
    fails) and 5 others.
  - The draw is seeded (20261003). The union is 476 states.
- **Wordings.** These are the 9B's own words: every multi-condition rule asked as one compound question in:
  - #98's shipped schemas (batches v3 + v4: sample entrant and easy);
  - the checked-in vocab-2 schemas (house easy, medium and hard-eco; the siege and pvp-2 entrants).

  That gives up to 3 wordings per condition, the most frequent first: **56 wordings of 20 conditions**. Each
  wording's **split** is the code's own (`translator._split_question`): the same words, one question per
  condition. A wording with no split, or a clause no oracle reads, is left out. "Kick is ready and an enemy
  bearbot is right next to me" is out because "right next to" has no exact truth.
- **Truth.** Read off the observation the description is written from:
  - afford = gold ≥ the next item's cost;
  - "in sight" = the sim's 260-unit vision, which the description lists as "Enemies within 260 units";
  - "near me" = the description's "Minions within 260 units", counting yours;
  - "inside an enemy tower's range" = `vocab.tower_facts`;
  - hp, gold, cooldowns and the match clock exactly;
  - "one of theirs is dead" = an enemy bearbot respawning.

  "I can see an enemy tower" is left out of a state that has no enemy tower within 260 but lists one out to
  390, since either reading is fair there.
- **Calls.** One Jev call per state per chunk of at most 40 questions, about an arena request's size. A
  wording's compound question and its pieces always share a call. That is safe because Jev answers each
  question on its own ([primitives](https://docs.typesafe.ai/primitives.md), "Ask multiple questions
  together").
- **Decision.**
  - A compound question fires when `noul > 0.5`.
  - A split fires when **every** piece's `noul > 0.5`: the same rule the schema server uses (§8.13).
  - Each is scored against the truth.
- **Primary outcome:** decision accuracy, compound vs split, over (state, wording) pairs, with a two-sided
  exact McNemar test on the discordant pairs. As a robustness check, a 95 % CI on the accuracy difference
  from a cluster bootstrap by state (2,000 resamples, seed 20261003).
- **Also reported:**
  - accuracy per condition, and in each stratum (holds / near miss / other);
  - false fires (the decision says yes where the truth says no) and misses;
  - each piece's accuracy against its own condition;
  - the Brier score of the compound `noul` against the truth.

  No threshold is tuned on these data.

### J2. Does play get worse? The siege entrant vs medium

- **Arms.** These are the same compile in two forms:
  - **C** = `prompts/pilots/sample-entrant-siege.schemas.json` as checked in (vocab-2, sha256 `0a4ee060…`,
    #90's "entrant3").
  - **A** = the same schemas through b48b6d7's `enforce_clause_coverage` (`make_and_schemas.py`, sha256
    `a7339fd0…`).

  It is asserted that A has the same nodes in order, the same actions, notes and build, and that only 4
  rules per instrument are split (shop, both low-hp retreats, the 480 s tower rule). The siege rule ("inside
  an enemy tower's range and that tower has your own minions") stays one question in both arms.
- **Opponent:** house medium, `prompts/pilots/house-medium-eco.schemas.json` as checked in, the same in
  both arms.
- **Lines:** #90's exactly: `--map pvp-1 --resolution simultaneous-1 --targeting own-lane-1 --recall recall-2
  --economy eco-3-late --objective river-2-set10 --cadence 2 --finale final-chorus-1`, the full 600 s.
- **Sample:** seeds 3 and 7, both sides, so 4 matches an arm and 8 in all. The plan order interleaves C and
  A, and runs 4 at a time on one private schema server on :8987.
  - A match that crashes is retried once (#90's runner).
  - Nothing is added or replayed after a result is seen.
- **Smoke, free:** `--stub` on :8988, 120 s at seed 7, each arm both sides. All 4 played with 0 errors and
  replay-verify. The A logs carry the split rules' answers as `<rule>.1` and `<rule>.2`.
- **Reported, per arm:**
  - the results and the Jam score;
  - the entrant's deaths, structure damage and enemy towers taken;
  - its decisions by kind;
  - how often each split rule fired (`reply.rule`);
  - server errors, parse errors and failovers;
  - spend from the server's ledger.

  Every log is replay-verified.
- **Flags** (investigated, not a pass/fail on 4 matches; Jev is not deterministic, PR #37):
  - A loses 2 or more matches more than C;
  - a split rule fires 0 times in A while it fires 5 or more times in C (summed over the arm);
  - any error in A that C doesn't have.
