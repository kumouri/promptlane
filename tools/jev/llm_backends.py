#!/usr/bin/env python3
"""The text-generation backends the entrant compile preview (`compile.py`) can translate prose with:
host **Ollama** (free, local) or **OpenRouter** (hosted, key from `$OPENROUTER_API_KEY`). Both run
the same model by default -- `qwen3.5:9b` locally, `qwen/qwen3.5-9b` on OpenRouter -- so the three
entrant-facing doors (`docs/entrant-compile-preview.md`) compile with the model the translator was
measured on (`docs/prose-to-schema-translator.md` §2), whichever door an entrant uses.

Each backend exposes one call, `generate(prompt) -> str`, which is exactly the shape
`translator.translate_pilot(generate=...)` takes, and keeps a running `Usage` (calls, prompt and
completion tokens, USD) so a caller can report real spend, not an estimate.

SPEND CAP. `TokenBudget` is checked *before* every call: a call is refused (`BudgetExceeded`) unless
the tokens already spent plus this call's worst case (its estimated prompt tokens plus `max_tokens`
of completion) fit under the cap. So a run can never overshoot its cap by more than zero -- the cap
is the ceiling the PR bot and the Elysium panel promise, not a target they drift past.

Standard library only, so the PR bot's runner needs nothing but Python.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

DEFAULT_OLLAMA_MODEL = "qwen3.5:9b"
DEFAULT_OPENROUTER_MODEL = "qwen/qwen3.5-9b"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# USD per million tokens for the default OpenRouter model (openrouter.ai/api/v1/models, 2026-09-25).
# Used only when a response doesn't carry OpenRouter's own `usage.cost`.
OPENROUTER_PRICES = {DEFAULT_OPENROUTER_MODEL: (0.10, 0.15)}

# Same sampling the translator was measured with (`ground_truth._ollama_generate`).
TEMPERATURE = 0.2
MAX_COMPLETION_TOKENS = 1800


class BudgetExceeded(RuntimeError):
    """A call was refused because it could push the run past its token cap."""


class BackendError(RuntimeError):
    """The backend could not be reached or answered with an error."""


def estimate_tokens(text: str) -> int:
    """~4 chars/token, the same rough rule `client.estimate_tokens` uses -- only for the pre-call
    budget check; real usage comes back from the backend."""
    return max(1, len(text) // 4)


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    seconds: float = 0.0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def as_dict(self) -> dict:
        return {
            "calls": self.calls,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "cost_usd": round(self.cost_usd, 6),
            "seconds": round(self.seconds, 2),
        }


class TokenBudget:
    """Shared, thread-safe cap on total (prompt + completion) tokens across every call in a run.
    `None` means uncapped."""

    def __init__(self, max_total_tokens: int | None):
        self.max_total_tokens = max_total_tokens
        self.spent = 0
        self.reserved = 0
        self.lock = threading.Lock()

    def reserve(self, worst_case: int) -> None:
        with self.lock:
            if self.max_total_tokens is None:
                self.reserved += worst_case
                return
            if self.spent + self.reserved + worst_case > self.max_total_tokens:
                raise BudgetExceeded(
                    f"token cap reached: {self.spent} spent + {self.reserved} in flight + up to {worst_case} "
                    f"for this call would exceed the cap of {self.max_total_tokens}"
                )
            self.reserved += worst_case

    def settle(self, worst_case: int, actual: int) -> None:
        with self.lock:
            self.reserved -= worst_case
            self.spent += actual


class Backend:
    kind = "base"

    def __init__(self, model: str, budget: TokenBudget | None = None, max_tokens: int = MAX_COMPLETION_TOKENS, timeout: float = 120.0):
        self.model = model
        self.budget = budget or TokenBudget(None)
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.usage = Usage()
        self._lock = threading.Lock()

    def describe(self) -> str:
        return f"{self.kind}:{self.model}"

    def generate(self, prompt: str) -> str:
        worst = estimate_tokens(prompt) + self.max_tokens
        self.budget.reserve(worst)
        start = time.perf_counter()
        prompt_tokens = completion_tokens = 0
        try:
            text, prompt_tokens, completion_tokens, cost = self._call(prompt)
        finally:
            self.budget.settle(worst, prompt_tokens + completion_tokens)
        with self._lock:
            self.usage.calls += 1
            self.usage.prompt_tokens += prompt_tokens
            self.usage.completion_tokens += completion_tokens
            self.usage.cost_usd += cost
            self.usage.seconds += time.perf_counter() - start
        return text

    def _call(self, prompt: str) -> tuple[str, int, int, float]:  # pragma: no cover - abstract
        raise NotImplementedError


def _post_json(url: str, body: dict, headers: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")
        raise BackendError(f"HTTP {err.code} from {url}: {detail[:300]}") from err
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        raise BackendError(f"could not reach {url}: {err}") from err


def resolve_ollama_url(explicit: str | None = None) -> str:
    raw = explicit or os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434"
    if not raw.startswith("http"):
        raw = "http://" + raw
    return raw.rstrip("/")


class OllamaBackend(Backend):
    """Host Ollama's `/api/generate`, with the body `ground_truth._ollama_generate` sends (thinking
    off, temperature 0.2) -- the translator's measured configuration. Free: cost is always 0."""

    kind = "ollama"

    def __init__(self, model: str = DEFAULT_OLLAMA_MODEL, url: str | None = None, **kw):
        super().__init__(model, **kw)
        self.url = resolve_ollama_url(url)

    def _call(self, prompt: str) -> tuple[str, int, int, float]:
        body = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": TEMPERATURE, "num_predict": self.max_tokens},
            "think": False,
        }
        try:
            data = _post_json(self.url + "/api/generate", body, {}, self.timeout)
        except BackendError as err:
            if "think" not in str(err):
                raise
            body.pop("think")  # an older Ollama rejects the field; same fallback ground_truth.py has
            data = _post_json(self.url + "/api/generate", body, {}, self.timeout)
        prompt_tokens = int(data.get("prompt_eval_count") or estimate_tokens(prompt))
        text = data.get("response", "")
        completion_tokens = int(data.get("eval_count") or estimate_tokens(text))
        return text, prompt_tokens, completion_tokens, 0.0


class OpenRouterBackend(Backend):
    """OpenRouter's OpenAI-compatible `/chat/completions`, reasoning off (a hybrid-thinking qwen
    otherwise spends the whole completion budget on hidden reasoning -- same toggle
    `tools/model_server.py` sends). The key is read from the environment by the caller and never
    logged or echoed."""

    kind = "openrouter"

    def __init__(self, api_key: str, model: str = DEFAULT_OPENROUTER_MODEL, base_url: str = OPENROUTER_BASE_URL, **kw):
        super().__init__(model, **kw)
        if not api_key:
            raise BackendError("OpenRouter needs an API key (set OPENROUTER_API_KEY)")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    def _call(self, prompt: str) -> tuple[str, int, int, float]:
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": TEMPERATURE,
            "max_tokens": self.max_tokens,
            "reasoning": {"enabled": False},
            "usage": {"include": True},
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "X-Title": "promptlane entrant compile preview"}
        data = _post_json(self.base_url + "/chat/completions", body, headers, self.timeout)
        if data.get("error"):
            raise BackendError(f"OpenRouter error: {str(data['error'])[:300]}")
        choices = data.get("choices") or []
        text = ((choices[0].get("message") or {}).get("content") or "") if choices else ""
        usage = data.get("usage") or {}
        prompt_tokens = int(usage.get("prompt_tokens") or estimate_tokens(prompt))
        completion_tokens = int(usage.get("completion_tokens") or estimate_tokens(text))
        cost = usage.get("cost")
        if cost is None:
            pin, pout = OPENROUTER_PRICES.get(self.model, (0.0, 0.0))
            cost = prompt_tokens / 1e6 * pin + completion_tokens / 1e6 * pout
        return text, prompt_tokens, completion_tokens, float(cost)


class ScriptedBackend(Backend):
    """Offline stand-in for tests and dry runs: replays canned replies in order (cycling), with
    token counts estimated from the text. Never touches the network."""

    kind = "scripted"

    def __init__(self, replies: list[str], model: str = "scripted", **kw):
        super().__init__(model, **kw)
        self.replies = list(replies)
        self.i = 0

    def _call(self, prompt: str) -> tuple[str, int, int, float]:
        with self._lock:
            text = self.replies[self.i % len(self.replies)]
            self.i += 1
        return text, estimate_tokens(prompt), estimate_tokens(text), 0.0


def make_backend(kind: str, model: str | None = None, budget: TokenBudget | None = None, *, ollama_url: str | None = None,
                 api_key_env: str = "OPENROUTER_API_KEY", timeout: float = 120.0) -> Backend:
    if kind == "ollama":
        return OllamaBackend(model or DEFAULT_OLLAMA_MODEL, url=ollama_url, budget=budget, timeout=timeout)
    if kind == "openrouter":
        return OpenRouterBackend(os.environ.get(api_key_env, ""), model or DEFAULT_OPENROUTER_MODEL, budget=budget, timeout=timeout)
    raise ValueError(f"unknown backend {kind!r} (ollama or openrouter)")
