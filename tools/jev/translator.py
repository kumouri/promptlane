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
class TranslatedSchema:
    pilot_file: str
    instrument: str
    rules: list[TranslatedRule]
    default_kind: str
    default_ability: str | None
    default_target_selector: str | None
    raw_model_output: str
    validation_notes: tuple[str, ...] = ()


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

Read this prose pilot below and extract its strategy as an ORDERED list of rules, evaluated top to
bottom, FIRST MATCH WINS -- exactly like a priority list. Each rule has:
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

Also include one "default_action" (same "action" shape) for when none of the rules match -- the
prose's fallback behavior (usually push the lane or go home).

Use between 3 and 8 rules. Output ONLY this JSON object, nothing else, no markdown fences:

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


def parse_schema(raw_json: dict, pilot_file: str, instrument: str, raw_text: str) -> TranslatedSchema:
    rules_out = []
    for i, r in enumerate(raw_json.get("rules") or []):
        rid = r.get("id") or f"r{i+1}"
        cond = r.get("condition")
        if not cond or not isinstance(cond, str):
            raise ValueError(f"rule {rid}: missing/invalid condition")
        kind, ability, selector = _validate_action(r.get("action") or {}, f"rule {rid}")
        criteria = r.get("criteria") or {}
        rules_out.append(
            TranslatedRule(
                id=rid,
                condition=cond,
                criteria_true=criteria.get("true", "the condition holds"),
                criteria_false=criteria.get("false", "the condition does not hold"),
                action_kind=kind,
                action_ability=ability,
                action_target_selector=selector,
            )
        )
    if not rules_out:
        raise ValueError("translator produced zero rules")
    dkind, dability, dselector = _validate_action(raw_json.get("default_action") or {}, "default_action")
    return TranslatedSchema(
        pilot_file=pilot_file,
        instrument=instrument,
        rules=rules_out,
        default_kind=dkind,
        default_ability=dability,
        default_target_selector=dselector,
        raw_model_output=raw_text,
    )


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
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOPWORDS}


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

    Raises `SchemaValidationError` if an override paragraph doesn't match any rule well enough
    (the translator dropped the override rule entirely -- reordering can't fix a missing rule).
    Otherwise returns a schema with the matched rule(s) stably sorted to the front, and a plain-
    English note recorded in `validation_notes` (surfaced to the entrant via `render_markdown`) when
    that actually changed the order."""
    paragraphs = _find_absolute_paragraphs(pilot_text)
    if not paragraphs:
        return schema

    matched_indices: set[int] = set()
    for paragraph in paragraphs:
        idx = _match_rule_for_paragraph(paragraph, schema.rules)
        if idx is None:
            phrase = next(p for p in ABSOLUTE_OVERRIDE_PHRASES if p in paragraph.lower())
            raise SchemaValidationError(
                f"the prose uses override language ({phrase!r}) in a paragraph with no matching "
                f"translated rule -- the schema is missing this override entirely: {paragraph[:160]!r}"
            )
        matched_indices.add(idx)

    order = sorted(range(len(schema.rules)), key=lambda i: (i not in matched_indices, i))
    if order == list(range(len(schema.rules))):
        return schema

    moved_ids = [schema.rules[i].id for i in order if i in matched_indices]
    note = (
        "priority guard: promoted rule(s) "
        + ", ".join(moved_ids)
        + " to the top of the cascade -- the prose uses unconditional-override language for them "
        "(" + ", ".join(sorted({p for p in ABSOLUTE_OVERRIDE_PHRASES if any(p in para.lower() for para in paragraphs)})) + ") "
        "but the translator placed them lower, where an earlier rule could pre-empt them."
    )
    return TranslatedSchema(
        pilot_file=schema.pilot_file,
        instrument=schema.instrument,
        rules=[schema.rules[i] for i in order],
        default_kind=schema.default_kind,
        default_ability=schema.default_ability,
        default_target_selector=schema.default_target_selector,
        raw_model_output=schema.raw_model_output,
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


def render_markdown(schema: TranslatedSchema) -> str:
    """The entrant-readable rendering -- what an entrant actually reads back, per this module's
    design requirement. Plain prose table, no Jev wire format, no code."""
    lines = [
        f"# Decision schema translated from `{schema.pilot_file}` ({schema.instrument})",
        "",
        "Rules are checked in order; the first one whose condition is true fires. If none fire, "
        "the default action at the bottom runs.",
        "",
        "| # | Condition | Then |",
        "|---|---|---|",
    ]
    for i, r in enumerate(schema.rules, start=1):
        action_desc = _describe_action(r.action_kind, r.action_ability, r.action_target_selector)
        lines.append(f"| {i} | {r.condition} | {action_desc} |")
    default_desc = _describe_action(schema.default_kind, schema.default_ability, schema.default_target_selector)
    lines.append(f"| — | *(none of the above)* | {default_desc} |")
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
