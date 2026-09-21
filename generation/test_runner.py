"""Run with: python -m unittest discover -s generation -p 'test_runner.py' -v."""

from contextlib import redirect_stdout, redirect_stderr
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import runner


ROOT = Path(__file__).absolute().parent.parent


class RunnerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = runner.Runner(ROOT)
        cls.originals = {
            name: source.git("show", f"{runner.SOURCE_COMMIT}:{name}")
            for name in runner.INPUTS
        }

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix=".runner-test-", dir=ROOT)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.now = 1000.0
        self.runner = runner.Runner(self.root, now=lambda: self.now)
        self.runner.git = self.source_git

    def source_git(self, *args):
        if args[:2] == ("ls-tree", "-r"):
            return "\n".join(runner.INPUTS).encode()
        if args[0] == "ls-tree":
            return f"100644 blob {'a' * 40}\t{args[-1]}\n".encode()
        return self.originals[args[-1].split(":", 1)[1]]

    def prepare(self, run_id="test", **kwargs):
        options = dict(agent="astra", provider="ChatGPT subscription", harness="Desktop test")
        options.update(kwargs)
        return self.runner.prepare(run_id, **options)

    def act(self, action, **kwargs):
        return self.runner.act("test", action, **kwargs)

    @property
    def workspace(self):
        return self.root / "artifacts/test/workspace"

    def state_bytes(self):
        return (self.root / "runs/test/state.json").read_bytes()

    def submission(self):
        return json.loads((self.root / "runs/test/submission.json").read_text())

    def link(self, source, target, directory=False):
        try:
            target.symlink_to(source, target_is_directory=directory)
        except OSError as error:
            self.skipTest(f"Symlinks unavailable: {error}")

    def test_complete_pinned_inputs_and_hash_manifest(self):
        state = self.prepare()
        files = {p.relative_to(self.workspace).as_posix(): p.read_bytes()
                 for p in self.workspace.rglob("*") if p.is_file()}
        self.assertEqual(files, self.originals)
        self.assertFalse((self.workspace / ".git").exists())
        self.assertFalse((self.workspace / "generation").exists())
        manifest = json.loads((self.root / "runs/test/inputs.json").read_text())
        self.assertEqual(set(manifest["files"]), set(runner.INPUTS))
        for name, data in files.items():
            self.assertEqual(manifest["files"][name], {"sha256": runner.digest(data), "bytes": len(data)})
        self.assertEqual(state["source_commit"], runner.SOURCE_COMMIT)
        self.assertEqual(state["budget_seconds"], 3600)
        self.assertEqual(state["model"], "gpt-6-astra")
        self.assertEqual(state["effort"], "high")

    def test_standalone_git_has_one_input_commit_and_no_remotes(self):
        state = self.prepare(init_git=True)

        def git(*args):
            return subprocess.check_output(["git", "-C", str(self.workspace), *args]).decode().strip()

        self.assertEqual(git("rev-list", "--count", "HEAD"), "1")
        self.assertEqual(git("remote"), "")
        self.assertEqual(set(git("ls-tree", "-r", "--name-only", "HEAD").splitlines()), set(runner.INPUTS))
        self.assertEqual(git("rev-parse", "HEAD"), state["standalone_git"]["initial_commit"])
        self.assertEqual(git("status", "--porcelain"), "")
        self.assertNotEqual(git("rev-parse", "HEAD"), runner.SOURCE_COMMIT)

    def test_real_source_export_uses_pinned_history_not_working_tree(self):
        self.runner.git = runner.Runner(ROOT).git
        self.prepare(init_git=True)
        self.assertEqual((self.workspace / "prompts/initial_prompt.md").read_bytes(),
                         self.originals["prompts/initial_prompt.md"])
        self.assertEqual({p.relative_to(self.workspace).as_posix()
                          for p in self.workspace.rglob("*")
                          if p.is_file() and ".git" not in p.relative_to(self.workspace).parts},
                         set(runner.INPUTS))

    def test_refuses_existing_run_and_orphan_artifact(self):
        self.prepare()
        with self.assertRaises(runner.RunError):
            self.prepare()
        (self.root / "artifacts/orphan").mkdir()
        with self.assertRaises(runner.RunError):
            self.prepare("orphan")

    def test_run_ids_cannot_escape_or_use_windows_devices(self):
        for name in ("", "..", "../escape", "/absolute", "a/b", "a\\b", "CON", "nul", "LPT1", "a." ):
            with self.subTest(name=name), self.assertRaises(runner.RunError):
                self.prepare(name)
        self.assertFalse((self.root / "runs").exists())

    def test_rejects_symlinked_artifact_parent(self):
        elsewhere = self.root / "elsewhere"
        elsewhere.mkdir()
        self.link(elsewhere, self.root / "artifacts", True)
        with self.assertRaises(runner.RunError):
            self.prepare()
        self.assertEqual(list(elsewhere.iterdir()), [])

    def test_rejects_symlinked_root(self):
        target = self.root / "target"
        target.mkdir()
        self.link(target, self.root / "alias", True)
        with self.assertRaises(runner.RunError):
            runner.Runner(self.root / "alias")

    def test_exact_approved_presets(self):
        for agent in ("astra", "sol"):
            with self.subTest(agent=agent), self.assertRaises(runner.RunError):
                self.prepare(agent=agent, provider="API")
            with self.subTest(agent=agent), self.assertRaises(runner.RunError):
                self.prepare(agent=agent, effort="low")
        for agent, model in (("fable", "claude-fable-5.1"), ("opus", "claude-opus-5")):
            state = self.prepare(agent, agent=agent, provider="Claude subscription")
            self.assertEqual(state["model"], model)
            self.assertEqual(state["effort"], "unknown")
        state = self.prepare("sol", agent="sol")
        self.assertEqual(state["model"], "gpt-5.6-sol")
        state = self.prepare("custom", agent="opus", provider="Claude subscription", effort="max")
        self.assertEqual(state["effort"], "max")
        with self.assertRaises(runner.RunError):
            self.prepare("api", agent="opus", provider="API")
        state = self.prepare("short-test", budget=10)
        self.assertFalse(state["standard_comparison_budget"])

    def test_bad_metadata_and_budget(self):
        for kwargs in ({"provider": ""}, {"harness": " "}, {"budget": 0},
                       {"budget": -1}, {"budget": float("nan")}, {"budget": float("inf")}):
            with self.subTest(kwargs=kwargs), self.assertRaises(runner.RunError):
                self.prepare(**kwargs)

    def test_wrong_source_tree_rejected_before_creation(self):
        self.runner.git = lambda *args: b"README.md\n"
        with self.assertRaises(runner.RunError):
            self.prepare()
        self.assertFalse((self.root / "runs").exists())

    def test_pause_resume_excludes_only_explicit_pause_time(self):
        self.prepare()
        self.now += 100
        self.assertEqual(self.act("start")["active_seconds"], 0)
        self.now += 10
        self.assertEqual(self.act("pause", reason="human", reference="Question transcript #4")["active_seconds"], 10)
        self.now += 400
        self.assertEqual(self.act("status")["active_seconds"], 10)
        self.act("resume", reference="Answer transcript #5")
        self.now += 15
        state = self.act("pause", reason="infrastructure", reference="Network unavailable #6")
        self.assertEqual(state["active_seconds"], 25)
        self.now += 200
        self.act("resume", reference="Network restored #7")
        self.now += 5
        state = self.act("status")
        self.assertEqual(state["active_seconds"], 30)
        self.assertEqual([e.get("reason") for e in state["events"] if e["action"] == "pause"],
                         ["human", "infrastructure"])

    def test_start_verifies_actual_input_bytes_and_extra_files(self):
        self.prepare()
        before = self.state_bytes()
        (self.workspace / "README.md").write_text("Injected context")
        with self.assertRaisesRegex(runner.RunError, "differs"):
            self.act("start")
        self.assertEqual(self.state_bytes(), before)
        (self.workspace / "README.md").write_bytes(self.originals["README.md"])
        (self.workspace / ".env").write_text("undeclared input")
        with self.assertRaisesRegex(runner.RunError, "differs"):
            self.act("start")
        (self.workspace / ".env").unlink()
        self.assertEqual(self.act("start")["status"], "running")

    def test_start_rejects_added_git_remote(self):
        self.prepare(init_git=True)
        subprocess.run(["git", "-C", str(self.workspace), "remote", "add", "history",
                        str(ROOT)], check=True)
        with self.assertRaisesRegex(runner.RunError, "input-only"):
            self.act("start")

    def test_unstarted_run_cannot_claim_completed_or_timed_out(self):
        self.prepare()
        for outcome in ("completed", "timed-out"):
            with self.assertRaisesRegex(runner.RunError, "unstarted"):
                self.act("submit", outcome=outcome)

    def test_wall_and_paused_time_freeze_at_submission(self):
        self.prepare()
        self.act("start")
        self.now += 12
        self.act("pause", reason="human", reference="question")
        self.now += 23
        self.act("resume", reference="answer")
        self.now += 7
        state = self.act("submit", outcome="completed")
        self.assertEqual(state["wall_seconds"], 42)
        self.assertEqual(state["active_seconds"], 19)
        self.assertEqual(state["paused_seconds"], 23)
        self.now += 100
        self.assertEqual(self.act("status")["wall_seconds"], 42)

    def test_watch_alerts_without_stopping_client(self):
        self.prepare(budget=10)
        self.act("start")
        self.now += 10
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(runner.watch(self.runner, "test", 1), 3)
        self.assertIn("NOT stopped", output.getvalue())
        self.assertEqual(self.act("status")["status"], "running")
        with self.assertRaises(runner.RunError):
            runner.watch(self.runner, "test", 0)

    def test_invalid_transitions_and_missing_references_leave_state_unchanged(self):
        self.prepare()
        for action, kwargs in (("pause", {"reason": "human", "reference": "q"}),
                               ("resume", {"reference": "a"}), ("submit", {})):
            before = self.state_bytes()
            with self.assertRaises(runner.RunError):
                self.act(action, **kwargs)
            self.assertEqual(self.state_bytes(), before)
        self.act("start")
        for action, kwargs in (("start", {}), ("pause", {"reason": "human"}),
                               ("pause", {"reason": "other", "reference": "q"})):
            before = self.state_bytes()
            with self.assertRaises(runner.RunError):
                self.act(action, **kwargs)
            self.assertEqual(self.state_bytes(), before)

    def test_budget_detected_once_never_stops_client(self):
        self.prepare(budget=10)
        self.act("start")
        self.now += 10
        state = self.act("status")
        self.assertTrue(state["over_budget"])
        self.assertEqual(state["remaining_seconds"], 0)
        self.assertIn("NOT stopped", state["notice"])
        self.assertEqual(state["status"], "running")
        self.now += 20
        state = self.act("status")
        self.assertEqual(len([e for e in state["events"] if e["action"] == "budget-exhausted"]), 1)
        state = self.act("submit", outcome="timed-out")
        self.assertTrue(state["submission"]["late"])
        self.assertEqual(self.submission()["active_seconds"], 30)

    def test_backwards_clock_rejected_without_state_mutation(self):
        self.prepare()
        self.act("start")
        before = self.state_bytes()
        self.now -= 1
        with self.assertRaisesRegex(runner.RunError, "backward"):
            self.act("status")
        self.assertEqual(self.state_bytes(), before)

    def test_new_runner_process_counts_elapsed_time(self):
        self.prepare()
        self.act("start")
        self.now += 125
        second = runner.Runner(self.root, now=lambda: self.now)
        self.assertEqual(second.act("test", "status")["active_seconds"], 125)

    def test_submission_freezes_copy_hashes_changes_and_preserves_workspace(self):
        self.prepare()
        (self.workspace / "README.md").write_text("Changed")
        (self.workspace / "LICENSE").unlink()
        (self.workspace / "unfinished.txt").write_text("Incomplete output")
        state = self.act("submit", outcome="failed")
        self.assertFalse(state["submission"]["late"])
        manifest = self.submission()
        self.assertEqual(manifest["changes"]["added"], ["unfinished.txt"])
        self.assertEqual(manifest["changes"]["modified"], ["README.md"])
        self.assertEqual(manifest["changes"]["removed"], ["LICENSE"])
        frozen = self.root / "artifacts/test/submission/unfinished.txt"
        self.assertEqual(frozen.read_text(), "Incomplete output")
        self.assertEqual(manifest["files"]["unfinished.txt"]["sha256"], runner.digest(frozen.read_bytes()))
        (self.workspace / "unfinished.txt").write_text("Later edits")
        self.assertEqual(frozen.read_text(), "Incomplete output")
        with self.assertRaises(runner.RunError):
            self.act("submit", outcome="completed")
        with self.assertRaises(runner.RunError):
            self.act("start")

    def test_submission_excludes_private_files_but_keeps_templates_and_archives(self):
        self.prepare()
        for name in ("node_modules", "dist", "logs", "env", ".git", "secrets"):
            (self.workspace / name).mkdir()
            (self.workspace / name / "hidden.txt").write_text("not copied")
        for name in (".env", ".env.example", "credentials.json", "secrets.txt",
                     "private.key", "test.log", "bundle.zip", "bundle.tar.gz"):
            (self.workspace / name).write_text("not copied")
        self.act("submit", outcome="failed")
        manifest = self.submission()
        self.assertEqual(set(manifest["files"]),
                         set(runner.INPUTS) | {".env.example", "bundle.zip", "bundle.tar.gz",
                                              "logs/hidden.txt", "env/hidden.txt"})
        self.assertEqual(len(manifest["omissions"]), 9)

    def test_source_directories_are_not_mistaken_for_tool_output(self):
        self.prepare()
        for name in ("src/env", "src/log", "src/logs", "src/dist", "src/secrets"):
            directory = self.workspace / name
            directory.mkdir(parents=True)
            (directory / "index.ts").write_text("export const placeholder = true;")
        self.act("submit", outcome="failed")
        for name in ("env", "log", "logs", "dist", "secrets"):
            self.assertIn(f"src/{name}/index.ts", self.submission()["files"])

    @unittest.skipUnless(os.name == "posix", "POSIX executable metadata")
    def test_submission_preserves_and_hashes_executable_bits(self):
        self.prepare()
        script = self.workspace / "run.sh"
        script.write_text("#!/bin/sh\nexit 0\n")
        script.chmod(0o755)
        self.act("submit", outcome="failed")
        frozen = self.root / "artifacts/test/submission/run.sh"
        self.assertTrue(frozen.stat().st_mode & 0o111)
        self.assertTrue(self.submission()["posix_executable"]["run.sh"])

    def test_freezing_time_does_not_consume_generation_budget(self):
        self.prepare(budget=10)
        self.act("start")
        self.now += 9
        original = self.runner.snapshot

        def delayed(*args):
            self.now += 5
            return original(*args)

        with patch.object(self.runner, "snapshot", side_effect=delayed):
            state = self.act("submit", outcome="completed")
        self.assertFalse(state["submission"]["late"])
        self.assertEqual(state["active_seconds"], 9)
        self.assertEqual(state["wall_seconds"], 9)
        self.assertEqual(state["submission"]["snapshot_seconds"], 5)

    def test_early_stop_cannot_be_labeled_deadline_timeout(self):
        self.prepare()
        self.act("start")
        with self.assertRaisesRegex(runner.RunError, "exhausted"):
            self.act("submit", outcome="timed-out")

    def test_submission_skips_symlinks_without_following_them(self):
        self.prepare()
        target = self.root / "operator-secret"
        target.write_text("do not copy")
        self.link(target, self.workspace / "alias")
        self.link(self.workspace, self.workspace / "cycle", True)
        self.act("submit", outcome="failed")
        manifest = self.submission()
        self.assertEqual({x["path"] for x in manifest["omissions"]}, {"alias", "cycle"})
        self.assertEqual(set(manifest["files"]), set(runner.INPUTS))

    def test_submission_rejects_hardlinks_and_reserves_failed_snapshot(self):
        self.prepare()
        target = self.root / "operator-file"
        target.write_text("do not copy")
        try:
            os.link(target, self.workspace / "alias")
        except OSError as error:
            self.skipTest(f"Hardlinks unavailable: {error}")
        with self.assertRaisesRegex(runner.RunError, "hardlinked"):
            self.act("submit", outcome="failed")
        with self.assertRaisesRegex(runner.RunError, "already exists"):
            self.act("submit", outcome="failed")
        self.assertEqual(json.loads(self.state_bytes())["status"], "prepared")

    def test_submission_rejects_replaced_workspace_root(self):
        self.prepare()
        moved = self.root / "moved"
        self.workspace.rename(moved)
        self.link(moved, self.workspace, True)
        with self.assertRaises(runner.RunError):
            self.act("submit", outcome="failed")

    def test_lock_prevents_concurrent_writes(self):
        self.prepare()
        (self.root / "runs/test/.lock").mkdir()
        with self.assertRaisesRegex(runner.RunError, "locked"):
            self.act("start")

    def test_unknown_run(self):
        with self.assertRaisesRegex(runner.RunError, "Unknown run"):
            self.act("status")

    def test_invalid_clock(self):
        self.now = float("nan")
        with self.assertRaisesRegex(runner.RunError, "Invalid wall clock"):
            self.prepare()

    def test_empty_unfinished_workspace_is_valid_failed_submission(self):
        self.prepare()
        for path in self.workspace.rglob("*"):
            if path.is_file():
                path.unlink()
        self.act("submit", outcome="failed")
        self.assertEqual(self.submission()["files"], {})
        self.assertEqual(set(self.submission()["changes"]["removed"]), set(runner.INPUTS))

    def test_paused_submission_and_later_status_do_not_add_active_time(self):
        self.prepare()
        self.act("start")
        self.now += 20
        self.act("pause", reason="infrastructure", reference="Service outage")
        self.now += 1000
        self.assertEqual(self.act("submit", outcome="failed")["active_seconds"], 20)
        self.now += 1000
        self.assertEqual(self.act("status")["active_seconds"], 20)

    def test_symlinked_metadata_is_not_read(self):
        self.prepare()
        state = self.root / "runs/test/state.json"
        other = self.root / "other.json"
        state.rename(other)
        self.link(other, state)
        with self.assertRaises(runner.RunError):
            self.act("status")

    def test_atomic_failure_preserves_old_json(self):
        path = self.root / "state.json"
        runner.atomic_json(path, {"old": True})
        with patch.object(runner.os, "replace", side_effect=OSError("simulated failure")):
            with self.assertRaises(OSError):
                runner.atomic_json(path, {"new": True})
        self.assertEqual(json.loads(path.read_text()), {"old": True})
        self.assertEqual(list(self.root.iterdir()), [path])

    def test_cli_prepare_start_pause_resume_status_submit(self):
        with patch.object(runner.Runner, "git", side_effect=self.source_git):
            commands = [
                ["prepare", "test", "--agent", "sol", "--provider", "ChatGPT subscription",
                 "--harness", "Desktop test"],
                ["start", "test"],
                ["pause", "test", "--reason", "human", "--reference", "transcript question #1"],
                ["resume", "test", "--reference", "transcript answer #2"],
                ["status", "test"],
                ["submit", "test", "--outcome", "failed"],
            ]
            for command in commands:
                with self.subTest(command=command), redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(runner.main(["--root", str(self.root), *command]), 0)
                    self.assertEqual(json.loads(output.getvalue())["run_id"], "test")
        with redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(runner.main(["--root", str(self.root), "start", "test"]), 2)
        self.assertIn("Invalid transition", errors.getvalue())


if __name__ == "__main__":
    unittest.main()
