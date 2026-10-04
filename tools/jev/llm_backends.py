#!/usr/bin/env python3
"""The text-generation backends the prose-to-schema translator can run on: host **Ollama** (free,
local, the shipped default), **OpenRouter** (hosted, key from `$OPENROUTER_API_KEY`, what the
entrant compile preview's `compile.py` uses for entrants without a GPU), and **Claude**, added
2026-09-26 for the translator A/B in `docs/translator-guards-and-defaults-spec.md` §9 -- shells out to
the `claude` CLI on a subscription (never the metered API; see `ClaudeCliBackend`), for the
translator step only, never the game/arena model path (`tools/model_server.py`'s own, separate
`ClaudeBackend`). Ollama and OpenRouter run the same model by default -- `qwen3.5:9b` locally,
`qwen/qwen3.5-9b` on OpenRouter -- so the three entrant-facing doors
(`docs/entrant-compile-preview.md`) compile with the model the translator was measured on
(`docs/prose-to-schema-translator.md` §2), whichever door an entrant uses.

Each backend exposes one call, `generate(prompt) -> str`, which is exactly the shape
`translator.translate_pilot(generate=...)` takes, and keeps a running `Usage` (calls, prompt and
completion tokens, USD) so a caller can report real spend, not an estimate. `ClaudeCliBackend`
reports `total_cost_usd` (what the call would have billed on the metered API) for comparability,
even though it is drawn from a subscription's usage window, not real API dollars.

NO TOKEN CAPS (Ceryce, 2026-10-02 17:59 CT: "Get rid of any fucking token caps."). A reply is never
cut at a token count and a run is never refused for its token total: the old 1,800-token reply cap
cut every reply of a 16-rule cascade before any check ran (`runs/remove-token-caps-2026-10-02.md`).
`max_tokens=None`, the default, sends no completion cap at all, under every vocabulary. vocab-1, the
frozen research vocabulary, kept its 1,800-token cap at first so its request stayed byte-identical; the
ruling covers any token cap, so it is gone there too. A caller compiling under vocab-1 passes
`vocab1=True` instead, and its Ollama body is the one its recorded runs used less that one field
(`ollama_body`).

What guards an uncapped reply instead, measured on the host (`runs/remove-token-caps-2026-10-02.md`):
- A reply that never ends (a loop) is stopped by `CALL_TIMEOUT_SEC` of wall clock, not by a token
  count. Ollama cancels the generation when the client hangs up. The timeout is long enough for the
  model to fill its whole context window, so it never cuts a reply that could be valid.
- An uncapped Ollama request sets `"truncate": false` (except vocab-1's, which changes in nothing but
  its cap). A prompt bigger than the context window is then an error, where Ollama's default silently
  drops the start of the prompt (the instructions and the head of the prose).
- It does NOT set `"shift": false`, though that would end a reply at a full window. In Ollama 0.35
  that option is a llama-server startup flag, so each request that flips it restarts the shared
  model for every other caller (5-30 s each time, measured).
OpenRouter's provider stops at the model's context window.

Standard library only for Ollama/OpenRouter, so the PR bot's runner needs nothing but Python;
`ClaudeCliBackend` additionally needs the `claude` CLI on PATH.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

DEFAULT_OLLAMA_MODEL = "qwen3.5:9b"
DEFAULT_OPENROUTER_MODEL = "qwen/qwen3.5-9b"
DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
# USD per million tokens for the default OpenRouter model (openrouter.ai/api/v1/models, 2026-09-25).
# Used only when a response doesn't carry OpenRouter's own `usage.cost`.
OPENROUTER_PRICES = {DEFAULT_OPENROUTER_MODEL: (0.10, 0.15)}

# Same sampling the translator was measured with (`ground_truth._ollama_generate`).
TEMPERATURE = 0.2
# Seconds per model call: the runaway guard, not a length limit. At the 85 tokens/s measured on the
# host's qwen3.5:9b, filling its whole 32,768-token window takes about 6.4 minutes. 15 minutes leaves
# room to wait behind another caller first, since Ollama serves one request at a time. Measured in
# runs/remove-token-caps-2026-10-02.md.
CALL_TIMEOUT_SEC = 900.0


class BackendError(RuntimeError):
    """The backend could not be reached or answered with an error."""


def estimate_tokens(text: str) -> int:
    """~4 chars/token, the same rough rule `client.estimate_tokens` uses -- only when a backend's
    reply carries no usage; real usage comes back from the backend."""
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


class Backend:
    """`max_tokens` None (the default) sends no completion cap; nothing on the translation path passes one."""

    kind = "base"

    def __init__(self, model: str, max_tokens: int | None = None, timeout: float = CALL_TIMEOUT_SEC):
        self.model = model
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.usage = Usage()
        self._lock = threading.Lock()

    def describe(self) -> str:
        return f"{self.kind}:{self.model}"

    def generate(self, prompt: str) -> str:
        start = time.perf_counter()
        text, prompt_tokens, completion_tokens, cost = self._call(prompt)
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


def ollama_body(model: str, prompt: str, max_tokens: int | None, vocab1: bool = False) -> dict:
    """The `/api/generate` body the translator sends (thinking off, temperature 0.2). Without a
    `max_tokens` there is no `num_predict`, and `truncate` false makes a prompt over the context window
    an error instead of a silently cut prompt (see NO TOKEN CAPS above). `vocab1`: the body vocab-1's
    recorded runs used, byte for byte, less its `num_predict` 1800, and nothing added."""
    options = {"temperature": TEMPERATURE}
    if max_tokens is not None:
        options["num_predict"] = max_tokens
    body = {"model": model, "prompt": prompt, "stream": False, "keep_alive": "30m", "options": options, "think": False}
    if max_tokens is None and not vocab1:
        body["truncate"] = False
    return body


class OllamaBackend(Backend):
    """Host Ollama's `/api/generate`, with the body `ground_truth._ollama_generate` sends
    (`ollama_body`) -- the translator's measured configuration. Free: cost is always 0."""

    kind = "ollama"

    def __init__(self, model: str = DEFAULT_OLLAMA_MODEL, url: str | None = None, vocab1: bool = False, **kw):
        super().__init__(model, **kw)
        self.url = resolve_ollama_url(url)
        self.vocab1 = vocab1

    def _call(self, prompt: str) -> tuple[str, int, int, float]:
        body = ollama_body(self.model, prompt, self.max_tokens, self.vocab1)
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
        if self.max_tokens is None:
            del body["max_tokens"]  # no cap: the provider stops at the model's context window
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


class ClaudeCliBackend(Backend):
    """Shells out to the `claude` CLI on Ceryce's own subscription (`claude -p --model <model>
    --output-format json`), for the prose-to-schema TRANSLATOR step only -- the same shape
    `tools/model_server.py::ClaudeBackend` already uses for the arena/game model path, reimplemented
    here rather than imported so this module never has to import from `tools/` outside `tools/jev/`
    and so the translator's backend list stays self-contained (`docs/prose-to-schema-translator.md`).

    `--tools ""` / `--safe-mode` / `--no-session-persistence` skip loading this repo's own tool
    defs, CLAUDE.md, hooks, and skills, none of which a plain text-in/text-out translation prompt
    needs -- measured live 2026-09-26, this drops a trivial smoke-test call from ~37k cache-creation
    input tokens (the full agent system prompt) to ~4k plain input tokens, at $0.0745 -> $0.0043
    reported `total_cost_usd` per call (that figure is what the API would have billed, not a
    subscription charge -- see below).

    `ANTHROPIC_API_KEY` is always popped from the child's environment before every call, whether or
    not it was set in this process, so a translation run can never silently fall back to metered API
    billing instead of drawing from the subscription's own usage window -- the one hard requirement
    on this backend, not a guess. `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` are popped too, the same fix
    `ClaudeBackend` already carries: a nested `claude` refuses to start inside another Claude Code
    session unless those go first.

    `effort`, default `"low"`: the CLI has no flag to disable Claude's own extended thinking the way
    Ollama's `think: false` disables qwen's (checked -- there is none), so a translation call spends
    an uncontrolled number of tokens reasoning before it ever writes JSON. Measured live 2026-09-26,
    one violin.md translation cost 84.5s/10,678 completion tokens/$0.065 (would-be API cost) at the
    CLI's default effort, and 71.1s/8,691/$0.044 at `--effort low` -- lower, not eliminated. Kept
    configurable rather than hardcoded so a caller can trade it off explicitly; `"low"` is the default
    because the task this backend was built for ("keep subscription use proportionate") argues for it."""

    kind = "claude"

    def __init__(
        self,
        model: str = DEFAULT_CLAUDE_MODEL,
        max_tokens: int | None = None,
        timeout: float = CALL_TIMEOUT_SEC,
        executable: str | None = None,
        effort: str | None = "low",
    ):
        # The CLI has no completion-cap flag, so `max_tokens` is accepted for a uniform signature only.
        super().__init__(model, max_tokens=max_tokens, timeout=timeout)
        self.executable = executable or shutil.which("claude") or "claude"
        self.effort = effort

    def _command(self) -> list[str]:
        cmd = [
            self.executable, "-p", "--model", self.model, "--output-format", "json",
            "--tools", "", "--safe-mode", "--no-session-persistence",
        ]
        if self.effort:
            cmd += ["--effort", self.effort]
        return cmd

    def _call(self, prompt: str) -> tuple[str, int, int, float]:
        env = dict(os.environ)
        env.pop("CLAUDECODE", None)
        env.pop("CLAUDE_CODE_ENTRYPOINT", None)
        env.pop("ANTHROPIC_API_KEY", None)
        try:
            proc = subprocess.run(
                self._command(), input=prompt, capture_output=True, text=True, encoding="utf-8",
                env=env, timeout=self.timeout, shell=sys.platform == "win32",
            )
        except subprocess.TimeoutExpired as err:
            raise BackendError(f"claude timed out after {self.timeout}s") from err
        if proc.returncode != 0:
            raise BackendError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:300]}")
        try:
            payload = json.loads(proc.stdout)
        except json.JSONDecodeError:
            text = proc.stdout
            return text, estimate_tokens(prompt), estimate_tokens(text), 0.0
        if payload.get("is_error"):
            raise BackendError(f"claude reported an error: {str(payload.get('result'))[:300]}")
        text = payload.get("result", "")
        usage = payload.get("usage") or {}
        prompt_tokens = int(usage.get("input_tokens") or estimate_tokens(prompt))
        completion_tokens = int(usage.get("output_tokens") or estimate_tokens(text))
        cost = float(payload.get("total_cost_usd") or 0.0)
        return text, prompt_tokens, completion_tokens, cost


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


def make_backend(kind: str, model: str | None = None, *, max_tokens: int | None = None, ollama_url: str | None = None,
                 api_key_env: str = "OPENROUTER_API_KEY", timeout: float = CALL_TIMEOUT_SEC, executable: str | None = None,
                 effort: str | None = "low", vocab1: bool = False) -> Backend:
    """`max_tokens` None sends no completion cap; nothing on the translation path passes one. `vocab1`: a vocab-1
    compile, whose Ollama body is its recorded one less the cap (`ollama_body`)."""
    if kind == "ollama":
        return OllamaBackend(model or DEFAULT_OLLAMA_MODEL, url=ollama_url, max_tokens=max_tokens, timeout=timeout, vocab1=vocab1)
    if kind == "openrouter":
        return OpenRouterBackend(os.environ.get(api_key_env, ""), model or DEFAULT_OPENROUTER_MODEL, max_tokens=max_tokens, timeout=timeout)
    if kind == "claude":
        return ClaudeCliBackend(model or DEFAULT_CLAUDE_MODEL, max_tokens=max_tokens, timeout=timeout, executable=executable, effort=effort)
    raise ValueError(f"unknown backend {kind!r} (ollama, openrouter, or claude)")
