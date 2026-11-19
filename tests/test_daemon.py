import json
import os
import sys
import threading
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import daemon, keys
from server.daemon import Handler
from http.server import ThreadingHTTPServer


def _serve(tmp_path, monkeypatch):
    jobs = str(tmp_path / "jobs")
    os.makedirs(jobs)
    db = str(tmp_path / "keys.db")
    monkeypatch.setattr(daemon, "JOBS_DIR", jobs)
    monkeypatch.setattr(daemon, "KEYS_DB", db)
    monkeypatch.setattr(daemon.runner, "run_job",
                        lambda *a, **k: {"exit_code": 0, "stdout": "4\n",
                                         "stderr": "",
                                         "killed_or_timed_out": False})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_port}"


def _req(base, path, key=None, data=None, method="GET"):
    req = urllib.request.Request(base + path, method=method,
                                 data=json.dumps(data).encode() if data else None,
                                 headers={"Content-Type": "application/json"})
    if key:
        req.add_header("Authorization", f"Bearer {key}")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_run_and_list_and_artifact(tmp_path, monkeypatch):
    import urllib.error  # noqa: F401  (ensures exported on some versions)
    base = _serve(tmp_path, monkeypatch)
    admin = keys.create_key(daemon.KEYS_DB, "t", ["admin"])["key"]

    st, body = _req(base, "/run", key=admin,
                    data={"runtime": "python", "code": "print(2+2)"}, method="POST")
    assert st == 200, body
    assert body["exit_code"] == 0 and "4" in body["stdout"]
    jid = body["job_id"]

    st, body = _req(base, "/jobs", key=admin)
    assert st == 200 and any(j["job_id"] == jid for j in body["jobs"])

    st, body = _req(base, "/run", key="crk_bad_secret", data={"code": "x"},
                    method="POST")
    assert st == 401

    st, body = _req(base, "/run", key=admin, data={"code": "x" * 300_000},
                    method="POST")
    assert st == 413


def test_egress_needs_scope(tmp_path, monkeypatch):
    import urllib.error  # noqa: F401
    base = _serve(tmp_path, monkeypatch)
    limited = keys.create_key(daemon.KEYS_DB, "n", ["run:python", "artifacts:read"])["key"]
    st, body = _req(base, "/run", key=limited,
                    data={"runtime": "python", "code": "x", "profile": "egress",
                          "env": {"A": "b"}}, method="POST")
    assert st == 403, body


def test_keys_admin(tmp_path, monkeypatch):
    import urllib.error  # noqa: F401
    base = _serve(tmp_path, monkeypatch)
    admin = keys.create_key(daemon.KEYS_DB, "a", ["admin"])["key"]
    st, body = _req(base, "/keys", key=admin, data={"name": "k1",
                                                    "scopes": ["run:python"]},
                    method="POST")
    assert st == 200 and body["key"].startswith("crk_")
    assert "key" not in str(_req(base, "/keys", key=admin)[1].get("keys"))
    st, body = _req(base, f"/keys/{body['prefix']}", key=admin, method="DELETE")
    assert st == 200 and body["revoked"] is True


def test_ui_served_and_spa_fallback(tmp_path, monkeypatch):
    import urllib.error  # noqa: F401
    ui = tmp_path / "ui" / "assets"
    ui.mkdir(parents=True)
    (tmp_path / "ui" / "index.html").write_text("<html>dash</html>")
    (ui / "app.js").write_text("console.log(1)")
    base = _serve(tmp_path, monkeypatch)
    monkeypatch.setattr(daemon, "UI_DIR", str(tmp_path / "ui"))
    with urllib.request.urlopen(base + "/") as r:
        assert r.status == 200 and "dash" in r.read().decode()
    with urllib.request.urlopen(base + "/reports/summary") as r:
        assert r.status == 200 and "dash" in r.read().decode()
