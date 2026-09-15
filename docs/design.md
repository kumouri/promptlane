# promptlane — design notes

Working notes, kept short on purpose. The game is built from `prompts/initial_prompt.md`; this file is
what the prompt assumes and what it must not contradict.

## Canon

- **Bearbots.** Every champion is the *same* robot-bear chassis. Not different bears — one bear,
  many instruments. The thing that differs between champions is the instrument (the kit) and the
  agent driving it (the pilot).
- **The brain is remote.** A bearbot's pilot is an LLM agent operating on a single prompt. "Picking a
  champion" is choosing which prompt drives the chassis. The lore *is* the architecture: chassis =
  harness, instrument = tool set, LLM = pilot.
- **Instruments are weapons.** Role map (a starting point, not a rulebook):

  | Role     | Instrument  | Kit sketch                                      |
  |----------|-------------|-------------------------------------------------|
  | Tank     | drums       | kit as shield; kick = taunt; fill = crowd control |
  | Bruiser  | bass        | slow, heavy, pierces; sustain = lifesteal        |
  | Mage     | keytar      | ranged burst; chords = AoE; glissando = dash     |
  | Marksman | trumpet     | long line-of-sight shot; one loud note at a time |
  | Support  | harp / cello| sustained-chord heals; a rest = shield           |
  | Assassin | violin      | bow = blade; the solo is the ult                 |

- **Comp = band.** Team composition is a band; a bad comp is a bad mix. Every ability name is a
  music term.
- **Names** are bear puns with instruments in them: Bearitone, Grizzly Riff, Kodiak Kick, Ursa
  Minor (piccolo). Add freely; keep them pronounceable on stream.

## The map

Classic MOBA diamond: two bases at opposite corners, three lanes (top / mid / bottom), a river
corner-to-corner, jungle between the lanes, towers along each lane, a nexus at each base. The logo
(`assets/logo/`) is that map with Jamobair standing in mid.

## "One prompt" — what it means here

- The **game** is built from one prompt (`prompts/initial_prompt.md`) handed to a coding agent. The
  human may steer with follow-up prompts; the human may not edit code by hand. A hand-touched file
  is a prompt that wasn't written down.
- Each **champion pilot** is one prompt. The pilot prompt gets the bearbot's instrument, the game
  state the engine exposes, and a fixed action vocabulary; it returns an action. Prompts live in
  `prompts/pilots/` once they exist.
- Presentation layer stays minimal: 2D, top-down, flat shapes, the palette below. Chunky
  8-bit-ish flat style is welcome; polish is not the point.

## Palette

`#8e00ff` (electric violet) and `#00ff0f` (toxic green) on black, white for text. The mascot was
generated and then colour-snapped onto exactly those two hex values by `assets/logo/brandify_logo.py`
(hue → brand hue, lightness kept, saturation scaled).

## Naming provenance

promptlane, "Just a Machine" (JAM) and jamoba came out of an assistant brainstorm; **jamobair** is the
project author's — jamoba + "ir", which reads as *jamo-bear*. The mascot is Jamobair.
