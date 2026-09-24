# shellcheck shell=bash
# Shared by backup-db.sh and restore-db.sh — sourced, not run.
#
# Two ways to reach Postgres:
#   - DATABASE_URL set: the local pg_dump/pg_restore/psql talk to it
#     directly (CI, or a server with the client tools installed);
#   - otherwise: run the tools inside the Postgres container of the
#     compose stack in APP_DIR (the production VPS layout — see
#     scripts/deploy.sh), using that container's own POSTGRES_USER.

APP_DIR="${APP_DIR:-/home/ubuntu/inveontechnologies-website}"
PG_SERVICE="${PG_SERVICE:-events-postgres}"

compose() {
  local args=(--env-file .env)
  [ -f .env.deploy ] && args+=(--env-file .env.deploy)
  (cd "$APP_DIR" && docker compose "${args[@]}" "$@")
}

# pg_exec <tool> [args...] — runs a client tool against the given
# database ($PGDATABASE_TARGET, default: the stack's own database).
# stdin/stdout pass through, so dumps can be piped in and out.
pg_exec() {
  local tool="$1"
  shift
  if [ -n "${DATABASE_URL:-}" ]; then
    local url="$DATABASE_URL"
    if [ -n "${PGDATABASE_TARGET:-}" ]; then
      url="${DATABASE_URL%/*}/${PGDATABASE_TARGET}"
    fi
    "$tool" --dbname="$url" "$@"
  else
    # shellcheck disable=SC2016 # expanded inside the container, on purpose
    compose exec -T -e TARGET_DB="${PGDATABASE_TARGET:-}" "$PG_SERVICE" \
      sh -c 'exec "$0" -U "$POSTGRES_USER" --dbname="${TARGET_DB:-$POSTGRES_DB}" "$@"' "$tool" "$@"
  fi
}

# The stack's own database name.
source_db_name() {
  if [ -n "${DATABASE_URL:-}" ]; then
    local db="${DATABASE_URL##*/}"
    echo "${db%%\?*}"
  else
    # shellcheck disable=SC2016
    compose exec -T "$PG_SERVICE" sh -c 'echo "$POSTGRES_DB"'
  fi
}

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
