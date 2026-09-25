#!/usr/bin/env python3
"""Server helper for the Inveon super admin portal.

Runs on the VPS (root cron, every minute — see install-admin-agent.sh) and
talks to the Events API only through files in OPS_DIR, which is mounted
into the events-api container at /app/ops:

  status.json        host + Docker status, written every run
  logs/<name>.log    the last lines of each container's log
  requests/<id>.json actions the portal asks for (written by the API)
  pending/<id>.json  an action being run right now
  results/<id>.json  how each action went
  backups/*.zip      full server backups

The API never gets the Docker socket. This script only ever runs the fixed
actions below, re-checks every name it is given, and refuses anything else.
"""

import datetime
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import zipfile

OPS_DIR = os.environ.get("OPS_DIR", "/var/lib/inveon-ops")
API_UID = int(os.environ.get("API_UID", "0"))
LOG_LINES = int(os.environ.get("LOG_LINES", "2000"))
KEEP_SYSTEM_BACKUPS = int(os.environ.get("KEEP_SYSTEM_BACKUPS", "3"))
# Files and folders copied into a full backup (secrets included — the
# .zip is only readable by the API and root, and downloaded by admins).
BACKUP_PATHS = os.environ.get(
    "BACKUP_PATHS",
    "/home/ubuntu/inveontechnologies-website /var/www/Events/apps/api/.env /var/www/crm",
).split()
# Docker volumes left out of a full backup: databases are dumped instead
# of copied raw, and AI models / caches are large and re-downloadable.
VOLUME_EXCLUDE = re.compile(os.environ.get("VOLUME_EXCLUDE", r"postgres|pgdata|ollama|cache|certbot-www"))
SKIP_DIRS = {"node_modules", ".git", "dist", "__pycache__", ".next", "build"}

NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$")
REQUEST_ID = re.compile(r"^[a-f0-9-]{36}$")
ACTIONS = {
    "truncate_container_logs",
    "prune_images",
    "prune_build_cache",
    "vacuum_journal",
    "restart_container",
    "system_backup",
}


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def run(cmd, timeout=120):
    """Runs a command (argument list, never a shell) and returns (ok, output)."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        return p.returncode == 0, (p.stdout + p.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as err:
        return False, str(err)


def share(path, mode):
    """Lets the API container's user (and only it, plus root) read a file."""
    try:
        os.chown(path, API_UID, API_UID)
        os.chmod(path, mode)
    except OSError:
        pass


def write_json(path, data):
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    share(tmp, 0o600)
    os.replace(tmp, path)


def ensure_dirs():
    os.makedirs(OPS_DIR, exist_ok=True)
    os.chmod(OPS_DIR, 0o711)
    for sub in ("requests", "pending", "results", "logs", "backups"):
        d = os.path.join(OPS_DIR, sub)
        os.makedirs(d, exist_ok=True)
        share(d, 0o700)


def docker_json_lines(args):
    ok, out = run(["docker", *args, "--format", "{{json .}}"])
    if not ok:
        return []
    rows = []
    for line in out.splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def container_names():
    return {c.get("Names", "") for c in docker_json_lines(["ps", "-a"])}


def log_path(name):
    ok, out = run(["docker", "inspect", "--format", "{{.LogPath}}", name])
    return out if ok and out.startswith("/") else None


def meminfo():
    values = {}
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                key, rest = line.split(":", 1)
                values[key] = int(rest.strip().split()[0]) * 1024
    except OSError:
        pass
    return {"totalBytes": values.get("MemTotal", 0), "availableBytes": values.get("MemAvailable", 0)}


def disks():
    ok, out = run(
        ["df", "-B1", "--output=target,size,used,avail,pcent", "-x", "tmpfs", "-x", "devtmpfs", "-x", "overlay", "-x", "squashfs", "-x", "efivarfs"]
    )
    result = []
    if ok:
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) != 5 or parts[0].startswith(("/snap", "/run", "/boot/efi", "/dev")):
                continue
            result.append(
                {
                    "mount": parts[0],
                    "sizeBytes": int(parts[1]),
                    "usedBytes": int(parts[2]),
                    "availBytes": int(parts[3]),
                    "usePercent": int(parts[4].rstrip("%") or 0),
                }
            )
    return result


def collect_status():
    stats = {s.get("Name"): s for s in docker_json_lines(["stats", "--no-stream"])}
    containers = []
    for c in docker_json_lines(["ps", "-a"]):
        name = c.get("Names", "")
        if not NAME.match(name):
            continue
        s = stats.get(name, {})
        path = log_path(name)
        try:
            log_bytes = os.path.getsize(path) if path else 0
        except OSError:
            log_bytes = 0
        mem = s.get("MemUsage", "")
        containers.append(
            {
                "name": name,
                "image": c.get("Image", ""),
                "state": c.get("State", ""),
                "status": c.get("Status", ""),
                "cpu": s.get("CPUPerc", "—"),
                "mem": mem.split(" / ")[0] if mem else "—",
                "memPercent": s.get("MemPerc", "—"),
                "netIO": s.get("NetIO", "—"),
                "blockIO": s.get("BlockIO", "—"),
                "logBytes": log_bytes,
            }
        )
    docker_df = [
        {"type": d.get("Type"), "total": d.get("TotalCount"), "active": d.get("Active"), "size": d.get("Size"), "reclaimable": d.get("Reclaimable")}
        for d in docker_json_lines(["system", "df"])
    ]
    try:
        with open("/proc/uptime", encoding="utf-8") as f:
            uptime = float(f.read().split()[0])
    except OSError:
        uptime = 0
    write_json(
        os.path.join(OPS_DIR, "status.json"),
        {
            "generatedAt": now_iso(),
            "hostname": socket.gethostname(),
            "uptimeSeconds": int(uptime),
            "loadavg": list(os.getloadavg()),
            "cpus": os.cpu_count(),
            "memory": meminfo(),
            "disks": disks(),
            "docker": docker_df,
            "containers": containers,
        },
    )
    return containers


def collect_logs(containers):
    logs_dir = os.path.join(OPS_DIR, "logs")
    keep = set()
    for c in containers:
        name = c["name"]
        ok, out = run(["docker", "logs", "--tail", str(LOG_LINES), "--timestamps", name], timeout=30)
        if not ok and not out:
            continue
        target = os.path.join(logs_dir, f"{name}.log")
        tmp = f"{target}.tmp"
        with open(tmp, "w", encoding="utf-8", errors="replace") as f:
            f.write(out[-5_000_000:])
        share(tmp, 0o600)
        os.replace(tmp, target)
        keep.add(f"{name}.log")
    for old in os.listdir(logs_dir):
        if old.endswith(".log") and old not in keep:
            os.remove(os.path.join(logs_dir, old))


# ---------- actions ----------


def truncate_logs(target):
    names = sorted(container_names()) if target == "all" else [target]
    done = []
    for name in names:
        path = log_path(name)
        if path and os.path.isfile(path):
            os.truncate(path, 0)
            done.append(name)
    return True, f"Emptied the log of: {', '.join(done) or 'nothing'}"


def add_tree(zf, root, arc_root):
    count = 0
    if os.path.isfile(root):
        zf.write(root, arc_root)
        return 1
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            full = os.path.join(dirpath, fn)
            if os.path.islink(full) or not os.path.isfile(full):
                continue
            rel = os.path.relpath(full, root)
            try:
                zf.write(full, os.path.join(arc_root, rel))
                count += 1
            except OSError:
                pass
    return count


def system_backup():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backups_dir = os.path.join(OPS_DIR, "backups")
    target = os.path.join(backups_dir, f"inveon-server-{stamp}.zip")
    partial = f"{target}.partial"
    notes = []
    with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
        # Every Postgres container, as a full SQL dump.
        for c in docker_json_lines(["ps"]):
            name, image = c.get("Names", ""), c.get("Image", "")
            if NAME.match(name) and image.startswith("postgres"):
                ok, out = run(["docker", "exec", name, "sh", "-c", 'pg_dumpall -U "$POSTGRES_USER"'], timeout=1800)
                if ok:
                    zf.writestr(f"databases/{name}.sql", out)
                    notes.append(f"database {name}: {len(out)} bytes")
                else:
                    notes.append(f"database {name}: FAILED {out[-300:]}")
        # Compose files, .env files, app folders.
        for path in BACKUP_PATHS:
            if os.path.exists(path):
                n = add_tree(zf, path, "files" + path)
                notes.append(f"{path}: {n} file(s)")
        # Named Docker volumes (uploads, certificates…).
        ok, out = run(["docker", "volume", "ls", "-q"])
        for vol in out.splitlines() if ok else []:
            if not NAME.match(vol) or VOLUME_EXCLUDE.search(vol):
                continue
            ok2, mount = run(["docker", "volume", "inspect", "--format", "{{.Mountpoint}}", vol])
            if ok2 and os.path.isdir(mount):
                n = add_tree(zf, mount, f"volumes/{vol}")
                notes.append(f"volume {vol}: {n} file(s)")
        zf.writestr(
            "MANIFEST.txt",
            f"Inveon full server backup\nMade: {now_iso()}\nHost: {socket.gethostname()}\n\n" + "\n".join(notes) + "\n\n"
            "Restore a database: cat databases/<container>.sql | docker exec -i <container> psql -U <user>\n",
        )
    share(partial, 0o600)
    os.replace(partial, target)
    old = sorted((f for f in os.listdir(backups_dir) if f.startswith("inveon-server-") and f.endswith(".zip")), reverse=True)
    for f in old[KEEP_SYSTEM_BACKUPS:]:
        os.remove(os.path.join(backups_dir, f))
    size = os.path.getsize(target)
    return True, f"{os.path.basename(target)} ({size // (1024 * 1024)} MB)\n" + "\n".join(notes)


def perform(action, target):
    names = container_names()
    if action in ("truncate_container_logs", "restart_container"):
        if not target or not NAME.match(target) or (target != "all" and target not in names):
            return False, f"Unknown container {target!r}"
    if action == "truncate_container_logs":
        return truncate_logs(target)
    if action == "restart_container":
        if target == "all":
            return False, "Restart one container at a time"
        return run(["docker", "restart", target], timeout=180)
    if action == "prune_images":
        return run(["docker", "image", "prune", "-af"], timeout=900)
    if action == "prune_build_cache":
        return run(["docker", "builder", "prune", "-af"], timeout=900)
    if action == "vacuum_journal":
        return run(["journalctl", "--vacuum-size=200M"])
    if action == "system_backup":
        return system_backup()
    return False, "Unknown action"


def process_requests():
    req_dir = os.path.join(OPS_DIR, "requests")
    for fn in sorted(os.listdir(req_dir)):
        path = os.path.join(req_dir, fn)
        rid = fn[:-5] if fn.endswith(".json") else ""
        if not REQUEST_ID.match(rid) or os.path.getsize(path) > 4096:
            os.remove(path)
            continue
        try:
            with open(path, encoding="utf-8") as f:
                req = json.load(f)
        except (OSError, json.JSONDecodeError):
            os.remove(path)
            continue
        action = req.get("action")
        target = req.get("target")
        base = {
            "id": rid,
            "action": action,
            "target": target,
            "requestedBy": str(req.get("requestedBy", ""))[:200],
            "requestedAt": str(req.get("requestedAt", ""))[:40],
        }
        pending = os.path.join(OPS_DIR, "pending", fn)
        os.replace(path, pending)
        share(pending, 0o600)
        if action not in ACTIONS:
            ok, output = False, "Unknown action — refused"
        else:
            try:
                ok, output = perform(action, target)
            except Exception as err:  # noqa: BLE001 — report any failure to the portal
                ok, output = False, str(err)
        write_json(os.path.join(OPS_DIR, "results", fn), {**base, "status": "done" if ok else "failed", "output": output[-3000:], "finishedAt": now_iso()})
        os.remove(pending)
    # Keep the newest 100 results.
    res_dir = os.path.join(OPS_DIR, "results")
    results = sorted((os.path.join(res_dir, f) for f in os.listdir(res_dir)), key=os.path.getmtime, reverse=True)
    for old in results[100:]:
        os.remove(old)


def main():
    loop_seconds = 0
    if "--loop" in sys.argv:
        loop_seconds = int(sys.argv[sys.argv.index("--loop") + 1])
    ensure_dirs()
    containers = collect_status()
    collect_logs(containers)
    started = time.time()
    while True:
        process_requests()
        if time.time() - started >= loop_seconds:
            break
        time.sleep(5)
    if shutil.which("docker") is None:
        print("docker not found", file=sys.stderr)


if __name__ == "__main__":
    main()
