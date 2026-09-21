"""Independent post-submission v1 acceptance. Python stdlib; optional Playwright."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import stat
import subprocess
import tempfile
import time
import urllib.request

VERSION = "promptlane-v1-acceptance-1"
STATUSES = {"pass", "fail", "unverified", "not-applicable"}
GATES = {
    "launch": "Browser launch, no startup/runtime errors, visible rendered arena",
    "map": "Diamond, river, jungle, three lanes, 12 towers, two nexuses, minimap",
    "teams": "Two teams of three instrument-bearing robot bears",
    "minions": "Waves each lane every 30 simulation seconds, movement and combat",
    "kits": "Drums, Keytar, Violin abilities, roles and cooldowns",
    "baseline": "Unmodified Scripted 3v3 completes by nexus destruction, not timeout",
    "timeout": "10-minute fallback: towers standing, then nexus hp",
    "mock": "Switch a bear to Prompt-mock; actions and selected prompt/reply work",
    "http": "Configurable HTTP POST adapter and observation/action integration",
    "pilot-contract": "Common async pilot contract, compact observations, action vocabulary and scripted heuristic",
    "async": "Simulation advances during pending model reply; last action retained",
    "ui": "Start, clock/scores, names/hp/instruments, per-bear pilot selection",
    "replay": "Fixed step, seeded randomness and reproducible replay from log",
    "presentation": "Canvas 2D, requested palette and minimal flat presentation",
    "prompts": "Three in-character instrument pilot files, each under 40 lines",
    "stack": "TypeScript/Vite; no game engine, physics library or UI framework",
    "documentation": "README status and design unchanged or contradiction disclosed",
}
EXPLORATORY = {
    "malformed-reply": "Malformed/rejected/late replies recover safely",
    "recall-balance": "Recall loops, kill frequency and multi-seed balance",
}
AUTOMATED = ("install", "typecheck", "build", "browser")
IGNORED = {".git", "node_modules", "dist", ".vite", "__pycache__"}


def digest(path):
    hash_ = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hash_.update(chunk)
    return hash_.hexdigest()


def inventory(root):
    """Hash relative paths, file sizes and bytes; exclude only generated/tool dirs."""
    rows = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in IGNORED)
        for name in dirs + sorted(files):
            p = Path(directory) / name
            info = p.lstat()
            if p.is_symlink() or (
                getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
            ):
                raise ValueError(f"Symlinks/junctions are not accepted: {p}")
        for name in sorted(files):
            p = Path(directory) / name
            if not stat.S_ISREG(p.lstat().st_mode):
                raise ValueError(f"Special files are not accepted: {p}")
            rows.append({"path": p.relative_to(root).as_posix(),
                         "size": p.stat().st_size, "sha256": digest(p),
                         "posix_executable": bool(p.stat().st_mode & 0o111) if os.name == "posix" else None})
    rows.sort(key=lambda r: r["path"])
    if not rows:
        raise ValueError("Candidate contains no files")
    encoded = json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest(), rows


def strict_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=pairs,
                      parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))


def exact(obj, keys, label):
    if not isinstance(obj, dict) or set(obj) != set(keys):
        raise ValueError(f"{label}: expected fields {sorted(keys)}")


def text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}: nonempty string required")


def validate_evidence(data, candidate_hash, base):
    """Strict import schema, hash binding and referenced evidence verification."""
    exact(data, {"schema", "candidate_sha256", "reviewer", "captured_at",
                 "adapters", "observations"}, "evidence")
    if data["schema"] != VERSION or data["candidate_sha256"] != candidate_hash:
        raise ValueError("Evidence schema/candidate hash mismatch")
    for key in ("reviewer", "captured_at"):
        text(data[key], key)
    if not isinstance(data["adapters"], list):
        raise ValueError("adapters must be a list (empty if none)")
    for adapter in data["adapters"]:
        exact(adapter, {"path", "sha256", "purpose"}, "adapter")
        text(adapter["purpose"], "adapter purpose")
        verify_reference(adapter, base)
    if not isinstance(data["observations"], list):
        raise ValueError("observations must be a list")
    seen = set()
    for obs in data["observations"]:
        exact(obs, {"id", "status", "method", "steps", "actual", "references"}, "observation")
        for key in ("id", "status", "method"):
            text(obs[key], key)
        if obs["id"] not in GATES | EXPLORATORY or obs["id"] in seen:
            raise ValueError("Unknown or duplicate observation id")
        seen.add(obs["id"])
        if obs["status"] not in STATUSES or obs["status"] == "not-applicable":
            raise ValueError("v1 observations cannot be not-applicable")
        if obs["method"] not in {"human-browser", "reviewer-source", "readonly-adapter"}:
            raise ValueError("Agent assertions are not independent evidence")
        if obs["method"] == "readonly-adapter" and not data["adapters"]:
            raise ValueError("Adapter observations require disclosed adapters")
        for key in ("steps", "actual"):
            text(obs[key], key)
        if not isinstance(obs["references"], list):
            raise ValueError("references must be a list")
        if obs["status"] in {"pass", "fail"} and not obs["references"]:
            raise ValueError("Verified observations require recorded evidence")
        for ref in obs["references"]:
            exact(ref, {"path", "sha256", "description"}, "reference")
            text(ref["description"], "reference description")
            verify_reference(ref, base)
        semantic = {"launch", "map", "teams", "minions", "kits", "baseline",
                    "timeout", "mock", "http", "async", "ui", "replay", "presentation"}
        if obs["id"] in semantic and obs["method"] == "reviewer-source" and obs["status"] == "pass":
            raise ValueError("Source review cannot prove runtime/gameplay gates")
    return data


def verify_reference(ref, base):
    text(ref["path"], "reference path")
    text(ref["sha256"], "reference hash")
    if ".." in Path(ref["path"]).parts or Path(ref["path"]).as_posix() == "import.json":
        raise ValueError("import.json is reserved for the imported packet")
    path = (base / ref["path"]).resolve()
    if Path(ref["path"]).is_absolute() or not path.is_relative_to(base.resolve()):
        raise ValueError("Evidence paths must remain within the evidence directory")
    if not path.is_file() or digest(path) != ref["sha256"]:
        raise ValueError(f"Missing or changed evidence: {ref['path']}")


def result(id_, status="unverified", detail="No independent evidence supplied", evidence=None):
    return {"id": id_, "status": status, "detail": detail, "evidence": evidence or []}


def aggregate(checks):
    checks = list(checks)
    required = [c["status"] for c in checks if c["id"] in GATES]
    failures = [c for c in checks if c["id"] not in EXPLORATORY and c["status"] == "fail"]
    return "fail" if failures else (
        "pass" if all(s == "pass" for s in required) else "unverified")


def validate_report(report, base=None):
    exact(report, {"schema", "candidate_sha256", "files", "checks", "overall",
                   "execution", "integrity", "limitations"}, "report")
    if report["schema"] != VERSION:
        raise ValueError("Unknown report schema")
    if not isinstance(report["checks"], list):
        raise ValueError("checks must be list")
    seen = set()
    for check in report["checks"]:
        exact(check, {"id", "status", "detail", "evidence"}, "check")
        text(check["id"], "check id")
        text(check["status"], "check status")
        if check["id"] not in GATES | EXPLORATORY | dict.fromkeys(AUTOMATED) or check["id"] in seen:
            raise ValueError("Unknown/duplicate check")
        seen.add(check["id"])
        if check["status"] not in STATUSES:
            raise ValueError("Invalid check status")
        if check["id"] in GATES and check["status"] == "not-applicable":
            raise ValueError("Required gate cannot be not-applicable")
        text(check["detail"], "detail")
        if not isinstance(check["evidence"], list):
            raise ValueError("evidence must be list")
        if check["status"] == "pass" and not check["evidence"]:
            raise ValueError("Passing checks need evidence")
        for ref in check["evidence"]:
            exact(ref, {"path", "sha256"}, "report reference")
            if base is not None:
                verify_reference(ref, base)
    if seen != set(GATES) | set(EXPLORATORY) | set(AUTOMATED):
        raise ValueError("Missing checks")
    if report["overall"] != aggregate(report["checks"]):
        raise ValueError("Invalid aggregate")
    if not isinstance(report["files"], list) or not report["files"]:
        raise ValueError("Nonempty file manifest required")
    paths = []
    for row in report["files"]:
        exact(row, {"path", "size", "sha256", "posix_executable"}, "manifest entry")
        text(row["path"], "manifest path")
        if Path(row["path"]).is_absolute() or ".." in Path(row["path"]).parts:
            raise ValueError("Unsafe manifest path")
        if type(row["size"]) is not int or row["size"] < 0:
            raise ValueError("Invalid file size")
        if row["posix_executable"] is not None and type(row["posix_executable"]) is not bool:
            raise ValueError("Invalid POSIX executable flag")
        if not isinstance(row["sha256"], str) or len(row["sha256"]) != 64 or any(
                c not in "0123456789abcdef" for c in row["sha256"]):
            raise ValueError("Invalid file hash")
        paths.append(row["path"])
    if paths != sorted(set(paths)):
        raise ValueError("Manifest paths must be unique and sorted")
    exact(report["execution"], {"enabled", "browser", "commands"}, "execution")
    if type(report["execution"]["enabled"]) is not bool or type(report["execution"]["browser"]) is not bool:
        raise ValueError("Execution flags must be booleans")
    exact(report["execution"]["commands"], {"install", "typecheck", "build", "serve"}, "commands")
    if not all(isinstance(v, str) for v in report["execution"]["commands"].values()):
        raise ValueError("Commands must be strings")
    text(report["limitations"], "limitations")
    encoded = json.dumps(report["files"], sort_keys=True, separators=(",", ":")).encode()
    if hashlib.sha256(encoded).hexdigest() != report["candidate_sha256"]:
        raise ValueError("Invalid manifest hash")
    if report["integrity"] != "unchanged":
        raise ValueError("Candidate integrity not verified")
    if base is not None:
        packet = base / "evidence"
        observations = {}
        if (packet / "import.json").exists():
            imported = validate_evidence(strict_json(packet / "import.json"),
                                         report["candidate_sha256"], packet)
            observations = {o["id"]: o for o in imported["observations"]}
        for check in report["checks"]:
            if check["id"] in GATES | EXPLORATORY and check["status"] in {"pass", "fail"}:
                obs = observations.get(check["id"])
                expected_ref = [{"path": "evidence/import.json",
                                 "sha256": digest(packet / "import.json")}] if obs else []
                if (not obs or check["status"] != obs["status"] or
                        check["detail"] != obs["actual"] or check["evidence"] != expected_ref):
                    raise ValueError("Gameplay result is not bound to imported reviewer evidence")
    return report


def command_args(command):
    args = shlex.split(command, posix=os.name != "nt")
    if not args:
        raise ValueError("Empty command")
    if os.name == "nt":
        args = [a.strip('"') for a in args]
        args[0] = shutil.which(args[0]) or args[0]
    return args


def run_check(id_, command, cwd, out, timeout):
    log = out / f"{id_}.log"
    started = time.monotonic()
    proc = None
    try:
        with log.open("w", encoding="utf-8") as stream:
            proc = subprocess.Popen(command_args(command), cwd=cwd, stdout=stream,
                                    stderr=subprocess.STDOUT, start_new_session=os.name != "nt")
            proc.wait(timeout=timeout)
        status, detail = ("pass" if proc.returncode == 0 else "fail"), f"Exit {proc.returncode}"
    except (OSError, subprocess.TimeoutExpired) as exc:
        if proc is not None:
            stop_process(proc)
        status, detail = "fail", str(exc)
    return result(id_, status, f"{command}: {detail}; {time.monotonic()-started:.1f}s",
                  [{"path": log.name, "sha256": digest(log)}])


def stop_process(proc):
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True)
    else:
        import signal
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            import signal
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        else:
            proc.kill()
        proc.wait()


def browser_check(stage, out, serve, seconds):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return result("browser", detail="Optional evaluator dependency playwright is not installed")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    errors = []
    proc = None
    try:
        with sync_playwright() as pw:
            try:
                browser = pw.chromium.launch()
            except Exception as exc:
                return result("browser", detail=f"Chromium unavailable: {exc}")
            with (out / "server.log").open("w", encoding="utf-8") as log:
                proc = subprocess.Popen(command_args(serve.replace("{port}", str(port))),
                                        cwd=stage, stdout=log, stderr=subprocess.STDOUT,
                                        start_new_session=os.name != "nt")
                deadline = time.monotonic() + 30
                while True:
                    try:
                        with urllib.request.urlopen(url, timeout=1):
                            break
                    except OSError:
                        if proc.poll() is not None or time.monotonic() > deadline:
                            raise RuntimeError("Server did not become ready within 30 seconds")
                        time.sleep(.25)
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
                page.goto(url, wait_until="networkidle", timeout=30000)
                page.wait_for_timeout(seconds * 1000)
                canvases = page.locator("canvas").evaluate_all(
                    "(els)=>els.map(e=>({width:e.width,height:e.height,visible:!!(e.offsetWidth&&e.offsetHeight)}))")
                page.screenshot(path=str(out / "browser.png"), full_page=True)
                observation = {"url": url, "errors": errors, "canvases": canvases,
                               "note": "Startup only; no gameplay semantics inferred"}
                (out / "browser.json").write_text(json.dumps(observation, indent=2), encoding="utf-8")
                browser.close()
                ok = not errors and any(c["visible"] and c["width"] and c["height"] for c in canvases)
                return result("browser", "pass" if ok else "fail", "Startup smoke only",
                              [{"path": name, "sha256": digest(out / name)}
                               for name in ("browser.json", "browser.png", "server.log")])
    except Exception as exc:
        return result("browser", "fail", str(exc))
    finally:
        if proc is not None:
            stop_process(proc)


def evaluate(args):
    root, out = Path(args.candidate).resolve(), Path(args.output).resolve()
    if not root.is_dir() or out == root or out.is_relative_to(root):
        raise ValueError("Candidate must be a directory; output must be outside it")
    if out.exists() and any(out.iterdir()):
        raise ValueError("Output directory must be new or empty")
    hash_, files = inventory(root)
    imported = None
    if args.evidence:
        evidence_path = Path(args.evidence).resolve()
        imported = validate_evidence(strict_json(evidence_path), hash_, evidence_path.parent)
    out.mkdir(parents=True, exist_ok=True)
    checks = {id_: result(id_) for id_ in GATES | EXPLORATORY | dict.fromkeys(AUTOMATED)}
    if imported:
        # Preserve the reviewed packet, including recordings and disclosed adapters.
        packet = out / "evidence"
        packet.mkdir()
        shutil.copy2(evidence_path, packet / "import.json")
        for ref in imported["adapters"] + [
                ref for obs in imported["observations"] for ref in obs["references"]]:
            target = packet / ref["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(evidence_path.parent / ref["path"], target)
        for obs in imported["observations"]:
            checks[obs["id"]] = result(obs["id"], obs["status"], obs["actual"],
                                       [{"path": "evidence/import.json",
                                         "sha256": digest(packet / "import.json")}])
    if args.execute or args.browser:
        with tempfile.TemporaryDirectory(prefix=".stage-", dir=out) as tmp:
            stage = Path(tmp) / "candidate"
            shutil.copytree(root, stage, ignore=shutil.ignore_patterns(*IGNORED))
            if inventory(stage)[0] != hash_:
                raise ValueError("Candidate changed during staging")
            for id_ in ("install", "typecheck", "build"):
                command = getattr(args, id_)
                if args.execute and command:
                    checks[id_] = run_check(id_, command, stage, out, args.timeout)
                elif args.execute:
                    checks[id_] = result(id_, "not-applicable", "No command configured; not a gameplay waiver")
            if args.browser:
                checks["browser"] = browser_check(stage, out, args.serve, args.browser_seconds)
    if inventory(root)[0] != hash_:
        raise ValueError("Frozen candidate changed during evaluation")
    report = {"schema": VERSION, "candidate_sha256": hash_, "files": files,
              "checks": list(checks.values()), "overall": aggregate(checks.values()),
              "execution": {"enabled": args.execute, "browser": args.browser,
                            "commands": {k: getattr(args, k) for k in ("install", "typecheck", "build", "serve")}},
              "integrity": "unchanged",
              "limitations": "Hashes bind bytes, not reviewer honesty. Manual evidence requires independent review. "
                              "Command/browser success is not proof of gameplay. Excluded directories: "
                              + ", ".join(sorted(IGNORED))}
    validate_report(report, out)
    (out / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("candidate")
    p.add_argument("--output", required=True)
    p.add_argument("--evidence")
    p.add_argument("--execute", action="store_true")
    p.add_argument("--install", default="npm ci")
    p.add_argument("--typecheck", default="")
    p.add_argument("--build", default="npm run build")
    p.add_argument("--timeout", type=int, default=180)
    p.add_argument("--browser", action="store_true")
    p.add_argument("--serve", default="npm run dev -- --host 127.0.0.1 --port {port} --strictPort")
    p.add_argument("--browser-seconds", type=int, default=5)
    args = p.parse_args()
    if args.timeout <= 0 or args.browser_seconds < 0:
        p.error("--timeout must be positive and --browser-seconds nonnegative")
    try:
        report = evaluate(args)
    except (ValueError, OSError) as exc:
        p.exit(2, f"Evaluation rejected: {exc}\n")
    print(json.dumps({"report": str(Path(args.output) / "report.json"),
                      "overall": report["overall"], "candidate_sha256": report["candidate_sha256"]}))
    return 1 if report["overall"] == "fail" else 0


if __name__ == "__main__":
    raise SystemExit(main())
