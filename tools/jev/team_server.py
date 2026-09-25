#!/usr/bin/env python3
"""Jev team-bot HTTP backend for the Jev-vs-qwen32b model test (`docs/jev-vs-qwen32b-intent.md`,
`runs/jev-vs-qwen32b-*.md`). Sibling to `house_server.py`: identical shape (worksheet in, `{bucket,
rule, answers, ms}` out), but decides with `team_rules.py`'s cascade instead of `rules.py`'s --
this experiment's own intent document, not house-violet.md's. Reuses `client.py` unchanged.

    GET  /health   -> {"ok": true, "backend": "jev-team", "model": ..., "requests", "errors",
                        "avg_seconds", "tokens_in", "cost_usd", "budget_usd"}
    POST /         body: {"hp", "maxHp", "wave", "tower", "foe", "foeIsBearbot", "foeHp",
                           "foeMaxHp", "cd", "instrument", "team", "tick", "clockSec"} -- camelCase
                           on the wire (caller is TypeScript, tools/match/jevTeamPilot.ts), parsed
                           into `team_rules.Worksheet`.
                   -> 200 {"bucket": ..., "rule": 1-7, "answers": {qid: 0.0-1.0}, "ms": float}
                   -> non-2xx {"error": "..."} on any failure -- the caller holds, never crashes.

Budget: `--budget-usd` (default 1.00) refuses new calls once cumulative estimated cost (from real
`usage.input_tokens`) would exceed it -- identical posture to `house_server.py`.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import (  # noqa: E402
    SystemOneClient,
    SystemOneError,
    WorkersAIClient,
    estimate_cost_usd,
    resolve_api_key,
    resolve_workers_ai_token,
)
from serializer_team import state_paragraph  # noqa: E402
from team_rules import Worksheet, bind_questions, bucket_for_rule, first_match  # noqa: E402

DEFAULT_PORT = 8799
DEFAULT_BUDGET_USD = 1.00
REQUIRED_FIELDS = ("hp", "maxHp", "wave", "cd", "instrument", "team", "tick", "clockSec")


class BudgetExceeded(RuntimeError):
    pass


class JevTeamBackend:
    def __init__(self, client, budget_usd: float | None = DEFAULT_BUDGET_USD):
        self.client = client
        self.budget_usd = budget_usd
        self.lock = threading.Lock()
        self.requests = 0
        self.errors = 0
        self.total_seconds = 0.0
        self.tokens_in = 0
        self.cost_usd = 0.0

    def decide(self, body: dict) -> dict:
        missing = [f for f in REQUIRED_FIELDS if f not in body]
        if missing:
            raise ValueError(f"missing field(s): {', '.join(missing)}")
        ws = Worksheet(
            hp=float(body["hp"]),
            max_hp=float(body["maxHp"]),
            wave=int(body["wave"]),
            tower=body.get("tower"),
            foe=body.get("foe"),
            foe_is_bearbot=bool(body.get("foeIsBearbot", False)),
            foe_hp=(float(body["foeHp"]) if body.get("foeHp") is not None else None),
            foe_max_hp=(float(body["foeMaxHp"]) if body.get("foeMaxHp") is not None else None),
            cd=float(body["cd"]),
            instrument=body["instrument"],
            team=body["team"],
            tick=int(body["tick"]),
            clock_sec=float(body["clockSec"]),
        )
        with self.lock:
            if self.budget_usd is not None and self.cost_usd >= self.budget_usd:
                raise BudgetExceeded(
                    f"jev-team budget ${self.budget_usd:.2f} reached (spent ${self.cost_usd:.4f}); refusing this call"
                )
        bound = bind_questions(ws.instrument, ws)
        state = state_paragraph(ws)
        started = time.monotonic()
        response = self.client.ask(state, bound)
        ms = (time.monotonic() - started) * 1000
        answers = {qid: float(a.get("noul", 0.0)) for qid, a in response.get("answers", {}).items()}
        bool_answers = {qid: value >= 0.5 for qid, value in answers.items()}
        rule = first_match(bool_answers)
        bucket = bucket_for_rule(rule)
        input_tokens = int((response.get("usage") or {}).get("input_tokens") or 0)
        with self.lock:
            self.requests += 1
            self.total_seconds += ms / 1000
            self.tokens_in += input_tokens
            self.cost_usd += estimate_cost_usd(input_tokens)
        return {"bucket": bucket, "rule": rule, "answers": answers, "ms": round(ms, 1)}

    def snapshot(self) -> dict:
        with self.lock:
            avg = self.total_seconds / self.requests if self.requests else 0.0
            return {
                "requests": self.requests,
                "errors": self.errors,
                "avg_seconds": round(avg, 3),
                "tokens_in": self.tokens_in,
                "cost_usd": round(self.cost_usd, 4),
                "budget_usd": self.budget_usd,
            }

    def record_error(self) -> None:
        with self.lock:
            self.errors += 1


def make_handler(backend: JevTeamBackend, model: str, verbose: bool = False):
    class Handler(BaseHTTPRequestHandler):
        server_version = "promptlane-jev-team-server/1"

        def log_message(self, fmt, *args):
            if verbose:
                super().log_message(fmt, *args)

        def _send_json(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self) -> None:
            if self.path.rstrip("/") in ("", "/health"):
                self._send_json(200, {"ok": True, "backend": "jev-team", "model": model, **backend.snapshot()})
            else:
                self._send_json(404, {"error": "not found; POST a worksheet, or GET /health"})

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw.decode("utf-8"))
                if not isinstance(body, dict):
                    raise TypeError("body must be a JSON object")
            except (ValueError, TypeError) as err:
                self._send_json(400, {"error": f"bad request: {err}"})
                return

            started = time.monotonic()
            try:
                result = backend.decide(body)
            except BudgetExceeded as err:
                backend.record_error()
                sys.stderr.write(f"[jev-team] BUDGET {err}\n")
                self._send_json(402, {"error": str(err)})
                return
            except (ValueError, SystemOneError) as err:
                backend.record_error()
                seconds = time.monotonic() - started
                sys.stderr.write(f"[jev-team {seconds:.2f}s] ERROR {err}\n")
                self._send_json(502, {"error": str(err)})
                return
            except Exception as err:  # any other backend failure -> the game holds, never crashes
                backend.record_error()
                seconds = time.monotonic() - started
                sys.stderr.write(f"[jev-team {seconds:.2f}s] ERROR {err}\n")
                self._send_json(502, {"error": str(err)})
                return
            if verbose:
                sys.stderr.write(f"[jev-team {result['ms']:.0f}ms] rule={result['rule']} bucket={result['bucket']}\n")
            self._send_json(200, result)

    return Handler


def make_client(args: argparse.Namespace):
    kwargs = {"timeout": args.timeout}
    if args.model:
        kwargs["model"] = args.model
    if args.backend == "typesafe":
        return SystemOneClient(resolve_api_key(), **kwargs)
    return WorkersAIClient(resolve_workers_ai_token(), **kwargs)


def serve(backend: JevTeamBackend, model: str, host: str, port: int, verbose: bool = False) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(backend, model, verbose))
    server.daemon_threads = True
    return server


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--backend", choices=["workers-ai", "typesafe"], default="workers-ai")
    p.add_argument("--model", default=None)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--timeout", type=float, default=30.0)
    p.add_argument("--budget-usd", type=float, default=DEFAULT_BUDGET_USD,
                    help="refuse new calls once this process's cumulative estimated cost reaches this "
                         "(default $1.00); pass a negative number to disable the cap")
    p.add_argument("--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    client = make_client(args)
    model = args.model or getattr(client, "model")
    budget = None if args.budget_usd is not None and args.budget_usd < 0 else args.budget_usd
    backend = JevTeamBackend(client, budget_usd=budget)
    server = serve(backend, model, args.host, args.port, verbose=args.verbose)
    print(
        f"promptlane jev-team server on http://{args.host}:{args.port}/  backend={args.backend} model={model} "
        f"budget_usd={budget}",
        flush=True,
    )
    print("POST a team worksheet -> {bucket, rule, answers, ms}; GET /health; Ctrl-C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
