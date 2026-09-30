"""The HTTP server class every Jev server (`schema_server.py`, `house_server.py`, `team_server.py`)
listens with: `ThreadingHTTPServer` with a listen backlog that survives a whole tick of bots
connecting at once.

`socketserver.TCPServer.request_queue_size` defaults to **5**. Each bot opens a fresh connection
per decision (the handlers speak HTTP/1.0, so nothing is kept alive), and every bot in a match asks
on the same tick. One match is 6 bots, which fits. Two matches on one server are 12 connects in the
same instant. Past the fifth, Windows refuses the connection outright, and the caller sees
`fetch failed <- ECONNREFUSED` and holds for that decision. Measured on 2026-09-30
(`runs/jev-server-backlog-2026-09-30.md`): 12 concurrent connects against backlog 5 lost 66 of 360
calls. With backlog 128, bursts of 12, 24 and 64 lost none.

128 was the classic Linux `somaxconn` cap. Anything this server sees is far below it. A bracket
round's worth of matches on one server is still dozens of bots, not hundreds.
"""
from __future__ import annotations

from http.server import ThreadingHTTPServer

LISTEN_BACKLOG = 128


class BurstTolerantHTTPServer(ThreadingHTTPServer):
    # Read by `server_activate()` inside `__init__`, so it has to be a class attribute, not a
    # setting applied after construction.
    request_queue_size = LISTEN_BACKLOG
    daemon_threads = True
