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

TWO LIVE BACKENDS. TypeSafe paused direct Jev signups on 2026-09-22 (no `TYPESAFE_API_KEY` exists,
and none is expected to). `SystemOneClient` above talks to TypeSafe's own endpoint directly and
needs one anyway, for whenever that changes. `WorkersAIClient` below is what `--live` actually uses
today: Cloudflare Workers AI resells the same Jev model through its account-scoped `/ai/run`
endpoint, authenticated with a Cloudflare API token (read from `$CLOUDFLARE_API_TOKEN`, or failing
that from wrangler's own OAuth token on disk -- see `resolve_workers_ai_token`). Both clients expose
the same `ask(state, questions) -> {"model", "answers", "usage"}` contract; `WorkersAIClient` just
unwraps Cloudflare's extra envelope first. Verified working 2026-09-23 12:27 CT against account
`fd8ba3abbeadc6dcca7774a1a4a9a8d0`; the per-model path form (`/ai/run/typesafe/jev`) 400s with "No
route for that URI" -- use the generic `/ai/run` with `"model"` in the body instead.
"""
from __future__ import annotations

import json
import os
import random
import time
import urllib.error
import urllib.request
from pathlib import Path

API_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"  # inferred, not confirmed -- see module docstring
PRICE_IN_PER_M = 0.042  # USD per million input tokens (TypeSafe blog + docs, 2026-09-15/22)
PRICE_OUT_PER_M = 0.0  # output tokens are free ("too cheap to meter", not a permanent commitment)

CLOUDFLARE_ACCOUNT_ID = "fd8ba3abbeadc6dcca7774a1a4a9a8d0"
WORKERS_AI_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run"
WORKERS_AI_MODEL = "typesafe/jev"


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


def _questions_wire(questions: list) -> dict:
    """The `{"<id>": {"type": "noul", "instructions", "criteria"}}` shape both wire formats embed.
    `questions` is a list of `rules.Question` / `rules.BoundQuestion` (only `.id`/`.instructions`/
    `.criteria` are read, so either works)."""
    return {
        q.id: {"type": "noul", "instructions": q.instructions, "criteria": q.criteria}
        for q in questions
    }


def build_request_body(state, questions: list, model: str = DEFAULT_MODEL) -> dict:
    """The exact `{state, model, questions}` body `POST /v1/systemone` expects."""
    return {"state": state, "model": model, "questions": _questions_wire(questions)}


def build_workers_ai_body(state, questions: list, model: str = WORKERS_AI_MODEL) -> dict:
    """The exact body Cloudflare Workers AI's `/ai/run` expects for `typesafe/jev`: `model` at the
    top level, everything TypeSafe itself would read nested under `input` (no `model` inside
    `input` -- Workers AI already knows which model it's routing to)."""
    return {"model": model, "input": {"state": state, "questions": _questions_wire(questions)}}


def _open_with_retry(req: urllib.request.Request, timeout: float, label: str, max_retries: int = 5) -> bytes:
    """POSTs `req`, retrying on a 429 (honoring `Retry-After` when the response sends one) or a
    transient connection/read-timeout error, with exponential backoff -- discovered live 2026-09-23:
    a read timeout raises a bare `TimeoutError`/`OSError`, NOT `urllib.error.URLError` (only
    `Request.request()`'s failures get wrapped; `getresponse()`'s don't), so both are caught here
    explicitly rather than assuming `URLError` covers every network failure. One flaky request
    should not cost a 263-snapshot run its data point -- 'don't skip it' is a hard requirement here,
    not a nicety. Raises `SystemOneError` only after `max_retries` attempts are exhausted."""
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < max_retries:
                retry_after = err.headers.get("Retry-After") if err.headers else None
                wait = float(retry_after) if retry_after and retry_after.strip().isdigit() else 2**attempt
                time.sleep(wait)
                attempt += 1
                continue
            detail = err.read().decode("utf-8", "replace")
            raise SystemOneError(f"{label} {err.code}: {detail[:300]}") from err
        except (urllib.error.URLError, OSError) as err:
            if attempt < max_retries:
                time.sleep(2**attempt)
                attempt += 1
                continue
            raise SystemOneError(f"{label} request failed after {max_retries} retries: {err}") from err


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
        return json.loads(_open_with_retry(req, self.timeout, "systemone").decode("utf-8"))


def _wrangler_config_paths() -> list[Path]:
    """Where wrangler stashes its OAuth token, in lookup order. `APPDATA` is Windows-only (the host
    this harness runs on); `~/.wrangler` is wrangler's fallback on every platform."""
    paths = []
    appdata = os.environ.get("APPDATA")
    if appdata:
        paths.append(Path(appdata) / "xdg.config" / ".wrangler" / "config" / "default.toml")
    paths.append(Path.home() / ".wrangler" / "config" / "default.toml")
    return paths


def _read_toml_string_value(path: Path, key: str) -> str | None:
    """Pulls one `key = "value"` line out of a TOML file without a TOML dependency -- wrangler's
    config is flat enough that a line scan is exact, and this repo has no `tomllib`-free
    requirement to work around otherwise. Returns `None` if the file or key doesn't exist."""
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith(f"{key} ") or line.startswith(f"{key}="):
            _, _, rhs = line.partition("=")
            return rhs.strip().strip('"')
    return None


def resolve_workers_ai_token(env_var: str = "CLOUDFLARE_API_TOKEN") -> str:
    """`$CLOUDFLARE_API_TOKEN` first, then wrangler's own OAuth token on disk (`wrangler login`
    already put one there). Refuses clearly rather than silently doing nothing -- mirrors
    `resolve_api_key`'s posture. Never logs or returns the token in an error message."""
    token = os.environ.get(env_var)
    if token:
        return token
    for path in _wrangler_config_paths():
        token = _read_toml_string_value(path, "oauth_token")
        if token:
            return token
    tried = ", ".join(str(p) for p in _wrangler_config_paths())
    raise SystemExit(
        f"No Cloudflare API token found: {env_var} is not set and no oauth_token was found in "
        f"wrangler's config ({tried}). Run `wrangler login`, or set {env_var} directly."
    )


class WorkersAIClient:
    """Talks to Jev through Cloudflare Workers AI's `/ai/run` endpoint instead of TypeSafe's own
    (see the module docstring for why). Same `ask()` contract as `SystemOneClient` -- callers never
    need to know which transport they're on."""

    def __init__(
        self,
        api_token: str,
        account_id: str = CLOUDFLARE_ACCOUNT_ID,
        model: str = WORKERS_AI_MODEL,
        timeout: float = 30.0,
    ):
        self.api_token = api_token
        self.account_id = account_id
        self.model = model
        self.timeout = timeout
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run"

    def ask(self, state, questions: list) -> dict:
        body = build_workers_ai_body(state, questions, self.model)
        req = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_token}",
            },
        )
        payload = json.loads(_open_with_retry(req, self.timeout, "workers-ai").decode("utf-8"))
        return unwrap_workers_ai_response(payload)


def unwrap_workers_ai_response(payload: dict) -> dict:
    """Cloudflare wraps the TypeSafe-shaped `{model, answers, usage}` body at `result.result`
    (verified 2026-09-23; see the module docstring). Raises on `success: false` or a shape that
    doesn't have `result.result`, same posture as `SystemOneClient` raising on a non-2xx."""
    if not payload.get("success"):
        raise SystemOneError(f"workers-ai call did not succeed: {payload.get('errors')!r}")
    result = payload.get("result")
    if not isinstance(result, dict) or "result" not in result:
        raise SystemOneError(f"workers-ai response missing result.result: {payload!r}")
    return result["result"]


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


def estimate_request_tokens(state, questions: list) -> int:
    """Estimated input tokens for one systemone call: the state paragraph plus every question's
    `instructions` and `criteria` text -- the whole request body is what a real call bills for,
    not just the instructions line. Used as the fallback whenever a response doesn't carry a real
    `usage.input_tokens` (the stub never does; a live response always should). `state` may be the
    prose string or the structured-JSON alternative (`serializer.state_object`) -- either is
    measured as the text actually sent over the wire."""
    state_text = state if isinstance(state, str) else json.dumps(state)
    total_chars = len(state_text)
    for q in questions:
        total_chars += len(q.instructions)
        total_chars += sum(len(k) + len(v) for k, v in q.criteria.items())
    return estimate_tokens(total_chars)


def estimate_cost_usd(input_tokens: int) -> float:
    return input_tokens / 1_000_000 * PRICE_IN_PER_M
