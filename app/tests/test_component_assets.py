"""Shared component assets must be served and included in the Windows bundle."""
from pathlib import Path
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from mockaize.server import Handler


class ComponentAssetsCase(unittest.TestCase):
    def test_component_assets_are_served_with_correct_types(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for name, content_type in (("alerts.js", "text/javascript"),
                                       ("form-fields.js", "text/javascript"),
                                       ("components.css", "text/css")):
                with self.subTest(asset=name):
                    with urlopen(f"http://127.0.0.1:{server.server_port}/{name}", timeout=3) as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.headers.get_content_type(), content_type)
                        self.assertEqual(response.read(), (ROOT / "mockaize" / "web" / name).read_bytes())
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_shared_assets_load_before_application_and_are_packaged(self):
        spec = (ROOT / "packaging" / "mockaize.spec").read_text(encoding="utf-8")
        for name in ("alerts.js", "form-fields.js", "components.css"):
            self.assertIn(f'(str(web / "{name}"), "mockaize/web")', spec)
        for page in ("index.html", "studio.html"):
            html = (ROOT / "mockaize" / "web" / page).read_text(encoding="utf-8")
            self.assertLess(html.index('/alerts.js'), html.index('/ui-motion.js'))
            self.assertLess(html.index('/navigation.css'), html.index('/components.css'))


if __name__ == "__main__":
    unittest.main()
