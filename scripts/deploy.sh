#!/usr/bin/env bash
# Deploys a new image tag to the VPS, health-checks it, and rolls back
# automatically if the health check fails.
#
# Usage: bash scripts/deploy.sh <image_tag>
# Run from the project root on the VPS (expects docker-compose.yml there).

set -euo pipefail

APP_DIR="/opt/inveon-events"
LAST_GOOD_FILE="$APP_DIR/.last_good_tag"
HEALTH_URL="http://localhost:3000/health"
MAX_ATTEMPTS=10
SLEEP_SECONDS=3

NEW_TAG="${1:?Usage: deploy.sh <image_tag>}"

cd "$APP_DIR"

deploy_tag() {
  local tag="$1"
  echo "IMAGE_TAG=${tag}" > .env.deploy
  docker compose --env-file .env.deploy pull api web
  docker compose --env-file .env.deploy up -d --no-deps api web
}

health_check() {
  for i in $(seq 1 "$MAX_ATTEMPTS"); do
    if curl -sf "$HEALTH_URL" > /dev/null; then
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
