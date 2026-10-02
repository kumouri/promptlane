#!/usr/bin/env python3
"""The prose-to-schema translator: turns one entrant pilot.md's free prose into an ordered Jev
decision schema (a priority list of {condition, action} rules plus one unconditional default),
mirroring house-violet.md's own "take the FIRST rule that matches" shape -- the memo's own
observation that this is "the closest thing in this repo to what Jev's choice/noul primitives are
for" (`docs/jev-decision-model-research.md` §6) is the design this translator leans on.

DESIGN REQUIREMENT: the entrant must be able to read the schema their prose became.
`render_markdown` below is not a debugging aid -- it is THE deliverable an entrant would see, a
plain rule-by-rule table (condition -> action) with no code and no Jev wire format in it, so the
requirement is satisfiable by inspection, not by trusting the translator. See
`docs/prose-to-schema-translator.md` for why this is load-bearing rather than a nicety: a translator
an entrant can't read turns "prompt-writing" into "hope the model got it right," which is exactly
the worry §6 raises about this whole approach.

MODEL: host Ollama's `qwen3.5:9b` (`$OLLAMA_HOST`, this repo's own `DEFAULT_OLLAMA_MODEL` in
`tools/model_server.py`) -- already configured in this repo, and free (local inference, no API
spend), so the translation step's reported cost is real ($0 in dollars, real in wall-clock/tokens --
both counted and reported, not hidden by "free"). Chosen over Jev itself because Jev cannot do this
job at all: it has no free-text output primitive (`docs/jev-decision-model-research.md` §1), and
producing a *schema* -- new structure, not an answer to a pre-declared question -- is exactly the
kind of generative task System One models are not built for.

TARGET VOCABULARY. Jev's questions can judge conditions, but nothing in this pipeline asks Jev to
*pick an entity id* -- that would need a `choice` question per rule per candidate set, which is a
real design a future version could add (see `docs/prose-to-schema-translator.md`, "what a `choice`-
based target step would look like"). For this version, once a rule fires, the target is resolved
deterministically in Python from a small, fixed vocabulary (`TARGET_SELECTORS` below) -- the
translator's job is to pick *which selector* best matches the prose's intent ("densest cluster" ->
`densest_cluster_enemy`, "softest target" -> `lowest_hp_enemy`), not to invent new ones. This is a
real, named simplification, not a hidden one: it is the one place prose nuance is flattened into a
fixed enum before Jev ever sees the schema, and it is called out as such in the fidelity writeup.
`bandstand` (the river objective, `docs/economy-spec.md` §9.7) is a position selector like `home`/
`push_lane`; in a match with no objective, or while the stage is closed or done, it resolves exactly
as `push_lane` does, so a schema that uses it stays valid everywhere.

INSTRUMENT SCOPE. One prompt drives all three of a team's bearbots and is translated once per
instrument, so prose scoped to one instrument ("keytar only: ...") must not reach the other two
schemas (`docs/translator-guards-and-defaults-spec.md` §10). Two deterministic layers:
`scope_to_instrument` sets aside lines explicitly marked for another instrument before the model
sees the prose, and `enforce_instrument_scope` removes any rule that still fires another
instrument's ability or asks about its cooldown (a no-op in the sim, pre-empting everything below).
SHOPPING LIST. The prompt also carries an items block generated from the ruleset being compiled for
(`economy_rules.items_prompt_block`; `economy=None` is `economy_rules.DEFAULT_ECONOMY`); a prose that
names items or a shopping order becomes `schema.build`, validated by `economy_rules.normalize_build`
(unknown/duplicate items dropped, over-long lists cut to the slot count, each with a `build:` note).
Under a ruleset with recipes (`docs/late-game-economy-spec.md` §7.4) `build` lists items of any tier
in the prose's order and the notes say which parts the match will fill in. Under vocab-2 a shopping list
is `build` only, never a rule: `enforce_shopping_list` drops a rule that only restates the list (or
rejects the reply when `build` is missing, so the retry quotes the line). The prompt does not say so:
a line that did, quoting the rule it forbids, made the translator write that rule more often.
IDENTITY (vocab-2 only): `enforce_identity_rules` rejects a rule whose question asks only about this
bearbot's own instrument or team ("is this bot's instrument 'Violin'?"), which has one answer all match;
the retry quotes the prose line it came from, and the last attempt drops it with an `identity:` note.
UNFINISHED GUARDS (vocab-2 only): `enforce_finished_guards` rejects a reply with a node that has both
branches but no "type" and no action, asking for plain rules; the last attempt drops the node with an
`unfinished guard:` note. Completing its type instead shipped guards that cut off every rule below them.
NEGATION (vocab-2 only): `enforce_negation` rejects a reply in which a rule asks whether a thing IS
there while the rule's id or its prose sentence says it is NOT ("no enemy is in sight"), and the
retry quotes the sentence; on the last attempt it drops the rule with a `negation:` note instead.
The prompt is unchanged here too.
Economy P2 added one target selector,
`highest_bounty_enemy` (`docs/economy-spec.md` §4.2): "go after the enemy worth the most gold".
VOCABULARIES (`vocab.py`, `docs/vocabulary-spec.md`): `TARGET_SELECTORS` is vocab-1's list. vocab-2
adds `VOCAB2_SELECTORS` (own towers, tower divers, the nearest enemy bearbot or minion, the nearest
ally) and the list of facts the game states (`facts_prompt_block`). A translation names its vocabulary
and the schema records it; the vocab-1 prompt is byte-identical to the one before vocabularies existed.
Under vocab-2 only, `normalize_targets` then corrects a reply's targets before validation: a made-up
name like `nearest_enemy_tower` becomes the real one it means (`TARGET_ALIASES`), and a rule about my
minions that targets `nearest_ally` (a teammate) targets `nearby_minion`, and the reverse. Each change
is a `target:` note the entrant sees; any other unknown name is an error the retry is told how to fix.
The instrument-scope prompt itself is deliberately unchanged: telling the model the prose is shared was measured
(spec §10.4): each wording tried either made it write MORE foreign-ability rules or added compile failures.
"""
from __future__ import annotations

import dataclasses
import json
import os
import re
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ground_truth import _ollama_generate, resolve_ollama_url  # noqa: E402
from economy_rules import NOTE_PREFIX, format_build, items, items_prompt_block, normalize_build  # noqa: E402
from number_normalize import normalize_numbers_for_trace  # noqa: E402
from scenarios import ABILITIES  # noqa: E402
from vocab import VOCAB_1, VOCAB_2, facts_for, resolve_vocab  # noqa: E402

DEFAULT_MODEL = "qwen3.5:9b"

ACTION_KINDS = ["move", "attack", "ability", "recall", "hold"]

TARGET_SELECTORS = {
    "none": "no target needed (recall, hold, or an unconditional move covered by another field)",
    "home": "move to this bearbot's own home/base position",
    "push_lane": "move toward the enemy nexus, i.e. advance down the lane",
    "nearest_enemy": "the visible enemy (any kind) closest to this bearbot",
    "lowest_hp_enemy": "the visible enemy bearbot with the lowest hp (the 'softest' target)",
    "densest_cluster_enemy": "the visible enemy with the most other enemies near it (an AoE target)",
    "isolated_enemy": "the visible enemy bearbot farthest from any other enemy (a target alone, not grouped)",
    "nearest_tower": "the nearest visible enemy tower or nexus",
    "threatened_ally_enemy": "the enemy nearest to this bearbot's own lowest-hp ally",
    "nearby_minion": "the nearest allied minion in the wave (for riding/positioning with it)",
    "bandstand": "move to the Bandstand, the river objective, while it is open or about to open; "
    "otherwise the same as push_lane",
    "highest_bounty_enemy": "the visible enemy bearbot worth the most gold if killed (the highest bounty: a carrier of unspent gold)",
}

# vocab-2's six (`docs/vocabulary-spec.md` §4.1 A4; resolved by `target_resolve._resolve_vocab2`).
# `TARGET_SELECTORS` above stays vocab-1's list, byte for byte, so the vocab-1 prompt is unchanged.
VOCAB2_SELECTORS = {
    "own_tower": "move to this bearbot's own nearest standing tower, just behind it on the home side "
    "(inside its range): fall back to / hold at / defend my tower",
    "own_front_tower": "move to the outermost standing tower of this bearbot's own lane, just behind it: hold my lane at our outer tower",
    "nearest_enemy_bearbot": "the visible enemy BEARBOT closest to this bearbot (never a minion or tower)",
    "nearest_enemy_minion": "the visible enemy MINION closest to this bearbot (farming, clearing their wave)",
    "tower_diver": "the nearest enemy bearbot standing inside the range of one of this bearbot's own towers (punish a tower dive)",
    "nearest_ally": "move to the nearest allied BEARBOT, a teammate, never a minion (stay with my teammates, group up)",
}
SELECTOR_DESCRIPTIONS = {**TARGET_SELECTORS, **VOCAB2_SELECTORS}
SELECTORS_BY_VOCAB = {VOCAB_1: tuple(TARGET_SELECTORS), VOCAB_2: tuple(TARGET_SELECTORS) + tuple(VOCAB2_SELECTORS)}
# How the vocab-2 prompt words three selectors; the reports keep `SELECTOR_DESCRIPTIONS`, and vocab-1's
# prompt keeps `TARGET_SELECTORS` exactly. Under vocab-2's first wording, "move to the nearest allied
# minion" compiled to `nearest_ally` in every hard and sample-entrant compile, and "attack the nearest
# enemy tower" sometimes to a made-up `nearest_enemy_tower` (runs/vocab-house-tiers-2026-10-02.md §2).
# These say which one the prose means (runs/vocab2-target-fixes-2026-10-02.md).
VOCAB2_MEANINGS = {
    "nearest_ally": VOCAB2_SELECTORS["nearest_ally"] + "; for my minions or my wave use nearby_minion",
    "nearest_tower": "the nearest visible enemy TOWER or nexus (attack / push their tower: the one target for an enemy tower)",
    "nearby_minion": "the nearest allied MINION, one of this bearbot's own wave (walk / push / ride with my minions, follow my wave; "
    "\"my nearest minion\" and \"the nearest allied minion\" mean this one)",
}


def selectors_for(vocab: str) -> dict:
    """The selectors a schema in `vocab` may name, with their translator-prompt meanings."""
    vocab = resolve_vocab(vocab)
    meanings = {**SELECTOR_DESCRIPTIONS, **VOCAB2_MEANINGS} if vocab == VOCAB_2 else SELECTOR_DESCRIPTIONS
    return {k: meanings[k] for k in SELECTORS_BY_VOCAB[vocab]}


# --- targets the prose meant (vocab-2 only; vocab-1 parses exactly as it always did) ----------------

# Selector names the translator writes that no vocabulary has, and the real one each means. They are
# names made by analogy with vocab-2's own (`nearest_enemy_bearbot`, `nearest_enemy_minion`); 4 of 24
# compiles in the run above died on `nearest_enemy_tower` alone. Any other unknown name is still an
# error, and the retry is told the valid names.
TARGET_ALIASES = {
    "nearest_enemy_tower": "nearest_tower",
    "enemy_tower": "nearest_tower",
    "nearest_enemy_nexus": "nearest_tower",
    "enemy_nexus": "nearest_tower",
    "nearest_allied_minion": "nearby_minion",
    "nearest_ally_minion": "nearby_minion",
    "nearby_allied_minion": "nearby_minion",
    "allied_minion": "nearby_minion",
    "my_minion": "nearby_minion",
    "my_minions": "nearby_minion",
    "nearest_teammate": "nearest_ally",
    "teammate": "nearest_ally",
    "nearest_allied_bearbot": "nearest_ally",
    "nearest_ally_bearbot": "nearest_ally",
}
TARGET_NOTE_PREFIX = "target:"

_MINION_WORDS = frozenset({"minion", "minions", "wave", "waves", "creep", "creeps"})
_ALLY_WORDS = frozenset({"ally", "allies", "allied", "friendly"})
_TEAMMATE_WORDS = frozenset({"teammate", "teammates"})
_NEGATION_BEFORE = frozenset({"no", "none", "not", "zero", "without", "fewer", "nobody", "isn't", "aren't", "never"})
_NEGATION_AFTER = frozenset({"dead", "gone", "died", "lost"})


def _mentions(text: str) -> tuple[bool, bool]:
    """(names my minions as present, names my teammates as present) in a rule's own words. A mention
    is negated -- "none of my minions", "no allied minion", "my teammates are dead" -- when a negation
    word stands up to four words before it or a death word up to three after; a negated mention is
    about who is missing, not who to walk to ("regroup" and "group up" are verbs: only a negation
    before them counts). "allied"/"ally" followed by a minion word ("allied minion", the id's
    "ally_minion") is a minion, not a teammate."""
    words = re.findall(r"[a-z']+", text.lower().replace("_", " "))

    def present(i: int, noun: bool = True) -> bool:
        return not (_NEGATION_BEFORE & set(words[max(0, i - 4):i]) or noun and _NEGATION_AFTER & set(words[i + 1:i + 4]))

    minion = teammate = False
    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else ""
        if w in _MINION_WORDS:
            minion = minion or present(i)
        elif w == "regroup" or (w == "group" and nxt == "up"):
            teammate = teammate or present(i, noun=False)
        elif w in _TEAMMATE_WORDS or (w in _ALLY_WORDS and nxt not in _MINION_WORDS):
            teammate = teammate or present(i)
    return minion, teammate


def _rule_text(raw: dict) -> str:
    """What a rule says about its own target: its id, its question, and what "yes" looks like (not
    what "no" looks like, which is all negations)."""
    criteria = raw.get("criteria") if isinstance(raw.get("criteria"), dict) else {}
    return " ".join(str(x) for x in (raw.get("id") or "", raw.get("condition") or "", criteria.get("true") or ""))


def normalize_targets(raw_json: dict, vocab: str) -> tuple[dict, tuple[str, ...]]:
    """vocab-2 only, before validation: (1) an alias in `TARGET_ALIASES` becomes the selector it
    means; (2) a rule whose own words name only my minions but whose target is `nearest_ally` (a
    teammate) targets `nearby_minion`, and one naming only my teammates but targeting `nearby_minion`
    targets `nearest_ally`. A rule naming both, or neither, keeps the translator's choice. Each change
    is a `target:` note the entrant sees. Returns a copy; vocab-1 gets `raw_json` back untouched."""
    if resolve_vocab(vocab) == VOCAB_1 or not isinstance(raw_json, dict):
        return raw_json, ()
    raw_json = json.loads(json.dumps(raw_json))
    notes: list[str] = []

    def fix_action(action, where: str, text: str | None):
        if not isinstance(action, dict):
            return
        sel = action.get("target_selector")
        if isinstance(sel, str) and sel in TARGET_ALIASES:
            action["target_selector"] = TARGET_ALIASES[sel]
            notes.append(f"{TARGET_NOTE_PREFIX} {where} named {sel!r}, which is not a target; it targets "
                         f"{TARGET_ALIASES[sel]!r} ({SELECTOR_DESCRIPTIONS[TARGET_ALIASES[sel]]}).")
            sel = action["target_selector"]
        if text is None or sel not in ("nearest_ally", "nearby_minion"):
            return
        minion, teammate = _mentions(text)
        if sel == "nearest_ally" and minion and not teammate:
            action["target_selector"] = "nearby_minion"
            notes.append(f"{TARGET_NOTE_PREFIX} {where} is about your minions but targeted 'nearest_ally' (a teammate bearbot); "
                         "it targets 'nearby_minion' (the nearest allied minion).")
        elif sel == "nearby_minion" and teammate and not minion:
            action["target_selector"] = "nearest_ally"
            notes.append(f"{TARGET_NOTE_PREFIX} {where} is about your teammates but targeted 'nearby_minion' (a minion); "
                         "it targets 'nearest_ally' (the nearest allied bearbot).")

    def walk(nodes, default, where_default: str):
        for i, node in enumerate(nodes or []):
            if not isinstance(node, dict):
                continue
            rid = node.get("id") or f"r{i+1}"
            if node.get("type") == "guard":
                for branch in ("then", "else"):
                    b = node.get(branch)
                    if isinstance(b, dict):
                        walk(b.get("nodes"), b.get("default_action"), f"guard {rid}'s {branch} default")
            else:
                fix_action(node.get("action"), f"rule {rid}", _rule_text(node))
        fix_action(default, where_default, None)

    walk(raw_json.get("rules"), raw_json.get("default_action"), "the default action")
    return raw_json, tuple(notes)


@dataclass(frozen=True)
class TranslatedRule:
    id: str
    condition: str
    criteria_true: str
    criteria_false: str
    action_kind: str
    action_ability: str | None
    action_target_selector: str | None


@dataclass(frozen=True)
class Action:
    """A cascade's own trailing default action -- same three fields a `TranslatedRule`'s action
    carries, just not attached to a condition (`docs/translator-guards-and-defaults-spec.md` §2.2's
    `Action` shape)."""

    kind: str
    ability: str | None
    target_selector: str | None


@dataclass(frozen=True)
class GuardNode:
    """Answers one `noul` JUDGMENT question (not a state-presence/threshold fact) and hands control
    to one of two `Cascade`s -- `then` when the answer is true, `else_` when false (named `else_`:
    `else` is a Python keyword). Unlike a `TranslatedRule` (this module's `RuleNode`, per the spec's
    naming -- kept as `TranslatedRule` rather than a new wrapper class so every existing reader of
    `.condition`/`.action_kind`/etc keeps working unchanged), a guard always *fires*: both answers
    route somewhere. There is no third option of "skip this node, check the next sibling" the way a
    `False` rule condition does -- a guard partitions the decision space, it doesn't compete with
    siblings for first-match position (spec §2.2)."""

    id: str
    condition: str
    criteria_true: str
    criteria_false: str
    then: "Cascade"
    else_: "Cascade"


Node = TranslatedRule | GuardNode


@dataclass(frozen=True)
class Cascade:
    """An ordered sequence of `Node`s (first-true-wins, depth-first) plus this cascade's own optional
    trailing `default` -- the generalization of today's flat rule list (spec §2.2). A `Cascade` with
    zero `GuardNode`s in `nodes` is exactly today's flat list; `evaluate_cascade` below degenerates to
    plain first-match-else-default for such a cascade, which is a compatibility property, not a
    different code path."""

    nodes: tuple[Node, ...]
    default: Action | None = None


@dataclass(frozen=True)
class TranslatedSchema:
    """The tree is the canonical representation (`root: Cascade`, spec §2.2). `rules`/`default_kind`/
    `default_ability`/`default_target_selector` are kept as a backward-compatible VIEW: every reader
    that only ever looked at a flat rule list (every pre-existing test fixture that constructs a
    `TranslatedSchema(rules=[...], default_kind=..., ...)` directly) keeps working unchanged, because
    `__post_init__` derives whichever side (`root` <-> `rules`+`default_*`) wasn't given explicitly.
    `rules` for a tree WITH guards is the root cascade's own top-level `TranslatedRule` nodes only
    (guard nodes and everything nested inside a branch are not in it) -- `root` is the only
    representation that sees the whole tree, so anything that saves or sends a schema must walk
    `root` (as `compile.py`'s schema_to_dict does), never `rules`.

    `build` is the entrant's shopping list: ordered item keys of the ruleset `economy` names (None =
    `economy_rules.DEFAULT_ECONOMY`), already validated by `economy_rules.normalize_build` -- at most
    `shop.slots` of them, or under a ruleset with recipes the items as declared, whose parts the
    match fills in. `None` means "the prose names no items" -- the economy layer then uses the
    instrument's default build (`docs/economy-spec.md` §4.3).

    `vocab` is the vocabulary it was compiled under (`vocab.py`): what Jev is told and which
    selectors it may name. It plays under that vocabulary everywhere, never a server's default."""

    pilot_file: str
    instrument: str
    raw_model_output: str
    rules: tuple[TranslatedRule, ...] = ()
    default_kind: str | None = None
    default_ability: str | None = None
    default_target_selector: str | None = None
    validation_notes: tuple[str, ...] = ()
    root: Cascade | None = None
    build: tuple[str, ...] | None = None
    vocab: str = VOCAB_1
    economy: str | None = None

    def __post_init__(self):
        if self.root is None:
            default = (
                Action(self.default_kind, self.default_ability, self.default_target_selector)
                if self.default_kind is not None
                else None
            )
            object.__setattr__(self, "root", Cascade(nodes=tuple(self.rules), default=default))
            return
        if not self.rules:
            object.__setattr__(self, "rules", tuple(n for n in self.root.nodes if isinstance(n, TranslatedRule)))
        if self.default_kind is None and self.root.default is not None:
            d = self.root.default
            object.__setattr__(self, "default_kind", d.kind)
            object.__setattr__(self, "default_ability", d.ability)
            object.__setattr__(self, "default_target_selector", d.target_selector)


def _extract_json_object(text: str) -> dict:
    """First balanced `{...}` object in `text`, tolerant of a model wrapping its JSON in prose or a
    code fence despite `think: false` -- a brace-depth scan, not a greedy regex, so a nested object
    (rules containing criteria containing more braces) doesn't truncate early."""
    start = text.find("{")
    if start == -1:
        raise ValueError(f"no JSON object found in model output: {text[:300]!r}")
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError(f"unbalanced JSON object in model output: {text[:300]!r}")


_CONDITION_DESC = {
    VOCAB_1: """  "condition": one yes/no question about the bot's current game state (a threshold comparison or a
      presence check -- e.g. "is this bot's hp below a quarter of its max?", "is an enemy bearbot
      within melee range?"). Never a question that needs a text answer.""",
    VOCAB_2: """  "condition": one yes/no question about the bot's current game state, asked about the FACTS THE
      GAME STATES listed below (a threshold comparison or a presence check -- e.g. "is this bot's hp
      below a quarter of its max?", "is an enemy bearbot in this bot's attack range?", "is this bot
      under its own tower?"). Never a question that needs a text answer.""",
}


# How many top-level nodes the prompt asks for. vocab-1 keeps "3 and 8" byte for byte (golden-tested).
# vocab-2 sets no upper bound: the prose decides how many rules there are. The 8 had no stated reason,
# nothing enforced it, and a node costs one more question in the decision's single Jev call, about 40
# input tokens and under 1 ms (runs/vocab2-node-cap-2026-10-02.md §1). One is the floor `parse_schema` needs.
_NODE_COUNT = {
    VOCAB_1: "Use between 3 and 8 top-level nodes.",
    VOCAB_2: "Write one top-level node for every rule the prose states, as many as it has (at least one); "
    "never drop a rule to make the list shorter.",
}


def facts_prompt_block(vocab: str) -> str:
    """The "facts the game states" list (spec §4.1 A5), from `vocab.FACTS_V2`, the table whose
    `lead` phrases `test_vocab.py` finds in every vocab-2 description. Empty for vocab-1, which
    never had one, so its prompt is unchanged."""
    facts = facts_for(vocab)
    if not facts:
        return ""
    lines = "\n".join(f"  - {f.says}" + (f" (when {f.when})" if f.when else "") for f in facts)
    return (
        "\n\nFACTS THE GAME STATES every decision. Jev answers each condition by reading a paragraph that states exactly\n"
        "these, so ask about them, in these terms, and about nothing else (no other distances, nothing hidden):\n"
        f"{lines}\n"
        'A strategic verdict like "you only take fights you can win" can ask about the fight verdict the game\n'
        'states ("is this bot\'s side stronger in the fight near it?").'
    )


def _translation_prompt(pilot_text: str, instrument: str, primary_ability: str, ultimate_ability: str, vocab: str = VOCAB_1,
                        economy: str | None = None) -> str:
    """vocab-1's prompt is byte-identical to the one every schema compiled before vocab-2 was
    (golden-tested, `test_vocab.py`); vocab-2 adds its six selectors, the facts list, and a condition
    example in those facts' terms. `economy` picks the ITEMS block (`economy_rules.items_prompt_block`);
    the default ruleset's is the pre-recipe text exactly."""
    vocab = resolve_vocab(vocab)
    selectors = selectors_for(vocab)
    selectors_desc = "\n".join(f'  "{k}" -- {v}' for k, v in selectors.items())
    facts_block = facts_prompt_block(vocab)
    condition_desc = _CONDITION_DESC[vocab]
    items_block = items_prompt_block(economy)
    return f"""You are translating a game-bot prompt written in prose into a strict decision table.

The bot plays {instrument}. Its two abilities are named "{primary_ability}" (primary) and
"{ultimate_ability}" (secondary/ultimate) -- use exactly these strings for "ability" fields, never
invent a different name.

Read this prose pilot below and extract its strategy as an ORDERED list of nodes, evaluated top to
bottom, FIRST MATCH WINS -- exactly like a priority list. Most nodes are RULES. A rule has:
  "id": a short snake_case id
{condition_desc}
  "criteria": {{"true": "one short clause describing what 'true' looks like in the state",
      "false": "one short clause describing what 'false' looks like in the state"}}
  "action": {{"kind": one of {ACTION_KINDS}, "ability": one of ["{primary_ability}", "{ultimate_ability}", null],
      "target_selector": one of {list(selectors)} or null}}

target_selector meanings (pick the closest match to what the prose says; do not invent a new one):
{selectors_desc}{facts_block}

SOMETIMES the prose states a JUDGMENT that decides which whole SET of rules applies, not a single
fact about the state -- e.g. "you only take fights you can win" (this decides whether the
opener/finisher rules matter at all, or whether a completely different retreat/reposition set should
be checked instead). For prose like that ONLY, emit a GUARD instead of a rule:
  "type": "guard"
  "id", "condition", "criteria": same shape as a rule -- one yes/no judgment question, in the same
      strategic terms the prose itself uses (not a state-presence/threshold fact -- that's a rule).
  "then": {{"nodes": [...same rule/guard node shape, checked if the guard answers yes...],
            "default_action": (same "action" shape, or null) -- this branch's OWN fallback if none
                of its own nodes match; null means "escalate to the nearest enclosing default"}}
  "else": same shape as "then", for when the guard answers no.
Do NOT use a guard for an ordinary threshold or presence check (hp below X, enemy in range) -- those
are rules. Use a guard ONLY for prose that reads as a strategic verdict partitioning behavior into two
different sets of rules. Most pilots need zero guards; use one only when the prose clearly calls for
it. Every rule/guard needs a UNIQUE "id" across the whole tree, including inside "then"/"else". If you
are not going to include "type": "guard", "then", and "else", do not name the node "guard_..." either
-- an "id" starting with "guard_" with no "then"/"else" is always wrong; either commit to the full
guard shape above or write it as a plain rule with a normal "action".

Also include one top-level "default_action" (same "action" shape) for when nothing above matches at
all -- the prose's overall fallback behavior (usually push the lane or go home).

Worked example of a guard, for prose like "you only take fights you can win" (a verdict, not a
threshold) -- this is what a guard node looks like inline in the "rules" list, at whatever position
the prose's priority order calls for:

{{"type": "guard", "id": "can_win_fight", "condition": "can this bot win the fight it is in or about to enter, by itself, right now?", "criteria": {{"true": "a winnable fight is present", "false": "no winnable fight is present"}},
 "then": {{"nodes": [{{"id": "opener_ready", "condition": "...", "criteria": {{"true": "...", "false": "..."}}, "action": {{"kind": "ability", "ability": null, "target_selector": null}}}}], "default_action": {{"kind": "move", "ability": null, "target_selector": null}}}},
 "else": {{"nodes": [], "default_action": {{"kind": "move", "ability": null, "target_selector": null}}}}}}

{_NODE_COUNT[vocab]} Output ONLY this JSON object, nothing else, no markdown fences.
If the prose has NO strategic-verdict content, output only plain rules -- do not force a guard in:

{{"rules": [{{"id": "...", "condition": "...", "criteria": {{"true": "...", "false": "..."}}, "action": {{"kind": "...", "ability": null, "target_selector": null}}}}],
 "default_action": {{"kind": "...", "ability": null, "target_selector": null}}}}

{items_block}

PROSE PILOT:
{pilot_text.strip()}
"""


def _validate_action(action: dict, context: str, vocab: str = VOCAB_1) -> tuple[str, str | None, str | None]:
    """Only `vocab`'s selectors are accepted (`selectors_for`): a vocab-1 compile naming a vocab-2
    selector is invalid, exactly as any unknown selector always was."""
    kind = action.get("kind")
    if kind not in ACTION_KINDS:
        if vocab == VOCAB_2 and kind in _SHOPPING_KINDS:
            raise ValueError(f"{context}: invalid action kind {kind!r} -- a shopping list is not a rule; put its items in the "
                             'top-level "build" list and write no rule for it')
        raise ValueError(f"{context}: invalid action kind {kind!r}")
    ability = action.get("ability")
    if ability is not None and not isinstance(ability, str):
        raise ValueError(f"{context}: invalid ability {ability!r}")
    selector = action.get("target_selector")
    if selector is not None and selector not in SELECTORS_BY_VOCAB[vocab]:
        if vocab == VOCAB_1:
            raise ValueError(f"{context}: unknown target_selector {selector!r}")
        raise ValueError(f"{context}: unknown target_selector {selector!r} -- there is no such target; use exactly one of "
                         f"{', '.join(SELECTORS_BY_VOCAB[vocab])}, or null")
    return kind, ability, selector


def _parse_node(raw: dict, idx: int, vocab: str = VOCAB_1) -> Node:
    rid = raw.get("id") or f"r{idx+1}"
    cond = raw.get("condition")
    if not cond or not isinstance(cond, str):
        raise ValueError(f"node {rid}: missing/invalid condition")
    criteria = raw.get("criteria") or {}
    ct = criteria.get("true", "the condition holds")
    cf = criteria.get("false", "the condition does not hold")
    if raw.get("type") == "guard":
        then_raw = raw.get("then")
        else_raw = raw.get("else")
        if not isinstance(then_raw, dict) or not isinstance(else_raw, dict):
            raise ValueError(f"guard {rid}: 'then' and 'else' must both be present cascade objects")
        then_cascade = _parse_cascade(then_raw.get("nodes") or [], then_raw.get("default_action"), default_required=False, vocab=vocab)
        else_cascade = _parse_cascade(else_raw.get("nodes") or [], else_raw.get("default_action"), default_required=False, vocab=vocab)
        return GuardNode(id=rid, condition=cond, criteria_true=ct, criteria_false=cf, then=then_cascade, else_=else_cascade)
    kind, ability, selector = _validate_action(raw.get("action") or {}, f"rule {rid}", vocab)
    return TranslatedRule(
        id=rid,
        condition=cond,
        criteria_true=ct,
        criteria_false=cf,
        action_kind=kind,
        action_ability=ability,
        action_target_selector=selector,
    )


def _parse_cascade(nodes_raw: list, default_raw: dict | None, default_required: bool, vocab: str = VOCAB_1) -> Cascade:
    nodes = tuple(_parse_node(r, i, vocab) for i, r in enumerate(nodes_raw or []))
    if default_required:
        kind, ability, selector = _validate_action(default_raw or {}, "default_action", vocab)
        default = Action(kind, ability, selector)
    elif default_raw is not None:
        kind, ability, selector = _validate_action(default_raw, "default_action", vocab)
        default = Action(kind, ability, selector)
    else:
        default = None
    return Cascade(nodes=nodes, default=default)


# --- a guard with no "type" (vocab-2 only) -----------------------------------------------------------
#
# The 9B often writes a node with a condition and both a "then" and an "else" branch but no "type":
# "guard" and no action ("guard_spend_gold"). As a plain rule it fails `invalid action kind None`, and
# develop's retry asks it to "finish the guard shape", which it already has; #87's s1 drums failed all
# three replies so. Completing the type is NOT the fix: a guard sends every decision into one of its two
# branches, so every rule after it is never checked, and the completed trees that shipped held the bot
# out of every fight and recall (runs/vocab2-identity-rules-2026-10-02.md §2). Under vocab-2 such a reply
# is rejected with a retry that asks for plain rules; on the last attempt the node is dropped, branches
# and all, with an `unfinished guard:` note, so the rest of the schema still compiles.

UNFINISHED_GUARD_NOTE_PREFIX = "unfinished guard:"


class UnfinishedGuardError(ValueError):
    """A node shaped as a guard with no "type" (`enforce_finished_guards`). `translate_pilot` retries it
    without its generic "finish the guard shape" line, which is what the reply already did."""


def _unfinished_guard(node) -> bool:
    if not isinstance(node, dict) or "type" in node:
        return False
    action = node.get("action")
    return all(isinstance(node.get(b), dict) for b in ("then", "else")) and not (isinstance(action, dict) and action.get("kind"))


def _rules_in(node: dict) -> int:
    return sum(1 + (_rules_in(n) if isinstance(n, dict) and ("then" in n or "else" in n) else 0)
               for b in ("then", "else") if isinstance(node.get(b), dict)
               for n in (node[b].get("nodes") if isinstance(node[b].get("nodes"), list) else ()))


def enforce_finished_guards(raw_json: dict, vocab: str, drop: bool = False) -> tuple[dict, tuple[str, ...]]:
    """vocab-2 only, on the raw reply before `parse_schema`: when a node anywhere in the tree has both
    a "then" and an "else" branch object, no "type" and no action kind (`_unfinished_guard`), raises
    `UnfinishedGuardError`, which `translate_pilot` retries. With `drop` (the last attempt) every such
    node is removed instead, with its branches, each with an `unfinished guard:` note the entrant sees,
    and it raises only if no node would be left at the root. A node with one branch, a "type" of its
    own or an action kind is not one, and goes on to `parse_schema` as before. Returns `(raw_json,
    notes)`; a reply with no such node, and any vocab-1 reply, comes back as it came, with no notes."""
    if resolve_vocab(vocab) == VOCAB_1 or not isinstance(raw_json, dict) or not isinstance(raw_json.get("rules"), list):
        return raw_json, ()
    found: list[dict] = []

    def walk(nodes):
        if not isinstance(nodes, list):
            return nodes
        kept = []
        for node in nodes:
            if _unfinished_guard(node):
                found.append(node)
                continue
            if isinstance(node, dict) and node.get("type") == "guard":
                node = {**node, **{b: {**node[b], "nodes": walk(node[b].get("nodes"))} for b in ("then", "else") if isinstance(node.get(b), dict)}}
            kept.append(node)
        return kept

    rules = walk(raw_json["rules"])
    if not found:
        return raw_json, ()
    if not drop or not rules:
        node = found[0]
        raise UnfinishedGuardError(
            f'node {node.get("id") or "(no id)"} has "then" and "else" branches but no "action", so it is neither a rule nor a guard. '
            "A guard would send every decision into one of its two branches, and no rule after it would ever be checked: write "
            'plain rules instead, each with its own "action", in the order the prose gives them'
        )
    notes = tuple(
        f'{UNFINISHED_GUARD_NOTE_PREFIX} removed {node.get("id") or "a node"} ("{node.get("condition") or ""}") and the {_rules_in(node)} '
        'node(s) in its branches -- it had "then" and "else" branches but no "type": "guard" and no action, so it was neither a rule '
        "nor a guard, and the translator's last try still wrote it that way. Rewording the prose it came from may help."
        for node in found
    )
    return {**raw_json, "rules": rules}, notes


def parse_schema(raw_json: dict, pilot_file: str, instrument: str, raw_text: str, vocab: str = VOCAB_1,
                 economy: str | None = None) -> TranslatedSchema:
    """`vocab` is what the model was prompted with (`_translation_prompt`); the schema records it.
    `economy` is the ruleset `build` is checked against (None = `economy_rules.DEFAULT_ECONOMY`).
    Under vocab-2 the targets are first corrected to the ones the rules mean (`normalize_targets`)."""
    vocab = resolve_vocab(vocab)
    raw_json, target_notes = normalize_targets(raw_json, vocab)
    root = _parse_cascade(raw_json.get("rules"), raw_json.get("default_action"), default_required=True, vocab=vocab)
    if not root.nodes:
        raise ValueError("translator produced zero rules")
    build, build_notes = normalize_build(raw_json.get("build"), instrument, economy)
    return TranslatedSchema(
        pilot_file=pilot_file, instrument=instrument, raw_model_output=raw_text, root=root,
        validation_notes=target_notes + build_notes, build=build, vocab=vocab, economy=economy,
    )


def collect_nodes(cascade: Cascade) -> list[Node]:
    """Every node anywhere in the tree, depth-first, root first -- what a caller batches into one
    `systemone` call's worth of `noul` questions (spec §2.2: "evaluation stays one systemone call per
    decision" no matter how deep the tree gets)."""
    out: list[Node] = []
    for node in cascade.nodes:
        out.append(node)
        if isinstance(node, GuardNode):
            out.extend(collect_nodes(node.then))
            out.extend(collect_nodes(node.else_))
    return out


def evaluate_cascade(cascade: Cascade, answers: dict[str, bool], trace: list[dict] | None = None) -> Action | None:
    """Depth-first, first-true-wins (spec §2.2's `evaluate`, completed: the spec's own pseudocode
    only ever recurses into a guard's `then` branch, never `else` -- a literal reading of it can
    never produce the "no" branch's action at all, which contradicts the worked example (§3.2's 2c)
    and the design's own stated intent ("a guard partitions the decision space"). Implemented here as
    a guard ALWAYS committing to one of its two branches (unlike a rule, which is simply skipped when
    its condition is false) -- both answers route somewhere, symmetrically.

    Returns `None` when nothing anywhere along the committed path had an action -- including no local
    default at any level entered -- so the caller can apply the OUTERMOST (root) default exactly once
    (see `evaluate_schema`); a `None` here must never be silently treated as this cascade's own
    default, or an escalation would be skipped past a level that had one (spec §3.1).

    `trace`, when given, is appended to with one dict per guard consulted (`{"guard_id", "answer"}`)
    and, if a rule fires, one more (`{"fired_id"}`) -- a caller (Phase 4's per-guard diagnostic
    breakdown, `fidelity_harness.py`) can read it back without duplicating this walk."""
    for node in cascade.nodes:
        if isinstance(node, GuardNode):
            ans = bool(answers.get(node.id))
            if trace is not None:
                trace.append({"guard_id": node.id, "answer": ans})
            branch = node.then if ans else node.else_
            result = evaluate_cascade(branch, answers, trace)
            return result if result is not None else branch.default
        if answers.get(node.id):
            if trace is not None:
                trace.append({"fired_id": node.id})
            return Action(node.action_kind, node.action_ability, node.action_target_selector)
    return cascade.default


def evaluate_schema(schema: TranslatedSchema, answers: dict[str, bool], trace: list[dict] | None = None) -> Action:
    """`evaluate_cascade(schema.root, ...)` already applies `root.default` in the plain
    all-false/no-guards case (that's the same object as `cascade.default` at the bottom of the
    function). It does NOT apply `root.default` when a committed guard branch escalates with no
    default of its own anywhere along the path -- that early return never reaches root's own
    trailing-default line. This function is what actually makes `root.default` the outermost,
    last-resort fallback "for the whole tree" (spec §3.1), applied exactly once, here."""
    result = evaluate_cascade(schema.root, answers, trace)
    if result is not None:
        return result
    if schema.root.default is not None:
        return schema.root.default
    raise ValueError("schema evaluation produced no action: no rule, guard-branch default, or root default fired")


@dataclass(frozen=True)
class DefaultTie:
    """The result of `resolve_default_tie` (spec §3.3): two or more prose sentences read as the SAME
    cascade level's default, with no guard between them to tell them apart. Not observed in any of
    the three reference pilots -- designed for, not measured against real prose (spec §3.3 says so
    explicitly). The schema's own wire shape only ever carries ONE `default_action` per cascade
    level, so this can only ever be applied at TRANSLATION time, before a schema is built (a future
    translation step that detects two default-shaped candidate sentences would call this to pick one
    and record the alternative); it is not wired into `translate_pilot` or `parse_schema` today."""

    winner: Action
    winner_segment: str
    alternatives: tuple[str, ...]
    note: str


def resolve_default_tie(candidates: list[tuple[str, Action]]) -> DefaultTie:
    """`candidates` is `[(prose_segment, action), ...]` in the order they appear in the file. Per
    spec §3.3: prose order is the tiebreak (the sentence appearing earlier wins the position), and
    the alternative(s) are recorded for a transparency-view flag rather than silently discarded.
    Raises `ValueError` for fewer than two candidates -- there is no tie to resolve."""
    if len(candidates) < 2:
        raise ValueError("resolve_default_tie needs at least two candidate default sentences to break a tie between")
    winner_segment, winner = candidates[0]
    alternatives = tuple(seg for seg, _ in candidates[1:])
    note = (
        f'these {len(candidates)} sentences all read as this branch\'s default, with no guard '
        "distinguishing them -- the earliest one in your prose was used; check the others by hand: "
        + "; ".join(f'"{seg.strip()}"' for seg in alternatives)
    )
    return DefaultTie(winner=winner, winner_segment=winner_segment, alternatives=alternatives, note=note)


class SchemaValidationError(ValueError):
    """Raised by `enforce_absolute_priority` when the prose names an override rule ("no exceptions",
    "no matter", ...) that the translated schema doesn't contain at all -- a worse failure than
    misordering, because there is no rule left to promote. `translate_pilot` treats this the same as
    a JSON-parse failure: retry with the model, don't silently ship a schema missing the override."""


# Phrases that mark a sentence as an unconditional override, not just emphasis. Deliberately
# NOT "always"/"never": both real pilots' ability paragraphs use "always"/routine-habit framing for
# ordinary ability usage (e.g. drums.md's Kick -- "on cooldown, always, no hesitation") that has
# nothing to do with priority-overriding another rule; treating those as override markers would
# promote the wrong rule (repro'd below). These five phrases only ever showed up, in this repo's
# three pilots, attached to the one sentence per file that truly means "this beats everything else":
# `keytar.md` ("no exceptions") and `violin.md` ("no matter how close the kill looked").
ABSOLUTE_OVERRIDE_PHRASES = ("no exceptions", "without exception", "no matter", "regardless of", "unconditionally")

_STOPWORDS = frozenset(
    "a an the is are be being been this that these those it its own of to in on at as by for with "
    "and or not no near you your yourself their them off out under over above below within into onto "
    "if none any all one two some more most least than then so do does did just still yet when while "
    "there here what which who whom whose".split()
)


def _tokenize(text: str) -> set[str]:
    """Tokens for the trace/overlap check (`enforce_absolute_priority`'s paragraph matching, and
    `transparency.py`'s finer-grained rule-provenance matching, which imports this function
    directly). Runs `normalize_numbers_for_trace` first so "a quarter health" and "25%" share a token
    -- see `number_normalize.py` for why and its non-quantity exclusions. This never touches prose
    shown to an entrant: `render_markdown`/`render_report_markdown` quote the original text, not this
    normalized form."""
    normalized = normalize_numbers_for_trace(text)
    return {t for t in re.findall(r"[a-z0-9]+", normalized) if t not in _STOPWORDS}


def _find_absolute_paragraphs(pilot_text: str) -> list[str]:
    """Paragraph-level, not sentence-level: these pilot files use em-dash-joined clauses inside one
    paragraph rather than short sentences, so splitting on blank lines (the files' own structure --
    one idea per paragraph) is more reliable than a sentence-boundary regex."""
    paragraphs = [p.strip() for p in pilot_text.split("\n\n") if p.strip()]
    return [p for p in paragraphs if any(phrase in p.lower() for phrase in ABSOLUTE_OVERRIDE_PHRASES)]


def _rule_tokens(rule: TranslatedRule) -> set[str]:
    fields = [rule.condition, rule.criteria_true, rule.criteria_false, rule.action_kind, rule.action_ability]
    return _tokenize(" ".join(f for f in fields if f))


def _match_rule_for_paragraph(paragraph: str, rules: list[TranslatedRule], min_overlap: int = 2) -> int | None:
    """Best-token-overlap match, content-based -- not tied to any pilot's specific wording (no
    hardcoded "recall"/"hp" check). Requires at least `min_overlap` shared meaningful tokens so an
    unrelated rule with one coincidental word in common doesn't get promoted by accident."""
    para_tokens = _tokenize(paragraph)
    best_idx, best_score = None, min_overlap - 1
    for i, rule in enumerate(rules):
        score = len(para_tokens & _rule_tokens(rule))
        if score > best_score:
            best_idx, best_score = i, score
    return best_idx


# --- vocab-2's priority guard: the rule the override phrase modifies, or none -----------------------
#
# vocab-1's guard (below) promotes the root rule sharing the most words with the override PARAGRAPH.
# When the translator has dropped the rule the phrase modifies, a different rule about the same things
# can still share two words and gets promoted: "back off home ..., no matter what else is going on"
# promoted "attack the nearest enemy tower when two of my minions are near" to rule 1 in 3 of #84's
# compiles (runs/vocab2-node-cap-2026-10-02.md §2). Under vocab-2 a rule is the one an override
# SENTENCE modifies only if no other sentence of the prose matches it better, and the rule's target
# counts ("home", "nearest tower"). The attack rule matches its own sentence better, so it stays put,
# and the missing rule raises, which is the retry path. vocab-1 keeps its guard exactly.


def _rule_tokens_v2(rule: TranslatedRule) -> set[str]:
    return _rule_tokens(rule) | _tokenize((rule.action_target_selector or "").replace("_", " "))


def _prose_sentences(pilot_text: str) -> list[str]:
    """Every sentence of the prose that isn't the reply-format tail (`segment.auto_segments`'s cut)."""
    from segment import auto_segments

    return [text for label, text in auto_segments(pilot_text) if label != "boilerplate"]


def _match_rule_for_sentence(sentence: str, sentences: list[str], rules: list[TranslatedRule], min_overlap: int = 2) -> int | None:
    """The rule `sentence` states: the best overlap with it (at least `min_overlap` tokens) among
    rules that no other sentence of the prose matches strictly better. None when the translator
    dropped it -- a look-alike belongs to its own sentence and is never promoted in its place."""
    own = _tokenize(sentence)
    others = [_tokenize(s) for s in sentences if s != sentence]
    best_idx, best_score = None, min_overlap - 1
    for i, rule in enumerate(rules):
        tokens = _rule_tokens_v2(rule)
        score = len(own & tokens)
        if score > best_score and not any(len(o & tokens) > score for o in others):
            best_idx, best_score = i, score
    return best_idx


def _enforce_absolute_priority_v2(schema: TranslatedSchema, pilot_text: str) -> TranslatedSchema:
    sentences = _prose_sentences(pilot_text)
    marked = [s for s in sentences if any(p in s.lower() for p in ABSOLUTE_OVERRIDE_PHRASES)]
    if not marked:
        return schema
    root_nodes = list(schema.root.nodes)
    rule_candidates = [(i, n) for i, n in enumerate(root_nodes) if isinstance(n, TranslatedRule)]
    matched_indices: set[int] = set()
    for sentence in marked:
        idx = _match_rule_for_sentence(sentence, sentences, [n for _, n in rule_candidates])
        if idx is None:
            phrase = next(p for p in ABSOLUTE_OVERRIDE_PHRASES if p in sentence.lower())
            raise SchemaValidationError(
                f"the prose uses override language ({phrase!r}) on a rule the schema does not have -- "
                f"write a rule for this sentence: {' '.join(sentence.split())[:200]!r}"
            )
        matched_indices.add(rule_candidates[idx][0])
    return _promote(schema, root_nodes, matched_indices, marked)


def enforce_absolute_priority(schema: TranslatedSchema, pilot_text: str) -> TranslatedSchema:
    """Structural guard: a rule cascade is first-match-wins, so if the prose marks one rule as an
    unconditional override ("no exceptions", "no matter", ...) but the translator placed it anywhere
    but first, every earlier rule silently pre-empts it -- exactly `keytar.md`'s reproduced bug
    (recall placed 4th-6th of 5-6 rules, 3/3 runs, because an unrelated ability-cooldown rule with no
    presence check sat above it). This does not special-case keytar: it scans the ORIGINAL prose for
    override language, independently of anything the model said about itself, and maps each hit to a
    rule by plain token overlap (`_match_rule_for_paragraph`) -- so it fires (or doesn't) the same way
    for any pilot with this shape of prose, not just the three checked into this repo.

    Unchanged in scope by the guard tree (spec §2.2): this only ever reorders `schema.root.nodes` --
    the ROOT cascade's own top-level nodes, never anything nested inside a `GuardNode`'s branches, and
    only `TranslatedRule` nodes are ever match candidates (a guard's own judgment question is never an
    override target). If the translator mis-nests an override rule inside a branch instead of the
    root, this still won't find it there and raises exactly as if the rule were missing entirely --
    a safe, loud failure, not a silent one (spec §2.2's stated, deferred edge case).

    Raises `SchemaValidationError` if an override paragraph doesn't match any root-level rule well
    enough (the translator dropped the override rule entirely -- reordering can't fix a missing rule).
    Otherwise returns a schema with the matched rule(s) stably sorted to the front of the root cascade,
    and a plain-English note recorded in `validation_notes` (surfaced to the entrant via
    `render_markdown`) when that actually changed the order.

    vocab-2 schemas match per sentence and never promote a look-alike (`_enforce_absolute_priority_v2`)."""
    if schema.vocab == VOCAB_2:
        return _enforce_absolute_priority_v2(schema, pilot_text)
    paragraphs = _find_absolute_paragraphs(pilot_text)
    if not paragraphs:
        return schema

    root_nodes = list(schema.root.nodes)
    rule_candidates = [(i, n) for i, n in enumerate(root_nodes) if isinstance(n, TranslatedRule)]

    matched_indices: set[int] = set()
    for paragraph in paragraphs:
        idx = _match_rule_for_paragraph(paragraph, [n for _, n in rule_candidates])
        if idx is None:
            phrase = next(p for p in ABSOLUTE_OVERRIDE_PHRASES if p in paragraph.lower())
            raise SchemaValidationError(
                f"the prose uses override language ({phrase!r}) in a paragraph with no matching "
                f"translated rule -- the schema is missing this override entirely: {paragraph[:160]!r}"
            )
        matched_indices.add(rule_candidates[idx][0])
    return _promote(schema, root_nodes, matched_indices, paragraphs)


def _promote(schema: TranslatedSchema, root_nodes: list, matched_indices: set[int], marked: list[str]) -> TranslatedSchema:
    """Stably sorts the matched root nodes to the front, with the note the entrant sees; `marked` is
    the prose that carried the override phrases."""
    order = sorted(range(len(root_nodes)), key=lambda i: (i not in matched_indices, i))
    if order == list(range(len(root_nodes))):
        return schema

    moved_ids = [root_nodes[i].id for i in order if i in matched_indices]
    note = (
        "priority guard: promoted rule(s) "
        + ", ".join(moved_ids)
        + " to the top of the cascade -- the prose uses unconditional-override language for them "
        "(" + ", ".join(sorted({p for p in ABSOLUTE_OVERRIDE_PHRASES if any(p in text.lower() for text in marked)})) + ") "
        "but the translator placed them lower, where an earlier rule could pre-empt them."
    )
    new_root = Cascade(nodes=tuple(root_nodes[i] for i in order), default=schema.root.default)
    return TranslatedSchema(
        pilot_file=schema.pilot_file,
        instrument=schema.instrument,
        raw_model_output=schema.raw_model_output,
        root=new_root,
        validation_notes=schema.validation_notes + (note,),
        build=schema.build,
        vocab=schema.vocab,
        economy=schema.economy,
    )


# --- a shopping list is the build, never a rule (vocab-2 only) --------------------------------------
#
# "Drums: Road Case, then Bass Strings, then Metronome" belongs in `build`. The 9B translator sometimes
# also wrote it as rules: "is this bot at its base? -> go home" once per item, or "does it have a
# Metronome and no Amp? -> go home". A move home that fires because the bot is at its base holds it at
# its fountain all match: 3 of 35 instrument compiles in #84 and in #85
# (runs/vocab2-shopping-not-rules-2026-10-02.md). Under vocab-2 a rule that only restates a pure
# shopping sentence is dropped with a `build:` note; if `build` is missing too, the reply is rejected and
# the retry quotes the line. A real "go home when ..." rule asks about something else and is never one.
# vocab-1 is unchanged.

_SHOPPING_KINDS = frozenset({"build", "buy", "shop", "purchase"})
# What a pure shopping sentence may say besides item names (after `_tokenize`'s stopwords).
_SHOPPING_FILLER = frozenset(
    "buy buys buying bought get grab pick up purchase shop shopping list lists order first next after afterwards "
    "finally last later item items build start starting rush our my we i m at home base fountain keytar violin drums drum".split()
)
_PLACE = frozenset({"base", "home", "fountain"})
_AT_BASE_FILLER = _PLACE | frozenset({"bot", "bearbot", "s", "currently", "now", "right", "standing", "located"})
_SHOPPING_ID = re.compile(r"shop|buy|purchase|item|build|order", re.IGNORECASE)
_BASE_STATED = re.compile(r"\b(?:base|fountain)\b|\b(?:at|in|stay|stays|wait|waits|sit|sits)\s+(?:my\s+|our\s+|the\s+)?home\b", re.IGNORECASE)


def _item_patterns(economy: str | None) -> dict[str, re.Pattern]:
    pats = {}
    for key, it in items(economy).items():
        alts = {it["name"], key}
        body = "|".join(r"[\s_-]+".join(map(re.escape, re.split(r"[\s_-]+", a))) for a in sorted(alts, key=len, reverse=True))
        pats[key] = re.compile(rf"\b(?:{body})s?\b", re.IGNORECASE)
    return pats


def _items_named(text: str, pats: dict[str, re.Pattern]) -> set[str]:
    return {k for k, p in pats.items() if p.search(text)}


def _is_shopping_sentence(sentence: str, pats: dict[str, re.Pattern]) -> bool:
    """Item names and ordering words only: "Drums: Road Case, then Bass Strings, then Metronome.", "buy
    an amp first, then a road case", "Our shopping lists, in order:". "I buy an Amp when I can afford
    it" is a rule, not a list."""
    rest = sentence
    for p in pats.values():
        rest = p.sub(" ", rest)
    named = rest != sentence or bool(re.search(r"\bshopping\b|\bbuild\b", sentence, re.IGNORECASE))
    return named and not (_tokenize(rest) - _SHOPPING_FILLER)


def _shopping_rule(rule: TranslatedRule, pats: dict[str, re.Pattern], claimed_items: set[str], base_stated: bool) -> set[str] | None:
    """The items a rule restates from the shopping list (empty for an "at its base" rule), or None when
    it isn't one. It is one when it asks about an item no other sentence of the prose names ("can this
    bot afford the Amp?", "does it have a Metronome and no Amp?"), unless it asks about the "next item"
    (that is "when I can afford my next item ...", which may list the items in passing). It is one too
    when it asks only whether the bot is at its base, moves home or holds, its id says shop or buy, and
    no other sentence speaks of the base."""
    text = f"{rule.condition} {rule.criteria_true}"
    named = _items_named(text, pats)
    if named - claimed_items and not re.search(r"\bnext\s+item", text, re.IGNORECASE):
        return named
    tokens = _tokenize(text)
    at_base_only = bool(tokens & _PLACE) and not (tokens - _AT_BASE_FILLER)
    parks = rule.action_kind == "hold" or (rule.action_kind == "move" and rule.action_target_selector == "home")
    if at_base_only and parks and not base_stated and (_SHOPPING_ID.search(rule.id) or _items_named(rule.id, pats)):
        return set()
    return None


def enforce_shopping_list(schema: TranslatedSchema, pilot_text: str) -> TranslatedSchema:
    """vocab-2 only (vocab-1 gets `schema` back): drops every rule, anywhere in the tree, that restates
    a pure shopping sentence of `pilot_text` (`_shopping_rule`), with a `build:` note the entrant sees.
    Raises `SchemaValidationError`, which `translate_pilot` retries, quoting the shopping line, when such
    a rule is there but `build` is not, or when nothing would be left at the root."""
    if schema.vocab != VOCAB_2:
        return schema
    pats = _item_patterns(schema.economy)
    sentences = _prose_sentences(pilot_text)
    shopping = [s for s in sentences if _is_shopping_sentence(s, pats)]
    if not shopping:
        return schema
    others = [s for s in sentences if s not in shopping]
    claimed = set().union(*(_items_named(s, pats) for s in others))
    base_stated = any(_BASE_STATED.search(s) for s in others)
    found: list[tuple[TranslatedRule, set[str]]] = []

    def walk(cascade: Cascade) -> Cascade:
        nodes: list[Node] = []
        for node in cascade.nodes:
            if isinstance(node, GuardNode):
                nodes.append(dataclasses.replace(node, then=walk(node.then), else_=walk(node.else_)))
                continue
            named = _shopping_rule(node, pats, claimed, base_stated)
            if named is None:
                nodes.append(node)
            else:
                found.append((node, named))
        return Cascade(nodes=tuple(nodes), default=cascade.default)

    new_root = walk(schema.root)
    if not found:
        return schema

    def quote(named: set[str]) -> str:
        lines = [s for s in shopping if _items_named(s, pats) & named] or [s for s in shopping if _items_named(s, pats)] or shopping
        return " / ".join(" ".join(s.split()) for s in lines)[:200]

    if schema.build is None or not new_root.nodes:
        rule, named = found[0]
        raise SchemaValidationError(
            f"rule {rule.id} restates the shopping list, and a shopping list is not a rule -- put its items in the top-level "
            f'"build" list and write no rule for it: {quote(named)!r}'
        )
    notes = tuple(
        f"{NOTE_PREFIX} removed rule {rule.id} (\"{rule.condition}\") -- it restates your shopping list "
        f"({quote(named)!r}), which is the build ({format_build(schema.build, schema.economy)}), not a rule. "
        "As a rule it would have " + ("sent the bot home and held it at its base whenever it fired." if not named
                                      else "fired on what the bot owns or can buy, not on anything your rules say.")
        for rule, named in found
    )
    return dataclasses.replace(schema, root=new_root, rules=(), validation_notes=schema.validation_notes + notes)


# --- a rule that asks only which bearbot this is (vocab-2 only) --------------------------------------
#
# "Violin: Amp, then Bass Strings, then Road Case." The 9B sometimes made the line's label a rule of its
# own: "is this bot's instrument 'Violin'? -> hold", as rule 1 (3 of #87's 35 compiles, each on the first
# reply). The game states this bearbot's instrument and team, and neither changes during a match, so
# such a question has one answer for the whole match: the violin would hold on every decision. Under
# vocab-2 a rule whose question asks about nothing but this bearbot's own instrument or team is rejected,
# and the retry quotes the prose line it came from, never the question (#87's lesson: the 9B copies a
# quoted question back). On the last attempt the rule is dropped with an `identity:` note instead. A
# question that asks anything else as well ("is an enemy violin in sight?", "is this bot's instrument
# the violin and can it afford an Amp?") is left alone. vocab-1 is unchanged.

IDENTITY_NOTE_PREFIX = "identity:"

_IDENTITY_INSTRUMENT = frozenset({"instrument", "instruments", "keytar", "keytars", "violin", "violins", "drum", "drums"})
_IDENTITY_TEAM = frozenset({"team", "violet", "green"})
_IDENTITY_NAMES = (_IDENTITY_INSTRUMENT | _IDENTITY_TEAM) - {"instrument", "instruments", "team"}
_INSTRUMENT_LABEL = re.compile(r"\b(?:keytar|violin|drums?)\W{0,2}:", re.IGNORECASE)  # "Violin: Amp, ...", "**Drums:**"
_IDENTITY_FILLER = frozenset(
    "is are am be a an the this that it its own my our i me s bot bots bearbot bearbots of on in for as to "
    "which what does do play plays playing currently assigned named called and or".split()
)


def _identity_only(condition: str) -> str | None:
    """"instrument", "team" or "instrument and team" when `condition` asks about nothing but this
    bearbot's own instrument or team ("is this bot's instrument 'Violin'?", "is this bearbot on the
    violet team?"), else None. Any other word ("enemy", "side", "near", "afford") makes it a real
    question."""
    words = set(re.findall(r"[a-z]+", condition.lower()))
    if words - _IDENTITY_FILLER - _IDENTITY_INSTRUMENT - _IDENTITY_TEAM:
        return None
    what = [w for w, vocab_ in (("instrument", _IDENTITY_INSTRUMENT), ("team", _IDENTITY_TEAM)) if words & vocab_]
    return " and ".join(what) or None


def _identity_sentence(rule: TranslatedRule, sentences: list[str]) -> str | None:
    """The prose sentence the rule came from: of the sentences naming an instrument or team the question
    names, the one sharing the most words with the rule (id included); the first on a tie."""
    asked = set(re.findall(r"[a-z]+", rule.condition.lower())) & _IDENTITY_NAMES
    asked |= {w.rstrip("s") for w in asked} | {w + "s" for w in asked}
    tokens = _rule_tokens_v2(rule) | _tokenize(rule.id.replace("_", " "))
    best, best_score = None, -1
    for s in sentences:
        own = set(re.findall(r"[a-z]+", s.lower()))
        if own & asked and len(_tokenize(s) & tokens) > best_score:
            best, best_score = " ".join(s.split()), len(_tokenize(s) & tokens)
    return best


def enforce_identity_rules(schema: TranslatedSchema, pilot_text: str, drop: bool = False) -> TranslatedSchema:
    """vocab-2 only (vocab-1 gets `schema` back): when a rule anywhere in the tree asks only about this
    bearbot's own instrument or team (`_identity_only`), raises `SchemaValidationError`, which
    `translate_pilot` retries; the message quotes the prose line the rule came from, not the question.
    With `drop` (`translate_pilot`'s last attempt) every such rule is removed instead, each with an
    `identity:` note the entrant sees, and it raises only if nothing would be left at the root. A schema
    with no such rule is returned as it came."""
    if schema.vocab != VOCAB_2:
        return schema
    sentences = _prose_sentences(pilot_text)
    found: list[tuple[TranslatedRule, str, str | None]] = []

    def walk(cascade: Cascade) -> Cascade:
        nodes: list[Node] = []
        for node in cascade.nodes:
            if isinstance(node, GuardNode):
                nodes.append(dataclasses.replace(node, then=walk(node.then), else_=walk(node.else_)))
                continue
            what = _identity_only(node.condition)
            if what:
                found.append((node, what, _identity_sentence(node, sentences)))
            else:
                nodes.append(node)
        return Cascade(nodes=tuple(nodes), default=cascade.default)

    new_root = walk(schema.root)
    if not found:
        return schema
    if not drop or not new_root.nodes:
        rule, what, sentence = found[0]
        msg = (f"rule {rule.id} asks only about this bearbot's own {what}, which never changes during a match, so it would "
               "fire on every decision or on none. Remove that rule and keep the others.")
        if sentence:
            msg += f' It came from the prose line "{sentence[:200]}"'
            if _INSTRUMENT_LABEL.search(sentence):
                msg += ": the label before the colon only says which instrument the line is for"
            if _is_shopping_sentence(sentence, _item_patterns(schema.economy)):
                msg += ', and its items belong in the top-level "build" list'
            msg += "."
        raise SchemaValidationError(msg)
    notes = tuple(
        f'{IDENTITY_NOTE_PREFIX} removed rule {rule.id} ("{rule.condition}") -- it asks only about this bearbot\'s own {what}, '
        "which never changes during a match, so it would have fired on every decision (holding everything below it) or on none."
        + (f' It came from "{sentence[:200]}"; rewording that line may help.' if sentence else "")
        for rule, what, sentence in found
    )
    return dataclasses.replace(schema, root=new_root, rules=(), validation_notes=schema.validation_notes + notes)


# --- instrument scope (spec §10) --------------------------------------------------------------------

_INST = r"(?:drums?|keytar|violin)"
_INST_LIST = rf"{_INST}(?:\s*(?:,|/|&|\band\b|\bor\b)\s*{_INST})*"
_EMPH = r"[*_]{0,2}"
# "keytar only: ...", "(violin only) ...", "violin and keytar only - ...", "keytar-only: ...", "**Drums:** ..."
_MARKER_BODY = rf"\(?{_EMPH}(?P<insts>{_INST_LIST})(?:[\s-]+only\b{_EMPH}\s*(?:[:)\-–—,]|$)|{_EMPH}\s*:)"
_LINE_MARKER = re.compile(rf"^(?P<indent>[ \t]*)(?P<item>(?:[-*•+]|\d+[.)])\s+)?{_MARKER_BODY}", re.IGNORECASE)
_HEADING_MARKER = re.compile(rf"^\s*(?P<hashes>#{{1,6}})\s+{_EMPH}(?P<insts>{_INST_LIST})(?:[\s-]+only)?{_EMPH}\s*:?{_EMPH}\s*$", re.IGNORECASE)
_HEADING = re.compile(r"^\s*(#{1,6})\s")
_LIST_ITEM = re.compile(r"^\s*(?:[-*•+]|\d+[.)])\s+")
# a second marked clause later on the same line: "Keytar only: chord it. Violin only: staccato it."
_INLINE_SPLIT = re.compile(rf"(?<=[.!?;])\s+(?={_MARKER_BODY.replace('(?P<insts>', '(?:')})", re.IGNORECASE)


@dataclass(frozen=True)
class ScopedProse:
    """`text` is what the model is shown for one instrument; `set_aside` is every clause (with its
    continuation lines) the prose explicitly marks for a different instrument, in file order."""

    text: str
    set_aside: tuple[str, ...]


def _instruments_in(marker_insts: str) -> set[str]:
    return {"drums" if m.lower().startswith("drum") else m.lower() for m in re.findall(_INST, marker_insts, re.IGNORECASE)}


def scope_to_instrument(pilot_text: str, instrument: str) -> ScopedProse:
    """Deterministic, conservative: only an EXPLICIT marker at the start of a line (or of a sentence
    within one) scopes prose -- "<instrument(s)> only" followed by a separator, "<instrument(s)>:",
    or a markdown heading naming instruments. A marked clause runs to the end of its line plus any
    continuation lines (indented deeper, or finishing an unfinished sentence, and not a new list
    item); a marker with nothing after it ("Keytar only:" alone, or a heading) scopes the whole
    block below it -- to the next blank line, or for a heading to the next heading at its level.
    Everything else -- including sentences that merely mention an instrument ("protect our violin")
    -- is shared and passes through. Phrasings this doesn't recognise ("as the violin, ...") are left
    to the prompt and `enforce_instrument_scope`. Returns `pilot_text` unchanged (same object) when
    nothing is set aside, so a reference pilot stays byte-identical for `segment.hand_segments_for`."""
    instrument = instrument.lower()
    units: list[tuple[int, str]] = []  # (physical line index, text)
    for i, line in enumerate(pilot_text.split("\n")):
        start = 0
        for m in _INLINE_SPLIT.finditer(line):
            if _LIST_ITEM.fullmatch(line[: m.end()]):
                continue  # "3. keytar only:" -- the "." ends a list number, not a sentence
            units.append((i, line[start : m.start()]))
            start = m.end()
        units.append((i, line[start:]))

    kept: dict[int, list[str]] = {}
    set_aside: list[list[str]] = []
    scope: set[str] | None = None
    kind = None  # "line" | "block" | "heading"
    marker_indent = 0
    heading_level = 0
    prev_text = ""
    for line_no, text in units:
        heading = _HEADING_MARKER.match(text)
        marker = None if heading else _LINE_MARKER.match(text)
        if heading:
            scope, kind, heading_level = _instruments_in(heading.group("insts")), "heading", len(heading.group("hashes"))
        elif marker:
            rest = text[marker.end():].strip(" \t*_")
            scope, kind = _instruments_in(marker.group("insts")), ("line" if rest else "block")
            marker_indent = len(marker.group("indent").expandtabs())
        elif scope is not None:
            blank = not text.strip()
            other_heading = _HEADING.match(text)
            if kind == "heading":
                if other_heading and len(other_heading.group(1)) <= heading_level:
                    scope = None
            elif kind == "block":
                if blank or other_heading:
                    scope = None
            else:  # "line"
                indent = len(text) - len(text.lstrip(" \t"))
                unfinished = not re.search(r"[.!?:;]\s*$", prev_text)
                if blank or other_heading or _LIST_ITEM.match(text) or not (indent > marker_indent or unfinished):
                    scope = None
        if scope is None or instrument in scope:
            kept.setdefault(line_no, []).append(text)
        elif (heading or marker) or not set_aside:
            set_aside.append([text])
        else:
            set_aside[-1].append(text)
        prev_text = text

    if not set_aside:
        return ScopedProse(pilot_text, ())
    lines = [" ".join(kept[i]) for i in sorted(kept)]
    return ScopedProse("\n".join(lines), tuple("\n".join(clause) for clause in set_aside))


def _possessive(instrument: str) -> str:
    return instrument + ("'" if instrument.endswith("s") else "'s")


def _ability_owner(ability: str) -> str | None:
    for inst, names in ABILITIES.items():
        if ability.lower() in names:
            return inst
    return None


def _foreign_cooldown_question(condition: str, instrument: str) -> str | None:
    """The phrase in `condition` that asks about ANOTHER instrument's ability or cooldown ("is the
    violin ability cooldown zero", "is chord ready"), or None. This bot's observation only carries its
    own two cooldowns, so such a question has no answer in the state -- unlike a mention of another
    instrument as an ally or enemy, which is intent (and is only flagged)."""
    others = [i for i in ABILITIES if i != instrument]
    names = r"|".join(i.rstrip("s") + "s?" for i in others)
    abilities = r"|".join(a for i in others for a in ABILITIES[i])
    for pattern in (
        rf"\b(?:{names})(?:'s)?\s+(?:ability|abilities|cooldowns?|cd|{abilities})\b",
        rf"\b(?:{abilities})(?:'s)?\s+(?:ability\s+)?(?:cooldown|cd|timer)\b",
        rf"\b(?:{abilities})\s+(?:is\s+)?(?:ready|off cooldown|available)\b",
        rf"\bis\s+(?:the\s+)?(?:{abilities})\s+(?:ready|off cooldown|available)\b",
    ):
        m = re.search(pattern, condition, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def enforce_instrument_scope(schema: TranslatedSchema, instrument: str, primary_ability: str, ultimate_ability: str) -> TranslatedSchema:
    """Schema-assembly guard, the backstop behind `scope_to_instrument` and the prompt: walks the
    WHOLE tree (rules nested in guard branches too) and

    - removes a rule whose action is an ability that isn't this instrument's own -- another
      instrument's (`chord` in a drums schema), none at all (the live model's merged
      "ability_ready" rule), or a name no instrument has. The sim silently ignores such an action
      (`src/sim/match.ts`), so the rule could only ever burn the decision and pre-empt every rule
      below it;
    - removes a rule whose QUESTION asks about another instrument's ability or cooldown
      (`_foreign_cooldown_question`) -- unanswerable from this bot's observation;
    - flags, without removing, a rule whose condition or id names another instrument in any other
      way ("is an enemy near our violin?") -- allies' and enemies' instruments aren't observable, so
      it can't be checked, but it may be exactly what the entrant meant.

    Own ability names are canonicalised ("Kick" -> "kick"). Each removal/flag is a plain-English
    `validation_notes` entry prefixed "instrument scope:" (the entrant sees it). Raises ValueError --
    which `translate_pilot` retries like a parse failure -- if a cascade DEFAULT names a foreign
    ability, or if nothing is left at the root."""
    own = {primary_ability.lower(): primary_ability, ultimate_ability.lower(): ultimate_ability}
    others = [i for i in ABILITIES if i != instrument]
    notes: list[str] = []

    def check_default(action: Action | None, where: str) -> Action | None:
        if action is None or action.kind != "ability":
            return action
        canonical = own.get((action.ability or "").strip().lower())
        if canonical is None:
            raise ValueError(f"{where}: default action uses ability {action.ability!r}, which is not one of the {_possessive(instrument)} ({primary_ability}, {ultimate_ability})")
        return Action(action.kind, canonical, action.target_selector)

    def walk(cascade: Cascade, where: str) -> Cascade:
        nodes: list[Node] = []
        for node in cascade.nodes:
            if isinstance(node, GuardNode):
                nodes.append(dataclasses.replace(node, then=walk(node.then, f"guard {node.id} yes-branch"), else_=walk(node.else_, f"guard {node.id} no-branch")))
                continue
            if node.action_kind == "ability":
                canonical = own.get((node.action_ability or "").strip().lower())
                if canonical is None:
                    owner = _ability_owner(node.action_ability or "")
                    why = (f"it uses {node.action_ability}, which is the {_possessive(owner)} ability" if owner
                           else f'its action names {"no ability" if not node.action_ability else repr(node.action_ability) + ", which no instrument has"}')
                    notes.append(
                        f"instrument scope: removed rule {node.id} -- {why}, not the {_possessive(instrument)} ({primary_ability}/{ultimate_ability}); "
                        f"a {instrument} bearbot trying it would do nothing that tick. If your prose meant the {_possessive(instrument)} own ability, name it."
                    )
                    continue
                node = dataclasses.replace(node, action_ability=canonical)
            asked = _foreign_cooldown_question(node.condition, instrument)
            if asked:
                notes.append(
                    f'instrument scope: removed rule {node.id} -- its question asks about another instrument\'s ability ("{asked}"), '
                    f"which a {instrument} bearbot doesn't have, so Jev could never answer it from this bot's observation."
                )
                continue
            text = f"{node.id} {node.condition}".lower()
            named = [o for o in others if re.search(rf"\b{o.rstrip('s')}s?\b", text)]
            if named:
                notes.append(
                    f"instrument scope: rule {node.id} mentions the {', '.join(named)} -- this schema is the {_possessive(instrument)}, and allies' "
                    f"and enemies' instruments are not in the observation. If that clause was meant only for the {named[0]}, "
                    f'start its line with "{named[0]} only:".'
                )
            nodes.append(node)
        return Cascade(nodes=tuple(nodes), default=check_default(cascade.default, where))

    new_root = walk(schema.root, "root")
    if not new_root.nodes:
        raise ValueError(f"every rule the translator produced belongs to another instrument, none to the {instrument}")
    if new_root == schema.root and not notes:
        return schema
    return TranslatedSchema(
        pilot_file=schema.pilot_file,
        instrument=schema.instrument,
        raw_model_output=schema.raw_model_output,
        root=new_root,
        validation_notes=schema.validation_notes + tuple(notes),
        build=schema.build,
        vocab=schema.vocab,
        economy=schema.economy,
    )


# --- a negated clause keeps its "no" (vocab-2 only) --------------------------------------------------
#
# "When I can afford my next item and no enemy is in sight, I head home to shop." The 9B translator
# sometimes split that sentence into two rules and lost the "no" in the second: "is there any enemy
# within 260 units? -> go home" (id `shop_no_enemy`), which sends the bot home BECAUSE it sees an
# enemy. That was 7 of #85's 35 compiles and 1 of #86's 36 (runs/vocab2-negation-polarity-2026-10-02.md).
# The criteria follow the question the model wrote, so they agree with it, and no step after the model
# reads the prose's "no". Under vocab-2, a rule whose question asks only whether a thing IS there, while
# the rule's own id or the prose sentence it comes from says it is NOT, is rejected, and the retry quotes
# the prose's negated clause and its sentence (the same shape as the priority and shopping guards), never
# the wrong question: a first retry message that quoted it got it copied back word for word. On the last
# attempt the rule is dropped instead, with a `negation:` note, so the instrument still compiles. A
# question that keeps a "no" or "not" on the thing is never touched. vocab-1 is unchanged.

NEGATION_NOTE_PREFIX = "negation:"

_NEG_BEFORE = frozenset("no not none never without zero nobody nothing fewer neither nor isn't aren't can't cannot don't doesn't".split())
_NEG_AFTER = frozenset({"absent", "gone", "missing", "dead", "zero", "out"})  # "out" as in "out of sight / out of range"
_CLAUSE_BREAK = frozenset("and or but then while when if unless because so , ; : . ? !".split())
_ENEMY_WORDS = frozenset({"enemy", "enemies", "opponent", "opponents", "foe", "foes"})
_TOWER_WORDS = frozenset({"tower", "towers", "nexus"})
_OWN_WORDS = frozenset({"own", "my", "our", "allied", "friendly"})


def _polar_words(text: str) -> list[str]:
    words = re.findall(r"[a-z']+|[,;:.?!]", text.lower().replace("_", " ").replace("’", "'"))
    return [w[:-2] if w.endswith("'s") else w.rstrip("'") for w in words]


def _negated(words: list[str], start: int, end: int, after: bool = True) -> bool:
    """A "no"/"not"/"none" up to four words before the mention, or (`after`) "absent"/"gone"/"out" up
    to three after it, inside the same clause ("and", "or", "if" and punctuation end one)."""
    for w in reversed(words[max(0, start - 4):start]):
        if w in _CLAUSE_BREAK:
            break
        if w in _NEG_BEFORE:
            return True
    for w in words[end + 1:end + 4] if after else ():
        if w in _CLAUSE_BREAK:
            break
        if w in _NEG_AFTER:
            return True
    return False


def _polarities(text: str, after: bool = True) -> dict[str, set[bool]]:
    """What `text` asks or says about each thing it names -- "enemy" (an enemy bearbot, or any enemy),
    "enemy tower", "own tower", "enemy minion", "minion" (mine, or my wave), "ally" -- mapped to the
    set of its polarities: False for "is there" ("an enemy is in sight"), True for "is not there" ("no
    enemy is in sight", "none of my minions", "not inside an enemy tower's range"). A thing named both
    ways has both. `after=False` counts only a negation before the thing (for a rule id, where
    "push_wave_dead_enemy" is a dead enemy, not a dead wave)."""
    words = _polar_words(text)
    out: dict[str, set[bool]] = {}
    i = 0
    while i < len(words):
        w, nxt = words[i], words[i + 1] if i + 1 < len(words) else ""
        before = set(words[max(0, i - 2):i])
        end = i
        if w in _ENEMY_WORDS:
            thing = "enemy tower" if nxt in _TOWER_WORDS else "enemy minion" if nxt in _MINION_WORDS else "enemy"
            end = i + 1 if thing != "enemy" else i
        elif w in _TOWER_WORDS:
            thing = "own tower" if _OWN_WORDS & before else "enemy tower"
        elif w in _MINION_WORDS:
            thing = "enemy minion" if {"their", "theirs"} & before else "minion"
        elif w in _TEAMMATE_WORDS or (w in _ALLY_WORDS and nxt not in _MINION_WORDS | _TOWER_WORDS):
            thing = "ally"
        else:
            i += 1
            continue
        out.setdefault(thing, set()).add(_negated(words, i, end, after))
        i = end + 1
    return out


def _negation_lost(rule: TranslatedRule, sentences: list[str], sentence_polarities: list[dict[str, set[bool]]]) -> tuple[str, str] | None:
    """(the thing, the prose sentence) when `rule`'s question asks only whether the thing IS there, but
    the sentence the rule states says it is NOT, or the rule's own id does ("shop_no_enemy") and a
    sentence of the prose says so. The sentence the rule states is the one sharing the most words with
    it (id and target included), at least two, and no other sentence as many; one that names the thing
    both ways ("walk with my nearest minion, and if I have no minions ...") decides nothing, and neither
    does it when another sentence names the thing as there and gives the rule words of its own (a rule
    merging "afford my next item" with "300 gold and an enemy in sight" took its enemy from the second).
    None when the question keeps the negation, or nothing says there was one."""
    affirmed = [thing for thing, pols in _polarities(rule.condition).items() if pols == {False}]
    if not affirmed:
        return None
    tokens = _rule_tokens_v2(rule) | _tokenize(rule.id.replace("_", " "))
    sentence_tokens = [_tokenize(s) for s in sentences]
    scores = [len(tokens & t) for t in sentence_tokens]
    top = max(scores, default=0)
    own = scores.index(top) if top >= 2 and scores.count(top) == 1 else None
    id_polarities = _polarities(rule.id, after=False)
    for thing in affirmed:
        if own is not None and sentence_polarities[own].get(thing) == {True} and not any(
            False in pols.get(thing, ()) and (tokens & sentence_tokens[j]) - sentence_tokens[own]
            for j, pols in enumerate(sentence_polarities) if j != own
        ):
            return thing, sentences[own]
        if id_polarities.get(thing) == {True}:
            saying = [i for i, pols in enumerate(sentence_polarities) if True in pols.get(thing, ()) and scores[i] >= 2]
            if saying:
                return thing, sentences[max(saying, key=lambda i: scores[i])]
    return None


_CLAUSE_SPLIT = re.compile(r"[,;:.?!]|\b(?:and|or|but|then|while|when|if|unless|because|so)\b", re.IGNORECASE)


def _negated_clause(sentence: str, thing: str) -> str:
    """The clause of `sentence` that says `thing` is not there ("no enemy is in sight"), or the whole
    sentence when no single clause does."""
    for clause in _CLAUSE_SPLIT.split(sentence):
        if True in _polarities(clause).get(thing, ()):
            return " ".join(clause.split())
    return " ".join(sentence.split())


def enforce_negation(schema: TranslatedSchema, pilot_text: str, drop: bool = False) -> TranslatedSchema:
    """vocab-2 only (vocab-1 gets `schema` back). For a rule anywhere in the tree whose question dropped
    a negation its prose states (`_negation_lost`), raises `SchemaValidationError`, which `translate_pilot`
    retries; the message quotes the prose's negated clause and its sentence, not the rule's question. With
    `drop` (`translate_pilot`'s last attempt) every such rule is removed instead, each with a `negation:`
    note the entrant sees, and it raises only if nothing would be left at the root. A schema with no
    such rule is returned as it came."""
    if schema.vocab != VOCAB_2:
        return schema
    sentences = _prose_sentences(pilot_text)
    polarities = [_polarities(s) for s in sentences]
    found: list[tuple[TranslatedRule, str, str]] = []

    def walk(cascade: Cascade) -> Cascade:
        nodes: list[Node] = []
        for node in cascade.nodes:
            if isinstance(node, GuardNode):
                nodes.append(dataclasses.replace(node, then=walk(node.then), else_=walk(node.else_)))
                continue
            lost = _negation_lost(node, sentences, polarities)
            if lost:
                found.append((node, _negated_clause(lost[1], lost[0]), " ".join(lost[1].split())))
            else:
                nodes.append(node)
        return Cascade(nodes=tuple(nodes), default=cascade.default)

    new_root = walk(schema.root)
    if not found:
        return schema
    if not drop or not new_root.nodes:
        rule, clause, sentence = found[0]
        raise SchemaValidationError(
            f'rule {rule.id} lost a "no" the prose states: the prose says "{clause}", and the rule must fire only then. '
            f'Keep its no/not/none in the question, and write one rule for the whole sentence: "{sentence[:200]}"'
        )
    notes = tuple(
        f'{NEGATION_NOTE_PREFIX} removed rule {rule.id} ("{rule.condition}") -- your prose says "{clause}" '
        f'("{sentence[:200]}"), but this question asks the opposite, so it would have fired exactly when your prose says not to. '
        "Every translation of it lost that \"no\"; rewording the sentence may help."
        for rule, clause, sentence in found
    )
    return dataclasses.replace(schema, root=new_root, rules=(), validation_notes=schema.validation_notes + notes)


def translate_pilot(
    pilot_text: str,
    pilot_file: str,
    instrument: str,
    primary_ability: str,
    ultimate_ability: str,
    ollama_url: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 3,
    generate=None,
    vocab: str = VOCAB_1,
    economy: str | None = None,
) -> TranslatedSchema:
    """`generate`, when given, is a `prompt -> reply text` callable that replaces the host-Ollama
    call (`llm_backends.Backend.generate` -- how `compile.py` runs the same translation on
    OpenRouter, or under a token cap). The prompt, parsing, retries and guards are the same
    either way. `economy` names the ruleset whose items the prompt lists and `build` is checked
    against (None = `economy_rules.DEFAULT_ECONOMY`); every backend gets the same prompt.

    `vocab` (`vocab.py`) picks the prompt's selector and facts lists and the selectors the reply
    may name, and the schema records it. vocab-1 by default here, so a research harness keeps the
    prompt it measured; `compile.py`, the entrant path, defaults to `vocab.DEFAULT_VOCAB`.

    The model only ever sees `scope_to_instrument(pilot_text, instrument).text`, and the priority
    guard reads the same scoped text -- another instrument's "no exceptions" clause must not demand a
    rule in this schema."""
    if generate is None:
        url = resolve_ollama_url(ollama_url)
        generate = lambda p: _ollama_generate(url, model, p, timeout=90.0, max_tokens=1800)  # noqa: E731
    scoped = scope_to_instrument(pilot_text, instrument)
    scope_notes = ()
    if scoped.set_aside:
        quoted = "; ".join('"' + " ".join(c.split())[:80] + ('…"' if len(" ".join(c.split())) > 80 else '"') for c in scoped.set_aside)
        scope_notes = (
            f"instrument scope: {len(scoped.set_aside)} clause(s) your prose marks for another instrument were left out "
            f"of the {instrument} schema (each is compiled only for the instrument it names): {quoted}",
        )
    vocab = resolve_vocab(vocab)
    prompt = _translation_prompt(scoped.text, instrument, primary_ability, ultimate_ability, vocab, economy=economy)
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        reply = generate(prompt)
        last = attempt == max_attempts - 1
        try:
            raw_json, guard_notes = enforce_finished_guards(_extract_json_object(reply), vocab, drop=last)
            schema = parse_schema(raw_json, pilot_file, instrument, reply, vocab, economy=economy)
            if scope_notes or guard_notes:
                schema = dataclasses.replace(schema, validation_notes=schema.validation_notes + guard_notes + scope_notes)
            schema = enforce_instrument_scope(schema, instrument, primary_ability, ultimate_ability)
            schema = enforce_shopping_list(schema, scoped.text)
            schema = enforce_identity_rules(schema, scoped.text, drop=last)
            schema = enforce_negation(schema, scoped.text, drop=attempt == max_attempts - 1)
            return enforce_absolute_priority(schema, scoped.text)
        except UnfinishedGuardError as err:
            last_err = err
            prompt = (
                _translation_prompt(scoped.text, instrument, primary_ability, ultimate_ability, vocab, economy=economy)
                + f"\n\nYour previous attempt was invalid: {err}. Output ONLY the JSON object, no other text."
            )
        except (ValueError, json.JSONDecodeError) as err:
            last_err = err
            prompt = (
                _translation_prompt(scoped.text, instrument, primary_ability, ultimate_ability, vocab, economy=economy)
                + f"\n\nYour previous attempt was invalid: {err}. If this mentions a 'guard_'-named "
                "rule, you emitted a plain rule action for something that needed the full guard shape "
                "(type/then/else) -- either finish the guard shape or use a normal rule instead. "
                "Output ONLY the JSON object, no other text."
            )
    raise RuntimeError(f"translation failed after {max_attempts} attempts: {last_err}")


def _branch_letter(idx: int) -> str:
    return chr(ord("a") + idx)


def _guard_default_condition_text(which: str) -> str:
    return f'*(guard\'s own "{"yes" if which == "then" else "no"}" default)*'


def display_rows(root: Cascade) -> list[dict]:
    """Flattens a `Cascade` into ordered display rows: `translator.render_markdown` and
    `transparency.render_report_markdown` (§2.3's quick-view table) share this so both views number
    a tree the same way. Each `GuardNode` gets one row, immediately followed by its `then` branch's
    rows, `then`'s own trailing-default row, `else`'s rows, and `else`'s own trailing-default row --
    the shape `docs/translator-guards-and-defaults-spec.md` §2.3's worked table uses. Labels are
    `'1'`, `'2'`, ... at the root; inside guard `N`'s branches they are `'Na'`, `'Nb'`, ... continuing
    ONE letter sequence across `then` then `else` (so `then`'s own default and `else`'s rows/default
    keep counting up from wherever `then`'s rules left off -- exactly `2a`/`2b`/`2c` in the spec's own
    example, where `then` has one rule and `else` has none).

    For a `Cascade` with zero `GuardNode`s (the flat case), this is exactly the old numbered list --
    a compatibility property, not a different code path, matching `evaluate_cascade`'s own posture."""

    def build(cascade: Cascade, numbering: list[str], branch_ctx: str | None) -> list[dict]:
        rows: list[dict] = []
        for label, node in zip(numbering, cascade.nodes):
            if isinstance(node, GuardNode):
                n_then, n_else = len(node.then.nodes), len(node.else_.nodes)
                sub = [f"{label}{_branch_letter(i)}" for i in range(n_then + n_else + 2)]
                then_labels, then_default_label = sub[:n_then], sub[n_then]
                else_labels = sub[n_then + 1 : n_then + 1 + n_else]
                else_default_label = sub[n_then + 1 + n_else]
                first_then = then_labels[0] if then_labels else then_default_label
                first_else = else_labels[0] if else_labels else else_default_label
                rows.append(
                    {
                        "label": label,
                        "branch": branch_ctx,
                        "kind": "guard",
                        "node": node,
                        "condition": f"*(guard)* {node.condition}",
                        "then": f"→ {first_then} if yes, {first_else} if no",
                        "then_labels": then_labels,
                        "then_default_label": then_default_label,
                        "else_labels": else_labels,
                        "else_default_label": else_default_label,
                    }
                )
                then_ctx = f"if guard {label} = yes"
                else_ctx = f"if guard {label} = no"
                rows.extend(build(node.then, then_labels, then_ctx))
                rows.append(
                    {
                        "label": then_default_label,
                        "branch": then_ctx + (f", none of {', '.join(then_labels)} matched" if then_labels else ""),
                        "kind": "branch_default",
                        "guard": node,
                        "condition": _guard_default_condition_text("then"),
                        "then": _describe_action(node.then.default.kind, node.then.default.ability, node.then.default.target_selector)
                        if node.then.default
                        else "*(no default here — escalates to the nearest enclosing default)*",
                    }
                )
                rows.extend(build(node.else_, else_labels, else_ctx))
                rows.append(
                    {
                        "label": else_default_label,
                        "branch": else_ctx + (f", none of {', '.join(else_labels)} matched" if else_labels else ""),
                        "kind": "branch_default",
                        "guard": node,
                        "condition": _guard_default_condition_text("else"),
                        "then": _describe_action(node.else_.default.kind, node.else_.default.ability, node.else_.default.target_selector)
                        if node.else_.default
                        else "*(no default here — escalates to the nearest enclosing default)*",
                    }
                )
            else:
                rows.append(
                    {
                        "label": label,
                        "branch": branch_ctx,
                        "kind": "rule",
                        "node": node,
                        "condition": node.condition,
                        "then": _describe_action(node.action_kind, node.action_ability, node.action_target_selector),
                    }
                )
        return rows

    return build(root, [str(i + 1) for i in range(len(root.nodes))], None)


def render_markdown(schema: TranslatedSchema) -> str:
    """The entrant-readable rendering -- what an entrant actually reads back, per this module's
    design requirement. Plain prose table, no Jev wire format, no code. A schema with no guards
    renders a Branch column of all "—"; this is the same view, not a different one, for the flat
    case (spec §2.2/§2.3)."""
    lines = [
        f"# Decision schema translated from `{schema.pilot_file}` ({schema.instrument})",
        "",
        "Rules are checked in order; the first one whose condition is true fires. A guard question "
        "routes to one of two branches, each checked the same way and falling back to its own "
        "default before escalating outward. If nothing above fires, the default action at the "
        "bottom runs.",
        "",
        "| # | Branch | Condition | Then |",
        "|---|---|---|---|",
    ]
    for row in display_rows(schema.root):
        lines.append(f"| {row['label']} | {row['branch'] or '—'} | {row['condition']} | {row['then']} |")
    default_desc = _describe_action(schema.default_kind, schema.default_ability, schema.default_target_selector)
    lines.append(f"| — | — | *(none of the above — root default)* | {default_desc} |")
    scope_notes = [n for n in schema.validation_notes if n.startswith("instrument scope:")]
    build_notes = [n for n in schema.validation_notes if n.startswith(NOTE_PREFIX)]
    target_notes = [n for n in schema.validation_notes if n.startswith(TARGET_NOTE_PREFIX)]
    identity_notes = [n for n in schema.validation_notes if n.startswith(IDENTITY_NOTE_PREFIX)]
    unfinished_notes = [n for n in schema.validation_notes if n.startswith(UNFINISHED_GUARD_NOTE_PREFIX)]
    negation_notes = [n for n in schema.validation_notes if n.startswith(NEGATION_NOTE_PREFIX)]
    priority_notes = [n for n in schema.validation_notes
                      if n not in scope_notes and n not in build_notes and n not in target_notes
                      and n not in identity_notes and n not in unfinished_notes and n not in negation_notes]
    if priority_notes:
        lines += ["", "**Automatic priority fixes applied to this schema:**", ""]
        lines += [f"- {note}" for note in priority_notes]
    if unfinished_notes:
        lines += ["", "**Unfinished guards -- what was removed:**", ""]
        lines += [f"- {note}" for note in unfinished_notes]
    if identity_notes:
        lines += ["", "**Rules about which bearbot this is -- what was removed:**", ""]
        lines += [f"- {note}" for note in identity_notes]
    if negation_notes:
        lines += ["", "**Negations -- what was removed:**", ""]
        lines += [f"- {note}" for note in negation_notes]
    if target_notes:
        lines += ["", "**Targets -- what was corrected:**", ""]
        lines += [f"- {note}" for note in target_notes]
    if build_notes:
        lines += ["", "**Shopping list -- what was changed:**", ""]
        lines += [f"- {note}" for note in build_notes]
    if scope_notes:
        lines += ["", "**Instrument scope -- what was kept out of this instrument's schema:**", ""]
        lines += [f"- {note}" for note in scope_notes]
    return "\n".join(lines) + "\n"


BANDSTAND_MOVE_TEXT = "**move to the Bandstand** (up the lane instead while it is neither open nor about to open)"


def _describe_action(kind: str, ability: str | None, selector: str | None) -> str:
    if kind == "move" and selector == "bandstand":
        return BANDSTAND_MOVE_TEXT
    if kind == "ability":
        base = f"use **{ability}**"
    elif kind == "recall":
        return "**recall** home"
    elif kind == "hold":
        return "**hold** (do nothing this tick)"
    else:
        base = f"**{kind}**"
    if selector and selector != "none":
        base += f" targeting: {SELECTOR_DESCRIPTIONS[selector]}"
    return base
