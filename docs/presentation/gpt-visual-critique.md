# GPT visual critique of the Elysium presentation layer

**Model:** `gpt-6.1-sol` (OpenAI), via Codex CLI 0.159.2: `codex exec -m gpt-6.1-sol --sandbox read-only`
with 14 screenshots attached (`-i`), on Ceryce's ChatGPT subscription. The session header reported
reasoning effort `none` (the CLI default; not overridden). **Date:** 2026-10-01. The model was not
refused, so the `gpt-6-sol` fallback was not needed.

**What this file is.** GPT's answer, verbatim between the two rules below; nothing in it has been
edited. The prompt it was given is in [the appendix](#appendix-the-prompt). It is an input to
[`../presentation-spec.md`](../presentation-spec.md), which says where its findings were adopted and
where they were not (§4).

**Screenshot numbering.** GPT numbers the screenshots in the order they were attached, which is not
the file-name order:

| GPT's # | File |
|---:|---|
| 1 | [`01-replay-desktop-eco-2m30.png`](01-replay-desktop-eco-2m30.png) |
| 2 | [`02-replay-selected-bot-panel.png`](02-replay-selected-bot-panel.png) |
| 3 | [`03-replay-end-green-wins-timeout.png`](03-replay-end-green-wins-timeout.png) |
| 4 | [`04-replay-bandstand-contested.png`](04-replay-bandstand-contested.png) |
| 5 | [`05-replay-end-bandstand-4-1-draw.png`](05-replay-end-bandstand-4-1-draw.png) |
| 6 | [`06-live-view.png`](06-live-view.png) |
| 7 | [`07-mobile-portrait-replay.png`](07-mobile-portrait-replay.png) |
| 8 | [`08-mobile-landscape-replay.png`](08-mobile-landscape-replay.png) |
| 9 | [`09-projector-1080p-replay.png`](09-projector-1080p-replay.png) |
| 10 | [`10-site-home.png`](10-site-home.png) |
| 11 | [`12-site-match-result.png`](12-site-match-result.png) |
| 12 | [`13-site-ladder-mobile.png`](13-site-ladder-mobile.png) |
| 13 | [`14-site-bracket.png`](14-site-bracket.png) |
| 14 | [`16-colour-vision-sim.png`](16-colour-vision-sim.png) |

The PNGs committed here are palette-quantized (96 colours) copies of the ones GPT saw; nothing else
differs.

**One error in the prompt, not GPT's:** it calls the sieged tower in screenshots 2–3 violet's
*inner* mid tower. It is the **outer** (tier-2) one, `tw-9`. GPT's answer repeats the prompt's
word. Nothing else in the prompt was found to be wrong.

---

# A. First-time spectator

The field has a coherent visual identity: black, neon teams, symmetrical lanes, simple structures. The problem is that it shows **positions much more clearly than consequences**. A newcomer can see two armies. They cannot reliably tell who is winning, what matters, or why an AI made a decision.

The right panel exposes the implementation while omitting the explanation. A prompt and a raw JSON reply are useful evidence for a debugger, but poor live storytelling.

## 1. Desktop economy replay, 2:31 elapsed

**What a newcomer cannot tell in five seconds:**

- Whether “HARD 0 — 0 MEDIUM” means kills, towers destroyed, rounds won, or something else.
- That violet is defending the left base and green the right. The geometry suggests this, but nothing explicitly establishes it.
- That `7:29` is time remaining in a ten-minute match.
- Which small circular symbol is drums, keytar, or violin. The roster provides instrument names but no usable visual legend connecting them to the field.
- Whether the green bots near violet’s inner mid tower are attacking, approaching, retreating, or recalling.
- What `L2 213g` means, or whether 213 gold is a lot.
- Why the outlined violet tower is selected while the right panel describes a pilot. Those two selection signals appear unrelated.

**What works:** The three lanes and opposing bases are immediately visible. Team ownership of structures is clear. The terrain stays quiet enough that units could become the focus with better treatment.

## 2. Selected green keytar, 5:34 elapsed

The most important story is **green is pressuring violet’s inner mid tower**. The screen makes the viewer discover that by scrutinizing tiny objects.

A newcomer cannot tell:

- Which field unit corresponds to the selected green roster row.
- The tower’s remaining health or whether the siege is making meaningful progress.
- What the keytar is currently targeting.
- Why it chose that target.
- Whether its gold and items explain its strength.
- Whether violet is responding or simply stuck elsewhere.

The raw reply contains an attack target, but an internal identifier such as `tw-9` is not a spectator explanation. “Keytar attacks Violet inner mid tower” would be.

**What works:** The selected roster row has a clear border. The problem is the missing connection between that row, the unit, its target, and its decision.

## 3. Green wins at timeout

This is the most serious screen in the set.

**“MEDIUM WINS” beside “HARD 1 — 0 MEDIUM” visually contradicts itself.** If the numbers represent towers lost, that is a valid diagnostic counter presented with the grammar of a sports score.

A newcomer cannot tell:

- Why the side with zero supposedly won.
- Which tower fell.
- That it fell at the buzzer.
- That tower survival decided the result.
- That the decisive action followed roughly seven minutes of siege.

The final frame looks much like an ordinary frame. A small green sentence at the upper left carries the entire climax.

**What works:** The result names a winner and identifies timeout. It needs a causal explanation and a result presentation that overrides the routine HUD.

## 4. Bandstand contested

“BANDSTAND CONTESTED” is the first label that connects a field object to a meaningful state. That is a good start.

A newcomer still cannot tell:

- What capturing it grants.
- Who has capture progress.
- Whether both sides are actively contesting or merely standing nearby.
- How long it remains open.
- Whether the fight is strategically important.
- What the `Bandstand 0–0` header counts.

The violet and green arcs communicate ownership or progress ambiguously. There is no legend or clear directional reading.

**What works:** The objective sits in the river and has a distinct footprint. Its location feels intentional rather than arbitrary.

## 5. Bandstand 4–1, draw

The screen invites the wrong conclusion: violet leads 4–1, yet “NOBODY WINS.”

A newcomer cannot tell:

- That Bandstand captures are benefits rather than victory points.
- Why four captures failed to produce a win.
- Which actual victory conditions tied.
- Whether either team still had Encore active.
- Whether the match ended normally or failed.

“NOBODY WINS” is funny once. At an event, **“DRAW” is clearer and more professional**.

**What works:** Objective history survives in the header. It needs subordinate placement so it does not impersonate the match score.

## 6. Live view

A newcomer cannot tell:

- That the gold halos mean Encore.
- What Encore does or how much time remains.
- Whether the upper river cluster is fighting, capturing, or leaving.
- Whether `2 S CADENCE` describes simulation speed, network updates, or AI decisions.
- Whether `Bandstand 1–0` represents the current owner or cumulative captures.

The upcoming objective label is useful but extremely small. The buff is present visually and absent semantically.

**What works:** Live status is explicit. The next Bandstand location is shown on the field before it opens, which can support anticipation.

## 7. Phone portrait

The game becomes a small diagram in a large black rectangle.

A newcomer cannot tell almost anything about individual units: roles, health, targets, items, selection, or actions. Labels overlap around the bases and mid lane.

The roster is readable, but it begins below roughly 590 pixels. The selected-pilot explanation is below the visible screen. The layout spends its best space on empty field margins and pushes the explanation out of view.

**What works:** The header wraps without obvious horizontal overflow, and roster rows remain usable touch targets. The page has adapted structurally; the field has not adapted informationally.

## 8. Phone landscape

The sidebar consumes roughly 40% of the width. The map gets smaller while prompt text is clipped into a narrow strip.

A newcomer cannot tell:

- Which unit is selected.
- What the selected pilot is doing.
- The contents of the prompt or last reply.
- Most economy labels.
- Whether the match is paused, playing, or simply static.

This is the least effective compromise: neither a useful spectator view nor a useful debugger.

**What works:** The complete map remains visible. Almost everything else needs a different compact layout.

## 9. Projector at 1080p

The larger field is substantially better. Structures have enough physical presence to read as important objects.

But from the back of a room, a newcomer will see **large colored geometry and tiny unexplained dots**.

They cannot reliably read:

- Team names or score semantics.
- Unit roles, levels, gold, or items.
- The selected pilot.
- Tower health.
- The rule that fired.
- The siege’s importance.
- The current action or recent event.

The map scales up; the HTML interface mostly stays at desktop reading size. This is a desktop view enlarged around a sidebar, not a broadcast layout.

## 10. Site home

The page explains the premise well once someone reads it. “One prompt” is the strongest concept on the page.

In five seconds, a newcomer cannot tell:

- Where to watch an interesting match immediately.
- Whether a match is live now.
- Who leads the competition.
- Whether “Test,” “Compile,” and “Contract” are necessary spectator steps.
- What the game actually looks like.

The four equal cards give an access-and-Git workflow the same prominence as watching. The densest card is “Get on the ladder,” making administrative work dominate the central area.

**What works:** Clear onboarding sequence, restrained card borders, coherent brand headings. The content is useful; its audience priority is wrong for a Jam spectator.

## 11. Match result page

“Draw · timeout” is clearer than the game’s “NOBODY WINS.”

A newcomer still cannot tell:

- Why the draw happened without interpreting several table rows.
- Whether 32 versus 29 deaths mattered.
- What happened during the match.
- Which replay moment is worth watching.
- Why model calls, parse errors, and average latency occupy more table space than the competitive story.

The terminal-style result block repeats information and adds compressed jargon.

**What works:** The replay button is prominent. Equal final nexus HP and equal towers lost are available, so the page already has the evidence needed for a plain-language result explanation.

## 12. Mobile ladder

The table extends far beyond the phone width. The last-match column is visible outside the main page’s apparent width; the standings cannot be assessed as a complete unit.

A newcomer cannot tell:

- What `0–3–0` means.
- Why three entrants with identical Elo are ranked in this order.
- Which statistics are decisive.
- Whether the hash is something they need to understand.
- How to compare rows without horizontal navigation.

**What works:** Handles and Elo are visible early. Those should form the mobile ladder’s core.

## 13. Bracket

This is two columns of match cards, not yet a visually legible tournament tree.

A newcomer cannot tell quickly:

- How the semifinal feeds the final.
- That alice’s bye is already resolved.
- Why cass advances after a draw, unless they read the small sentence.
- Whether “Run final” is a spectator control or an organizer operation.
- Whether the dropdown and “Rule” button change the official result.

The seeds table is useful background, but the organizer controls dominate the match cards.

**What works:** “cass advances (draw · fewer deaths)” is a good causal result label. Preserve that pattern.

## 14. Colour-vision simulation

The two teams remain distinguishable in these simulations:

- Protanopia: blue versus yellow.
- Deuteranopia: blue versus yellow.
- Tritanopia: muted violet versus cyan.

That is encouraging. It does **not** make the whole interface colour-blind safe.

A newcomer still cannot identify teams independently of hue, decode Encore, or understand capture state. Both teams use identical silhouettes. The muted violet side in tritanopia also loses visual force.

**What works:** This palette avoids the obvious red–green failure. The remaining accessibility problem is redundant identification and state clarity, not an urgent wholesale palette replacement.

# B. Hierarchy and clutter

## What draws the eye

Across screenshots 1–9, the brightest green nexus, purple “LOCAL MATCH” button, and neon sidebar headings compete with the actual fight. Green has a built-in luminance advantage. The raw prompt panel adds a dense block of white texture that pulls attention without delivering a fast answer.

The important action is usually a handful of tiny units somewhere inside a very large field.

**The hierarchy should be: result or imminent threat → competitive advantage → current fight/objective → selected unit explanation → detailed diagnostics.**

The current hierarchy is closer to: brand colours → permanent controls → map geometry → prompt text → tiny action.

## Noise

- Repeated “hard” and “medium” on all six roster rows.
- Full prompt text permanently visible during spectating.
- Raw JSON presented as the principal explanation.
- Gold and item abbreviations on every unit at every moment.
- Internal identifiers and file paths.
- A speed control and mode-launch controls with more visual weight than match stakes.
- Several score-like counters without labels that distinguish their meanings.

The problem is not an excessive number of units. Six champions is wonderfully manageable. The clutter comes from **low-level labels replacing useful summaries**.

## Screen real estate

Desktop has room for a strong information rail, but the rail spends most of its area on prose. Portrait has room for a readable field and a compact story card, but preserves desktop-sized vertical margins. Landscape gives too much width to a rail that cannot display its contents.

Use separate **Spectator** and **Pilot Inspector** presentations. The inspector can retain prompts, probabilities, and raw replies. Spectator mode should turn that same data into a readable account of the match.

# C. Legibility at projector distance

At 6–10 metres, screenshot 9’s field geometry survives. Most interface text does not. Exact readability depends on projected image size and room conditions; these are sensible **1080p broadcast targets**, to verify from the back row.

| Element in screenshot 9 | Current problem | Target |
|---|---|---|
| Clock | Approximately 18 px; isolated without “remaining” | 40–48 px, bold |
| Team names and central numbers | Approximately 16 px, thin and widely spaced | Names 32–40 px; principal numbers 44–56 px |
| Replay badge | Approximately 12 px | 24–28 px |
| Speed label and selector | Approximately 10–12 px | 24 px if shown; otherwise move to operator UI |
| Replay/local-match controls | Approximately 12 px | Remove from audience view; operator controls can stay desktop-sized |
| Roster lane and instrument names | Approximately 12 px | 24–28 px |
| Roster difficulty labels | Approximately 10 px | Show once per team, 24–28 px |
| “ROSTER” / “SELECTED PILOT” headings | Approximately 12 px | 24–28 px |
| Prompt filename and difficulty | Approximately 9–10 px | Omit filename from broadcast; pilot identity 28–32 px |
| Prompt body | Approximately 11 px | Replace with a 28–32 px decision caption |
| “LAST REPLY” heading | Approximately 9 px | Replace with “Current decision,” 24–28 px |
| Raw JSON | Approximately 10–11 px | Inspector only |
| Unit level/gold/item labels | Approximately 9–10 px | Selected unit only, 22–26 px; full economy in cards |
| Small base counters | Approximately 10 px | Remove or replace with explicit 24–28 px labels |
| Respawn countdown such as `13s` | Approximately 10 px | 24–28 px in a stable player card |
| Tower health bars | Thin coloured strokes without values | 8–12 px high, 48–72 px wide; numeric HP on focus |
| Champion health bars | Very small strokes | 6–8 px high minimum |
| Champion symbols | Roughly 20–25 px; interior marks disappear | 40–48 px minimum in broadcast mode |
| Minion dots | Visible as specks, role unclear | 10–14 px, with a deliberate shape distinct from projectiles |
| Selected-state outline | Too thin to survive projection | 3–4 px white outline plus a field-to-card association |
| Bandstand labels in equivalent live views | Approximately 10 px | 26–32 px objective banner |
| Win/draw text in end views | Approximately 18 px | 56–72 px result headline; 28–32 px reason |

Do not enlarge every field label simultaneously. Six enlarged economy strings would produce collisions. Put persistent information in stable cards; reserve field text for the selected unit, endangered structure, and active objective.

# D. Colour

## Team distinction

Violet versus green is **promising for colour-vision deficiency**, based on screenshot 14. It is not sufficient as the only team identifier.

Keep the brand fills, and add:

- Persistent **VIOLET / GREEN** labels with contestant names.
- Team markers on unit cards and objective ownership.
- A consistent secondary team cue, such as a single outer ring for violet and a double outer ring for green.
- White selection treatment that does not masquerade as team ownership.
- Clearly distinct role glyphs for drums, keytar, and violin.

Do not overload silhouettes: role should own the central symbol; team should own the surrounding treatment.

## Luminance imbalance

At roughly 3.6:1 versus 15:1 against black, green dominates. It looks more active and important even when game state is equal.

Concrete fixes:

- Keep `#8e00ff` for violet fills and brand accents.
- Use a pale violet or near-white for violet text and thin critical strokes.
- Give both teams equally strong neutral outlines around important units and structures.
- Reduce large areas of fully saturated green; use dark green backing with neon edges where appropriate.
- Use white for clocks, ordinary numbers, and explanatory copy. Reserve team colour for identity.
- Match scoreboard typography, area, and neutral framing on both sides.

The white structure edges already help. Violet health bars and small labels need similar support.

## Encore and economy gold

The gold glow is too subtle to explain Encore and too close to the green team’s bright visual register to be dependable. Gold economy labels also share that register and collide with one another.

Use:

- A white/gold **Encore icon** on affected player cards.
- A labelled countdown: `ENCORE 32s`.
- A clearly shaped halo or short musical pulse, not colour alone.
- A dark backing plate under any essential field label.
- White economy values with a small gold currency icon.
- Named item icons and tooltips in the inspector; readable item names in the selected card.

Gold should mean a reward or buff. It should not be the universal colour of every tiny statistic.

# E. Casting overlay

A great overlay would turn this into a contest between **two prompts making visible choices**.

## Scoreboard

Show contestant identity first, team colour second, difficulty or house-bot version third.

A useful header would contain:

- `ALICE · VIOLET` versus `HOUSE · GREEN`.
- Explicit **towers standing**, such as `6 / 6` versus `5 / 6`.
- Nexus HP bars.
- Time remaining.
- A short current advantage: `GREEN LEADS BY 1 TOWER`.
- Bandstand captures as a labelled secondary statistic.

Do not lead with kills. Under these rules, kills are an explanation of advantage, not the victory score.

If Final Chorus ships, the overlay needs an explicit phase display: `FINAL CHORUS IN 0:24`, then either the actual win reason or `SUDDEN DEATH · STRUCTURE DAMAGE ×3`. Display it only when that rule is active.

## Player cards

Six compact cards are feasible. Each should show role, health, alive/respawning state, and current action. Economy can add level and item icons.

Example:

> **GREEN KEYTAR · L3**  
> Attacking Violet inner mid tower  
> Encore: 18s

## Objective and event storytelling

Add:

- Bandstand opening countdown, active capture progress, contested state, owner, and Encore expiry.
- A short event feed for deaths, towers, captures, interrupted recalls, and phase changes.
- Persistent tower-pressure warnings when a structure is low.
- Event-linked replay bookmarks for the decisive tower loss and objective fights.

Avoid a feed entry for every attack. It should report changes in stakes.

## Momentum

Make **tower and nexus state** the primary competitive summary. Add a small team gold-difference graph when economy is enabled, with death, capture, and tower markers.

A gold lead should be labelled as gold advantage, not presented as a prediction of the winner. Screenshot 5 is exactly why objective or economy advantages must remain separate from the win condition.

## “Why did that happen?”

This is the distinctive feature the game should own.

Convert logged decisions into restrained captions:

> **Rule fired: Attack tower**  
> First matching rule selected Violet inner mid tower.

For contestant inspection:

> Recall rule did not match: model response 0.42.  
> Attack-tower rule matched: model response 0.91.

Show the actual rule wording and cascade position. Do not call those probabilities “confidence that the action is correct.” They describe model answers to rule questions.

Captions should distinguish **the rule-selected action** from observed consequences. “The pilot chose to attack” is supported by the log; “the pilot knew it could win” is not.

For the boss rush, add the current house-bot tier, challenger’s cleared tiers, and one brief description of the new opponent’s behaviour. Give the finale an obvious progression, not merely another “hard” label.

# F. Per-screenshot fixes

**Effort:** S = local visual/content change; M = component or responsive-layout work; L = new data-driven presentation or replay behaviour.

| Screenshot | Concrete fixes |
|---|---|
| **1. Desktop economy** | **S:** Label clock “remaining” and score “towers standing.” **M:** Replace permanent prompt text with a selected-unit action card. **M:** Move full gold/items into cards; show field labels only on focus. |
| **2. Selected keytar** | **S:** Add matching selection rings to the roster unit and field unit. **M:** Draw a restrained target connection and label the attacked tower. **M:** Show tower HP and the fired rule in readable language. |
| **3. Green timeout win** | **S:** Correct the score semantics and use a large result banner. **S:** State “Green wins: more towers standing at 10:00.” **L:** Bookmark and replay the final tower destruction. |
| **4. Contested Bandstand** | **S:** Add “Capture grants 45s Encore.” **M:** Replace ambiguous arcs with labelled progress and contested treatment. **M:** Add open-window and buff timers to an objective card. |
| **5. Bandstand draw** | **S:** Change headline to “DRAW.” **S:** Explain tied towers and nexus HP using actual final values. **S:** Relabel 4–1 as “Bandstand captures” and visually subordinate it. |
| **6. Live** | **S:** Simplify audience badge to “LIVE”; move cadence into details. **M:** Add Encore icon and countdown to affected cards. **M:** Promote the next Bandstand timer to a readable banner. |
| **7. Portrait** | **M:** Reduce empty field margins and put a compact scoreboard directly above the map. **M:** Replace the six-row permanent rail with a bottom selection sheet. **S:** Suppress overlapping economy strings at this size. |
| **8. Landscape** | **M:** Collapse the sidebar into a tap-open inspector. **M:** Use a compact scoreboard and selected-unit strip. **S:** Remove clipped prompt/JSON boxes from the default view. |
| **9. Projector** | **M:** Add a dedicated broadcast layout with the sizes in section C. **S:** Hide navigation and diagnostic controls. **M:** Enlarge champion glyphs and surface current actions in stable cards. |
| **10. Home** | **S:** Put “Watch live” or a featured replay before the four onboarding cards. **M:** Add a field preview with a short explanation of the win condition. **S:** Separate spectator entry points from contestant setup. |
| **11. Result** | **S:** Add a one-sentence causal result summary above replay buttons. **S:** Put competitive statistics before model diagnostics. **M:** Add event bookmarks; collapse the raw result block. |
| **12. Mobile ladder** | **M:** Use rows/cards showing rank, handle, Elo, and labelled W/D/L. **S:** Move hashes and secondary statistics into expandable details. **S:** Explain the tie-order rule where equal ratings occur. |
| **13. Bracket** | **M:** Connect progression visually and mark bye/completed/pending states. **S:** Group organizer controls separately from match outcomes. **M:** Give the pending final a clear matchup and status card. |
| **14. Colour simulations** | **S:** Strengthen violet critical strokes and use neutral text. **M:** Add redundant team and role markers. **M:** Replace colour-only Encore/objective cues with icons, labels, and timers. |

# G. Top 10

1. **Fix score semantics and result explanations.** A winner beside an apparently losing score undermines trust immediately.
2. **Create a projector layout.** Bigger map geometry alone does not make a broadcast.
3. **Replace the default prompt/JSON panel with current action and fired-rule explanation.** Make the AI premise visible.
4. **Make tower pressure and health readable.** The seven-minute siege needs a visible trajectory.
5. **Explain Bandstand and Encore through labelled states and timers.**
6. **Give selection a complete chain: roster → unit → target → decision.**
7. **Rebuild mobile spectator layouts around the map and one compact information panel.**
8. **Add a consequential event feed and replay bookmarks.**
9. **Balance team luminance and add redundant team identification.**
10. **Refocus the site on watching and understanding competition.** Improve home entry points, result storytelling, mobile standings, and bracket progression.

**The three I would ship in the two weeks before the event:**

- **Score/result clarity:** explicit towers standing, time remaining, and a large winner/draw banner with the actual tiebreak reason.
- **A restrained projector preset:** larger typography and champion glyphs, simplified sidebar, hidden operator controls, stronger neutral outlines.
- **A read-only decision card:** selected role, current target, and the actual fired rule translated into a short caption.

These use existing state and logs, leave match mechanics untouched, and directly address the three biggest audience failures: **who is winning, what can I see, and why did the bot do that?**
---

## Appendix: the prompt

Sent as the `[PROMPT]` argument, verbatim:

````markdown
You are a senior game-UI and esports-broadcast designer (think: the people who design the League of Legends / Dota 2 spectator HUDs and casting overlays). Give a hard-nosed visual critique of the screenshots attached, in the order listed below. Do not edit or run anything; this is a read-only design review.

## What you are looking at

promptlane is a tiny three-lane MOBA. Every champion is the same robot-bear chassis ("bearbot") with a different instrument: drums (tank, always top lane), keytar (mage, mid), violin (assassin, bottom). Three bearbots per team. Two teams: VIOLET (#8e00ff, base on the left) and GREEN (#00ff0f, base on the right). Those two colours are also the project's brand palette (purple primary, toxic green accent, on black). The art is deliberately procedural Canvas2D shapes (no sprites), with a fixed isometric camera.

Each bearbot is driven by an AI "pilot": a contestant writes ONE plain-English prompt; it is compiled into an ordered rule cascade, and every ~2 sim-seconds a small judgment model answers each rule's yes/no question and the first rule that holds picks the action. The match log records, per decision, which rule fired and the model's probability for every rule. Elysium is the arena website: a ladder, a bracket, a live view and a replay view of every match. Matches last 10 minutes; a destroyed nexus wins; at 10:00 the side with more towers standing wins, else nexus hp, else it is a draw. An optional economy gives gold, levels and items (the small gold text under bots, e.g. "L3 336g MA" = level 3, 336 gold, items Metronome+Amp). An optional river objective, the Bandstand, is a capture point that opens on a schedule; capturing it grants a 45 s "Encore" buff (gold glow on the bots). A planned rule, the "Final Chorus", says the side ahead on towers at 8:00 wins outright, otherwise the last two minutes are sudden death with structures taking 3x damage.

The audience: (1) a first-time spectator at an AI Jam (a hackathon) who has never seen the game, possibly watching on a projector at the back of a room or on a phone; (2) a contestant debugging why their prompt made their bot do something dumb; (3) a finale where the Jam champion climbs a "boss rush" ladder of increasingly evolved house bots.

## The screenshots, in attachment order

1. `01-replay-desktop-eco-2m30.png`: replay at 1440x900, economy match, 2:31 elapsed (clock counts DOWN from 10:00). Violet = "hard" house bot, green = "medium".
2. `02-replay-selected-bot-panel.png`: same match at 5:34 elapsed with the green keytar selected; the right panel shows that side's prompt text and the pilot's last raw reply. Green is sieging violet's inner mid tower.
3. `03-replay-end-green-wins-timeout.png`: the same match's end. Green won because violet's mid tower died at the 10:00 buzzer after a ~7-minute siege. Note the top bar reads "HARD 1 — 0 MEDIUM" next to "MEDIUM WINS (timeout)".
4. `04-replay-bandstand-contested.png`: a different match (violet = medium, green = hard) with the Bandstand contested in the river at 1:53 elapsed.
5. `05-replay-end-bandstand-4-1-draw.png`: that match's end: violet took the Bandstand 4 times to 1, and the result is "NOBODY WINS (timeout)".
6. `06-live-view.png`: the live view of a running match (badge "LIVE · 2 S CADENCE"); violet bots in the river have the Encore buff.
7. `07-mobile-portrait-replay.png`: 390x844 phone portrait.
8. `08-mobile-landscape-replay.png`: 844x390 phone landscape.
9. `09-projector-1080p-replay.png`: 1920x1080, i.e. what a projector shows; judge legibility from 6-10 metres away.
10. `10-site-home.png`: the arena site's home page.
11. `12-site-match-result.png`: a match result page on the site.
12. `13-site-ladder-mobile.png`: the ladder page at 390 px wide (full-page capture).
13. `14-site-bracket.png`: the bracket page.
14. `16-colour-vision-sim.png`: the live field simulated for normal vision, protanopia, deuteranopia and tritanopia (Machado 2009, full severity).

## What I want from you

Be concrete and specific to these pixels. No generic UX advice.

A. **First-time spectator.** For each screenshot, what can a newcomer NOT tell from the screen in 5 seconds? (who is winning and why, what each bot is doing/"thinking", gold/items, the Bandstand state, what just happened, how the match ended and why.)
B. **Hierarchy and clutter.** What draws the eye first versus what should. What is noise. Use of screen real estate.
C. **Legibility at projector distance** (screenshot 9 especially): name every element that will be unreadable at 6-10 m and give target sizes.
D. **Colour.** Is violet #8e00ff vs green #00ff0f colour-blind safe (see screenshot 14)? What about the gold Encore glow and the gold economy labels against the green team? Luminance balance between the two team colours on black (violet is ~3.6:1 against black, green ~15:1). Propose concrete fixes that keep the brand palette.
E. **Casting overlay.** What would a great casting/spectator overlay for projecting this at a live event add? Think scoreboard, momentum/gold graph, kill feed, player cards, objective timers, replays of key moments, "why did that happen" captions drawn from the per-decision rule data.
F. **Per-screenshot fixes.** For each screenshot, a short list of concrete fixes, each tagged with effort (S/M/L).
G. **Top 10.** Your ranked top 10 changes overall, highest value first, and which 3 you would ship in the two weeks before a live event without risking it.

Write it as a Markdown document with those headings. Be blunt; say where something is genuinely good too.
````
