#!/usr/bin/env bash
# Rollback drill for scripts/deploy.sh and scripts/rollback.sh (#70),
# without a server: runs the real scripts against a fake `docker` that
# records which image tag is "running" and fails on demand.
#
#   bash scripts/tests/deploy-rollback.test.sh
#
# Covers: first deploy, bad release auto-rolled back, failed migration
# never swaps the running release, manual rollback to the previous
# release, rollback by explicit tag, and rollback with nothing to go to.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

export APP_DIR="$WORK/app" LAST_GOOD_FILE="$WORK/last_good" HISTORY_FILE="$WORK/history"
export MAX_ATTEMPTS=2 SLEEP_SECONDS=0
export FAKE_STATE="$WORK/running" FAKE_LOG="$WORK/docker.log"
mkdir -p "$APP_DIR" "$WORK/bin"
touch "$APP_DIR/.env"

# Fake docker: `compose up` "starts" whatever EVENTS_IMAGE_TAG .env.deploy
# names; the health check fails while a tag listed in FAKE_BAD_TAGS is
# running; the migration step fails when FAKE_MIGRATE_FAIL=1.
cat > "$WORK/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
args=" $* "
tag="$(sed -n 's/^EVENTS_IMAGE_TAG=//p' .env.deploy 2>/dev/null || true)"
case "$args" in
  *" run --rm "*"migrate.js up"*) [ "${FAKE_MIGRATE_FAIL:-0}" = "1" ] && exit 1; exit 0 ;;
  *" up -d "*) echo "$tag" > "$FAKE_STATE"; exit 0 ;;
  *" exec "*"curl"*)
    running="$(cat "$FAKE_STATE" 2>/dev/null || true)"
    for bad in ${FAKE_BAD_TAGS:-}; do [ "$running" = "$bad" ] && exit 7; done
    exit 0 ;;
  *) exit 0 ;;
esac
FAKE
chmod +x "$WORK/bin/docker"
export PATH="$WORK/bin:$PATH"

pass=0
fail() { echo "FAIL: $*"; echo "--- docker calls:"; cat "$FAKE_LOG"; exit 1; }
expect() { # description, expected, actual
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "ok - $1"; else fail "$1 (expected '$2', got '$3')"; fi
}
running() { cat "$FAKE_STATE" 2>/dev/null || echo none; }
deploy() { bash "$ROOT/scripts/deploy.sh" "$1" > "$WORK/out.log" 2>&1; }
rollback() { bash "$ROOT/scripts/rollback.sh" "$@" > "$WORK/out.log" 2>&1; }

# 1. First deploy.
deploy aaaa1111 || fail "first deploy should succeed"
expect "first deploy is running" aaaa1111 "$(running)"
expect "first deploy recorded as last good" aaaa1111 "$(cat "$LAST_GOOD_FILE")"

# 2. A release that fails its health check is rolled back automatically.
if FAKE_BAD_TAGS=bbbb2222 deploy bbbb2222; then fail "bad release must exit non-zero"; fi
expect "bad release rolled back to the previous one" aaaa1111 "$(running)"
expect "last good unchanged after a bad release" aaaa1111 "$(cat "$LAST_GOOD_FILE")"
grep -q "Rollback succeeded" "$WORK/out.log" || fail "rollback message missing"

# 3. A failed migration never replaces the running release.
if FAKE_MIGRATE_FAIL=1 deploy cccc3333; then fail "failed migration must exit non-zero"; fi
expect "running release untouched by a failed migration" aaaa1111 "$(running)"
expect ".env.deploy points back at the running release" "EVENTS_IMAGE_TAG=aaaa1111" "$(cat "$APP_DIR/.env.deploy")"

# 4. Good second release.
deploy dddd4444 || fail "second good deploy should succeed"
expect "second release running" dddd4444 "$(running)"

# 5. Manual rollback goes to the release before, without migrating.
: > "$FAKE_LOG"
rollback || fail "manual rollback should succeed"
expect "manual rollback restored the previous release" aaaa1111 "$(running)"
expect "manual rollback recorded as last good" aaaa1111 "$(cat "$LAST_GOOD_FILE")"
if grep -q "migrate.js" "$FAKE_LOG"; then fail "rollback must not run migrations"; fi
pass=$((pass + 1)); echo "ok - rollback ran no migrations"

# 6. Rolling back to an explicit tag (forward again, here).
rollback dddd4444 || fail "rollback to an explicit tag should succeed"
expect "explicit-tag rollback running" dddd4444 "$(running)"

# 7. Refuses to "roll back" to what's already running.
if rollback dddd4444; then fail "rolling back to the running tag must refuse"; fi
pass=$((pass + 1)); echo "ok - refuses to roll back to the running release"

echo "All $pass rollback drill checks passed."
