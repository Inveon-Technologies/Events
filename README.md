# Inveon Events

**Plan. Book. Celebrate.**

Inveon Events is a web-based event management and online ticket booking platform. It lets organizers publish events, sell tickets online or via cash, deliver digital QR tickets over WhatsApp and Email, manage fast gate check-in, and automatically follow up with attendees after the event with photos and certificates.

Built and maintained by [Inveon Technologies](https://inveontechnologies.in).

Repository: `https://github.com/Inveon-Technologies/Events.git`

---

## Features

- **Organizer portal** — event creation, ticket category & quota management, live booking dashboard, cash-payment approval, reports/export.
- **Public event site** — per-organizer branded pages, event listings, event details with live ticket availability.
- **Booking & payments** — online payment (UPI/cards/netbanking via Cashfree/Razorpay) and offline cash payment flows, with atomic ticket-quota reservation to prevent overselling.
- **Digital tickets** — QR-coded tickets delivered instantly over WhatsApp and Email.
- **Gate check-in** — camera-based QR scanner with duplicate-scan protection and a live event-day dashboard.
- **Post-event engagement** — automated next-day photo/video gallery links and PDF participation certificates.

See [`Inveon_Events_Business_Process_Guide`](./docs) for the full functional scope, and [`Inveon_Events_Technical_Roadmap.md`](./docs) for architecture details.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Router, TanStack Query |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Cache / Queue | Redis, BullMQ |
| Reverse proxy | Nginx |
| Process manager | PM2 (cluster mode) |
| Object storage | AWS S3 / Cloudflare R2 |
| CDN | Cloudflare |
| Containers | Docker, Docker Compose |
| CI/CD | GitHub Actions |
| Payments | Cashfree / Razorpay |
| Messaging | WhatsApp Business API, AWS SES / Brevo |

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

### Environment variables (`apps/api/.env`)

```
DATABASE_URL=postgres://user:password@localhost:5432/inveon_events
REDIS_URL=redis://localhost:6379
JWT_SECRET=
PAYMENT_GATEWAY_KEY=
PAYMENT_GATEWAY_SECRET=
WHATSAPP_API_TOKEN=
EMAIL_PROVIDER_API_KEY=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

---

## Deployment

The project deploys via Docker Compose behind Nginx and Cloudflare, targeting a single VPS (4–8GB RAM, 50GB SSD) sized for ~1,000 concurrent users. GitHub Actions builds and pushes the image to GHCR, then deploys over SSH with a health-check gate and automatic rollback on failure.

See `docs/Inveon_Events_Technical_Roadmap.md` for the full infrastructure and scaling notes.

---

## Roadmap

Development follows a phased plan — foundations, MVP booking, cash payments & gate check-in, post-event engagement, hardening for scale, then platform maturity. See `docs/Inveon_Events_Detailed_Roadmap.md` and `docs/Inveon_Events_Task_List.csv` for the full task breakdown.

---

## License

Proprietary — all rights reserved. See [`LICENSE`](./LICENSE). This is not open-source software; no use, copying, or distribution is permitted without written authorization from Inveon Technologies.

---

## Contact

Inveon Technologies — [inveontechnologies.in](https://inveontechnologies.in)
