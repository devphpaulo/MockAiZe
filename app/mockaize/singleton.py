"""Per-user, per-session process ownership and local open rendezvous."""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from .storage import data_directory


class InstanceGuard:
    def __init__(self):
        self.handle = None
        self.path = data_directory() / "instance.json"
        self.pid = os.getpid()

    @staticmethod
    def _mutex_name() -> str:
        if os.name != "nt":
            return "MockAize-Local-Instance"
        advapi = ctypes.WinDLL("advapi32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.GetCurrentProcess.restype = ctypes.c_void_p
        kernel32.CloseHandle.argtypes = (ctypes.c_void_p,)
        kernel32.LocalFree.argtypes = (ctypes.c_void_p,)
        advapi.OpenProcessToken.argtypes = (ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_void_p))
        advapi.OpenProcessToken.restype = ctypes.c_int
        advapi.GetTokenInformation.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong))
        advapi.GetTokenInformation.restype = ctypes.c_int
        advapi.ConvertSidToStringSidW.argtypes = (ctypes.c_void_p, ctypes.POINTER(ctypes.c_wchar_p))
        advapi.ConvertSidToStringSidW.restype = ctypes.c_int
        token = ctypes.c_void_p()
        if not advapi.OpenProcessToken(kernel32.GetCurrentProcess(), 0x0008, ctypes.byref(token)):
            raise ctypes.WinError(ctypes.get_last_error())
        required = ctypes.c_ulong()
        advapi.GetTokenInformation(token, 1, None, 0, ctypes.byref(required))
        buffer = ctypes.create_string_buffer(required.value)
        try:
            if not advapi.GetTokenInformation(token, 1, buffer, required.value, ctypes.byref(required)):
                raise ctypes.WinError(ctypes.get_last_error())
            sid_pointer = ctypes.cast(buffer, ctypes.POINTER(ctypes.c_void_p))[0]
            sid_string = ctypes.c_wchar_p()
            if not advapi.ConvertSidToStringSidW(sid_pointer, ctypes.byref(sid_string)):
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                digest = hashlib.sha256(sid_string.value.encode("ascii")).hexdigest()[:24]
            finally:
                kernel32.LocalFree(ctypes.cast(sid_string, ctypes.c_void_p))
        finally:
            kernel32.CloseHandle(token)
        # Local\ isolates the user's SID within the current Windows session.
        return f"Local\\MockAize-{digest}"

    def acquire(self) -> bool:
        if os.name == "nt":
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.CreateMutexW.argtypes = (ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p)
            kernel32.CreateMutexW.restype = ctypes.c_void_p
            ctypes.set_last_error(0)
            self.handle = kernel32.CreateMutexW(None, 1, self._mutex_name())
            if not self.handle:
                raise ctypes.WinError(ctypes.get_last_error())
            if ctypes.get_last_error() == 183:
                kernel32.CloseHandle(self.handle)
                self.handle = None
                return False
            return True

        lock = self.path.with_suffix(".lock")
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(fd, str(self.pid).encode("ascii")); os.close(fd)
            self.handle = lock
            return True
        except FileExistsError:
            return False

    def publish(self, url: str) -> None:
        payload = {"schemaVersion": 1, "pid": self.pid, "url": url,
                   "startedAt": datetime.now(timezone.utc).isoformat()}
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, self.path)

    @staticmethod
    def _is_safe_local_url(value: object) -> bool:
        if not isinstance(value, str):
            return False
        try:
            parsed = urlsplit(value)
            port = parsed.port
        except ValueError:
            return False
        return (parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and port is not None
                and 1 <= port <= 65535 and parsed.username is None and parsed.password is None
                and parsed.path == "/" and not parsed.query and not parsed.fragment
                and parsed.netloc == f"127.0.0.1:{port}")

    def open_existing(self) -> bool:
        # The owner writes its URL only after binding loopback. A bounded wait
        # covers the small interval between acquiring the mutex and publishing.
        for _ in range(50):
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
                if not isinstance(payload, dict) or type(payload.get("schemaVersion")) is not int or payload.get("schemaVersion") != 1:
                    raise ValueError("Rendezvous inválido.")
                url = payload.get("url", "")
                if self._is_safe_local_url(url):
                    import webbrowser
                    return bool(webbrowser.open(url))
            except (OSError, ValueError, json.JSONDecodeError):
                pass
            time.sleep(0.1)
        return False

    def release(self) -> None:
        if os.name == "nt" and self.handle:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.ReleaseMutex.argtypes = (ctypes.c_void_p,)
            kernel32.CloseHandle.argtypes = (ctypes.c_void_p,)
            kernel32.ReleaseMutex(self.handle)
            kernel32.CloseHandle(self.handle)
            self.handle = None
        elif isinstance(self.handle, Path):
            try: self.handle.unlink()
            except FileNotFoundError: pass
            self.handle = None
        try:
            if json.loads(self.path.read_text(encoding="utf-8")).get("pid") == self.pid:
                self.path.unlink()
        except (OSError, ValueError, json.JSONDecodeError):
            pass
