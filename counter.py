#!/usr/bin/env python3
"""Tiny self-hosted visitor counter for crs-net.web.id.

Privacy-friendly: counts page loads only, stores a single integer on disk,
no cookies, no IPs, no third party. Served same-origin behind nginx so the
site's Content-Security-Policy (connect-src 'self') is satisfied.
"""
import os
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

COUNTER_FILE = os.environ.get("COUNTER_FILE", "/var/lib/crsnet/counter.txt")
os.makedirs(os.path.dirname(COUNTER_FILE), exist_ok=True)
if not os.path.exists(COUNTER_FILE):
    open(COUNTER_FILE, "w").write("0")


def read_count():
    try:
        return int(open(COUNTER_FILE).read().strip() or "0")
    except Exception:
        return 0


def inc():
    n = read_count() + 1
    tmp = COUNTER_FILE + ".tmp"
    open(tmp, "w").write(str(n))
    os.replace(tmp, COUNTER_FILE)  # atomic-ish replace, low-traffic safe
    return n


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path == "/visits":
            n = inc()
            body = json.dumps({"count": n}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8081), Handler).serve_forever()
