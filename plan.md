
Dedicated AI Code-Execution Sandboxes

If you prefer a tool built specifically to manage lifecycle, APIs, and resource limits for AI agents rather than managing raw container flags yourself:
• E2B (Open-Source Self-Hosted) or Firecracker: Tools like E2B orchestrate Firecracker microVMs (the same technology AWS Lambda uses). Each agent session gets an isolated microVM that boots in ~125ms and is destroyed afterward.
• nsjail or Bubblewrap (bwrap): Lightweight Linux process sandboxes that use namespaces, seccomp-bpf filters, and cgroups without needing a full container daemon. They are ideal if you want ultra-fast, single-process Python execution with zero root privileges.

Recommended Setup for Your Wolfi Image

For the strongest balance of security and simplicity on a single server, run Rootless Podman paired with gVisor and strict resource flags:
bash
podman run --rm \
  --runtime=runsc \
  --network=none \
  --read-only \
  --tmpfs /workspace:rw,noexec,nosuid,size=100m \
  --memory=512m \
  --cpus=1.0 \
  --pids-limit=64 \
  my-wolfi-agent:latest
Use code with caution.
• --runtime=runsc: Routes all system calls through gVisor instead of your host kernel.
• --network=none: Cuts off internet and local network access so the agent cannot exfiltrate data or scan your internal network.
• --read-only: Prevents the agent from modifying system files, confining writes strictly to a temporary 100MB /workspace in RAM.


How to Enforce a 1 GB Limit


Option 1: Using nsjail (Built-In Support)

nsjail handles memory limits natively using either virtual address space limits (rlimit) or Linux cgroups v2.
bash
nsjail \
  --mode o \
  --chroot /path/to/wolfi-rootfs \
  --user 65532 \
  --group 65532 \
  --time_limit 30 \
  --rlimit_as 1024 \
  --cgroup_mem_max 1073741824 \
  -- /usr/bin/python3 /workspace/agent_script.py

  
Step 1: Install Bubblewrap and systemd-container

Run this once as root (or via sudo) to install Bubblewrap and the D-Bus user session tools required by systemd-run --user:
bash
sudo apt update && sudo apt install -y bubblewrap dbus-user-session
Use code with caution.

Step 2: Enable User Cgroup Memory Delegation

By default, Debian delegates CPU and PID controllers to non-root users, though memory delegation is sometimes omitted on minimal installs. Run this as root to ensure your unprivileged agent user can enforce MemoryMax=1G:
bash
sudo mkdir -p /etc/systemd/system/user@.service.d
cat <<EOF | sudo tee /etc/systemd/system/user@.service.d/delegate.conf
[Service]
Delegate=cpu cpuset io memory pids
EOF

sudo systemctl daemon-reload
Use code with caution.
(Log out and log back in as your non-root user for the new delegation settings to take effect.)

Step 3: Unpack Your Wolfi Image

Export your apko-built Wolfi container tarball into a read-only rootfs folder owned by your non-root user:
bash
mkdir -p ~/wolfi-rootfs
tar -xf output.tar -C ~/wolfi-rootfs
Use code with caution.
(Note: If apko build outputs an OCI layout archive with multiple layer tarballs inside blobs/sha256/, extract the layer tarballs into ~/wolfi-rootfs or use crane export / podman export to get a flat filesystem tarball.)

Step 4: Run and Test the 1 GB Sandbox

Run this command as your unprivileged user to verify that the sandbox isolates your Wolfi Python runtime and kills any script exceeding 1 GB:
bash
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
Use code with caution.
• Expected Result: Python tries to allocate 1.2 GB of RAM, hits the 1 GB cgroup wall, and is immediately terminated with Killed (exit code 137) without impacting your Debian host.
• Key Protections Included:
	• --unshare-all: Cuts off network access, hides host processes, and isolates IPC/UTS namespaces.
	• --ro-bind ~/wolfi-rootfs /: Locks the Wolfi OS files as strictly read-only.
	• --tmpfs /workspace: Gives the agent an ephemeral, in-memory scratch folder (also counted toward the 1 GB RAM cap) that vanishes when Python exits.
If


How CPUQuota Maps to vCPUs

In systemd, 100% equals 1 full vCPU core. You simply adjust the -p CPUQuota= flag to match your desired vCPU allocation:
• 0.5 vCPU (Half a core): -p CPUQuota=50%
• 1.0 vCPU (One full core): -p CPUQuota=100%
• 2.0 vCPUs (Two full cores): -p CPUQuota=200%

Ready-to-Use Bubblewrap Command

Wrap bwrap in systemd-run --user --scope and swap the CPUQuota value depending on the tier your agent task needs:
bash
systemd-run --user --scope \
  -p MemoryMax=1G \
  -p MemorySwapMax=0 \
  -p CPUQuota=50% \
  bwrap \
    --ro-bind ~/wolfi-rootfs / \
    --tmpfs /workspace \
    --proc /proc \
    --dev /dev \
    --unshare-all \
    --die-with-parent \
    --chdir /workspace \
    /usr/bin/python3 -c "print('Running on 0.5 vCPU and 1GB RAM!')"
Use code with caution.

Important Details for Multi-Core Limits

• Pinning Specific Cores (Optional): If you want to prevent noisy-neighbor cache contention and lock a 1-vCPU or 2-vCPU job to dedicated physical threads, you can add -p AllowedCPUs=0 (for core 0) or -p AllowedCPUs=0-1 (for cores 0 and 1).
• Single-Threaded Python Behavior: Standard Python code is single-threaded due to the Global Interpreter Lock (GIL), meaning a basic script will only ever use up to 1.0 vCPU (100%). Giving an agent 2.0 vCPUs (200%) only speeds up tasks that spawn multiple processes or use multi-threaded C libraries like numpy.
• Debian 13 Prerequisites: Make sure you have cpu included in your /etc/systemd/system/user@.service.d/delegate.conf file (Delegate=cpu cpuset io memory pids) so your unprivileged user is permitted to apply CPUQuota and AllowedCPUs.


Option 1: Python Orchestrator Wrapper

Use Python's built-in subprocess.run to launch systemd-run --user --scope with bwrap and pass the untrusted code via input=.
python
import os
import subprocess


def run_wolfi_sandbox(
    code: str,
    vcpus: float = 0.5,
    ram_gb: int = 1,
    timeout_sec: int = 15,
    rootfs_path: str = os.path.expanduser("~/wolfi-rootfs"),
) -> dict:
  cpu_quota = f"{int(vcpus * 100)}%"
  memory_max = f"{ram_gb}G"

  cmd = [
      "systemd-run",
      "--user",
      "--scope",
      "--quiet",
      "-p",
      f"MemoryMax={memory_max}",
      "-p",
      "MemorySwapMax=0",
      "-p",
      f"CPUQuota={cpu_quota}",
      "-p",
      "TasksMax=64",  # Fork-bomb protection
      "timeout",
      "-s",
      "KILL",
      str(timeout_sec),
      "bwrap",
      "--ro-bind",
      rootfs_path,
      "/",
      "--tmpfs",
      "/workspace",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--unshare-all",
      "--die-with-parent",
      "--chdir",
      "/workspace",
      "/usr/bin/python3",
      "-",  # Reads code cleanly from stdin
  ]

  result = subprocess.run(cmd, input=code, text=True, capture_output=True)

  return {
      "exit_code": result.returncode,
      "stdout": result.stdout,
      "stderr": result.stderr,
      "killed_or_timed_out": result.returncode in (-9, 137),
  }


# Example usage:
# res = run_wolfi_sandbox("import math; print(math.sqrt(144))", vcpus=0.5, ram_gb=1, timeout_sec=10)
Use code with caution.

Option 2: JavaScript (Node.js) Orchestrator Wrapper

Use Node's native child_process.spawn to stream the code into stdin and capture stdout/stderr asynchronously.
javascript
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export function runWolfiSandbox({
  code,
  vcpus = 0.5,
  ramGb = 1,
  timeoutSec = 15,
  rootfsPath = path.join(os.homedir(), 'wolfi-rootfs'),
}) {
  return new Promise((resolve, reject) => {
    const cpuQuota = `${Math.round(vcpus * 100)}%`;
    const memoryMax = `${ramGb}G`;

    const args = [
      '--user', '--scope', '--quiet',
      '-p', `MemoryMax=${memoryMax}`,
      '-p', 'MemorySwapMax=0',
      '-p', `CPUQuota=${cpuQuota}`,
      '-p', 'TasksMax=64', // Fork-bomb protection
      'timeout', '-s', 'KILL', String(timeoutSec),
      'bwrap',
      '--ro-bind', rootfsPath, '/',
      '--tmpfs', '/workspace',
      '--proc', '/proc',
      '--dev', '/dev',
      '--unshare-all',
      '--die-with-parent',
      '--chdir', '/workspace',
      '/usr/bin/python3', '-', // Reads code cleanly from stdin
    ];

    const child = spawn('systemd-run', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => reject(err));

    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
        killedOrTimedOut: exitCode === 137 || exitCode === null,
      });
    });

    // Write Python script into stdin and close stream
    child.stdin.write(code);
    child.stdin.end();
  });
}

// Example usage:
// const res = await runWolfiSandbox({ code: 'print(2 + 2)', vcpus: 1.0, ramGb: 1, timeoutSec: 10 });
Use code with caution.

Key Safeguards Included in Both Wrappers

• Zero Disk Writes (stdin Pipe): Passing "-" to /usr/bin/python3 executes code directly from memory without creating temporary .py files on your Debian host.
• Hard SIGKILL Timeouts (timeout -s KILL): Ensures infinite while True: loops are terminated immediately at the kernel level rather than hanging your orchestrator.
• Process Cap (TasksMax=64): Uses systemd cgroup limits to stop fork bombs (os.fork()) inside the sandbox from exhausting host PIDs.
• Clean Diagnostics (exit_code == 137): Easily detects whether the agent's script crashed due to a Python syntax error (exit_code == 1) or was forcibly killed for exceeding 1 GB RAM or the time limit (exit_code == 137).
If


Here is the updated setup with cloudflared removed, keeping Python 3.12, Node.js 22, Git, and S3 access (boto3 and aws-cli-v2) ready to build and run on your Debian 13 host.

1. apko.yaml (Python, Node.js, Git & S3)

Save this file and compile your Wolfi image with apko build apko.yaml wolfi-agent:latest output.tar:
yaml
contents:
  repositories:
    - https://wolfi.dev
  keyring:
    - https://wolfi.dev/wolfi-signing.rsa.pub
  packages:
    - wolfi-baselayout
    - ca-certificates-bundle # Required for HTTPS (Git & S3)
    - busybox                # Basic shell utilities needed by git/scripts
    # Python & S3 SDK
    - python-3.12
    - py3-boto3
    # JavaScript (Node.js)
    - nodejs-22
    # CLI Tools
    - git
    - openssh-client         # Needed if cloning Git over SSH
    - aws-cli-v2             # For S3 CLI operations

accounts:
  groups:
    - groupname: agent
      gid: 65532
  users:
    - username: agent
      uid: 65532
      gid: 65532
  run-as: 65532

paths:
  - path: /workspace
    type: directory
    uid: 65532
    gid: 65532
    permissions: 0o755

work-dir: /workspace
Use code with caution.

2. Python Orchestrator Wrapper

This wrapper runs either Python or JavaScript inside Bubblewrap with your vCPU/RAM caps, DNS resolution, and scoped environment variables for S3 and Git:
python
import os
import subprocess


def run_wolfi_sandbox(
    code: str,
    runtime: str = "python",  # "python" or "node"
    vcpus: float = 1.0,
    ram_gb: int = 1,
    timeout_sec: int = 30,
    env_vars: dict[str, str] | None = None,
    rootfs_path: str = os.path.expanduser("~/wolfi-rootfs"),
) -> dict:
  interpreter = "/usr/bin/python3" if runtime == "python" else "/usr/bin/node"
  cpu_quota = f"{int(vcpus * 100)}%"

  cmd = [
      "systemd-run",
      "--user",
      "--scope",
      "--quiet",
      "-p",
      f"MemoryMax={ram_gb}G",
      "-p",
      "MemorySwapMax=0",
      "-p",
      f"CPUQuota={cpu_quota}",
      "-p",
      "TasksMax=128",
      "timeout",
      "-s",
      "KILL",
      str(timeout_sec),
      "bwrap",
      "--ro-bind",
      rootfs_path,
      "/",
      "--ro-bind",
      "/etc/resolv.conf",
      "/etc/resolv.conf",
      "--tmpfs",
      "/workspace",
      "--tmpfs",
      "/tmp",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--unshare-cgroup",
      "--die-with-parent",
      "--chdir",
      "/workspace",
      "--clearenv",
      "--setenv",
      "PATH",
      "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "--setenv",
      "HOME",
      "/workspace",
  ]

  if env_vars:
    for key, val in env_vars.items():
      cmd.extend(["--setenv", key, val])

  cmd.extend([interpreter, "-"])

  result = subprocess.run(cmd, input=code, text=True, capture_output=True)

  return {
      "exit_code": result.returncode,
      "stdout": result.stdout,
      "stderr": result.stderr,
      "killed_or_timed_out": result.returncode in (-9, 137),
  }
Use code with caution.

3. JavaScript (Node.js) Orchestrator Wrapper

If your orchestrator itself is written in Node.js, use this equivalent wrapper:
javascript
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export function runWolfiSandbox({
  code,
  runtime = 'python', // 'python' or 'node'
  vcpus = 1.0,
  ramGb = 1,
  timeoutSec = 30,
  envVars = {},
  rootfsPath = path.join(os.homedir(), 'wolfi-rootfs'),
}) {
  return new Promise((resolve, reject) => {
    const interpreter = runtime === 'python' ? '/usr/bin/python3' : '/usr/bin/node';
    const cpuQuota = `${Math.round(vcpus * 100)}%`;

    const args = [
      '--user', '--scope', '--quiet',
      '-p', `MemoryMax=${ramGb}G`,
      '-p', 'MemorySwapMax=0',
      '-p', `CPUQuota=${cpuQuota}`,
      '-p', 'TasksMax=128',
      'timeout', '-s', 'KILL', String(timeoutSec),
      'bwrap',
      '--ro-bind', rootfsPath, '/',
      '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
      '--tmpfs', '/workspace',
      '--tmpfs', '/tmp',
      '--proc', '/proc',
      '--dev', '/dev',
      '--unshare-user',
      '--unshare-pid',
      '--unshare-ipc',
      '--unshare-uts',
      '--unshare-cgroup',
      '--die-with-parent',
      '--chdir', '/workspace',
      '--clearenv',
      '--setenv', 'PATH', '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '--setenv', 'HOME', '/workspace',
    ];

    for (const [key, val] of Object.entries(envVars)) {
      args.push('--setenv', key, String(val));
    }

    args.push(interpreter, '-');

    const child = spawn('systemd-run', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => reject(err));

    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
        killedOrTimedOut: exitCode === 137 || exitCode === null,
      });
    });

    child.stdin.write(code);
    child.stdin.end();
  });
}

Connecting to an S3-compatible provider (such as Cloudflare R2, MinIO, Backblaze B2, or DigitalOcean Spaces) works out of the box with both boto3 and aws-cli-v2 by passing standard endpoint environment variables into your Bubblewrap wrapper.

1. Environment Variables to Pass Into the Sandbox

Modern versions of boto3 and aws-cli-v2 natively recognize AWS_ENDPOINT_URL, so you do not need to modify your apko.yaml or hardcode endpoints inside your agent's scripts. Pass these keys in your env_vars / envVars dictionary:
• AWS_ENDPOINT_URL: Your provider's HTTPS API URL (e.g., https://<account_id>.r2.cloudflarestorage.com or https://backblazeb2.com).
• AWS_ACCESS_KEY_ID: Your S3-compatible access key.
• AWS_SECRET_ACCESS_KEY: Your S3-compatible secret key.
• AWS_DEFAULT_REGION: Usually auto (for Cloudflare R2) or us-east-1 (for MinIO and most other S3-compatible providers).

2. How the Agent Connects Inside the Sandbox

Because those environment variables are injected via --setenv, both Python and CLI commands inside the Wolfi jail automatically route S3 traffic to your custom endpoint without any extra configuration:
• Using Python (boto3):python
import os
import boto3

# Automatically picks up AWS_ENDPOINT_URL, keys, and region from env
s3 = boto3.client("s3")
print(s3.list_buckets())
Use code with caution.

* **Using the CLI (`aws-cli-v2`):**
  ```bash
  aws s3 ls s3://your-bucket-name/

3. Provider-Specific Quirks to Watch For

• Path-Style Addressing (MinIO / Self-Hosted): If you use a self-hosted S3 server that does not support virtual-hosted-style subdomains (://domain.com), add "AWS_S3_ADDRESSING_STYLE": "path" to your env_vars dictionary.
• Custom TLS Certificates: If your S3-compatible endpoint runs on a private network with a self-signed SSL certificate, bind-mount your host's CA certificate into the jail (--ro-bind /path/to/ca.crt /etc/ssl/certs/custom-s3.crt) and pass "AWS_CA_BUNDLE": "/etc/ssl/certs/custom-s3.crt".
• Node.js S3 SDK: Unlike boto3 and aws-cli-v2, older versions of @aws-sdk/client-s3 in JavaScript require explicitly passing endpoint: process.env.AWS_ENDPOINT_URL when initializing new S3Client({ ... }).
If
  
