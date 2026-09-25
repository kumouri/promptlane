#!/usr/bin/env python3
"""Automatic segment labels for prose nobody hand-labeled -- i.e. every real entrant's `pilot.md`.

`transparency.build_report` needs the prose cut into labelled segments (`rule` / `open_strategy` /
`voice` / `boilerplate`) to say which sentence each compiled rule came from and what was dropped.
`expressibility.py` has those labels *by hand* for the three reference pilots only, and
`transparency.py` refused anything else rather than guess (its docstring). The entrant compile
preview (`compile.py`, `docs/entrant-compile-preview.md`) has to take arbitrary prose, so this
module is the guess -- made explicit, deterministic, and labelled as automatic in the rendered view
so an entrant knows the categories came from a word-list, not a reader.

METHOD. Paragraphs are split on blank lines; the fixed reply-format tail (OBSERVATION / JSON /
`{"kind": ...}` / "no commentary") is `boilerplate` and never shown. Every other paragraph is cut
into sentences, and each sentence gets one label from three small cue lists:

    rule           a CONDITION cue (when/if/unless/below/nearest/off cooldown/a number...) AND an
                   ACTION cue (attack/recall/use/throw/push/an ability name...) or a game ENTITY
                   (enemy/ally/minion/tower...) -- names a state and what to do in it, the shape a
                   `noul` question + action can carry.
    open_strategy  an action or judgment cue with no condition ("don't wait for a perfect moment",
                   "walk in front") -- about the decision, but nothing Jev can be asked yes/no.
    voice          neither -- identity, tone, flavour.

Against the three hand-labelled pilots this agrees on most of the decision-bearing prose and errs
toward `rule` (see `test_segment.py` and the measured agreement in `docs/entrant-compile-preview.md`);
that bias is deliberate. A sentence wrongly called `rule` that no compiled rule traces back to shows
up under "Looked like a rule... check this by hand" -- a false alarm an entrant can dismiss in a
second. The opposite error would hide a dropped instruction under "voice", which is the failure the
transparency view exists to prevent.
"""
from __future__ import annotations

import re

Segment = tuple[str, str]  # (label, exact text), same shape as expressibility.FILES entries

_CONDITION = re.compile(
    r"\b(when|whenever|if|unless|until|once|while|before|after|the moment|the instant|as soon as|"
    r"below|above|under|over|less than|more than|fewer than|at least|at most|within|inside|outside|"
    r"in range|out of range|close enough|too close|off cooldown|on cooldown|ready|nearest|closest|"
    r"farthest|lowest|highest|weakest|softest|densest|isolated|alone|bunched|clustered|first|second|"
    r"last|only|quarter|half|third|percent|hp|health|visible|see)\b|\d|%",
    re.IGNORECASE,
)
_ACTION = re.compile(
    r"\b(attack|attacks|recall|recalls|retreat|push|move|march|walk|go|run|hold|stay|use|throw|cast|"
    r"dash|hit|focus|target|kick|fill|chord|glissando|staccato|solo|poke|commit|engage|chase|flee|"
    r"leave|leaving|back off|heal|fight|kill|finish|protect|defend|guard|follow)\b",
    re.IGNORECASE,
)
_ENTITY = re.compile(r"\b(enemy|enemies|ally|allies|minion|minions|tower|towers|nexus|bearbot|bearbots)\b", re.IGNORECASE)
_JUDGMENT = re.compile(
    r"don'?t wait|perfect moment|judg|instinct|patient|patience|careful|not free|burn|waste|"
    r"reposition|read the|pick your|feel",
    re.IGNORECASE,
)
_BOILERPLATE = re.compile(r"OBSERVATION|\{\s*\"kind\"|no commentary|just the object|reply with", re.IGNORECASE)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def label_sentence(sentence: str) -> str:
    has_condition = bool(_CONDITION.search(sentence))
    has_action = bool(_ACTION.search(sentence))
    if has_condition and (has_action or _ENTITY.search(sentence)):
        return "rule"
    if has_action or _JUDGMENT.search(sentence):
        return "open_strategy"
    return "voice"


def is_boilerplate(paragraph: str) -> bool:
    return bool(_BOILERPLATE.search(paragraph))


def auto_segments(text: str) -> list[Segment]:
    """Label every non-blank sentence of `text`. Unlike `expressibility.FILES` this does not keep
    the whitespace between segments -- nothing downstream renders it."""
    text = text.replace("\r\n", "\n")
    segments: list[Segment] = []
    for paragraph in re.split(r"\n\s*\n", text):
        if not paragraph.strip():
            continue
        if is_boilerplate(paragraph):
            segments.append(("boilerplate", paragraph))
            continue
        for sentence in _SENTENCE_END.split(paragraph.strip()):
            if sentence.strip():
                segments.append((label_sentence(sentence), sentence))
    return segments


def hand_segments_for(text: str) -> tuple[str, list[Segment]] | None:
    """`(pilot_file, segments)` when `text` is byte-for-byte one of the hand-labelled reference
    pilots (`expressibility.FILES`), so compiling `prompts/pilots/drums.md` itself uses the real
    labels and reproduces the checked-in transparency runs; `None` for anything else."""
    from expressibility import FILES

    normalized = text.replace("\r\n", "\n")
    for name, segs in FILES.items():
        if "".join(t for _, t in segs) == normalized:
            return name, segs
    return None
