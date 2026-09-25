import { randomInt } from 'crypto';
import { redis } from '../db/redis';
import { logNotification } from './notificationLog';

// 10 minutes: Gmail can take a minute or two to deliver, and a code
// that has already expired by the time it lands is the most common
// "I never got a working code" complaint.
const OTP_TTL_SECONDS = 10 * 60;
// Minimum gap between two codes for the same address, so a double
// click or an impatient "resend" doesn't burn the previous code (and
// the send rate limit) before the first email has even arrived.
export const OTP_RESEND_COOLDOWN_SECONDS = 30;
// Wrong guesses allowed against one issued code before it's burned —
// without this, a 6-digit code is brute-forceable within its TTL by
// anyone who can send requests fast enough. 5 leaves room for typos.
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_EXPIRY_MINUTES = OTP_TTL_SECONDS / 60;

export type OtpPurpose = 'signup' | 'reset' | 'customer_login' | 'admin_login' | 'admin_stepup';

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function keyFor(purpose: OtpPurpose, email: string): string {
  return `otp:${purpose}:${email}`;
}

function cooldownKeyFor(purpose: OtpPurpose, email: string): string {
  return `otp-cooldown:${purpose}:${email}`;
}

// Seconds until another code may be sent to this address (0 = now).
export async function otpResendWaitSeconds(purpose: OtpPurpose, email: string): Promise<number> {
  const ttl = await redis.ttl(cooldownKeyFor(purpose, email));
  return ttl > 0 ? ttl : 0;
}

function attemptsKeyFor(purpose: OtpPurpose, email: string): string {
  return `otp-attempts:${purpose}:${email}`;
}

export async function issueOtp(purpose: OtpPurpose, email: string): Promise<string> {
  const code = generateCode();
  await redis.set(keyFor(purpose, email), code, { EX: OTP_TTL_SECONDS });
  // A fresh code gets a fresh attempt budget.
  await redis.del(attemptsKeyFor(purpose, email));
  await redis.set(cooldownKeyFor(purpose, email), '1', { EX: OTP_RESEND_COOLDOWN_SECONDS });
  // Status only — the code itself is never recorded.
  logNotification({ channel: 'otp', kind: purpose, recipient: email, status: 'issued' });
  return code;
}

// Lets the caller clear the cooldown when the email carrying a fresh
// code couldn't actually be sent, so the customer can retry at once.
export async function clearOtpResendCooldown(purpose: OtpPurpose, email: string): Promise<void> {
  await redis.del(cooldownKeyFor(purpose, email));
}

export type OtpCheckResult =
  | { ok: true }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked' };

// Single-use: a correct match deletes the code immediately, so it can
// never be replayed even within its TTL window. After MAX_OTP_ATTEMPTS
// wrong guesses the code is deleted too, so the caller has to request a
// new one (itself rate-limited per client in the routes).
export async function checkOtp(purpose: OtpPurpose, email: string, code: string): Promise<OtpCheckResult> {
  const key = keyFor(purpose, email);
  const attemptsKey = attemptsKeyFor(purpose, email);
  const stored = await redis.get(key);
  if (!stored) {
    logNotification({ channel: 'otp', kind: purpose, recipient: email, status: 'expired' });
    return { ok: false, reason: 'expired' };
  }

  if (stored !== code) {
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, OTP_TTL_SECONDS);
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await redis.del([key, attemptsKey]);
      logNotification({ channel: 'otp', kind: purpose, recipient: email, status: 'locked' });
      return { ok: false, reason: 'locked' };
    }
    logNotification({ channel: 'otp', kind: purpose, recipient: email, status: 'wrong' });
    return { ok: false, reason: 'wrong', attemptsLeft: MAX_OTP_ATTEMPTS - attempts };
  }

  await redis.del([key, attemptsKey]);
  logNotification({ channel: 'otp', kind: purpose, recipient: email, status: 'verified' });
  return { ok: true };
}

export async function verifyOtp(purpose: OtpPurpose, email: string, code: string): Promise<boolean> {
  return (await checkOtp(purpose, email, code)).ok;
}
