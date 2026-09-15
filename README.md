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
3. built **promptly** — this is a jam project, not a product;
4. a **prompt** (small, because of time) version of a MOBA.

## Why

It is the demo for an AI Jam: a weekend where people who already ship with a coding agent pair with
people who want to learn, under one rule — **you may not edit the code yourself, only instruct the
agent.** promptlane is the proof that the rule isn't a handicap. The teaser video is the game being
built from `initial_prompt.md`, live, with no hands on the keyboard except to type prompts.

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
prompts/             the prompts that build and drive the game — initial_prompt.md is commit one
docs/                design notes: canon, roles, naming, what "one prompt" means here
assets/logo/         Jamobair, the mascot (PNG on black, on near-black, and transparent)
```

The presentation layer is deliberately minimal — the point is the agents and the lanes, not the art.
Jamobair (the logo) was generated, then colour-snapped to the palette by
[`assets/logo/brandify_logo.py`](assets/logo/brandify_logo.py). Palette: `#8e00ff` and `#00ff0f`
on black.

## Status

Pre-game. The repo holds the prompt, the design notes and the mascot. The first build session is
the teaser recording; its output lands here as the first code commit.

## License

[MIT](LICENSE).
