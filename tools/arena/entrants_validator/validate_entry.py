#!/usr/bin/env python3
"""Validate jam entries. Standard library only.

    python tools/validate_entry.py                     # every entrants/*/pilot.md (the CI check)
    python tools/validate_entry.py entrants/alice+bob  # one entry folder, or a pilot.md path

One entry per team: a lead and one or two learners, or a lead entering solo. Rules, per entry
folder `entrants/<lead-handle>[+<learner-handle>[+<learner-handle>]]/`:
  * `pilot.md` exists and is valid UTF-8 text that is not empty;
  * no code fences (``` or ~~~);
  * no URLs (http://, https://, www.);
  * the folder name is one, two, or three different plausible handles joined by `+`, lead first
    (each handle: letters, digits, dot, underscore, hyphen). `_template` is exempt. Roles cannot
    be checked from a folder name -- the PR template and the organizer's review do that.

Exit status 0 when every entry passes, 1 otherwise. One line per entry on stdout.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ENTRY_FILE = "pilot.md"
TEMPLATE = "_template"
TEAM_SEP = "+"
MAX_TEAM = 3  # one lead + up to two learners; a lead alone is a team of one

_FENCE_RE = re.compile(r"^\s*(```|~~~)", re.MULTILINE)
_URL_RE = re.compile(r"(https?://|www\.)", re.IGNORECASE)
_HANDLE_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]*$")


def validate_text(text: str) -> list[str]:
    """Rules that apply to the file content. Returns a list of problems (empty = valid)."""
    problems: list[str] = []
    if not text.strip():
        problems.append("file is empty")
        return problems
    if _FENCE_RE.search(text):
        problems.append("contains a code fence (``` or ~~~)")
    if "```" in text and not _FENCE_RE.search(text):
        problems.append("contains ``` (code fences are not allowed)")
    if _URL_RE.search(text):
        problems.append("contains a URL")
    return problems


def validate_team_name(name: str) -> list[str]:
    """Rules for the folder name: `<lead>`, `<lead>+<learner>`, or `<lead>+<learner>+<learner>`.
    Returns a list of problems."""
    if name == TEMPLATE:
        return []
    handles = name.split(TEAM_SEP)
    if not all(_HANDLE_RE.match(h) for h in handles):
        return [f"folder name {name!r} is not <lead-handle>[+<learner-handle>[+<learner-handle>]] "
                "(one to three handles joined by +, lead first; each handle: letters, digits, . _ -)"]
    if len(handles) > MAX_TEAM:
        return [f"folder name {name!r} names {len(handles)} handles; a team is at most "
                f"{MAX_TEAM} (one lead, up to two learners)"]
    if len({h.lower() for h in handles}) != len(handles):
        return [f"folder name {name!r} names the same handle twice; each teammate is listed once"]
    return []


def validate_entry(folder: Path) -> list[str]:
    """Rules for one `entrants/<team>/` folder. Returns a list of problems (empty = valid)."""
    problems: list[str] = validate_team_name(folder.name)
    entry = folder / ENTRY_FILE
    if not entry.is_file():
        problems.append(f"{ENTRY_FILE} is missing")
        return problems
    raw = entry.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        problems.append("not valid UTF-8")
        return problems
    problems.extend(validate_text(text))
    return problems


def discover(root: Path) -> list[Path]:
    entrants = root / "entrants"
    if not entrants.is_dir():
        return []
    return sorted(p for p in entrants.iterdir() if p.is_dir())


def resolve_targets(args: list[str], root: Path) -> list[Path]:
    if not args:
        return discover(root)
    targets = []
    for a in args:
        p = Path(a)
        targets.append(p.parent if p.name == ENTRY_FILE else p)
    return targets


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    root = Path(__file__).resolve().parent.parent
    folders = resolve_targets(argv, root)
    if not folders:
        print("no entries found under entrants/")
        return 1
    failed = 0
    for folder in folders:
        problems = validate_entry(folder)
        rel = (folder.relative_to(root) if folder.is_absolute() and root in folder.parents else folder).as_posix()
        if problems:
            failed += 1
            print(f"FAIL {rel}/{ENTRY_FILE}")
            for p in problems:
                print(f"     - {p}")
        else:
            print(f"OK   {rel}/{ENTRY_FILE}")
    print(f"{len(folders) - failed} of {len(folders)} entries valid")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
