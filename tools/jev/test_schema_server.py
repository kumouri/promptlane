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
from unittest import mock  # noqa: E402

import client as C  # noqa: E402
import schema_server  # noqa: E402
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

    def test_targeting_absent_is_first_min_and_every_reply_names_its_rule(self):
        backend = JevSchemaBackend(FakeJev(set()))
        at_fountain = {**OBS, "self": {**OBS["self"], "pos": {"x": 100, "y": 900}}, "visibleEnemies": [],
                       "nearbyMinions": [{"id": "mn-1", "team": "violet", "pos": {"x": 100, "y": 857.5}, "hp": 60, "maxHp": 60}]}
        schema = {**SCHEMA, "default_action": {"kind": "move", "ability": None, "target_selector": "nearby_minion"}}
        old = backend.decide({"schema": schema, "observation": at_fountain})
        self.assertEqual(old["targeting"], "first-min", "a caller from before the field gets what it always got")
        self.assertEqual(old["action"]["target"], {"x": 100, "y": 857.5})
        new = backend.decide({"schema": schema, "observation": at_fountain, "targeting": "own-lane-1"})
        self.assertEqual(new["targeting"], "own-lane-1")
        self.assertAlmostEqual(new["action"]["target"]["y"], 772)
        with self.assertRaisesRegex(ValueError, "unknown targeting 'nearest-ish'"):
            backend.decide({"schema": schema, "observation": at_fountain, "targeting": "nearest-ish"})
        self.assertEqual(backend.snapshot()["targeting"], ["first-min", "own-lane-1"])

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

    def test_each_reply_carries_its_door_and_spend(self):
        """The arena sums these per match into its ledger (docs/arena-site-spec.md §9)."""
        out = JevSchemaBackend(FakeJev(set(), input_tokens=500)).decide({"schema": SCHEMA, "observation": OBS})
        self.assertEqual(out["door"], "unknown")  # a client that names no door
        self.assertEqual(out["tokens_in"], 500)
        self.assertAlmostEqual(out["cost_usd"], 500 / 1_000_000 * C.PRICE_IN_PER_M)
        stub = JevSchemaBackend(schema_server.DumbStubJevClient()).decide({"schema": SCHEMA, "observation": OBS})
        self.assertEqual(stub["door"], "stub")

    def test_the_stub_answers_the_same_whatever_order_the_asks_arrive_in(self):
        """`--stub` is threaded: six bots' asks land in any order. Each answer is keyed on the seed and
        the request, so a seeded stub match plays the same every time (`tools/match/test_vocab.mjs`)."""
        moved = {**OBS, "self": {**OBS["self"], "pos": {"x": 340, "y": 280}}}
        bodies = [{"schema": SCHEMA, "observation": OBS}, {"schema": SCHEMA, "observation": moved}]
        answers = lambda backend, order: {i: backend.decide(bodies[i])["answers"] for i in order}
        first = answers(JevSchemaBackend(schema_server.DumbStubJevClient()), [0, 1])
        self.assertEqual(first, answers(JevSchemaBackend(schema_server.DumbStubJevClient()), [1, 0]))
        self.assertEqual(first, answers(JevSchemaBackend(schema_server.DumbStubJevClient()), [1, 1, 0]), "asking twice changes nothing")
        self.assertNotEqual(first[0], first[1], "a different state draws different answers")
        self.assertNotEqual(first, answers(JevSchemaBackend(schema_server.DumbStubJevClient(seed=1)), [0, 1]), "the seed still matters")

    def test_the_door_is_the_one_that_answered_this_call(self):
        class Doors(FakeJev):
            backend = "typesafe"

            def __init__(self, doors):
                super().__init__(set())
                self.doors = list(doors)

            def ask_with_door(self, state, questions):
                return self.ask(state, questions), self.doors.pop(0)

        b = JevSchemaBackend(Doors(["typesafe", "workers-ai"]))
        doors = [b.decide({"schema": SCHEMA, "observation": OBS})["door"] for _ in range(2)]
        self.assertEqual(doors, ["typesafe", "workers-ai"])


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



class TokenTests(unittest.TestCase):
    """The live client gets a renewing token provider, not a string read once at startup."""

    def test_live_client_uses_the_renewing_provider(self):
        provider = object()
        with mock.patch.object(C, "resolve_workers_ai_token_provider", return_value=provider) as resolve, \
                mock.patch.object(C, "WorkersAIClient") as client:
            schema_server.make_client(schema_server.parse_args(["--jev-backend", "workers-ai", "--refresh-margin-sec", "600", "--timeout", "12"]))
        resolve.assert_called_once_with(margin_sec=600.0)
        client.assert_called_once_with(provider, timeout=12.0)

    def test_stub_needs_no_token(self):
        with mock.patch.object(C, "resolve_workers_ai_token_provider") as resolve:
            client = schema_server.make_client(schema_server.parse_args(["--stub"]))
        resolve.assert_not_called()
        self.assertIsInstance(client, schema_server.DumbStubJevClient)


class JevBackendTests(unittest.TestCase):
    """`--jev-backend`: typesafe is the default (ruling 2026-09-30 08:34 CT), with Workers AI behind
    it; `--no-jev-fallback` gives the bare TypeSafe client, which needs no token provider."""

    def test_default_is_typesafe(self):
        self.assertEqual(schema_server.parse_args([]).jev_backend, "typesafe")

    def test_typesafe_without_the_fallback_never_needs_a_token_provider(self):
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": "sk-test"}, clear=True), \
                mock.patch.object(C, "resolve_workers_ai_token_provider") as resolve:
            client = schema_server.make_client(schema_server.parse_args(["--no-jev-fallback", "--timeout", "9"]))
        resolve.assert_not_called()
        self.assertIsInstance(client, C.SystemOneClient)
        self.assertEqual((client.timeout, client.model), (9.0, C.DEFAULT_MODEL))

    def test_default_client_fails_over_to_workers_ai_and_health_counts_it(self):
        with mock.patch.dict(os.environ, {"PROMPTLANE_JEV_API_KEY": "sk-test"}, clear=True), \
                mock.patch.object(C, "resolve_workers_ai_token_provider", return_value=C.StaticToken("cf")) as resolve:
            client = schema_server.make_client(schema_server.parse_args(["--timeout", "9", "--jev-fallback-cooldown-sec", "5"]))
        resolve.assert_called_once()
        self.assertIsInstance(client, C.FallbackJevClient)
        self.assertEqual((client.deadline_sec, client.cooldown_sec), (9.0, 5.0))
        snap = JevSchemaBackend(client, None).snapshot()
        self.assertEqual((snap["jev_backend"], snap["jev_fallback"], snap["jev_fallback_failovers"]), ("typesafe", "workers-ai", 0))
        self.assertNotIn("sk-test", json.dumps(snap))

    def test_health_names_the_backend(self):
        client = C.SystemOneClient("sk-test")
        snap = JevSchemaBackend(client, None).snapshot()
        self.assertEqual((snap["jev_backend"], snap["token_source"]), ("typesafe", "typesafe-api-key"))
        self.assertNotIn("sk-test", json.dumps(snap))


class EconomyObservationTests(unittest.TestCase):
    def test_economy_facts_reach_jev_and_build_does_not_disturb_the_decision(self):
        obs = json.loads(json.dumps(OBS))
        obs["self"].update(gold=340, goldAtRisk=340, deathLoss=170, deathPayout=170, bounty=470, level=3, xp=230,
                           xpToNext=130, items=["amp"], slotsFree=2, nextItem={"item": "bass-strings", "cost": 350}, atShop=False)
        obs["respawning"] = [{"id": "bb-6", "team": "green", "inSec": 7}]
        jev = FakeJev({"enemy_near"})
        out = JevSchemaBackend(jev).decide({"schema": {**SCHEMA, "build": ["amp", "bass-strings"]}, "observation": obs})
        self.assertEqual(out["rule"], "enemy_near")
        self.assertIn("level 3", jev.last_state)
        self.assertIn("killing it is worth 470 gold", jev.last_state)
        self.assertIn("Enemy bb-6 respawns in 7 s.", jev.last_state)

    def test_an_observation_without_economy_fields_is_described_as_before(self):
        jev = FakeJev(set())
        JevSchemaBackend(jev).decide({"schema": SCHEMA, "observation": OBS})
        for word in ("gold", "level", "Items", "respawns", "shop"):
            self.assertNotIn(word, jev.last_state)



class LateGameObservationTests(unittest.TestCase):
    """docs/late-game-economy-spec.md §7.4: no decision change -- a schema compiled under eco-3-late
    (its "economy" key and a declared build) decides against an eco-3-late observation (tier/from
    fields, level 8, tier-3 items) exactly like any other, and Jev is shown the new sentences."""

    def test_decides_and_describes(self):
        schema = {**SCHEMA, "economy": "eco-3-late", "build": ["wall-of-sound", "arpeggiator"]}
        obs = json.loads(json.dumps(OBS))
        obs["self"].update(gold=500, level=8, xp=1010, xpToNext=None, items=["wall-of-sound", "click-track"], slotsFree=1,
                           nextItem={"item": "arpeggiator", "cost": 400, "tier": 3, "from": ["click-track"]}, atShop=False)
        obs["visibleEnemies"][0].update(level=8, bounty=410, items=["feedback", "headliner"])
        obs["shop"] = [{"item": "amp", "cost": 350, "tier": 1},
                       {"item": "tour-bus", "cost": 250, "tier": 2, "from": ["road-case", "metronome"]},
                       {"item": "headliner", "cost": 400, "tier": 3, "from": ["tour-bus"]}]
        jev = FakeJev({"enemy_near"})
        out = JevSchemaBackend(jev).decide({"schema": schema, "observation": obs})
        self.assertEqual(out["rule"], "enemy_near")
        self.assertEqual(out["action"], {"kind": "ability", "ability": "kick", "target": "bb-4"})
        self.assertIn("This bearbot is level 8 (the highest level).", jev.last_state)
        self.assertIn("Items: Wall of Sound (tier 3, upgraded from Backline), Click Track (tier 2, made from Metronome and Amp)", jev.last_state)
        self.assertIn("Next on its shopping list: Arpeggiator, an upgrade of its Click Track, 400 gold -- it can afford it now.", jev.last_state)
        self.assertIn("items: Feedback (tier 3), Headliner (tier 3)", jev.last_state)
        # the same schema without the late fields decides the same way: build is never read for decisions
        plain = JevSchemaBackend(FakeJev({"enemy_near"})).decide({"schema": SCHEMA, "observation": obs})
        self.assertEqual(plain["action"], out["action"])

if __name__ == "__main__":
    unittest.main()
