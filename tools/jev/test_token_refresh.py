"""Tests for client.py's token providers and WorkersAIClient's 401 retry -- no Cloudflare: a temp
wrangler config file, a fake OAuth exchange, and a stub HTTP server standing in for /ai/run."""
from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import unittest.mock
from concurrent.futures import ThreadPoolExecutor
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


class FakeClock:
    """`clock` and `sleep` for a provider: sleeping advances the clock instead of waiting."""

    def __init__(self, now: float = NOW):
        self.now = now
        self.slept: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, sec: float) -> None:
        self.slept.append(sec)
        self.now += sec


class FakeExchange:
    """A stand-in for the OAuth refresh POST. `delay` holds each exchange open (real seconds) so
    concurrent callers overlap it; `minted` records when each access token was issued."""

    def __init__(self, fail: bool = False, delay: float = 0.0):
        self.calls: list[str] = []
        self.fail = fail
        self.delay = delay
        self.minted: dict[str, float] = {}
        self._lock = threading.Lock()

    def __call__(self, refresh_token: str) -> dict:
        if self.delay:
            time.sleep(self.delay)
        with self._lock:
            self.calls.append(refresh_token)
            n = len(self.calls)
        if self.fail:
            raise C.SystemOneError("oauth refresh 400", status=400)
        self.minted[f"new-access-{n}"] = time.time()
        return {"access_token": f"new-access-{n}", "expires_in": 3600, "refresh_token": f"new-refresh-{n}", "scope": "account:read ai:write offline_access"}


class WranglerOAuthTokenTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "default.toml"
        self.clock = FakeClock()
        self.stderr = redirect_stderr(io.StringIO())
        self.stderr.__enter__()

    def tearDown(self):
        self.stderr.__exit__(None, None, None)
        self.dir.cleanup()

    def provider(self, exchange, margin=900.0):
        return C.WranglerOAuthToken(self.path, margin_sec=margin, exchange=exchange, clock=self.clock, sleep=self.clock.sleep)

    def test_fresh_token_is_used_without_renewal(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        self.assertEqual(self.provider(ex).token(), "old")
        self.assertEqual(ex.calls, [])
        self.assertEqual(self.clock.slept, [], "a token minted long ago is live: no warm-up wait")

    def test_renews_proactively_inside_the_margin_and_writes_back(self):
        write_config(self.path, "old", "r0", NOW + 300)  # 300 s left < 900 s margin: a match would outlive it
        ex = FakeExchange()
        p = self.provider(ex)
        self.assertEqual(p.token(), "old", "the replaced token is still valid: use it while the new one warms up")
        self.assertEqual(ex.calls, ["r0"])
        self.assertEqual(self.clock.slept, [], "nobody waits on a proactive renewal")
        self.clock.now += C.DEFAULT_TOKEN_WARMUP_SEC
        self.assertEqual(p.token(), "new-access-1")
        self.assertEqual(p.token(), "new-access-1", "renewed once, not every call")
        self.assertEqual(len(ex.calls), 1)
        text = self.path.read_text(encoding="utf-8")
        self.assertIn('oauth_token = "new-access-1"', text)
        self.assertIn('refresh_token = "new-refresh-1"', text, "the rotated refresh token must reach wrangler's file")
        self.assertIn('"offline_access"', text)
        self.assertEqual(C._parse_expiry(C._read_toml_string_value(self.path, "expiration_time")), NOW + 3600)
        self.assertEqual(p.status(), {"token_source": "wrangler-oauth", "token_expires_in_sec": 3598, "token_renewals": 1})

    def test_already_expired_token_is_renewed_and_waited_live(self):
        write_config(self.path, "old", "r0", NOW - 60)
        self.assertEqual(self.provider(FakeExchange()).token(), "new-access-1")
        self.assertEqual(self.clock.slept, [C.DEFAULT_TOKEN_WARMUP_SEC], "no valid previous token: wait out the warm-up")

    def test_force_refresh_without_a_failed_token_renews_even_when_fresh(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        self.assertEqual(self.provider(ex).force_refresh(), "new-access-1")
        self.assertEqual(ex.calls, ["r0"])

    def test_401_on_the_current_live_token_renews(self):
        write_config(self.path, "old", "r0", NOW + 3000)  # revoked, say
        ex = FakeExchange()
        p = self.provider(ex)
        self.assertEqual(p.force_refresh("old"), "new-access-1")
        self.assertEqual(ex.calls, ["r0"])
        self.assertEqual(self.clock.slept, [C.DEFAULT_TOKEN_WARMUP_SEC], "returns the new token only once it is live")
        self.assertEqual(p.token(), "new-access-1", "a rejected token is never handed out again")

    def test_stale_401_after_a_renewal_does_not_renew_again(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        p = self.provider(ex)
        self.assertEqual(p.force_refresh("old"), "new-access-1")
        # a call that fetched "old" before the renewal gets its 401 now
        self.assertEqual(p.force_refresh("old"), "new-access-1")
        self.assertEqual(ex.calls, ["r0"], "the token in hand is already newer than the one that failed")
        self.assertEqual((p.renewals, p.renewals_avoided), (1, 1))

    def test_401_on_a_token_still_warming_up_waits_instead_of_renewing(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        p = self.provider(ex)
        p.force_refresh("old")  # mints new-access-1 at NOW (and waits it live)
        self.clock.now = NOW + 0.5  # a call that got its 401 0.5 s into new-access-1's life
        self.clock.slept.clear()
        self.assertEqual(p.force_refresh("new-access-1"), "new-access-1")
        self.assertEqual(ex.calls, ["r0"], "renewing now would only mint another token that isn't live yet")
        self.assertEqual(self.clock.slept, [C.DEFAULT_TOKEN_WARMUP_SEC - 0.5])

    def test_a_previous_token_that_401s_is_not_handed_out_again(self):
        write_config(self.path, "old", "r0", NOW + 300)
        p = self.provider(FakeExchange())
        self.assertEqual(p.token(), "old")  # new-access-1 is warming up
        self.assertEqual(p.force_refresh("old"), "new-access-1")
        self.clock.now -= C.DEFAULT_TOKEN_WARMUP_SEC  # even back inside the warm-up window
        self.assertEqual(p.token(), "new-access-1")

    def test_picks_up_a_token_another_process_renewed(self):
        write_config(self.path, "old", "r0", NOW + 300)
        ex = FakeExchange()
        p = self.provider(ex)
        write_config(self.path, "sibling", "r1", NOW + 3500)  # e.g. `wrangler whoami` ran meanwhile
        self.assertEqual(p.token(), "sibling")
        self.assertEqual(ex.calls, [], "must not burn the rotated refresh token")

    def test_a_401_picks_up_a_sibling_renewal_instead_of_exchanging(self):
        write_config(self.path, "old", "r0", NOW + 3000)
        ex = FakeExchange()
        p = self.provider(ex)
        write_config(self.path, "sibling", "r1", NOW + 3500)
        self.assertEqual(p.force_refresh("old"), "sibling")
        self.assertEqual(ex.calls, [])

    def test_failed_renewal_raises_system_one_error(self):
        write_config(self.path, "old", "r0", NOW + 300)
        with self.assertRaises(C.SystemOneError):
            self.provider(FakeExchange(fail=True)).token()


class SingleFlightTests(unittest.TestCase):
    """Real threads, real clock: concurrent 401s on one credential cost exactly one renewal."""

    N = 8

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "default.toml"
        write_config(self.path, "old", "r0", time.time() + 3000)
        self.stderr = redirect_stderr(io.StringIO())
        self.stderr.__enter__()

    def tearDown(self):
        self.stderr.__exit__(None, None, None)
        self.dir.cleanup()

    def concurrently(self, fn):
        barrier = threading.Barrier(self.N)

        def run(_):
            barrier.wait()
            return fn()

        with ThreadPoolExecutor(self.N) as pool:
            return list(pool.map(run, range(self.N)))

    def test_n_concurrent_401s_cost_exactly_one_renewal(self):
        ex = FakeExchange(delay=0.1)  # hold the exchange open so every caller arrives during it
        p = C.WranglerOAuthToken(self.path, exchange=ex, warmup_sec=0.05)
        results = self.concurrently(lambda: p.force_refresh("old"))
        self.assertEqual(ex.calls, ["r0"])
        self.assertEqual(results, ["new-access-1"] * self.N)
        self.assertEqual((p.renewals, p.renewals_avoided), (1, self.N - 1))

    def test_two_providers_on_one_credential_share_the_flight(self):
        ex = FakeExchange(delay=0.1)
        a = C.WranglerOAuthToken(self.path, exchange=ex, warmup_sec=0.05)
        b = C.WranglerOAuthToken(self.path, exchange=ex, warmup_sec=0.05)
        results = self.concurrently(lambda: (a if threading.get_ident() % 2 else b).force_refresh("old"))
        self.assertEqual(ex.calls, ["r0"], "the second provider picks the renewal up off disk")
        self.assertEqual(set(results), {"new-access-1"})


class StubAiRun:
    """A local stand-in for /ai/run. `accept` is the one bearer token it takes, or a predicate over
    the token; everything else gets Cloudflare's 401."""

    def __init__(self, accept):
        self.accept = (lambda t: t == accept) if isinstance(accept, str) else accept
        self.seen: list[str] = []
        self.rejected: list[str] = []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length") or 0))
                token = self.headers.get("Authorization", "").removeprefix("Bearer ")
                stub.seen.append(token)
                if not stub.accept(token):
                    stub.rejected.append(token)
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
        self.current, self.renewed, self.forced = first, renewed, []

    def token(self):
        return self.current

    def force_refresh(self, failed=None):
        self.forced.append(failed)
        self.current = self.renewed
        return self.current

    def status(self):
        return {"token_source": "scripted", "token_expires_in_sec": None, "token_renewals": 0}


def questions():
    ws = R.Worksheet(hp=50, wave=0, tower=None, foe=None, cd=0.0, instrument="keytar", team="violet", tick=1, clock_sec=0.05)
    return R.bind_questions("keytar", ws)


class WorkersAIClient401Tests(unittest.TestCase):
    def client(self, stub, tokens):
        c = C.WorkersAIClient(tokens)
        c.url = stub.url
        return c

    def test_401_hands_the_failed_token_over_and_retries_once(self):
        tokens = ScriptedTokens("expired", "fresh")
        with StubAiRun(accept="fresh") as stub, redirect_stderr(io.StringIO()) as err:
            result = self.client(stub, tokens).ask("state", questions())
        self.assertEqual(result["answers"]["q1_low_hp_recall"]["noul"], 0.97)
        self.assertEqual(stub.seen, ["expired", "fresh"])
        self.assertEqual(tokens.forced, ["expired"], "the provider must know which token failed")
        self.assertIn("401", err.getvalue())

    def test_a_second_401_propagates_after_exactly_one_retry(self):
        tokens = ScriptedTokens("expired", "still-bad")
        with StubAiRun(accept="fresh") as stub, redirect_stderr(io.StringIO()):
            with self.assertRaises(C.SystemOneError) as ctx:
                self.client(stub, tokens).ask("state", questions())
        self.assertEqual(ctx.exception.status, 401)
        self.assertEqual(len(stub.seen), 2)

    def test_proactive_renewal_bridges_the_warm_up_on_the_old_token(self):
        with tempfile.TemporaryDirectory() as d, redirect_stderr(io.StringIO()):
            path = Path(d) / "default.toml"
            write_config(path, "about-to-expire", "r0", NOW + 120)
            clock = FakeClock()
            provider = C.WranglerOAuthToken(path, exchange=FakeExchange(), clock=clock, sleep=clock.sleep)
            with StubAiRun(accept=lambda t: t in ("about-to-expire", "new-access-1")) as stub:
                c = self.client(stub, provider)
                c.ask("state", questions())
                clock.now += C.DEFAULT_TOKEN_WARMUP_SEC
                c.ask("state", questions())
            self.assertEqual(stub.seen, ["about-to-expire", "new-access-1"])
            self.assertEqual(stub.rejected, [])

    def test_concurrent_401s_through_the_client_cost_one_renewal_and_no_unanswered_call(self):
        """The storm from runs/house-tiers-2026-09-30.md, in miniature: the live token is revoked
        under N concurrent calls, and -- as measured live -- a new token 401s for its first moments.
        Every call must still get its answer, on exactly one renewal."""
        n = 8
        with tempfile.TemporaryDirectory() as d, redirect_stderr(io.StringIO()):
            path = Path(d) / "default.toml"
            write_config(path, "revoked", "r0", time.time() + 3000)
            ex = FakeExchange(delay=0.05)
            provider = C.WranglerOAuthToken(path, exchange=ex, warmup_sec=0.3)

            def live(token):  # "revoked" never; a new token only 0.15 s after it was minted
                minted = ex.minted.get(token)
                return minted is not None and time.time() - minted >= 0.15

            with StubAiRun(accept=live) as stub:
                c = self.client(stub, provider)
                barrier = threading.Barrier(n)

                def one(_):
                    barrier.wait()
                    return c.ask("state", questions())

                with ThreadPoolExecutor(n) as pool:
                    results = list(pool.map(one, range(n)))
        self.assertEqual(len(results), n)
        self.assertEqual(ex.calls, ["r0"])
        self.assertEqual(sorted(set(stub.rejected)), ["revoked"], "no retry ever lands on a token that isn't live yet")

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
        self.assertEqual(p.force_refresh("cf-env"), "cf-env")


if __name__ == "__main__":
    unittest.main()
