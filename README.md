# Inveon Events

**Plan. Book. Celebrate.**

Inveon Events is a web-based event management and online ticket booking platform. It lets organizers publish events, sell tickets online or via cash, deliver digital QR tickets over WhatsApp and Email, manage fast gate check-in, and automatically follow up with attendees after the event with photos and certificates.

Built and maintained by [Inveon Technologies](https://inveontechnologies.in).

Repository: `https://github.com/Inveon-Technologies/Events.git`

---

## Features

What exists today (see the roadmap for what's planned):

- **Organizer portal** — signup with email verification, event creation/editing/duplication/cancellation, ticket tiers with quotas, event media (images + a short video), bank/payout verification via Cashfree, bookings and cancellations with refunds, gate check-in, dashboard.
- **Public event site** — organizer and event listings, event details with live ticket availability, reviews and ratings.
- **Booking & payments** — online payment through Cashfree (with split settlement to the organizer), free tickets, and cash bookings (held as pending for the organizer). Ticket quota is reserved atomically, so events never oversell; unpaid online bookings release their tickets automatically after the payment window.
- **Digital tickets** — QR-coded tickets, delivered by email with a PDF invoice. Customers can log in with an emailed code to see all their bookings, view QR passes, and cancel within the organizer's refund policy.
- **Gate check-in** — camera-based QR scanner; each ticket can be admitted exactly once, even when scanned at two gates at the same moment.
- **Reminders** — an email to every booking 3 hours before the event.

Not built yet: WhatsApp delivery, organizer approval of cash payments, post-event galleries and certificates.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Tailwind CSS |
| Backend | Node.js 22, Express, TypeScript, Sequelize |
| Database | PostgreSQL 15 (migrations via Umzug) |
| Cache | Redis 7 (sign-in codes, rate limiting) |
| Background jobs | In-process timers in the API (event reminders, expiring unpaid bookings) — safe with multiple API processes |
| Reverse proxy | Nginx |
| Object storage | AWS S3 (falls back to local disk when unconfigured) |
| Containers | Docker, Docker Compose |
| CI/CD | GitHub Actions → GHCR → SSH deploy with health-check rollback |
| Payments | Cashfree (Payment Gateway + Easy Split) |
| Email | SMTP via nodemailer (Gmail app password) |

---

## Project structure

```
Events/
├── apps/
│   ├── web/              # React frontend (organizer portal + public event site)
│   └── api/               # Express backend
├── docker/
│   ├── nginx/             # Nginx config, SSL
│   └── docker-compose.yml
├── docs/                  # Business process guide, architecture, roadmap, task list
├── .github/workflows/     # CI/CD pipelines
├── LICENSE
└── README.md
```

---

## Getting started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+ and Redis 7+ (or run both via Docker Compose)

### Setup

```bash
git clone https://github.com/Inveon-Technologies/Events.git
cd Events

# copy and fill in environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# start Postgres, Redis, and the API in containers
docker-compose -f docker/docker-compose.yml up -d

# run database migrations
cd apps/api && npm install && npm run migrate

# start the frontend dev server
cd ../web && npm install && npm run dev
```

### Environment variables

`apps/api/.env.example` lists every variable the API reads, with an explanation of each (database, Redis, JWT secret, Cashfree, SMTP, S3, public URLs, proxy hops). `apps/web/.env.example` covers the frontend.

### Tests

```bash
cd apps/api
npm test                 # unit tests, no database needed
npm run test:integration # needs DATABASE_URL + REDIS_URL (and ffmpeg for media tests)
npm run test:concurrency # oversell-prevention test against a real Postgres

cd ../web
npm test
```

---

## Deployment

The project deploys via Docker Compose behind Nginx on a single VPS. After CI passes on `main`, GitHub Actions builds and pushes images to GHCR, then `scripts/deploy.sh` runs over SSH: it applies database migrations with the new image *before* replacing the running API, starts the new containers, health-checks them, and rolls back to the last good image on failure. Because a rollback keeps the migrated schema, migrations must stay backward-compatible with the previous release.

`docker/docker-compose.yml` is for standalone/local use; production runs the Events services inside a shared compose project on the VPS (see the comments in `scripts/deploy.sh`).

---

## Roadmap

Development follows a phased plan — foundations, MVP booking, cash payments & gate check-in, post-event engagement, hardening for scale, then platform maturity. See `docs/Inveon_Events_Detailed_Roadmap.md` and `docs/Inveon_Events_Task_List.csv` for the full task breakdown.

---

## License

Proprietary — all rights reserved. See [`LICENSE`](./LICENSE). This is not open-source software; no use, copying, or distribution is permitted without written authorization from Inveon Technologies.

---

## Contact

Inveon Technologies — [inveontechnologies.in](https://inveontechnologies.in)
