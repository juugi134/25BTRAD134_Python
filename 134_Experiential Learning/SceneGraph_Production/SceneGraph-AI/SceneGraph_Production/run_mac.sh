#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

# Create virtual environment if missing
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3.12 -m venv .venv 2>/dev/null || python3 -m venv .venv
fi

source .venv/bin/activate

# Install requirements if dependencies are missing
if ! python -c "import uvicorn, fastapi" 2>/dev/null; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

python start.py "$@"
