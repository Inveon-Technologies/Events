import { randomInt } from 'crypto';
import { redis } from '../db/redis';

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
export const OTP_EXPIRY_MINUTES = OTP_TTL_SECONDS / 60;

export type OtpPurpose = 'signup' | 'reset';

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function keyFor(purpose: OtpPurpose, email: string): string {
  return `otp:${purpose}:${email}`;
}

export async function issueOtp(purpose: OtpPurpose, email: string): Promise<string> {
  const code = generateCode();
  await redis.set(keyFor(purpose, email), code, { EX: OTP_TTL_SECONDS });
  return code;
}

// Single-use: a correct match deletes the code immediately, so it can
// never be replayed even within its TTL window.
export async function verifyOtp(purpose: OtpPurpose, email: string, code: string): Promise<boolean> {
  const key = keyFor(purpose, email);
  const stored = await redis.get(key);
  if (!stored || stored !== code) return false;
  await redis.del(key);
  return true;
}
