# Production checklist (v2.0.1)

Go through this list once when you go live, and again after any big change.
Most items can be checked from the super admin portal's **Config check**
page: every row there must be green, or yellow only for a reason you
accept.

## Server `.env` (`/var/www/Events/apps/api/.env`)

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET`: at least 32 random characters (`openssl rand -hex 32`). Changing it signs everyone out.
- [ ] `SETTINGS_ENCRYPTION_KEY`: `openssl rand -hex 32`. **Set it once and never change it**, or the keys saved in the portal become unreadable.
- [ ] `SUPERADMIN_PATH`: from `superAdmin.js new-path`. Optionally set `SUPERADMIN_ALLOWED_IPS`.
- [ ] `API_PUBLIC_URL=https://events.inveontechnologies.in`
- [ ] `WEB_PUBLIC_URL=https://events.inveontechnologies.in`
- [ ] `DATABASE_URL` / `REDIS_URL` point at the compose services.
- [ ] `RATE_LIMITS_DISABLED` is **not** set.
- [ ] S3: `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `AWS_REGION` (Config check does a real bucket check).

## Integrations (portal → Settings → Integrations)

- [ ] Email: Gmail SMTP with an **app password**. Click **Send test email**.
- [ ] Cashfree: follow [CASHFREE.md](CASHFREE.md), section 2:
  - domain whitelisted
  - Easy Split enabled
  - live keys saved
  - `CASHFREE_ENV=production`
  - ₹1 test payment done
- [ ] `PLATFORM_FEE_PERCENT` set to the agreed fee.
- [ ] WhatsApp: provider and keys saved, template approved (see [WHATSAPP.md](WHATSAPP.md)).

## Server

- [ ] Server helper installed (`sudo bash /var/www/Events/scripts/server/install-admin-agent.sh`). Config check → "Server helper" is green.
- [ ] Container commands (`ALLOW_EXEC=1`) are only switched on if you really need them.
- [ ] Daily database backup cron from the runbook is running. Config check → "Backups" shows one from the last 7 days.
- [ ] A full server backup `.zip` has been downloaded to encrypted storage at least once.
- [ ] Disk use under 80 % (Monitoring charts / Server page). Docker build cache cleaned.
- [ ] TLS certificate valid and auto-renewing (see RUNBOOK.md → TLS).

## People and access

- [ ] At least two super admins exist, each with their own email.
- [ ] Every admin uses a strong password kept in a password manager.
- [ ] Rotate any secret that was ever pasted into chat, email or a ticket:
  - AWS S3 keys
  - SMTP app password
  - Cashfree secret
  - `JWT_SECRET`
  - database password

## After deploying

- [ ] `curl -fsS https://events.inveontechnologies.in/api/health` returns 200.
- [ ] Config check: no red rows.
- [ ] Book a free ticket end to end: the email and WhatsApp arrive, and the ticket page opens.
- [ ] Book a paid ticket (₹1 in production): the booking is confirmed, and **Check with Cashfree** shows PAID.
- [ ] As an organizer, create an event with photos: the upload progress shows, and the images appear.
