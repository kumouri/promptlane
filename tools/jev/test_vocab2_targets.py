"""vocab-2 targets mean what the prose meant (runs/vocab-house-tiers-2026-10-02.md §2, §5.4):

1. "move to my minions" compiled to `nearest_ally` (a teammate bearbot) in every hard and sample-entrant
   compile, so the recompiled sample entrant walked to its own bearbots 79 % of the time;
2. the translator wrote a `nearest_enemy_tower` target no vocabulary has, and 4 of 24 compiles died.

Fixtures are rules the translator wrote under vocab-2's first prompt (two verbatim from that run, the
rest the same mistakes on an entrant's phrasings). `translator.normalize_targets` must turn each into
the target the prose means, and leave vocab-1 exactly as it was. No model call anywhere."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import translator as T  # noqa: E402
from compile import schema_from_dict, schema_to_dict  # noqa: E402
from target_resolve import TARGETING_OWN_LANE_1, resolve_target  # noqa: E402
from segment import auto_segments  # noqa: E402
from transparency import build_report, render_report_markdown  # noqa: E402
from vocab import VOCAB_1, VOCAB_2  # noqa: E402

DEFAULT = {"kind": "move", "ability": None, "target_selector": "push_lane"}


def rule(id_, condition, kind, selector, true="", false=""):
    return {"id": id_, "condition": condition, "criteria": {"true": true or "yes", "false": false or "no"},
            "action": {"kind": kind, "ability": None, "target_selector": selector}}


def reply(*rules, default=DEFAULT):
    return {"rules": list(rules), "default_action": default}


# (prose an entrant writes, the rule the translator wrote for it, the target the prose means)
FIXTURES = (
    # verbatim from the run: sample-entrant-eco drums rule 10, hard-eco drums rule 15
    ("Otherwise I walk with my nearest minion.",
     rule("walk_with_minion_or_home", "is there a minion near me?", "move", "nearest_ally",
          "at least one allied minion within 260 units", "no allied minion within 260 units"), "nearby_minion"),
    ("Otherwise push with your wave: if an allied minion is near you, move to the nearest allied minion.",
     rule("move_to_nearest_ally_minion", "is an allied minion near this bot?", "move", "nearest_ally",
          "allied minion nearby", "no allied minion nearby"), "nearby_minion"),
    # the phrasings an entrant writes
    ("When my minions are near me, I push with my minions.",
     rule("push_with_minions", "are my minions near me?", "move", "nearest_ally"), "nearby_minion"),
    ("I follow my wave.",
     rule("follow_wave", "is my wave within 260 units of this bot?", "move", "nearest_ally"), "nearby_minion"),
    ("I stay with my teammates.",
     rule("stay_with_teammates", "is a teammate within 260 units?", "move", "nearby_minion"), "nearest_ally"),
    ("I stay with my teammates.",  # and when the translator already got it right, nothing changes
     rule("stay_with_teammates", "is an allied bearbot alive?", "move", "nearest_ally"), "nearest_ally"),
    ("If I can see their tower, I attack their tower.",
     rule("attack_their_tower", "is an enemy tower in sight?", "attack", "nearest_enemy_tower"), "nearest_tower"),
    ("If I can see their tower, I attack their tower.",
     rule("attack_their_tower", "is an enemy tower in sight?", "attack", "nearest_tower"), "nearest_tower"),
)


def minion(id_, team, pos):
    return {"id": id_, "team": team, "pos": pos, "hp": 60, "maxHp": 60}


def observation():
    """A violet keytar mid-lane: a teammate 150 units behind, an allied minion 50 ahead, an enemy tower."""
    return {
        "clockSec": 61,
        "self": {"id": "bb-2", "team": "violet", "instrument": "keytar", "lane": "top", "pos": {"x": 100, "y": 400},
                 "hp": 140, "maxHp": 140, "cooldowns": {}},
        "allies": [{"id": "bb-1", "pos": {"x": 100, "y": 550}, "hp": 220, "maxHp": 220}],
        "visibleEnemies": [{"id": "tw-7", "kind": "tower", "pos": {"x": 100, "y": 200}, "hp": 900, "maxHp": 900}],
        "nearbyMinions": [minion("mn-1", "violet", {"x": 100, "y": 350})],
        "nearbyTowers": [],
    }


class MinionAndTeammateTargets(unittest.TestCase):
    def test_fixtures_compile_to_the_target_the_prose_means(self):
        for prose, r, want in FIXTURES:
            with self.subTest(prose=prose, wrote=r["action"]["target_selector"]):
                s = T.parse_schema(reply(r), "pilot.md", "keytar", "", VOCAB_2)
                self.assertEqual(s.rules[0].action_target_selector, want)
                changed = r["action"]["target_selector"] != want
                notes = [n for n in s.validation_notes if n.startswith(T.TARGET_NOTE_PREFIX)]
                self.assertEqual(len(notes), 1 if changed else 0, notes)

    def test_a_corrected_rule_walks_to_the_minion_not_the_teammate(self):
        s = T.parse_schema(reply(FIXTURES[0][1]), "pilot.md", "keytar", "", VOCAB_2)
        o = observation()
        got = resolve_target(s.rules[0].action_target_selector, o, TARGETING_OWN_LANE_1, VOCAB_2, "pvp-1")
        self.assertEqual(got, {"x": 100, "y": 350}, "the allied minion")
        self.assertEqual(resolve_target("nearest_ally", o, TARGETING_OWN_LANE_1, VOCAB_2, "pvp-1"), {"x": 100, "y": 550},
                         "what the uncorrected rule did: the teammate")

    def test_a_rule_about_missing_minions_keeps_its_teammate_target(self):
        """The rule's question names minions, but as absent: its target isn't one of them."""
        for cond in ("are none of my minions near me?", "is there no allied minion within 260 units?", "are all my minions dead?"):
            with self.subTest(cond=cond):
                s = T.parse_schema(reply(rule("regroup", cond, "move", "nearest_ally")), "p.md", "drums", "", VOCAB_2)
                self.assertEqual(s.rules[0].action_target_selector, "nearest_ally")
                self.assertEqual(s.validation_notes, ())

    def test_a_rule_naming_both_keeps_the_translators_choice(self):
        r = rule("together", "are my minions and a teammate both near me?", "move", "nearest_ally")
        self.assertEqual(T.parse_schema(reply(r), "p.md", "drums", "", VOCAB_2).rules[0].action_target_selector, "nearest_ally")

    def test_rules_inside_a_guard_are_corrected_too(self):
        guard = {"type": "guard", "id": "can_win", "condition": "is this bot's side stronger in the fight near it?",
                 "criteria": {"true": "stronger", "false": "not stronger"},
                 "then": {"nodes": [rule("ride_wave", "is an allied minion near this bot?", "move", "nearest_ally")], "default_action": None},
                 "else": {"nodes": [], "default_action": {"kind": "move", "ability": None, "target_selector": "nearest_enemy_tower"}}}
        s = T.parse_schema(reply(guard), "p.md", "drums", "", VOCAB_2)
        g = s.root.nodes[0]
        self.assertEqual(g.then.nodes[0].action_target_selector, "nearby_minion")
        self.assertEqual(g.else_.default.target_selector, "nearest_tower")
        self.assertEqual(len(s.validation_notes), 2)

    def test_the_prompt_says_which_is_which(self):
        sel = T.selectors_for(VOCAB_2)
        self.assertIn("my minions", sel["nearby_minion"])
        self.assertIn("follow my wave", sel["nearby_minion"])
        self.assertIn("never a minion", sel["nearest_ally"])
        self.assertIn("teammates", sel["nearest_ally"])
        self.assertIn("their tower", sel["nearest_tower"])
        prompt = T._translation_prompt("I follow my wave.", "drums", "kick", "fill", VOCAB_2)
        for k, v in sel.items():
            self.assertIn(f'  "{k}" -- {v}', prompt)
        self.assertEqual(T.selectors_for(VOCAB_1), T.TARGET_SELECTORS, "vocab-1's meanings are its own, unchanged")


class UnknownTargets(unittest.TestCase):
    def test_an_alias_maps_to_the_real_target_with_a_note(self):
        r = rule("attack_their_tower", "is an enemy tower in sight?", "attack", "nearest_enemy_tower")
        s = T.parse_schema(reply(r, default={"kind": "move", "ability": None, "target_selector": "nearest_teammate"}),
                           "p.md", "violin", "", VOCAB_2)
        self.assertEqual((s.rules[0].action_target_selector, s.default_target_selector), ("nearest_tower", "nearest_ally"))
        self.assertIn("rule attack_their_tower named 'nearest_enemy_tower', which is not a target; it targets 'nearest_tower'",
                      s.validation_notes[0])
        md = T.render_markdown(s)
        self.assertIn("**Targets -- what was corrected:**", md)
        self.assertNotIn("Automatic priority fixes", md)
        report = render_report_markdown(build_report(s, "p.md", segments=auto_segments("If I can see their tower, I attack their tower."), labels="auto"))
        self.assertIn("## Targets — what was corrected", report)
        self.assertNotIn("Automatic priority fixes", report)
        self.assertEqual(schema_from_dict(schema_to_dict(s)).validation_notes, s.validation_notes)

    def test_every_alias_names_a_real_vocab2_target(self):
        for alias, real in T.TARGET_ALIASES.items():
            self.assertNotIn(alias, T.SELECTORS_BY_VOCAB[VOCAB_2], alias)
            self.assertIn(real, T.SELECTORS_BY_VOCAB[VOCAB_2], alias)

    def test_an_unknown_target_is_a_clear_error_and_the_retry_is_told_the_valid_ones(self):
        bad = json.dumps(reply(rule("camp", "is an enemy in sight?", "move", "enemy_spawn_point")))
        good = json.dumps(reply(rule("camp", "is an enemy in sight?", "attack", "nearest_enemy")))
        with self.assertRaisesRegex(ValueError, r"rule camp: unknown target_selector 'enemy_spawn_point' -- there is no such "
                                                r"target; use exactly one of none, home, push_lane, .*nearest_ally, or null"):
            T.parse_schema(json.loads(bad), "p.md", "drums", "", VOCAB_2)
        prompts = []
        replies = iter((bad, good))

        def generate(p):
            prompts.append(p)
            return next(replies)

        s = T.translate_pilot("I attack enemies.", "p.md", "drums", "kick", "fill", generate=generate, vocab=VOCAB_2)
        self.assertEqual(s.rules[0].action_target_selector, "nearest_enemy")
        self.assertEqual(len(prompts), 2)
        self.assertIn("Your previous attempt was invalid: rule camp: unknown target_selector 'enemy_spawn_point' -- there is no "
                      "such target; use exactly one of", prompts[1])

    def test_nearest_enemy_tower_no_longer_kills_a_compile(self):
        replies = [json.dumps(reply(rule("push", "is an enemy tower in sight?", "attack", "nearest_enemy_tower")))] * 3
        s = T.translate_pilot("Attack their tower.", "p.md", "drums", "kick", "fill", generate=lambda p: replies.pop(), vocab=VOCAB_2)
        self.assertEqual(s.rules[0].action_target_selector, "nearest_tower")
        self.assertEqual(len(replies), 2, "compiled on the first attempt")


class Vocab1IsUntouched(unittest.TestCase):
    def test_vocab1_parses_exactly_as_before(self):
        raw = reply(rule("walk_with_minion", "is there a minion near me?", "move", "nearby_minion"),
                    rule("stay_with_teammates", "is a teammate within 260 units?", "move", "nearby_minion"))
        self.assertIs(T.normalize_targets(raw, VOCAB_1)[0], raw)
        s = T.parse_schema(raw, "p.md", "drums", "", VOCAB_1)
        self.assertEqual([r.action_target_selector for r in s.rules], ["nearby_minion", "nearby_minion"])
        self.assertEqual(s.validation_notes, ())

    def test_vocab1_still_rejects_an_unknown_target_with_its_old_message(self):
        raw = reply(rule("push", "is an enemy tower in sight?", "attack", "nearest_enemy_tower"))
        with self.assertRaises(ValueError) as caught:
            T.parse_schema(raw, "p.md", "drums", "", VOCAB_1)
        self.assertEqual(str(caught.exception), "rule push: unknown target_selector 'nearest_enemy_tower'")


if __name__ == "__main__":
    unittest.main()
