#!/usr/bin/env python3
"""A `systemone` client for TypeSafe AI's Jev, built from TypeSafe's own docs -- not invented.
Sources, all fetched 2026-09-22 (see `docs/jev-decision-model-research.md`, PR #20, branch
`docs/jev-preview-research`, for the fuller research writeup this harness implements one test from):

  https://docs.typesafe.ai/api.md            request/response shape, HTTP method, auth
  https://docs.typesafe.ai/models            `state` accepts string | JSON object | array of text
  https://docs.typesafe.ai/sdk/python        Python SDK: `client.system_one(state=, questions=)`,
                                              `Noul`/`Choice`/`Score` question types
  https://typesafe.ai/blog/introducing-system-one-models-and-jev   "state is ... a short, dense,
                                              and detailed paragraph" (see serializer.py)
  https://pydantic.dev/docs/ai/models/typesafe/   third-party integration, confirms the wire shape
                                              independently of TypeSafe's own claims

Confirmed wire shape:

    POST https://api.typesafe.ai/v1/systemone
    Authorization: Bearer <API_KEY>
    {
      "state": <string | object | array>,
      "model": <string>,
      "questions": {
        "<id>": {"type": "noul", "instructions": "...", "criteria"?: {"true": "...", "false": "..."}}
      }
    }

    -> 200 {
      "model": "...",
      "answers": {"<id>": {"noul": 0.0-1.0}},
      "usage": {"input_tokens": int, "output_tokens": int}
    }

This harness only ever asks `noul` questions (see `rules.py`), so `Choice`/`Score` shapes are not
implemented here -- there was nothing in this test that needed them.

WHAT THE DOCS DO NOT SAY, flagged rather than guessed: no fetched page gave a concrete example
`model` value for the raw HTTP endpoint. The closest evidence is Pydantic AI's own integration,
which addresses Jev as `"typesafe:jev-latest"`, and Cloudflare Workers AI's catalog entry, which
names a pinned version `jev-1.13.0`. `DEFAULT_MODEL` below picks `"jev-latest"` as the plainest
reading of the first of those two -- inferred, not confirmed by TypeSafe's own reference, and
overridable with `--model`.
"""
from __future__ import annotations

import json
import os
import random
import urllib.error
import urllib.request

API_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"  # inferred, not confirmed -- see module docstring
PRICE_IN_PER_M = 0.042  # USD per million input tokens (TypeSafe blog + docs, 2026-09-15/22)
PRICE_OUT_PER_M = 0.0  # output tokens are free ("too cheap to meter", not a permanent commitment)


class SystemOneError(RuntimeError):
    pass


def resolve_api_key(env_var: str = "TYPESAFE_API_KEY") -> str:
    """Mirrors `tools/model_server.py::resolve_api_key` exactly: refuse with a clear message
    rather than silently doing nothing or falling back to a stub. Never logs the key itself."""
    key = os.environ.get(env_var)
    if not key:
        raise SystemExit(
            f"{env_var} is not set in the environment; refusing to make a live Jev call without a "
            f"key. There is no account on this host (console.typesafe.ai is Ceryce's to create) -- "
            f"drop --live for a dry-run against the stub client instead, or set {env_var} once a "
            f"key exists."
        )
    return key


def build_request_body(state: str, questions: list, model: str = DEFAULT_MODEL) -> dict:
    """The exact `{state, model, questions}` body `POST /v1/systemone` expects. `questions` is a
    list of `rules.Question` / `rules.BoundQuestion` (only `.id`/`.instructions`/`.criteria` are
    read, so either works)."""
    return {
        "state": state,
        "model": model,
        "questions": {
            q.id: {"type": "noul", "instructions": q.instructions, "criteria": q.criteria}
            for q in questions
        },
    }


class SystemOneClient:
    """The real client. Never constructed by a dry run -- see `StubSystemOneClient`."""

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, timeout: float = 30.0):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def ask(self, state: str, questions: list) -> dict:
        body = build_request_body(state, questions, self.model)
        req = urllib.request.Request(
            API_URL,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "replace")
            raise SystemOneError(f"systemone {err.code}: {detail[:300]}") from err
        except urllib.error.URLError as err:
            raise SystemOneError(f"systemone request failed: {err}") from err


class StubSystemOneClient:
    """Answers every question without any network call, so the whole pipeline -- serialization,
    the systemone request shape, response parsing, rule composition, comparison, reporting -- runs
    and is provably clean before a real key ever exists. This is a plumbing check, not a
    suitability signal: it says nothing about whether Jev is actually good at this task, only that
    the harness around it works.

    Answers the ground-truth condition correctly with probability `1 - error_rate`, and flips it
    (with a correspondingly weak, unconfident probability) otherwise, so a dry run exercises both
    the "agree" and "disagree" paths through the comparison/report code -- a stub that was always
    right would leave the disagreement-reporting code untested."""

    def __init__(self, error_rate: float = 0.1, seed: int = 20260922):
        self.error_rate = error_rate
        self._rng = random.Random(seed)
        self.calls = 0

    def ask(self, state: str, questions: list) -> dict:
        # `state` itself is not read -- the stub answers from each question's ground truth, not
        # from reading the paragraph -- but its length still feeds the token estimate below, the
        # same way a real call would be billed for the state text it sent.
        self.calls += 1
        answers = {}
        for q in questions:
            correct = q.ground_truth_value
            wrong = self._rng.random() < self.error_rate
            value = (1 - correct) if wrong else correct
            # A confident answer sits near 0 or 1; a wrong stub answer is deliberately unconfident,
            # matching the real risk this harness tests for (wrong AND confident is the bad case).
            noise = self._rng.uniform(0.0, 0.15 if not wrong else 0.35)
            noul = min(1.0, max(0.0, value + (noise if value < 0.5 else -noise)))
            answers[q.id] = {"noul": round(noul, 4)}
        input_tokens = estimate_request_tokens(state, questions)
        return {
            "model": "stub-jev",
            "answers": answers,
            "usage": {"input_tokens": input_tokens, "output_tokens": 0},
        }


def estimate_tokens(char_count: int) -> int:
    """~4 chars/token for English prose -- consistent with this repo's own measurement
    (`runs/house-prompt-2026-09-21.md`: "a whole tick is ... median 3,358 [chars] ~= 900 tokens",
    3.7 chars/token). A rough estimate, not a tokenizer; good enough for a cost order-of-magnitude."""
    return max(1, char_count // 4)


def estimate_request_tokens(state: str, questions: list) -> int:
    """Estimated input tokens for one systemone call: the state paragraph plus every question's
    `instructions` and `criteria` text -- the whole request body is what a real call bills for,
    not just the instructions line. Used as the fallback whenever a response doesn't carry a real
    `usage.input_tokens` (the stub never does; a live response always should)."""
    total_chars = len(state)
    for q in questions:
        total_chars += len(q.instructions)
        total_chars += sum(len(k) + len(v) for k, v in q.criteria.items())
    return estimate_tokens(total_chars)


def estimate_cost_usd(input_tokens: int) -> float:
    return input_tokens / 1_000_000 * PRICE_IN_PER_M
