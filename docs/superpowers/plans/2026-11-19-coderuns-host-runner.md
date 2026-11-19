# CodeRuns Host Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up host-native bwrap job runner on Debian 13 server with HTTP daemon.

**Architecture:** Single Python daemon (stdlib http + subprocess) on server spawns one `systemd-run + bwrap` jail per `POST /run`, RAM 1|2G tiers, 25G disk bind, isolated/egress net profiles. No Wolfi, no Podman.

**Tech Stack:** Python 3 (stdlib only), bwrap, systemd-run, Debian 13 apt (python3, nodejs, git, awscli).

**Spec:** `plan.md` on `sandbox` branch (bwrap-only remote runner, host-native).

## Global Constraints

- No Podman, no gVisor, no Wolfi/apko image builds.
- Runtimes: `/usr/bin/python3` and `/usr/bin/node`, code via stdin `-`.
- RAM tiers only `1` or `2` (GB); disk scratch max 25 GB per job.
- Egress secrets (AWS_/GIT_) only on `profile=egress`, never logged.
- Python only for daemon; no new deps without asking.

## Review Focus

- Oversize code (>256KB) or env value (>8KB) must be rejected 413, not executed.
- Egress job without token/scope must be 401/403, never fall back to isolated+secrets.
- 25G disk cap must kill or reject before host fills; `df` pre-flight <30G free rejects.
- Untrusted scrape HTML must not execute inline in viewer (sandbox iframe + CSP).
- Revoked key must fail closed immediately on all endpoints including artifact GET.

---

### Task 1: Host provisioning

**Files:**
- Create: `ops/provision.sh`
- Test: `ops/test_provision.sh` (assert commands exist + delegate + jobs dir)

**Interfaces:**
- Consumes: nothing
- Produces: server with `bwrap python3 node git aws`, `Delegate=cpu cpuset io memory pids`, `/var/coderuns/jobs` owned by `agent`

- [ ] **Step 1: Write failing check** `ops/test_provision.sh` asserting `bwrap`, `systemd-run`, `python3`, `node`, delegate file, jobs dir.
- [ ] **Step 2: Run check, expect FAIL** (fresh server or container): `bash ops/test_provision.sh`
- [ ] **Step 3: Implement `ops/provision.sh`** (apt install, delegate.conf, daemon-reload note, mkdir/chown jobs dir, optional hold).
- [ ] **Step 4: Run check, expect PASS** on server.
- [ ] **Step 5: Commit** `git add ops/ && git commit -m "feat: provision debian bwrap host"`

### Task 2: Sandbox runner function

**Files:**
- Create: `server/runner.py` (`run_wolfi_sandbox` host-native, no rootfs arg)
- Test: `tests/test_runner.py`

**Interfaces:**
- Consumes: host binaries
- Produces: `run_job(code, runtime, vcpus, ram_gb, timeout_sec, profile, env_vars, job_id) -> {exit_code, stdout, stderr, killed_or_timed_out, workspace}`

- [ ] **Step 1: Failing test** 1G OOM (`bytearray(1200MB)` → exit 137), 2G live, timeout kill (`while True` → 137), isolated no-net (`socket.connect` fails), code via stdin leaves no `.py` on host.
- [ ] **Step 2: Run, expect FAIL** `pytest tests/test_runner.py -v`
- [ ] **Step 3: Implement `run_job`** per plan.md §4 (systemd-run + timeout + bwrap host binds, 1|2 allowlist, tmpfs vs 25G bind, clearenv allowlist).
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** `feat: host-native bwrap runner 1|2G 25G disk`.

### Task 3: Daemon POST /run + artifacts

**Files:**
- Create: `server/daemon.py`, `server/keys.py` (argon2/bcrypt hash, `crk_` prefix, scopes)
- Test: `tests/test_daemon.py`

**Interfaces:**
- Consumes: Task 2 `run_job`
- Produces: `POST /run`, `GET /artifacts/{job}/{path}`, bearer auth, 413/401/403 paths

- [ ] **Step 1: Failing test** valid python run 200 + stdout; bad key 401; oversize code 413; egress without scope 403; artifact fetch round-trip.
- [ ] **Step 2: Run, expect FAIL**.
- [ ] **Step 3: Implement daemon** (stdlib http.server, token compare, size caps 256KB/8KB, stdout 1MB cap, manifest, `rm -rf` after configurable retain).
- [ ] **Step 4: Run, expect PASS**.
- [ ] **Step 5: Commit** `feat: daemon run and artifacts with scoped keys`.
