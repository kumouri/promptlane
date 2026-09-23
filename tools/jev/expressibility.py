#!/usr/bin/env python3
"""Measures how much of a real entrant-shaped pilot prompt is expressible as a Jev decision
schema, on the actual checked-in files -- not an estimate. Companion measurement to
`docs/jev-decision-model-research.md` §6's format-tail counts (26%/81%), same method (character
counts over the real file, not word-count guesses), applied one level deeper: instead of just
splitting "format-coaxing tail" from "everything else", this splits the *strategy* content itself
into what a Jev schema (conditions on state -> a bounded `noul`/`choice`/`score` answer, applied in
rule order) can capture and what it can't.

Scope: the three entrant-shaped reference pilots that exist in this repo and that the jam's starter
template is built from (`prompts/pilots/README.md`) -- `drums.md`, `keytar.md`, `violin.md`. There
is no `entrants/` directory in this repo; real submitted entries live in the private
`jamobair-entrants` repo, which this session has no access to (see the task brief). These three are
the real prose this repo has, in the entrant's exact contract shape (voice-driven prose ending in
the fixed OBSERVATION/reply-JSON instructions) -- not a stand-in.

METHOD. Each file is split into exact substrings (verified below to concatenate back to the
original file byte-for-byte, so there is no transcription drift) and each substring is labelled:

    boilerplate   -- the fixed "you will be handed an OBSERVATION / reply with one JSON object"
                     tail. Identical mechanism across all three files and the runner's own fixed
                     REPLY_INSTRUCTION line (`tools/arena/pages/contract.mjs`) on top of that.
                     Already measured for drums.md in the memo (26%); recomputed here per-file for
                     all three, same definition.
    rule          -- a condition on Observation state that resolves to a bounded choice: a
                     threshold ("below a quarter health"), a presence check ("an enemy bearbot is
                     close enough to touch"), an ordering ("nearest ... first, ... second, ...
                     last"), or a target selection among a visible set ("throw it at the densest
                     cluster"). All of these map onto Jev's three question primitives (`noul` for a
                     threshold/presence check, `choice` for a selection among named candidates,
                     `score` for a ranked comparison) plus rule order -- see
                     `docs/jev-decision-model-research.md` §1 for the primitives. A clause counts as
                     `rule` even when its target selection is fuzzy ("densest cluster", "clearly the
                     softest target") because Jev's `choice`/`score` types are built for exactly that
                     kind of ranked judgment among enumerated options -- the state is still bounded
                     (visible entities), even if the criterion is qualitative.
    voice         -- identity, tone, and justification prose with no decision content: what the
                     bearbot *is*, why a rule exists in-character, band/instrument metaphor. Nothing
                     here changes what action gets picked; removing it would not change the schema.
    open_strategy -- advisory prose that IS about the decision but does not reduce to a condition on
                     Observation state or a bounded choice among visible entities: patience/urgency
                     framing ("don't wait for a perfect moment"), resource-judgment with no stated
                     threshold ("it is not free, so don't burn it just because it's up"), continuous
                     positioning behavior with no discrete trigger ("keep repositioning"). The
                     difference from `rule`: a `rule` clause names *what state* decides the action; an
                     `open_strategy` clause describes *how to weigh* a decision with no named
                     threshold or enumerable candidate set, which is exactly what Jev's typed
                     questions cannot take as input (there is no free-text "use your judgment"
                     question type -- §1 of the memo lists all three primitives, and none of them is
                     that).

Every character of every file is labelled exactly once (verified by `verify_reconstruction`) so the
percentages below are a full partition of the file, not a sample.
"""
from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

Segment = tuple[str, str]  # (label, exact text)

# --- drums.md ------------------------------------------------------------------------------------

DRUMS: list[Segment] = [
    ("voice",
     "You are a bearbot on the drums. You are the beat everyone else plays over — if you drop out, the\n"
     "whole band falls apart. You are slow and you are heavy and that is the point."),
    ("voice", "\n\n"),
    ("voice",
     "Your job is not to win the fight. Your job is to BE the fight, so your squishier allies don't have\n"
     "to be."),
    ("open_strategy", " Walk in front. Take the hits meant for someone else."),
    ("rule", " When an enemy gets close to an ally,\nthat enemy is now your problem."),
    ("voice", "\n\n"),
    ("rule",
     "Kick (taunt/knockback, short range) is your favorite word. Use it the instant an enemy bearbot is\n"
     "close enough to touch — on cooldown, always, no hesitation, no overthinking."),
    ("rule", " Fill (AoE slow) is\nfor when more than one of them is bunched up near you; drop it under their feet, not yours."),
    ("voice", "\n\n"),
    ("rule", "Push the lane. march toward the enemy nexus alongside your minions unless a fight has started —\nthen the fight is the lane."),
    ("rule", " Attack whatever's nearest and threatening an ally first, the nearest\nenemy bearbot second, minions last."),
    ("voice", "\n\n"),
    ("rule", "Retreat only when you're really hurt — below a quarter health —"),
    ("voice", " because your whole reason for\nexisting is to be the thing that's still standing when the smoke clears. A drummer who recalls too\nearly let the band down."),
    ("voice", "\n\n"),
    ("boilerplate",
     'You will be handed an OBSERVATION as JSON describing what you can see: yourself, allies, visible\n'
     'enemies, nearby minions and towers, your cooldowns, the match clock. Reply with exactly one JSON\n'
     'action object and nothing else:\n\n'
     '{"kind": "move"|"attack"|"ability"|"recall"|"hold", "target"?: <entity id or {"x","y"}>, "ability"?: <ability name>}\n\n'
     'No commentary, no explanation, no markdown — just the object.\n'),
]

# --- keytar.md -----------------------------------------------------------------------------------

KEYTAR: list[Segment] = [
    ("voice",
     "You are a bearbot on the keytar. Loud, flashy, and made of paper — you win fights from a distance\n"
     "or you don't win them at all."),
    ("voice", "\n\n"),
    ("rule",
     "Never be the closest thing to an enemy. If a visible enemy is inside your attack range, that is too\n"
     "close; if one is inside melee range of you, you are already losing and should be leaving."),
    ("voice", " Your\nwhole game is standing just outside their reach while they cannot stand outside yours."),
    ("voice", "\n\n"),
    ("rule",
     "Chord (AoE burst, long range) is your headline move — throw it at the densest cluster of enemies or\n"
     "minions you can see the instant it's off cooldown,"),
    ("open_strategy", " don't wait for a \"perfect\" moment, waiting is\nhow it goes to waste."),
    ("rule",
     " Glissando (short dash, no target needed) is your panic button and your\n"
     "opener both: dash OUT when something gets close, dash IN-range-but-not-close when you want a Chord\n"
     "angle you don't have yet."),
    ("voice", "\n\n"),
    ("rule", "Poke minion waves with your basic attack while nothing else demands attention"),
    ("voice", " — free damage, free\nlane pressure, no risk from that range."),
    ("rule", " When a real fight starts, Chord first, basic-attack second,\nnever melee."),
    ("voice", "\n\n"),
    ("rule", "Recall the moment you're below a quarter health, no exceptions —"),
    ("voice", " you have no way to survive a\nfollow-up hit and a dead mage is a silent one."),
    ("voice", "\n\n"),
    ("boilerplate",
     'You will be handed an OBSERVATION as JSON: yourself, allies, visible enemies, nearby minions and\n'
     'towers, your cooldowns, the match clock. Reply with exactly one JSON action object and nothing\n'
     'else:\n\n'
     '{"kind": "move"|"attack"|"ability"|"recall"|"hold", "target"?: <entity id or {"x","y"}>, "ability"?: <ability name>}\n\n'
     'No commentary, no explanation, no markdown — just the object.\n'),
]

# --- violin.md -------------------------------------------------------------------------------------

VIOLIN: list[Segment] = [
    ("voice",
     "You are a bearbot on the violin. The bow is the blade. You are fast, you are fragile, and you exist\n"
     "to end one enemy before the rest of their band can even turn around."),
    ("voice", "\n\n"),
    ("rule",
     "Do not walk into a fight straight-on. Wait at the edge of what you can see until exactly one enemy\n"
     "is isolated — alone, or clearly the softest target in a group — then commit fully."),
    ("voice",
     " A violin that\ntrades evenly with a whole team has already failed;"),
    ("open_strategy", " you only take fights you can win in one\nphrase."),
    ("voice", "\n\n"),
    ("rule",
     "Staccato (quick high-damage stab, short range) is your opener on whoever you've picked as the\n"
     "target — use it the moment you're in range of them, every time it's off cooldown, on that same\n"
     "target if they're still alive."),
    ("rule", " Solo (burst + speed, your ultimate) is for closing distance on a\ntarget that's about to get away, or for the decisive engage when the moment is right —"),
    ("open_strategy", " it is not\nfree, so don't burn it just because it's up."),
    ("voice", "\n\n"),
    ("open_strategy",
     "Between fights, don't stand still: your speed exists so you can keep repositioning toward the next\n"
     "isolated target rather than sitting in a lane pushing minions like a bruiser would."),
    ("voice", "\n\n"),
    ("rule", "You have less HP than almost anything else on the map — the instant you drop under a quarter\nhealth, recall, no matter how close the kill looked."),
    ("voice", " A dead assassin secures nothing."),
    ("voice", "\n\n"),
    ("boilerplate",
     'You will be handed an OBSERVATION as JSON: yourself, allies, visible enemies, nearby minions and\n'
     'towers, your cooldowns, the match clock. Reply with exactly one JSON action object and nothing\n'
     'else:\n\n'
     '{"kind": "move"|"attack"|"ability"|"recall"|"hold", "target"?: <entity id or {"x","y"}>, "ability"?: <ability name>}\n\n'
     'No commentary, no explanation, no markdown — just the object.\n'),
]

FILES = {
    "drums.md": DRUMS,
    "keytar.md": KEYTAR,
    "violin.md": VIOLIN,
}

LABELS = ["rule", "open_strategy", "voice", "boilerplate"]


def verify_reconstruction() -> None:
    for name, segments in FILES.items():
        path = REPO_ROOT / "prompts" / "pilots" / name
        original = path.read_text(encoding="utf-8")
        rebuilt = "".join(text for _label, text in segments)
        if rebuilt != original:
            # find first divergence for a useful error
            for i, (a, b) in enumerate(zip(original, rebuilt)):
                if a != b:
                    raise AssertionError(
                        f"{name}: reconstruction diverges at char {i}: "
                        f"original {original[max(0,i-20):i+20]!r} vs rebuilt {rebuilt[max(0,i-20):i+20]!r}"
                    )
            raise AssertionError(
                f"{name}: reconstruction length mismatch, original={len(original)} rebuilt={len(rebuilt)}"
            )


def counts_for(name: str) -> dict:
    segments = FILES[name]
    totals = {label: 0 for label in LABELS}
    for label, text in segments:
        totals[label] += len(text)
    total = sum(totals.values())
    return {"total_chars": total, **{f"{label}_chars": totals[label] for label in LABELS},
            **{f"{label}_pct": round(100 * totals[label] / total, 1) for label in LABELS}}


def main() -> int:
    verify_reconstruction()
    rows = {name: counts_for(name) for name in FILES}
    grand = {label: sum(rows[n][f"{label}_chars"] for n in FILES) for label in LABELS}
    grand_total = sum(grand.values())

    col = "{:<12}{:>8}{:>8}{:>8}{:>8}{:>8}"
    print(col.format("file", "total", "rule", "open", "voice", "boiler"))
    for name in FILES:
        r = rows[name]
        print(col.format(
            name, r["total_chars"], f"{r['rule_pct']}%", f"{r['open_strategy_pct']}%",
            f"{r['voice_pct']}%", f"{r['boilerplate_pct']}%",
        ))
    print(col.format(
        "ALL", grand_total,
        f"{round(100*grand['rule']/grand_total,1)}%",
        f"{round(100*grand['open_strategy']/grand_total,1)}%",
        f"{round(100*grand['voice']/grand_total,1)}%",
        f"{round(100*grand['boilerplate']/grand_total,1)}%",
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
