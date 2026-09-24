#!/usr/bin/env bash
# Manual rollback (#70): puts a previous image back into service.
#
#   bash scripts/rollback.sh            # the release before the current one
#   bash scripts/rollback.sh 1a2b3c4d   # a specific image tag
#
# Uses scripts/deploy.sh with migrations skipped, so it gets the same
# health check and automatic fall-back. The database schema stays as it
# is: migrations are written to be backward-compatible with the previous
# release (add first, drop later), which is what makes this safe.
#
# To roll FORWARD again, re-run the Deploy workflow, or:
#   bash scripts/deploy.sh <tag>

set -euo pipefail

LAST_GOOD_FILE="${LAST_GOOD_FILE:-$HOME/.events_last_good_tag}"
HISTORY_FILE="${HISTORY_FILE:-$HOME/.events_deploy_history}"

current="$(cat "$LAST_GOOD_FILE" 2>/dev/null || true)"
target="${1:-}"

if [ -z "$target" ]; then
  if [ ! -s "$HISTORY_FILE" ]; then
    echo "No deploy history in $HISTORY_FILE — pass the tag to roll back to." >&2
    exit 1
  fi
  # Most recent healthy tag that isn't the one running now.
  target="$(grep -vxF "${current:-__none__}" "$HISTORY_FILE" | tail -n 1 || true)"
  if [ -z "$target" ]; then
    echo "No earlier release than $current in $HISTORY_FILE." >&2
    exit 1
  fi
fi

if [ "$target" = "$current" ]; then
  echo "$target is already the running release." >&2
  exit 1
fi

echo "== Rolling back: ${current:-unknown} -> $target =="
SKIP_MIGRATIONS=1 exec bash "$(dirname "$0")/deploy.sh" "$target"
