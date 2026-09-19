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

APP_DIR="/home/ubuntu/inveontechnologies-website"
# Deliberately outside any git-managed checkout — this is deploy-state
# bookkeeping, not part of either repo.
LAST_GOOD_FILE="$HOME/.events_last_good_tag"
MAX_ATTEMPTS=10
SLEEP_SECONDS=3

NEW_TAG="${1:?Usage: deploy.sh <image_tag>}"

cd "$APP_DIR"

deploy_tag() {
  local tag="$1"
  echo "EVENTS_IMAGE_TAG=${tag}" > .env.deploy
  # --env-file REPLACES the directory's default .env auto-load rather than
  # adding to it — without also passing .env explicitly here, every other
  # var that file provides (EVENTS_POSTGRES_PASSWORD, PORTAL_POSTGRES_PASSWORD,
  # etc.) disappears, and Compose fails just interpolating the file, since
  # that happens for every service up front regardless of which ones
  # pull/up actually targets. Passing both merges them, .env.deploy's
  # EVENTS_IMAGE_TAG taking precedence for that one key.
  docker compose --env-file .env --env-file .env.deploy pull events-api events-web
  docker compose --env-file .env --env-file .env.deploy up -d --no-deps events-api events-web
}

health_check() {
  # Inside the events-api container itself, not through the public
  # domain — this is a "did the container we just started come up
  # healthy" gate, not an end-to-end external check, so it shouldn't
  # depend on DNS/TLS/the shared nginx's routing being correct too.
  # events-api's own Dockerfile installs curl specifically for this.
  for i in $(seq 1 "$MAX_ATTEMPTS"); do
    if docker compose exec -T events-api curl -sf http://localhost:3000/health > /dev/null; then
      return 0
    fi
    echo "Health check attempt $i/$MAX_ATTEMPTS failed, retrying in ${SLEEP_SECONDS}s..."
    sleep "$SLEEP_SECONDS"
  done
  return 1
}

echo "== Deploying image tag: $NEW_TAG =="
deploy_tag "$NEW_TAG"

if health_check; then
  echo "$NEW_TAG" > "$LAST_GOOD_FILE"
  echo "== Deploy succeeded, health check passed. =="
  exit 0
fi

echo "== Health check failed after $MAX_ATTEMPTS attempts. Rolling back. =="

if [ -f "$LAST_GOOD_FILE" ]; then
  ROLLBACK_TAG="$(cat "$LAST_GOOD_FILE")"
  echo "Rolling back to last known good tag: $ROLLBACK_TAG"
  deploy_tag "$ROLLBACK_TAG"

  if health_check; then
    echo "== Rollback succeeded. Currently running: $ROLLBACK_TAG =="
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
