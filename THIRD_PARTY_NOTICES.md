# Third-party notices

MockAíZé application source is licensed under MIT. The Windows onedir package also contains the Python runtime and PyInstaller bootloader used to produce it.

## Included in the Windows package

- **Python runtime (3.14.0 in the currently built bundle):** Python Software Foundation License. The complete license shipped with the runtime build is copied into `_internal/licenses/LICENSE.txt`.
- **PyInstaller 6.22.3 bootloader:** GPL 2.0 with the PyInstaller bootloader exception, plus Apache 2.0 for a small set of files. The `COPYING.txt` used by the build is copied into `_internal/licenses/COPYING.txt`. PyInstaller's published exception permits distributing generated bundles under the application's chosen license, subject to licenses of bundled dependencies. See the [official PyInstaller license terms](https://pyinstaller.org/en/stable/license.html).
- **Python bundled libraries:** the Python license file contains notices for libraries shipped by that runtime build. Review it when changing the Python version.
- **tzdata (2025.2 or newer):** IANA time zone data distributed by the Python Software Foundation, under Apache 2.0; the underlying IANA data is public domain. The distribution's `LICENSE` and `LICENSE_APACHE` are copied to `licenses/tzdata` inside the portable executable. The package provides Windows with the same IANA identifiers used by the XML preset context.
- **Windows runtime components:** the bundle may contain Microsoft runtime DLLs supplied with the selected CPython distribution. Follow the redistribution terms accompanying that Windows runtime and any applicable Microsoft runtime package.

PyInstaller itself, setuptools and the other build-time Python packages are tooling; they are not Python imports in MockAíZé's runtime. Keep the build environment pinned and regenerate this notice review whenever the Python or packaging toolchain changes. Check the generated `_internal/licenses` directory before publishing a release.
