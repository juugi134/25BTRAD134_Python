#!/usr/bin/env python3
"""
SceneGraph AI — Universal Launcher (Windows / macOS / Linux)
Run locally, on your local network (Wi-Fi), or generate a public web link.
"""
import glob
import os
import sys
import time
import socket
import threading
import subprocess
import webbrowser
from pathlib import Path

# Ensure UTF-8 console output on Windows so box-drawing and emoji characters print cleanly
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)


def find_python() -> str:
    venv_scripts = ROOT / ".venv" / "Scripts" / "python.exe"
    venv_bin = ROOT / ".venv" / "bin" / "python"

    if os.name == "nt":
        if venv_scripts.is_file():
            return str(venv_scripts)
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            candidates = sorted(
                glob.glob(os.path.join(local_app_data, "Programs", "Python", "Python*", "python.exe")),
                reverse=True,
            )
            for candidate in candidates:
                if os.path.isfile(candidate):
                    return candidate
        if sys.executable and "WindowsApps" not in sys.executable and os.path.isfile(sys.executable):
            return sys.executable
    else:
        if venv_bin.is_file():
            return str(venv_bin)
        if venv_scripts.is_file():
            return str(venv_scripts)

    return sys.executable


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def is_cloud_env() -> bool:
    cloud_vars = ("PORT", "RENDER", "RAILWAY_STATIC_URL", "DYNO", "FLY_APP_NAME", "K_SERVICE")
    return any(k in os.environ for k in cloud_vars)


def start_public_tunnel(port: int):
    import re
    import shutil

    cf_bin = shutil.which("cloudflared") or r"C:\Program Files (x86)\cloudflared\cloudflared.exe"
    if os.path.isfile(cf_bin):
        cf_cmd = [cf_bin, "tunnel", "--url", f"http://127.0.0.1:{port}"]
        try:
            proc = subprocess.Popen(
                cf_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if proc.stdout:
                for line in proc.stdout:
                    match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
                    if match:
                        url = match.group(0)
                        print("\n" + "★" * 68)
                        print("🌍 CLOUDFLARE PUBLIC INTERNET LINK (Accessible by anyone):")
                        print(f"   👉  {url}")
                        print("★" * 68 + "\n")
                        return
        except Exception as e:
            print(f"\n[Note] Cloudflare tunnel error ({e}), trying fallback...")

    ssh_bin = "ssh.exe" if os.name == "nt" else "ssh"
    cmd = [
        ssh_bin,
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-R", f"80:localhost:{port}",
        "nokey@localhost.run",
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if proc.stdout:
            for line in proc.stdout:
                match = re.search(r"https://[a-zA-Z0-9-]+\.app\.lhr\.life", line)
                if match:
                    url = match.group(0)
                    print("\n" + "★" * 68)
                    print("🌍 PUBLIC INTERNET LINK (Accessible by anyone in the world):")
                    print(f"   👉  {url}")
                    print("★" * 68 + "\n")
                    break
    except Exception as e:
        print(f"\n[Note] Could not start public tunnel automatically ({e}).")
        print(f"To share publicly, run: cloudflared tunnel --url http://localhost:{port}\n")


def main():
    py = find_python()
    cloud = is_cloud_env()

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    lan_ip = get_lan_ip()

    share_public = (
        "--public" in sys.argv
        or "--share" in sys.argv
        or os.environ.get("PUBLIC_SHARE", "").lower() in ("1", "true", "yes")
    )

    local_url = f"http://localhost:{port}/"
    network_url = f"http://{lan_ip}:{port}/"

    print("=" * 68)
    print("🎬 SceneGraph AI — Production Intelligence Studio")
    print(f"   🏠 Local Computer Link:   {local_url}")
    print(f"   📡 Local Network (Wi-Fi): {network_url}")
    print("      (Anyone on your local Wi-Fi can open this link!)")
    if not share_public and not cloud:
        print("   💡 Worldwide Public Link: Run with .\\run_windows.bat --public")
    print("=" * 68 + "\n")

    if not cloud:
        def open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(local_url)
            except Exception:
                pass

        threading.Thread(target=open_browser, daemon=True).start()

        if share_public:
            threading.Thread(target=start_public_tunnel, args=(port,), daemon=True).start()

        cmd = [
            py, "-m", "uvicorn", "app:app",
            "--host", host,
            "--port", str(port),
            "--reload",
            "--reload-dir", "core",
        ]
    else:
        print(f"Starting SceneGraph AI Cloud Production Server on {host}:{port}...")
        cmd = [py, "-m", "uvicorn", "app:app", "--host", host, "--port", str(port)]

    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\nSceneGraph server stopped.")


if __name__ == "__main__":
    main()
