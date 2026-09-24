# Operations runbook

Everything here is scripted and verified in CI (**Ops checks** workflow).
It covers the server-side steps someone has to run once, and what to do
when something goes wrong.

Production layout, for reference: the VPS runs the Events containers
(`events-api`, `events-web`, `events-postgres`) inside the compose stack of
the **inveontechnologies-website** repo at `/home/ubuntu/inveontechnologies-website`.
This repo is checked out at `/var/www/Events` and `scripts/deploy.sh` is
run from there by the Deploy workflow.

| Topic | Issue | Where |
|---|---|---|
| [Server hardening](#server-hardening) | #7 | `scripts/server/harden.sh` |
| [TLS / HTTPS](#tls) | #9 | `docker/nginx/front-door/`, `scripts/server/setup-ssl.sh` |
| [Staging](#staging) | #42 | `.github/workflows/deploy-staging.yml` |
| [nginx tuning](#nginx) | #68 | `docker/nginx/conf.d/` |
| [Redis persistence](#redis) | #69 | `docker/redis/redis.conf` |
| [Rollback](#rollback) | #70 | `scripts/rollback.sh`, `scripts/tests/deploy-rollback.test.sh` |
| [Security scanning](#security-scanning) | #73 | `.github/workflows/security.yml` |
| [Backups and restore](#backups) | #75 | `scripts/backup-db.sh`, `scripts/restore-db.sh` |
| [Logs](#logs) | #17 | pino JSON logs |
| [Load testing](#load-testing) | #53 #65 #66 | `loadtest/` |

---

## Server hardening

Once per server, as root, after reviewing the script:

```bash
cd /var/www/Events
sudo DRY_RUN=1 bash scripts/server/harden.sh    # see what it will do
sudo bash scripts/server/harden.sh
```

- Opens only 22, 80 and 443 in ufw. **This VPS is shared**: pass any other
  host service that must stay reachable, e.g. `EXTRA_PORTS="5000/tcp"`.
  Docker-published ports bypass ufw, so also keep the AWS security group
  tight (22 from your IPs, 80/443 from anywhere).
- Turns off SSH password and root login **only if** the admin user already
  has `~/.ssh/authorized_keys`. Keep your current SSH session open and test
  a new login before closing it.
- Writes `/etc/docker/daemon.json` (log caps) only if it doesn't exist;
  restart Docker in a quiet window to apply it.

Check afterwards: `ufw status verbose`, `fail2ban-client status sshd`,
`sshd -T | grep -E 'passwordauth|permitroot'`, `swapon --show`.

## TLS

The nginx that owns public 80/443 (the main site's) terminates HTTPS for
`events.inveontechnologies.in` and forwards to this stack on
`127.0.0.1:8081`.

1. Point the DNS A record for `events.inveontechnologies.in` at the VPS.
2. Add **only the port-80 server block** from
   `docker/nginx/front-door/events.inveontechnologies.in.conf` to the front
   door and reload it. It serves the ACME challenge from `/var/www/certbot`.
   If the front door is a container, mount `/var/www/certbot` and
   `/etc/letsencrypt` into it read-only, and read the note at the top of
   the file about `127.0.0.1`.
3. Issue the certificate and install auto-renewal:
   ```bash
   sudo EMAIL=you@inveontechnologies.in \
        RELOAD_CMD="docker exec <front-door-container> nginx -s reload" \
        bash scripts/server/setup-ssl.sh
   ```
4. Add the 443 server block, then `nginx -t` and reload.
5. Check: `curl -I https://events.inveontechnologies.in/api/health` returns
   200 with a `strict-transport-security` header, and
   `https://www.ssllabs.com/ssltest/` gives an A.

The API trusts `X-Forwarded-Proto` from the two proxy hops
(`TRUST_PROXY_HOPS=2`), so payment return URLs come out as `https://`.

## Staging

A second, smaller server that runs **this repo's own**
`docker/docker-compose.yml`.

1. Provision it: Ubuntu 24.04, Docker, then [hardening](#server-hardening)
   and [TLS](#tls) (for example with `staging-events.inveontechnologies.in`).
2. `git clone` this repo to `/var/www/Events`, and fill in
   `docker/.env` (`POSTGRES_USER`, `POSTGRES_PASSWORD`) and `apps/api/.env`
   (start from `.env.example`; `DATABASE_URL` host is `postgres`,
   `REDIS_URL=redis://redis:6379`). Use Cashfree **sandbox** keys and a
   test SMTP inbox.
3. `docker login ghcr.io` with a token that can read the org's packages.
4. In GitHub: Settings → Environments → **staging**, with secrets
   `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`.
5. Actions → **Deploy to staging** → Run workflow (any branch), or push to
   the `staging` branch.

Staging uses the same `deploy.sh`: migrations first, health check,
automatic rollback. Images are tagged `staging-<sha>`, so they can never
overwrite a production tag.

## nginx

`docker/nginx/conf.d/00-performance.conf` and `default.conf`:

- gzip for JSON/JS/CSS/SVG, about 70–85% smaller;
- `client_max_body_size 12m`. The old 1MB default rejected every real
  photo upload with a 413. **The front door needs the same**; the template
  sets it;
- keep-alive connections to the API, 120s read timeout for uploads;
- `index.html` is `no-cache` and hashed assets are cached for a year, so
  browsers pick up a new release right after a deploy;
- security headers (nosniff, frame, referrer, permissions policy);
- a single `X-Request-Id` follows each request through every hop into the
  API logs.

The production stack's nginx lives in the other repo. Copy these two
files into its Events nginx config, or at least the `client_max_body_size`
and gzip lines.

## Redis

`docker/redis/redis.conf`: AOF persistence (`appendfsync everysec`) plus
RDB snapshots, `maxmemory 256mb`, and **`maxmemory-policy noeviction`**,
which BullMQ requires: an evicted key would silently drop an email job.

For the production compose (other repo), give the Redis service:

```yaml
    command: redis-server /usr/local/etc/redis/redis.conf
    volumes:
      - events_redis_data:/data
      - /var/www/Events/docker/redis/redis.conf:/usr/local/etc/redis/redis.conf:ro
```

Check: `docker compose exec <redis> redis-cli config get maxmemory-policy` returns `noeviction`.

## Rollback

**Automatic:** `deploy.sh` health-checks every release and puts the previous
image back if the check fails. A failed migration never replaces the
running release in the first place.

**Manual** (a release is healthy but wrong):

```bash
cd /var/www/Events
bash scripts/rollback.sh            # to the release before the current one
bash scripts/rollback.sh 1a2b3c4d   # or to a specific tag
```

This skips migrations, because they are written to stay compatible with
the previous release (add now, drop later), and runs the same health check.
To go forward again, re-run the Deploy workflow.

**Drill:** `bash scripts/tests/deploy-rollback.test.sh` runs the real
scripts against a fake docker: bad release, failed migration, manual
rollback. It runs in CI on every change to `scripts/`. Once per quarter,
also do it for real on staging: deploy a build whose `/health` fails and
watch it roll back, then run `rollback.sh`.

The deploy history (`~/.events_deploy_history`) starts with the first
deploy after this change. Until then, pass the tag to `rollback.sh`.

## Security scanning

The **Security scan** workflow runs on every PR, on main, and every Monday:

- `npm audit`, failing on high or critical;
- Trivy on both built images and on the Dockerfiles/compose files;
- a scan for committed secrets.

Accepted findings are listed with their reason in `.trivyignore`.

Trivy is pinned **by commit SHA** (action v0.35.0, binary v0.69.3). In
March 2026 almost every `trivy-action` tag was hijacked to steal CI secrets
(CVE-2026-33634). Never change it back to a tag.

Known open moderate findings (September 2026), which need major-version
upgrades: `react-router` open redirect via a backslash in `<Link>` (fixed in
7.18), and `uuid` (via Sequelize) buffer bounds. Neither is reachable
with how the app uses them today; plan the React Router 7 upgrade.

## Backups

Nightly, on the VPS (`crontab -e` as the deploy user):

```cron
15 2 * * * cd /var/www/Events && BACKUP_S3_URI=s3://<bucket>/events bash scripts/backup-db.sh >> /var/log/events-backup.log 2>&1
```

- A compressed `pg_dump` goes to `/var/backups/inveon-events` (created
  mode 700). It is checked readable, checksummed, kept 14 days
  (`KEEP_DAYS`), and copied to S3 when `BACKUP_S3_URI` is set. Give the
  bucket a lifecycle rule (for example 90 days) and an IAM role that can
  only `PutObject`.
- Redis holds only the job queue, OTPs and rate limits. It persists to
  its own volume (AOF) and isn't backed up separately.
- Uploaded images: on S3 when `S3_BUCKET` is set; otherwise in the API's
  uploads volume. Back that volume up too, or move uploads to S3.

**Monthly restore drill** (touches nothing live):

```bash
bash scripts/restore-db.sh /var/backups/inveon-events/events-<latest>.dump
```

It restores into a scratch `<db>_restore_check` database, prints the
migration level and row counts next to the live ones, then drops it. CI
runs the same drill with `STRICT=1` against a seeded database.

**Disaster recovery:**

```bash
docker compose stop events-api
TARGET_DB=inveon_events CONFIRM=overwrite-inveon_events \
  bash scripts/restore-db.sh /var/backups/inveon-events/events-<stamp>.dump
docker compose up -d events-api
```

## Logs

The API writes one JSON line per request and event (pino). Each line
carries a `reqId` (also returned as `X-Request-Id`), and secrets are
redacted. Docker keeps up to 5 × 10MB per container.

```bash
docker compose logs events-api --since 1h | grep '"level":50'                # errors
docker compose logs events-api | grep '"reqId":"<id from a user report>"'
```

Set `LOG_LEVEL=debug` in `apps/api/.env` temporarily for more detail.

## Load testing

See `loadtest/README.md`: k6 scripts for booking, steady check-in and gate
rush, with baseline numbers. Run them against **staging** with
`RATE_LIMITS_DISABLED=true` set there for the duration, and never in
production.

## Background jobs

Emails and scheduled work go through BullMQ on Redis
(`QUEUE_ENABLED`, `QUEUE_CONCURRENCY`). Failed emails retry 5 times with
backoff and are kept for 7 days. To inspect them:

```bash
docker compose exec <redis> redis-cli LLEN bull:notifications:wait
docker compose exec <redis> redis-cli ZCARD bull:notifications:failed
```

If Redis is down, jobs run inline in the request process, so nothing is
dropped, only slower.
