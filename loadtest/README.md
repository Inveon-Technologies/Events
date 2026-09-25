# Load tests

[k6](https://k6.io) scripts for the three moments that matter most:

| Script | Issue | What it proves |
|---|---|---|
| `booking.js` | #65 | Customers open the event page and book, ramping to `RATE` attempts/s, well past the quota. Every attempt is a 201 or a clean 409 "sold out"; the quota is **never oversold** (checked by a k6 counter and again from the database in teardown). |
| `checkin.js` | #53 | A steady stream of QR scans (`RATE`/s), each ticket once. Scan latency p95 < 300 ms, no failures. |
| `gate-rush.js` | #66 | Gates open: `SCANNERS` devices scan every pass as fast as they can while the crowd re-scans random passes. Every ticket is admitted **exactly once**; each re-scan is a 409 `already_checked_in`, never a 5xx. |

## Running

The data comes from a seed script that creates a throwaway organizer,
two events full of confirmed tickets (check-in and gate rush), and an
event with a small quota (booking). **Staging or local only — never
production.**

```bash
# 1. Seed (writes loadtest/seed.json: the organizer login + QR tokens)
cd apps/api
LOADTEST_SEED_CONFIRM=yes DATABASE_URL=... npm run loadtest:seed -- --tickets 4000 --quota 300 --out ../../loadtest/seed.json

# 2. The API under test needs RATE_LIMITS_DISABLED=true: every request
#    comes from one IP, and booking creation is limited to 20 per
#    15 minutes per IP. Set it on staging for the run only.

# 3. Run
cd ../../loadtest
k6 run -e BASE_URL=https://staging.example.com booking.js
k6 run -e BASE_URL=https://staging.example.com checkin.js
k6 run -e BASE_URL=https://staging.example.com gate-rush.js

# 4. Clean up
cd ../apps/api
LOADTEST_SEED_CONFIRM=yes DATABASE_URL=... npm run loadtest:seed -- --cleanup ../../loadtest/seed.json
```

Each run uses up its tickets (and the booking quota), so re-seed before
repeating a run. Knobs: `RATE`, `RAMP`, `HOLD` (booking); `RATE`, `SCANS`
(check-in); `SCANNERS`, `RESCAN_RATE`, `RESCAN_DURATION` (gate rush).

The **Load tests** workflow (Actions → Load tests → Run workflow) does all
of this against a throwaway stack inside the GitHub runner.

## Baseline results

One API process (Node 22, `NODE_ENV=production`), Postgres 16 and
Redis 7 on the same 4-vCPU container, 2026-09-24:

| Test | Load | Result |
|---|---|---|
| Booking rush | ramp to 30 attempts/s, 1,584 attempts at a 300-seat quota | **300 of 300 sold, 0 oversold**, 1,284 clean "sold out" 409s, 0 errors. Create booking p95 **8.5 ms**, event page p95 **6.6 ms** |
| Steady check-in | 50 scans/s, 2,000 tickets | 2,000 of 2,000 admitted, 0 failures, scan p95 **7.9 ms** |
| Gate rush | 50 scanners flat out + 20 re-scans/s, 2,000 tickets | **2,000 admitted exactly once**, 601 re-scans rejected as duplicates, 0 errors, scan p95 **144 ms** |
| Gate rush, saturation | 20 → 100 scanners flat out | ~425 → ~540 scans/s; p95 65 ms → 211 ms |

What this means: one API process handles ~400–500 scans a second before
latency climbs. That is CPU-bound in Node (not the database), so it scales
by running more API processes. A real gate — even 20 volunteers scanning
one pass every 2 seconds each — is ~10 scans/s, about 2% of that.

The gate rush led to two changes in the same PR: the database pool is now
configurable (`DB_POOL_MAX`, default 20 instead of Sequelize's 5), and a
scan fetches its ticket, booking, event and tier in one query instead of
four.
