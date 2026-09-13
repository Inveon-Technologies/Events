# Inveon Events — Detailed Delivery Roadmap

Companion to `Inveon_Events_Technical_Roadmap.md` (architecture) and `Inveon_Events_Task_List.csv` (81 individual tasks, task IDs referenced below).

**Total estimate:** ~17-19 weeks solo, or ~10-12 weeks with 2 developers working in parallel (one on backend/infra, one on frontend), assuming Phase 4/5 items beyond the go-live-critical ones are spread post-launch.

---

## Phase 0 — Foundations
**Duration:** 1.5-2 weeks · **Tasks:** INF-01 to INF-07, BE-01 to BE-06, OPS-01 to OPS-04 (17 tasks)
**Owner split:** Infra/DevOps-heavy — one person can carry this alone if comfortable with Docker + Nginx.

**Goal:** an empty but fully wired system — a request can hit Nginx → Node → Postgres/Redis, over HTTPS, through Cloudflare, deployed by CI/CD, before a single business feature exists.

**Milestone / exit criteria:**
- `curl https://yourdomain.com/health` returns 200 through Cloudflare → Nginx → Node, in production.
- A push to `main` auto-deploys to the VPS with a working rollback.
- Schema migrated, auth issuing JWTs, logs writing structured JSON.

**Risk to watch:** Don't let schema design (BE-01) drag — get organizer/event/ticket_categories/bookings/tickets locked first since almost everything else depends on it; attendee custom-questions and certificates can evolve later.

---

## Phase 1 — MVP booking flow (online payment only)
**Duration:** 3.5-4.5 weeks · **Tasks:** BE-07 to BE-18, FE-01 to FE-09, QA-01, OPS-05 (24 tasks)
**Owner split:** Can genuinely parallelize — frontend builds against a mocked API while backend implements BE-11/12/13 (the booking + payment core).

**Goal:** a customer can find an event, book a ticket, pay online, and receive a QR ticket on WhatsApp/Email. An organizer can create the event and see it happen on a dashboard.

**Milestone / exit criteria:**
- End-to-end booking works on staging with a real Cashfree/Razorpay test-mode payment.
- QA-01 concurrency test proves two simultaneous bookings for the last ticket cannot both succeed.
- Organizer dashboard shows live (cached) counts.

**Risk to watch:** BE-11 (atomic quota reservation) is the highest-risk task in the whole project — budget real review time for it, not just implementation time. Everything about trust in the platform rests on this not having a race condition.

---

## Phase 2 — Cash payments & gate operations
**Duration:** 2-3 weeks · **Tasks:** FE-10 to FE-13, BE-19 to BE-24, QA-02 (11 tasks)

**Goal:** organizers can accept cash at the door and gate volunteers can scan attendees in fast, even at a rush.

**Milestone / exit criteria:**
- A cash booking can be reserved, approved by an organizer, and the ticket delivered.
- The scanner app correctly flags a re-scanned ticket as "already checked in" with the original scan time.
- QA-02 shows check-in endpoint latency stays acceptable under a simulated gate-rush.

**Risk to watch:** test the scanner UI on an actual phone camera in real lighting conditions before go-live — this is the one feature that has zero tolerance for "works on my laptop."

---

## Phase 3 — Post-event & retention
**Duration:** 2-2.5 weeks · **Tasks:** FE-14 to FE-17, BE-25 to BE-30, INF-08 (11 tasks)

**Goal:** the loop closes — cancellations/refunds work, and attendees get photos and certificates automatically the day after the event.

**Milestone / exit criteria:**
- Object storage (INF-08) is live and photo/certificate URLs resolve through the CDN, not the VPS disk.
- A test event can run its full next-day broadcast job and deliver a working photo link + certificate.

**Note:** commercial refund-percentage rules and platform fee policy (flagged in the business document as "to be finalized separately") are inputs BE-25/BE-26 need before this phase can fully ship — chase that decision early in Phase 2 so it isn't a Phase 3 blocker.

---

## Phase 4 — Hardening for scale
**Duration:** 2 weeks, timed right before your first real large event · **Tasks:** QA-03, QA-04, OPS-06 to OPS-11, SEC-01, SEC-02, BE-31 (11 tasks)

**Goal:** prove the 1,000-concurrent-user assumption with real numbers instead of estimates, and close the security gaps that matter before real money and real PII flow through the system.

**Milestone / exit criteria:**
- Load test report showing booking-endpoint p95 latency and error rate at 1,000+ simulated concurrent users.
- Rollback drill (OPS-09) succeeds without manual intervention.
- Security audit (SEC-01) signed off, particularly QR-token randomness and payment webhook verification.

**This phase is not optional before your first big ticketed event** — everything before it is "does the feature work," this phase is "does it survive the day it actually matters."

---

## Phase 5 — Platform maturity (post-launch, ongoing)
**Duration:** ongoing, prioritize by demand · **Tasks:** FE-18 to FE-20, BE-32, BE-33, OPS-12 to OPS-14 (8 tasks)

**Goal:** grow from "one club's ticketing tool" into a multi-organizer platform, and scale infrastructure horizontally once the single-VPS signals from the architecture doc's §5.3 start showing up.

**Sequencing note:** OPS-12 to OPS-14 (managed DB, second app server, read replica) are not calendar-scheduled — they're triggered by the load signals called out in the architecture document (sustained Postgres CPU, PM2 memory pressure, rising p95 latency), not by a target date.

---

## Timeline at a glance

| Phase | Weeks (solo) | Weeks (2 devs) | Go/no-go gate |
|---|---|---|---|
| 0 — Foundations | 1.5-2 | 1 | Health check + CI/CD live |
| 1 — MVP booking | 3.5-4.5 | 2.5 | Real payment + oversell test pass |
| 2 — Cash & gate ops | 2-3 | 1.5-2 | Scanner tested on real device |
| 3 — Post-event | 2-2.5 | 1.5 | Photo/cert loop works end-to-end |
| 4 — Hardening | 2 | 1.5-2 | Load test + security sign-off |
| 5 — Maturity | ongoing | ongoing | Triggered by growth signals |
| **Total to first real event** | **~11-14 weeks** | **~7-9 weeks** | |
