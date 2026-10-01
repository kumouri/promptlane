#!/usr/bin/env python3
"""Jev backend for an entrant's COMPILED schema -- what the Elysium ladder plays on both sides when
`tournament.backend` is a `jev-schema-http` entry (`docs/arena-site-spec.md` §9), and what the compile
panel's practice match plays (`docs/entrant-compile-preview.md`, door B). Each reply carries the door
that answered and the call's spend, which the arena sums per match into its ledger.
Sibling to `house_server.py` / `team_server.py`,
but where those two ask a fixed, hand-written cascade, this one asks whatever rules the entrant's
prose compiled to (`compile.py`): the schema arrives with each request, so the server is stateless
and one process serves every practice match at once. (Its listen backlog is sized for that:
`local_http.py`.)

The decision itself is `fidelity_harness.run_prediction`, unchanged -- the same code that measured
the translator (`docs/prose-to-schema-translator.md` §3): every node's condition anywhere in the
tree (rules, guards, and the rules inside a guard's branches) is one `noul` question in a single Jev
call, the first "yes" in cascade order wins, a guard routes to its yes- or no-branch, and the winning
rule's target selector is resolved against the observation in Python (`target_resolve.py`).

    GET  /health  -> {"ok": true, "backend": "jev-schema", "model", "requests", "errors",
                      "avg_seconds", "tokens_in", "cost_usd", "budget_usd", "jev_backend",
                      "token_source", "token_expires_in_sec", "token_renewals",
                      "jev_fallback_*" (typesafe only)}
    POST /        body: {"schema": <compile.py schema JSON>, "observation": <Observation>}
                  -> 200 {"action": {kind, target?, ability?}, "rule": <rule id | null>,
                          "answers": {rule id: 0.0-1.0}, "ms": float,
                          "door": "typesafe" | "workers-ai" | "stub",   (which door answered THIS call)
                          "tokens_in": int, "cost_usd": float}          (this call's Jev spend)
                  -> non-2xx {"error": "..."} -- the caller (tools/match/jevSchemaPilot.ts) holds.

    python tools/jev/schema_server.py --stub             # no Jev: seeded random answers, $0
    python tools/jev/schema_server.py                    # live Jev, TypeSafe direct, Workers AI behind it
    python tools/jev/schema_server.py --jev-backend workers-ai   # live Jev via Cloudflare Workers AI only

Transport: `--jev-backend typesafe` (default) or `workers-ai` (`client.make_jev_client`); the wire
contract above is the same either way. On typesafe the key is `$PROMPTLANE_JEV_API_KEY` (or its
Windows User-scope value) and is never renewed; a TypeSafe rate limit, overload or connection
failure fails that decision over to Workers AI, and new decisions go there for a short cool-down
(`client.FallbackJevClient`, counted as `jev_fallback_*` in `/health`; `--no-jev-fallback` turns it
off). With no Workers AI credential the server still starts, with one warning, and without the
fallback.

Workers AI token (workers-ai, and typesafe's fallback): `$CLOUDFLARE_API_TOKEN` if set, else wrangler's OAuth token, renewed `--refresh-margin-sec`
(default 900) before it expires -- the same `client.resolve_workers_ai_token_provider` the house and
team servers use. (Until 2026-09-30 this server read the token once at startup, so it answered every
decision 401 once that hour-long token lapsed, and a practice match held on every call.) Concurrent
matches on one server are safe for the token: calls that 401 together share one renewal, and none
retries on a token too new to be accepted yet (`client.py`, "A NEW TOKEN IS NOT LIVE YET";
`runs/jev-client-renew-2026-09-30.md`).

Budget: `--budget-usd` (default 0.50) refuses calls once cumulative estimated Jev cost reaches it.
At Jev's $0.042 per million input tokens a quick practice match (~135 calls x ~500 tokens) costs
about $0.003, so the default covers well over a hundred practice matches per process.
Binds 127.0.0.1 only.
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from client import (  # noqa: E402
    DEFAULT_REFRESH_MARGIN_SEC,
    SystemOneError,
    add_jev_backend_args,
    client_status,
    estimate_cost_usd,
    jev_client_options,
    make_jev_client,
)
from compile import schema_from_dict  # noqa: E402
from fidelity_harness import DumbStubJevClient, run_prediction  # noqa: E402
from local_http import BurstTolerantHTTPServer  # noqa: E402

DEFAULT_PORT = 8797
DEFAULT_BUDGET_USD = 0.50


class BudgetExceeded(RuntimeError):
    pass


class JevSchemaBackend:
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
        if not isinstance(body.get("schema"), dict) or not isinstance(body.get("observation"), dict):
            raise ValueError("body needs {schema: {...}, observation: {...}}")
        schema = schema_from_dict(body["schema"])
        if not schema.root.nodes:
            raise ValueError("schema has no rules")
        with self.lock:
            if self.budget_usd is not None and self.cost_usd >= self.budget_usd:
                raise BudgetExceeded(f"jev-schema budget ${self.budget_usd:.2f} reached (spent ${self.cost_usd:.4f})")
        pred = run_prediction(self.client, schema, body["observation"])
        tokens_in = int(pred["input_tokens"])
        cost = estimate_cost_usd(tokens_in)
        with self.lock:
            self.requests += 1
            self.total_seconds += pred["latency_sec"]
            self.tokens_in += tokens_in
            self.cost_usd += cost
        return {
            "action": pred["action"],
            "rule": pred["fired_rule"],
            "answers": {rid: round(q["noul"], 4) for rid, q in pred["per_question"].items()},
            "ms": round(pred["latency_sec"] * 1000, 1),
            "door": pred.get("door") or "unknown",
            "tokens_in": tokens_in,
            "cost_usd": round(cost, 8),
        }

    def snapshot(self) -> dict:
        with self.lock:
            snap = {
                "requests": self.requests,
                "errors": self.errors,
                "avg_seconds": round(self.total_seconds / self.requests, 3) if self.requests else 0.0,
                "tokens_in": self.tokens_in,
                "cost_usd": round(self.cost_usd, 4),
                "budget_usd": self.budget_usd,
            }
        snap.update(client_status(self.client))
        return snap

    def record_error(self) -> None:
        with self.lock:
            self.errors += 1


def make_handler(backend: JevSchemaBackend, model: str, verbose: bool = False):
    class Handler(BaseHTTPRequestHandler):
        server_version = "promptlane-jev-schema-server/1"

        def log_message(self, fmt, *args):
            if verbose:
                super().log_message(fmt, *args)

        def _send_json(self, status: int, payload: dict) -> None:
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            if self.path.rstrip("/") in ("", "/health"):
                self._send_json(200, {"ok": True, "backend": "jev-schema", "model": model, **backend.snapshot()})
            else:
                self._send_json(404, {"error": "not found; POST {schema, observation}, or GET /health"})

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads((self.rfile.read(length) if length else b"").decode("utf-8"))
                if not isinstance(body, dict):
                    raise TypeError("body must be a JSON object")
            except (ValueError, TypeError) as err:
                self._send_json(400, {"error": f"bad request: {err}"})
                return
            try:
                result = backend.decide(body)
            except BudgetExceeded as err:
                backend.record_error()
                self._send_json(402, {"error": str(err)})
                return
            except (ValueError, KeyError, SystemOneError) as err:
                backend.record_error()
                self._send_json(502 if isinstance(err, SystemOneError) else 400, {"error": str(err)})
                return
            except Exception as err:  # the game holds on any failure, never crashes
                backend.record_error()
                sys.stderr.write(f"[jev-schema] ERROR {err}\n")
                self._send_json(502, {"error": str(err)})
                return
            if verbose:
                sys.stderr.write(f"[jev-schema {result['ms']:.0f}ms] rule={result['rule']} action={result['action']}\n")
            self._send_json(200, result)

    return Handler


def serve(backend: JevSchemaBackend, model: str, host: str = "127.0.0.1", port: int = DEFAULT_PORT, verbose: bool = False) -> BurstTolerantHTTPServer:
    return BurstTolerantHTTPServer((host, port), make_handler(backend, model, verbose))


def make_client(args: argparse.Namespace):
    """The stub, or live Jev over `--jev-backend`: Workers AI with a token provider that renews
    itself (never a token read once), or TypeSafe direct with an API key that needs no renewal."""
    if args.stub:
        return DumbStubJevClient()
    return make_jev_client(args.jev_backend, timeout=args.timeout, refresh_margin_sec=args.refresh_margin_sec,
                           **jev_client_options(args))


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--stub", action="store_true", help="no Jev: seeded random answers (plumbing only, $0)")
    add_jev_backend_args(p)
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--timeout", type=float, default=30.0, help="seconds per Jev call")
    p.add_argument("--budget-usd", type=float, default=DEFAULT_BUDGET_USD, help="negative disables the cap")
    p.add_argument("--refresh-margin-sec", type=float, default=DEFAULT_REFRESH_MARGIN_SEC,
                   help="renew wrangler's OAuth token this many seconds before it expires (default 900; workers-ai, and typesafe's Workers AI fallback)")
    p.add_argument("--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    client = make_client(args)
    model = "stub-jev" if args.stub else client.model
    jev_backend = "stub" if args.stub else args.jev_backend
    budget = None if args.budget_usd < 0 else args.budget_usd
    server = serve(JevSchemaBackend(client, budget), model, "127.0.0.1", args.port, args.verbose)
    print(f"promptlane jev-schema server on http://127.0.0.1:{args.port}/  jev_backend={jev_backend} model={model} budget_usd={budget}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
