import { Organizer, User } from '../models';
import { hashPassword } from '../auth/password';
import { signAccessToken } from '../auth/jwt';
import { issueOtp, verifyOtp as checkOtp, OTP_EXPIRY_MINUTES } from './otp';
import { sendEmail, isEmailConfigured } from './email';
import { otpEmail, registrationSuccessEmail } from '../emails/templates';
import { logger, logOtpForDevelopment } from '../logger';

export class EmailInUseError extends Error {
  constructor() {
    super('An account with this email already exists');
  }
}

export class UserNotFoundError extends Error {}
export class InvalidOtpError extends Error {
  constructor() {
    super('Invalid or expired verification code');
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'organizer';
  let candidate = root;
  let suffix = 1;
  // Small, bounded loop — collisions on a freshly slugified org name are
  // rare, and this is a one-time signup action, not a hot path.
  while (await Organizer.findOne({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
  return candidate;
}

export interface InitiateSignupParams {
  fullName: string;
  email: string;
  phone: string;
  orgName: string;
  password: string;
}

export async function initiateSignup(params: InitiateSignupParams): Promise<void> {
  const existing = await User.findOne({ where: { email: params.email } });
  if (existing) throw new EmailInUseError();

  const organizer = await Organizer.create({
    name: params.orgName,
    slug: await uniqueSlug(params.orgName),
    contactEmail: params.email,
    contactPhone: params.phone,
  });

  await User.create({
    organizerId: organizer.id,
    email: params.email,
    passwordHash: await hashPassword(params.password),
    role: 'organizer_owner',
    name: params.fullName,
    emailVerified: false,
  });

  const code = await issueOtp('signup', params.email);

  if (isEmailConfigured()) {
    await sendEmail({
      to: params.email,
      subject: 'Verify your email — Inveon Events',
      html: otpEmail({ recipientName: params.fullName, otpCode: code, expiresInMinutes: OTP_EXPIRY_MINUTES }),
    });
  } else {
    logOtpForDevelopment('signup', params.email, code);
  }
}

export async function resendSignupOtp(email: string): Promise<void> {
  const user = await User.findOne({ where: { email } });
  if (!user || user.emailVerified) throw new UserNotFoundError();

  const code = await issueOtp('signup', email);

  if (isEmailConfigured()) {
    await sendEmail({
      to: email,
      subject: 'Your new verification code — Inveon Events',
      html: otpEmail({ recipientName: user.name ?? 'there', otpCode: code, expiresInMinutes: OTP_EXPIRY_MINUTES }),
    });
  } else {
    logOtpForDevelopment('signup (resend)', email, code);
  }
}

export interface VerifySignupResult {
  token: string;
  user: { id: string; email: string; name: string | null; role: string; organizerId: string | null };
}

export async function verifySignup(email: string, code: string): Promise<VerifySignupResult> {
  const user = await User.findOne({ where: { email } });
  if (!user) throw new UserNotFoundError();

  const ok = await checkOtp('signup', email, code);
  if (!ok) throw new InvalidOtpError();

  user.emailVerified = true;
  await user.save();

  if (isEmailConfigured()) {
    const organizer = user.organizerId ? await Organizer.findByPk(user.organizerId) : null;
    // Best-effort, like the booking confirmation email — a failed welcome
    // email must never undo a verification that already succeeded.
    sendEmail({
      to: email,
      subject: 'Welcome to Inveon Events!',
      html: registrationSuccessEmail({
        recipientName: user.name ?? 'there',
        orgName: organizer?.name ?? 'your organization',
        dashboardUrl: 'https://events.inveontechnologies.in/organizer/dashboard',
      }),
    }).catch((err) => {
      logger.error({ err }, 'Failed to send registration-success email');
    });
  }

  const token = signAccessToken({ sub: user.id, role: user.role, organizerId: user.organizerId });
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, organizerId: user.organizerId },
  };
}
