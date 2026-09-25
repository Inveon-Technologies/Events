#!/usr/bin/env bash
# Backs up the Events database (#75): a compressed custom-format pg_dump,
# verified readable, checksummed, pruned after KEEP_DAYS, and optionally
# copied off the server to S3.
#
#   bash scripts/backup-db.sh
#
# Env:
#   BACKUP_DIR      where dumps go (default /var/backups/inveon-events)
#   KEEP_DAYS       local retention in days (default 14)
#   BACKUP_S3_URI   e.g. s3://inveon-backups/events — copies each dump
#                   there with the aws CLI (give the bucket its own
#                   lifecycle rule for retention)
#   DATABASE_URL    back up this database directly instead of via the
#                   compose stack's container (see lib-db.sh)
#
# Nightly on the server (crontab -e):
#   15 2 * * * cd /var/www/Events && bash scripts/backup-db.sh >> /var/log/events-backup.log 2>&1
#
# Restore, and the monthly restore drill: scripts/restore-db.sh.

set -euo pipefail
# shellcheck source=lib-db.sh source-path=SCRIPTDIR
source "$(dirname "$0")/lib-db.sh"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/inveon-events}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/events-$stamp.dump"
tmp="$file.partial"
trap 'rm -f "$tmp"' EXIT

log "Dumping database to $file"
# --no-owner/--no-acl: restorable into any database/user (a drill
# database, a new server) without matching role names.
pg_exec pg_dump --format=custom --compress=6 --no-owner --no-acl > "$tmp"

# A dump that can't be listed can't be restored — check now, not at 3am
# during an incident.
if ! pg_restore --list "$tmp" > /dev/null 2>&1 && ! pg_exec pg_restore --list < "$tmp" > /dev/null 2>&1; then
  log "ERROR: dump is not readable by pg_restore"
  exit 1
fi
tables="$( (pg_restore --list "$tmp" 2>/dev/null || pg_exec pg_restore --list < "$tmp") | grep -c ' TABLE DATA ' || true)"
if [ "$tables" -lt 5 ]; then
  log "ERROR: dump contains only $tables tables' data — refusing to keep it as a good backup"
  exit 1
fi

mv "$tmp" "$file"
chmod 600 "$file"
# Relative name, so the pair still checks out after being copied
# elsewhere (another server, down from S3).
(cd "$BACKUP_DIR" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
log "OK: $(du -h "$file" | cut -f1), $tables tables"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  log "Uploading to $BACKUP_S3_URI"
  aws s3 cp "$file" "${BACKUP_S3_URI%/}/" --only-show-errors --sse AES256
  aws s3 cp "$file.sha256" "${BACKUP_S3_URI%/}/" --only-show-errors --sse AES256
fi

deleted="$(find "$BACKUP_DIR" -maxdepth 1 -name 'events-*.dump*' -mtime +"$KEEP_DAYS" -print -delete | wc -l)"
log "Pruned $deleted file(s) older than $KEEP_DAYS days"
