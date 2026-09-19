import { randomInt } from 'crypto';
import { redis } from '../db/redis';

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_PREFIX = 'otp:signup:';

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function issueSignupOtp(email: string): Promise<string> {
  const code = generateCode();
  await redis.set(`${OTP_PREFIX}${email}`, code, { EX: OTP_TTL_SECONDS });
  return code;
}

export async function verifySignupOtp(email: string, code: string): Promise<boolean> {
  const key = `${OTP_PREFIX}${email}`;
  const stored = await redis.get(key);
  if (!stored || stored !== code) return false;
  await redis.del(key);
  return true;
}

export const OTP_EXPIRY_MINUTES = OTP_TTL_SECONDS / 60;
