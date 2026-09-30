# Prompt-evolution campaign `smoke-2026-09-30`

Created 2026-09-30T06:28:13.730Z. Spec: `docs/prompt-evolution-spec.md`. Store: `runs/evolve/smoke-2026-09-30` (git-ignored).

## Pre-registered config

```json
{
 "version": 1,
 "seed": 20260930,
 "shape": {
  "cadenceSec": 4,
  "maxSimSec": 180
 },
 "evaluation": {
  "seedsPerEpoch": 1
 },
 "population": {
  "parents": 1,
  "childrenPerParent": 2
 },
 "epoch": {
  "generations": 2,
  "opponents": "latest",
  "promotionSeeds": 8,
  "confidence": 0.95
 },
 "mutation": {
  "backend": "claude",
  "model": null,
  "maxSentenceChanges": 3,
  "attempts": 3,
  "maxTotalTokens": 30000
 },
 "compile": {
  "backend": "openrouter",
  "model": null,
  "maxTokensPerCompile": 20000
 },
 "jevSchemaEndpoint": "http://127.0.0.1:8805/",
 "matchTimeoutSec": 30,
 "name": "smoke-2026-09-30",
 "createdAt": "2026-09-30T06:28:13.730Z",
 "seedGenomes": [
  "7edc45a304cf"
 ]
}
```

**State:** next generation 1, epoch 0, opponents 7edc45a304cf, survivors d9489a934697.

**Model spend (as each backend reported it; the `claude` CLI reports a notional cost, it runs on the subscription):** mutation 2 call(s), 9,147 tokens, $0.0657; compile 12 call(s), 29,563 tokens, $0.0043. Jev spend is on the schema server's `/health`.

## Generation 0 (epoch 0) — done

Parents 7edc45a304cf; opponents 7edc45a304cf; seeds 455922465; shape cadence 4 s, 180 sim-s.

| Slot | Parent | Focus | Child | The one change |
|---|---|---|---|---|
| g0-p0-c0 | 7edc45a304cf | add one rule for a situation the prose does not cover yet | d9489a934697 | Added one sentence specifying that drums should recall when low on health and safe from immediate threats, which was previously left undefined despite the prose warning against recalling "too early." |
| g0-p0-c1 | 7edc45a304cf | swap the priority of two existing rules | d17d715bf190 | Prioritized attack targeting before lane pushing, so the bot evaluates what to fight first before deciding whether to advance. |

| Rank | Genome | Mean score | 95% CI (seed-paired) | W-D-L | Elo | Deaths own/foe | Towers lost own/foe | Aggression | Recall rate | Spread | Call errors |
|---:|---|---:|---|---|---:|---|---|---:|---:|---:|---:|
| 1 | d9489a934697 (survives) | 0.750 | n=1, no interval | 1-1-0 | 1016 | 6/6 | 0/0 | 0.540 | 0.115 | 93.5 | 0 |
| 2 | d17d715bf190 | 0.500 | n=1, no interval | 1-0-1 | 1000.7 | 6/6 | 0/0 | 0.532 | 0.077 | 162 | 0 |
| 3 | 7edc45a304cf | 0.500 | is the opponent (½ by definition) | 0-0-0 | 1000 | 0/0 | 0/0 | — | — | — | 0 |

Matches (key → result; logs in the store under `matches/`, each `npm run match -- --verify`-able):

- `2e46d461ac363ea0` seed 455922465: d9489a934697 (violet) 0.5–0.5 7edc45a304cf (green) — unfinished at 180 s, decided by draw; deaths 3-3, towers lost 0-0, call errors 0/0
- `33b86d038ccb9564` seed 455922465: 7edc45a304cf (violet) 0–1 d9489a934697 (green) — unfinished at 180 s, decided by towerHp; deaths 3-3, towers lost 0-0, call errors 0/0
- `806f7156b47e0fcb` seed 455922465: d17d715bf190 (violet) 0–1 7edc45a304cf (green) — unfinished at 180 s, decided by towerHp; deaths 3-3, towers lost 0-0, call errors 0/0
- `969891025b355974` seed 455922465: 7edc45a304cf (violet) 0–1 d17d715bf190 (green) — unfinished at 180 s, decided by towerHp; deaths 3-3, towers lost 0-0, call errors 0/0

