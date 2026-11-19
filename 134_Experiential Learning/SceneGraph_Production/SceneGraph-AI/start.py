#!/usr/bin/env python3
"""Root launcher forwarding to SceneGraph_Production/start.py."""
import os
import runpy
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent / "SceneGraph_Production"
os.chdir(APP_DIR)
sys.path.insert(0, str(APP_DIR))
runpy.run_path(str(APP_DIR / "start.py"), run_name="__main__")
