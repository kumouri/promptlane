#!/usr/bin/env python3
"""The economy's item facts, read from `src/economy/eco-2.json` -- the single source of truth the TS
economy layer reads too (`docs/economy-spec.md` §3.7) -- plus the one validator the translator, the
transparency view and `describe_observation` share: `normalize_build`.

Nothing here is a copy of a constant. Item keys, display names, costs, `gives`/`givesUp` text, the
slot count and the per-instrument default builds are all looked up in the JSON, so editing it
changes the translator prompt, the shopping-list line and Jev's observation text together.

`normalize_build` is the item-name analogue of `number_normalize.py`: a fixed, deterministic,
tolerant matcher (case, punctuation, spacing, "the"/"a", a plural "s"), not an LLM call -- so what
an entrant wrote ("amp, then the bass strings") and what the schema holds are linked by something
testable. Standard library only.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

# The tuned ruleset. Its items, slots and default builds are eco-1's exactly (only gold changed,
# `docs/economy-spec.md` §12.1; `test_economy_rules` checks it), so the translator's items block is
# right for a match on either.
ECONOMY_PATH = Path(__file__).resolve().parents[2] / "src" / "economy" / "eco-2.json"

# Every validation note this module writes starts with this, so renderers can file them apart from
# the priority-guard and instrument-scope notes.
NOTE_PREFIX = "build:"


@lru_cache(maxsize=1)
def load_economy() -> dict:
    return json.loads(ECONOMY_PATH.read_text(encoding="utf-8"))


def items() -> dict[str, dict]:
    """Item key -> {"name", "cost", "gives", "givesUp", "mods"}, in the ruleset file's order."""
    return load_economy()["items"]


def slots() -> int:
    return int(load_economy()["shop"]["slots"])


def default_build(instrument: str) -> tuple[str, ...]:
    return tuple(load_economy()["defaultBuilds"].get(instrument, ()))


def item_name(key: str) -> str:
    """Display name for an item key; an unknown key is returned as-is (never raises -- this is
    used while describing an observation, where a stray key must not break a decision)."""
    item = items().get(key)
    return item["name"] if item else key


def item_lines() -> list[str]:
    """One prompt line per item: name, key, cost, what it gives, what it gives up."""
    return [
        f'  "{key}" -- {it["name"]}, {it["cost"]} gold; gives: {it["gives"]}; gives up: {it["givesUp"]}'
        for key, it in items().items()
    ]


def format_build(build: tuple[str, ...]) -> str:
    return " → ".join(item_name(k) for k in build)


_FILLER = frozenset({"the", "a", "an", "some", "my", "your"})


def _fold(text: str) -> str:
    """Lower-case, punctuation to spaces, filler words and a trailing plural 's' dropped, spaces
    removed: "The Bass Strings!", "bass-string" and "bassstrings" all fold to "bassstring"."""
    words = [w for w in re.sub(r"[^a-z0-9]+", " ", text.lower()).split() if w not in _FILLER]
    if words and len(words[-1]) > 3 and words[-1].endswith("s") and not words[-1].endswith("ss"):
        words[-1] = words[-1][:-1]
    return "".join(words)


@lru_cache(maxsize=1)
def _lookup() -> dict[str, str]:
    table: dict[str, str] = {}
    for key, it in items().items():
        table[_fold(key)] = key
        table[_fold(it["name"])] = key
    return table


def resolve_item(text: str) -> str | None:
    """The item key a name, key or tolerant variant of either refers to, or None."""
    return _lookup().get(_fold(text)) if isinstance(text, str) else None


def normalize_build(raw, instrument: str) -> tuple[tuple[str, ...] | None, tuple[str, ...]]:
    """`raw` is whatever the model put under "build" (a list of names/keys; a single comma/arrow/
    "then"-separated string is tolerated). Returns `(build, notes)`: an ordered tuple of unique item
    keys, at most `slots()` long, or None when nothing usable is left (the instrument's default
    build applies). Unknown and repeated items are dropped, an over-long list is cut at the slot
    count, each with a plain-English note -- the entrant sees them. `raw=None` is the model saying
    "the prose names no items": (None, ())."""
    if raw is None:
        return None, ()
    notes: list[str] = []
    if isinstance(raw, str):
        raw = [p for p in re.split(r"\s*(?:,|;|->|→|>|\bthen\b|\band\b)\s*", raw) if p.strip()]
    if not isinstance(raw, (list, tuple)):
        return None, (f"{NOTE_PREFIX} the translator's shopping list was not a list ({raw!r}) and was ignored.",)

    keys: list[str] = []
    for entry in raw:
        key = resolve_item(entry)
        if key is None:
            notes.append(f"{NOTE_PREFIX} dropped {entry!r} from the shopping list -- it is not an item in this game ({', '.join(it['name'] for it in items().values())}).")
        elif key in keys:
            notes.append(f"{NOTE_PREFIX} dropped a repeat of {item_name(key)} from the shopping list -- an item can only be bought once.")
        else:
            keys.append(key)
    if len(keys) > slots():
        cut = keys[slots():]
        keys = keys[: slots()]
        notes.append(
            f"{NOTE_PREFIX} the shopping list had more items than the {slots()} slots; kept the first {slots()} "
            f"and dropped {', '.join(item_name(k) for k in cut)}."
        )
    if not keys:
        if raw:
            notes.append(f"{NOTE_PREFIX} nothing usable was left of the shopping list, so the {instrument} default build applies.")
        return None, tuple(notes)
    return tuple(keys), tuple(notes)
