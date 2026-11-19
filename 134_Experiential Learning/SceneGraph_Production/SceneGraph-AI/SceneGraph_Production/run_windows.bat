@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

set "PYTHON_EXE="
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) else (
    where python >nul 2>&1 && set "PYTHON_EXE=python"
)

if "%PYTHON_EXE%"=="" (
    echo [Error] Python was not found on this Windows system.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Creating Windows virtual environment...
    "%PYTHON_EXE%" -m venv .venv
    set "PYTHON_EXE=.venv\Scripts\python.exe"
)

"%PYTHON_EXE%" -c "import uvicorn, fastapi" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies from requirements.txt...
    "%PYTHON_EXE%" -m pip install -r requirements.txt
)

"%PYTHON_EXE%" start.py %*
