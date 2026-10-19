"""Run the real local HTTP app from source while a packaged release is open."""
from http.server import ThreadingHTTPServer
from pathlib import Path
import secrets
import sys
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mockaize import storage
from mockaize.server import Handler

if __name__ == "__main__":
    storage.initialize()
    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        server.daemon_threads = True
        server.session_token = secrets.token_urlsafe(32)
        server.csrf_token = secrets.token_urlsafe(32)
        server.client_states = {}
        server.client_state_lock = threading.Lock()
        print(f"Preview: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
