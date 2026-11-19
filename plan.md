# CodeRuns — bwrap-only remote runner

Update 2026-11-19: No Podman, no gVisor. Remote Debian 13 server, Wolfi rootfs,
`bwrap` + `systemd-run --user --scope` only. Daemons run Python 3.12 and Node.js 22.
Agent connects remotely, runs scraping / code tests, fetches files, pushes git or S3.

## 1. Goal

- Agent submits code from anywhere, server executes in isolated bwrap jail per job.
- Runtimes: `python` (`/usr/bin/python3`) and `node` (`/usr/bin/node`), code via stdin (`-`), zero code files on host.
- Each job capped: 1 GB RAM, tiered vCPU, process cap, hard SIGKILL timeout.
- Outputs: stdout/stderr/exit code + `/workspace` artifacts, retrievable via API, S3 upload, or git push from inside jail.
- Use cases: web scraping and code testing. Scraping needs controlled egress; testing defaults to no network.

Non-goals: no Podman, no gVisor/runsc, no Firecracker/E2B, no warm-worker pool (one bwrap per request).

## 2. Host setup (once, as root + agent user)

Step 1 — install bwrap:
```bash
sudo apt update && sudo apt install -y bubblewrap dbus-user-session
```

Step 2 — allow unprivileged cgroup limits:
```bash
sudo mkdir -p /etc/systemd/system/user@.service.d
cat <<EOF | sudo tee /etc/systemd/system/user@.service.d/delegate.conf
[Service]
Delegate=cpu cpuset io memory pids
EOF
sudo systemctl daemon-reload
```
Log out/in as agent user after this.

Step 3 — unpack apko Wolfi rootfs (see §6):
```bash
mkdir -p ~/wolfi-rootfs
tar -xf output.tar -C ~/wolfi-rootfs
```
If apko emits OCI layout (`blobs/sha256/`), extract layer tarballs into `~/wolfi-rootfs` or use `crane export` to get a flat tarball first.

Step 4 — verify 1 GB kill:
```bash
systemd-run --user --scope \
  -p MemoryMax=1G \
  -p MemorySwapMax=0 \
  -p CPUQuota=100% \
  bwrap \
    --ro-bind ~/wolfi-rootfs / \
    --tmpfs /workspace \
    --proc /proc \
    --dev /dev \
    --unshare-all \
    --die-with-parent \
    --chdir /workspace \
    /usr/bin/python3 -c "x = bytearray(1200 * 1024 * 1024)"
```
Expected: `Killed`, exit 137, host unaffected.

## 3. Sandbox primitive

All jobs go through this shape:

```bash
systemd-run --user --scope --quiet \
  -p MemoryMax=${RAM}G \
  -p MemorySwapMax=0 \
  -p CPUQuota=${CPU}% \
  -p TasksMax=128 \
  timeout -s KILL ${TIMEOUT} \
  bwrap \
    --ro-bind ~/wolfi-rootfs / \
    --tmpfs /workspace \
    --tmpfs /tmp \
    --proc /proc \
    --dev /dev \
    --die-with-parent \
    --chdir /workspace \
    [--ro-bind /etc/resolv.conf /etc/resolv.conf] \
    [--clearenv --setenv PATH ... --setenv HOME /workspace --setenv AWS_... ...] \
    /usr/bin/python3 -   # or /usr/bin/node -
```

CPUQuota mapping: 50% = 0.5 vCPU, 100% = 1.0, 200% = 2.0. Python GIL means
single-threaded code tops at 100%; >100% only helps multiprocess / numpy.
Optional `AllowedCPUs=0` / `0-1` pins cores.

Safeguards: stdin pipe (no .py files on host), `timeout -s KILL`, `TasksMax=128`
fork-bomb cap, exit 137 = killed/OOM/timeout vs exit 1 = code error.

## 4. Network profiles

- `isolated` (default, code tests): `--unshare-all`, no resolv.conf, no env secrets.
- `egress` (scraping, S3, git): share net namespace (omit `--unshare-net`,
  i.e. use `--unshare-user --unshare-pid --unshare-ipc --unshare-uts --unshare-cgroup`
  but not `--unshare-all`), plus `--ro-bind /etc/resolv.conf /etc/resolv.conf`,
  plus `--clearenv` + explicit `--setenv` allowlist. Secrets only in egress jobs,
  never logged.

Scraping note: egress still has no host bind mounts except rootfs read-only;
writes confined to `/workspace` + `/tmp` tmpfs counted against the 1 GB cap.

## 5. Daemon API (runs on remote server)

One small Python daemon (stdlib + subprocess, no framework required) owns job
spawning. Agent connects over Tailscale or HTTPS + bearer token.

- `POST /run` JSON: `{runtime: "python"|"node", code: string, vcpus, ram_gb,
  timeout_sec, profile: "isolated"|"egress", env: {AWS_..., GIT_...}, fetch_files: bool}`
- Behavior: validate size caps (code ≤ 256 KB, env values ≤ 8 KB), spawn §3
  command, pipe `code` to stdin, capture stdout/stderr (cap 1 MB each),
  tar `/workspace` (cap 50 MB) if `fetch_files`.
- Returns: `{exit_code, stdout, stderr, killed_or_timed_out, artifacts: [{path, size}]}`.
  `GET /artifacts/{job_id}/{path}` downloads files.
- `POST /push` options executed inside the same jail (not on host):
  `git push` via injected `GIT_SSH_COMMAND` / token, or `aws s3 cp` via
  `AWS_ENDPOINT_URL / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION`.
- Auth: bearer token env var, constant-time compare, rate limit per token.
  No anonymous net. Daemon user = unprivileged agent user from §2.

Server-side runner (single source of truth, Python):

```python
import os, subprocess

def run_wolfi_sandbox(code, runtime="python", vcpus=1.0, ram_gb=1,
                       timeout_sec=30, profile="isolated", env_vars=None,
                       rootfs_path=os.path.expanduser("~/wolfi-rootfs")):
    interpreter = "/usr/bin/python3" if runtime == "python" else "/usr/bin/node"
    cmd = ["systemd-run", "--user", "--scope", "--quiet",
           "-p", f"MemoryMax={ram_gb}G", "-p", "MemorySwapMax=0",
           "-p", f"CPUQuota={int(vcpus*100)}%", "-p", "TasksMax=128",
           "timeout", "-s", "KILL", str(timeout_sec),
           "bwrap", "--ro-bind", rootfs_path, "/",
           "--tmpfs", "/workspace", "--tmpfs", "/tmp",
           "--proc", "/proc", "--dev", "/dev",
           "--die-with-parent", "--chdir", "/workspace"]
    if profile == "isolated":
        cmd += ["--unshare-all"]
    else:
        cmd += ["--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
                "--unshare-user", "--unshare-pid", "--unshare-ipc",
                "--unshare-uts", "--unshare-cgroup",
                "--clearenv", "--setenv", "PATH",
                "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "--setenv", "HOME", "/workspace"]
        for k, v in (env_vars or {}).items():
            cmd += ["--setenv", k, v]
    cmd += [interpreter, "-"]
    r = subprocess.run(cmd, input=code, text=True, capture_output=True)
    return {"exit_code": r.returncode, "stdout": r.stdout,
            "stderr": r.stderr,
            "killed_or_timed_out": r.returncode in (-9, 137)}
```

Node.js agent client mirrors this over HTTP (`fetch POST /run`), no local bwrap needed.

## 6. apko.yaml (Python, Node.js, Git, S3)

Build with `apko build apko.yaml wolfi-agent:latest output.tar`:

```yaml
contents:
  repositories: ["https://wolfi.dev"]
  keyring: ["https://wolfi.dev/wolfi-signing.rsa.pub"]
  packages:
    - wolfi-baselayout
    - ca-certificates-bundle
    - busybox
    - python-3.12
    - py3-boto3
    - nodejs-22
    - git
    - openssh-client
    - aws-cli-v2
accounts:
  groups: [{groupname: agent, gid: 65532}]
  users: [{username: agent, uid: 65532, gid: 65532}]
  run-as: 65532
paths:
  - path: /workspace
    type: directory
    uid: 65532
    gid: 65532
    permissions: 0o755
work-dir: /workspace
```

## 7. S3 / git from inside jail

Pass via `env` on egress jobs only:
`AWS_ENDPOINT_URL` (e.g. `https://<account>.r2.cloudflarestorage.com`),
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_DEFAULT_REGION` (`auto` for R2, `us-east-1` for MinIO-like).

```python
import boto3
s3 = boto3.client("s3")  # picks up env automatically
print(s3.list_buckets())
```
```bash
aws s3 cp /workspace/out.csv s3://your-bucket/out.csv
```

Quirks: MinIO without virtual-host style needs `AWS_S3_ADDRESSING_STYLE=path`;
private CA needs `--ro-bind /path/ca.crt /etc/ssl/certs/custom-s3.crt` +
`AWS_CA_BUNDLE=/etc/ssl/certs/custom-s3.crt`; old `@aws-sdk/client-s3`
needs explicit `endpoint: process.env.AWS_ENDPOINT_URL`.

Git: inject token via `GIT_PASSWORD` / `GITHUB_TOKEN` env or short-lived
deploy key bind-mounted read-only for that job only; push from `/workspace`
clone inside jail so host creds never touch disk.
```

