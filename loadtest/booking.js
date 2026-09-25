// #65 — booking load: many customers opening the event page and booking
// at once, well past the tier's quota. Proves throughput and that the
// quota is never oversold (every booking is a 201 or a clean 409).
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE_URL, seed, login, authHeaders } from './lib.js';

const created = new Counter('bookings_created');
const soldOut = new Counter('bookings_sold_out');
const unexpected = new Rate('booking_unexpected_response');

const RATE = Number(__ENV.RATE || 30); // booking attempts per second at peak

export const options = {
  scenarios: {
    booking_rush: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [
        { target: RATE, duration: __ENV.RAMP || '20s' },
        { target: RATE, duration: __ENV.HOLD || '40s' },
        { target: 0, duration: '5s' },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:create booking}': ['p(95)<800', 'p(99)<1500'],
    'http_req_duration{name:event page}': ['p(95)<300'],
    booking_unexpected_response: ['rate<0.01'],
    [`bookings_created`]: [`count<=${seed.bookingQuota}`], // never oversold
    checks: ['rate>0.99'],
  },
};

export default function () {
  const n = exec.scenario.iterationInTest;
  const page = http.get(`${BASE_URL}/api/events/${seed.bookingEventId}`, { tags: { name: 'event page' } });
  check(page, { 'event page 200': (r) => r.status === 200 });

  const res = http.post(
    `${BASE_URL}/api/events/${seed.bookingEventId}/bookings`,
    JSON.stringify({
      ticketCategoryId: seed.bookingTierId,
      quantity: 1,
      primaryContactName: `Load Customer ${n}`,
      primaryContactWhatsapp: '+919000000000',
      primaryContactEmail: `load-customer-${n}-${exec.vu.idInTest}@example.com`,
      paymentMethod: 'cash',
    }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'create booking' } },
  );
  if (res.status === 201) created.add(1);
  else if (res.status === 409) soldOut.add(1);
  unexpected.add(res.status !== 201 && res.status !== 409);
  check(res, { 'booked or sold out': (r) => r.status === 201 || r.status === 409 });
}

// Cross-check against the database: the tickets held by active bookings
// can never exceed the quota.
export function teardown() {
  const token = login();
  const res = http.get(`${BASE_URL}/api/organizer/reports/sales?eventId=${seed.bookingEventId}`, authHeaders(token));
  const held = res.json('rows').filter((r) => r.bookingStatus !== 'cancelled').reduce((sum, r) => sum + r.tickets, 0);
  console.log(`Tickets held after the rush: ${held} of quota ${seed.bookingQuota}`);
  check(held, { 'no oversell in the database': (h) => h <= seed.bookingQuota });
}
