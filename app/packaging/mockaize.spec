# Single-file Windows release. PyInstaller's PKG is an internal build artifact only.
from pathlib import Path
import sys
import tomllib
from importlib.metadata import distribution

root = Path(SPECPATH).parent
version = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
code = root
assets = code / "mockaize" / "assets"
web = code / "mockaize" / "web"
python_license = Path(sys.base_prefix) / "LICENSE.txt"
pyinstaller_dist = distribution("pyinstaller")
pyinstaller_license = next(
    (pyinstaller_dist.locate_file(item) for item in pyinstaller_dist.files
     if str(item).replace("\\", "/").endswith("/licenses/COPYING.txt")),
    None,
)
if sys.platform != "win32":
    raise RuntimeError("MockAíZé is currently packaged for Windows only.")
if not python_license.is_file():
    raise FileNotFoundError(f"Python runtime license is missing: {python_license}")
if pyinstaller_license is None or not Path(pyinstaller_license).is_file():
    raise FileNotFoundError("PyInstaller COPYING.txt was not found in the build environment.")

a = Analysis(
    [str(code / "mockaize" / "__main__.py")],
    pathex=[str(code)],
    binaries=[],
    datas=[
        (str(root / "README.md"), "."),
        (str(root / "LICENSE"), "."),
        (str(web / "index.html"), "mockaize/web"),
        (str(web / "style.css"), "mockaize/web"),
        (str(web / "engine.js"), "mockaize/web"),
        (str(web / "app.js"), "mockaize/web"),
        (str(web / "studio.html"), "mockaize/web"),
        (str(web / "studio.css"), "mockaize/web"),
        (str(web / "studio-api.js"), "mockaize/web"),
        (str(web / "studio-layout.js"), "mockaize/web"),
        (str(web / "manual-studio.js"), "mockaize/web"),
        (str(web / "library.js"), "mockaize/web"),
        (str(web / "library.css"), "mockaize/web"),
        (str(web / "studio.js"), "mockaize/web"),
        (str(web / "assets"), "mockaize/web/assets"),
        (str(assets), "mockaize/assets"),
        (str(python_license), "licenses"),
        (str(pyinstaller_license), "licenses"),
        (str(root / "THIRD_PARTY_NOTICES.md"), "licenses"),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=f"MockAíZé-{version}",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    icon=str(assets / "mockaize.ico"),
    version=str(root / "packaging" / "version_info.txt"),
)
