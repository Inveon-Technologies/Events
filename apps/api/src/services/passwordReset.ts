import { randomBytes } from 'crypto';
import { User } from '../models';
import { hashPassword } from '../auth/password';
import { issueOtp, verifyOtp, OTP_EXPIRY_MINUTES } from './otp';
import { sendEmail, isEmailConfigured } from './email';
import { otpEmail } from '../emails/templates';
import { redis } from '../db/redis';
import { logger, logOtpForDevelopment } from '../logger';

const RESET_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const RESET_TOKEN_PREFIX = 'reset-token:';

export class InvalidOtpError extends Error {
  constructor() {
    super('Invalid or expired verification code');
  }
}

export class InvalidResetTokenError extends Error {
  constructor() {
    super('This password reset link has expired. Please request a new one.');
  }
}

// Always succeeds from the caller's point of view, whether or not the
// email is actually registered — same enumeration-avoidance reasoning as
// login and resend-otp. If there's no account, there's simply nothing to
// email; logged, not surfaced.
export async function initiateForgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    logger.info('Forgot-password requested for an unregistered email');
    return;
  }

  const code = await issueOtp('reset', email);

  if (isEmailConfigured()) {
    await sendEmail({
      to: email,
      subject: 'Reset your password — Inveon Events',
      html: otpEmail({ recipientName: user.name ?? 'there', otpCode: code, expiresInMinutes: OTP_EXPIRY_MINUTES }),
    });
  } else {
    logOtpForDevelopment('password reset', email, code);
  }
}

// Verifies the OTP (consuming it, single-use) and exchanges it for a
// short-lived reset token — the actual password-set step needs that
// token, not the raw OTP again, so the OTP can't be replayed even within
// its own TTL window by an observer of the first request.
export async function verifyForgotPasswordOtp(email: string, code: string): Promise<string> {
  const ok = await verifyOtp('reset', email, code);
  if (!ok) throw new InvalidOtpError();

  const token = randomBytes(32).toString('hex');
  await redis.set(`${RESET_TOKEN_PREFIX}${token}`, email, { EX: RESET_TOKEN_TTL_SECONDS });
  return token;
}

export async function resetPassword(resetToken: string, newPassword: string): Promise<void> {
  const key = `${RESET_TOKEN_PREFIX}${resetToken}`;
  const email = await redis.get(key);
  if (!email) throw new InvalidResetTokenError();

  const user = await User.findOne({ where: { email } });
  if (!user) throw new InvalidResetTokenError();

  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await redis.del(key);
}
