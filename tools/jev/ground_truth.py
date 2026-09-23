#!/usr/bin/env python3
"""Ground truth for the fidelity test: what the entrant's *actual prose*, run through a real chat
model exactly the way the game runs it, decides on a given `Observation`. This is deliberately NOT
the translator's own output and NOT Jev -- it is the other half of the A/B the whole exercise is
about (prose-run-live vs. prose-translated-then-run-on-Jev), so it has to be produced by a
completely independent path.

`build_prompt` and `parse_action` are ports of `src/pilots/promptPilot.ts`'s `PromptPilot.
buildPrompt` and `parseAction` (read in full for this port) -- same literal `REPLY_INSTRUCTION` line
(also served verbatim at `tools/arena/pages/contract.mjs:15-16`), same prompt assembly order (pilot
text, blank line, instruction, blank line, `OBSERVATION:`, the JSON), same regex-first-brace/parse/
validate-kind approach. `tools/model_server.py`'s `OllamaBackend` is frozen game-adjacent
infrastructure this harness doesn't import (it's the HTTP server half of a contract this script
doesn't need), but `_ollama_generate` below calls the same `/api/generate` endpoint the same way --
verified against that file's `build_request`/`_post`.

Model: host Ollama's `qwen3.5:9b`, the model this repo's own `DEFAULT_OLLAMA_MODEL` already runs
pilots on (`tools/model_server.py`) and the one this session's Ollama host actually has loaded. Free
(local inference, no API spend) -- see `docs/prose-to-schema-translator.md` for why that also made
it the translator's model.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

DEFAULT_OLLAMA_MODEL = "qwen3.5:9b"
VALID_KINDS = {"move", "attack", "ability", "recall", "hold"}

REPLY_INSTRUCTION = (
    'Reply with ONLY one JSON object, no prose: {"kind": "move"|"attack"|"ability"|"recall"|"hold", '
    '"target"?: string | {"x":number,"y":number}, "ability"?: string}'
)


def resolve_ollama_url(explicit: str | None = None) -> str:
    raw = explicit or os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434"
    if "://" not in raw:
        raw = "http://" + raw
    return raw.rstrip("/")


def build_prompt(pilot_text: str, observation: dict) -> str:
    """Exact port of `PromptPilot.buildPrompt` (`src/pilots/promptPilot.ts:33-42`)."""
    return "\n".join(
        [
            pilot_text.strip(),
            "",
            REPLY_INSTRUCTION,
            "",
            "OBSERVATION:",
            json.dumps(observation, separators=(",", ":")),
        ]
    )


def parse_action(reply: str) -> dict | None:
    """Exact port of `parseAction` (`src/pilots/promptPilot.ts:45-55`): first `{...}` blob, must
    parse as JSON, `kind` must be a valid `ActionKind`."""
    match = re.search(r"\{[\s\S]*\}", reply)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or parsed.get("kind") not in VALID_KINDS:
        return None
    return parsed


def _ollama_generate(url: str, model: str, prompt: str, timeout: float = 60.0, max_tokens: int = 120) -> str:
    body = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "keep_alive": "30m",
        "options": {"temperature": 0.2, "num_predict": max_tokens},
        "think": False,
    }
    req = urllib.request.Request(
        url + "/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")
        if err.code == 400 and "think" in detail:
            body.pop("think")
            req = urllib.request.Request(
                url + "/api/generate",
                data=json.dumps(body).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        else:
            raise RuntimeError(f"ollama {err.code}: {detail[:200]}") from err
    return data.get("response", "")


def ground_truth_action(
    pilot_text: str, observation: dict, ollama_url: str | None = None, model: str = DEFAULT_OLLAMA_MODEL
) -> tuple[dict | None, str]:
    """Returns `(action_or_None, raw_reply)`. `action` is `None` on a parse failure -- the game's own
    `hold` degradation path, not an error here (mirrors `PromptPilot.decide` treating a parse miss
    as `{"kind": "hold"}`, but this harness keeps `None` distinguishable from an explicit `hold`
    reply for reporting)."""
    url = resolve_ollama_url(ollama_url)
    prompt = build_prompt(pilot_text, observation)
    reply = _ollama_generate(url, model, prompt)
    return parse_action(reply), reply
