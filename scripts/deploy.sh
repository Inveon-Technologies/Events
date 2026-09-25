#!/usr/bin/env bash
# Deploys a new image tag to the VPS, health-checks it, and rolls back
# automatically if the health check fails.
#
# Usage: bash scripts/deploy.sh <image_tag>
# Invoked from this repo's own checkout (deploy.yml's `cd /var/www/Events`),
# but the actual docker compose stack this operates on lives in a SEPARATE
# repo/checkout: inveontechnologies-website, at APP_DIR below. That other
# repo's docker-compose.yml runs events-api/events-postgres/events-web
# alongside the company's main site, portal, and CRM on the same shared
# VPS — see its own docker-compose.yml comments for why (Events' own
# docker/docker-compose.yml, in *this* repo, binds its own nginx to
# 80/443, which collides with the site that already owns those ports on
# this box; that file is for standalone/local use only, not this server).
#
# This script deliberately touches ONLY events-api and events-web —
# never events-postgres (never recreate the database on a deploy), and
# never the other apps' containers (web/portal-frontend/portal-backend/
# crm_*) sharing this same compose file and VPS.

set -euo pipefail

# Overridable so the rollback drill (scripts/tests/deploy-rollback.test.sh)
# can run this exact script against a stubbed docker, and so a staging
# server can use its own directory.
APP_DIR="${APP_DIR:-/home/ubuntu/inveontechnologies-website}"
# Deliberately outside any git-managed checkout — this is deploy-state
# bookkeeping, not part of either repo.
LAST_GOOD_FILE="${LAST_GOOD_FILE:-$HOME/.events_last_good_tag}"
# Every tag that deployed healthy, oldest first — scripts/rollback.sh
# picks from it.
HISTORY_FILE="${HISTORY_FILE:-$HOME/.events_deploy_history}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-10}"
SLEEP_SECONDS="${SLEEP_SECONDS:-3}"
# Set by scripts/rollback.sh: going back to an older image never runs
# migrations (the schema stays migrated — see run_migrations).
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
# Compose service names and the image-tag variable. Defaults match the
# production stack; a staging server running this repo's own
# docker/docker-compose.yml uses API_SERVICE=api WEB_SERVICE=web
# TAG_VAR=IMAGE_TAG NGINX_SERVICE=nginx (see docs/ops/RUNBOOK.md).
API_SERVICE="${API_SERVICE:-events-api}"
WEB_SERVICE="${WEB_SERVICE:-events-web}"
TAG_VAR="${TAG_VAR:-EVENTS_IMAGE_TAG}"
# If set, that nginx service is reloaded after a swap so it re-resolves
# the new API container's address.
NGINX_SERVICE="${NGINX_SERVICE:-}"

NEW_TAG="${1:?Usage: deploy.sh <image_tag>}"

cd "$APP_DIR"

write_tag() {
  echo "${TAG_VAR}=${1}" > .env.deploy
}

# --env-file REPLACES the directory's default .env auto-load rather than
# adding to it — without also passing .env explicitly here, every other
# var that file provides (EVENTS_POSTGRES_PASSWORD, PORTAL_POSTGRES_PASSWORD,
# etc.) disappears, and Compose fails just interpolating the file, since
# that happens for every service up front regardless of which ones
# pull/up actually targets. Passing both merges them, .env.deploy's
# EVENTS_IMAGE_TAG taking precedence for that one key.
compose() {
  docker compose --env-file .env --env-file .env.deploy "$@"
}

deploy_tag() {
  write_tag "$1"
  compose pull "$API_SERVICE" "$WEB_SERVICE"
  swap
}

swap() {
  compose up -d --no-deps "$API_SERVICE" "$WEB_SERVICE"
  if [ -n "$NGINX_SERVICE" ]; then
    compose exec -T "$NGINX_SERVICE" nginx -s reload || true
  fi
}

run_migrations() {
  # Runs in a throwaway container of the NEW image, BEFORE the running
  # API is replaced — so new code never serves traffic against the old
  # schema, and a failed migration leaves the currently running version
  # untouched (nothing to roll back). Against the compiled output
  # (node dist/db/migrate.js), since the production image has no tsx or
  # TS source. Umzug's `up` only applies pending migrations, so this is
  # a no-op on a deploy with nothing new. --no-deps: the database is
  # already running and must never be recreated by a deploy.
  #
  # Because the old version keeps running on the migrated schema until
  # the swap (and a rollback returns to it), migrations must stay
  # backward-compatible with the previous release: add columns/tables
  # first, drop or rename only in a later release.
  compose run --rm --no-deps -T "$API_SERVICE" node dist/db/migrate.js up
}

health_check() {
  # Inside the events-api container itself, not through the public
  # domain — this is a "did the container we just started come up
  # healthy" gate, not an end-to-end external check, so it shouldn't
  # depend on DNS/TLS/the shared nginx's routing being correct too.
  # events-api's own Dockerfile installs curl specifically for this.
  for i in $(seq 1 "$MAX_ATTEMPTS"); do
    if docker compose exec -T "$API_SERVICE" curl -sf http://localhost:3000/health > /dev/null; then
      return 0
    fi
    echo "Health check attempt $i/$MAX_ATTEMPTS failed, retrying in ${SLEEP_SECONDS}s..."
    sleep "$SLEEP_SECONDS"
  done
  return 1
}

echo "== Deploying image tag: $NEW_TAG =="

PREVIOUS_TAG=""
if [ -f "$LAST_GOOD_FILE" ]; then
  PREVIOUS_TAG="$(cat "$LAST_GOOD_FILE")"
fi

write_tag "$NEW_TAG"
compose pull "$API_SERVICE" "$WEB_SERVICE"

if [ "$SKIP_MIGRATIONS" = "1" ]; then
  echo "== Skipping migrations (rollback) =="
elif ! run_migrations; then
  echo "== Migrations failed. The running version was never replaced. =="
  # Put .env.deploy back so a later manual `docker compose up` doesn't
  # pick up the tag that failed.
  if [ -n "$PREVIOUS_TAG" ]; then
    write_tag "$PREVIOUS_TAG"
  fi
  exit 1
fi

swap

if health_check; then
  echo "$NEW_TAG" > "$LAST_GOOD_FILE"
  echo "$NEW_TAG" >> "$HISTORY_FILE"
  echo "== Deploy succeeded, migrations applied, health check passed. =="
  exit 0
fi

echo "== Health check failed. Rolling back. =="

if [ -n "$PREVIOUS_TAG" ]; then
  echo "Rolling back to last known good tag: $PREVIOUS_TAG (schema stays migrated — see run_migrations)"
  deploy_tag "$PREVIOUS_TAG"

  if health_check; then
    echo "== Rollback succeeded. Currently running: $PREVIOUS_TAG =="
    exit 1  # still exit non-zero so the CI job is marked failed and gets investigated
  else
    echo "== Rollback ALSO failed health check. Manual intervention required. =="
    exit 1
  fi
else
  echo "No previous good tag recorded on this server — cannot roll back automatically."
  echo "Manual intervention required."
  exit 1
fi
