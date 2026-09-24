#!/usr/bin/env bash
# Restores an Events backup (#75).
#
# Drill (default) — restores into a scratch database next to the live
# one, checks it, compares row counts with the live database, and drops
# it again. Nothing live is touched. Do this monthly, and after changing
# anything about backups:
#
#   bash scripts/restore-db.sh /var/backups/inveon-events/events-<stamp>.dump
#
# Real restore (disaster recovery) — replaces the contents of TARGET_DB.
# Stop the API first (docker compose stop events-api), then:
#
#   TARGET_DB=inveon_events CONFIRM=overwrite-inveon_events \
#     bash scripts/restore-db.sh /var/backups/inveon-events/events-<stamp>.dump
#
# Env: DATABASE_URL / APP_DIR / PG_SERVICE as in lib-db.sh.
#      STRICT=1 fails the drill on any row-count difference (CI, where the
#      source can't change during the run).

set -euo pipefail
# shellcheck source=lib-db.sh source-path=SCRIPTDIR
source "$(dirname "$0")/lib-db.sh"

DUMP="${1:?Usage: restore-db.sh <dump file>}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }

if [ -f "$DUMP.sha256" ]; then
  log "Verifying checksum"
  (cd "$(dirname "$DUMP")" && sha256sum --check --quiet "$(basename "$DUMP").sha256")
fi

SOURCE_DB="$(source_db_name)"
DRILL=1
if [ -n "${TARGET_DB:-}" ]; then
  DRILL=0
  if [ "${CONFIRM:-}" != "overwrite-$TARGET_DB" ]; then
    echo "Refusing to overwrite $TARGET_DB without CONFIRM=overwrite-$TARGET_DB" >&2
    exit 1
  fi
else
  TARGET_DB="${SOURCE_DB}_restore_check"
fi

# Maintenance commands run against the "postgres" database.
admin() { PGDATABASE_TARGET=postgres pg_exec psql -v ON_ERROR_STOP=1 -qAt "$@"; }

log "Restoring $(basename "$DUMP") into $TARGET_DB"
if [ "$DRILL" = "1" ]; then
  admin -c "DROP DATABASE IF EXISTS \"$TARGET_DB\""
  admin -c "CREATE DATABASE \"$TARGET_DB\""
  trap 'admin -c "DROP DATABASE IF EXISTS \"$TARGET_DB\"" || true' EXIT
fi

start=$(date +%s)
# --clean --if-exists makes a real restore replace existing objects;
# harmless on the empty drill database.
PGDATABASE_TARGET="$TARGET_DB" pg_exec pg_restore --no-owner --no-acl --clean --if-exists --exit-on-error < "$DUMP"
log "Restored in $(( $(date +%s) - start ))s"

# --- checks -------------------------------------------------------------
q() { PGDATABASE_TARGET="$1" pg_exec psql -v ON_ERROR_STOP=1 -qAt -c "$2"; }

last_migration="$(q "$TARGET_DB" 'SELECT name FROM "SequelizeMeta" ORDER BY name DESC LIMIT 1')"
log "Schema at migration: $last_migration"

TABLES="organizers users events ticket_categories bookings tickets payments"
mismatches=0
printf '%-20s %12s %12s\n' table restored live
for t in $TABLES; do
  restored="$(q "$TARGET_DB" "SELECT count(*) FROM $t")"
  if [ "$DRILL" = "1" ]; then
    live="$(q "$SOURCE_DB" "SELECT count(*) FROM $t")"
    [ "$restored" = "$live" ] || mismatches=$((mismatches + 1))
  else
    live="-"
  fi
  printf '%-20s %12s %12s\n' "$t" "$restored" "$live"
done

if [ "$DRILL" = "1" ] && [ "$mismatches" -gt 0 ]; then
  if [ "${STRICT:-0}" = "1" ]; then
    log "ERROR: $mismatches table(s) differ from the live database"
    exit 1
  fi
  log "NOTE: $mismatches table(s) differ — expected if bookings happened since the backup was taken."
fi

if [ "$DRILL" = "1" ]; then
  log "Drill passed: backup restores cleanly. Scratch database $TARGET_DB will be dropped."
else
  log "Restore complete. Start the API again: docker compose up -d events-api"
fi
