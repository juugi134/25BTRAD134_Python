# 25BTRAD134 Python

Coursework and project files for Python programming, lab exercises, and experiential learning.

## Contents

- **`134_Lab Exercise/`** — five lab exercise folders with introductory Python programs covering setup, input/output, operators, conditionals, loops, and functions.
- **`134_Problem Solving/`** — Python mini-projects such as a unit converter, grade calculator, and attendance tracker.
- **`134_Experiential Learning/`** — the SceneGraph AI production-planning web application, with a FastAPI backend, browser frontend, tests, and deployment documentation.

## Run the SceneGraph AI application on Windows

Install Python 3.11 or newer, open PowerShell in the repository folder, and run:

```powershell
cd "134_Experiential Learning\SceneGraph_Production\SceneGraph-AI\SceneGraph_Production"
.\run_windows.bat
```

The launcher creates a virtual environment and installs the project requirements if needed. When it starts, open [http://127.0.0.1:8000](http://127.0.0.1:8000) in a browser. For other platforms, setup steps and application details are in the SceneGraph project's `README.md` and `START_HERE.txt`.

## Run a lab or mini-project

Run a script from the repository root with Python. For example:

```powershell
python ".\134_Lab Exercise\LAB EXPERIMENTS _Part 1\LAB_1.PY"
python ".\134_Problem Solving\134_MiniProjects.py"
```

Some programs prompt for input in the terminal.

## Tests

The SceneGraph application has its own test suite. From its project directory:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

## Public repository contents

Local environment files, virtual environments, caches, and the SceneGraph runtime database are excluded. Firebase values in the public configuration files are placeholders; configure your own Firebase project if you enable Google sign-in. The assignment handout PDF is also omitted.
