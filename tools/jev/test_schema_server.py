"""Tests for tools/jev/schema_server.py -- a compiled schema decided against an Observation, over
real HTTP on 127.0.0.1, with a fake Jev client (no network, no spend)."""
from __future__ import annotations

import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from schema_server import BudgetExceeded, JevSchemaBackend, serve  # noqa: E402

SCHEMA = {
    "pilot_file": "entrants/alice/pilot.md",
    "instrument": "drums",
    "rules": [
        {"id": "low_hp", "condition": "is hp below a quarter?", "criteria_true": "hp < 25%", "criteria_false": "hp >= 25%",
         "action_kind": "recall", "action_ability": None, "action_target_selector": "none"},
        {"id": "enemy_near", "condition": "is an enemy near?", "criteria_true": "yes", "criteria_false": "no",
         "action_kind": "ability", "action_ability": "kick", "action_target_selector": "nearest_enemy"},
    ],
    "default_action": {"kind": "move", "ability": None, "target_selector": "push_lane"},
}

OBS = {
    "clockSec": 42.0,
    "self": {"id": "bb-1", "team": "violet", "lane": "top", "instrument": "drums", "pos": {"x": 300, "y": 300},
             "hp": 200, "maxHp": 220, "moveSpeed": 55, "cooldowns": {"kick": 0, "fill": 3.5}},
    "allies": [],
    "visibleEnemies": [{"id": "bb-4", "pos": {"x": 320, "y": 310}, "hp": 150, "maxHp": 150, "kind": "bearbot"},
                       {"id": "mn-9", "pos": {"x": 500, "y": 500}, "hp": 60, "maxHp": 60, "kind": "minion"}],
    "nearbyMinions": [],
    "nearbyTowers": [],
}


class FakeJev:
    model = "fake-jev"

    def __init__(self, yes: set[str], input_tokens: int = 1000):
        self.yes, self.input_tokens, self.calls = yes, input_tokens, 0

    def ask(self, state, questions):
        self.calls += 1
        self.last_state = state
        return {"answers": {q.id: {"noul": 0.9 if q.id in self.yes else 0.1} for q in questions},
                "usage": {"input_tokens": self.input_tokens}}


class DecideTests(unittest.TestCase):
    def test_first_yes_wins_and_target_is_resolved(self):
        out = JevSchemaBackend(FakeJev({"enemy_near"})).decide({"schema": SCHEMA, "observation": OBS})
        self.assertEqual(out["rule"], "enemy_near")
        self.assertEqual(out["action"], {"kind": "ability", "ability": "kick", "target": "bb-4"})
        self.assertEqual(set(out["answers"]), {"low_hp", "enemy_near"})

    def test_cascade_order_beats_later_yes(self):
        out = JevSchemaBackend(FakeJev({"low_hp", "enemy_near"})).decide({"schema": SCHEMA, "observation": OBS})
        self.assertEqual(out["action"], {"kind": "recall"})

    def test_default_when_nothing_fires_pushes_toward_enemy_base(self):
        out = JevSchemaBackend(FakeJev(set())).decide({"schema": SCHEMA, "observation": OBS})
        self.assertIsNone(out["rule"])
        self.assertEqual(out["action"]["kind"], "move")
        self.assertIsInstance(out["action"]["target"], dict)

    def test_budget(self):
        b = JevSchemaBackend(FakeJev(set(), input_tokens=1_000_000), budget_usd=0.05)
        b.decide({"schema": SCHEMA, "observation": OBS})  # $0.042
        b.decide({"schema": SCHEMA, "observation": OBS})  # $0.084 -- this call was allowed, the next is not
        with self.assertRaises(BudgetExceeded):
            b.decide({"schema": SCHEMA, "observation": OBS})

    def test_bad_body(self):
        with self.assertRaises(ValueError):
            JevSchemaBackend(FakeJev(set())).decide({"schema": SCHEMA})


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.jev = FakeJev({"enemy_near"})
        self.server = serve(JevSchemaBackend(self.jev), "fake-jev", port=0)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def _post(self, payload):
        req = urllib.request.Request(self.url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_post_and_health(self):
        status, out = self._post({"schema": SCHEMA, "observation": OBS})
        self.assertEqual(status, 200)
        self.assertEqual(out["action"]["target"], "bb-4")
        with urllib.request.urlopen(self.url + "health", timeout=5) as r:
            health = json.loads(r.read())
        self.assertEqual((health["backend"], health["requests"]), ("jev-schema", 1))
        self.assertEqual(self.server.server_address[0], "127.0.0.1")

    def test_errors_are_json(self):
        status, out = self._post({"observation": OBS})
        self.assertEqual(status, 400)
        self.assertIn("error", out)


if __name__ == "__main__":
    unittest.main()
