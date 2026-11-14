"""Launch the local demo services, optionally verify them and stop. No paid-provider fallback."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]

def request_json(url, payload=None):
    request = Request(url, data=json.dumps(payload).encode() if payload is not None else None,
                      headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=12) as response:
        return json.load(response)

def ensure_port_free(port):
    with socket.socket() as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            raise RuntimeError(f"Port {port} is already in use. Stop that service or choose another port.") from None

def stop(process):
    if process.poll() is not None:
        return
    if os.name == "posix": os.killpg(process.pid, signal.SIGTERM)
    else: process.terminate()
    try:
        process.wait(timeout=6)
    except subprocess.TimeoutExpired:
        if os.name == "posix": os.killpg(process.pid, signal.SIGKILL)
        else: process.kill()
        process.wait(timeout=3)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int, default=8001)
    parser.add_argument("--web-port", type=int, default=3002)
    parser.add_argument("--build", action="store_true", help="Build Next.js before starting")
    parser.add_argument("--offline-research", action="store_true", help="Disable AI/tracing credentials for this launch; saved demo and solver still work")
    parser.add_argument("--smoke", action="store_true", help="Check local page, saved demo, solver, and cached assets, then stop both services")
    args = parser.parse_args()
    if not all(1 <= port <= 65535 for port in (args.api_port, args.web_port)) or args.api_port == args.web_port:
        parser.error("Choose distinct API and web ports from 1 to 65535")
    npm = shutil.which("npm")
    if not npm or not (ROOT / "node_modules").exists():
        raise RuntimeError("Install Node.js 22+ and run npm ci from the repository root")
    for port in (args.api_port, args.web_port): ensure_port_free(port)
    if args.build:
        subprocess.run([npm, "run", "build"], cwd=ROOT, check=True)
    if not (ROOT / "apps/web/.next/BUILD_ID").exists():
        raise RuntimeError("Frontend build missing. Run this launcher with --build")
    if not (ROOT / "apps/web/public/demo/trastuzumab-demo.json").exists():
        raise RuntimeError("Saved demo missing. Run scripts/prepare_demo.py with the project Python environment")
    env = dict(os.environ)
    env["API_BASE_URL"] = f"http://127.0.0.1:{args.api_port}"
    if args.offline_research:
        env.update(NVIDIA_API_KEY="", LANGSMITH_API_KEY="", LANGSMITH_TRACING="false")
    logs = ROOT / "work"
    logs.mkdir(exist_ok=True)
    children = []
    handles = []
    def interrupted(_signal, _frame): raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    try:
        for name, command in (
            ("api", [sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", "apps/api", "--host", "127.0.0.1", "--port", str(args.api_port)]),
            ("web", [npm, "run", "start", "--workspace", "apps/web", "--", "--port", str(args.web_port)]),
        ):
            handle = (logs / f"local-{name}-{args.api_port}-{args.web_port}.log").open("w")
            handles.append(handle)
            children.append(subprocess.Popen(command, cwd=ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT, start_new_session=True))
        api = f"http://127.0.0.1:{args.api_port}"
        web = f"http://127.0.0.1:{args.web_port}"
        for attempt in range(120):
            if any(child.poll() is not None for child in children):
                raise RuntimeError("A service stopped during startup; inspect work/local-*.log")
            try:
                request_json(api + "/api/health")
                with urlopen(web + "/preview/plots", timeout=1) as response:
                    if response.status == 200: break
            except (OSError, ValueError):
                time.sleep(.1)
        else:
            raise RuntimeError("Services did not become ready; inspect work/local-*.log")
        print(f"Workspace: {web}/preview/plots", flush=True)
        print("Research mode: disabled for this launch" if args.offline_research else "Research mode: configured local .env (free NVIDIA endpoint only)", flush=True)
        if args.smoke:
            if args.offline_research:
                assert request_json(api + "/api/health")["ai_credentials_configured"] is False
            demo = request_json(api + "/api/demo")
            result = request_json(web + "/api/simulations", {"experiment": demo["experiment"], "client_revision": 1, "output_points": 100})
            assert result["configuration_hash"] == demo["result"]["configuration_hash"]
            saved = request_json(web + "/demo/trastuzumab-demo.json")
            assert saved["origin"] == "saved_reviewed_demo" and saved["result"]["result_id"] == demo["result"]["result_id"]
            for asset in ("/structures/1N8Z.pdb", "/vendor/3Dmol-2.5.5.min.js"):
                with urlopen(web + asset, timeout=5) as response: assert response.status == 200
            if args.offline_research:
                primary = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"
                for payload, expected in (({"text":primary}, "failed"), ({"text":"Explore imatinib", "drug":"imatinib"}, "unsupported")):
                    job = request_json(web + "/api/research/jobs", payload)
                    for _ in range(60):
                        status = request_json(web + "/api/research/jobs/" + job["job_id"])
                        if status["status"] in ("failed", "unsupported", "completed"): break
                        time.sleep(.1)
                    assert status["status"] == expected
                    if expected == "failed": assert status["error_code"] == "credentials_missing"
            print("Local smoke passed: page, saved result, direct simulator, PDB, renderer, and requested offline checks. No live provider requests.", flush=True)
        else:
            print("Ctrl+C stops both services. Logs: work/local-*.log", flush=True)
            while all(child.poll() is None for child in children): time.sleep(.5)
            raise RuntimeError("A local service stopped; inspect work/local-*.log")
    except KeyboardInterrupt:
        print("Stopping the local demo.")
    finally:
        for child in reversed(children): stop(child)
        for handle in handles: handle.close()

if __name__ == "__main__":
    try: main()
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr); raise SystemExit(1)
