#!/usr/bin/env python3
"""Renders a `TranslatedSchema` (translator.py) as an entrant-facing transparency report:
per rule, where it came from in the prose (provenance), the literal question it will ask Jev, why
it fires in the position it does, and -- shown with equal weight, not an afterthought -- everything
the translator DROPPED: voice, open_strategy, and any prose that looks like a bounded rule but that
no translated rule can be traced back to.

WHY THIS EXISTS. `translator.render_markdown` (the shipped view, PR #25) already shows condition ->
action; what it does not show is *which words in the entrant's own file produced each row*, or what
never made it into any row at all. `docs/prose-to-schema-translator.md` §2 calls the readable schema
"the single mitigation that makes [translation error] survivable" but also says plainly that an
entrant reading it "reliably *would* [catch a bug] is untested". This module is the next step: make
the *source* of each rule inspectable, not just its content, so an entrant checking the schema
against their own intent doesn't have to take the translator's paraphrase on faith.

PROVENANCE METHOD: post-hoc, not model-reported. Rather than asking the translation model to also
name its own source sentence (which would just be one more thing the model could get wrong or
hallucinate, on top of the translation itself), provenance is computed independently by token-overlap
between each translated rule's fields and the prose's own hand-labeled `rule` segments
(`expressibility.py`, already verified byte-for-byte against the checked-in pilot files). This reuses
the exact matching primitive `translator.enforce_absolute_priority` already relies on
(`_match_rule_for_paragraph`) at finer (segment, not paragraph) granularity, so a segment with no
strong token overlap to any rule is reported as unclaimed rather than force-matched -- an honest "no
strong match" is more useful to an entrant than a wrong one.

SCOPE. `expressibility.FILES` only has hand-labeled segments for the three real reference pilots
(`drums.md`, `keytar.md`, `violin.md`) -- the same scope the fidelity memo works in, for the same
reason (no `entrants/` directory in this repo, see that module's docstring). `build_report` raises
`KeyError` for any other pilot file name unless the caller passes `segments` explicitly -- which is
what the entrant compile preview (`compile.py`) does with `segment.auto_segments`' word-list labels.
There is still no *silent* fallback: a report built on automatic labels says so at the top
(`labels="auto"`), so an entrant knows the rule/voice/advisory split came from a heuristic, not a
reader.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressibility import FILES as PILOT_SEGMENTS  # noqa: E402
from translator import TranslatedSchema, TranslatedRule, _rule_tokens, _tokenize  # noqa: E402

MIN_OVERLAP = 2  # same threshold translator.enforce_absolute_priority uses for paragraph matching
MIN_TOKEN_LEN = 3  # drops contraction remnants ("it's" -> "it", "s") that caused spurious ties --
# translator.py's own _tokenize keeps them because enforce_absolute_priority only ever matches a
# handful of override paragraphs against a whole rule list, where a stray 1-2 char tie is unlikely
# to matter; this module matches every rule-labeled sentence against every rule, where it did.


def _significant(tokens: set[str]) -> set[str]:
    return {t for t in tokens if len(t) >= MIN_TOKEN_LEN}

DROPPED_REASONS = {
    "open_strategy": (
        "decision-relevant prose that doesn't reduce to a condition on state or a bounded choice "
        "(patience/urgency framing, unthresholded resource judgment, continuous positioning with no "
        "discrete trigger) -- Jev's noul/choice/score questions have no free-text 'use your judgment' "
        "type, so this content structurally cannot become a rule."
    ),
    "voice": (
        "identity, tone, or in-character justification -- zero decision content. Removing it would "
        "not change what action the bot picks; it's the entrant's voice, not their strategy."
    ),
    "unclaimed_rule": (
        "this reads like a bounded rule (a threshold, a presence check, or a target selection) but no "
        "translated rule's wording overlaps with it enough to trace back to it -- either the "
        "translator merged it into another rule's condition without it showing here, or it was "
        "dropped outright. Worth checking by hand."
    ),
}


@dataclass(frozen=True)
class RuleProvenance:
    rule: TranslatedRule
    position: int  # 1-based, firing order
    jev_ask: str
    source_segments: tuple[str, ...]
    source_note: str
    order_why: str


@dataclass(frozen=True)
class DroppedSegment:
    label: str
    text: str
    reason: str


@dataclass(frozen=True)
class TransparencyReport:
    schema: TranslatedSchema
    rules: tuple[RuleProvenance, ...]
    dropped: tuple[DroppedSegment, ...]
    labels: str = "hand"  # "hand" (expressibility.FILES) or "auto" (segment.auto_segments)


def _describe_jev_ask(rule: TranslatedRule) -> str:
    return (
        f'Jev is asked one `noul` question, verbatim: "{rule.condition}" -- '
        f"yes means {rule.criteria_true}; no means {rule.criteria_false}."
    )


def _promoted_note_for(rule_id: str, validation_notes: tuple[str, ...]) -> str | None:
    for note in validation_notes:
        if "promoted rule(s) " not in note:
            continue
        promoted_ids = note.split("promoted rule(s) ", 1)[1].split(" to the top", 1)[0]
        if rule_id in {rid.strip() for rid in promoted_ids.split(",")}:
            return note
    return None


def _order_why(rule: TranslatedRule, position: int, total: int, validation_notes: tuple[str, ...]) -> str:
    promoted = _promoted_note_for(rule.id, validation_notes)
    if promoted:
        return (
            f"moved to position {position} of {total} by the automatic priority guard -- the prose "
            "uses unconditional-override language for this rule, so it is checked before every other "
            "rule regardless of where the translator originally placed it (see the note below)."
        )
    if position == 1:
        return f"checked first (position 1 of {total}) -- this is the order the translator produced."
    return (
        f"checked at position {position} of {total}, only if every rule above it (1..{position - 1}) "
        "is false -- this is the order the translator produced; nothing promoted or demoted it."
    )


def _best_match(tokens: set[str], rules: list[TranslatedRule]) -> int | None:
    tokens = _significant(tokens)
    best_idx, best_score = None, MIN_OVERLAP - 1
    for i, rule in enumerate(rules):
        score = len(tokens & _significant(_rule_tokens(rule)))
        if score > best_score:
            best_idx, best_score = i, score
    return best_idx


def build_report(schema: TranslatedSchema, pilot_file: str, segments=None, labels: str = "hand") -> TransparencyReport:
    """`pilot_file` must be one of `expressibility.FILES`'s keys (drums.md/keytar.md/violin.md)
    unless `segments` is given -- see module docstring for why there is no silent fallback for
    unlabeled prose. Pass `labels="auto"` with automatically labelled segments so the rendered view
    says so."""
    if segments is None:
        segments = PILOT_SEGMENTS[pilot_file]

    claims: dict[int, list[str]] = {i: [] for i in range(len(schema.rules))}
    dropped: list[DroppedSegment] = []
    for label, text in segments:
        if label == "boilerplate":
            continue
        if label != "rule":
            dropped.append(DroppedSegment(label=label, text=text, reason=DROPPED_REASONS[label]))
            continue
        idx = _best_match(_tokenize(text), schema.rules)
        if idx is None:
            dropped.append(DroppedSegment(label="unclaimed_rule", text=text, reason=DROPPED_REASONS["unclaimed_rule"]))
        else:
            claims[idx].append(text)

    rule_reports = []
    total = len(schema.rules)
    for i, rule in enumerate(schema.rules):
        sources = tuple(claims[i])
        note = (
            "no strong match found in the prose for this rule (fewer than 2 shared meaningful words "
            "with any `rule`-labeled sentence) -- the translator may have synthesized or reworded it "
            "more than this matching method can trace."
            if not sources
            else "matched by shared wording with the prose segment(s) below."
        )
        rule_reports.append(
            RuleProvenance(
                rule=rule,
                position=i + 1,
                jev_ask=_describe_jev_ask(rule),
                source_segments=sources,
                source_note=note,
                order_why=_order_why(rule, i + 1, total, schema.validation_notes),
            )
        )

    return TransparencyReport(schema=schema, rules=tuple(rule_reports), dropped=tuple(dropped), labels=labels)


def _describe_action(kind: str, ability: str | None, selector: str | None) -> str:
    from translator import TARGET_SELECTORS

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


def render_report_markdown(report: TransparencyReport) -> str:
    """The full entrant-facing transparency view: a quick-scan table (same shape as
    `translator.render_markdown`), then per-rule provenance/order/Jev-ask detail, then a Dropped
    section with equal visual weight -- exact quoted prose, not a summary, so an entrant can judge
    for themselves whether a drop is fine (voice) or a bug (unclaimed rule content)."""
    schema = report.schema
    lines = [
        f"# Transparency report: `{schema.pilot_file}` -> Jev decision schema ({schema.instrument})",
        "",
        "Rules are checked in order; the first one whose condition is true fires. Every rule below "
        "shows what it will literally ask Jev, which words in your prose it came from, and why it "
        "fires where it does. The **Dropped** section at the end lists everything from your prose "
        "that did *not* become a rule, and why.",
        "",
    ]
    if report.labels == "auto":
        lines += [
            "*Your prose was split into sentences and sorted into rule / advisory / voice "
            "automatically, by a word list -- not by a person. If a sentence below is filed under the "
            "wrong heading, trust your own reading; what matters is whether each instruction you meant "
            "shows up as a rule.*",
            "",
        ]
    lines += [
        "## Quick view",
        "",
        "| # | Condition | Then |",
        "|---|---|---|",
    ]
    for rp in report.rules:
        r = rp.rule
        action_desc = _describe_action(r.action_kind, r.action_ability, r.action_target_selector)
        lines.append(f"| {rp.position} | {r.condition} | {action_desc} |")
    default_desc = _describe_action(schema.default_kind, schema.default_ability, schema.default_target_selector)
    lines.append(f"| — | *(none of the above)* | {default_desc} |")

    lines += ["", "## Rule detail", ""]
    for rp in report.rules:
        r = rp.rule
        action_desc = _describe_action(r.action_kind, r.action_ability, r.action_target_selector)
        lines.append(f"### {rp.position}. `{r.id}` — {r.condition}")
        lines.append("")
        lines.append(f"- **Then:** {action_desc}")
        lines.append(f"- **What Jev is asked:** {rp.jev_ask}")
        lines.append(f"- **Order:** {rp.order_why}")
        if rp.source_segments:
            lines.append("- **From your prose:**")
            for seg in rp.source_segments:
                quoted = seg.strip().replace("\n", " ")
                lines.append(f"  > {quoted}")
        else:
            lines.append(f"- **From your prose:** ⚠ {rp.source_note}")
        lines.append("")

    if schema.validation_notes:
        lines += ["## Automatic priority fixes applied to this schema", ""]
        lines += [f"- {note}" for note in schema.validation_notes]
        lines.append("")

    lines += ["## Dropped — what did NOT become a rule", ""]
    if not report.dropped:
        lines.append("Nothing was dropped beyond voice/boilerplate scoring as zero segments this run.")
    else:
        by_label: dict[str, list[DroppedSegment]] = {}
        for d in report.dropped:
            by_label.setdefault(d.label, []).append(d)
        label_titles = {
            "unclaimed_rule": "Looked like a rule, but no translated rule traces back to it — check this by hand",
            "open_strategy": "Advisory prose Jev's question types structurally can't take",
            "voice": "Voice / tone — no decision content",
        }
        # unclaimed_rule first: it's the category most likely to be a real bug, not an expected loss.
        for label in ("unclaimed_rule", "open_strategy", "voice"):
            if label not in by_label:
                continue
            lines.append(f"### {label_titles[label]}")
            lines.append("")
            lines.append(by_label[label][0].reason)
            lines.append("")
            for d in by_label[label]:
                quoted = d.text.strip().replace("\n", " ")
                if quoted:
                    lines.append(f"> {quoted}")
            lines.append("")

    return "\n".join(lines) + "\n"
