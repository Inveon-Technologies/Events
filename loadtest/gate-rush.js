// #66 — gate rush: gates open and every scanner fires at once, with
// people re-scanning the same passes (double taps, a friend's phone,
// screenshots). Every ticket must be admitted exactly once: first scan
// 200, every other scan of it 409 "already checked in", never a 5xx.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import exec from 'k6/execution';
import { BASE_URL, seed, login, authHeaders } from './lib.js';

const admitted = new Counter('tickets_admitted');
const rejectedDuplicate = new Counter('duplicate_scans_rejected');
const unexpected = new Rate('scan_unexpected_response');
const tokens = seed.rushTokens;
const SCANNERS = Number(__ENV.SCANNERS || 50);

export const options = {
  scenarios: {
    // Every ticket scanned once, by SCANNERS devices as fast as they can.
    rush: {
      executor: 'shared-iterations',
      vus: SCANNERS,
      iterations: tokens.length,
      maxDuration: '5m',
      exec: 'scanNext',
    },
    // Meanwhile, re-scans of random passes from the same crowd.
    rescans: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RESCAN_RATE || 20),
      timeUnit: '1s',
      duration: __ENV.RESCAN_DURATION || '30s',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'scanRandom',
    },
  },
  thresholds: {
    'http_req_duration{name:scan}': ['p(95)<500', 'p(99)<1500'],
    scan_unexpected_response: ['rate==0'],
    tickets_admitted: [`count<=${tokens.length}`], // nobody admitted twice
    checks: ['rate>0.999'],
  },
};

export function setup() {
  return { token: login() };
}

function scan(token, qrToken) {
  const res = http.post(
    `${BASE_URL}/api/organizer/events/${seed.rushEventId}/checkin`,
    JSON.stringify({ qrToken }),
    { ...authHeaders(token), tags: { name: 'scan' } },
  );
  const duplicate = res.status === 409 && res.json('reasonCode') === 'already_checked_in';
  if (res.status === 200) admitted.add(1);
  if (duplicate) rejectedDuplicate.add(1);
  unexpected.add(res.status !== 200 && !duplicate);
  check(res, { 'admitted or duplicate': () => res.status === 200 || duplicate });
}

export function scanNext(data) {
  scan(data.token, tokens[exec.scenario.iterationInTest]);
}

export function scanRandom(data) {
  scan(data.token, tokens[Math.floor(Math.random() * tokens.length)]);
}

// Exactly-once, from the database's side.
export function teardown(data) {
  const res = http.get(`${BASE_URL}/api/organizer/reports/checkins?eventId=${seed.rushEventId}`, authHeaders(data.token));
  const summary = Object.fromEntries(res.json('summary').map((s) => [s.label, s.value]));
  console.log(`Admitted ${summary['Checked in']} of ${tokens.length} tickets`);
  check(summary, { 'every ticket admitted exactly once': (s) => s['Checked in'] === tokens.length });
}
