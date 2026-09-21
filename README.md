<p align="center">
  <img src="assets/logo/jamobair-logo.png" alt="Jamobair — the promptlane mascot: a bearbot shredding a guitar in mid lane" width="360">
</p>

# promptlane

**A MOBA built from one prompt, for agents built from one prompt.**

promptlane is a small three-lane MOBA where every champion is the same bearbot chassis with a
different instrument for a weapon — and the brain driving each bearbot is an LLM agent running on a
single prompt. It exists to be *built on camera*: the first commit of the game is the prompt in
[`prompts/initial_prompt.md`](prompts/initial_prompt.md), handed to a coding agent, and everything
that follows is what one prompt could do.

The name works four ways, and all four are load-bearing:

1. a MOBA built from **one prompt**;
2. designed for **agents built from one prompt**;
3. built **promptly** — each generation is a bounded build session;
4. a **prompt** (small, because of time) version of a MOBA.

## Why

It is the demo for an AI Jam: a weekend where people who already ship with a coding agent pair with
people who want to learn, under one rule — **you may not edit the code yourself, only instruct the
agent.** promptlane is the proof that the rule isn't a handicap. The teaser video is the game being
built from `initial_prompt.md`, live, with no hands on the keyboard except to type prompts.

This repository is a reusable **fixture for the Jam**, not a disposable Jam entry. Its maintained
source is the versioned prompt and its pinned supporting inputs. Generated games are specimens:
different model-and-agent setups can produce different implementations of the same version.
The generation workflow and independent evaluator are maintained tooling, not part of those games.

## The game, in one paragraph

Two teams of bearbots. Three lanes, a river, a jungle, a nexus at each end. Every bearbot is the
same body; what makes a champion is the **instrument** (its kit) and the **agent** (its pilot):

| Role      | Instrument | What it does                                  |
|-----------|------------|-----------------------------------------------|
| Tank      | drums      | the kit is the shield; the kick is the taunt  |
| Bruiser   | bass       | low, slow, hits through everything            |
| Mage      | keytar     | ranged, flashy, squishy                       |
| Marksman  | trumpet    | line of sight, one loud note at a time        |
| Support   | harp/cello | heals in sustained chords                     |
| Assassin  | violin     | the bow is the blade; the solo is the ult     |

A team comp is a band. A bad comp is a bad mix. Every ability is a music term you will never
un-hear.

## Layout

```
prompts/             versioned build prompts; initial_prompt.md is frozen v1
generation/          pinned-input preparation, run recorder, cross-client protocol
acceptance/          independent, post-submission evaluation and evidence requirements
runs/                operator records (individual runs are local/ignored until reviewed)
artifacts/           exported workspaces and frozen submissions (local/ignored)
src/                 original generated game specimen; not maintained game source
docs/                current design notes and historical recordings; not implicit run inputs
assets/logo/         Jamobair, the mascot (PNG on black, on near-black, and transparent)
```

## Generate and compare

Start with [the generation protocol](generation/protocol.md). Operators use the same Python
standard-library recorder regardless of coding client; the
[client operator brief](generation/operator-brief.md) covers Claude Desktop and Delta.
Do not attach this full repository to a scored generator: prepare a separate input-only workspace
from the pinned v1 snapshot first. The independent evaluator stays outside that workspace.

The first comparison is v1 on `gpt-6-astra` and `gpt-5.6-sol` (High, ChatGPT subscription), alongside
operator-run `claude-fable-5.1` and `claude-opus-5`. These are comparisons of model **and harness**,
not isolated model rankings. Preparation is not a completed generation; results require a frozen
submission and independently recorded evidence. No v2 recall remedy is included in these inputs.

The presentation layer is deliberately minimal — the point is the agents and the lanes, not the art.
Jamobair (the logo) was generated, then colour-snapped to the palette by
[`assets/logo/brandify_logo.py`](assets/logo/brandify_logo.py). Palette: `#8e00ff` and `#00ff0f`
on black.

## Status

First build session landed. `npm run dev` boots a playable 3v3: diamond map (river, three lanes,
jungle, two towers/lane/side, one nexus/side), fixed-timestep sim (20 tps, seeded RNG), and all
three shipped instruments (drums/keytar/violin) with their two abilities each. `ScriptedPilot` is
the always-works baseline; `PromptPilot` builds a prompt from `prompts/pilots/<instrument>.md` +
the live `Observation` and can run on a deterministic key-free mock (`prompt-mock`) or a real
endpoint via `VITE_PILOT_ENDPOINT` (`prompt-http`, unwired this session — no key configured, and
none should ever live in a prompt or this codebase). The one page has the arena, a clock/score top
bar, a Start/Restart button, a per-bearbot pilot dropdown (Scripted / Prompt-mock / Prompt-HTTP),
and a side panel showing the selected bearbot's last prompt and reply live.

Known simplification: a nexus can be damaged directly once in range — it isn't gated behind its
lane's towers falling first. Left that way for jam-session scope; flagging it rather than quietly
calling it "done."

See ["The prompt is the source"](docs/design.md#the-prompt-is-the-source) for what versioning by
prompt means here, and why a bug gets fixed by writing the next prompt instead of patching the
code.

**Historical reported failure:** low-health retreats were observed to prevent first blood in the
teaser. The original explanation called recall an instant teleport; the checked-in implementation
actually moves toward base at increased speed and heals on arrival. This specimen stays unchanged.
The broader claim that it cannot produce a winner still needs behavioral evidence; a fresh v1
generation is not required to reproduce that failure.

An [independent headless diagnostic](runs/historical-v1.md) observed timeout draws with no bearbot
deaths for seeds 1 (twice) and 42. It documents its artificial scheduler and does not claim browser
verification or a universal cause. The same method applied to the two cleanroom Claude submissions
([comparison](runs/v1-comparison.md)) observed nexus kills on every seed, so the failure is a
property of this specimen rather than of the v1 prompt.

## License

[MIT](LICENSE).
