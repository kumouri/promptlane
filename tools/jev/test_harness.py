"""Tests for tools/jev/harness.py: loading real checked-in snapshots, the end-to-end dry run
(stub client, no network), and the comparison report. Pure functions over checked-in data, per
the brief -- these are the "does the pipeline actually run clean" and "does the comparison logic
do the right thing" tests, not a live-API test (there is no key on this host)."""
from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import client as C  # noqa: E402
import harness as H  # noqa: E402
import rules as R  # noqa: E402


class LoadSnapshotsTests(unittest.TestCase):
    """Locks in the real count against the checked-in logs -- if this number changes, the logs
    changed (or the filter did), and either is worth noticing, not silently absorbing."""

    @classmethod
    def setUpClass(cls):
        cls.run_paths = H.default_run_paths()
        cls.snapshots = H.load_house_violet_snapshots(cls.run_paths)

    def test_finds_the_four_checked_in_runs(self):
        names = {p.name for p in self.run_paths}
        self.assertEqual(
            names,
            {
                "house-prompt-2026-09-21-r1-house-vs-drums-seed7.json",
                "house-prompt-2026-09-21-r2-drums-vs-house-seed11.json",
                "house-prompt-2026-09-21-r3-house-vs-drums-seed11.json",
                "house-prompt-2026-09-21-r4-house-vs-house-seed7.json",
            },
        )

    def test_snapshot_count(self):
        # r1: 101 house-violet.md calls, r2: 0 (violet plays drums.md that run), r3: 101, r4: 61.
        self.assertEqual(len(self.snapshots), 263)

    def test_every_snapshot_is_house_violet_only(self):
        # r2's house side is green using house-green.md, deliberately excluded (the brief scopes
        # this test to house-violet.md specifically).
        for s in self.snapshots:
            self.assertIn(s.worksheet.team, ("violet", "green"))
        r2_snapshots = [s for s in self.snapshots if s.source_file.startswith("house-prompt-2026-09-21-r2")]
        self.assertEqual(r2_snapshots, [])

    def test_every_snapshot_has_a_classified_ground_truth_bucket(self):
        buckets = {"recall", "go_home", "ability", "attack_foe", "attack_tower", "ride_wave"}
        for s in self.snapshots:
            self.assertIn(s.ground_truth_bucket, buckets)

    def test_instrument_distribution_matches_the_worksheet(self):
        by_instrument = {}
        for s in self.snapshots:
            by_instrument[s.worksheet.instrument] = by_instrument.get(s.worksheet.instrument, 0) + 1
        self.assertEqual(by_instrument, {"keytar": 115, "violin": 45, "drums": 103})


class DryRunEndToEndTests(unittest.TestCase):
    """The full pipeline over real snapshots, stubbed network -- proves everything but the network
    call, per the brief."""

    def test_runs_clean_over_every_real_snapshot(self):
        snapshots = H.load_house_violet_snapshots(H.default_run_paths())
        client = C.StubSystemOneClient(error_rate=0.1, seed=20260922)
        predictions = [H.run_snapshot(client, s) for s in snapshots]
        self.assertEqual(len(predictions), len(snapshots))
        report = H.build_report(predictions)
        self.assertEqual(report["snapshot_count"], 263)
        self.assertIsNotNone(report["overall_agreement_rate"])
        self.assertGreaterEqual(report["overall_agreement_rate"], 0.0)
        self.assertLessEqual(report["overall_agreement_rate"], 1.0)
        self.assertEqual(len(report["per_rule"]), 6)
        self.assertGreater(report["total_input_tokens"], 0)
        self.assertGreater(report["estimated_cost_usd"], 0)
        self.assertGreaterEqual(report["latency"]["mean_sec"], 0.0)
        self.assertGreaterEqual(report["latency"]["p90_sec"], report["latency"]["p50_sec"])

    def test_runs_clean_with_json_state_encoding(self):
        """`encoding="json"` swaps `state` for a dict (`serializer.state_object`) -- the stub, the
        token estimate, and the report all have to tolerate that, not just prose strings."""
        snapshots = H.load_house_violet_snapshots(H.default_run_paths())[:10]
        client = C.StubSystemOneClient(error_rate=0.1, seed=20260922)
        predictions = [H.run_snapshot(client, s, encoding="json") for s in snapshots]
        report = H.build_report(predictions)
        self.assertEqual(report["snapshot_count"], 10)
        self.assertGreater(report["total_input_tokens"], 0)

    def test_zero_error_stub_answers_every_condition_correctly(self):
        """error_rate=0 means the stub's answer to each question always equals that question's
        *rule-derived* ground truth (`rules.py`'s predicates -- what the rules say should happen).
        Per-rule accuracy is therefore guaranteed to be 1.0. Overall bucket agreement is a
        different, and lower, number: it compares the resulting cascade against what
        `qwen3.5:9b` *actually did* in the logs, and the repo's own compliance measurement
        (`runs/house-prompt-2026-09-21.md`, "Compliance" section) already shows that model
        disobeying its own worksheet in a large minority of cases (e.g. the hp<75 -> recall rule
        fires only 46% of the time it should). So a hypothetically perfect rule-follower does NOT
        hit 100% agreement against that ground truth -- it disagrees exactly where the ruled model
        itself broke its own rules. That gap is real signal, not a harness bug; this test locks in
        that it is bounded and explicable, not a crash or an unbounded rate."""
        snapshots = H.load_house_violet_snapshots(H.default_run_paths())
        client = C.StubSystemOneClient(error_rate=0.0, seed=1)
        predictions = [H.run_snapshot(client, s) for s in snapshots]
        report = H.build_report(predictions)
        for row in report["per_rule"].values():
            self.assertEqual(row["accuracy"], 1.0)
            self.assertIsNone(row["avg_confidence_when_wrong"])
        self.assertGreater(report["overall_agreement_rate"], 0.0)
        self.assertLess(report["overall_agreement_rate"], 1.0)


class BuildReportTests(unittest.TestCase):
    """Small, hand-built cases -- independent of the real dataset -- so the aggregation math is
    checked in isolation."""

    def _prediction(self, predicted_bucket, actual_bucket, per_question):
        ws = R.Worksheet(hp=200, wave=1, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
        snap = H.Snapshot("fake.json", ws, "attack", "bb-1", actual_bucket)
        return H.Prediction(snap, predicted_bucket, per_question, input_tokens=100, latency_sec=0.1)

    def test_agreement_rate_and_disagreement_listing(self):
        agree_q = {"q1_low_hp_recall": {"rule_number": 1, "noul": 0.9, "answered": True, "correct": True, "confidence": 0.8}}
        disagree_q = {"q1_low_hp_recall": {"rule_number": 1, "noul": 0.95, "answered": True, "correct": False, "confidence": 0.9}}
        predictions = [
            self._prediction("recall", "recall", agree_q),
            self._prediction("attack_foe", "recall", disagree_q),
        ]
        report = H.build_report(predictions)
        self.assertEqual(report["snapshot_count"], 2)
        self.assertEqual(report["overall_agreement_rate"], 0.5)
        self.assertEqual(len(report["disagreements"]), 1)
        self.assertEqual(report["disagreements"][0]["predicted"], "attack_foe")
        self.assertEqual(report["disagreements"][0]["actual"], "recall")

    def test_avg_confidence_when_wrong_is_the_interesting_number(self):
        wrong_confident = {"q1_low_hp_recall": {"rule_number": 1, "noul": 0.99, "answered": True, "correct": False, "confidence": 0.98}}
        wrong_unsure = {"q1_low_hp_recall": {"rule_number": 1, "noul": 0.55, "answered": True, "correct": False, "confidence": 0.1}}
        predictions = [
            self._prediction("attack_foe", "recall", wrong_confident),
            self._prediction("attack_foe", "recall", wrong_unsure),
        ]
        report = H.build_report(predictions)
        row = report["per_rule"]["q1_low_hp_recall"]
        self.assertEqual(row["accuracy"], 0.0)
        self.assertAlmostEqual(row["avg_confidence_when_wrong"], (0.98 + 0.1) / 2)


class ParseArgsTests(unittest.TestCase):
    def test_defaults_to_workers_ai_backend_and_prose_encoding(self):
        args = H.parse_args([])
        self.assertFalse(args.live)
        self.assertEqual(args.backend, "workers-ai")
        self.assertEqual(args.state_encoding, "prose")
        self.assertIsNone(args.model)

    def test_accepts_typesafe_backend_and_json_encoding(self):
        args = H.parse_args(["--live", "--backend", "typesafe", "--state-encoding", "json"])
        self.assertEqual(args.backend, "typesafe")
        self.assertEqual(args.state_encoding, "json")


class LimitFlagTests(unittest.TestCase):
    def test_main_with_limit_only_runs_the_first_n_snapshots(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = H.main(["--limit", "1"])
        self.assertEqual(rc, 0)
        report = json.loads(buf.getvalue())
        self.assertEqual(report["snapshot_count"], 1)


if __name__ == "__main__":
    unittest.main()
