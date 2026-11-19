#!/usr/bin/env bash
# CodeRuns host provisioning (Debian 13 minimal, host-native bwrap, no Wolfi).
set -euo pipefail

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  bubblewrap dbus-user-session python3 nodejs git awscli curl ca-certificates

id agent >/dev/null 2>&1 || useradd -m -s /bin/bash agent
loginctl enable-linger agent || true

mkdir -p /etc/systemd/system/user@.service.d
printf '[Service]\nDelegate=cpu cpuset io memory pids\n' > /etc/systemd/system/user@.service.d/delegate.conf
systemctl daemon-reload || true

mkdir -p /var/coderuns/jobs
chown agent:agent /var/coderuns/jobs

echo "provision ok: $(bwrap --version | head -1), $(python3 --version), node $(node --version)"
