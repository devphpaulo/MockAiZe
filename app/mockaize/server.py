from __future__ import annotations

import ctypes
import json
import hashlib
import os
import secrets
import sys
import threading
import time
import webbrowser
import uuid
import sqlite3
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from urllib.parse import quote, unquote, urlparse

from . import storage


def _report_startup_error(message: str) -> None:
    text = f"Não foi possível iniciar o MockAíZé.\n\n{message}"
    if os.name == "nt":
        _show_message_box(text, 0x00000010)
    else:
        print(text, file=sys.stderr)


def _show_message_box(message: str, flags: int) -> None:
    if os.name != "nt":
        print(message, file=sys.stderr)
        return
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.MessageBoxW.argtypes = (ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint)
    user32.MessageBoxW.restype = ctypes.c_int
    user32.MessageBoxW(None, message, "MockAíZé", flags)


class Handler(BaseHTTPRequestHandler):
    server_version = "MockAize/0.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, *_args):
        pass

    def _send(self, status: int, body: bytes, content_type: str, extra_headers: dict | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.send_header("Cache-Control", "no-store")
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _is_local_request(self) -> bool:
        expected_host = f"127.0.0.1:{self.server.server_port}"
        host = self.headers.get("Host", "").lower()
        origin = self.headers.get("Origin")
        return host == expected_host and (origin is None or origin == f"http://{expected_host}")

    def _has_session(self, mutation: bool = False) -> bool:
        cookies = {}
        for chunk in self.headers.get("Cookie", "").split(";"):
            if "=" in chunk:
                key, value = chunk.strip().split("=", 1)
                cookies[key] = value
        valid = secrets.compare_digest(cookies.get("mockaize_session", ""), self.server.session_token)
        if mutation:
            origin = f"http://127.0.0.1:{self.server.server_port}"
            valid = valid and self.headers.get("Origin") == origin and secrets.compare_digest(
                self.headers.get("X-CSRF-Token", ""), self.server.csrf_token)
        return valid

    def _read_body(self, limit: int, content_type: str | None = None) -> bytes:
        raw_size = self.headers.get("Content-Length")
        if raw_size is None:
            raise ValueError("Content-Length é obrigatório.")
        size = int(raw_size)
        if size < 0 or size > limit:
            raise ValueError("Solicitação excede o limite permitido.")
        if content_type and self.headers.get_content_type() != content_type:
            raise TypeError("Tipo de conteúdo não aceito.")
        body = self.rfile.read(size)
        if len(body) != size:
            raise ValueError("Solicitação incompleta.")
        return body

    def do_GET(self):
        if not self._is_local_request():
            return self._send(403, b"Forbidden", "text/plain; charset=utf-8")
        route = urlparse(self.path).path
        if route.startswith("/api/") and not self._has_session():
            return self._send(403, b"Sessao invalida", "text/plain; charset=utf-8")
        if route == "/api/library":
            from . import library
            return self._send(200, json.dumps(library.snapshot(), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if route == "/api/tree":
            body = json.dumps(storage.tree(), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if route == "/api/settings":
            return self._send(200, json.dumps(storage.get_settings(), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if route == "/api/backup/export":
            body = json.dumps(storage.export_workspace_backup(), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            return self._send(200, body, "application/json; charset=utf-8", {
                "Content-Disposition": f"attachment; filename=mockaize-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"})
        if route == "/api/backups":
            return self._send(200, json.dumps(storage.list_operational_backups(), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        parts = route.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "backups"]:
            result = storage.get_operational_backup(parts[2])
            if result is None: return self._send(404, b"Not found", "text/plain; charset=utf-8")
            record, path = result
            if hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
                return self._send(409, b"Backup hash mismatch", "text/plain; charset=utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.sqlite3")
            self.send_header("Content-Length", str(record["byte_length"]))
            self.send_header("Content-Disposition", f'attachment; filename="mockaize-{record["id"]}.sqlite3"')
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            with path.open("rb") as stream:
                while chunk := stream.read(1024 * 1024): self.wfile.write(chunk)
            return
        if len(parts) == 4 and parts[:2] == ["api", "bundles"]:
            from . import powershell_export
            member = powershell_export.get_bundle_member(parts[2], parts[3])
            if member is None:
                return self._send(404, b"Not found", "text/plain; charset=utf-8")
            _, content = member
            filename = "MockAize.ps1" if parts[3] == "ps1" else "MockAize.bat"
            content_type = "text/plain; charset=utf-8" if parts[3] == "ps1" else "application/octet-stream"
            return self._send(200, content, content_type, {"Content-Disposition": f'attachment; filename="{filename}"'})
        if len(parts) == 4 and parts[:2] == ["api", "variations"] and parts[3] == "artifacts.zip":
            from urllib.parse import parse_qs
            try:
                ids = parse_qs(urlparse(self.path).query).get("id", [])
                body = storage.artifact_archive(parts[2], ids)
            except ValueError as exc:
                return self._send(400, json.dumps({"error": str(exc)}).encode(), "application/json; charset=utf-8")
            return self._send(200, body, "application/zip", {"Content-Disposition": 'attachment; filename="MockAiZe-retornos.zip"'})
        if len(parts) == 4 and parts[:2] == ["api", "variations"] and parts[3] == "artifacts":
            body = json.dumps(storage.artifacts_for_variation(parts[2]), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if len(parts) == 3 and parts[:2] == ["api", "variations"]:
            variation = storage.get_variation(parts[2])
            if variation is None:
                return self._send(404, b"Not found", "text/plain; charset=utf-8")
            return self._send(200, json.dumps(variation, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if len(parts) == 3 and parts[:2] == ["api", "artifacts"]:
            result = storage.get_artifact(parts[2])
            if result is None or not result[1].is_file():
                return self._send(404, b"Not found", "text/plain; charset=utf-8")
            artifact, path = result
            self.send_response(200)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(artifact["byte_length"]))
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(artifact['file_name'], safe='')}")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            with path.open("rb") as stream:
                while chunk := stream.read(1024 * 1024):
                    self.wfile.write(chunk)
            return
        if route.startswith("/assets/"):
            filename = route.removeprefix("/assets/")
            if filename not in {"mockaize-banner-v3.png", "mockaize-favicon.png"}:
                return self._send(404, b"Not found", "text/plain; charset=utf-8")
            asset = files("mockaize").joinpath("web/assets", filename).read_bytes()
            return self._send(200, asset, "image/png")
        if route in {"/studio.js", "/studio-api.js", "/return-models.js", "/studio-layout.js", "/manual-studio.js", "/library.js", "/library.css", "/studio.css", "/select.css", "/select.js", "/ui-motion.css", "/ui-motion.js", "/date-picker.js", "/record-pagination.js", "/editor-components.css", "/return-combobox.js"}:
            asset = files("mockaize").joinpath("web", route.removeprefix("/")).read_bytes()
            content_type = "text/css; charset=utf-8" if route.endswith(".css") else "text/javascript; charset=utf-8"
            return self._send(200, asset, content_type)
        if route == "/engine.js":
            engine = files("mockaize").joinpath("web", "engine.js").read_bytes()
            return self._send(200, engine, "text/javascript; charset=utf-8")
        if route == "/app.js":
            app = files("mockaize").joinpath("web", "app.js").read_bytes()
            return self._send(200, app, "text/javascript; charset=utf-8")
        if route == "/style.css":
            style = files("mockaize").joinpath("web", "style.css").read_bytes()
            return self._send(200, style, "text/css; charset=utf-8")
        if route == "/favicon.ico":
            icon_path = files("mockaize").joinpath("assets", "mockaize.ico")
            if icon_path.is_file():
                return self._send(200, icon_path.read_bytes(), "image/vnd.microsoft.icon")
            asset = files("mockaize").joinpath("web/assets", "mockaize-favicon.png").read_bytes()
            return self._send(200, asset, "image/png")
        if route not in ("/", "/index.html", "/studio"):
            return self._send(404, b"Not found", "text/plain; charset=utf-8")
        page_name = "studio.html" if route == "/studio" else "index.html"
        page = files("mockaize").joinpath("web", page_name).read_text(encoding="utf-8")
        page = page.replace("__CSRF_TOKEN__", self.server.csrf_token)
        return self._send(200, page.encode("utf-8"), "text/html; charset=utf-8", {
            "Set-Cookie": f"mockaize_session={self.server.session_token}; HttpOnly; SameSite=Strict; Path=/"})

    def do_POST(self):
        if not self._is_local_request() or not self._has_session(mutation=True):
            return self._send(403, b"Forbidden", "text/plain; charset=utf-8")
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) == 4 and parts[:2] == ["api", "variations"] and parts[3] == "artifacts":
            try:
                revision = int(self.headers.get("X-Expected-Revision", ""))
                file_name = unquote(self.headers.get("X-File-Name", ""), errors="strict")
                xml = self._read_body(100_000_000, "application/xml").decode("utf-8", errors="strict")
                artifact = storage.publish_xml(parts[2], revision, file_name, xml)
                return self._send(201, json.dumps(artifact, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, UnicodeError, KeyError, RuntimeError) as exc:
                body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
                return self._send(409 if isinstance(exc, RuntimeError) else 400, body, "application/json; charset=utf-8")
            except Exception as exc:
                body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
                return self._send(400, body, "application/json; charset=utf-8")
        if len(parts) == 4 and parts[:2] == ["api", "variations"] and parts[3] == "powershell":
            try:
                payload = json.loads(self._read_body(16_384, "application/json"))
                from . import powershell_export
                bundle = powershell_export.create_bundle(parts[2], payload.get("expectedRevision"))
                return self._send(201, json.dumps(bundle, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, KeyError, RuntimeError, json.JSONDecodeError) as exc:
                status = 409 if isinstance(exc, RuntimeError) else 400
                return self._send(status, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if parts == ["api", "lifecycle", "report"]:
            try:
                payload = json.loads(self._read_body(4096, "application/json"))
                if not isinstance(payload, dict) or set(payload) != {"clientId", "dirty"} or not isinstance(payload["dirty"], bool):
                    raise ValueError("Estado de página inválido.")
                client_id = str(uuid.UUID(payload["clientId"]))
                with self.server.client_state_lock:
                    self.server.client_states[client_id] = (payload["dirty"], time.monotonic())
                return self._send(204, b"", "application/json; charset=utf-8")
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                return self._send(400, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if parts == ["api", "backups"]:
            try:
                self._read_body(1024, "application/json")
                result = storage.create_operational_backup()
                return self._send(201, json.dumps(result, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, OSError, sqlite3.DatabaseError) as exc:
                return self._send(400, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if len(parts) == 4 and parts[:2] == ["api", "backups"] and parts[3] == "restore":
            try:
                payload = json.loads(self._read_body(1024, "application/json"))
                if payload != {"confirm": True}: raise ValueError("Confirme a restauração do snapshot.")
                result = storage.restore_operational_backup(parts[2])
                return self._send(200, json.dumps(result, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, KeyError, OSError, sqlite3.DatabaseError, RuntimeError) as exc:
                status = 404 if isinstance(exc, KeyError) else 400
                return self._send(status, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if parts == ["api", "backup", "import"]:
            try:
                payload = json.loads(self._read_body(15_000_000, "application/json"))
                result = storage.import_workspace_backup(payload)
                return self._send(200, json.dumps({"imported": result}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                return self._send(400, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if parts == ["api", "library"]:
            try:
                from . import library
                payload = json.loads(self._read_body(16_384, "application/json"))
                result = library.command(payload)
                return self._send(200, json.dumps(result, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, KeyError, sqlite3.DatabaseError) as exc:
                return self._send(400, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if parts != ["api", "entities"]:
            return self._send(404, b"Not found", "text/plain; charset=utf-8")
        try:
            payload = json.loads(self._read_body(16_384, "application/json"))
            entity = storage.create_entity(payload.get("kind", ""), payload.get("parentId"), payload.get("name", ""))
            body = json.dumps({"entity": entity}, ensure_ascii=False).encode()
            return self._send(201, body, "application/json; charset=utf-8")
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
            return self._send(400, body, "application/json; charset=utf-8")
        except Exception as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
            return self._send(400, body, "application/json; charset=utf-8")

    def do_PUT(self):
        if not self._is_local_request() or not self._has_session(mutation=True):
            return self._send(403, b"Forbidden", "text/plain; charset=utf-8")
        parts = urlparse(self.path).path.strip("/").split("/")
        if parts == ["api", "settings"]:
            try:
                payload = json.loads(self._read_body(16_384, "application/json"))
                result = storage.save_settings(payload)
                return self._send(200, json.dumps(result, ensure_ascii=False).encode(), "application/json; charset=utf-8")
            except (ValueError, TypeError, json.JSONDecodeError) as exc:
                return self._send(400, json.dumps({"error": str(exc)}, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        if len(parts) != 3 or parts[:2] != ["api", "variations"]:
            return self._send(404, b"Not found", "text/plain; charset=utf-8")
        try:
            payload = json.loads(self._read_body(16_200_000, "application/json"))
            variation = storage.save_variation(parts[2], payload.get("expectedRevision"), payload.get("config"), name=payload.get("name"))
            return self._send(200, json.dumps(variation, ensure_ascii=False).encode(), "application/json; charset=utf-8")
        except (ValueError, TypeError, json.JSONDecodeError, KeyError, RuntimeError) as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
            return self._send(409 if isinstance(exc, RuntimeError) else 400, body, "application/json; charset=utf-8")
        except Exception as exc:
            body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode()
            return self._send(400, body, "application/json; charset=utf-8")


def serve():
    from .singleton import InstanceGuard
    guard = None
    owns_instance = False
    server = None
    worker = None
    try:
        guard = InstanceGuard()
        if not guard.acquire():
            if not guard.open_existing():
                _show_message_box("O MockAíZé já está em execução, mas não foi possível abrir sua página no navegador.", 0x00000030)
            return
        owns_instance = True
        storage.initialize()
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.daemon_threads = True
        server.session_token = secrets.token_urlsafe(32)
        server.csrf_token = secrets.token_urlsafe(32)
        server.client_states = {}
        server.client_state_lock = threading.Lock()
        def has_unsaved_clients():
            now = time.monotonic()
            with server.client_state_lock:
                for client, (_, seen) in list(server.client_states.items()):
                    if now - seen > 300:
                        del server.client_states[client]
                return any(dirty for dirty, _ in server.client_states.values())
        server.has_unsaved_clients = has_unsaved_clients
        url = f"http://127.0.0.1:{server.server_port}/"
        guard.publish(url)
        def open_initial_page():
            try:
                if not webbrowser.open(url):
                    _show_message_box("O navegador padrão não abriu. Use o menu do ícone do MockAíZé para tentar novamente.", 0x00000030)
            except Exception as exc:
                _show_message_box(f"Falha ao abrir o navegador padrão. Use o menu do ícone do MockAíZé para tentar novamente.\n\n{exc}", 0x00000030)
        threading.Timer(0.35, open_initial_page).start()
        print(f"MockAíZé disponível em {url}")
        if os.name == "nt":
            from .tray import Tray
            worker = threading.Thread(target=server.serve_forever, name="mockaize-http", daemon=True)
            worker.start()
            Tray(url, exit_check=server.has_unsaved_clients).run()
        else:
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        _report_startup_error(str(exc))
    finally:
        if worker is not None and worker.is_alive() and server is not None:
            server.shutdown()
        if server is not None:
            server.server_close()
        if guard is not None and owns_instance:
            guard.release()
