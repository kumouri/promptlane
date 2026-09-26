#!/usr/bin/env python3
"""Deterministic number-word normalization for the provenance/trace overlap check ONLY.

`translator.enforce_absolute_priority` and `transparency.build_report` both trace a rule back to the
prose sentence(s) it came from by token overlap (`translator._tokenize` / `_rule_tokens` /
`_match_rule_for_paragraph`, reused at finer grain by `transparency._best_match`). That overlap check
fails on a real, observed case: violin.md's prose says "below a quarter health"; the translated
rule's condition says "is this bot's hp below a quarter of its max hp?" (traces fine, same words) --
but when the translator instead phrases the SAME rule numerically, e.g. "is hp below 25% of max?",
plain word overlap sees no shared token between "quarter" and "25" at all, and the rule shows up as
"⚠ no strong match" even though it is a correct, faithful translation of that exact sentence. This
module normalizes both sides into the same numeral form before tokenizing, for the trace/overlap
check only -- never for the prose an entrant reads. `render_markdown` / `render_report_markdown`
still quote the entrant's prose byte-for-byte.

DESIGN, per Ceryce's ruling (`docs/translator-guards-and-defaults-spec.md` §4): a fixed, deterministic
lookup table, not an LLM call -- so it is testable and its behavior on any given input is exactly
reproducible, unlike the translator's own sampled output. Scope is deliberately narrow: only the
fraction/count words this repo's three reference pilots and Jev's own numeric-condition style
actually use, not a general English number parser.

NON-QUANTITY EXCLUSIONS -- the hard part. Not every number word denotes a game-state quantity:

    - Ordinals ("first", "second", "third", "last") are excluded from the word->digit map entirely.
      Two real pilots use them for PRIORITY/SEQUENCE, not a count or threshold: keytar.md ("Chord
      first, basic-attack second, never melee") and drums.md ("...threatening an ally first, the
      nearest enemy bearbot second, minions last"). Mapping "third" to a digit is also ambiguous on
      its own terms -- it is both an ordinal (3rd in a list) and a fraction word (1/3) in ordinary
      English, and this repo's pilots only ever use it as the former. Excluding it entirely is safer
      than guessing which sense applies from local context.
    - Fixed idiomatic phrases that contain a number word but name something other than a quantity are
      protected by an exact-substring exclusion list (`NON_QUANTITY_PHRASES`) checked BEFORE
      word-level substitution: violin.md's "you only take fights you can win in one phrase" -- "one
      phrase" means a single exchange/combo, not a countable game entity, and normalizing it to "1
      phrase" would risk a spurious token match against an unrelated rule that happens to mention the
      literal count 1 (e.g. "exactly one enemy is isolated").

Only fraction/whole-number words that appear as a direct, unqualified quantity are normalized:
"quarter"/"half" (both real pilots' recall-threshold wording), and the digits one through ten plus
"hundred" (covers "more than one", enemy counts, and any pilot that spells a small count as a word).
Nothing here attempts semantic inference ("more than one" implying a threshold of 2) -- that is a
known, named gap, not silently patched over (see the module's test file for the exact cases this
does and does not resolve).
"""
from __future__ import annotations

import re

# Fraction/whole-number words -> their digit-string form, for trace-overlap tokenizing only.
# Deliberately EXCLUDES ordinals (first/second/third/last) -- see module docstring.
NUMBER_WORD_VALUES: dict[str, str] = {
    "quarter": "25",
    "half": "50",
    "three-quarters": "75",
    "three quarters": "75",
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "hundred": "100",
}

# Exact lowercase phrases where a number word inside means something other than a game-state
# quantity. Checked (and blanked out) before word-level substitution, so the number word inside
# survives unnormalized. Add to this list as new non-quantity idioms are found -- it is meant to
# grow, not to be exhaustive on day one.
NON_QUANTITY_PHRASES: tuple[str, ...] = (
    "one phrase",  # violin.md: "win in one phrase" -- a single exchange, not a count
    "one moment",
    "at once",
)

_PROTECT_TOKEN = "\x00"  # never appears in prose; used to blank protected spans during substitution


def _protect_non_quantity_phrases(lower_text: str) -> tuple[str, list[str]]:
    """Replaces every `NON_QUANTITY_PHRASES` match with `_PROTECT_TOKEN` repeated to the same length
    (so later regex offsets aren't disturbed), returning the blanked text and the list of original
    phrases in order, to be restored after number substitution."""
    saved: list[str] = []

    def _blank(m: re.Match) -> str:
        saved.append(m.group(0))
        return _PROTECT_TOKEN * len(m.group(0))

    pattern = "|".join(re.escape(p) for p in NON_QUANTITY_PHRASES)
    blanked = re.sub(pattern, _blank, lower_text) if pattern else lower_text
    return blanked, saved


def _restore_protected_phrases(text: str, saved: list[str]) -> str:
    for phrase in saved:
        text = text.replace(_PROTECT_TOKEN * len(phrase), phrase, 1)
    return text


# Longest-first, word-boundary matches so "three-quarters"/"three quarters" beat a bare "three".
_NUMBER_WORD_PATTERN = re.compile(
    r"\b(" + "|".join(sorted((re.escape(k) for k in NUMBER_WORD_VALUES), key=len, reverse=True)) + r")\b"
)


def normalize_numbers_for_trace(text: str) -> str:
    """Lowercases `text` and replaces each recognized number word with its digit-string form, except
    inside `NON_QUANTITY_PHRASES`. Output is for tokenizing/overlap comparison only -- never rendered
    to an entrant. Idempotent: running it twice gives the same result as running it once, since digit
    strings aren't themselves in `NUMBER_WORD_VALUES`."""
    lower = text.lower()
    blanked, saved = _protect_non_quantity_phrases(lower)
    substituted = _NUMBER_WORD_PATTERN.sub(lambda m: NUMBER_WORD_VALUES[m.group(1)], blanked)
    return _restore_protected_phrases(substituted, saved)
