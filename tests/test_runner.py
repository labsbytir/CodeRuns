import subprocess
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from server import runner


def test_isolated_defaults():
    cmd = runner.build_command(runtime="python")
    assert cmd[:4] == ["systemd-run", "--user", "--scope", "--quiet"]
    assert "--unshare-all" in cmd
    assert "/usr/bin/python3" in cmd
    assert "MemoryMax=1G" in " ".join(cmd)


def test_egress_node_mounts_and_env():
    cmd = runner.build_command(runtime="node", profile="egress",
                               env_vars={"AWS_ENDPOINT_URL": "https://x"},
                               job_id="j1", jobs_dir="/tmp/jobs")
    assert "/usr/bin/node" in cmd
    assert "--unshare-all" not in cmd
    assert "--ro-bind" in cmd and "/etc/resolv.conf" in cmd
    assert "--bind" in cmd and "/tmp/jobs/j1" in cmd


def test_ram_allowlist():
    for bad in (3, 0, 8):
        try:
            runner.build_command(ram_gb=bad)
        except ValueError:
            continue
        raise AssertionError(f"ram_gb={bad} accepted")
    assert "MemoryMax=2G" in " ".join(runner.build_command(ram_gb=2))


def test_run_job_mocked(monkeypatch):
    class R:
        returncode = 0
        stdout = "hi"
        stderr = ""
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: R())
    res = runner.run_job("print(1)", timeout_sec=10)
    assert res["exit_code"] == 0 and res["stdout"] == "hi"
    assert res["killed_or_timed_out"] is False


def test_run_job_oversize_rejected():
    try:
        runner.run_job("x" * (runner.MAX_CODE_BYTES + 1))
    except ValueError:
        return
    raise AssertionError("oversize code accepted")
