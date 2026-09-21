# Historical specimen: read-only diagnostic

This is **not** a new Sonnet run or a cleanroom comparison entry.

Inspected game: `src/` at `ad11d516818f931b4934971038c78959cb2348f4`, unchanged during evaluation.
Captured: `2026-09-21T15:19:06.074Z`. Environment: Windows, Node `v26.4.0`, npm `11.17.0`.

Commands:

```text
npm ci
npm run build
node acceptance/adapters/historical-v1.mjs . artifacts/historical-v1-diagnostic.json
```

Build passed. npm reported two pre-existing dependency vulnerabilities (one moderate, one high).
No dependency upgrade or generated-game repair was made; do not expose this historical development
server to an untrusted network.

The adapter bundles the existing simulation and ScriptedPilot without rewriting them. It calls
the historical private `tick` method at the existing `TICK_DT`, flushing Promise microtasks between
simulated frames. That scheduler is an explicit evaluation intervention, not a browser run.

| Seed | Simulated duration | End | Bearbot deaths | Recall starts | Minions observed |
|---|---|---|---|---|---|
| 1 | 600 seconds | Timeout, draw | 0 | 38 | 360 |
| 1 (repeat) | 600 seconds | Timeout, draw | 0 | 38 | 360 |
| 42 | 600 seconds | Timeout, draw | 0 | 38 | 360 |

Each match started with six bearbots, twelve towers, and two nexuses. The first observed minion
wave was at 30 simulated seconds. The seed-1 match completed 38 recall heals; both nexuses ended
alive at 2,200 hp. The first paired keytar recalls began at approximately 52.5 seconds and moved
each bearbot nine map units that tick, consistent with movement rather than an instant teleport.

The repeated seed-1 normalized state trace matched. This is repeatability under the adapter's
scheduler, **not log-based replay evidence**. No nexus-kill demonstration passed in these runs.
The result supports the reported retreat/no-first-blood observation, but does not establish recall
as the sole cause, universal unwinnability, browser behavior, or any other model's likely output.

## Evidence identity

Local detailed report: `artifacts/historical-v1-diagnostic.json` (ignored; not a shared archive).
Report SHA-256: `f3606ecd635e9a4eedc4e32ab471d62b994b68ca206ebdaa694f4c3a9a7131b3`.

Adapter SHA-256: `62cf8fabaf23c5f03aa5d81f3c968dafb504aee6684b93cea632269e33901200`.
Seed-1 normalized trace SHA-256: `0d3ef1a41029d93e33486cf4a860f83db659537c2e47a5fcc8ba609a71657943`.

| Executed source file | SHA-256 |
|---|---|
| `src/rng.ts` | `ea3a47ecb39ebea78fe82c2465fe0ec54f52eeb8cdf320c5c9d8cadca137d907` |
| `src/sim/map.ts` | `23266f1a938cdfa490bc5d67921d57f7e686a67905de34e1203fd2e6148f9a61` |
| `src/sim/entities.ts` | `f5e013126c863b66e4614af0b96daae70b4ab5f61d721260eb7826d1f5e8c148` |
| `src/sim/match.ts` | `0784d014f8480e8ea4aa1ec1aeac1c85d84585e0645693a1d26dd704d93695db` |
| `src/pilots/scriptedPilot.ts` | `da980a4fd068f633bd4c4455e9d891bfb135b6ebfe5cc223e9a730cf7c641bdf` |

## Browser/evaluator integration check

Separately exported the historical commit into `artifacts/historical-specimen` and ran the
independent evaluator on it, staging execution outside that candidate. The evaluator used
Playwright 1.63.0 and Chromium 153.0.8010.12 (revision 1243), installed in local ignored
`artifacts/` directories, not the game package.

```text
python acceptance/evaluate.py artifacts/historical-specimen --output artifacts/historical-browser-final --execute --typecheck "npx --no-install tsc --noEmit" --browser
python acceptance/validate.py artifacts/historical-browser-final/report.json --candidate artifacts/historical-specimen
```

These commands were run using the isolated evaluator Python, with `PLAYWRIGHT_BROWSERS_PATH`
pointing at the local browser install.

Install, typecheck, build, and browser startup smoke: **pass**. No JS/console errors were
observed during the startup window. The screenshot shows the initial controls and canvas before
Start, not a running match. Candidate integrity: **unchanged**. Report validation: **pass**.
Overall game acceptance: **unverified**; no visual/gameplay gates were inferred from startup.

Candidate SHA-256: `eea520d76269cc923f8ae6808d266b0d30745e3c714817205df7abf157cd2be9`.
Report SHA-256: `0159fee332ddde2d083d279cc777c757a7c28ccae0d976e0ac5716b8216549d0`.
The report, logs, and screenshot are local under `artifacts/historical-browser-final/`, not a
published archive. The headless diagnostic above is separate evidence, not silently imported as
a browser-baseline result.
