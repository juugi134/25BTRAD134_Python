#!/usr/bin/env python3
"""Root launcher forwarding to SceneGraph_Production/start.py."""
import subprocess
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent / "SceneGraph_Production"
VENV_PY = APP_DIR / ".venv" / "Scripts" / "python.exe"
PY_BIN = str(VENV_PY) if VENV_PY.is_file() else sys.executable

raise SystemExit(subprocess.call([PY_BIN, str(APP_DIR / "start.py"), *sys.argv[1:]], cwd=str(APP_DIR)))
