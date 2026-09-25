#!/usr/bin/env bash
# Installs the super admin portal's server helper (admin-agent.py) on the
# VPS: creates the ops folder the events-api container reads, and a root
# cron job that runs the helper every minute.
#
#   sudo bash scripts/server/install-admin-agent.sh
#
# Env (optional):
#   OPS_DIR        default /var/lib/inveon-ops (mount it at /app/ops in events-api)
#   API_CONTAINER  default events_api (its user must be able to read the ops files)
#   BACKUP_PATHS   folders/files put into full server backups
#                  (default: the compose folder, the Events API .env, /var/www/crm)
#
# Uninstall: sudo rm /etc/cron.d/inveon-admin-agent

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

OPS_DIR="${OPS_DIR:-/var/lib/inveon-ops}"
API_CONTAINER="${API_CONTAINER:-events_api}"
AGENT="$(cd "$(dirname "$0")" && pwd)/admin-agent.py"
BACKUP_PATHS="${BACKUP_PATHS:-/home/ubuntu/inveontechnologies-website /var/www/Events/apps/api/.env /var/www/crm}"

command -v python3 > /dev/null || { echo "python3 is required" >&2; exit 1; }
command -v docker > /dev/null || { echo "docker is required" >&2; exit 1; }

# The API runs as a non-root user inside its container; the ops files are
# owned by that same numeric id so it (and root) can read them, nobody else.
API_UID="$(docker exec "$API_CONTAINER" id -u 2> /dev/null || true)"
if ! [[ "$API_UID" =~ ^[0-9]+$ ]]; then
  echo "Could not read the user id inside container '$API_CONTAINER' — is it running?" >&2
  exit 1
fi

mkdir -p "$OPS_DIR"
chmod 711 "$OPS_DIR"
for sub in requests pending results logs backups; do
  mkdir -p "$OPS_DIR/$sub"
  chown "$API_UID:$API_UID" "$OPS_DIR/$sub"
  chmod 700 "$OPS_DIR/$sub"
done

cat > /etc/cron.d/inveon-admin-agent << CRON
# Inveon super admin portal — server helper (scripts/server/admin-agent.py)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root OPS_DIR=$OPS_DIR API_UID=$API_UID BACKUP_PATHS="$BACKUP_PATHS" flock -n /run/inveon-admin-agent.lock python3 $AGENT --loop 55 >> /var/log/inveon-admin-agent.log 2>&1
CRON
chmod 644 /etc/cron.d/inveon-admin-agent

# First run now, so the portal has data straight away.
OPS_DIR="$OPS_DIR" API_UID="$API_UID" BACKUP_PATHS="$BACKUP_PATHS" python3 "$AGENT"

echo "Installed. Ops folder: $OPS_DIR (owner uid $API_UID)."
echo "Next: mount it into events-api — '- $OPS_DIR:/app/ops' — and recreate the container."
