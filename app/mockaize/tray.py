"""Small Windows notification-area host implemented with the Win32 API."""
from __future__ import annotations

import ctypes
import os
import webbrowser
from ctypes import wintypes
from pathlib import Path


if os.name == "nt":
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)

    WM_DESTROY = 0x0002
    WM_CLOSE = 0x0010
    WM_COMMAND = 0x0111
    WM_USER = 0x0400
    WM_TRAY = WM_USER + 1
    WM_LBUTTONUP = 0x0202
    WM_RBUTTONUP = 0x0205
    WM_CONTEXTMENU = 0x007B
    NIM_ADD, NIM_DELETE = 0, 2
    NIF_MESSAGE, NIF_ICON, NIF_TIP = 1, 2, 4
    IMAGE_ICON, LR_LOADFROMFILE = 1, 0x0010
    TPM_RETURNCMD, TPM_RIGHTBUTTON = 0x0100, 0x0002
    MF_STRING = 0

    WNDPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

    class WNDCLASSW(ctypes.Structure):
        _fields_ = [("style", wintypes.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int),
                    ("cbWndExtra", ctypes.c_int), ("hInstance", wintypes.HINSTANCE), ("hIcon", wintypes.HICON),
                    ("hCursor", wintypes.HANDLE), ("hbrBackground", wintypes.HBRUSH),
                    ("lpszMenuName", wintypes.LPCWSTR), ("lpszClassName", wintypes.LPCWSTR)]

    class NOTIFYICONDATAW(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("hWnd", wintypes.HWND), ("uID", wintypes.UINT),
                    ("uFlags", wintypes.UINT), ("uCallbackMessage", wintypes.UINT), ("hIcon", wintypes.HICON),
                    ("szTip", wintypes.WCHAR * 128), ("dwState", wintypes.DWORD), ("dwStateMask", wintypes.DWORD),
                    ("szInfo", wintypes.WCHAR * 256), ("uTimeoutOrVersion", wintypes.UINT),
                    ("szInfoTitle", wintypes.WCHAR * 64), ("dwInfoFlags", wintypes.DWORD),
                    ("guidItem", ctypes.c_byte * 16), ("hBalloonIcon", wintypes.HICON)]

    class MSG(ctypes.Structure):
        _fields_ = [("hwnd", wintypes.HWND), ("message", wintypes.UINT), ("wParam", wintypes.WPARAM),
                    ("lParam", wintypes.LPARAM), ("time", wintypes.DWORD), ("pt", wintypes.POINT),
                    ("lPrivate", wintypes.DWORD)]

    user32.CreateWindowExW.restype = wintypes.HWND
    user32.CreateWindowExW.argtypes = (wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
                                       ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HWND,
                                       wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID)
    user32.CreatePopupMenu.restype = wintypes.HMENU
    user32.AppendMenuW.argtypes = (wintypes.HMENU, wintypes.UINT, ctypes.c_size_t, wintypes.LPCWSTR)
    user32.GetCursorPos.argtypes = (ctypes.POINTER(wintypes.POINT),)
    user32.SetForegroundWindow.argtypes = (wintypes.HWND,)
    user32.TrackPopupMenu.argtypes = (wintypes.HMENU, wintypes.UINT, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                      wintypes.HWND, wintypes.LPVOID)
    user32.TrackPopupMenu.restype = wintypes.UINT
    user32.DestroyMenu.argtypes = (wintypes.HMENU,)
    user32.PostMessageW.argtypes = (wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
    user32.LoadImageW.restype = wintypes.HANDLE
    user32.LoadImageW.argtypes = (wintypes.HANDLE, wintypes.LPCWSTR, wintypes.UINT, ctypes.c_int, ctypes.c_int, wintypes.UINT)
    user32.RegisterClassW.argtypes = (ctypes.POINTER(WNDCLASSW),)
    user32.RegisterClassW.restype = ctypes.c_ushort
    user32.CreateWindowExW.restype = wintypes.HWND
    user32.DestroyIcon.restype = wintypes.BOOL
    user32.DestroyIcon.argtypes = (wintypes.HICON,)
    user32.MessageBoxW.argtypes = (wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT)
    user32.MessageBoxW.restype = ctypes.c_int
    user32.DestroyWindow.argtypes = (wintypes.HWND,)
    user32.DefWindowProcW.argtypes = (wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)
    user32.DefWindowProcW.restype = ctypes.c_ssize_t
    user32.GetMessageW.argtypes = (ctypes.POINTER(MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT)
    user32.GetMessageW.restype = wintypes.BOOL
    user32.TranslateMessage.argtypes = (ctypes.POINTER(MSG),)
    user32.DispatchMessageW.argtypes = (ctypes.POINTER(MSG),)
    user32.DispatchMessageW.restype = ctypes.c_ssize_t
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.GetModuleHandleW.restype = wintypes.HMODULE
    kernel32.GetModuleHandleW.argtypes = (wintypes.LPCWSTR,)
    shell32.Shell_NotifyIconW.argtypes = (wintypes.DWORD, ctypes.POINTER(NOTIFYICONDATAW))
    shell32.Shell_NotifyIconW.restype = wintypes.BOOL


class Tray:
    def __init__(self, url: str, exit_check=None):
        if os.name != "nt":
            raise OSError("A bandeja do MockAíZé está disponível no Windows.")
        self.url = url
        self.exit_check = exit_check
        self.hwnd = None
        self.icon = None
        self.callback = WNDPROC(self._window_proc)
        self.class_name = "MockAizeTrayWindow"

    @staticmethod
    def _icon_path() -> Path:
        return Path(__file__).parent / "assets" / "mockaize.ico"

    @staticmethod
    def _report_browser_failure(hwnd=None, detail=""):
        message = "Não foi possível abrir o navegador padrão. Verifique a configuração do Windows e tente pelo ícone novamente."
        if detail:
            message += f"\n\n{detail}"
        user32.MessageBoxW(hwnd, message, "MockAíZé", 0x00000010)

    def _icon_data(self):
        data = NOTIFYICONDATAW()
        data.cbSize = ctypes.sizeof(data)
        data.hWnd = self.hwnd
        data.uID = 1
        data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
        data.uCallbackMessage = WM_TRAY
        data.hIcon = self.icon
        data.szTip = "MockAíZé"
        return data

    def _menu(self):
        menu = user32.CreatePopupMenu()
        user32.AppendMenuW(menu, MF_STRING, 1001, "Abrir MockAíZé")
        user32.AppendMenuW(menu, MF_STRING, 1002, "Sair")
        point = wintypes.POINT()
        user32.GetCursorPos(ctypes.byref(point))
        user32.SetForegroundWindow(self.hwnd)
        command = user32.TrackPopupMenu(menu, TPM_RETURNCMD | TPM_RIGHTBUTTON, point.x, point.y, 0, self.hwnd, None)
        user32.DestroyMenu(menu)
        if command == 1001:
            try:
                if not webbrowser.open(self.url):
                    self._report_browser_failure(self.hwnd)
            except Exception as exc:
                self._report_browser_failure(self.hwnd, str(exc))
        elif command == 1002:
            dirty = False
            try:
                dirty = bool(self.exit_check and self.exit_check())
            except Exception:
                dirty = True
            if dirty:
                answer = user32.MessageBoxW(self.hwnd,
                    "Há alterações não salvas ou uma geração em andamento em uma página aberta. Deseja encerrar o MockAíZé mesmo assim?",
                    "MockAíZé — alterações pendentes", 0x00000004 | 0x00000030 | 0x00000100)
                if answer != 6:
                    return
            user32.PostMessageW(self.hwnd, WM_CLOSE, 0, 0)

    def _window_proc(self, hwnd, message, wparam, lparam):
        if message == WM_TRAY and lparam in (WM_LBUTTONUP, WM_RBUTTONUP, WM_CONTEXTMENU):
            if lparam == WM_LBUTTONUP:
                try:
                    if not webbrowser.open(self.url):
                        self._report_browser_failure(hwnd)
                except Exception as exc:
                    self._report_browser_failure(hwnd, str(exc))
            else:
                self._menu()
            return 0
        if message == WM_DESTROY:
            data = self._icon_data()
            shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(data))
            user32.DestroyIcon(self.icon)
            user32.PostQuitMessage(0)
            return 0
        if message == WM_CLOSE:
            user32.DestroyWindow(hwnd)
            return 0
        return user32.DefWindowProcW(hwnd, message, wparam, lparam)

    def run(self):
        instance = kernel32.GetModuleHandleW(None)
        window_class = WNDCLASSW()
        window_class.lpfnWndProc = self.callback
        window_class.hInstance = instance
        window_class.lpszClassName = self.class_name
        if not user32.RegisterClassW(ctypes.byref(window_class)) and ctypes.get_last_error() != 1410:
            raise ctypes.WinError(ctypes.get_last_error())
        self.hwnd = user32.CreateWindowExW(0, self.class_name, "MockAíZé", 0, 0, 0, 0, 0, None, None, instance, None)
        if not self.hwnd:
            raise ctypes.WinError(ctypes.get_last_error())
        icon_path = self._icon_path()
        self.icon = user32.LoadImageW(None, str(icon_path), IMAGE_ICON, 0, 0, LR_LOADFROMFILE) if icon_path.is_file() else None
        if not self.icon:
            raise OSError(f"Não foi possível carregar o ícone oficial da bandeja: {icon_path}")
        data = self._icon_data()
        if not shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(data)):
            raise ctypes.WinError(ctypes.get_last_error())
        message = MSG()
        while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
            user32.TranslateMessage(ctypes.byref(message))
            user32.DispatchMessageW(ctypes.byref(message))


