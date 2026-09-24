#!/usr/bin/env bash
# Baseline hardening for the Ubuntu VPS that runs the stack (#7).
# Idempotent — safe to re-run. Review, then run as root:
#
#   sudo bash scripts/server/harden.sh            # apply
#   sudo DRY_RUN=1 bash scripts/server/harden.sh  # print what it would do
#
# What it does:
#   - security updates: unattended-upgrades on, applied daily
#   - firewall (ufw): deny incoming except SSH, 80, 443
#   - SSH: key-only login, no root login, fewer auth attempts
#     (refuses to do this unless the admin user already has a key)
#   - fail2ban: bans IPs brute-forcing SSH
#   - swap: 2GB swap file if the box has none (a Node build or a Postgres
#     spike shouldn't get the OOM killer)
#   - kernel: SYN-flood protection, no ICMP redirects / source routing
#   - Docker: log size caps for every container
#
# Docker publishes ports by editing iptables directly, bypassing ufw — so
# never publish a database port on 0.0.0.0. This stack binds nginx to
# 127.0.0.1:8081 and publishes nothing else.

set -euo pipefail

ADMIN_USER="${ADMIN_USER:-${SUDO_USER:-ubuntu}}"
SSH_PORT="${SSH_PORT:-22}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
# Space-separated, e.g. "8443/tcp 5000/tcp" — any other host service on
# this shared VPS that must stay reachable. (Docker-published ports are
# not affected by ufw either way; see above.)
EXTRA_PORTS="${EXTRA_PORTS:-}"
DRY_RUN="${DRY_RUN:-0}"

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] $*"
  else
    echo "+ $*"
    "$@"
  fi
}

write_file() { # path, content (stdin)
  local path="$1"
  if [ "$DRY_RUN" = "1" ]; then
    echo "[dry-run] write $path:"
    sed 's/^/    /'
  else
    echo "+ write $path"
    cat > "$path"
  fi
}

if [ "$DRY_RUN" != "1" ] && [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo), or with DRY_RUN=1." >&2
  exit 1
fi

echo "== Packages and automatic security updates"
run apt-get update
run env DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban unattended-upgrades
write_file /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
CONF

echo "== Firewall"
run ufw default deny incoming
run ufw default allow outgoing
run ufw allow "${SSH_PORT}/tcp"
run ufw allow 80/tcp
run ufw allow 443/tcp
for port in $EXTRA_PORTS; do
  run ufw allow "$port"
done
run ufw --force enable

echo "== SSH"
admin_home="$(getent passwd "$ADMIN_USER" | cut -d: -f6 || true)"
if [ -z "$admin_home" ] || [ ! -s "$admin_home/.ssh/authorized_keys" ]; then
  echo "!! $ADMIN_USER has no ~/.ssh/authorized_keys — NOT disabling password login (you'd be locked out)."
  echo "!! Add a key, then re-run."
else
  write_file /etc/ssh/sshd_config.d/99-hardening.conf <<CONF
# Managed by scripts/server/harden.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
CONF
  if [ "$DRY_RUN" != "1" ]; then
    # Validate before reloading — a broken sshd config would lock everyone out.
    sshd -t
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
  fi
fi

echo "== fail2ban"
write_file /etc/fail2ban/jail.d/sshd.local <<CONF
[sshd]
enabled = true
port = ${SSH_PORT}
maxretry = 5
findtime = 10m
bantime = 1h
CONF
run systemctl enable --now fail2ban
run systemctl restart fail2ban

echo "== Swap"
if [ "$DRY_RUN" = "1" ] || ! swapon --show | grep -q .; then
  if [ ! -f /swapfile ]; then
    run fallocate -l "$SWAP_SIZE" /swapfile
    run chmod 600 /swapfile
    run mkswap /swapfile
  fi
  run swapon /swapfile || true
  if ! grep -q '^/swapfile' /etc/fstab 2>/dev/null; then
    if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] append /swapfile to /etc/fstab"; else echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
  fi
else
  echo "swap already active"
fi

echo "== Kernel network settings"
write_file /etc/sysctl.d/99-hardening.conf <<'CONF'
# Managed by scripts/server/harden.sh
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
vm.swappiness = 10
CONF
run sysctl --system

echo "== Docker log limits"
if [ -f /etc/docker/daemon.json ] && [ "$DRY_RUN" != "1" ]; then
  echo "/etc/docker/daemon.json exists — leaving it; make sure it caps json-file log size."
else
  write_file /etc/docker/daemon.json <<'CONF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
CONF
  echo "Restart Docker in a maintenance window to apply: systemctl restart docker"
fi

echo "== Done. Check: ufw status verbose; fail2ban-client status sshd; sshd -T | grep -E 'passwordauth|permitroot'"
