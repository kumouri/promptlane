#!/usr/bin/env python3
"""Runs the prose-to-schema translator fidelity test end to end:

    pilot.md (prose) --[translator.py, Ollama qwen3.5:9b]--> schema
    schema --[this file's rule cascade + target_resolve.py]--> Jev noul questions per scenario
    Jev (live, WorkersAIClient) answers -> predicted action

    pilot.md (the SAME untranslated prose) --[ground_truth.py, same Ollama model, real chat call]-->
    ground-truth action, on the same synthetic Observation (scenarios.py)

    compare predicted vs. ground truth -- this is the fidelity number. Ground truth is deliberately
    NOT the translator's own output and NOT Jev: it's what the entrant's actual words, run live, do
    -- see `ground_truth.py`'s module docstring for why that's the correct independent baseline.

Two Jev calls are avoided by design, matching the existing house-violet.md harness's own pattern:
every rule's condition for one (pilot, scenario) pair goes into ONE `systemone` call (Jev answers
all questions in parallel per call, per its own design -- `docs/jev-decision-model-research.md` §1).

Run it:

    python tools/jev/fidelity_harness.py                        # dry run: stub Jev answers, no network
    python tools/jev/fidelity_harness.py --live                 # real Jev via Cloudflare Workers AI
    python tools/jev/fidelity_harness.py --live --out runs/jev-translator-fidelity-2026-09-23.json

Ollama (translation + ground truth) always runs live against the host's Ollama -- there is no stub
for that half; it's free and local, so there's no cost reason to stub it, and stubbing it would
defeat the point (ground truth has to be real).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import (  # noqa: E402
    WORKERS_AI_MODEL,
    WorkersAIClient,
    estimate_cost_usd,
    estimate_request_tokens,
    resolve_workers_ai_token,
)
from economy_rules import item_from, item_name, item_tier, join_names  # noqa: E402
from ground_truth import ground_truth_action  # noqa: E402
from scenarios import all_scenarios, build_observation, river_rules, ABILITIES  # noqa: E402
from target_resolve import DEFAULT_TARGETING, resolve_target  # noqa: E402
from vocab import ATTACK_RANGE, VOCAB_1, MapSpec, dist, fight, map_spec, resolve_vocab, tower_facts  # noqa: E402
from translator import (  # noqa: E402
    GuardNode,
    TranslatedSchema,
    collect_nodes,
    evaluate_schema,
    parse_schema,
    render_markdown,
    translate_pilot,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PILOTS = {
    "drums": REPO_ROOT / "prompts" / "pilots" / "drums.md",
    "keytar": REPO_ROOT / "prompts" / "pilots" / "keytar.md",
    "violin": REPO_ROOT / "prompts" / "pilots" / "violin.md",
}
TEAM = "violet"


@dataclass(frozen=True)
class BoundQuestion:
    id: str
    instructions: str
    criteria: dict


class DumbStubJevClient:
    """Plumbing-only dry run: seeded pseudo-random noul answers, no ground-truth concept (unlike
    `client.StubSystemOneClient`, which needs a hand-coded oracle per question -- this harness's
    questions are LLM-authored prose, not fixed formulas, so there is no such oracle to stub
    against). Exercises the wire shape and the rest of the pipeline; says nothing about fidelity.

    Each answer is a function of the seed, the state and the question alone, never of call order:
    `schema_server.py --stub` is threaded, so six bots' asks arrive in whatever order the network
    delivers them, and one shared random stream dealt the same draws to different bots run to run
    (a seeded stub match played differently every time; `tools/match/test_vocab.mjs`)."""

    backend = "stub"  # the "door" a stub decision reports (`run_prediction`)

    def __init__(self, seed: int = 20260923):
        self._seed = seed

    def _noul(self, state, q) -> float:
        key = json.dumps([self._seed, state, q.id, q.instructions, q.criteria], sort_keys=True, default=str)
        rng = random.Random(int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:8], "big"))
        return round(rng.uniform(0.1, 0.9), 4)

    def ask(self, state, questions: list) -> dict:
        answers = {q.id: {"noul": self._noul(state, q)} for q in questions}
        input_tokens = estimate_request_tokens(state, questions)
        return {"model": "stub-jev", "answers": answers, "usage": {"input_tokens": input_tokens, "output_tokens": 0}}


def _items_text(keys, made_from: bool = False) -> str:
    """Item names, comma-separated. A tier-2/3 item (late-game spec §7.3; its tier and parts looked up
    by key across the ruleset files, so this never raises) gets "(tier N)", or with `made_from`
    "(tier 2, made from A and B)" / "(tier 3, upgraded from C)". A tier-1 item reads as before."""
    return ", ".join(_item_text(k, made_from) for k in keys) if keys else "none"


def _item_text(key, made_from: bool) -> str:
    tier = item_tier(key)
    if tier < 2:
        return item_name(key)
    parts = [item_name(p) for p in item_from(key)]
    if not made_from or not parts:
        return f"{item_name(key)} (tier {tier})"
    how = "upgraded from" if len(parts) == 1 else "made from"
    return f"{item_name(key)} (tier {tier}, {how} {join_names(parts)})"


def _recipe_clause(entry: dict) -> str:
    """For a nextItem/shop entry carrying `from` (a recipe or upgrade under a ruleset with recipes):
    ", an upgrade of its Backline" / ", combining its Road Case and Bass Strings"; else ""."""
    parts = [item_name(p) for p in entry.get("from") or ()]
    if not parts:
        return ""
    if entry.get("tier", 3 if len(parts) == 1 else 2) >= 3:
        return f", an upgrade of its {join_names(parts)}"
    return f", combining its {join_names(parts)}"


def _shop_entry_text(entry: dict) -> str:
    parts = [item_name(p) for p in entry.get("from") or ()]
    if not parts:
        return f"{item_name(entry['item'])} ({entry['cost']} gold)"
    if entry.get("tier", 3 if len(parts) == 1 else 2) >= 3:
        return f"{item_name(entry['item'])} ({entry['cost']} gold to upgrade {join_names(parts)})"
    return f"{item_name(entry['item'])} ({entry['cost']} gold to combine {join_names(parts)})"


def _death_clause(loss: int, payout: int) -> str:
    """What dying costs, worded from the two numbers the economy layer reports so it stays true under
    every `gold.death` preset (`docs/economy-spec.md` §3.3): all of the loss goes to the killers,
    part of it does, none of it does, or there is no loss."""
    if loss <= 0:
        return "its gold is safe if it dies"
    if payout >= loss:
        return f"if it dies, {loss} of it goes to the bots that kill it"
    if payout > 0:
        return f"if it dies, it loses {loss} of it: {payout} goes to the killers and the rest is lost"
    return f"if it dies, {loss} of it is lost"


def _seconds(x) -> str:
    return f"{x:g}"


def _economy_self_sentences(self_: dict) -> list[str]:
    """The bearbot's own economy facts (`docs/economy-spec.md` §4.1), one sentence per field group,
    in the third person like the rest of this description. Only the fields present are described."""
    out: list[str] = []
    if "level" in self_:
        xp_to_next = self_.get("xpToNext")
        out.append(
            f"This bearbot is level {self_['level']}"
            + (f" ({xp_to_next} XP to level {self_['level'] + 1})." if xp_to_next is not None else " (the highest level).")
        )
    if "gold" in self_:
        text = f"It carries {self_['gold']} unspent gold"
        if "deathLoss" in self_:
            text += f"; {_death_clause(self_['deathLoss'], self_.get('deathPayout', 0))}"
        if "bounty" in self_:
            text += f", and killing it is worth {self_['bounty']} gold to the enemy team"
        out.append(text + ".")
    if "items" in self_:
        text = f"Items: {_items_text(self_['items'], made_from=True)}"
        if "slotsFree" in self_:
            text += f" ({self_['slotsFree']} of {self_['slotsFree'] + len(self_['items'])} slots free)"
        out.append(text + ".")
    if "nextItem" in self_:
        nxt = self_["nextItem"]
        if nxt is None:
            out.append("Nothing is left on its shopping list to buy.")
        else:
            can = self_.get("gold", 0) >= nxt["cost"]
            out.append(
                f"Next on its shopping list: {item_name(nxt['item'])}{_recipe_clause(nxt)}, {nxt['cost']} gold -- "
                + ("it can afford it now." if can else "it cannot afford it yet.")
            )
    if "atShop" in self_:
        out.append("It is at its base, where it can shop." if self_["atShop"] else "It is not at its base.")
    return out


def _economy_other_sentence(role: str, e: dict) -> str | None:
    """`role` is "Ally" or "Enemy". An ally shows level, gold and items; an enemy bearbot shows level,
    bounty and items (enemy gold is hidden, only what killing it pays is visible)."""
    facts = []
    if "level" in e:
        facts.append(f"level {e['level']}")
    if "items" in e:
        facts.append(f"items: {_items_text(e['items'])}")
    head = f"{role} {e['id']}" + (f" ({', '.join(facts)})" if facts else "")
    if "gold" in e:
        return f"{head} carries {e['gold']} gold."
    if "bounty" in e:
        return f"{head} is worth {e['bounty']} gold if killed."
    return f"{head}." if facts else None


def describe_observation(obs: dict, vocab: str = VOCAB_1, map_: str | dict | None = None) -> str:
    """The paragraph Jev reads, in the schema's vocabulary (`vocab.py`). vocab-1 is
    `_describe_vocab1`, byte for byte what every schema saw before vocab-2 existed (golden-tested,
    `test_vocab.py`); vocab-2 is `_describe_vocab2`, which also needs the match's `map_` for tower
    range."""
    if resolve_vocab(vocab) == VOCAB_1:
        return _describe_vocab1(obs)
    return _describe_vocab2(obs, map_spec(map_))


def _describe_vocab1(obs: dict) -> str:
    """A short, dense, detailed paragraph (TypeSafe's own guidance, quoted in `serializer.py`),
    generic over any `Observation` -- not tied to one pilot's worksheet the way `serializer.
    state_paragraph` is. No precomputed distance/range: only raw positions, same as the real
    contract gives the game's own chat-model pilots (`tools/arena/pages/contract.mjs`).

    ECONOMY. When the observation carries the economy layer's fields (`docs/economy-spec.md` §4.1:
    `self.gold`/`level`/`items`/..., per-entity `level`/`gold`/`bounty`/`items`, top-level
    `respawning` and `shop`), a sentence or two per field group is added after the matching part of
    the description, so a condition like "can it afford its next item?" or "is an enemy respawning?"
    is answerable from the text. An observation without those fields is described exactly as before.
    Under a ruleset with recipes (`docs/late-game-economy-spec.md` §7.3) a tier-2/3 item is named with
    its tier (and, for this bot's own items, what it is made from), and a next item or shop entry
    carrying `from` says it combines or upgrades those parts; tier-1 items read exactly as before.

    RIVER OBJECTIVE. The Bandstand's lines come last (`_bandstand_lines`, §9.7); an observation
    without a `bandstand` block gets the single line "There is no Bandstand in this match." The one
    exception to "no precomputed distance" is the Bandstand's distance from this bot, which the
    stakes need to read as a decision.

    This is also what `schema_server.py` shows Jev live (via `run_prediction`) for a vocab-1 schema."""
    self_ = obs["self"]
    parts = [
        f"This is a {self_['team']}-team bearbot playing {self_['instrument']}, "
        f"{obs['clockSec']:.1f} sim-seconds into the match, at position "
        f"({self_['pos']['x']:.0f},{self_['pos']['y']:.0f}).",
        f"Its own hp is {self_['hp']:.0f} out of {self_['maxHp']:.0f} "
        f"({100*self_['hp']/self_['maxHp']:.0f}%).",
    ]
    cd_bits = [
        f"{name} cooldown {secs:.1f}s ({'ready' if secs == 0 else 'not ready'})"
        for name, secs in self_["cooldowns"].items()
    ]
    parts.append("Cooldowns: " + ", ".join(cd_bits) + ".")
    parts += _economy_self_sentences(self_)
    if obs["allies"]:
        parts.append(
            "Allies visible: "
            + "; ".join(
                f"{a['id']} at ({a['pos']['x']:.0f},{a['pos']['y']:.0f}) with "
                f"{a['hp']:.0f}/{a['maxHp']:.0f} hp"
                for a in obs["allies"]
            )
            + "."
        )
    else:
        parts.append("No allies visible nearby.")
    parts += [t for t in (_economy_other_sentence("Ally", a) for a in obs["allies"]) if t]
    if obs["visibleEnemies"]:
        parts.append(
            "Visible enemies: "
            + "; ".join(
                f"{e['id']} ({e['kind']}) at ({e['pos']['x']:.0f},{e['pos']['y']:.0f}) with "
                f"{e['hp']:.0f}/{e['maxHp']:.0f} hp"
                for e in obs["visibleEnemies"]
            )
            + "."
        )
    else:
        parts.append("No enemies visible.")
    parts += [t for t in (_economy_other_sentence("Enemy", e) for e in obs["visibleEnemies"] if e.get("kind") == "bearbot") if t]
    if obs["nearbyMinions"]:
        parts.append(
            "Nearby minions: "
            + "; ".join(
                f"{m['id']} (team {m['team']}) at ({m['pos']['x']:.0f},{m['pos']['y']:.0f})"
                for m in obs["nearbyMinions"]
            )
            + "."
        )
    else:
        parts.append("No minions nearby.")
    for r in obs.get("respawning") or ():
        parts.append(f"{'Ally' if r['team'] == self_['team'] else 'Enemy'} {r['id']} respawns in {_seconds(r['inSec'])} s.")
    if obs.get("shop"):
        parts.append("The base shop sells: " + ", ".join(_shop_entry_text(i) for i in obs["shop"]) + ".")
    parts.extend(_bandstand_lines(obs))
    return " ".join(parts)


def _xy(pos: dict) -> str:
    return f"({pos['x']:.0f},{pos['y']:.0f})"


def _units(d: float) -> str:
    return f"{d:.0f} units away"


def _names(ids) -> str:
    ids = list(ids)
    return ids[0] if len(ids) == 1 else ", ".join(ids[:-1]) + " and " + ids[-1]


def _tower_lines(obs: dict, spec: MapSpec) -> list[str]:
    """Spec A1. One sentence per alive tower within 390, then three summary sentences that are
    always present, so "am I under my own tower?", "will an enemy tower shoot me?" and "is an enemy
    bearbot under my tower?" each get a definite answer (§3 rule 5)."""
    facts = sorted(tower_facts(obs, spec), key=lambda f: (f.distance, f.tower["id"]))
    alive = [f for f in facts if f.tower.get("alive", True)]
    rng = f"{spec.tower_range:g}"
    lines: list[str] = []
    for f in alive:
        t = f.tower
        head = f"{'Your' if f.own else 'Enemy'} tower {t['id']} ({t['lane']}, {t['hp']:.0f}/{t['maxHp']:.0f} hp) at {_xy(t['pos'])} is {_units(f.distance)}"
        if not f.in_range:
            text = f"{head}; you are outside its {rng}-unit range"
        elif f.own:
            text = f"{head}; you are inside its {rng}-unit range"
        elif f.my_minions_in_range:
            n = f.my_minions_in_range
            text = f"{head}; you are inside its {rng}-unit range, but it has {n} of your minions in range to shoot first, so it will not shoot you yet"
        else:
            text = f"{head}; you are inside its {rng}-unit range, and it has no minion of yours to shoot first, so it will shoot you"
        if f.own and f.divers:
            text += f"; enemy bearbot {_names(f.divers)} {'is' if len(f.divers) == 1 else 'are'} inside its range"
        lines.append(text + ".")
    under = [f.tower["id"] for f in alive if f.own and f.in_range]
    shooting = [f.tower["id"] for f in alive if f.will_shoot_me]
    divers = sorted({d for f in alive for d in f.divers})
    if not any(f.own for f in alive):
        lines.append("No tower of yours is within 390 units.")
    if not any(not f.own for f in alive):
        lines.append("No enemy tower is within 390 units.")
    lines.append(f"You are under your own tower ({_names(under)})." if under else "You are not under your own tower.")
    lines.append(f"An enemy tower will shoot you ({_names(shooting)})." if shooting else "No enemy tower will shoot you.")
    lines.append(f"Enemy bearbot under your tower: {_names(divers)}." if divers else "No enemy bearbot is under your tower.")
    dead = [f for f in facts if not f.tower.get("alive", True)]
    if dead:
        lines.append("Dead towers within 390 units: " + ", ".join(f"{f.tower['id']} ({'yours' if f.own else 'enemy'})" for f in dead) + ".")
    return lines


def _fight_line(obs: dict, spec: MapSpec) -> str:
    """Spec A3: the counts behind the verdict, then the verdict, so a rule can ask about either."""
    fb = fight(obs, spec)
    if fb.verdict == "none":
        return "Fight near you: none, no enemy bearbot is within 260 units."

    def side(s, who):
        bits = [f"{s.bearbots} bearbot{'' if s.bearbots == 1 else 's'} ({s.hp:.0f} hp)",
                f"{s.minions} minion{'' if s.minions == 1 else 's'}",
                f"{s.towers or 'no'} tower{'' if s.towers == 1 else 's'} in range"]
        return f"{who} side " + ", ".join(bits)

    verdict = {"stronger": "Your side is stronger here.", "weaker": "Your side is weaker here.",
               "even": "The fight is even here."}[fb.verdict]
    return f"Fight near you (within 260 units): {side(fb.mine, 'your')}; {side(fb.theirs, 'their')}. {verdict}"


def _describe_vocab2(obs: dict, spec: MapSpec) -> str:
    """vocab-2 (`docs/vocabulary-spec.md` §4.1, stage A): vocab-1's facts, plus the bot's lane and
    attack range, every listed entity's distance (and a minion's hp), which enemies are in its
    attack range, tower facts by team (A1) and the fight line (A3). Third person for the bot's own
    stats, "you" for where it stands, as vocab-1's Bandstand lines already do. The facts it states
    are the list the vocab-2 translator prompt names (`vocab.FACTS_V2`)."""
    self_ = obs["self"]
    me, team = self_["pos"], self_["team"]
    lane = f" in the {self_['lane']} lane" if self_.get("lane") else ""
    parts = [
        f"This is a {team}-team bearbot playing {self_['instrument']}{lane}, "
        f"{obs['clockSec']:.1f} sim-seconds into the match, at position {_xy(me)}.",
        f"Its own hp is {self_['hp']:.0f} out of {self_['maxHp']:.0f} "
        f"({100*self_['hp']/self_['maxHp']:.0f}%).",
    ]
    reach = ATTACK_RANGE.get(self_["instrument"])
    if reach is not None:
        parts.append(f"Its attack range is {reach} units.")
    parts.append("Cooldowns: " + ", ".join(
        f"{name} cooldown {secs:.1f}s ({'ready' if secs == 0 else 'not ready'})" for name, secs in self_["cooldowns"].items()) + ".")
    parts += _economy_self_sentences(self_)
    if obs["allies"]:
        parts.append("Allied bearbots (every living ally, anywhere on the map): " + "; ".join(
            f"{a['id']} at {_xy(a['pos'])}, {_units(dist(me, a['pos']))}, with {a['hp']:.0f}/{a['maxHp']:.0f} hp" for a in obs["allies"]) + ".")
    else:
        parts.append("Allied bearbots: none alive right now.")
    parts += [t for t in (_economy_other_sentence("Ally", a) for a in obs["allies"]) if t]
    if obs["visibleEnemies"]:
        parts.append("Enemies within 260 units: " + "; ".join(
            f"{e['id']} ({e['kind']}) at {_xy(e['pos'])}, {_units(dist(me, e['pos']))}, with {e['hp']:.0f}/{e['maxHp']:.0f} hp"
            for e in obs["visibleEnemies"]) + ".")
    else:
        parts.append("Enemies within 260 units: none.")
    if reach is not None:
        hit = [e["id"] for e in obs["visibleEnemies"] if dist(me, e["pos"]) <= reach]
        parts.append(f"Enemies in your attack range: {', '.join(hit)}." if hit else "No enemy is in your attack range.")
    parts += [t for t in (_economy_other_sentence("Enemy", e) for e in obs["visibleEnemies"] if e.get("kind") == "bearbot") if t]
    if obs["nearbyMinions"]:
        parts.append("Minions within 260 units: " + "; ".join(
            f"{m['id']} ({'yours' if m['team'] == team else 'enemy'}) at {_xy(m['pos'])}, {_units(dist(me, m['pos']))}, "
            f"with {m['hp']:.0f}/{m['maxHp']:.0f} hp" for m in obs["nearbyMinions"]) + ".")
    else:
        parts.append("Minions within 260 units: none.")
    parts += _tower_lines(obs, spec)
    parts.append(_fight_line(obs, spec))
    for r in obs.get("respawning") or ():
        parts.append(f"{'Ally' if r['team'] == team else 'Enemy'} {r['id']} respawns in {_seconds(r['inSec'])} s.")
    if obs.get("shop"):
        parts.append("The base shop sells: " + ", ".join(f"{item_name(i['item'])} ({i['cost']} gold)" for i in obs["shop"]) + ".")
    parts.extend(_bandstand_lines(obs))
    return " ".join(parts)


def _pct(frac: float) -> str:
    return f"{round(abs(frac) * 100)} %"


def _more_seconds(secs: float) -> str:
    """Encore time left, whole seconds rounded up ("1 more second", "21 more seconds")."""
    n = math.ceil(secs)
    return f"{n} more second{'' if n == 1 else 's'}"


def _bandstand_lines(obs: dict) -> list[str]:
    """The river objective (`docs/economy-spec.md` §9.7), appended after every other line so a match
    without it reads exactly as before plus one sentence. That sentence ("There is no Bandstand in
    this match.") is what keeps the with/without measurement (§9.8) clean: Jev is told the stage is
    absent rather than left to guess. Gold is mentioned only when the economy is on (`self.gold`)."""
    stand = obs.get("bandstand")
    if stand is None:
        return ["There is no Bandstand in this match."]
    self_ = obs["self"]
    where = f"the {stand['site']} river"
    dist = round(((self_["pos"]["x"] - stand["pos"]["x"]) ** 2 + (self_["pos"]["y"] - stand["pos"]["y"]) ** 2) ** 0.5)
    status = stand["status"]
    lines: list[str] = []
    if status == "open":
        progress = stand.get("progress") or 0
        if progress > 0:
            bar = f"Your team is {_pct(progress)} of the way to taking it"
        elif progress < 0:
            bar = f"The enemy team is {_pct(progress)} of the way to taking it"
        else:
            bar = "Nobody has made progress on it"
        n = stand.get("alliesOn") or 0
        if n == 0:
            on = "none of your team is on it"
        elif stand.get("selfOn"):
            on = "you are on it" if n == 1 else f"{n} of your team are on it, you included"
        else:
            on = f"{n} of your team {'is' if n == 1 else 'are'} on it"
        lines.append(f"The Bandstand at {where} is open, {dist} units from you. {bar} and {on}.")
        if stand.get("contested"):
            lines.append("Both teams are on it, so it is contested and nobody can take it until one side leaves.")
        river = river_rules()
        mods = river["encore"]["mods"]
        stakes = (
            f"Taking it gives your whole team Encore (+{_pct(mods['attackDamage'])} attack damage, "
            f"+{_pct(mods['moveSpeed'])} move speed for {river['encore']['durationSec']} s)"
        )
        if "gold" in self_:
            stakes += f" and {river['economy']['goldTeam']} gold each"
        lines.append(stakes + ".")
    elif status == "upcoming":
        lines.append(f"The Bandstand opens at {where} in {stand['opensInSec']} s, {dist} units from you.")
    elif status == "closed":
        lines.append(f"The Bandstand is closed; the next one opens at {where} in {stand['opensInSec']} s.")
    else:  # "done"
        lines.append("The Bandstand is done for this match; it will not open again.")

    if (self_.get("encoreSec") or 0) > 0:
        lines.append(f"You have Encore for {_more_seconds(self_['encoreSec'])}.")
    for a in obs["allies"]:
        if (a.get("encoreSec") or 0) > 0:
            lines.append(f"Ally {a['id']} has Encore for {_more_seconds(a['encoreSec'])}.")
    for e in obs["visibleEnemies"]:
        if e.get("encore"):
            lines.append(f"Enemy {e['id']} has Encore.")
    return lines


def run_prediction(client, schema: TranslatedSchema, obs: dict, targeting: str = DEFAULT_TARGETING, map_: str | dict | None = None) -> dict:
    """One systemone call, EVERY node's condition anywhere in the tree batched together (spec §2.2:
    "evaluation stays one systemone call per decision" no matter how deep the tree gets --
    `translator.collect_nodes`), then the tree-walk in Python (`translator.evaluate_schema`) --
    same posture as `rules.first_match` and as house-violet.md's own prose ("Take the FIRST rule
    that matches"), generalized to guards. For a schema with zero guards this is exactly the old
    flat first-match behavior; `all_nodes == schema.rules` in that case. The winning rule's target
    resolves under `targeting` (`target_resolve.TARGETING_RULES`). The description and the target
    are both in the schema's own vocabulary (`schema.vocab`, `vocab.py`), on the match's `map_`."""
    all_nodes = collect_nodes(schema.root)
    questions = [BoundQuestion(n.id, n.condition, {"true": n.criteria_true, "false": n.criteria_false}) for n in all_nodes]
    state = describe_observation(obs, schema.vocab, map_)
    start = time.perf_counter()
    # Which Jev door answered: `FallbackJevClient` says per call; any other client is one door.
    if hasattr(client, "ask_with_door"):
        response, door = client.ask_with_door(state, questions)
    else:
        response, door = client.ask(state, questions), getattr(client, "backend", None)
    latency_sec = time.perf_counter() - start
    answers = response.get("answers", {})
    usage = response.get("usage", {})

    per_question = {}
    bool_answers = {}
    for n in all_nodes:
        cell = answers.get(n.id)
        if cell is None or "noul" not in cell:
            raise ValueError(f"systemone response missing a noul answer for {n.id!r}: {response!r}")
        val = cell["noul"]
        answered = val > 0.5
        per_question[n.id] = {"noul": val, "answered": answered}
        bool_answers[n.id] = answered

    guard_trace: list[dict] = []
    result_action = evaluate_schema(schema, bool_answers, trace=guard_trace)
    kind, ability, selector = result_action.kind, result_action.ability, result_action.target_selector
    fired_id = next((t["fired_id"] for t in guard_trace if "fired_id" in t), None)
    guard_answers = [t for t in guard_trace if "guard_id" in t]

    target = resolve_target(selector, obs, targeting, schema.vocab, map_)
    action = {"kind": kind}
    if ability:
        action["ability"] = ability
    if target is not None:
        action["target"] = target

    input_tokens = usage.get("input_tokens") or estimate_request_tokens(state, questions)
    return {
        "action": action,
        "fired_rule": fired_id,
        "guard_answers": guard_answers,
        "per_question": per_question,
        "input_tokens": input_tokens,
        "latency_sec": latency_sec,
        "door": door,
    }


def _target_ids_match(pred_target, gt_target) -> bool | None:
    """`None` when the comparison doesn't apply (one side has no string-id target)."""
    if isinstance(pred_target, str) and isinstance(gt_target, str):
        return pred_target == gt_target
    return None


def run_pilot(pilot_name: str, pilot_text: str, schema: TranslatedSchema, client, ollama_model: str) -> dict:
    rows = []
    for scenario in all_scenarios():
        obs = build_observation(scenario, TEAM, schema.instrument)
        gt_action, gt_reply = ground_truth_action(pilot_text, obs, model=ollama_model)
        gt_kind = gt_action["kind"] if gt_action else "hold"  # unparseable reply -> the game's own hold path
        gt_target = gt_action.get("target") if gt_action else None
        gt_ability = gt_action.get("ability") if gt_action else None

        pred = run_prediction(client, schema, obs)
        pred_kind = pred["action"]["kind"]
        pred_target = pred["action"].get("target")
        pred_ability = pred["action"].get("ability")

        target_match = _target_ids_match(pred_target, gt_target)
        rows.append(
            {
                "scenario": scenario.name,
                "description": scenario.description,
                "ground_truth": {"kind": gt_kind, "target": gt_target, "ability": gt_ability, "raw_reply": gt_reply},
                "predicted": {
                    "kind": pred_kind,
                    "target": pred_target,
                    "ability": pred_ability,
                    "fired_rule": pred["fired_rule"],
                },
                "guard_answers": pred["guard_answers"],
                "kind_match": pred_kind == gt_kind,
                "ability_match": (pred_ability == gt_ability) if (pred_kind == "ability" and gt_kind == "ability") else None,
                "target_id_match": target_match,
                "input_tokens": pred["input_tokens"],
                "latency_sec": pred["latency_sec"],
            }
        )
    return {"pilot": pilot_name, "rows": rows}


def guard_diagnostics(pilot_report: dict) -> dict:
    """Phase 4's recommended addition (spec §5): a per-guard breakdown -- which guard nodes existed,
    what they answered per scenario, and whether `kind_agreement` on that scenario matched ground
    truth, split by the guard's answer. Without this, a regression concentrated in one guard's
    accuracy could hide inside an unchanged aggregate `kind_agreement` number, the same way §4.3 of
    `docs/prose-to-schema-translator.md` already showed run-to-run variance can mask what's actually
    moving. `{}` for a pilot whose schema had no guards -- there's nothing to break down."""
    by_guard: dict[str, dict] = {}
    for row in pilot_report["rows"]:
        for g in row["guard_answers"]:
            gid = g["guard_id"]
            bucket = by_guard.setdefault(gid, {"guard_id": gid, "yes": [], "no": []})
            bucket["yes" if g["answer"] else "no"].append(row["kind_match"])
    out = {}
    for gid, bucket in by_guard.items():
        yes, no = bucket["yes"], bucket["no"]
        out[gid] = {
            "n_scenarios_consulted": len(yes) + len(no),
            "answered_yes_n": len(yes),
            "answered_no_n": len(no),
            "kind_agreement_when_yes": (sum(yes) / len(yes)) if yes else None,
            "kind_agreement_when_no": (sum(no) / len(no)) if no else None,
        }
    return out


def summarize(pilot_report: dict) -> dict:
    rows = pilot_report["rows"]
    n = len(rows)
    kind_agree = sum(1 for r in rows if r["kind_match"])
    ability_rows = [r for r in rows if r["ability_match"] is not None]
    ability_agree = sum(1 for r in ability_rows if r["ability_match"])
    target_rows = [r for r in rows if r["target_id_match"] is not None]
    target_agree = sum(1 for r in target_rows if r["target_id_match"])
    latencies = sorted(r["latency_sec"] for r in rows)
    return {
        "pilot": pilot_report["pilot"],
        "n_scenarios": n,
        "kind_agreement_rate": kind_agree / n if n else None,
        "ability_agreement_rate": (ability_agree / len(ability_rows)) if ability_rows else None,
        "ability_agreement_n": len(ability_rows),
        "target_id_agreement_rate": (target_agree / len(target_rows)) if target_rows else None,
        "target_id_agreement_n": len(target_rows),
        "total_input_tokens": sum(r["input_tokens"] for r in rows),
        "mean_latency_sec": statistics.mean(latencies) if latencies else None,
        "guard_diagnostics": guard_diagnostics(pilot_report),
    }


def load_reference_schema(path: Path, pilot_file: str, instrument: str) -> TranslatedSchema:
    """Loads a hand-authored schema (same JSON shape `translate_pilot` produces -- see
    `parse_schema`) instead of calling the translator, so the SAME downstream pipeline (rule
    cascade, target resolution, live Jev call, comparison against qwen ground truth) can measure a
    human(-equivalent) reading of the prose -- the ceiling the translator is judged against. An
    optional top-level `_provenance` string is ignored by `parse_schema` (not one of its fields)."""
    raw_json = json.loads(path.read_text(encoding="utf-8"))
    return parse_schema(raw_json, pilot_file, instrument, raw_text=f"reference schema loaded from {path}")


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--live", action="store_true", help="call real Jev via Cloudflare Workers AI; default is a stub Jev (Ollama half is always real)")
    p.add_argument("--model", default=WORKERS_AI_MODEL, help="Jev model id (workers-ai)")
    p.add_argument("--cloudflare-token-env", default="CLOUDFLARE_API_TOKEN")
    p.add_argument("--ollama-model", default="qwen3.5:9b", help="model for both translation and ground truth")
    p.add_argument("--pilots", nargs="*", default=list(PILOTS), choices=list(PILOTS))
    p.add_argument("--schemas-out", default=None, help="directory to write translated schemas (markdown + json) to")
    p.add_argument(
        "--reference-schemas-dir",
        default=None,
        help="directory containing hand-authored reference-schema-<pilot>.json files -- if given, "
        "these are used INSTEAD OF calling the translator (no Ollama translation call), to measure "
        "the ceiling a correct translation can score against qwen ground truth",
    )
    p.add_argument("--out", default=None, help="write the full JSON report here")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.live:
        token = resolve_workers_ai_token(args.cloudflare_token_env)
        client = WorkersAIClient(token, model=args.model)
    else:
        client = DumbStubJevClient()

    schemas_dir = Path(args.schemas_out) if args.schemas_out else None
    if schemas_dir:
        schemas_dir.mkdir(parents=True, exist_ok=True)

    reference_dir = Path(args.reference_schemas_dir) if args.reference_schemas_dir else None

    pilot_reports = []
    for name in args.pilots:
        pilot_path = PILOTS[name]
        pilot_text = pilot_path.read_text(encoding="utf-8")
        primary, ultimate = ABILITIES[name]
        if reference_dir:
            ref_path = reference_dir / f"reference-schema-{name}.json"
            print(f"loading reference schema for {name} from {ref_path} ...", file=sys.stderr)
            schema = load_reference_schema(ref_path, f"prompts/pilots/{name}.md", name)
        else:
            print(f"translating {name}.md ...", file=sys.stderr)
            schema = translate_pilot(
                pilot_text, f"prompts/pilots/{name}.md", name, primary, ultimate, model=args.ollama_model
            )
        print(f"  -> {len(schema.rules)} rules", file=sys.stderr)
        if schemas_dir:
            (schemas_dir / f"{name}.md").write_text(render_markdown(schema), encoding="utf-8")
            (schemas_dir / f"{name}.json").write_text(
                json.dumps(
                    {
                        "pilot_file": schema.pilot_file,
                        "instrument": schema.instrument,
                        "rules": [r.__dict__ for r in schema.rules],
                        "default_action": {
                            "kind": schema.default_kind,
                            "ability": schema.default_ability,
                            "target_selector": schema.default_target_selector,
                        },
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

        print(f"running {len(all_scenarios())} scenarios for {name} ...", file=sys.stderr)
        report = run_pilot(name, pilot_text, schema, client, args.ollama_model)
        pilot_reports.append(report)

    summaries = [summarize(r) for r in pilot_reports]
    all_rows = [row for r in pilot_reports for row in r["rows"]]
    overall_n = len(all_rows)
    overall_kind_agree = sum(1 for r in all_rows if r["kind_match"])
    total_input_tokens = sum(r["input_tokens"] for r in all_rows)

    out = {
        "mode": f"live (workers-ai, model={args.model})" if args.live else "dry-run (stub Jev, no network)",
        "schema_source": f"reference ({args.reference_schemas_dir})" if reference_dir else "translator",
        "ollama_model": args.ollama_model,
        "pilots": args.pilots,
        "n_scenarios_per_pilot": len(all_scenarios()),
        "per_pilot": summaries,
        "overall_kind_agreement_rate": overall_kind_agree / overall_n if overall_n else None,
        "overall_n": overall_n,
        "total_input_tokens": total_input_tokens,
        "estimated_cost_usd": estimate_cost_usd(total_input_tokens),
        "detail": pilot_reports,
    }
    text = json.dumps(out, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "detail"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
