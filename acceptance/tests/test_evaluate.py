import argparse
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import evaluate as ev


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        # Under the worktree; never launch a generator or touch the real app.
        self.tmp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1])
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.app = self.base / "app"
        self.app.mkdir()
        (self.app / "index.html").write_text("<canvas></canvas>", encoding="utf-8")
        self.hash, _ = ev.inventory(self.app)
        self.args = argparse.Namespace(candidate=str(self.app), output=str(self.base / "report"),
            evidence=None, execute=False, install="", typecheck="", build="", browser=False,
            serve="", timeout=5, browser_seconds=1)
        (self.base / "recording.txt").write_text("Independent observer's recorded events", encoding="utf-8")
        self.packet = {"schema": ev.VERSION, "candidate_sha256": self.hash,
                      "reviewer": "Independent reviewer", "captured_at": "2026-01-01T00:00:00Z",
                      "adapters": [], "observations": [{
                          "id": "baseline", "status": "pass", "method": "human-browser",
                          "steps": "Start default match; watch until end",
                          "actual": "Enemy nexus reaches zero and winner appears",
                          "references": [{"path": "recording.txt", "sha256": ev.digest(self.base / "recording.txt"),
                                          "description": "Events and timestamps"}]}]}

    def test_no_execution_never_passes_gameplay(self):
        report = ev.evaluate(self.args)
        self.assertEqual(report["overall"], "unverified")
        self.assertEqual(ev.inventory(self.app)[0], self.hash)
        ev.validate_report(ev.strict_json(self.base / "report/report.json"), self.base / "report")

    def test_output_inside_candidate_rejected(self):
        self.args.output = str(self.app / "report")
        with self.assertRaises(ValueError):
            ev.evaluate(self.args)
        self.assertFalse((self.app / "report").exists())

    def test_executed_build_staged_and_failure_reported(self):
        (self.app / "fake.py").write_text(
            "from pathlib import Path\nPath('generated.txt').write_text('staged')\nraise SystemExit(3)\n",
            encoding="utf-8")
        self.args.execute = True
        self.args.build = f'"{sys.executable}" fake.py'
        report = ev.evaluate(self.args)
        self.assertEqual(report["overall"], "fail")
        self.assertFalse((self.app / "generated.txt").exists())
        self.assertEqual(next(c for c in report["checks"] if c["id"] == "build")["status"], "fail")

    def test_successful_command_does_not_prove_gameplay(self):
        self.args.execute = True
        self.args.build = f'"{sys.executable}" --version'
        report = ev.evaluate(self.args)
        self.assertEqual(report["overall"], "unverified")

    def test_timeout_is_failure(self):
        (self.app / "sleep.py").write_text("import time\ntime.sleep(60)\n", encoding="utf-8")
        self.args.execute = True
        self.args.timeout = .1
        self.args.build = f'"{sys.executable}" sleep.py'
        report = ev.evaluate(self.args)
        self.assertEqual(report["overall"], "fail")

    def test_import_preserves_provenance(self):
        path = self.base / "packet.json"
        path.write_text(json.dumps(self.packet), encoding="utf-8")
        self.args.evidence = str(path)
        report = ev.evaluate(self.args)
        self.assertEqual(next(c for c in report["checks"] if c["id"] == "baseline")["status"], "pass")
        self.assertEqual(report["overall"], "unverified")
        ev.validate_report(report, self.base / "report")
        (self.base / "report/evidence/recording.txt").write_text("tampered", encoding="utf-8")
        with self.assertRaises(ValueError):
            ev.validate_report(report, self.base / "report")

    def test_reject_wrong_hash_duplicate_agent_and_source_claims(self):
        mutations = [
            lambda p: p.update(candidate_sha256="0" * 64),
            lambda p: p["observations"].append(copy.deepcopy(p["observations"][0])),
            lambda p: p["observations"][0].update(method="agent-claim"),
            lambda p: p["observations"][0].update(method="reviewer-source"),
            lambda p: p["observations"][0].update(references=[]),
            lambda p: p["observations"][0].update(status="not-applicable"),
            lambda p: p["observations"][0].update(method="readonly-adapter"),
            lambda p: p["observations"][0]["references"][0].update(path="../outside"),
            lambda p: p["observations"][0]["references"][0].update(sha256="0" * 64),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                packet = copy.deepcopy(self.packet)
                mutate(packet)
                with self.assertRaises(ValueError):
                    ev.validate_evidence(packet, self.hash, self.base)

    def test_duplicate_json_keys_rejected(self):
        path = self.base / "bad.json"
        path.write_text('{"schema":1,"schema":2}', encoding="utf-8")
        with self.assertRaises(ValueError):
            ev.strict_json(path)

    def test_report_schema_and_aggregate_rejected(self):
        report = ev.evaluate(self.args)
        for mutate in (
            lambda r: r.update(overall="pass"),
            lambda r: r["checks"].pop(),
            lambda r: r["checks"][0].update(status="not-applicable"),
            lambda r: r["checks"][0].update(status="pass"),
            lambda r: r["files"][0].update(size=-1),
            lambda r: r.update(candidate_sha256="0" * 64),
        ):
            candidate = copy.deepcopy(report)
            mutate(candidate)
            with self.assertRaises(ValueError):
                ev.validate_report(candidate)

    def test_exploratory_failure_does_not_override_gates(self):
        checks = [ev.result(k, "pass") for k in ev.GATES]
        checks.append(ev.result("recall-balance", "fail"))
        self.assertEqual(ev.aggregate(checks), "pass")

    def test_candidate_hash_changes_with_paths_and_contents(self):
        p = self.app / "index.html"
        p.rename(self.app / "other.html")
        self.assertNotEqual(ev.inventory(self.app)[0], self.hash)

    def test_browser_missing_dependency_is_unverified(self):
        with patch.dict(sys.modules, {"playwright": None, "playwright.sync_api": None}):
            check = ev.browser_check(self.app, self.base, "", 1)
        self.assertEqual(check["status"], "unverified")

    def test_gameplay_report_requires_bound_review_packet(self):
        report = ev.evaluate(self.args)
        check = report["checks"][0]
        check.update(status="pass", evidence=[{
            "path": "../recording.txt", "sha256": ev.digest(self.base / "recording.txt")}])
        with self.assertRaises(ValueError):
            ev.validate_report(report, self.base / "report")

    def test_cli_roundtrip(self):
        import subprocess
        evaluator = Path(ev.__file__)
        proc = subprocess.run([sys.executable, str(evaluator), str(self.app),
                               "--output", self.args.output], capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        summary = json.loads(proc.stdout)
        self.assertEqual(summary["overall"], "unverified")
        validation = subprocess.run([sys.executable, str(evaluator.with_name("validate.py")),
                                    summary["report"], "--candidate", str(self.app)],
                                   capture_output=True, text=True)
        self.assertEqual(validation.returncode, 0, validation.stderr)
        (self.app / "index.html").write_text("changed", encoding="utf-8")
        validation = subprocess.run([sys.executable, str(evaluator.with_name("validate.py")),
                                    summary["report"], "--candidate", str(self.app)],
                                   capture_output=True, text=True)
        self.assertEqual(validation.returncode, 2)


if __name__ == "__main__":
    unittest.main()
