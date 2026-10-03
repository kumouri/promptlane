"""The vocab-2 AND node (`translator` AND NODE, `docs/vocabulary-spec.md` §8.13): a rule whose prose states several
conditions asks one `noul` per condition and fires only when every one passes the single-question threshold. No model
call and no Jev call: replies and answers are written here."""
from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import translator as T  # noqa: E402
from compile import schema_from_dict, schema_to_dict  # noqa: E402
from fidelity_harness import run_prediction  # noqa: E402
from transparency import build_report, render_report_markdown  # noqa: E402

HOME = {"kind": "move", "ability": None, "target_selector": "home"}
PUSH = {"kind": "move", "ability": None, "target_selector": "push_lane"}
AFFORD = "When I can afford my next item and no enemy is in sight, I head home to shop."
AFFORD_AND = {"id": "shop", "all": [
    {"condition": "can this bot afford its next item?", "criteria": {"true": "it can afford it", "false": "it cannot"}},
    {"condition": "is no enemy in sight of this bot?", "criteria": {"true": "no enemy in sight", "false": "an enemy is in sight"}}],
    "action": HOME}


def _schema(*rules, vocab="vocab-2", instrument="drums") -> T.TranslatedSchema:
    return T.parse_schema({"rules": list(rules), "default_action": PUSH}, "p.md", instrument, "raw", vocab)


def _rule(rid, cond, true="yes", false="no", action=HOME) -> dict:
    return {"id": rid, "condition": cond, "criteria": {"true": true, "false": false}, "action": action}


def _and(rid, *conds, action=HOME) -> dict:
    return {"id": rid, "all": [{"condition": c, "criteria": {"true": "yes", "false": "no"}} for c in conds], "action": action}


class FakeJev:
    """Answers each question id from a table; records what was asked."""

    backend = "fake"

    def __init__(self, nouls: dict):
        self.nouls, self.asked = nouls, []

    def ask(self, state, questions):
        self.asked.append([(q.id, q.instructions, q.criteria) for q in questions])
        return {"answers": {q.id: {"noul": self.nouls[q.id]} for q in questions}, "usage": {"input_tokens": 100}}


OBS = {
    "clockSec": 42.0,
    "self": {"id": "bb-1", "team": "violet", "lane": "top", "instrument": "drums", "pos": {"x": 300, "y": 300},
             "hp": 200, "maxHp": 220, "moveSpeed": 55, "cooldowns": {"kick": 0, "fill": 3.5}},
    "allies": [], "visibleEnemies": [], "nearbyMinions": [], "nearbyTowers": [],
}


class ParseTests(unittest.TestCase):
    def test_all_is_an_and_rule(self):
        rule = _schema(AFFORD_AND).rules[0]
        self.assertEqual([q.condition for q in rule.all_of], ["can this bot afford its next item?", "is no enemy in sight of this bot?"])
        self.assertEqual(rule.all_of[1].criteria_false, "an enemy is in sight")
        # Every check that reads a rule's text reads all of its questions.
        self.assertEqual(rule.condition, "can this bot afford its next item? and is no enemy in sight of this bot?")

    def test_a_list_of_one_is_a_plain_rule_and_bare_strings_parse(self):
        one = _schema({"id": "x", "all": [{"condition": "is an enemy in sight?"}], "action": HOME}).rules[0]
        self.assertEqual((one.condition, one.all_of), ("is an enemy in sight?", ()))
        bare = _schema({"id": "x", "all": ["is an enemy in sight?", "is this bot's hp below half of its max?"], "action": HOME}).rules[0]
        self.assertEqual(len(bare.all_of), 2)
        self.assertEqual(bare.all_of[0].criteria_true, "the condition holds")

    def test_malformed_all_is_an_error(self):
        for bad in ([], "is x?", [{"criteria": {}}], [{"condition": ""}]):
            with self.assertRaises(ValueError):
                _schema({"id": "x", "all": bad, "action": HOME})
        with self.assertRaises(ValueError):  # a guard asks one judgment question
            _schema({"type": "guard", "id": "g", "all": ["a?", "b?"], "then": {"nodes": []}, "else": {"nodes": []}})

    def test_vocab1_never_reads_all(self):
        with self.assertRaisesRegex(ValueError, "missing/invalid condition"):
            _schema(AFFORD_AND, vocab="vocab-1")

    def test_the_vocab2_prompt_asks_for_all_and_vocab1_does_not(self):
        v2 = T._translation_prompt("prose", "drums", "kick", "fill", "vocab-2")
        v1 = T._translation_prompt("prose", "drums", "kick", "fill", "vocab-1")
        self.assertIn('"all"', v2)
        self.assertIn("ONE condition per question", v2)
        self.assertNotIn('"all"', v1)


class SchemaJsonTests(unittest.TestCase):
    def test_round_trip_writes_all_and_no_condition(self):
        schema = _schema(AFFORD_AND, _rule("enemy", "is an enemy in sight?"))
        d = schema_to_dict(schema)
        self.assertNotIn("condition", d["rules"][0])
        self.assertEqual(d["rules"][0]["all"][0], {"condition": "can this bot afford its next item?", "criteria_true": "it can afford it",
                                                   "criteria_false": "it cannot"})
        self.assertEqual(d["rules"][1]["condition"], "is an enemy in sight?")
        back = schema_from_dict(json.loads(json.dumps(d)))
        self.assertEqual(back.root, schema.root)

    def test_a_schema_with_no_and_rule_writes_what_it_wrote(self):
        d = schema_to_dict(_schema(_rule("enemy", "is an enemy in sight?")))
        self.assertEqual(set(d["rules"][0]), {"id", "condition", "criteria_true", "criteria_false", "action_kind", "action_ability",
                                              "action_target_selector"})

    def test_a_saved_and_rule_needs_two_questions(self):
        d = schema_to_dict(_schema(AFFORD_AND))
        d["rules"][0]["all"] = d["rules"][0]["all"][:1]
        with self.assertRaises(ValueError):
            schema_from_dict(d)


class EvaluationTests(unittest.TestCase):
    def test_each_question_is_its_own_noul_in_one_call(self):
        schema = _schema(AFFORD_AND, _rule("enemy", "is an enemy in sight?"))
        self.assertEqual([qid for qid, _ in T.schema_questions(schema.root)], ["shop.1", "shop.2", "enemy"])
        jev = FakeJev({"shop.1": 0.9, "shop.2": 0.9, "enemy": 0.1})
        pred = run_prediction(jev, schema, OBS)
        self.assertEqual(len(jev.asked), 1)
        self.assertEqual(jev.asked[0][0], ("shop.1", "can this bot afford its next item?", {"true": "it can afford it", "false": "it cannot"}))
        self.assertEqual(pred["fired_rule"], "shop")
        self.assertEqual(set(pred["per_question"]), {"shop.1", "shop.2", "enemy"})

    def test_every_question_must_pass_the_one_threshold(self):
        schema = _schema(AFFORD_AND, _rule("enemy", "is an enemy in sight?"))
        for a, b, fires in ((0.9, 0.9, "shop"), (0.9, 0.5, "enemy"), (0.51, 0.51, "shop"), (0.2, 0.99, "enemy")):
            pred = run_prediction(FakeJev({"shop.1": a, "shop.2": b, "enemy": 0.8}), schema, OBS)
            # 0.51 x 0.51 is 0.26: the probabilities are not multiplied; each passes > 0.5 alone.
            self.assertEqual(pred["fired_rule"], fires, (a, b))

    def test_node_answers(self):
        root = _schema(AFFORD_AND, _rule("enemy", "is an enemy in sight?")).root
        self.assertEqual(T.node_answers(root, {"shop.1": True, "shop.2": False, "enemy": True}), {"shop": False, "enemy": True})
        self.assertEqual(T.node_answers(root, {"shop.1": True, "shop.2": True}), {"shop": True, "enemy": False})

    def test_question_ids_must_be_unique(self):
        schema = _schema(AFFORD_AND, _rule("shop.1", "is an enemy in sight?"))
        with self.assertRaisesRegex(ValueError, "share an id"):
            T.schema_questions(schema.root)

    def test_the_schema_server_answers_each_question(self):
        from schema_server import JevSchemaBackend

        d = schema_to_dict(_schema(AFFORD_AND))
        reply = JevSchemaBackend(FakeJev({"shop.1": 0.8, "shop.2": 0.7}), budget_usd=None).decide({"schema": d, "observation": OBS})
        self.assertEqual(reply["rule"], "shop")
        self.assertEqual(reply["answers"], {"shop.1": 0.8, "shop.2": 0.7})


class ClauseByClauseTests(unittest.TestCase):
    def test_an_and_rule_of_the_clauses_is_kept_as_it_is(self):
        schema = _schema(AFFORD_AND)
        self.assertIs(T.enforce_clause_coverage(schema, AFFORD), schema)

    def test_an_and_rule_that_drops_or_inverts_a_clause_is_rejected(self):
        for rule in (_and("shop", "can this bot afford its next item?", "is this bot's hp above half of its max?"),
                     _and("shop", "can this bot afford its next item?", "is an enemy in sight of this bot?")):
            with self.assertRaises(T.SchemaValidationError):
                T.enforce_clause_coverage(_schema(rule), AFFORD)

    def test_one_clause_split_across_two_questions_is_not_stated(self):
        # Jev answers each question alone: "does it have less than 100 hp?" is not about the enemy in sight.
        prose = "If your ability is ready and an enemy bearbot in sight has less than 100 hp, use your primary ability on it."
        split = _schema(_and("finish", "is this bot's kick ability ready?", "is an enemy bearbot in sight?", "does it have less than 100 hp?"))
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_clause_coverage(split, prose)
        whole = _schema(_and("finish", "is this bot's kick ability ready?", "does an enemy bearbot in sight have less than 100 hp?"))
        self.assertIs(T.enforce_clause_coverage(whole, prose), whole)


class SplitTests(unittest.TestCase):
    def test_a_faithful_compound_question_is_split_with_its_criteria(self):
        schema = _schema(_rule("shop", "can this bot afford its next item and is no enemy in sight?",
                               true="affords next item and no enemy in sight", false="cannot afford next item or an enemy is in sight"))
        out = T.enforce_clause_coverage(schema, AFFORD)
        rule = out.rules[0]
        self.assertEqual([(q.condition, q.criteria_true, q.criteria_false) for q in rule.all_of],
                         [("can this bot afford its next item?", "affords next item", "cannot afford next item"),
                          ("is no enemy in sight?", "no enemy in sight", "an enemy is in sight")])
        self.assertEqual((rule.id, rule.action_target_selector), ("shop", "home"))
        self.assertEqual(out.validation_notes, schema.validation_notes)

    def test_criteria_that_do_not_split_the_same_way_become_plain(self):
        out = T.enforce_clause_coverage(_schema(_rule("shop", "can this bot afford its next item AND is no enemy in sight?",
                                                      true="safe to shop", false="not safe")), AFFORD)
        self.assertEqual([q.criteria_true for q in out.rules[0].all_of], ["the condition holds"] * 2)

    def test_what_is_never_split(self):
        cases = [
            # an "or" across the joint would change what it asks
            ("can this bot afford its next item and is no enemy in sight, or is this bot at its base?", AFFORD),
            # one tower, asked about twice: two questions answered alone could be about different towers
            ("is this bot inside an enemy tower's range and does that tower have this bot's minions in its range?",
             "If you are inside an enemy tower's range and that tower has your own minions in its range to shoot first, attack the nearest enemy tower."),
            # a condition of one clause
            ("is an enemy tower in sight and is its hp below 150?", "If an enemy tower in sight has less than 150 hp, attack the nearest enemy tower."),
        ]
        for cond, prose in cases:
            schema = _schema(_rule("r", cond))
            out = T.enforce_clause_coverage(schema, prose, drop=True)
            self.assertEqual(out.rules[0].all_of, (), cond)

    def test_a_piece_that_asks_no_clause_is_not_split_off(self):
        out = T.enforce_clause_coverage(_schema(_rule("shop", "can this bot afford its next item and is no enemy in sight and is it daytime?")), AFFORD)
        self.assertEqual(out.rules[0].all_of, ())

    def test_an_and_question_that_refers_back_is_joined_to_the_one_before(self):
        prose = "If you are inside an enemy tower's range and that tower has your own minions in its range to shoot first, attack the nearest enemy tower."
        tower = {"kind": "attack", "ability": None, "target_selector": "nearest_tower"}
        schema = _schema(_and("siege", "is this bot inside an enemy tower's range?", "does that tower have this bot's minions in its range?",
                              action=tower))
        out = T.enforce_clause_coverage(schema, prose)
        self.assertEqual(out.rules[0].all_of, ())
        self.assertEqual(out.rules[0].condition,
                         "is this bot inside an enemy tower's range and does that tower have this bot's minions in its range?")

    def test_the_checked_in_schemas_split_and_lose_nothing(self):
        pilots = os.path.join(os.path.dirname(__file__), "..", "..", "prompts", "pilots")
        split = 0
        for name in sorted(os.listdir(pilots)):
            prose_path = os.path.join(pilots, name.replace(".schemas.json", ".prose.md"))
            if not name.endswith(".schemas.json") or not os.path.exists(prose_path):
                continue
            prose = Path(prose_path).read_text(encoding="utf-8")
            for inst, d in json.loads(Path(pilots, name).read_text(encoding="utf-8")).items():
                if isinstance(d, dict) and d.get("vocab") == "vocab-2":
                    schema = schema_from_dict(d)
                    out = T.enforce_clause_coverage(schema, T.scope_to_instrument(prose, schema.instrument).text, drop=True)
                    self.assertEqual([n.id for n in T.collect_nodes(out.root)], [n.id for n in T.collect_nodes(schema.root)], name)
                    self.assertEqual(out.validation_notes, schema.validation_notes, name)
                    split += sum(1 for n in T.collect_nodes(out.root) if isinstance(n, T.TranslatedRule) and n.all_of)
        self.assertGreater(split, 20)


class OtherGuardsReadEveryQuestionTests(unittest.TestCase):
    def test_identity_question_about_this_instrument_is_taken_out(self):
        schema = _schema(_and("kick", "is this bot the drums?", "is an enemy bearbot in sight?",
                              action={"kind": "ability", "ability": "kick", "target_selector": "nearest_enemy"}))
        out = T.enforce_identity_rules(schema, "If your ability is ready and an enemy bearbot is in sight, use it.")
        self.assertEqual((out.rules[0].condition, out.rules[0].all_of), ("is an enemy bearbot in sight?", ()))
        self.assertTrue(out.validation_notes[-1].startswith("identity: took the question \"is this bot the drums?\" out of rule kick"))

    def test_identity_question_about_another_instrument_is_rejected(self):
        schema = _schema(_and("kick", "is this bot the violin?", "is an enemy bearbot in sight?"))
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_identity_rules(schema, "Violin: if an enemy bearbot is in sight, attack it.")

    def test_negation_lost_in_one_question_is_caught(self):
        schema = _schema(_and("shop", "can this bot afford its next item?", "is an enemy in sight?"))
        with self.assertRaises(T.SchemaValidationError):
            T.enforce_negation(schema, AFFORD)

    def test_target_reads_every_question(self):
        rule = _and("walk", "is this bot's hp above half of its max?", "are this bot's minions near it?",
                    action={"kind": "move", "ability": None, "target_selector": "nearest_ally"})
        raw, notes = T.normalize_targets({"rules": [rule], "default_action": PUSH}, "vocab-2")
        self.assertEqual(raw["rules"][0]["action"]["target_selector"], "nearby_minion")
        self.assertTrue(notes)


class RenderingTests(unittest.TestCase):
    def test_quick_view_and_jev_ask_show_each_question(self):
        schema = _schema(AFFORD_AND)
        rows = T.display_rows(schema.root)
        self.assertEqual(rows[0]["condition"], "can this bot afford its next item? **and** is no enemy in sight of this bot?")
        self.assertIn("can this bot afford its next item? **and** is no enemy in sight of this bot?", T.render_markdown(schema))
        md = render_report_markdown(build_report(schema, "p.md", segments=[("rule", AFFORD)], labels="auto"))
        self.assertIn("Jev is asked 2 `noul` questions, each on its own", md)
        self.assertIn("The rule fires only when every one of them is yes.", md)
        self.assertIn("### 1. `shop` — can this bot afford its next item? **and** is no enemy in sight of this bot?", md)


if __name__ == "__main__":
    unittest.main()
