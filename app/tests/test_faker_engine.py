"""Exercise the actual browser request planner, including legacy formulas."""
import shutil
import subprocess
import unittest
from pathlib import Path


class FakerEngineCase(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is required for browser engine checks")
    def test_request_planning(self):
        script = Path(__file__).with_name("faker_engine.cjs")
        subprocess.run([shutil.which("node"), str(script)], check=True, timeout=15, capture_output=True)
