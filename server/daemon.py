"""CodeRuns daemon: minimal HTTP API over the bwrap runner. Stdlib only.

Endpoints (bearer `crk_` keys):
  POST /run                  {runtime, code, vcpus, ram_gb, timeout_sec, profile, env}
  GET  /jobs                 list job metas (no code)
  GET  /jobs/<id>            meta + stdout/stderr tails
  GET  /artifacts/<job>/<p>  download workspace file
  GET  /keys                 admin: list key metadata
  POST /keys                 admin: {name, scopes, expires_at?}
  DELETE /keys/<prefix>      admin: revoke
"""
import json
import os
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import keys as keystore
from . import runner

JOBS_DIR = os.environ.get("CODERUNS_JOBS", "/var/coderuns/jobs")
KEYS_DB = os.environ.get("CODERUNS_KEYS_DB", "/var/coderuns/keys.db")
UI_DIR = os.environ.get("CODERUNS_UI", "")
MAX_BODY = 512 * 1024
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript",
        ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
        ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2"}


def _bearer(handler):
    auth = handler.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else ""


class Handler(BaseHTTPRequestHandler):
    server_version = "CodeRuns/0.1"

    def log_message(self, *a):
        pass

    def _send(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _need(self, scope):
        row = keystore.verify(KEYS_DB, _bearer(self), scope)
        if not row:
            self._send(401, {"error": "unauthorized"})
            return None
        return row

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, OSError):
            return None

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        if parts == ["health"]:
            return self._send(200, {"ok": True})
        if parts == ["jobs"]:
            if not self._need("artifacts:read"):
                return
            out = []
            for jid in sorted(os.listdir(JOBS_DIR)) if os.path.isdir(JOBS_DIR) else []:
                try:
                    with open(os.path.join(JOBS_DIR, jid, "meta.json")) as f:
                        m = json.load(f)
                    m.pop("code", None)
                    out.append(m)
                except OSError:
                    continue
            return self._send(200, {"jobs": out})
        if len(parts) == 2 and parts[0] == "jobs":
            if not self._need("artifacts:read"):
                return
            return self._job(parts[1], full=False)
        if len(parts) >= 2 and parts[0] == "artifacts":
            if not self._need("artifacts:read"):
                return
            return self._artifact(parts[1], parts[2:])
        if parts == ["keys"]:
            if not self._need("admin"):
                return
            import sqlite3
            db = sqlite3.connect(KEYS_DB)
            try:
                rows = db.execute("SELECT prefix, name, scopes, expires_at, revoked,"
                                  " created_at, last_used_at FROM keys").fetchall()
            except sqlite3.OperationalError:
                rows = []
            db.close()
            return self._send(200, {"keys": [
                {"prefix": p, "name": n, "scopes": s.split(",") if s else [],
                 "expires_at": e, "revoked": bool(r), "created_at": c,
                 "last_used_at": l}
                for p, n, s, e, r, c, l in rows]})
        if UI_DIR:
            return self._ui(parsed.path)
        return self._send(404, {"error": "not found"})

    def _ui(self, path):
        rel = path[1:] if path.startswith("/") else path
        base = os.path.realpath(UI_DIR)
        target = os.path.realpath(os.path.join(base, rel))
        if target != base and not target.startswith(base + os.sep):
            return self._send(400, {"error": "bad path"})
        if os.path.isdir(target):
            target = os.path.join(target, "index.html")
        if not os.path.isfile(target):
            target = os.path.join(base, "index.html")  # SPA fallback
            if not os.path.isfile(target):
                return self._send(404, {"error": "not found"})
        _, ext = os.path.splitext(target)
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(os.path.getsize(target)))
        self.send_header("Cache-Control", "no-store" if ext == ".html" else "public, max-age=3600")
        self.end_headers()
        with open(target, "rb") as f:
            while (chunk := f.read(65536)):
                self.wfile.write(chunk)

    def _job(self, jid, full):
        if not jid.replace("-", "").replace("_", "").isalnum():
            return self._send(400, {"error": "bad job id"})
        try:
            with open(os.path.join(JOBS_DIR, jid, "meta.json")) as f:
                m = json.load(f)
        except OSError:
            return self._send(404, {"error": "no such job"})
        if not full:
            m.pop("code", None)
        return self._send(200, m)

    def _artifact(self, jid, rel):
        base = os.path.realpath(os.path.join(JOBS_DIR, jid))
        target = os.path.realpath(os.path.join(base, *rel))
        if not target.startswith(base + os.sep) and target != base:
            return self._send(400, {"error": "bad path"})
        if not os.path.isfile(target) or os.path.getsize(target) > 200 * 1024 * 1024:
            return self._send(404, {"error": "no such artifact"})
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(os.path.getsize(target)))
        self.end_headers()
        with open(target, "rb") as f:
            while (chunk := f.read(65536)):
                self.wfile.write(chunk)

    def do_POST(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/run":
            return self._run()
        if parsed.path == "/keys":
            if not self._need("admin"):
                return
            body = self._read_json()
            if body is None:
                return self._send(413, {"error": "body too large or invalid"})
            try:
                created = keystore.create_key(
                    KEYS_DB, body.get("name", "unnamed"),
                    body.get("scopes", []), body.get("expires_at"))
            except ValueError as e:
                return self._send(400, {"error": str(e)})
            return self._send(200, created)
        return self._send(404, {"error": "not found"})

    def _run(self):
        body = self._read_json()
        if body is None:
            return self._send(413, {"error": "body too large or invalid"})
        runtime = body.get("runtime", "python")
        scope = f"run:{runtime}"
        if not self._need(scope):
            return
        code = body.get("code", "")
        if not isinstance(code, str) or len(code.encode()) > runner.MAX_CODE_BYTES:
            return self._send(413, {"error": "code exceeds 256KB cap"})
        profile = body.get("profile", "isolated")
        if profile == "egress" and not keystore.verify(
                KEYS_DB, _bearer(self), "egress"):
            return self._send(403, {"error": "egress scope required"})
        try:
            ram_gb = int(body.get("ram_gb", 1))
            result = runner.run_job(
                code, runtime=runtime, vcpus=float(body.get("vcpus", 1.0)),
                ram_gb=ram_gb, timeout_sec=int(body.get("timeout_sec", 30)),
                profile=profile, env_vars=body.get("env") or {},
                job_id=None, jobs_dir=JOBS_DIR)
        except ValueError as e:
            return self._send(400, {"error": str(e)})
        import secrets as _s
        jid = f"j_{int(time.time())}_{_s.token_hex(4)}"
        jdir = os.path.join(JOBS_DIR, jid)
        os.makedirs(jdir, exist_ok=True)
        artifacts = []
        try:
            for name in sorted(os.listdir(jdir)):
                p = os.path.join(jdir, name)
                if os.path.isfile(p):
                    artifacts.append({"path": name, "size": os.path.getsize(p)})
        except OSError:
            pass
        meta = {"job_id": jid, "runtime": runtime, "profile": profile,
                "ram_gb": ram_gb, "exit_code": result["exit_code"],
                "killed_or_timed_out": result["killed_or_timed_out"],
                "stdout_tail": result["stdout"][-8000:],
                "stderr_tail": result["stderr"][-8000:],
                "artifacts": artifacts, "created_at": int(time.time())}
        with open(os.path.join(jdir, "meta.json"), "w") as f:
            json.dump(meta, f)
        meta_response = dict(meta)
        meta_response.update({"stdout": result["stdout"], "stderr": result["stderr"]})
        return self._send(200, meta_response)

    def do_DELETE(self):  # noqa: N802
        parts = [p for p in urllib.parse.urlparse(self.path).path.split("/") if p]
        if len(parts) == 2 and parts[0] == "keys":
            if not self._need("admin"):
                return
            ok = keystore.revoke(KEYS_DB, parts[1])
            return self._send(200 if ok else 404, {"revoked": ok})
        return self._send(404, {"error": "not found"})


def main():
    os.makedirs(JOBS_DIR, exist_ok=True)
    host = os.environ.get("CODERUNS_HOST", "127.0.0.1")
    port = int(os.environ.get("CODERUNS_PORT", "8080"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"coderuns daemon on {host}:{port} jobs={JOBS_DIR} ui={UI_DIR or 'off'}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
