# Super admin portal (Inveon Control Center)

Inveon staff use it to run the whole platform. It lives on the same domain
as the site, behind a secret address:

```
https://events.inveontechnologies.in/x/<SUPERADMIN_PATH>
```

Any other value after `/x/` shows the normal "page not found". The API answers
a wrong path with the same 404 as a route that doesn't exist, so the portal
can't be found by probing.

## What it does

| Area | What you can do |
|---|---|
| Dashboard | Gross sales, platform earnings, bookings today/7/30 days, a 30-day chart, top events, latest bookings, message delivery health |
| Organizers | Search every organizer; open one to see details, KYC/payout status, team and events. **Block** an organizer, which signs their whole team out within 15 s, stops logins and hides their events. You can also block a single team member. |
| Customers | Everyone who booked, grouped by email, with bookings and spend. **Block** an email: it can't book or sign in to Manage Booking. |
| Events / Bookings / Payments | Everything across all organizers. Close or reopen an event's sales. For each booking, see its payment status, refunds, and how the confirmation email and WhatsApp went. On Payments, **Check with Cashfree** shows what Cashfree itself says about the order and each payment attempt. |
| Emails, WhatsApp & login codes | Every message sent and every one-time code, with its status: sent, failed and why, issued, used, wrong, expired, too many tries. **Codes are never stored or shown.** Delete old records. |
| Job queue | Waiting, active and failed background jobs; retry one or all, clear failed or completed |
| Config check | A live test of every setting, re-run every minute. It logs in to Gmail SMTP, Cashfree and S3, pings Postgres and Redis, and checks that migrations are applied, the Cashfree mode matches the keys, the webhook URL, JWT/encryption keys, backups made in the last 7 days and the server helper. Each problem comes with how to fix it. |
| System health | API uptime and memory, server load, Postgres and Redis health, table sizes, migrations, which integrations are on |
| Monitoring charts | Server CPU, memory and disk, and each container's CPU and memory, as line charts for the last 1, 6 or 24 hours (one sample a minute) |
| Server, Docker & logs | Every container's CPU, memory, network, disk and log size, refreshed every 15 s. Disk and memory on the server. Read any container's log, or tick **Live** to follow it. Actions: clear logs, delete unused images or build cache, shrink the journal, restart a container, full server backup. |
| Console | **SQL console** on the Events database. Read mode runs in a read-only transaction that is always rolled back; write mode saves changes. One statement at a time, 15 s limit, 500 rows shown. **Run a command in a container** (`sh -c`, 60 s limit). This is off unless the server helper is installed with `ALLOW_EXEC=1`. |
| Danger zone | **Clear all logs**: email/WhatsApp/OTP logs, finished and failed jobs, and every container's log file. **Reset all data**: every organizer, event, booking, payment, ticket and customer record. A backup `.zip` is made first. Admins, portal settings, the audit log and uploaded files are kept. |
| Backups | Make a `.zip` with the whole database (pg_dump), files stored on the server and the portal settings, then download or delete it |
| Branding & logo | Platform name, logo, support email and phone, brand colour. Used by the website header, organizer portal, checkout, tickets, every email and every invoice. |
| Invoice | Company name, address and GSTIN, the "Platform" line, an extra terms note, accent colour |
| Certificate footer | The fixed labels and names at the bottom of every certificate, or a logo in their place |
| Integrations | Gmail SMTP, Cashfree and WhatsApp (AiSensy or Meta) keys, saved **encrypted** and used instead of `.env` with no restart needed. Includes a test email button. |
| Admins & password | Add or switch off admins, unlock a locked admin, change your password |
| Audit log | Every sign-in attempt and every change, with who made it, when and from which IP |

## Security

- **Separate accounts.** Portal admins are not organizer users. Each has its own table and its own token key, so an organizer token is never accepted.
- **Strong passwords.** At least 14 characters, with upper-case, lower-case, a number and a symbol. No common words (password, admin, inveon, 123456) and not the admin's email name.
- **Two steps to sign in.** First the password, then a 6-digit code emailed to the admin. The code is valid for 10 minutes, can be used once, and allows 5 tries.
- **Lockout.** 5 wrong passwords lock the account for 15 minutes.
- **Sessions.** They last 4 hours, are stored per browser tab (`sessionStorage`), and end at once when the password changes or the admin is switched off.
- **Optional IP allowlist** (`SUPERADMIN_ALLOWED_IPS`). Other IPs get a 404.
- **Rate limits.** 10 sign-in attempts per 15 minutes per IP, and 300 requests per minute overall.
- **Not indexed.** The portal sends `noindex` and `no-store` headers, and its code is a separate bundle loaded only at `/x/...`.
- **Integration secrets** are encrypted with AES-256-GCM (`SETTINGS_ENCRYPTION_KEY`). The portal only ever shows the last 4 characters, and the audit log records which keys changed, never their values.
- **Re-check before dangerous tools.** The Console and Danger zone ask for the password and a new emailed code again. This unlocks them for 10 minutes. Every SQL statement and container command is saved in the audit log in full.
- **No Docker access for the API.** Docker actions go through a helper on the server, which runs a fixed list of actions and re-checks every container name.

## Setup (once)

### 1. Settings in `apps/api/.env` on the server

```bash
cd /home/ubuntu/inveontechnologies-website
docker compose exec events-api node dist/scripts/superAdmin.js new-path
# → SUPERADMIN_PATH=Xy3…   (copy this line)
openssl rand -hex 32
# → use as SETTINGS_ENCRYPTION_KEY
nano /var/www/Events/apps/api/.env
```

Add:

```
SUPERADMIN_PATH=<the value from new-path>
SETTINGS_ENCRYPTION_KEY=<the openssl value>
# optional: SUPERADMIN_ALLOWED_IPS=<your office IP>,<your home IP>
```

Set `SETTINGS_ENCRYPTION_KEY` **once and never change it**. Changing it makes keys already saved in the portal unreadable, and you would have to enter them again.

Email must work (`SMTP_USER` / `SMTP_PASS`), because the sign-in code is emailed.

### 2. Volumes on `events-api` (compose file in `/home/ubuntu/inveontechnologies-website`)

```yaml
  events-api:
    volumes:
      - events-uploads:/app/uploads
      - events-backups:/app/backups
      - /var/lib/inveon-ops:/app/ops
volumes:
  events-backups:
```

Then recreate the container, run the migration and check it:

```bash
docker compose up -d events-api
docker exec events_api node dist/db/migrate.js up
```

### 3. Create the first admin

```bash
docker compose exec events-api node dist/scripts/superAdmin.js create --email you@inveontechnologies.in --name "Your Name"
```

This prints a strong random password **once**; save it in a password manager. To choose your own, pass it as `-e SUPERADMIN_PASSWORD='…'`. It must pass the same rules. Later admins can be added from the portal.

Other commands:

```bash
docker compose exec events-api node dist/scripts/superAdmin.js reset-password --email you@…
docker compose exec events-api node dist/scripts/superAdmin.js unlock --email you@…
```

### 4. Install the server helper (Docker status, logs, actions, full backups)

```bash
sudo bash /var/www/Events/scripts/server/install-admin-agent.sh
```

This creates `/var/lib/inveon-ops`, readable only by root and the API container's user. It also adds a root cron job (`/etc/cron.d/inveon-admin-agent`) that runs every minute. The helper's own log is `/var/log/inveon-admin-agent.log`.

By default, full server backups contain:
- a `pg_dumpall` of every running Postgres container
- `/home/ubuntu/inveontechnologies-website`
- `/var/www/Events/apps/api/.env`
- `/var/www/crm`
- named Docker volumes, except database, cache and AI-model volumes

To change what's included, set `BACKUP_PATHS` or `VOLUME_EXCLUDE` when running the installer. The newest 3 are kept in `/var/lib/inveon-ops/backups`.

⚠️ Full server backups include `.env` files (passwords and keys). Download them only to encrypted storage.

To let admins run commands inside containers from the Console, install with:

```bash
sudo ALLOW_EXEC=1 bash /var/www/Events/scripts/server/install-admin-agent.sh
```

This gives anyone with an admin password and access to that admin's email root-level power over the containers. Leave it off unless you need it. Re-run without `ALLOW_EXEC=1` to switch it off again.

The helper now refreshes the status and logs every 15 seconds. It also keeps one chart sample a minute for 24 hours in `metrics.jsonl`.

### 5. Open the portal

Go to `https://events.inveontechnologies.in/x/<SUPERADMIN_PATH>`, sign in with the password, then the emailed code. Bookmark the address; it is the only way in.

## Changing the secret address

Run `superAdmin.js new-path`, update `SUPERADMIN_PATH` in `.env`, then `docker compose up -d events-api`. The old address becomes a 404 straight away.
