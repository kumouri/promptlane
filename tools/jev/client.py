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

Re-read 2026-09-30 (`docs/jev-decision-model-research.md` §3, `runs/jev-backend-parity-2026-09-30.md`):

  https://docs.typesafe.ai/api.md            unchanged; a noul answer is `{"type": "noul", "noul": p}`
                                              (no `confidence` -- that is choice/score only); errors
                                              401 bad key, 422 validation, 429 rate limit, 529 overloaded
  https://docs.typesafe.ai/models.md         `jev-1.13.0`, aliases `jev-latest` (stable) and
                                              `jev-preview`; $0.042/M input, output free; 40 req/s and
                                              100K tokens/s per account ("adjusting dynamically")
  https://docs.typesafe.ai/sdk/python/api/retries.md   the SDK retries 408, 429 and every 5xx,
                                              honoring `Retry-After` / `retry-after-ms`

So `DEFAULT_MODEL = "jev-latest"` is now TypeSafe's own documented alias, no longer an inference.

TWO LIVE BACKENDS, one contract, picked with `--jev-backend` (`make_jev_client`):

  workers-ai (default, `WorkersAIClient`)  Cloudflare Workers AI resells the same Jev through its
      account-scoped `/ai/run`, authenticated with a Cloudflare token (`$CLOUDFLARE_API_TOKEN`, else
      wrangler's own OAuth token on disk, renewed before it expires -- see "token providers").
      Verified 2026-09-23 against account `fd8ba3abbeadc6dcca7774a1a4a9a8d0`; the per-model path
      (`/ai/run/typesafe/jev`) 400s with "No route for that URI", so `"model"` goes in the body.
  typesafe (`SystemOneClient`)  TypeSafe's own `/v1/systemone`, direct. TypeSafe paused signups
      2026-09-22 and had reopened them by 2026-09-30. The key is `$PROMPTLANE_JEV_API_KEY` (or the
      SDK's own `$TYPESAFE_API_KEY`); on Windows a User-scope variable is read from the registry if
      this process's environment doesn't carry it (`resolve_api_key`). An API key does not expire,
      so this path has no token renewal at all. The key never appears in an error (`redact`).

Both return `ask(state, questions) -> {"model", "answers", "usage"}`; `WorkersAIClient` unwraps
Cloudflare's extra envelope first. The game-facing servers never see which one answered, except
as `jev_backend` in `/health`. `DEFAULT_JEV_BACKEND` is the one line that flips the default.

Long-running servers use `resolve_workers_ai_token_provider` instead of the one-shot
`resolve_workers_ai_token`: wrangler's OAuth token lives about an hour, so the provider renews it
before it expires, and `WorkersAIClient` retries a 401 once -- renewing first only if the token that
failed is still the current, live one, so concurrent 401s cost one renewal, not one each (see
"token providers" below).
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
DEFAULT_MODEL = "jev-latest"  # docs.typesafe.ai/models, 2026-09-30: the stable alias (jev-1.13.0)
PRICE_IN_PER_M = 0.042  # USD per million input tokens -- TypeSafe and Workers AI list the same price
PRICE_OUT_PER_M = 0.0  # output tokens are free ("too cheap to meter", not a permanent commitment)

JEV_BACKENDS = ("workers-ai", "typesafe")
DEFAULT_JEV_BACKEND = "workers-ai"  # Ceryce's call to flip -- see runs/jev-backend-parity-2026-09-30.md
JEV_API_KEY_ENVS = ("PROMPTLANE_JEV_API_KEY", "TYPESAFE_API_KEY")  # promptlane's own name, then the SDK's
# What TypeSafe's own SDK retries (docs.typesafe.ai/sdk/python/api/retries.md, 2026-09-30). The
# Workers AI path keeps retrying 429 only, exactly as before.
TYPESAFE_RETRY_STATUSES = frozenset({408, 429, *range(500, 600)})

CLOUDFLARE_ACCOUNT_ID = "fd8ba3abbeadc6dcca7774a1a4a9a8d0"
WORKERS_AI_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run"
WORKERS_AI_MODEL = "typesafe/jev"


class SystemOneError(RuntimeError):
    """`status` is the HTTP status when the failure was an HTTP error response, else `None` -- so
    `WorkersAIClient` can tell a 401 (token expired/revoked: refresh and retry) from anything else."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _windows_user_env(name: str) -> str | None:
    """A Windows User-scope environment variable read straight from the registry
    (`HKCU\\Environment`), for a process started before the variable was set: a shell only sees
    the User variables that existed when it launched. `None` off Windows or when unset."""
    try:
        import winreg
    except ImportError:
        return None
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
    except OSError:
        return None
    return value or None


def resolve_api_key(env_var: str | None = None) -> str:
    """The TypeSafe API key: `env_var` if given, else each of `JEV_API_KEY_ENVS` in order, each
    looked up in this process's environment first and then in Windows' User scope. Refuses with a
    clear message rather than silently doing nothing or falling back to a stub (mirrors
    `tools/model_server.py::resolve_api_key`). Never logs the key itself."""
    names = (env_var,) if env_var else JEV_API_KEY_ENVS
    for name in names:
        key = os.environ.get(name) or _windows_user_env(name)
        if key:
            return key
    raise SystemExit(
        f"{' / '.join(names)} is not set; refusing to make a live Jev call without a TypeSafe key. "
        f"Set it (a Windows User variable is picked up from the registry too), use --jev-backend "
        f"workers-ai, or drop --live for a dry-run against the stub client."
    )


def redact(text: str, secret: str | None) -> str:
    """`text` with every occurrence of `secret` replaced -- for anything that might reach a log."""
    return text.replace(secret, "[REDACTED]") if secret else text


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


def _retry_after_sec(headers) -> float | None:
    """`retry-after-ms` (what TypeSafe's SDK reads first) or a whole-seconds `Retry-After`."""
    if not headers:
        return None
    ms = headers.get("retry-after-ms")
    if ms:
        try:
            return float(ms) / 1000
        except ValueError:
            pass
    ra = headers.get("Retry-After")
    return float(ra) if ra and ra.strip().isdigit() else None


def _open_with_retry(
    req: urllib.request.Request,
    timeout: float,
    label: str,
    max_retries: int = 5,
    retry_statuses=frozenset({429}),
) -> bytes:
    """POSTs `req`, retrying on a status in `retry_statuses` (default: 429 only), honoring
    `Retry-After` when the response sends one, or on a
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
            if err.code in retry_statuses and attempt < max_retries:
                wait = _retry_after_sec(err.headers)
                time.sleep(2**attempt if wait is None else wait)
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
    """TypeSafe's own endpoint, direct (`--jev-backend typesafe`). Never constructed by a dry run --
    see `StubSystemOneClient`. An API key doesn't expire, so there is nothing to renew; a 401 means
    a bad or revoked key and propagates. Retries what TypeSafe's own SDK retries
    (`TYPESAFE_RETRY_STATUSES`: 408, 429, and 5xx including 529 "overloaded"). Every error message
    has the key redacted, and `repr` leaves it out."""

    backend = "typesafe"

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, timeout: float = 30.0, url: str = API_URL):
        self._api_key = api_key
        self.model = model
        self.timeout = timeout
        self.url = url

    def __repr__(self) -> str:
        return f"SystemOneClient(model={self.model!r}, url={self.url!r})"

    def ask(self, state: str, questions: list) -> dict:
        body = build_request_body(state, questions, self.model)
        req = urllib.request.Request(
            self.url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
                "User-Agent": "promptlane-jev/1",
            },
        )
        try:
            raw = _open_with_retry(req, self.timeout, "typesafe", retry_statuses=TYPESAFE_RETRY_STATUSES)
        except SystemOneError as err:
            raise SystemOneError(redact(str(err), self._api_key), status=err.status) from None
        return json.loads(raw.decode("utf-8"))

    def status(self) -> dict:
        return {"jev_backend": self.backend, "token_source": "typesafe-api-key", "token_expires_in_sec": None, "token_renewals": 0}


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
#
# A NEW TOKEN IS NOT LIVE YET. Measured 2026-09-30 (runs/jev-client-renew-2026-09-30.md): a freshly
# minted access token answers 401 for up to ~0.5 s after the exchange returns, while the token it
# replaced keeps answering 200 until its own expiry. Renewing on every 401 therefore fed itself --
# each renewal minted a token that 401'd the concurrent calls using it, and each of those 401s forced
# another renewal (111 renewals and 61 unanswered decisions with two matches on one server, PR #40).
# So a provider (1) keeps handing out the previous token until the new one is `warmup_sec` old,
# (2) never renews because of a 401 on a token that is already replaced or is still warming up --
# it waits out the warm-up and the caller retries with the current token -- and (3) renews at most
# once at a time per credential file (single-flight: concurrent 401s wait on one lock, then see the
# token has already changed).

WRANGLER_OAUTH_CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7"  # wrangler's own public client id
WRANGLER_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token"  # wrangler's default auth domain
DEFAULT_REFRESH_MARGIN_SEC = 900.0  # one full 600 s jam match + 300 s slack
DEFAULT_TOKEN_WARMUP_SEC = 2.0  # measured worst case ~0.5 s before a new token answers 200; x4
TOKEN_LIFETIME_SEC = 3600.0  # what Cloudflare issues; dates a token another process wrote to disk
PREVIOUS_TOKEN_MIN_LEFT_SEC = 60.0  # hand out the replaced token only if it outlives a call by this

_CREDENTIAL_LOCKS: dict[str, threading.Lock] = {}
_CREDENTIAL_LOCKS_GUARD = threading.Lock()


def _credential_lock(path: Path) -> threading.Lock:
    """One lock per credential file, shared by every provider in this process that reads it -- so
    there is only ever one renewal of a given credential in flight here. (Other processes are
    covered by `_refresh_locked` re-reading the file before exchanging.)"""
    key = os.path.normcase(str(Path(path).resolve()))
    with _CREDENTIAL_LOCKS_GUARD:
        return _CREDENTIAL_LOCKS.setdefault(key, threading.Lock())


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

    def force_refresh(self, failed: str | None = None) -> str:
        return self._value

    def status(self) -> dict:
        return {"token_source": self.source, "token_expires_in_sec": None, "token_renewals": 0}


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
    house server is a ThreadingHTTPServer -- and single-flight per credential file (see "A NEW TOKEN
    IS NOT LIVE YET" above for the warm-up handling and why a 401 alone never renews twice)."""

    source = "wrangler-oauth"

    def __init__(
        self,
        path: Path,
        margin_sec: float = DEFAULT_REFRESH_MARGIN_SEC,
        exchange=exchange_refresh_token,
        clock=time.time,
        sleep=time.sleep,
        warmup_sec: float = DEFAULT_TOKEN_WARMUP_SEC,
    ):
        self.path = Path(path)
        self.margin_sec = margin_sec
        self.warmup_sec = warmup_sec
        self._exchange = exchange
        self._clock = clock
        self._sleep = sleep
        self._lock = _credential_lock(self.path)
        self._state = self._read()
        self._previous: dict | None = None  # the token the current one replaced, while still valid
        self.renewals = 0  # exchanges this provider made
        self.renewals_avoided = 0  # 401s answered by the current token instead of a new exchange
        if not self._state["oauth_token"]:
            raise SystemExit(f"no oauth_token in {self.path}; run `wrangler login`")

    def _read(self) -> dict:
        expires_at = _parse_expiry(_read_toml_string_value(self.path, "expiration_time"))
        return {
            "oauth_token": _read_toml_string_value(self.path, "oauth_token"),
            "refresh_token": _read_toml_string_value(self.path, "refresh_token"),
            "expires_at": expires_at,
            # Not recorded on disk; Cloudflare issues hour-long tokens, so the expiry dates it. A
            # token another process minted a moment ago therefore counts as warming up here too.
            "minted_at": None if expires_at is None else expires_at - TOKEN_LIFETIME_SEC,
        }

    def _expiring(self, state: dict) -> bool:
        # No recorded expiry -> treat as expiring, so we renew rather than trust an unknown.
        return state["expires_at"] is None or state["expires_at"] - self._clock() < self.margin_sec

    def _warming(self, state: dict) -> bool:
        return state["minted_at"] is not None and self._clock() - state["minted_at"] < self.warmup_sec

    def _adopt(self, new: dict) -> None:
        """Make `new` current, keeping the one it replaces as `_previous` to hand out while `new`
        warms up (the replaced token still answers 200 until its own expiry)."""
        if new["oauth_token"] != self._state["oauth_token"]:
            self._previous = self._state
        self._state = new

    def _wait_until_live(self, state: dict) -> None:
        if state["minted_at"] is None:
            return
        left = state["minted_at"] + self.warmup_sec - self._clock()
        if left > 0:
            self._sleep(left)

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
            self._adopt(disk)
            _log(f"picked up a token another process renewed ({reason}); expires in {self.expires_in():.0f}s")
            return
        if not force and not self._expiring(disk):
            self._adopt(disk)
            return
        if not disk["refresh_token"]:
            raise SystemOneError(f"cannot renew: no refresh_token in {self.path}; run `wrangler login`")
        try:
            payload = self._exchange(disk["refresh_token"])
        except SystemOneError:
            again = self._read()  # lost a race with another renewer? its fresh pair is on disk now
            if again["oauth_token"] != disk["oauth_token"] and not self._expiring(again):
                self._adopt(again)
                _log(f"renewal raced another process; using its token ({reason})")
                return
            _log(f"!!! TOKEN RENEWAL FAILED ({reason}) -- run `npx wrangler login`")
            raise
        now = self._clock()
        new = {
            "oauth_token": payload["access_token"],
            "refresh_token": payload.get("refresh_token") or disk["refresh_token"],
            "expires_at": now + float(payload.get("expires_in", TOKEN_LIFETIME_SEC)),
            "minted_at": now,
        }
        self._write(new, payload.get("scope"))
        self._adopt(new)
        self.renewals += 1
        _log(f"renewed wrangler oauth token ({reason}); expires in {self.expires_in():.0f}s")

    def expires_in(self) -> float | None:
        exp = self._state["expires_at"]
        return None if exp is None else exp - self._clock()

    def token(self) -> str:
        """The token to send now. Renews first if inside the margin; while a new token is still
        warming up, hands out the one it replaced if that has life left, else waits the warm-up out
        (outside the lock, so other callers are not held up by the wait)."""
        with self._lock:
            if self._expiring(self._state):
                left = self.expires_in()
                self._refresh_locked(f"expires in {left:.0f}s < margin {self.margin_sec:.0f}s" if left is not None else "no expiry recorded", force=False)
            state, previous = self._state, self._previous
        if self._warming(state):
            if previous is not None and previous["expires_at"] is not None and previous["expires_at"] - self._clock() > PREVIOUS_TOKEN_MIN_LEFT_SEC:
                return previous["oauth_token"]
            self._wait_until_live(state)
        return state["oauth_token"]

    def force_refresh(self, failed: str | None = None) -> str:
        """Called after a 401 on `failed`. Renews only if `failed` is still the current token and
        is past its warm-up; otherwise the 401 is already answered -- by a renewal another call made
        (single-flight: this call waited on the lock for it) or by the warm-up still running -- and
        the current token comes back once it is live. `failed=None` (no token known) always renews."""
        with self._lock:
            if failed is not None and failed != self._state["oauth_token"]:
                self.renewals_avoided += 1
                if failed == (self._previous or {}).get("oauth_token"):
                    self._previous = None  # it 401'd: stop handing it out during a warm-up
            elif failed is not None and self._warming(self._state):
                self.renewals_avoided += 1
                _log(f"401 on a token minted {self._clock() - self._state['minted_at']:.1f}s ago -- still warming up, not renewing")
            else:
                self._refresh_locked("forced after a 401", force=True)
                self._previous = None  # the token it replaced was just rejected
            state = self._state
        self._wait_until_live(state)
        return state["oauth_token"]

    def status(self) -> dict:
        with self._lock:
            left = self.expires_in()
        return {"token_source": self.source, "token_expires_in_sec": None if left is None else round(left), "token_renewals": self.renewals}


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
    """`--jev-backend workers-ai`, the default. Talks to Jev through Cloudflare Workers AI's `/ai/run` endpoint instead of TypeSafe's own
    (see the module docstring for why). Same `ask()` contract as `SystemOneClient` -- callers never
    need to know which transport they're on.

    `api_token` is a plain string or a token provider (`StaticToken`/`WranglerOAuthToken`). The
    token is fetched per call, so a provider can renew it before it expires; a 401 anyway (revoked,
    clock skew, a new token not live yet) hands the failed token to `force_refresh`, which renews
    only if no other call already has, and the call retries once before the error propagates."""

    backend = "workers-ai"

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
        token = self.tokens.token()
        try:
            payload = self._post(body, token)
        except SystemOneError as err:
            if err.status != 401:
                raise
            _log("workers-ai answered 401 -- retrying once with the current token (renewed only if no other call has)")
            payload = self._post(body, self.tokens.force_refresh(token))
        return unwrap_workers_ai_response(payload)

    def status(self) -> dict:
        return {"jev_backend": self.backend, **self.tokens.status()}


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


def add_jev_backend_args(parser) -> None:
    """`--jev-backend workers-ai|typesafe` (default `DEFAULT_JEV_BACKEND`), shared by every Jev
    server. `--backend` stays as an alias: the house and team servers shipped with that name."""
    parser.add_argument(
        "--jev-backend", "--backend", dest="jev_backend", choices=JEV_BACKENDS, default=DEFAULT_JEV_BACKEND,
        help=f"how to reach Jev (default {DEFAULT_JEV_BACKEND}): 'workers-ai' = Cloudflare Workers AI with a "
             f"self-renewing token; 'typesafe' = TypeSafe's own API with $PROMPTLANE_JEV_API_KEY",
    )


def make_jev_client(backend: str = DEFAULT_JEV_BACKEND, timeout: float = 30.0, model: str | None = None,
                    refresh_margin_sec: float = DEFAULT_REFRESH_MARGIN_SEC):
    """The live client for `backend`. Same `ask()` contract either way; only workers-ai needs a
    token provider."""
    kwargs = {"timeout": timeout}
    if model:
        kwargs["model"] = model
    if backend == "typesafe":
        return SystemOneClient(resolve_api_key(), **kwargs)
    if backend == "workers-ai":
        return WorkersAIClient(resolve_workers_ai_token_provider(margin_sec=refresh_margin_sec), **kwargs)
    raise ValueError(f"unknown Jev backend {backend!r}; expected one of {JEV_BACKENDS}")


def client_status(client) -> dict:
    """What a server's `/health` reports about its client: `status()` if it has one, else the
    older `tokens.status()` shape, else nothing (stubs and test fakes)."""
    status = getattr(client, "status", None)
    if callable(status):
        return status()
    tokens = getattr(client, "tokens", None)
    return tokens.status() if tokens is not None else {}


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
