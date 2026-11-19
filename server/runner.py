"""Host-native bwrap sandbox runner. Stdlib only.

Builds `systemd-run --user --scope ... timeout -s KILL ... bwrap ...`
commands and executes untrusted code piped via stdin (no code files on host).
"""
import os
import subprocess

ALLOWED_RUNTIMES = {"python": "/usr/bin/python3", "node": "/usr/bin/node"}
ALLOWED_RAM_GB = (1, 2)
MAX_CODE_BYTES = 256 * 1024
MAX_ENV_VALUE_BYTES = 8 * 1024

BASE_BINDS = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/etc/ssl", "/etc/ssl",
]
BASE_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"


def build_command(*, runtime="python", vcpus=1.0, ram_gb=1,
                   timeout_sec=30, profile="isolated", env_vars=None,
                   job_id=None, jobs_dir="/var/coderuns/jobs",
                   tmp_workspace_mb=256):
    """Return argv list for the sandbox command. Pure function (no exec)."""
    if runtime not in ALLOWED_RUNTIMES:
        raise ValueError(f"runtime must be one of {sorted(ALLOWED_RUNTIMES)}")
    if ram_gb not in ALLOWED_RAM_GB:
        raise ValueError(f"ram_gb must be one of {ALLOWED_RAM_GB}")
    if profile not in ("isolated", "egress"):
        raise ValueError("profile must be isolated or egress")
    if not (0.25 <= vcpus <= 4):
        raise ValueError("vcpus must be between 0.25 and 4")
    if not (5 <= timeout_sec <= 3600):
        raise ValueError("timeout_sec must be between 5 and 3600")

    cmd = [
        "systemd-run", "--user", "--scope", "--quiet",
        "-p", f"MemoryMax={ram_gb}G",
        "-p", "MemorySwapMax=0",
        "-p", f"CPUQuota={int(vcpus * 100)}%",
        "-p", "TasksMax=128",
        "timeout", "-s", "KILL", str(timeout_sec),
        "bwrap",
        *BASE_BINDS,
        "--tmpfs", "/tmp",
        "--proc", "/proc",
        "--dev", "/dev",
        "--die-with-parent",
    ]
    if profile == "isolated":
        cmd.append("--unshare-all")
        cmd += ["--tmpfs", "/workspace"]
    else:
        cmd += ["--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
                "--unshare-user", "--unshare-pid", "--unshare-ipc",
                "--unshare-uts", "--unshare-cgroup",
                "--clearenv",
                "--setenv", "PATH", BASE_PATH,
                "--setenv", "HOME", "/workspace"]
        for k, v in (env_vars or {}).items():
            if len(v.encode()) > MAX_ENV_VALUE_BYTES:
                raise ValueError(f"env {k} exceeds size cap")
            cmd += ["--setenv", k, v]
        if job_id:
            cmd += ["--bind", os.path.join(jobs_dir, job_id), "/workspace"]
        else:
            cmd += ["--tmpfs", "/workspace"]
    cmd += ["--chdir", "/workspace", ALLOWED_RUNTIMES[runtime], "-"]
    return cmd


def _user_scope_env():
    """Env giving access to our own user bus (needed for `systemd-run --user`).

    Systemd system units with User= don't get XDG_RUNTIME_DIR/DBUS set, so
    provide them from our euid. Returns {} if the user manager isn't running.
    """
    try:
        euid = os.geteuid()
    except AttributeError:
        return {}
    runtimedir = f"/run/user/{euid}"
    bus = os.path.join(runtimedir, "bus")
    if os.path.exists(bus):
        return {"XDG_RUNTIME_DIR": runtimedir,
                "DBUS_SESSION_BUS_ADDRESS": f"unix:path={bus}"}
    return {}


def run_job(code, *, runtime="python", vcpus=1.0, ram_gb=1,
            timeout_sec=30, profile="isolated", env_vars=None,
            job_id=None, jobs_dir="/var/coderuns/jobs"):
    """Execute code in the jail. Returns dict with exit/stdout/stderr."""
    if len(code.encode()) > MAX_CODE_BYTES:
        raise ValueError("code exceeds 256KB cap")
    cmd = build_command(runtime=runtime, vcpus=vcpus, ram_gb=ram_gb,
                        timeout_sec=timeout_sec, profile=profile,
                        env_vars=env_vars, job_id=job_id, jobs_dir=jobs_dir)
    r = subprocess.run(cmd, input=code, text=True, capture_output=True,
                       env={**os.environ, **_user_scope_env()})
    return {"exit_code": r.returncode, "stdout": r.stdout[-1_000_000:],
            "stderr": r.stderr[-1_000_000:],
            "killed_or_timed_out": r.returncode in (-9, 137)}
