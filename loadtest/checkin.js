// #53 — check-in load: a steady stream of QR scans at the gate, each
// ticket scanned once. Measures scan latency end to end.
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE_URL, seed, login, authHeaders } from './lib.js';

const failed = new Rate('checkin_failed');
const tokens = seed.checkinTokens;
const RATE = Number(__ENV.RATE || 25); // scans per second
const COUNT = Math.min(tokens.length, Number(__ENV.SCANS || tokens.length));

export const options = {
  scenarios: {
    steady_scans: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: `${Math.max(1, Math.floor(COUNT / RATE))}s`,
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    'http_req_duration{name:scan}': ['p(95)<300', 'p(99)<600'],
    checkin_failed: ['rate<0.001'],
    checks: ['rate>0.999'],
  },
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  // The arrival-rate executor can start one iteration more than
  // rate x duration; every ticket is scanned once, so stop there.
  if (exec.scenario.iterationInTest >= COUNT) return;
  const qrToken = tokens[exec.scenario.iterationInTest];
  const res = http.post(
    `${BASE_URL}/api/organizer/events/${seed.checkinEventId}/checkin`,
    JSON.stringify({ qrToken }),
    { ...authHeaders(data.token), tags: { name: 'scan' } },
  );
  failed.add(res.status !== 200);
  check(res, { 'checked in': (r) => r.status === 200 });
}

export function teardown(data) {
  const res = http.get(`${BASE_URL}/api/organizer/reports/checkins?eventId=${seed.checkinEventId}`, authHeaders(data.token));
  const summary = Object.fromEntries(res.json('summary').map((s) => [s.label, s.value]));
  console.log(`Checked in: ${summary['Checked in']} of ${summary['Confirmed tickets']} (${summary.Turnout})`);
}
