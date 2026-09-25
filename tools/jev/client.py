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

Long-running servers use `resolve_workers_ai_token_provider` instead of the one-shot
`resolve_workers_ai_token`: wrangler's OAuth token lives about an hour, so the provider renews it
before it expires and `WorkersAIClient` retries a 401 once after a forced renewal (see "token
providers" below).
"""
from __future__ import annotations

import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"  # inferred, not confirmed -- see module docstring
PRICE_IN_PER_M = 0.042  # USD per million input tokens (TypeSafe blog + docs, 2026-09-15/22)
PRICE_OUT_PER_M = 0.0  # output tokens are free ("too cheap to meter", not a permanent commitment)

CLOUDFLARE_ACCOUNT_ID = "fd8ba3abbeadc6dcca7774a1a4a9a8d0"
WORKERS_AI_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run"
WORKERS_AI_MODEL = "typesafe/jev"


class SystemOneError(RuntimeError):
    """`status` is the HTTP status when the failure was an HTTP error response, else `None` -- so
    `WorkersAIClient` can tell a 401 (token expired/revoked: refresh and retry) from anything else."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


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
            raise SystemOneError(f"{label} {err.code}: {detail[:300]}", status=err.code) from err
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


# --- token providers ------------------------------------------------------------------------------
# Wrangler's OAuth access token lives about an hour, and `wrangler whoami` only renews one that has
# ALREADY expired (runs/jev-vs-qwen32b-2026-09-23.md) -- so a long-running server that read the token
# once at startup started 401ing mid-match. A provider hands `WorkersAIClient` a token per call and
# renews it before it runs out.

WRANGLER_OAUTH_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7"  # wrangler's own public client id
WRANGLER_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token"  # wrangler's default auth domain
DEFAULT_REFRESH_MARGIN_SEC = 900.0  # one full 600 s jam match + 300 s slack


def _log(msg: str) -> None:
    sys.stderr.write(f"[jev-token] {msg}\n")
    sys.stderr.flush()


class StaticToken:
    """`$CLOUDFLARE_API_TOKEN` -- a dashboard-issued API token that doesn't expire on its own, so
    there is nothing to renew; `force_refresh` just hands the same token back."""

    source = "env"

    def __init__(self, value: str):
        self._value = value

    def token(self) -> str:
        return self._value

    def force_refresh(self) -> str:
        return self._value

    def status(self) -> dict:
        return {"token_source": self.source, "token_expires_in_sec": None}


def _parse_expiry(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _format_expiry(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def refresh_request(refresh_token: str) -> urllib.request.Request:
    """The same `grant_type=refresh_token` POST wrangler itself makes (read from wrangler's
    `exchangeRefreshTokenForAccessToken`). The explicit User-Agent is load-bearing: found live
    2026-09-25, dash.cloudflare.com answers Python-urllib's default one with `403 error code: 1010`
    (browser-signature block) before the OAuth server ever sees the request."""
    data = urllib.parse.urlencode(
        {"grant_type": "refresh_token", "refresh_token": refresh_token, "client_id": WRANGLER_OAUTH_CLIENT_ID}
    ).encode("utf-8")
    return urllib.request.Request(
        WRANGLER_TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": "promptlane-jev/1"},
    )


def exchange_refresh_token(refresh_token: str, timeout: float = 30.0) -> dict:
    """POSTs `refresh_request`. Returns `{access_token, expires_in, refresh_token?, scope?}`. Never
    puts a token in an error message."""
    req = refresh_request(refresh_token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raise SystemOneError(f"oauth refresh {err.code}", status=err.code) from err
    except (urllib.error.URLError, OSError) as err:
        raise SystemOneError(f"oauth refresh request failed: {err}") from err
    if "access_token" not in payload:
        raise SystemOneError(f"oauth refresh response had no access_token (keys: {sorted(payload)})")
    return payload


class WranglerOAuthToken:
    """Wrangler's OAuth token on disk, renewed `margin_sec` before it expires and written back to
    wrangler's own config file. Writing back is required, not a courtesy: Cloudflare rotates the
    refresh token on every exchange, so a renewal that kept the new pair to itself would log
    wrangler (and every other process reading that file) out.

    Before exchanging, it re-reads the file: another process (wrangler, a sibling server) may have
    renewed already, and exchanging the stale refresh token would then fail. Thread-safe -- the
    house server is a ThreadingHTTPServer."""

    source = "wrangler-oauth"

    def __init__(self, path: Path, margin_sec: float = DEFAULT_REFRESH_MARGIN_SEC, exchange=exchange_refresh_token, clock=time.time):
        self.path = Path(path)
        self.margin_sec = margin_sec
        self._exchange = exchange
        self._clock = clock
        self._lock = threading.Lock()
        self._state = self._read()
        if not self._state["oauth_token"]:
            raise SystemExit(f"no oauth_token in {self.path}; run `wrangler login`")

    def _read(self) -> dict:
        return {
            "oauth_token": _read_toml_string_value(self.path, "oauth_token"),
            "refresh_token": _read_toml_string_value(self.path, "refresh_token"),
            "expires_at": _parse_expiry(_read_toml_string_value(self.path, "expiration_time")),
        }

    def _expiring(self, state: dict) -> bool:
        # No recorded expiry -> treat as expiring, so we renew rather than trust an unknown.
        return state["expires_at"] is None or state["expires_at"] - self._clock() < self.margin_sec

    def _write(self, state: dict, scope: str | None) -> None:
        values = {
            "oauth_token": state["oauth_token"],
            "expiration_time": _format_expiry(state["expires_at"]),
            "refresh_token": state["refresh_token"],
        }
        lines, seen = [], set()
        for line in self.path.read_text(encoding="utf-8").splitlines():
            key = line.split("=", 1)[0].strip()
            if key in values:
                lines.append(f'{key} = "{values[key]}"')
                seen.add(key)
            elif key == "scopes" and scope:
                lines.append("scopes = [ " + ", ".join(f'"{s}"' for s in scope.split()) + " ]")
            else:
                lines.append(line)
        for key in values:
            if key not in seen:
                lines.append(f'{key} = "{values[key]}"')
        tmp = self.path.with_suffix(self.path.suffix + ".jev-tmp")
        tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.replace(tmp, self.path)

    def _refresh_locked(self, reason: str, force: bool) -> None:
        disk = self._read()
        if disk["oauth_token"] and disk["oauth_token"] != self._state["oauth_token"] and not self._expiring(disk):
            self._state = disk
            _log(f"picked up a token another process renewed ({reason}); expires in {self.expires_in():.0f}s")
            return
        if not force and not self._expiring(disk):
            self._state = disk
            return
        if not disk["refresh_token"]:
            raise SystemOneError(f"cannot renew: no refresh_token in {self.path}; run `wrangler login`")
        try:
            payload = self._exchange(disk["refresh_token"])
        except SystemOneError:
            again = self._read()  # lost a race with another renewer? its fresh pair is on disk now
            if again["oauth_token"] != disk["oauth_token"] and not self._expiring(again):
                self._state = again
                _log(f"renewal raced another process; using its token ({reason})")
                return
            _log(f"!!! TOKEN RENEWAL FAILED ({reason}) -- run `npx wrangler login`")
            raise
        new = {
            "oauth_token": payload["access_token"],
            "refresh_token": payload.get("refresh_token") or disk["refresh_token"],
            "expires_at": self._clock() + float(payload.get("expires_in", 3600)),
        }
        self._write(new, payload.get("scope"))
        self._state = new
        _log(f"renewed wrangler oauth token ({reason}); expires in {self.expires_in():.0f}s")

    def expires_in(self) -> float | None:
        exp = self._state["expires_at"]
        return None if exp is None else exp - self._clock()

    def token(self) -> str:
        with self._lock:
            if self._expiring(self._state):
                left = self.expires_in()
                self._refresh_locked(f"expires in {left:.0f}s < margin {self.margin_sec:.0f}s" if left is not None else "no expiry recorded", force=False)
            return self._state["oauth_token"]

    def force_refresh(self) -> str:
        with self._lock:
            self._refresh_locked("forced after a 401", force=True)
            return self._state["oauth_token"]

    def status(self) -> dict:
        with self._lock:
            left = self.expires_in()
        return {"token_source": self.source, "token_expires_in_sec": None if left is None else round(left)}


def resolve_workers_ai_token_provider(env_var: str = "CLOUDFLARE_API_TOKEN", margin_sec: float = DEFAULT_REFRESH_MARGIN_SEC):
    """Same lookup order as `resolve_workers_ai_token`, but returns a provider: `StaticToken` for
    `$CLOUDFLARE_API_TOKEN` (preferred on jam day -- it doesn't expire), else a self-renewing
    `WranglerOAuthToken` over wrangler's config file."""
    token = os.environ.get(env_var)
    if token:
        return StaticToken(token)
    for path in _wrangler_config_paths():
        if _read_toml_string_value(path, "oauth_token"):
            return WranglerOAuthToken(path, margin_sec=margin_sec)
    resolve_workers_ai_token(env_var)  # raises the same clear SystemExit
    raise AssertionError("unreachable")


class WorkersAIClient:
    """Talks to Jev through Cloudflare Workers AI's `/ai/run` endpoint instead of TypeSafe's own
    (see the module docstring for why). Same `ask()` contract as `SystemOneClient` -- callers never
    need to know which transport they're on.

    `api_token` is a plain string or a token provider (`StaticToken`/`WranglerOAuthToken`). The
    token is fetched per call, so a provider can renew it before it expires; a 401 anyway (revoked,
    clock skew) forces one renewal and one retry before the error propagates."""

    def __init__(
        self,
        api_token,
        account_id: str = CLOUDFLARE_ACCOUNT_ID,
        model: str = WORKERS_AI_MODEL,
        timeout: float = 30.0,
    ):
        self.tokens = StaticToken(api_token) if isinstance(api_token, str) else api_token
        self.account_id = account_id
        self.model = model
        self.timeout = timeout
        self.url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run"

    @property
    def api_token(self) -> str:
        return self.tokens.token()

    def _post(self, body: dict, token: str) -> dict:
        req = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
        )
        return json.loads(_open_with_retry(req, self.timeout, "workers-ai").decode("utf-8"))

    def ask(self, state, questions: list) -> dict:
        body = build_workers_ai_body(state, questions, self.model)
        try:
            payload = self._post(body, self.tokens.token())
        except SystemOneError as err:
            if err.status != 401:
                raise
            _log("workers-ai answered 401 -- forcing a token renewal and retrying once")
            payload = self._post(body, self.tokens.force_refresh())
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
