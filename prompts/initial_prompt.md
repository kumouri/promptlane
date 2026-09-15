# promptlane — the one prompt

You are building **promptlane**: a small, browser-playable, three-lane MOBA where every champion is
the same robot bear ("bearbot") with a different instrument for a weapon, and every bearbot is piloted
by an LLM agent running on a single prompt. Read `README.md` and `docs/design.md` in this repo first;
they are canon and this prompt must not contradict them.

This is a jam build being recorded live. Optimise for **a playable loop on screen within the
session**, not for architecture. The presentation layer is deliberately minimal.

## Ground rules

1. The human will not edit code by hand. Everything you need to know is here or in `docs/`; if you
   need a decision, **ask one question at a time**, state the assumption you'd make if unanswered,
   and keep going on everything that doesn't depend on it.
2. Stack: **TypeScript, Vite, HTML5 Canvas 2D.** No game engine, no physics library, no UI framework.
   `npm create vite@latest` scaffold, then your own code. Node 20+.
3. Keep it runnable at every commit: `npm run dev` must show something on screen from the first
   commit onward. Commit small, with Conventional Commit messages (`feat:`, `fix:`, `chore:`).
4. Palette: `#8e00ff` (violet), `#00ff0f` (toxic green), black background, white text. Flat shapes,
   thick outlines, chunky 8-bit-ish feel. No sprites yet — circles, rectangles and lines are fine.
5. Deterministic simulation: fixed timestep (e.g. 20 ticks/s), seeded RNG, so a match can be
   replayed from its log.

## The game

- **Map:** a diamond arena split corner-to-corner by a river; three lanes (top, mid, bottom) between
  two bases; a jungle between lanes; **two towers per lane per side** and a **nexus** in each base.
  Minimap in a corner.
- **Teams:** two teams of **three** bearbots (3v3 keeps it readable on stream).
- **Minions:** small waves walk each lane every 30 s and fight what they meet.
- **Bearbots:** one shared chassis (hp, move speed, basic attack) plus an **instrument** that defines
  the kit. Ship these three first, the rest later:
  - **Drums (Tank):** more hp; *Kick* = short-range taunt/knockback; *Fill* = brief AoE slow.
  - **Keytar (Mage):** ranged basic; *Chord* = AoE burst on a spot; *Glissando* = short dash.
  - **Violin (Assassin):** fast; *Staccato* = quick high-damage stab; *Solo* (ult) = burst + speed for 3 s.
  Every ability has a cooldown and a music-term name.
- **Win:** destroy the enemy nexus. A match is timeboxed at 10 minutes; if nobody wins, most towers
  standing wins, then nexus hp.

## The pilots (the point of the project)

Each bearbot is driven by a **Pilot**. Define one interface and two implementations:

```ts
interface Observation { /* what this bearbot can see: self, allies, visible enemies, nearby
                           minions/towers, lane, cooldowns, match clock — plain JSON, small */ }
interface Action { kind: "move" | "attack" | "ability" | "recall" | "hold"; target?: ...; ability?: string }
interface Pilot { decide(obs: Observation): Promise<Action> }
```

- **ScriptedPilot** — a simple heuristic (push lane, attack nearest, use ability when off cooldown,
  recall under 25% hp). This is the always-works baseline and the opponent for testing.
- **PromptPilot** — builds a single text prompt from the pilot's **prompt file** (`prompts/pilots/<name>.md`,
  which says who this bearbot is and how it wants to play) plus the current `Observation`, sends it
  through a pluggable `callModel(prompt: string): Promise<string>`, and parses the reply into an
  `Action`. Ship `callModel` with two adapters: a **mock** (returns a canned/deterministic action, so
  the game runs with no keys) and an **HTTP** adapter that POSTs to a URL from an env var, so any
  model endpoint can be plugged in later. Never block the simulation on the model: pilots decide on
  their own cadence (e.g. every 500 ms) and the bearbot keeps its last action until a new one arrives.
- Write **three example pilot prompts** in `prompts/pilots/` — one per shipped instrument — each
  under 40 lines, in the voice of that champion.

## UI

One page. Canvas with the arena; a top bar with the clock and team scores; each bearbot draws its
name, hp bar and instrument icon (a letter is fine); a side panel that shows the **last prompt and
reply for the selected bearbot** — this is the thing people will want to see on stream. A "Start
match" button; a pilot dropdown per bearbot (Scripted / Prompt-mock / Prompt-HTTP).

## Definition of done for this session

- `npm run dev` shows a 3v3 match between ScriptedPilots that ends with a nexus destroyed.
- Switching one bearbot to PromptPilot (mock) works and its prompt/reply shows in the side panel.
- `README.md` "Status" section updated to say what exists; `docs/design.md` untouched unless you
  found a contradiction, in which case say so instead of silently resolving it.

Start by restating the plan in ten lines and asking your single most important question. Then build.
