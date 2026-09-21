#!/usr/bin/env python3
"""The model side of promptlane's HTTP pilot adapter. Standard library only.

The game's `httpCallModel` (src/pilots/callModel.ts) and the jam runner (tools/match/cli.mjs)
both speak one contract:

    POST <any path>   body {"prompt": "<text>"}   ->  200 {"reply": "<model text>"}

Errors come back as a non-2xx JSON body `{"error": "..."}`; the game treats any non-2xx as a
failed decision and holds, so a flaky backend can never crash a match. `GET /health` reports the
backend and model so a match log can record which model played.

Backends:
  ollama  (default)  forwards to Ollama's /api/generate. URL from --ollama-url, else $OLLAMA_HOST,
                     else http://127.0.0.1:11434. Model from --model (default qwen3.5:9b).
  claude             shells out to `claude -p --model <model>` (Claude subscription; no key is
                     read or stored anywhere). ~10 s per decision on Haiku — fine for a demo,
                     slow for a full lockstep match.
  echo               always replies {"kind": "hold"}; for smoke tests.

    python tools/model_server.py                         # ollama, qwen3.5:9b, 127.0.0.1:8787
    python tools/model_server.py --model gemma4:12b
    python tools/model_server.py --backend claude --model claude-haiku-4-5-20251001
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 8787
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "qwen3.5:9b"
DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001"


# --- backends -------------------------------------------------------------------------------------


class Backend:
    kind = "abstract"
    model = ""

    def complete(self, prompt: str) -> str:  # pragma: no cover - interface
        raise NotImplementedError

    def describe(self) -> dict:
        return {"backend": self.kind, "model": self.model}


class EchoBackend(Backend):
    """Always holds. Exists so the HTTP layer can be smoke-tested with no model at all."""

    kind = "echo"
    model = "hold"

    def complete(self, prompt: str) -> str:
        return '{"kind": "hold"}'


def resolve_ollama_url(explicit: str | None, env: dict | None = None) -> str:
    """--ollama-url wins; else $OLLAMA_HOST (host:port or URL); else the Ollama default."""
    env = os.environ if env is None else env
    raw = explicit or env.get("OLLAMA_HOST") or DEFAULT_OLLAMA_URL
    if "://" not in raw:
        raw = "http://" + raw
    return raw.rstrip("/")


class OllamaBackend(Backend):
    kind = "ollama"

    def __init__(self, url: str, model: str, temperature: float = 0.2, max_tokens: int = 120,
                 timeout: float = 60.0, think: bool = False):
        self.url = url
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.think = think

    def build_request(self, prompt: str, with_think: bool = True) -> dict:
        body = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "keep_alive": "30m",
            "options": {"temperature": self.temperature, "num_predict": self.max_tokens},
        }
        if with_think:
            body["think"] = self.think
        return body

    def _post(self, body: dict) -> dict:
        req = urllib.request.Request(
            self.url + "/api/generate",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def complete(self, prompt: str) -> str:
        try:
            data = self._post(self.build_request(prompt))
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "replace")
            # Older/other models reject the `think` field outright; retry once without it.
            if err.code == 400 and "think" in detail:
                data = self._post(self.build_request(prompt, with_think=False))
            else:
                raise RuntimeError(f"ollama {err.code}: {detail[:200]}") from err
        return data.get("response", "")

    def describe(self) -> dict:
        return {**super().describe(), "url": self.url, "temperature": self.temperature,
                "max_tokens": self.max_tokens, "think": self.think}


class ClaudeBackend(Backend):
    kind = "claude"

    def __init__(self, model: str, timeout: float = 120.0, executable: str | None = None):
        self.model = model
        self.timeout = timeout
        self.executable = executable or shutil.which("claude") or "claude"

    def command(self) -> list[str]:
        return [self.executable, "-p", "--model", self.model, "--output-format", "text"]

    def complete(self, prompt: str) -> str:
        env = dict(os.environ)
        # A nested `claude` refuses to start inside another Claude Code session unless these go.
        env.pop("CLAUDECODE", None)
        env.pop("CLAUDE_CODE_ENTRYPOINT", None)
        proc = subprocess.run(
            self.command(), input=prompt, capture_output=True, text=True, encoding="utf-8",
            env=env, timeout=self.timeout, shell=sys.platform == "win32",
        )
        if proc.returncode != 0:
            raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:200]}")
        return proc.stdout


def make_backend(args: argparse.Namespace) -> Backend:
    if args.backend == "ollama":
        return OllamaBackend(
            resolve_ollama_url(args.ollama_url), args.model or DEFAULT_OLLAMA_MODEL,
            temperature=args.temperature, max_tokens=args.max_tokens, timeout=args.timeout,
            think=args.think,
        )
    if args.backend == "claude":
        return ClaudeBackend(args.model or DEFAULT_CLAUDE_MODEL, timeout=args.timeout)
    if args.backend == "echo":
        return EchoBackend()
    raise SystemExit(f"unknown backend {args.backend!r}")


# --- http -----------------------------------------------------------------------------------------


class Stats:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.requests = 0
        self.errors = 0
        self.total_seconds = 0.0

    def record(self, seconds: float, ok: bool) -> None:
        with self.lock:
            self.requests += 1
            self.total_seconds += seconds
            if not ok:
                self.errors += 1

    def snapshot(self) -> dict:
        with self.lock:
            avg = self.total_seconds / self.requests if self.requests else 0.0
            return {"requests": self.requests, "errors": self.errors, "avg_seconds": round(avg, 3)}


def make_handler(backend: Backend, stats: Stats, verbose: bool = False):
    class Handler(BaseHTTPRequestHandler):
        server_version = "promptlane-model-server/1"

        def log_message(self, fmt, *args):  # quiet by default; verbose prints per call below
            if verbose:
                super().log_message(fmt, *args)

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def _cors(self) -> None:
            # The browser build (Prompt-HTTP dropdown) calls this from the Vite origin.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self._cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self) -> None:
            if self.path.rstrip("/") in ("", "/health"):
                self._send_json(200, {"ok": True, **backend.describe(), **stats.snapshot()})
            else:
                self._send_json(404, {"error": "not found; POST {\"prompt\": ...} or GET /health"})

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                payload = json.loads(raw.decode("utf-8"))
                prompt = payload["prompt"]
                if not isinstance(prompt, str):
                    raise TypeError("prompt must be a string")
            except (ValueError, KeyError, TypeError) as err:
                self._send_json(400, {"error": f"bad request: {err}"})
                return

            started = time.monotonic()
            try:
                reply = backend.complete(prompt)
            except Exception as err:  # any backend failure -> the game holds, never crashes
                seconds = time.monotonic() - started
                stats.record(seconds, ok=False)
                sys.stderr.write(f"[{backend.kind} {seconds:.2f}s] ERROR {err}\n")
                self._send_json(502, {"error": str(err)})
                return
            seconds = time.monotonic() - started
            stats.record(seconds, ok=True)
            if verbose:
                sys.stderr.write(f"[{backend.kind} {seconds:.2f}s] {reply.strip()[:160]}\n")
            self._send_json(200, {"reply": reply})

    return Handler


def serve(backend: Backend, host: str, port: int, verbose: bool = False) -> ThreadingHTTPServer:
    stats = Stats()
    server = ThreadingHTTPServer((host, port), make_handler(backend, stats, verbose))
    server.daemon_threads = True
    return server


# --- cli ------------------------------------------------------------------------------------------


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--backend", choices=["ollama", "claude", "echo"], default="ollama")
    p.add_argument("--model", default=None,
                   help=f"model name (ollama default {DEFAULT_OLLAMA_MODEL}; claude default {DEFAULT_CLAUDE_MODEL})")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--ollama-url", default=None, help="default: $OLLAMA_HOST or " + DEFAULT_OLLAMA_URL)
    p.add_argument("--temperature", type=float, default=0.2)
    p.add_argument("--max-tokens", type=int, default=120, help="ollama num_predict; a reply is one small JSON object")
    p.add_argument("--think", action="store_true", help="let thinking models think (slower; default off)")
    p.add_argument("--timeout", type=float, default=60.0, help="seconds per backend call")
    p.add_argument("--verbose", action="store_true", help="log every reply")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    backend = make_backend(args)
    server = serve(backend, args.host, args.port, verbose=args.verbose)
    info = backend.describe()
    print(f"promptlane model server on http://{args.host}:{args.port}/  backend={info['backend']} model={info['model']}"
          + (f" url={info['url']}" if 'url' in info else ""), flush=True)
    print("POST {\"prompt\": ...} -> {\"reply\": ...}; GET /health; Ctrl-C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
