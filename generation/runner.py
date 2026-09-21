#!/usr/bin/env python3
"""Operator-controlled, input-isolated generation runs (not an OS sandbox).

Only prepare reads repository history. The runner never launches or stops a model
client. References and answers are operator metadata: do not put secrets in them.
"""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time


SOURCE_COMMIT = "5dde8b507a5350c3745063db3f20b6a36b8503c7"
INPUTS = (
    ".gitignore", "LICENSE", "README.md",
    "assets/logo/brandify_logo.py",
    "assets/logo/jamobair-logo-nearblack.png",
    "assets/logo/jamobair-logo-transparent.png",
    "assets/logo/jamobair-logo.png",
    "docs/design.md", "prompts/initial_prompt.md", "prompts/pilots/README.md",
)
AGENTS = {
    "astra": ("gpt-6-astra", "high"),
    "sol": ("gpt-5.6-sol", "high"),
    "fable": ("claude-fable-5.1", "unknown"),
    "opus": ("claude-opus-5", "unknown"),
}
RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", "venv",
    ".venv", "secrets", ".secrets", ".ssh", ".aws", ".azure", ".config",
    "__pycache__", ".npmrc", ".pypirc", ".netrc", "id_rsa", "id_ed25519",
}


class RunError(Exception):
    pass


def timestamp(now):
    return datetime.fromtimestamp(now, timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def is_link(path):
    """Include Windows junctions and other reparse points, not just symlinks."""
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    )


def safe_path(root, *parts):
    """Check every existing component, without resolving away a symlink."""
    path = Path(os.path.abspath(root))
    for component in (path, *path.parents):
        if is_link(component):
            raise RunError(f"Symlink in root: {component}")
    for part in parts:
        if not part or Path(part).is_absolute() or any(
            p in ("", ".", "..") for p in part.replace("\\", "/").split("/")
        ):
            raise RunError(f"Unsafe path: {part!r}")
        path = path / part
        current = path
        while current != Path(os.path.abspath(root)):
            if is_link(current):
                raise RunError(f"Symlink is not allowed: {current}")
            current = current.parent
    return path


def atomic_json(path, value):
    if is_link(path):
        raise RunError(f"Symlink is not allowed: {path}")
    fd, temporary = tempfile.mkstemp(prefix=".state-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, sort_keys=True, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def read_regular(path):
    """Reject symlinks/special files and hard links; never follow a final link."""
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise RunError(f"Expected a regular, non-hardlinked file: {path}")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise RunError(f"File changed while opening: {path}")
        data = stream.read()
        after = os.fstat(stream.fileno())
        if (after.st_size, after.st_mtime_ns) != (opened.st_size, opened.st_mtime_ns):
            raise RunError(f"File changed while reading: {path}")
        return data


def excluded(name, at_root=True):
    lower = name.lower()
    return (
        (at_root and lower in EXCLUDED_DIRS)
        or lower in {".git", "node_modules", "__pycache__"}
        or lower == ".env" or (lower.startswith(".env.") and lower != ".env.example")
        or lower in {"credentials.json", "secrets.json", "secrets.txt"}
        or lower.endswith((".log", ".pem", ".key", ".p12", ".pfx"))
    )


def git_environment():
    # Prevent inherited repository selectors, object replacements and filters.
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith("GIT_")}
    environment.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                       GIT_EDITOR="true", GIT_TERMINAL_PROMPT="0",
                       GIT_NO_REPLACE_OBJECTS="1")
    return environment


class Runner:
    def __init__(self, root, now=time.time):
        self.root = safe_path(root)
        self.now = now

    def paths(self, run_id):
        if not RUN_ID.fullmatch(run_id) or run_id.upper() in {
            "CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
            *(f"LPT{i}" for i in range(1, 10)),
        }:
            raise RunError("Run ID must be 1–80 ASCII letters, digits, _ or -, starting alphanumeric")
        return (
            safe_path(self.root, "runs", run_id),
            safe_path(self.root, "artifacts", run_id),
        )

    @contextmanager
    def locked(self, metadata):
        lock = safe_path(metadata, ".lock")
        try:
            lock.mkdir()
        except FileExistsError:
            raise RunError("Run is locked; if an operator crashed, inspect it before removing .lock")
        try:
            yield
        finally:
            lock.rmdir()

    def clock(self):
        now = self.now()
        if not isinstance(now, (int, float)) or not math.isfinite(now):
            raise RunError("Invalid wall clock")
        return now

    def event(self, state, now, action, **details):
        state["events"].append({"at": timestamp(now), "epoch": now, "action": action, **details})

    def observe(self, state, now):
        if now < state["last_observed"]:
            raise RunError("Wall clock moved backward; no state changed. Restore the clock before continuing.")
        if state["status"] == "running":
            state["active_seconds"] += now - state["last_observed"]
        state["last_observed"] = now
        if state["active_seconds"] >= state["budget_seconds"] and not state["over_budget"]:
            state["over_budget"] = True
            self.event(state, now, "budget-exhausted",
                       note="Deadline detected; model/Desktop client was NOT stopped.")

    def git(self, *args):
        result = subprocess.run(
            ["git", "-C", str(self.root), *args], stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, check=False, env=git_environment(),
        )
        if result.returncode:
            raise RunError(f"Git failed: {result.stderr.decode(errors='replace').strip()}")
        return result.stdout

    def prepare(self, run_id, agent, provider, harness, budget=3600, init_git=False, effort=None):
        metadata, artifact = self.paths(run_id)
        if metadata.exists() or artifact.exists():
            raise RunError("Run already exists; refusing overwrite")
        if agent not in AGENTS:
            raise RunError("Unknown agent")
        if not provider.strip() or not harness.strip():
            raise RunError("Provider and harness must be explicit nonempty labels")
        if agent in ("astra", "sol") and provider != "ChatGPT subscription":
            raise RunError("Astra and Sol require provider 'ChatGPT subscription'")
        if agent in ("fable", "opus") and provider != "Claude subscription":
            raise RunError("Fable and Opus require provider 'Claude subscription'")
        if not math.isfinite(budget) or budget <= 0:
            raise RunError("Budget must be finite and positive")
        model, default_effort = AGENTS[agent]
        effort = effort or default_effort
        if agent in ("astra", "sol") and effort != "high":
            raise RunError("Astra and Sol require high effort")
        # Enumerate the entire pinned tree; never silently omit a new original input.
        tree = self.git("ls-tree", "-r", "--name-only", SOURCE_COMMIT).decode().splitlines()
        if set(tree) != set(INPUTS):
            raise RunError("Pinned source tree does not match the approved complete input list")
        files = {}
        for name in INPUTS:
            entry = self.git("ls-tree", SOURCE_COMMIT, "--", name).decode()
            if not entry.startswith(("100644 blob ", "100755 blob ")):
                raise RunError(f"Input is not a regular blob: {name}")
            files[name] = self.git("show", f"{SOURCE_COMMIT}:{name}")
        now = self.clock()
        metadata.mkdir(parents=True)
        artifact.mkdir(parents=True)
        workspace = safe_path(artifact, "workspace")
        workspace.mkdir()
        with self.locked(metadata):
            manifest = {}
            for name, data in files.items():
                target = safe_path(workspace, name)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                manifest[name] = {"sha256": digest(data), "bytes": len(data)}
            initial_commit = None
            if init_git:
                # Ignore inherited repository selectors and global hooks/filters.
                environment = git_environment()
                commands = [
                    ["git", "-c", "init.templateDir=", "init", str(workspace)],
                    ["git", "-C", str(workspace), "add", "--all"],
                    ["git", "-C", str(workspace), "-c", "user.name=Generation Inputs",
                     "-c", "user.email=inputs@localhost", "-c", "commit.gpgsign=false",
                     "-c", "core.editor=true", "commit", "-m", "Immutable v1 inputs"],
                    ["git", "-C", str(workspace), "rev-parse", "HEAD"],
                ]
                for command in commands:
                    result = subprocess.run(command, capture_output=True, check=False, env=environment)
                    if result.returncode:
                        raise RunError("Standalone Git initialization failed; run remains reserved")
                initial_commit = result.stdout.decode().strip()
            manifest_hash = digest(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode())
            atomic_json(metadata / "inputs.json", {
                "source_commit": SOURCE_COMMIT, "version": "v1",
                "files": manifest, "manifest_sha256": manifest_hash,
            })
            state = {
                "schema": 1, "run_id": run_id, "status": "prepared",
                "source_commit": SOURCE_COMMIT, "input_version": "v1",
                "input_manifest_sha256": manifest_hash,
                "agent": agent, "model": model, "provider": provider,
                "effort": effort, "harness": harness,
                "workspace": f"artifacts/{run_id}/workspace",
                "standalone_git": {"initialized": init_git, "initial_commit": initial_commit, "remotes": []},
                "budget_seconds": budget, "active_seconds": 0,
                "standard_comparison_budget": budget == 3600,
                "last_observed": now, "over_budget": False, "events": [],
            }
            self.event(state, now, "prepare")
            atomic_json(metadata / "state.json", state)
            return self.summary(state)

    def verify_inputs(self, metadata, artifact, state):
        """Check actual start inputs, not merely what prepare once exported."""
        manifest = json.loads(read_regular(safe_path(metadata, "inputs.json")))
        expected = manifest["files"]
        expected_hash = digest(json.dumps(expected, sort_keys=True, separators=(",", ":")).encode())
        if (set(expected) != set(INPUTS) or manifest["source_commit"] != SOURCE_COMMIT
                or expected_hash != state["input_manifest_sha256"]
                or expected_hash != manifest["manifest_sha256"]):
            raise RunError("Input manifest does not match the prepared run")
        workspace = safe_path(artifact, "workspace")
        actual = {}

        def inspect(directory, relative=""):
            for entry in sorted(directory.iterdir()):
                name = f"{relative}/{entry.name}" if relative else entry.name
                if name == ".git":
                    if not state["standalone_git"]["initialized"] or is_link(entry) or not entry.is_dir():
                        raise RunError("Unexpected or linked Git metadata in starting workspace")
                    continue
                safe_path(workspace, name)
                if entry.is_dir():
                    inspect(entry, name)
                else:
                    data = read_regular(entry)
                    actual[name] = {"sha256": digest(data), "bytes": len(data)}

        inspect(workspace)
        if actual != expected:
            raise RunError("Starting workspace differs from pinned inputs; prepare a fresh run")
        if state["standalone_git"]["initialized"]:
            for args, expected_result in (
                (("rev-parse", "HEAD"), state["standalone_git"]["initial_commit"]),
                (("rev-list", "--all", "--count"), "1"),
                (("remote",), ""),
            ):
                result = subprocess.run(
                    ["git", "-C", str(workspace), *args], capture_output=True,
                    check=False, env=git_environment(),
                )
                if result.returncode or result.stdout.decode().strip() != expected_result:
                    raise RunError("Starting Git repository differs from its input-only initialization")

    def snapshot(self, metadata, artifact):
        workspace = safe_path(artifact, "workspace")
        destination = safe_path(artifact, "submission")
        if destination.exists() or (metadata / "submission.json").exists():
            raise RunError("Submission already exists; refusing overwrite")
        if not workspace.is_dir():
            raise RunError("Workspace is missing")
        # Reserve the final name first: interrupted submissions cannot be overwritten.
        destination.mkdir()
        files, omissions = {}, []

        def copy_directory(source, target, relative=""):
            safe_path(workspace, relative) if relative else safe_path(workspace)
            for entry in sorted(source.iterdir()):
                name = f"{relative}/{entry.name}" if relative else entry.name
                if excluded(entry.name, at_root=not relative):
                    omissions.append({"path": name, "reason": "excluded-name"})
                    continue
                if is_link(entry):
                    omissions.append({"path": name, "reason": "symlink-not-followed"})
                    continue
                mode = entry.lstat().st_mode
                if stat.S_ISDIR(mode):
                    (target / entry.name).mkdir()
                    copy_directory(entry, target / entry.name, name)
                elif stat.S_ISREG(mode):
                    data = read_regular(safe_path(workspace, name))
                    (target / entry.name).write_bytes(data)
                    shutil.copymode(entry, target / entry.name)
                    files[name] = {"sha256": digest(data), "bytes": len(data)}
                else:
                    omissions.append({"path": name, "reason": "special-file-not-copied"})

        copy_directory(workspace, destination)
        inputs = json.loads(read_regular(safe_path(metadata, "inputs.json")))["files"]
        changes = {
            "added": sorted(set(files) - set(inputs)),
            "removed": sorted(set(inputs) - set(files)),
            "modified": sorted(name for name in set(files) & set(inputs)
                               if files[name] != inputs[name]),
            "unchanged": sorted(name for name in set(files) & set(inputs)
                                if files[name] == inputs[name]),
        }
        executable = {name: bool((destination / name).stat().st_mode & 0o111)
                      for name in files} if os.name == "posix" else None
        identity = {"files": files, "posix_executable": executable}
        return {**identity, "omissions": omissions, "changes": changes,
                "manifest_sha256": digest(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode())}

    def act(self, run_id, action, reason=None, reference=None, outcome=None):
        metadata, artifact = self.paths(run_id)
        if not metadata.is_dir():
            raise RunError("Unknown run")
        safe_path(artifact, "workspace")
        with self.locked(metadata):
            state_path = safe_path(metadata, "state.json")
            state = json.loads(read_regular(state_path))
            allowed = {
                "start": {"prepared"}, "pause": {"running"}, "resume": {"paused"},
                "submit": {"prepared", "running", "paused"}, "status": {"prepared", "running", "paused", "submitted"},
            }
            if action not in allowed or state["status"] not in allowed[action]:
                raise RunError(f"Invalid transition: {state['status']} -> {action}")
            if action in ("pause", "resume") and not (reference and reference.strip()):
                raise RunError("Pause/resume requires a transcript question, answer, or reference")
            if action == "pause" and reason not in ("human", "infrastructure"):
                raise RunError("Pause reason must be human or infrastructure")
            if action == "submit" and outcome not in ("completed", "failed", "timed-out"):
                raise RunError("Submission requires an explicit outcome")
            if action == "submit" and state["status"] == "prepared" and outcome != "failed":
                raise RunError("An unstarted run can only be submitted as failed")
            if action == "start":
                self.verify_inputs(metadata, artifact, state)
            now = self.clock()
            self.observe(state, now)
            if action == "submit" and outcome == "timed-out" and not state["over_budget"]:
                raise RunError("timed-out requires an exhausted active-time budget; use failed for an early stop")
            if action == "start":
                state["status"] = "running"
                tooling = (
                    "generation/runner.py", "generation/protocol.md",
                    "acceptance/evaluate.py", "acceptance/validate.py",
                    "acceptance/requirements.md", "acceptance/requirements-browser.txt",
                )
                state["workflow_at_start"] = {
                    name: digest(read_regular(safe_path(self.root, name)))
                    for name in tooling if safe_path(self.root, name).is_file()
                }
                self.event(state, now, action)
            elif action == "pause":
                state["status"] = "paused"
                self.event(state, now, action, reason=reason, reference=reference)
            elif action == "resume":
                state["status"] = "running"
                self.event(state, now, action, reference=reference)
            elif action == "submit":
                stopped_at = now
                manifest = self.snapshot(metadata, artifact)
                frozen_at = self.clock()
                if frozen_at < stopped_at:
                    raise RunError("Wall clock moved backward during snapshot")
                state["last_observed"] = frozen_at
                manifest.update({"at": timestamp(stopped_at), "frozen_at": timestamp(frozen_at),
                                 "snapshot_seconds": frozen_at - stopped_at, "outcome": outcome,
                                 "late": state["over_budget"], "active_seconds": state["active_seconds"]})
                atomic_json(safe_path(metadata, "submission.json"), manifest)
                state["status"] = "submitted"
                state["submission"] = {"path": f"artifacts/{run_id}/submission",
                                       "outcome": outcome, "late": state["over_budget"],
                                       "snapshot_seconds": manifest["snapshot_seconds"],
                                       "omissions": manifest["omissions"],
                                       "omission_review_required": any(
                                           item["path"] not in {".git", "node_modules", "dist", "__pycache__"}
                                           for item in manifest["omissions"]),
                                       "manifest_sha256": manifest["manifest_sha256"]}
                self.event(state, now, action, **state["submission"])
            atomic_json(state_path, state)
            return self.summary(state)

    @staticmethod
    def summary(state):
        result = dict(state)
        start = next((e["epoch"] for e in state["events"] if e["action"] == "start"), None)
        finish = next((e["epoch"] for e in state["events"] if e["action"] == "submit"),
                      state["last_observed"])
        result["wall_seconds"] = 0 if start is None else finish - start
        result["paused_seconds"] = max(0, result["wall_seconds"] - state["active_seconds"])
        result["remaining_seconds"] = max(0, state["budget_seconds"] - state["active_seconds"])
        result["notice"] = (
            "Budget exhausted. Model/Desktop client was NOT stopped."
            if state["over_budget"] else
            "Input isolation only, not an OS sandbox. Runner does not start or stop model clients."
        )
        return result


def watch(runner, run_id, interval):
    """Operator alert only: no attempt to control the coding client's process."""
    if not math.isfinite(interval) or interval <= 0:
        raise RunError("Watch interval must be finite and positive")
    while True:
        state = runner.act(run_id, "status")
        print(f"{run_id}: {state['status']}; active={state['active_seconds']:.1f}s; "
              f"paused={state['paused_seconds']:.1f}s; remaining={state['remaining_seconds']:.1f}s",
              flush=True)
        if state["status"] == "submitted":
            return 0
        if state["over_budget"]:
            print("\aDEADLINE: stop the model client, then submit. The client was NOT stopped.",
                  flush=True)
            return 3
        time.sleep(interval)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).absolute().parent.parent)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("run_id")
    prepare.add_argument("--agent", choices=AGENTS, required=True)
    prepare.add_argument("--provider", required=True)
    prepare.add_argument("--harness", required=True)
    prepare.add_argument("--effort", help="Claude effort label; Astra/Sol must be high")
    prepare.add_argument("--budget", type=float, default=3600)
    prepare.add_argument("--init-git", action="store_true")
    for name in ("start", "pause", "resume", "status", "submit", "watch"):
        command = commands.add_parser(name)
        command.add_argument("run_id")
        if name == "pause":
            command.add_argument("--reason", choices=("human", "infrastructure"), required=True)
        if name in ("pause", "resume"):
            command.add_argument("--reference", required=True)
        if name == "submit":
            command.add_argument("--outcome", choices=("completed", "failed", "timed-out"), required=True)
        if name == "watch":
            command.add_argument("--interval", type=float, default=1)
    args = vars(parser.parse_args(argv))
    root = args.pop("root")
    command = args.pop("command")
    try:
        runner = Runner(root)
        if command == "watch":
            return watch(runner, **args)
        result = runner.prepare(**args) if command == "prepare" else runner.act(action=command, **args)
    except KeyboardInterrupt:
        return 130
    except (RunError, OSError, ValueError, KeyError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
