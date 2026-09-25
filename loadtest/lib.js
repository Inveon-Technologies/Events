import http from 'k6/http';
import { check, fail } from 'k6';

// Shared by every scenario. BASE_URL is the site origin (the API is
// served under /api); SEED is the JSON written by `npm run loadtest:seed`.
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
export const seed = JSON.parse(open(__ENV.SEED || './seed.json'));

export function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: seed.email, password: seed.password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } },
  );
  if (!check(res, { 'login ok': (r) => r.status === 200 })) fail(`login failed: ${res.status} ${res.body}`);
  const body = res.json();
  return body.accessToken || body.token;
}

export function authHeaders(token) {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}
