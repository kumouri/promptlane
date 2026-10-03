#!/usr/bin/env python3
"""Tower aggro on the Python side (`src/towerAggro.ts`, `aggro-1`): vocab-2's tower facts read a
tower's lock, the description states the rule and who a locked tower is shooting, and an
observation without the fields reads exactly as before. `/health` names the rules it describes."""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from fidelity_harness import describe_observation  # noqa: E402
from scenarios import ABILITIES  # noqa: E402
from vocab import FACTS_AGGRO, TOWER_AGGRO_RULES, VOCAB_1, VOCAB_2, map_spec, tower_facts  # noqa: E402

RULE = {"name": "aggro-1", "windowSec": 3}
TOWER_POS = {"x": 600, "y": 400}


def P(x, y):
    return {"x": x, "y": y}


def obs(aggro=None, with_rule=True, minions=1, me="bb-2"):
    """A violet keytar 100 units from green's mid tower, `minions` violet minions under that tower, a
    green violin beside it; the tower's lock is `aggro` ({target, leftSec} or None)."""
    tower = {"id": "tw-9", "team": "green", "lane": "mid", "pos": TOWER_POS, "hp": 900, "maxHp": 900, "alive": True}
    if with_rule:
        tower["aggro"] = aggro
    o = {
        "clockSec": 121,
        "self": {"id": me, "team": "violet", "lane": "mid", "instrument": "keytar", "pos": P(540, 480), "hp": 140, "maxHp": 140,
                 "moveSpeed": 60, "cooldowns": {a: 0 for a in ABILITIES["keytar"]}},
        "allies": [{"id": "bb-1", "pos": P(560, 470), "hp": 220, "maxHp": 220}],
        "visibleEnemies": [{"id": "bb-6", "kind": "bearbot", "pos": P(560, 430), "hp": 150, "maxHp": 150}],
        "nearbyMinions": [{"id": f"mn-{i}", "team": "violet", "pos": P(570 + i, 450), "hp": 60, "maxHp": 60} for i in range(minions)],
        "nearbyTowers": [tower],
    }
    if with_rule:
        o["towerAggro"] = RULE
    return o


def enemy_tower_fact(o):
    return next(f for f in tower_facts(o, map_spec("pvp-1")) if not f.own)


class Facts(unittest.TestCase):
    def test_no_lock_is_the_specimen_rule(self):
        self.assertFalse(enemy_tower_fact(obs()).will_shoot_me)
        self.assertTrue(enemy_tower_fact(obs()).shooting_my_minions)
        self.assertTrue(enemy_tower_fact(obs(minions=0)).will_shoot_me)

    def test_a_lock_on_me_shoots_me_through_my_minions(self):
        f = enemy_tower_fact(obs({"target": "bb-2", "leftSec": 2.4}))
        self.assertTrue(f.aggro_on_me)
        self.assertTrue(f.will_shoot_me)
        self.assertFalse(f.shooting_my_minions)

    def test_a_lock_on_an_ally_shoots_neither_me_nor_my_minions(self):
        for minions in (0, 1):
            f = enemy_tower_fact(obs({"target": "bb-1", "leftSec": 1.0}, minions=minions))
            self.assertFalse(f.will_shoot_me)
            self.assertFalse(f.shooting_my_minions)


class Description(unittest.TestCase):
    def test_without_the_rule_the_description_is_unchanged(self):
        plain = obs(with_rule=False)
        for vocab in (VOCAB_1, VOCAB_2):
            self.assertNotIn("retarget", describe_observation(plain, vocab, "pvp-1"))
        # The rule on, no lock anywhere: only the rule line is added.
        on = describe_observation(obs(), VOCAB_2, "pvp-1")
        off = describe_observation(plain, VOCAB_2, "pvp-1")
        start = on.index("Towers retarget:")
        end = on.index("inside its range.", start) + len("inside its range.")
        self.assertEqual(on[:start] + on[end + 1:], off, "the rule's sentence is the only difference")
        self.assertIn("for 3 s after the hit", on[start:end])

    def test_vocab1_never_states_it(self):
        self.assertEqual(describe_observation(obs({"target": "bb-2", "leftSec": 2.4}), VOCAB_1),
                         describe_observation(obs(with_rule=False), VOCAB_1))

    def test_a_lock_on_me_is_stated_and_flips_the_summary_lines(self):
        text = describe_observation(obs({"target": "bb-2", "leftSec": 2.4}), VOCAB_2, "pvp-1")
        self.assertIn("it is shooting you, not your minions, because you hit its team's bearbot inside its range", text)
        self.assertIn("An enemy tower will shoot you (tw-9).", text)
        self.assertIn("You are inside an enemy tower's range while it has your own minions in its range, but it is shooting you, not your "
                      "minions (tw-9).", text)
        self.assertNotIn("You are not inside the range of an enemy tower", text)

    def test_a_lock_on_an_ally_is_stated(self):
        text = describe_observation(obs({"target": "bb-1", "leftSec": 1.0}), VOCAB_2, "pvp-1")
        self.assertIn("it is shooting your ally bb-1", text)
        self.assertIn("No enemy tower will shoot you.", text)
        self.assertIn("but it is shooting your ally bb-1, not your minions (tw-9).", text)

    def test_my_towers_lock_is_stated(self):
        o = obs()
        o["self"]["team"] = "green"  # now the tower is ours, locked on the violet bb-6 beside us
        o["visibleEnemies"][0]["kind"] = "bearbot"
        o["nearbyTowers"][0]["aggro"] = {"target": "bb-6", "leftSec": 2.0}
        text = describe_observation(o, VOCAB_2, "pvp-1")
        self.assertIn("it is shooting enemy bearbot bb-6, who hit your team's bearbot inside its range", text)

    def test_the_fact_lead_is_in_the_description(self):
        text = describe_observation(obs(), VOCAB_2, "pvp-1")
        for fact in FACTS_AGGRO:
            self.assertIn(fact.lead, text)

    def test_the_input_is_not_mutated(self):
        o = obs({"target": "bb-2", "leftSec": 2.4})
        before = copy.deepcopy(o)
        describe_observation(o, VOCAB_2, "pvp-1")
        self.assertEqual(o, before)


class Health(unittest.TestCase):
    def test_the_rules_mirror_the_typescript(self):
        self.assertEqual(TOWER_AGGRO_RULES, ("aggro-1",))


if __name__ == "__main__":
    unittest.main()
