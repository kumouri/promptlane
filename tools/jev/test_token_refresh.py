"""Tests for client.py's token providers and WorkersAIClient's 401 retry -- no Cloudflare: a temp
wrangler config file, a fake OAuth exchange, and a stub HTTP server standing in for /ai/run."""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import threading
import unittest
import unittest.mock
from contextlib import redirect_stderr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))
import client as C  # noqa: E402
import rules as R  # noqa: E402

NOW = 1_790_000_000.0  # a fixed clock


def write_config(path: Path, token: str, refresh: str, expires_at: float) -> None:
    path.write_text(
        f'oauth_token = "{token}"\n'
        f'expiration_time = "{C._format_expiry(expires_at)}"\n'
        f'refresh_token = "{refresh}"\n'
        'scopes = [ "account:read", "ai:write" ]\n',
        encoding="utf-8",
    )


class FakeExchange:
    def __init__(self, fail: bool = False):
        self.calls: list[str] = []
        self.fail = fail

    def __call__(self, refresh_token: str) -> dict:
        self.calls.append(refresh_token)
        if self.fail:
            raise C.SystemOneError("oauth refresh 400", status=400)
        n = len(self.calls)
        return {"access_token": f"new-access-{n}", "expires_in": 3600, "refresh_token": f"new-refresh-{n}", "scope": "account:read ai:write offline_access"}


class WranglerOAuthTokenTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "default.toml"
        self.stderr = redirect_stderr(io.StringIO())
        self.stderr.__enter__()

    def tearDown(self):
        self.stderr.__exit__(None, None, None)
        self.dir.cleanup()

    def provider(self, exchange, margin=900.0):
        return C.WranglerOAuthToken(self.path, margin_sec=margin, exchange=exchange, clock=lambda: NOW)

    def test_fresh_token_is_used_without_renewal(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        self.assertEqual(self.provider(ex).token(), "old")
        self.assertEqual(ex.calls, [])

    def test_renews_proactively_inside_the_margin_and_writes_back(self):
        write_config(self.path, "old", "r0", NOW + 300)  # 300 s left < 900 s margin: a match would outlive it
        ex = FakeExchange()
        p = self.provider(ex)
        self.assertEqual(p.token(), "new-access-1")
        self.assertEqual(ex.calls, ["r0"])
        self.assertEqual(p.token(), "new-access-1", "renewed once, not every call")
        self.assertEqual(len(ex.calls), 1)
        text = self.path.read_text(encoding="utf-8")
        self.assertIn('oauth_token = "new-access-1"', text)
        self.assertIn('refresh_token = "new-refresh-1"', text, "the rotated refresh token must reach wrangler's file")
        self.assertIn('"offline_access"', text)
        self.assertEqual(C._parse_expiry(C._read_toml_string_value(self.path, "expiration_time")), NOW + 3600)
        self.assertEqual(p.status(), {"token_source": "wrangler-oauth", "token_expires_in_sec": 3600})

    def test_already_expired_token_is_renewed(self):
        write_config(self.path, "old", "r0", NOW - 60)
        self.assertEqual(self.provider(FakeExchange()).token(), "new-access-1")

    def test_force_refresh_renews_even_when_fresh(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        self.assertEqual(self.provider(ex).force_refresh(), "new-access-1")
        self.assertEqual(ex.calls, ["r0"])

    def test_picks_up_a_token_another_process_renewed(self):
        write_config(self.path, "old", "r0", NOW + 300)
        ex = FakeExchange()
        p = self.provider(ex)
        write_config(self.path, "sibling", "r1", NOW + 3500)  # e.g. `wrangler whoami` ran meanwhile
        self.assertEqual(p.token(), "sibling")
        self.assertEqual(ex.calls, [], "must not burn the rotated refresh token")

    def test_failed_renewal_raises_system_one_error(self):
        write_config(self.path, "old", "r0", NOW + 300)
        with self.assertRaises(C.SystemOneError):
            self.provider(FakeExchange(fail=True)).token()


class StubAiRun:
    """A local stand-in for /ai/run that accepts exactly one bearer token and 401s the rest."""

    def __init__(self, accept: str):
        self.accept = accept
        self.seen: list[str] = []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length") or 0))
                token = self.headers.get("Authorization", "").removeprefix("Bearer ")
                stub.seen.append(token)
                if token != stub.accept:
                    payload, status = {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}, 401
                else:
                    answers = {"q1_low_hp_recall": {"noul": 0.97}}
                    payload, status = {"success": True, "result": {"result": {"answers": answers, "usage": {"input_tokens": 5}}}}, 200
                raw = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.server.server_address[1]}/"


class ScriptedTokens:
    def __init__(self, first: str, renewed: str):
        self.current, self.renewed, self.forced = first, renewed, 0

    def token(self):
        return self.current

    def force_refresh(self):
        self.forced += 1
        self.current = self.renewed
        return self.current

    def status(self):
        return {"token_source": "scripted", "token_expires_in_sec": None}


def questions():
    ws = R.Worksheet(hp=50, wave=0, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
    return R.bind_questions("keytar", ws)


class WorkersAIClient401Tests(unittest.TestCase):
    def client(self, stub, tokens):
        c = C.WorkersAIClient(tokens)
        c.url = stub.url
        return c

    def test_401_forces_one_renewal_and_retries(self):
        tokens = ScriptedTokens("expired", "fresh")
        with StubAiRun(accept="fresh") as stub, redirect_stderr(io.StringIO()) as err:
            result = self.client(stub, tokens).ask("state", questions())
        self.assertEqual(result["answers"]["q1_low_hp_recall"]["noul"], 0.97)
        self.assertEqual(stub.seen, ["expired", "fresh"])
        self.assertEqual(tokens.forced, 1)
        self.assertIn("401", err.getvalue())

    def test_a_second_401_propagates_after_exactly_one_retry(self):
        tokens = ScriptedTokens("expired", "still-bad")
        with StubAiRun(accept="fresh") as stub, redirect_stderr(io.StringIO()):
            with self.assertRaises(C.SystemOneError) as ctx:
                self.client(stub, tokens).ask("state", questions())
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(len(stub.seen), 2)

    def test_proactive_renewal_means_the_server_never_sees_the_old_token(self):
        with tempfile.TemporaryDirectory() as d, redirect_stderr(io.StringIO()):
            path = Path(d) / "default.toml"
            write_config(path, "about-to-expire", "r0", NOW + 120)
            provider = C.WranglerOAuthToken(path, exchange=FakeExchange(), clock=lambda: NOW)
            with StubAiRun(accept="new-access-1") as stub:
                self.client(stub, provider).ask("state", questions())
            self.assertEqual(stub.seen, ["new-access-1"])

    def test_plain_string_token_still_works(self):
        with StubAiRun(accept="cf-test-token") as stub:
            c = self.client(stub, "cf-test-token")
            self.assertEqual(c.api_token, "cf-test-token")
            c.ask("state", questions())
        self.assertEqual(stub.seen, ["cf-test-token"])


class RefreshRequestTests(unittest.TestCase):
    def test_sends_wranglers_grant_with_an_explicit_user_agent(self):
        req = C.refresh_request("r0")
        self.assertEqual(req.full_url, C.WRANGLER_TOKEN_URL)
        self.assertIn(b"grant_type=refresh_token", req.data)
        self.assertIn(C.WRANGLER_OAUTH_CLIENT_ID.encode(), req.data)
        # Python-urllib's default UA gets `403 error code: 1010` from dash.cloudflare.com
        self.assertNotIn("Python-urllib", req.get_header("User-agent") or "Python-urllib")


class ResolveProviderTests(unittest.TestCase):
    def test_env_token_is_static(self):
        with unittest.mock.patch.dict(os.environ, {"CLOUDFLARE_API_TOKEN": "cf-env"}):
            p = C.resolve_workers_ai_token_provider()
        self.assertIsInstance(p, C.StaticToken)
        self.assertEqual(p.force_refresh(), "cf-env")


if __name__ == "__main__":
    unittest.main()
