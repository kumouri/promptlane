#!/usr/bin/env python3
"""The economy's item facts, read from the ruleset files in `src/economy/` -- the single source of
truth the TS economy layer reads too (`docs/economy-spec.md` §3.7) -- plus the one validator the
translator, the transparency view and `describe_observation` share: `normalize_build`.

WHICH RULESET. Every function takes an optional ruleset name (`economy`, the file stem: "eco-3",
"eco-3-late", ...). `None` means `DEFAULT_ECONOMY`, the shipped Jam ruleset. An unknown name raises
a ValueError that lists the files there are. (Until the late-game spec, this module read
`eco-2.json` whatever was being compiled for -- harmless while every ruleset had the same items,
wrong as soon as one doesn't: `docs/late-game-economy-spec.md` §7.4.)

Nothing here is a copy of a constant. Item keys, display names, costs, `gives`/`givesUp` text, tiers
and recipes (`tier`, `from`), the slot count, the plan cut (`shop.planSteps`) and the per-instrument
default builds are all looked up in the JSON, so editing it changes the translator prompt, the
shopping-list line and Jev's observation text together.

RECIPES. A ruleset "has recipes" when any item has a non-empty `from` (`has_recipes`, the same test
as `hasRecipes` in `src/economy.ts`). Without recipes every function here behaves exactly as it did
before recipes existed, byte for byte. With them, a shopping list names items of any tier and
`expand_build` -- a step-for-step mirror of `expandBuild` in `src/economy.ts`, both run against
`tools/match/build_expansion_cases.json` -- fills in parts, walks slots and cuts the plan
(`docs/late-game-economy-spec.md` §2.5).

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

ECONOMY_DIR = Path(__file__).resolve().parents[2] / "src" / "economy"

# The shipped Jam ruleset. Its items, slots and default builds are eco-2's (and eco-1's) exactly --
# only gold changed (`test_economy_rules` pins it) -- so every pre-recipe output is the same under it.
DEFAULT_ECONOMY = "eco-3"

# Every validation note this module writes starts with this, so renderers can file them apart from
# the priority-guard and instrument-scope notes.
NOTE_PREFIX = "build:"


@lru_cache(maxsize=1)
def known_economies() -> tuple[str, ...]:
    """Every ruleset name there is: the stems of `src/economy/*.json`, sorted."""
    return tuple(sorted(p.stem for p in ECONOMY_DIR.glob("*.json")))


@lru_cache(maxsize=None)
def _read(name: str) -> dict:
    if name not in known_economies():
        raise ValueError(f"unknown economy {name!r}; the rulesets are: {', '.join(known_economies())}")
    return json.loads((ECONOMY_DIR / f"{name}.json").read_text(encoding="utf-8"))


def load_economy(economy: str | None = None) -> dict:
    """The whole ruleset file for `economy` (None = `DEFAULT_ECONOMY`), cached per name."""
    return _read(economy or DEFAULT_ECONOMY)


def items(economy: str | None = None) -> dict[str, dict]:
    """Item key -> {"name", "cost", "gives", "givesUp", "mods", and "tier"/"from"/"abbr" where the
    ruleset has them}, in the ruleset file's order."""
    return load_economy(economy)["items"]


def slots(economy: str | None = None) -> int:
    return int(load_economy(economy)["shop"]["slots"])


def max_plan_steps(economy: str | None = None) -> int | None:
    """Where a recipe ruleset cuts a shopping plan (`shop.planSteps`), or None for no cut."""
    steps = load_economy(economy)["shop"].get("planSteps")
    return None if steps is None else int(steps)


def default_build(instrument: str, economy: str | None = None) -> tuple[str, ...]:
    return tuple(load_economy(economy)["defaultBuilds"].get(instrument, ()))


def has_recipes(economy: str | None = None) -> bool:
    """Whether any item is made from others. A ruleset without recipes runs every pre-recipe path."""
    return any(it.get("from") for it in items(economy).values())


def _find_item(key: str, economy: str | None = None) -> dict | None:
    """`key`'s item: from the selected ruleset, else from any ruleset file (item keys are unique
    across files), else None. Describing an observation must not depend on knowing which ruleset
    the match runs: an eco-3-late bot holding a Backline is still described as holding one."""
    found = items(economy).get(key)
    if found is not None:
        return found
    for name in known_economies():
        try:
            found = _read(name)["items"].get(key)
        except (OSError, ValueError, KeyError):
            continue
        if found is not None:
            return found
    return None


def item_name(key: str, economy: str | None = None) -> str:
    """Display name for an item key; an unknown key is returned as-is (never raises -- this is
    used while describing an observation, where a stray key must not break a decision)."""
    try:
        item = _find_item(key, economy)
    except (ValueError, TypeError):
        item = None
    return item["name"] if item else key


def item_tier(key: str, economy: str | None = None) -> int:
    """1, 2 or 3; 1 for an item without `tier` and for an unknown key (as `itemTier` in the TS)."""
    try:
        item = _find_item(key, economy)
    except (ValueError, TypeError):
        item = None
    return int(item.get("tier", 1)) if item else 1


def item_from(key: str, economy: str | None = None) -> tuple[str, ...]:
    """The keys `key` is made from (two for a recipe, one for an upgrade), or () for a tier-1 item
    or an unknown key."""
    try:
        item = _find_item(key, economy)
    except (ValueError, TypeError):
        item = None
    return tuple(item.get("from") or ()) if item else ()


def total_cost(key: str, economy: str | None = None) -> int:
    """Everything that went into an item: its own step's cost plus its parts' totals (`totalCost`)."""
    item = _find_item(key, economy)
    if item is None:
        raise KeyError(f"unknown item {key!r}")
    return int(item["cost"]) + sum(total_cost(k, economy) for k in item.get("from") or ())


def join_names(names) -> str:
    """"A", "A and B", "A, B and C"."""
    names = list(names)
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _made_from(key: str, economy: str | None) -> str:
    """"Road Case and Bass Strings", or for an upgrade "Backline, made from Road Case and Bass
    Strings" -- the whole tree under `key`, in words."""
    parts = item_from(key, economy)
    if len(parts) == 1 and item_from(parts[0], economy):
        return f"{item_name(parts[0], economy)}, made from {_made_from(parts[0], economy)}"
    return join_names(item_name(p, economy) for p in parts)


def item_lines(economy: str | None = None) -> list[str]:
    """Prompt lines for the items block, generated from the ruleset. Without recipes: one line per
    item (key, name, cost, what it gives, what it gives up). With recipes: grouped by tier under a
    header each, a recipe or upgrade naming what it is made from and its total cost."""
    its = items(economy)
    if not has_recipes(economy):
        return [
            f'  "{key}" -- {it["name"]}, {it["cost"]} gold; gives: {it["gives"]}; gives up: {it["givesUp"]}'
            for key, it in its.items()
        ]
    headers = {
        1: "  Tier 1 -- bought outright; each takes a slot:",
        2: "  Tier 2 -- recipes: own both parts, pay the recipe cost at the base; the parts are used up, so combining frees a slot:",
        3: "  Tier 3 -- upgrades: own the tier-2 item, pay the upgrade cost at the base; slots don't change:",
    }
    lines: list[str] = []
    for tier in sorted({item_tier(k, economy) for k in its}):
        lines.append(headers.get(tier, f"  Tier {tier}:"))
        for key, it in its.items():
            if item_tier(key, economy) != tier:
                continue
            parts = [item_name(p, economy) for p in it.get("from") or ()]
            tail = f'gives: {it["gives"]}; gives up: {it["givesUp"]}'
            if not parts:
                lines.append(f'  "{key}" -- {it["name"]}, {it["cost"]} gold; {tail}')
            elif len(parts) == 1:
                lines.append(f'  "{key}" -- {it["name"]}, upgrade of {parts[0]} + {it["cost"]} gold ({total_cost(key, economy)} in all); {tail}')
            else:
                lines.append(f'  "{key}" -- {it["name"]}, recipe: {" + ".join(parts)} + {it["cost"]} gold ({total_cost(key, economy)} in all); {tail}')
    return lines


def items_prompt_block(economy: str | None = None) -> str:
    """The translator prompt's whole ITEMS section (`translator._translation_prompt`): header, item
    lines and the instruction for "build". Without recipes it is the pre-recipe text exactly; with
    them it states the slot rule ("combining two items into a recipe frees a slot") and asks for the
    items in the prose's order, any tier, since parts are filled in (late-game spec §7.4)."""
    lines = "\n".join(item_lines(economy))
    if not has_recipes(economy):
        return f"""ITEMS a bearbot can buy at its base (at most {slots(economy)} per bearbot, bought in order):
{lines}
If the prose names items or a shopping order, emit "build" in that order; otherwise omit it. "build" is
a top-level key next to "rules", a list of item keys from the list above, e.g. "build": ["amp", "road-case"]."""
    its = items(economy)
    top = max(its, key=lambda k: (item_tier(k, economy), -list(its).index(k)))
    example, _ = expand_build([top], "", economy)
    return f"""ITEMS a bearbot can buy at its base ({slots(economy)} slots; combining two items into a recipe frees a slot; bought in order):
{lines}
If the prose names items or a shopping order, emit "build" as the items in the order the prose wants them,
any tier; parts are filled in for you (e.g. "build": ["{top}"] buys {" then ".join(item_name(k, economy) for k in example)}).
Otherwise omit it. "build" is a top-level key next to "rules", a list of item keys from the list above."""


def format_build(build: tuple[str, ...], economy: str | None = None) -> str:
    return " → ".join(item_name(k, economy) for k in build)


_FILLER = frozenset({"the", "a", "an", "some", "my", "your"})


def _fold(text: str) -> str:
    """Lower-case, punctuation to spaces, filler words and a trailing plural 's' dropped, spaces
    removed: "The Bass Strings!", "bass-string" and "bassstrings" all fold to "bassstring"; "the
    click track" and "Click-Tracks" to "clicktrack"; "Wall of Sound" to "wallofsound"."""
    words = [w for w in re.sub(r"[^a-z0-9]+", " ", text.lower()).split() if w not in _FILLER]
    if words and len(words[-1]) > 3 and words[-1].endswith("s") and not words[-1].endswith("ss"):
        words[-1] = words[-1][:-1]
    return "".join(words)


@lru_cache(maxsize=None)
def _lookup(economy: str) -> dict[str, str]:
    table: dict[str, str] = {}
    for key, it in items(economy).items():
        table[_fold(key)] = key
        table[_fold(it["name"])] = key
    return table


def resolve_item(text: str, economy: str | None = None) -> str | None:
    """The item key a name, key or tolerant variant of either refers to, or None."""
    return _lookup(economy or DEFAULT_ECONOMY).get(_fold(text)) if isinstance(text, str) else None


def _expand(keys, instrument: str, economy: str | None, steps_cap: int | None):
    """`expand_build`, plus what `normalize_build` needs on top: each note carries a third field
    (for "parts-added", the steps added before the entry), and the declared keys that were not
    skipped as repeats are returned too. `keys` may hold None for an entry that named no item."""
    its = items(economy)
    notes: list[tuple[str, str | None, tuple[str, ...]]] = []
    held: list[str] = []
    steps: list[str] = []
    kept: list[str] = []

    def frm(k: str) -> list[str]:
        return list(its[k].get("from") or ())

    def add(key: str, declared: bool) -> None:
        if key in held:
            if declared:
                notes.append(("repeat", key, ()))
            return
        if declared:
            kept.append(key)
        before = len(steps)
        for part in frm(key):
            add(part, False)
        for part in frm(key):
            held.remove(part)
        if declared and len(steps) > before:
            notes.append(("parts-added", key, tuple(steps[before:])))
        held.append(key)
        steps.append(key)

    for key in keys or ():
        if key is not None and key in its:
            add(key, True)
        else:
            notes.append(("unknown", None, ()))

    inv: list[str] = []
    plan: list[str] = []
    for key in steps:
        parts = frm(key)
        if not parts:
            if len(inv) >= int(load_economy(economy)["shop"]["slots"]):
                notes.append(("no-slot", key, ()))
                continue
            inv.append(key)
        else:
            if not all(p in inv for p in parts):
                notes.append(("parts-missing", key, ()))
                continue
            inv[inv.index(parts[0])] = key
            for p in parts[1:]:
                inv.remove(p)
        plan.append(key)

    if steps_cap is not None and len(plan) > steps_cap:
        plan = plan[:steps_cap]
        notes.append(("cut", None, ()))
    if not plan:
        if keys:
            notes.append(("default", None, ()))
        plan = list(default_build(instrument, economy))
    return plan, notes, kept


def expand_build(keys, instrument: str, economy: str | None = None, plan_steps: int | None = None):
    """A recipe ruleset's shopping plan (late-game spec §2.5), step for step the TS `expandBuild`:

    1. Walk the declared keys in order. A key the plan already holds at that point is skipped
       ("repeat"); otherwise its recipe tree is added depth-first, parts in their `from` order,
       then the key ("parts-added" when anything was added for it). A key the ruleset doesn't have
       is skipped ("unknown", key None).
    2. Walk that plan from an empty inventory: a tier-1 step needing a slot beyond `shop.slots` is
       dropped ("no-slot"), and so is a recipe or upgrade whose parts aren't held by then
       ("parts-missing"). A recipe takes its first part's place; its other parts leave.
    3. Cut the plan at `plan_steps` (default: the ruleset's `shop.planSteps`; none = no cut) ("cut").
    4. Nothing left means the instrument's default ladder ("default", only if anything was declared).

    Returns `(plan, notes)`: a tuple of keys and a tuple of `(kind, key | None)`, in writing order."""
    cap = plan_steps if plan_steps is not None else max_plan_steps(economy)
    plan, notes, _ = _expand(list(keys or ()), instrument, economy, cap)
    return tuple(plan), tuple((kind, key) for kind, key, _ in notes)


def normalize_build(raw, instrument: str, economy: str | None = None) -> tuple[tuple[str, ...] | None, tuple[str, ...]]:
    """`raw` is whatever the model put under "build" (a list of names/keys; a single comma/arrow/
    "then"-separated string is tolerated). Returns `(build, notes)`; `raw=None` is the model saying
    "the prose names no items": (None, ()). Notes are plain English -- the entrant sees them.

    Without recipes: an ordered tuple of unique item keys, at most `slots()` long, or None when
    nothing usable is left (the instrument's default build applies). Unknown and repeated items are
    dropped and an over-long list is cut at the slot count, each with a note.

    With recipes (`has_recipes`): names of any tier are accepted, unknown ones dropped, and the list
    is run through `expand_build` for the notes (parts filled in, no free slot, parts not held, a
    repeat of a held item, the plan cut). The returned build is what was DECLARED, less unknown
    entries and skipped repeats -- expansion happens again at match start (`resolveBuild`), so the
    wire format doesn't change (late-game spec §7.4) -- or None when nothing usable is left."""
    if raw is None:
        return None, ()
    notes: list[str] = []
    if isinstance(raw, str):
        raw = [p for p in re.split(r"\s*(?:,|;|->|→|>|\bthen\b|\band\b)\s*", raw) if p.strip()]
    if not isinstance(raw, (list, tuple)):
        return None, (f"{NOTE_PREFIX} the translator's shopping list was not a list ({raw!r}) and was ignored.",)

    if has_recipes(economy):
        return _normalize_recipe_build(raw, instrument, economy)

    keys: list[str] = []
    for entry in raw:
        key = resolve_item(entry, economy)
        if key is None:
            notes.append(f"{NOTE_PREFIX} dropped {entry!r} from the shopping list -- it is not an item in this game ({', '.join(it['name'] for it in items(economy).values())}).")
        elif key in keys:
            notes.append(f"{NOTE_PREFIX} dropped a repeat of {item_name(key, economy)} from the shopping list -- an item can only be bought once.")
        else:
            keys.append(key)
    n = slots(economy)
    if len(keys) > n:
        cut = keys[n:]
        keys = keys[:n]
        notes.append(
            f"{NOTE_PREFIX} the shopping list had more items than the {n} slots; kept the first {n} "
            f"and dropped {', '.join(item_name(k, economy) for k in cut)}."
        )
    if not keys:
        if raw:
            notes.append(f"{NOTE_PREFIX} nothing usable was left of the shopping list, so the {instrument} default build applies.")
        return None, tuple(notes)
    return tuple(keys), tuple(notes)


def _normalize_recipe_build(raw, instrument: str, economy: str | None):
    resolved = [resolve_item(entry, economy) for entry in raw]
    unknown = iter(entry for entry, key in zip(raw, resolved) if key is None)
    cap = max_plan_steps(economy)
    _plan, kinds, kept = _expand(resolved, instrument, economy, cap)
    name = lambda k: item_name(k, economy)  # noqa: E731
    notes: list[str] = []
    for kind, key, added in kinds:
        if kind == "unknown":
            notes.append(f"{NOTE_PREFIX} dropped {next(unknown)!r} from the shopping list -- it is not an item in this game ({', '.join(it['name'] for it in items(economy).values())}).")
        elif kind == "repeat":
            notes.append(f"{NOTE_PREFIX} dropped a repeat of {name(key)} from the shopping list -- you can't hold two of the same item at once.")
        elif kind == "parts-added":
            tree: list[str] = []

            def walk(k: str) -> None:
                for p in item_from(k, economy):
                    walk(p)
                    tree.append(p)

            walk(key)
            what = "them" if list(added) == tree else join_names(name(k) for k in added)
            notes.append(f"{NOTE_PREFIX} {name(key)} needs {_made_from(key, economy)}: added {what} to the shopping list.")
        elif kind == "no-slot":
            notes.append(f"{NOTE_PREFIX} {name(key)} dropped: no free slot -- combine two items first.")
        elif kind == "parts-missing":
            parts = item_from(key, economy)
            if len(parts) == 1:
                notes.append(f"{NOTE_PREFIX} {name(key)} dropped: its part ({name(parts[0])}) isn't held at that point in the list.")
            else:
                notes.append(f"{NOTE_PREFIX} {name(key)} dropped: its parts ({join_names(name(p) for p in parts)}) aren't all held at that point in the list.")
        elif kind == "cut":
            notes.append(f"{NOTE_PREFIX} the shopping list is longer than the {cap} steps anyone can buy in a match; kept the first {cap}.")
        elif kind == "default":
            notes.append(f"{NOTE_PREFIX} nothing usable was left of the shopping list, so the {instrument} default build applies.")
    if not kept:
        return None, tuple(notes)
    return tuple(kept), tuple(notes)
