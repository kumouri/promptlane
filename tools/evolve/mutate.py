#!/usr/bin/env python3
"""The single-change mutation operator of the prompt-evolution harness
(docs/prompt-evolution-spec.md §2.2): given a parent prose rulebook, a focus ("change one numeric
threshold", ...) and a diagnostic of how the parent played, ask a model for the parent with exactly
ONE change, and check that it is one change before handing it back.

    echo '{"parent": "...", "focus": "...", "diagnostics": "...", "avoid": []}' \\
        | python tools/evolve/mutate.py --backend claude

stdin:  {"parent", "focus", "diagnostics", "avoid": [changes already made to siblings]}
stdout: one JSON line -- {"ok": true, "prose", "change", "sentence_changes", "attempts", "usage"}
                      or {"ok": false, "error", "attempts", "usage"}

"One change" is checked, not trusted: the child's sentences are diffed against the parent's
(difflib), and more than --max-sentence-changes added+removed sentences is a rejected attempt,
retried with the reason. The model is any `tools/jev/llm_backends.py` backend -- the same
module, spend cap and key handling the translator uses; nothing here reads a key itself.
Standard library only.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "jev"))
from llm_backends import Backend, BackendError, BudgetExceeded, TokenBudget, make_backend  # noqa: E402

GAME = """\
The game: promptlane, a small three-lane MOBA. Each side is three bearbots that never respawn --
drums (top lane, tank: 300 hp, abilities "kick" = short-range taunt/knockback, "fill" = area slow),
keytar (mid, mage: 170 hp, "chord" = ranged burst, "glissando" = ultimate), violin (bottom, assassin:
140 hp, "staccato" = quick strike, "solo" = ultimate). Minion waves walk each lane; towers hit hard
(range 160) but shoot minions before bearbots; "recall" runs a bearbot home and heals it fully. A
match is won by killing the enemy nexus; at the 10-minute timeout, by towers then nexus hp; a full
draw is decided by fewer deaths, then more tower hp left.

How the prose is played: it is NOT read by a chat model during the match. A translator compiles it,
once, into an ordered list of if-then rules per instrument (one prose drives all three bearbots),
and every couple of seconds of game time a small model answers each rule's yes/no question about the bearbot's
current observation (its hp and cooldowns, visible enemies with kind and hp, nearby minions, the
clock). The first rule answered "yes" decides the action; if none does, a default action. So prose
that plays well is prose that compiles to clear conditions about observable facts, in a sensible
priority order, with a sensible default."""

TEMPLATE = """\
You are improving the rulebook of a game-playing bot by making exactly ONE change to it.

{game}

The current rulebook (the parent):
<<<PARENT
{parent}
PARENT>>>

How the parent did:
{diagnostics}

Your task: make exactly ONE change, of this kind: {focus}.
{avoid}Keep every other sentence exactly as it is, word for word. Do not add commentary, headings or
examples to the rulebook, no code fences and no URLs. Keep the rulebook's own voice.

Reply in exactly this format and nothing else:
CHANGE: <one sentence saying what you changed and why>
<<<PROSE
<the whole rulebook, with your one change>
PROSE>>>"""

REPLY_RE = re.compile(r"CHANGE:\s*(?P<change>.+?)\s*<<<PROSE\s*\n(?P<prose>.*?)\n?PROSE>>>", re.S)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n\s*\n")


def sentences(text: str) -> list[str]:
    """Same split as `generation.mjs::sentences`."""
    return [s.strip() for s in SENTENCE_SPLIT.split(text.replace("\r\n", "\n")) if s.strip()]


def sentence_changes(parent: str, child: str) -> int:
    """Sentences added plus sentences removed between parent and child (a reworded sentence is 2)."""
    a, b = sentences(parent), sentences(child)
    changes = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag != "equal":
            changes += (i2 - i1) + (j2 - j1)
    return changes


def build_prompt(parent: str, focus: str, diagnostics: str, avoid: list[str], retry_reason: str | None = None) -> str:
    avoid_text = ""
    if avoid:
        avoid_text = "Other children of this parent already made these changes; make a DIFFERENT one:\n" + "".join(f"  - {a}\n" for a in avoid)
    prompt = TEMPLATE.format(game=GAME, parent=parent.strip(), diagnostics=diagnostics.strip() or "(no games yet)", focus=focus, avoid=avoid_text)
    if retry_reason:
        prompt += f"\n\nYour previous answer was rejected: {retry_reason}. Try again, following the format exactly."
    return prompt


def parse_reply(text: str) -> tuple[str, str] | None:
    m = REPLY_RE.search(text or "")
    if not m:
        return None
    return m.group("change").strip(), m.group("prose").strip() + "\n"


def mutate(backend: Backend, parent: str, focus: str, diagnostics: str = "", avoid: list[str] | None = None,
           attempts: int = 3, max_sentence_changes: int = 3) -> dict:
    reason = None
    for attempt in range(1, attempts + 1):
        try:
            reply = backend.generate(build_prompt(parent, focus, diagnostics, avoid or [], reason))
        except BudgetExceeded as err:
            return {"ok": False, "error": f"token cap: {err}", "attempts": attempt}
        except BackendError as err:
            return {"ok": False, "error": f"backend: {err}", "attempts": attempt}
        parsed = parse_reply(reply)
        if parsed is None:
            reason = "the reply did not have the CHANGE line and the <<<PROSE ... PROSE>>> block"
            continue
        change, prose = parsed
        n = sentence_changes(parent, prose)
        if n == 0:
            reason = "the rulebook came back unchanged"
            continue
        if n > max_sentence_changes:
            reason = f"that changed {n} sentences; one change touches at most {max_sentence_changes} (a reworded sentence counts 2)"
            continue
        return {"ok": True, "prose": prose, "change": change, "sentence_changes": n, "attempts": attempt}
    return {"ok": False, "error": f"no valid single change after {attempts} attempt(s): {reason}", "attempts": attempts}


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--backend", choices=("claude", "ollama", "openrouter"), default="claude")
    p.add_argument("--model", default=None)
    p.add_argument("--attempts", type=int, default=3)
    p.add_argument("--max-sentence-changes", type=int, default=3)
    p.add_argument("--max-total-tokens", type=int, default=30000, help="spend cap for this call's attempts; 0 = uncapped")
    p.add_argument("--timeout", type=float, default=180.0)
    return p.parse_args(argv)


def main(argv=None, stdin=None, stdout=None) -> int:
    args = parse_args(argv)
    if stdin is None:
        stdin = sys.stdin
        if hasattr(stdin, "reconfigure"):
            stdin.reconfigure(encoding="utf-8")  # a Windows pipe defaults to cp1252; prose has em dashes
    stdout = stdout or sys.stdout
    req = json.loads(stdin.read())
    try:
        backend = make_backend(args.backend, args.model, TokenBudget(args.max_total_tokens or None), timeout=args.timeout)
    except (BackendError, ValueError) as err:
        stdout.write(json.dumps({"ok": False, "error": f"backend: {err}", "attempts": 0}) + "\n")
        return 2
    out = mutate(backend, req["parent"], req["focus"], req.get("diagnostics", ""), req.get("avoid") or [],
                 attempts=args.attempts, max_sentence_changes=args.max_sentence_changes)
    out["backend"] = backend.describe()
    out["usage"] = backend.usage.as_dict()
    stdout.write(json.dumps(out) + "\n")
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
