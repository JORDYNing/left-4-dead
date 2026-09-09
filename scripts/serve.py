#!/usr/bin/env python3
"""Launch/reuse a detached, localhost-only game server and open the browser."""
import argparse
import functools
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
HEALTH = '/__afterlight_health'
OPENER = build_opener(ProxyHandler({}))


class GameHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == HEALTH:
            body = json.dumps({'game': 'afterlight', 'root': str(ROOT), 'pid': os.getpid()}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


def is_our_server(url):
    try:
        with OPENER.open(url + HEALTH, timeout=.4) as response:
            data = json.load(response)
        return isinstance(data, dict) and data.get('game') == 'afterlight' and data.get('root') == str(ROOT)
    except (OSError, URLError, ValueError):
        return False


def launch(first_port):
    log_dir = ROOT / 'logs'
    log_dir.mkdir(exist_ok=True)
    log_path = log_dir / 'server.log'
    for port in range(first_port, min(first_port + 10, 65536)):
        url = f'http://127.0.0.1:{port}'
        if is_our_server(url):
            return url
        with log_path.open('ab') as log:
            # Inherit no terminal pipes: closing Terminal or the agent must not break requests.
            child = subprocess.Popen(
                [sys.executable, str(Path(__file__).resolve()), '--serve', '--port', str(port)],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True,
            )
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if is_our_server(url):
                return url
            if child.poll() is not None:
                break
            time.sleep(.05)
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=2)
    raise RuntimeError(f'未找到可用端口。启动日志：{log_path}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--serve', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--no-open', action='store_true', help='启动服务但不打开浏览器')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('端口必须在 1 到 65535 之间')
    if args.serve:
        handler = functools.partial(GameHandler, directory=str(ROOT))
        with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
            server.serve_forever()
    else:
        url = launch(args.port)
        print(f'余光 AFTERLIGHT：{url}', flush=True)
        if not args.no_open:
            webbrowser.open(url)


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(f'启动失败：{error}', file=sys.stderr)
        sys.exit(1)
