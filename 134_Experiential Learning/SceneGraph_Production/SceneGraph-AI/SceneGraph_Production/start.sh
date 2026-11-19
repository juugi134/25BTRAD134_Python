#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Prefer virtual environment python if it exists
if [ -f ".venv/bin/python" ]; then
    PYTHON_CMD=".venv/bin/python"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python"
fi

"$PYTHON_CMD" start.py
