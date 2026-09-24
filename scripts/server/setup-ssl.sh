#!/usr/bin/env bash
# Issues the Let's Encrypt certificate for the Events subdomain and sets
# up automatic renewal (#9). Run once on the server, as root, after DNS
# for the domain points at it and the HTTP (port 80) part of
# docker/nginx/front-door/events.inveontechnologies.in.conf is live in the
# front-door nginx (it serves the ACME challenge from /var/www/certbot).
#
#   sudo DOMAIN=events.inveontechnologies.in EMAIL=ops@example.com \
#        RELOAD_CMD="docker exec inveontechnologies-web nginx -s reload" \
#        bash scripts/server/setup-ssl.sh
#
# RELOAD_CMD reloads whichever nginx owns 443 (default: host nginx).
# STAGING=1 uses Let's Encrypt's staging CA (for a dry run without
# hitting rate limits).

set -euo pipefail

DOMAIN="${DOMAIN:-events.inveontechnologies.in}"
EMAIL="${EMAIL:?Set EMAIL for Let\'s Encrypt expiry notices}"
WEBROOT="${WEBROOT:-/var/www/certbot}"
RELOAD_CMD="${RELOAD_CMD:-systemctl reload nginx}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  apt-get update
  apt-get install -y certbot
fi

mkdir -p "$WEBROOT"

extra=()
if [ "${STAGING:-0}" = "1" ]; then
  extra+=(--staging)
fi

certbot certonly --webroot -w "$WEBROOT" \
  -d "$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email \
  --non-interactive --keep-until-expiring \
  "${extra[@]}"

# certbot's own systemd timer (or cron) renews twice a day; this hook
# reloads nginx after a successful renewal so the new cert is served.
hook="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
mkdir -p "$(dirname "$hook")"
cat > "$hook" <<HOOK
#!/bin/sh
$RELOAD_CMD
HOOK
chmod +x "$hook"

certbot renew --dry-run
echo "Certificate for $DOMAIN is in /etc/letsencrypt/live/$DOMAIN/."
echo "Now enable the 443 server block from docker/nginx/front-door/ and run: $RELOAD_CMD"
