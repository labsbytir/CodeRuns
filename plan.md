# CodeRuns — bwrap-only remote runner (host-native, no Wolfi)

Update 2026-11-19: No Podman, no gVisor, no Wolfi/apko. Remote Debian 13 minimal
server runs jobs directly on host binaries via `bwrap` + `systemd-run --user --scope`.
Daemons run Python 3 and Node.js. Agent connects remotely, runs scraping / code
tests, fetches files, pushes git or S3.

## 1. Goal

- Agent submits code from anywhere, server executes in isolated bwrap jail per job.
- Runtimes: `python` (`/usr/bin/python3`) and `node` (`/usr/bin/node`), code via stdin (`-`), zero code files on host.
- Caps per job: RAM 1 or 2 GB, tiered vCPU, 25 GB disk scratch, process cap, hard SIGKILL timeout.
- Outputs: stdout/stderr/exit code + `/workspace` artifacts, retrievable via API, S3 upload, or git push from inside jail.
- Use cases: web scraping and code testing. Scraping needs controlled egress; testing defaults to no network.

Non-goals: no Podman, no gVisor, no Wolfi image build, no warm-worker pool (one bwrap per request).

## 2. Where bwrap sits on the host

`bwrap` is the per-job jailer, not a daemon. Stack per request:

Agent HTTPS → Python daemon (auth, validates caps) → `systemd-run --user --scope`
(RAM/vCPU/pids cgroup) → `timeout -s KILL` (wall clock) → `bwrap` (namespaces +
mounts) → `/usr/bin/python3 -` or `/usr/bin/node -`.

What bwrap does that the rest don't:
- mounts: `--ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64`
  read-only toolchain, `--tmpfs /tmp` small RAM scratch, `/workspace` either
  tmpfs (small tests) or `--bind /var/coderuns/jobs/$ID /workspace` (25 GB disk jobs).
- namespaces: `--unshare-all` for isolated tests (no net, no host pids/ipc/uts);
  egress profile uses selective `--unshare-user --unshare-pid --unshare-ipc
  --unshare-uts --unshare-cgroup` (shares net) + `--ro-bind /etc/resolv.conf`.
- confinement: `--proc /proc --dev /dev --die-with-parent --chdir /workspace
  --clearenv` + explicit `--setenv` allowlist so secrets only enter egress jobs.

`systemd-run` handles what bwrap can't: `MemoryMax=1G|2G`, `MemorySwapMax=0`,
`CPUQuota=50|100|200%`, `TasksMax=128` fork-bomb cap. `timeout` handles hangs.
Daemon handles auth, size caps, artifact collect, S3/git, cleanup.

## 3. Host setup (once)

```bash
sudo apt update && sudo apt install -y bubblewrap dbus-user-session \
  python3 nodejs git awscli
sudo mkdir -p /etc/systemd/system/user@.service.d
cat <<EOF | sudo tee /etc/systemd/system/user@.service.d/delegate.conf
[Service]
Delegate=cpu cpuset io memory pids
EOF
sudo systemctl daemon-reload
sudo mkdir -p /var/coderuns/jobs && sudo chown agent:agent /var/coderuns/jobs
# optional XFS project quota for hard 25G caps, else du watchdog in daemon
```
Log out/in as `agent` user after delegate change. Pin versions if needed:
`apt-mark hold python3 nodejs`.

Verify RAM kill (1 GB tier):
```bash
systemd-run --user --scope -p MemoryMax=1G -p MemorySwapMax=0 -p CPUQuota=100% \
bwrap --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
--tmpfs /workspace --proc /proc --dev /dev --unshare-all --die-with-parent \
--chdir /workspace /usr/bin/python3 -c "x = bytearray(1200*1024*1024)"
```
Expected: `Killed`, exit 137. Repeat with `-p MemoryMax=2G` and 2200 MB alloc
to verify the 2 GB tier.

## 4. Sandbox primitive (host-native)

```bash
systemd-run --user --scope --quiet \
  -p MemoryMax=${RAM}G -p MemorySwapMax=0 -p CPUQuota=${CPU}% -p TasksMax=128 \
  timeout -s KILL ${TIMEOUT} \
  bwrap \
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
    --ro-bind /etc/ssl /etc/ssl \
    --proc /proc --dev /dev --die-with-parent --chdir /workspace \
    ${NET_FLAGS} ${WORKSPACE_FLAGS} ${ENV_FLAGS} \
    /usr/bin/python3 -   # or /usr/bin/node -
```

- RAM: `MemoryMax=1G` or `2G` from `POST /run {ram_gb: 1|2}`.
- CPU: 50% = 0.5 vCPU, 100% = 1.0, 200% = 2.0. GIL: single-thread tops at 100%.
- Disk: small tests `WORKSPACE_FLAGS="--tmpfs /workspace:rw,nosuid,nodev,size=256M"`;
  large/scrape `mkdir -p /var/coderuns/jobs/$ID` +
  `WORKSPACE_FLAGS="--bind /var/coderuns/jobs/$ID /workspace"` (ext4/XFS quota
  25G hard, else daemon du watchdog). Keep `--tmpfs /tmp:rw,nosuid,nodev,size=128M`
  in both. Pre-flight `df` reject if host <30G free; `rm -rf $ID` after S3/push.
- Net: isolated `NET_FLAGS="--unshare-all"`; egress shares net (omit
  `--unshare-net`, i.e. `--unshare-user --unshare-pid --unshare-ipc --unshare-uts
  --unshare-cgroup`) + `--ro-bind /etc/resolv.conf /etc/resolv.conf`.
- Env: `--clearenv --setenv PATH ... --setenv HOME /workspace` + per-job
  `--setenv AWS_...` / `GIT_...` only on egress. Code via stdin `-`, stdout/stderr
  capped 1 MB each, artifacts capped 50–200 MB manifest (stream big scrapes to S3).

Exit 137 = OOM/timeout kill, exit 1 = code error.

## 5. Daemon API (on Debian server)

Stdlib Python daemon, user `agent`, bearer token, Tailscale or HTTPS:

- `POST /run` `{runtime: "python"|"node", code (≤256KB), vcpus, ram_gb: 1|2,
  timeout_sec, profile: "isolated"|"egress", env: {...≤8KB each}, fetch_files: bool}`
  → spawn §4, return `{exit_code, stdout, stderr, killed_or_timed_out, artifacts}`.
- `GET /artifacts/{job}/{path}` → file download.
- Push from inside same jail: `aws s3 cp /workspace/... s3://...` via
  `AWS_ENDPOINT_URL / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
  AWS_DEFAULT_REGION` (`auto` R2, `us-east-1` MinIO-like), or `git push` with
  short-lived token/key. Quirks: MinIO path style `AWS_S3_ADDRESSING_STYLE=path`;
  private CA `--ro-bind ca.crt /etc/ssl/certs/custom.crt` + `AWS_CA_BUNDLE`;
  old JS SDK needs explicit `endpoint: process.env.AWS_ENDPOINT_URL`.
