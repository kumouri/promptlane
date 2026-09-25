#!/usr/bin/env python3
"""The Jev house bot's HTTP backend -- SHADOW ONLY, not wired into the live arena by default
(docs/jev-decision-model-research.md §4/§6 option 3; runs/jev-house-bot-2026-09-23.md). Reuses
`tools/jev/{client,rules,serializer}.py` unchanged: this file adds only what those modules never
had to do -- serve a network request per game tick and turn a Jev answer set into one action
bucket -- and never re-implements the client, the rule table, or the state text.

`tools/model_server.py`'s `Backend.complete(prompt) -> str` contract cannot carry this (memo §4:
Jev has no `prompt` field). This server's contract is different by design:

    GET  /health   -> {"ok": true, "backend": "jev-house", "model": ..., "requests", "errors",
                        "fallbacks", "last_fallback_error", "avg_seconds", "tokens_in", "cost_usd",
                        "budget_usd", "token_source", "token_expires_in_sec"}
    POST /         body: {"hp", "wave", "tower", "foe", "cd", "instrument", "team", "tick",
                           "clockSec", "foeKind"?, "foeHp"?} -- exactly `rules.Worksheet`'s fields,
                           camelCase on the wire (the caller is TypeScript), snake_case once parsed
                           into a Worksheet. `foeKind`/`foeHp` present -> `foe_detail=True`.
                   -> 200 {"bucket": "recall"|"go_home"|"ability"|"attack_foe"|"attack_tower"|
                            "ride_wave", "rule": 1-7, "answers": {qid: 0.0-1.0}, "ms": float,
                            "fallback"?: "rules-in-code", "error"?: "..."}
                   -> 400 {"error": "..."} only for a malformed worksheet.

THE HOUSE BOT NEVER STOPS PLAYING. If Jev can't answer -- a transport error, a 401 that survived
the client's forced token renewal, or the `--budget-usd` cap -- this server decides with
house-violet.md's seven rules evaluated in code (`rules.ground_truth_answers`, exact rule 3) and
returns 200 with `"fallback": "rules-in-code"`. Every fallback is logged to stderr with `!!!` and
counted in `/health`, and the first successful Jev call afterwards logs `RECOVERED`. Tokens come
from `client.resolve_workers_ai_token_provider`: `$CLOUDFLARE_API_TOKEN` if set, else wrangler's
OAuth token, renewed `--refresh-margin-sec` (default 900 = one 600 s match + slack) before expiry.
`--check-token` renews if needed, prints the token's source and time left, and exits.

Rule 3 is exact here (2026-09-25): `tools/match/jevPilot.ts` sends the foe's real kind and hp, so
q3 asks house-violet.md's real violin/drums condition ("foe is a bearbot under 100 hp") instead of
the offline harness's approximation -- see `rules.py`'s LIVE PATH note. `--approx-q3` drops the
foe detail and asks the old approximate q3, only so a before/after can be measured live
(`runs/jev-jam-readiness-2026-09-25.md`); never use it for real play.

Budget: `--budget-usd` (default 1.00, matching the run's hard cap) refuses new Jev calls once the
process's cumulative estimated cost (from real `usage.input_tokens`, `client.estimate_cost_usd`)
would exceed it -- mirrors `tools/model_server.py`'s `OpenAIBackend.daily_budget_usd` posture.
Past the cap the house bot keeps playing on the rules-in-code fallback above, loudly.
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
    DEFAULT_REFRESH_MARGIN_SEC,
    SystemOneClient,
    WorkersAIClient,
    estimate_cost_usd,
    resolve_api_key,
    resolve_workers_ai_token_provider,
)
from rules import Worksheet, bind_questions, bucket_for_rule, first_match, ground_truth_answers  # noqa: E402
from serializer import state_paragraph  # noqa: E402

DEFAULT_PORT = 8798
DEFAULT_BUDGET_USD = 1.00
REQUIRED_FIELDS = ("hp", "wave", "cd", "instrument", "team", "tick", "clockSec")


class BudgetExceeded(RuntimeError):
    pass


class JevHouseBackend:
    """Wraps a Jev client (`SystemOneClient` or `WorkersAIClient`) with the worksheet -> bucket
    pipeline, a running spend cap, and the rules-in-code fallback. One instance per process, shared
    across requests."""

    def __init__(self, client, budget_usd: float | None = DEFAULT_BUDGET_USD, approx_q3: bool = False):
        self.client = client
        self.budget_usd = budget_usd
        self.approx_q3 = approx_q3
        self.lock = threading.Lock()
        self.requests = 0
        self.errors = 0
        self.fallbacks = 0
        self.last_fallback_error: str | None = None
        self._in_fallback = False
        self.total_seconds = 0.0
        self.tokens_in = 0
        self.cost_usd = 0.0

    @staticmethod
    def _worksheet(body: dict, foe_detail: bool) -> Worksheet:
        return Worksheet(
            hp=float(body["hp"]),
            wave=int(body["wave"]),
            tower=body.get("tower"),
            foe=body.get("foe"),
            cd=float(body["cd"]),
            instrument=body["instrument"],
            team=body["team"],
            tick=int(body["tick"]),
            clock_sec=float(body["clockSec"]),
            foe_detail=foe_detail,
            foe_kind=body.get("foeKind") if foe_detail else None,
            foe_hp=float(body["foeHp"]) if foe_detail and body.get("foeHp") is not None else None,
        )

    def decide(self, body: dict) -> dict:
        """Raises `ValueError` only for a malformed worksheet; any failure to get Jev's answer
        becomes a rules-in-code decision (`_fallback`), never an exception."""
        missing = [f for f in REQUIRED_FIELDS if f not in body]
        if missing:
            raise ValueError(f"missing field(s): {', '.join(missing)}")
        ws = self._worksheet(body, foe_detail="foeKind" in body and not self.approx_q3)
        exact_ws = self._worksheet(body, foe_detail="foeKind" in body)
        started = time.monotonic()
        try:
            with self.lock:
                if self.budget_usd is not None and self.cost_usd >= self.budget_usd:
                    raise BudgetExceeded(
                        f"jev-house budget ${self.budget_usd:.2f} reached (spent ${self.cost_usd:.4f}); refusing this call"
                    )
            response = self.client.ask(state_paragraph(ws), bind_questions(ws.instrument, ws))
        except Exception as err:  # noqa: BLE001 -- every way Jev can fail ends in the same fallback
            return self._fallback(exact_ws, err, started)
        ms = (time.monotonic() - started) * 1000
        with self.lock:
            if self._in_fallback:
                self._in_fallback = False
                sys.stderr.write(f"[jev-house] RECOVERED: Jev answering again after {self.fallbacks} fallback decision(s) so far\n")
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

    def _fallback(self, ws: Worksheet, err: Exception, started: float) -> dict:
        """house-violet.md's seven rules evaluated in code on the exact worksheet -- what a perfect
        Jev would have answered. Loud on purpose: every fallback is a stderr `!!!` line."""
        answers = ground_truth_answers(ws)
        rule = first_match(answers)
        bucket = bucket_for_rule(rule)
        message = f"{type(err).__name__}: {err}"
        with self.lock:
            self.errors += 1
            self.fallbacks += 1
            self.last_fallback_error = message[:300]
            self._in_fallback = True
            n = self.fallbacks
        sys.stderr.write(
            f"[jev-house] !!! FALLBACK #{n}: Jev unreachable ({message[:200]}) -> rules-in-code rule={rule} bucket={bucket}\n"
        )
        sys.stderr.flush()
        return {
            "bucket": bucket,
            "rule": rule,
            "answers": {qid: 1.0 if yes else 0.0 for qid, yes in answers.items()},
            "ms": round((time.monotonic() - started) * 1000, 1),
            "fallback": "rules-in-code",
            "error": message[:300],
        }

    def snapshot(self) -> dict:
        with self.lock:
            avg = self.total_seconds / self.requests if self.requests else 0.0
            snap = {
                "requests": self.requests,
                "errors": self.errors,
                "fallbacks": self.fallbacks,
                "last_fallback_error": self.last_fallback_error,
                "avg_seconds": round(avg, 3),
                "tokens_in": self.tokens_in,
                "cost_usd": round(self.cost_usd, 4),
                "budget_usd": self.budget_usd,
            }
        tokens = getattr(self.client, "tokens", None)
        if tokens is not None:
            snap.update(tokens.status())
        return snap

    def record_error(self) -> None:
        with self.lock:
            self.errors += 1


def make_handler(backend: JevHouseBackend, model: str, verbose: bool = False):
    class Handler(BaseHTTPRequestHandler):
        server_version = "promptlane-jev-house-server/1"

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
                self._send_json(200, {"ok": True, "backend": "jev-house", "model": model, **backend.snapshot()})
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

            try:
                result = backend.decide(body)  # Jev failures already became a fallback decision
            except (ValueError, TypeError, KeyError) as err:
                backend.record_error()
                sys.stderr.write(f"[jev-house] BAD WORKSHEET {err}\n")
                self._send_json(400, {"error": f"bad worksheet: {err}"})
                return
            if verbose:
                sys.stderr.write(f"[jev-house {result['ms']:.0f}ms] rule={result['rule']} bucket={result['bucket']}\n")
            self._send_json(200, result)

    return Handler


def make_client(args: argparse.Namespace):
    kwargs = {"timeout": args.timeout}
    if args.model:
        kwargs["model"] = args.model
    if args.backend == "typesafe":
        return SystemOneClient(resolve_api_key(), **kwargs)
    return WorkersAIClient(resolve_workers_ai_token_provider(margin_sec=args.refresh_margin_sec), **kwargs)


def serve(backend: JevHouseBackend, model: str, host: str, port: int, verbose: bool = False) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(backend, model, verbose))
    server.daemon_threads = True
    return server


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--backend", choices=["workers-ai", "typesafe"], default="workers-ai")
    p.add_argument("--model", default=None, help="default: client.py's WORKERS_AI_MODEL / DEFAULT_MODEL")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--timeout", type=float, default=30.0, help="seconds per Jev call")
    p.add_argument("--budget-usd", type=float, default=DEFAULT_BUDGET_USD,
                    help="refuse new calls once this process's cumulative estimated cost reaches this "
                         "(default $1.00); pass a negative number to disable the cap")
    p.add_argument("--approx-q3", action="store_true",
                    help="MEASUREMENT ONLY: ignore the foe's kind/hp and ask the offline harness's "
                         "approximate rule 3 (the pre-2026-09-25 live behaviour)")
    p.add_argument("--refresh-margin-sec", type=float, default=DEFAULT_REFRESH_MARGIN_SEC,
                    help="renew wrangler's OAuth token once it has less than this left (default 900 = "
                         "one 600 s match + slack); ignored for $CLOUDFLARE_API_TOKEN")
    p.add_argument("--check-token", action="store_true",
                    help="resolve the token (renewing it if inside the margin), print its source and "
                         "time left, and exit -- no server, no Jev call")
    p.add_argument("--verbose", action="store_true")
    return p.parse_args(argv)


def check_token(args: argparse.Namespace) -> int:
    provider = resolve_workers_ai_token_provider(margin_sec=args.refresh_margin_sec)
    provider.token()  # renews if inside the margin
    status = provider.status()
    left = status["token_expires_in_sec"]
    if left is None:
        print(f"token OK: source={status['token_source']} (does not expire)")
        return 0
    ok = left >= args.refresh_margin_sec
    print(f"token {'OK' if ok else 'NOT OK'}: source={status['token_source']} expires in {left}s "
          f"(margin {args.refresh_margin_sec:.0f}s; the server renews automatically)")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.check_token:
        return check_token(args)
    client = make_client(args)
    model = args.model or getattr(client, "model")
    budget = None if args.budget_usd is not None and args.budget_usd < 0 else args.budget_usd
    backend = JevHouseBackend(client, budget_usd=budget, approx_q3=args.approx_q3)
    server = serve(backend, model, args.host, args.port, verbose=args.verbose)
    print(
        f"promptlane jev-house server on http://{args.host}:{args.port}/  backend={args.backend} model={model} "
        f"budget_usd={budget}{'  q3=APPROX (measurement only)' if args.approx_q3 else ''}",
        flush=True,
    )
    print("POST a house-violet.md worksheet -> {bucket, rule, answers, ms}; GET /health; Ctrl-C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
