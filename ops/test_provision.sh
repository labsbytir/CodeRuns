#!/usr/bin/env bash
# Post-provision check. Expects: bwrap, systemd-run, python3, node, delegate, jobs dir.
set -u
fail=0
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; fail=1; }; }
need bwrap; need systemd-run; need python3; need node; need git; need aws
[ -f /etc/systemd/system/user@.service.d/delegate.conf ] || { echo "missing delegate.conf"; fail=1; }
[ -d /var/coderuns/jobs ] || { echo "missing /var/coderuns/jobs"; fail=1; }
id agent >/dev/null 2>&1 || { echo "missing user agent"; fail=1; }
[ "$fail" = 0 ] && echo "provision check PASS"
exit "$fail"
