"""The listen backlog the Jev servers (and tools/model_server.py) listen with -- local_http.py."""
from __future__ import annotations

import os
import socket
import sys
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # tools/, for model_server

import house_server  # noqa: E402
import model_server  # noqa: E402
import schema_server  # noqa: E402
import team_server  # noqa: E402
from local_http import LISTEN_BACKLOG, BurstTolerantHTTPServer  # noqa: E402

BURST = 32  # well past two matches' 12 bots


def pending_connects(server_cls, n: int) -> int:
    """Open `n` connections to a server that never accepts -- a tick's burst landing while the
    accept loop is busy -- and count how many the listen queue took before one was refused or
    timed out."""
    server = server_cls(("127.0.0.1", 0), BaseHTTPRequestHandler)
    socks = []
    try:
        for _ in range(n):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3.0)
            socks.append(s)
            try:
                s.connect(server.server_address)
            except OSError:  # ConnectionRefusedError on Windows, a timeout where SYNs are dropped
                return len(socks) - 1
        return n
    finally:
        for s in socks:
            s.close()
        server.server_close()


class BacklogTests(unittest.TestCase):
    def test_a_burst_of_connects_all_queue_while_the_server_is_not_accepting(self):
        self.assertEqual(pending_connects(BurstTolerantHTTPServer, BURST), BURST)

    @unittest.skipUnless(sys.platform == "win32", "Windows refuses past the backlog; Linux drops SYNs and retries")
    def test_control_the_stdlib_default_backlog_refuses_the_sixth(self):
        # The bug itself: socketserver's request_queue_size = 5.
        self.assertEqual(ThreadingHTTPServer.request_queue_size, 5)
        self.assertLess(pending_connects(ThreadingHTTPServer, BURST), BURST)

    def test_every_server_listens_with_the_large_backlog(self):
        servers = [
            schema_server.serve(None, "m", "127.0.0.1", 0),
            house_server.serve(None, "m", "127.0.0.1", 0),
            team_server.serve(None, "m", "127.0.0.1", 0),
            model_server.serve(None, "127.0.0.1", 0),
        ]
        try:
            for server in servers:
                with self.subTest(server=type(server).__module__):
                    self.assertEqual(server.request_queue_size, LISTEN_BACKLOG)
                    self.assertTrue(server.daemon_threads)
        finally:
            for server in servers:
                server.server_close()


if __name__ == "__main__":
    unittest.main()
