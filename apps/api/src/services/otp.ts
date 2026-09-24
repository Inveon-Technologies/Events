import { randomInt } from 'crypto';
import { redis } from '../db/redis';

const OTP_TTL_SECONDS = 2 * 60; // 2 minutes
// Wrong guesses allowed against one issued code before it's burned —
// without this, a 6-digit code is brute-forceable within its TTL by
// anyone who can send requests fast enough. 5 leaves room for typos.
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_EXPIRY_MINUTES = OTP_TTL_SECONDS / 60;

export type OtpPurpose = 'signup' | 'reset' | 'customer_login';

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function keyFor(purpose: OtpPurpose, email: string): string {
  return `otp:${purpose}:${email}`;
}

function attemptsKeyFor(purpose: OtpPurpose, email: string): string {
  return `otp-attempts:${purpose}:${email}`;
}

export async function issueOtp(purpose: OtpPurpose, email: string): Promise<string> {
  const code = generateCode();
  await redis.set(keyFor(purpose, email), code, { EX: OTP_TTL_SECONDS });
  // A fresh code gets a fresh attempt budget.
  await redis.del(attemptsKeyFor(purpose, email));
  return code;
}

// Single-use: a correct match deletes the code immediately, so it can
// never be replayed even within its TTL window. After MAX_OTP_ATTEMPTS
// wrong guesses the code is deleted too, so the caller has to request a
// new one (itself rate-limited per client in the routes).
export async function verifyOtp(purpose: OtpPurpose, email: string, code: string): Promise<boolean> {
  const key = keyFor(purpose, email);
  const attemptsKey = attemptsKeyFor(purpose, email);
  const stored = await redis.get(key);
  if (!stored) return false;

  if (stored !== code) {
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await redis.del([key, attemptsKey]);
    }
    return false;
  }

  await redis.del([key, attemptsKey]);
  return true;
}
