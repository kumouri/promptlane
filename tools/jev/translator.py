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
"""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ground_truth import _ollama_generate, resolve_ollama_url  # noqa: E402
from number_normalize import normalize_numbers_for_trace  # noqa: E402

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
}


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
    that only ever looked at a flat rule list (`fidelity_harness.py`, `compile.py`'s
    schema_to_dict/schema_from_dict, every pre-existing test fixture that constructs a
    `TranslatedSchema(rules=[...], default_kind=..., ...)` directly) keeps working unchanged, because
    `__post_init__` derives whichever side (`root` <-> `rules`+`default_*`) wasn't given explicitly.
    `rules` for a tree WITH guards is the root cascade's own top-level `TranslatedRule` nodes only
    (guard nodes and everything nested inside a branch are not in it) -- `root` is the only
    representation that sees the whole tree."""

    pilot_file: str
    instrument: str
    raw_model_output: str
    rules: tuple[TranslatedRule, ...] = ()
    default_kind: str | None = None
    default_ability: str | None = None
    default_target_selector: str | None = None
    validation_notes: tuple[str, ...] = ()
    root: Cascade | None = None

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


def _translation_prompt(pilot_text: str, instrument: str, primary_ability: str, ultimate_ability: str) -> str:
    selectors_desc = "\n".join(f'  "{k}" -- {v}' for k, v in TARGET_SELECTORS.items())
    return f"""You are translating a game-bot prompt written in prose into a strict decision table.

The bot plays {instrument}. Its two abilities are named "{primary_ability}" (primary) and
"{ultimate_ability}" (secondary/ultimate) -- use exactly these strings for "ability" fields, never
invent a different name.

Read this prose pilot below and extract its strategy as an ORDERED list of nodes, evaluated top to
bottom, FIRST MATCH WINS -- exactly like a priority list. Most nodes are RULES. A rule has:
  "id": a short snake_case id
  "condition": one yes/no question about the bot's current game state (a threshold comparison or a
      presence check -- e.g. "is this bot's hp below a quarter of its max?", "is an enemy bearbot
      within melee range?"). Never a question that needs a text answer.
  "criteria": {{"true": "one short clause describing what 'true' looks like in the state",
      "false": "one short clause describing what 'false' looks like in the state"}}
  "action": {{"kind": one of {ACTION_KINDS}, "ability": one of ["{primary_ability}", "{ultimate_ability}", null],
      "target_selector": one of {list(TARGET_SELECTORS)} or null}}

target_selector meanings (pick the closest match to what the prose says; do not invent a new one):
{selectors_desc}

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
it. Every rule/guard needs a UNIQUE "id" across the whole tree, including inside "then"/"else".

Also include one top-level "default_action" (same "action" shape) for when nothing above matches at
all -- the prose's overall fallback behavior (usually push the lane or go home).

Use between 3 and 8 top-level nodes. Output ONLY this JSON object, nothing else, no markdown fences:

{{"rules": [{{"id": "...", "condition": "...", "criteria": {{"true": "...", "false": "..."}}, "action": {{"kind": "...", "ability": null, "target_selector": null}}}}],
 "default_action": {{"kind": "...", "ability": null, "target_selector": null}}}}

PROSE PILOT:
{pilot_text.strip()}
"""


def _validate_action(action: dict, context: str) -> tuple[str, str | None, str | None]:
    kind = action.get("kind")
    if kind not in ACTION_KINDS:
        raise ValueError(f"{context}: invalid action kind {kind!r}")
    ability = action.get("ability")
    if ability is not None and not isinstance(ability, str):
        raise ValueError(f"{context}: invalid ability {ability!r}")
    selector = action.get("target_selector")
    if selector is not None and selector not in TARGET_SELECTORS:
        raise ValueError(f"{context}: unknown target_selector {selector!r}")
    return kind, ability, selector


def _parse_node(raw: dict, idx: int) -> Node:
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
        then_cascade = _parse_cascade(then_raw.get("nodes") or [], then_raw.get("default_action"), default_required=False)
        else_cascade = _parse_cascade(else_raw.get("nodes") or [], else_raw.get("default_action"), default_required=False)
        return GuardNode(id=rid, condition=cond, criteria_true=ct, criteria_false=cf, then=then_cascade, else_=else_cascade)
    kind, ability, selector = _validate_action(raw.get("action") or {}, f"rule {rid}")
    return TranslatedRule(
        id=rid,
        condition=cond,
        criteria_true=ct,
        criteria_false=cf,
        action_kind=kind,
        action_ability=ability,
        action_target_selector=selector,
    )


def _parse_cascade(nodes_raw: list, default_raw: dict | None, default_required: bool) -> Cascade:
    nodes = tuple(_parse_node(r, i) for i, r in enumerate(nodes_raw or []))
    if default_required:
        kind, ability, selector = _validate_action(default_raw or {}, "default_action")
        default = Action(kind, ability, selector)
    elif default_raw is not None:
        kind, ability, selector = _validate_action(default_raw, "default_action")
        default = Action(kind, ability, selector)
    else:
        default = None
    return Cascade(nodes=nodes, default=default)


def parse_schema(raw_json: dict, pilot_file: str, instrument: str, raw_text: str) -> TranslatedSchema:
    root = _parse_cascade(raw_json.get("rules"), raw_json.get("default_action"), default_required=True)
    if not root.nodes:
        raise ValueError("translator produced zero rules")
    return TranslatedSchema(pilot_file=pilot_file, instrument=instrument, raw_model_output=raw_text, root=root)


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


def evaluate_cascade(cascade: Cascade, answers: dict[str, bool]) -> Action | None:
    """Depth-first, first-true-wins (spec §2.2's `evaluate`, completed: the spec's own pseudocode
    only ever recurses into a guard's `then` branch, never `else` -- a literal reading of it can
    never produce the "no" branch's action at all, which contradicts the worked example (§3.2's 2c)
    and the design's own stated intent ("a guard partitions the decision space"). Implemented here as
    a guard ALWAYS committing to one of its two branches (unlike a rule, which is simply skipped when
    its condition is false) -- both answers route somewhere, symmetrically.

    Returns `None` when nothing anywhere along the committed path had an action -- including no local
    default at any level entered -- so the caller can apply the OUTERMOST (root) default exactly once
    (see `evaluate_schema`); a `None` here must never be silently treated as this cascade's own
    default, or an escalation would be skipped past a level that had one (spec §3.1)."""
    for node in cascade.nodes:
        if isinstance(node, GuardNode):
            branch = node.then if answers.get(node.id) else node.else_
            result = evaluate_cascade(branch, answers)
            return result if result is not None else branch.default
        if answers.get(node.id):
            return Action(node.action_kind, node.action_ability, node.action_target_selector)
    return cascade.default


def evaluate_schema(schema: TranslatedSchema, answers: dict[str, bool]) -> Action:
    """`evaluate_cascade(schema.root, ...)` already applies `root.default` in the plain
    all-false/no-guards case (that's the same object as `cascade.default` at the bottom of the
    function). It does NOT apply `root.default` when a committed guard branch escalates with no
    default of its own anywhere along the path -- that early return never reaches root's own
    trailing-default line. This function is what actually makes `root.default` the outermost,
    last-resort fallback "for the whole tree" (spec §3.1), applied exactly once, here."""
    result = evaluate_cascade(schema.root, answers)
    if result is not None:
        return result
    if schema.root.default is not None:
        return schema.root.default
    raise ValueError("schema evaluation produced no action: no rule, guard-branch default, or root default fired")


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
    `render_markdown`) when that actually changed the order."""
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

    order = sorted(range(len(root_nodes)), key=lambda i: (i not in matched_indices, i))
    if order == list(range(len(root_nodes))):
        return schema

    moved_ids = [root_nodes[i].id for i in order if i in matched_indices]
    note = (
        "priority guard: promoted rule(s) "
        + ", ".join(moved_ids)
        + " to the top of the cascade -- the prose uses unconditional-override language for them "
        "(" + ", ".join(sorted({p for p in ABSOLUTE_OVERRIDE_PHRASES if any(p in para.lower() for para in paragraphs)})) + ") "
        "but the translator placed them lower, where an earlier rule could pre-empt them."
    )
    new_root = Cascade(nodes=tuple(root_nodes[i] for i in order), default=schema.root.default)
    return TranslatedSchema(
        pilot_file=schema.pilot_file,
        instrument=schema.instrument,
        raw_model_output=schema.raw_model_output,
        root=new_root,
        validation_notes=schema.validation_notes + (note,),
    )


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
) -> TranslatedSchema:
    """`generate`, when given, is a `prompt -> reply text` callable that replaces the host-Ollama
    call (`llm_backends.Backend.generate` -- how `compile.py` runs the same translation on
    OpenRouter, or under a token cap). The prompt, parsing, retries and priority guard are the same
    either way."""
    if generate is None:
        url = resolve_ollama_url(ollama_url)
        generate = lambda p: _ollama_generate(url, model, p, timeout=90.0, max_tokens=1800)  # noqa: E731
    prompt = _translation_prompt(pilot_text, instrument, primary_ability, ultimate_ability)
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        reply = generate(prompt)
        try:
            raw_json = _extract_json_object(reply)
            schema = parse_schema(raw_json, pilot_file, instrument, reply)
            return enforce_absolute_priority(schema, pilot_text)
        except (ValueError, json.JSONDecodeError) as err:
            last_err = err
            prompt = (
                _translation_prompt(pilot_text, instrument, primary_ability, ultimate_ability)
                + f"\n\nYour previous attempt failed to parse: {err}. Output ONLY the JSON object, "
                "no other text."
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
    if schema.validation_notes:
        lines += ["", "**Automatic priority fixes applied to this schema:**", ""]
        lines += [f"- {note}" for note in schema.validation_notes]
    return "\n".join(lines) + "\n"


def _describe_action(kind: str, ability: str | None, selector: str | None) -> str:
    if kind == "ability":
        base = f"use **{ability}**"
    elif kind == "recall":
        return "**recall** home"
    elif kind == "hold":
        return "**hold** (do nothing this tick)"
    else:
        base = f"**{kind}**"
    if selector and selector != "none":
        base += f" targeting: {TARGET_SELECTORS[selector]}"
    return base
