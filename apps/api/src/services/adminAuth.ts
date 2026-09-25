import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PlatformAdmin, AdminAuditLog } from '../models';
import { hashPassword, comparePassword } from '../auth/password';
import { issueOtp, checkOtp, OTP_EXPIRY_MINUTES } from './otp';
import { sendEmail, isEmailConfigured } from './email';
import { emailShell, escapeHtml } from '../emails/templates';
import { logger } from '../logger';

// Super admin sign-in: a strong password, then a one-time code emailed
// to the admin's address. Five wrong passwords lock the account for 15
// minutes. Sessions last 4 hours and end early if the password changes
// or the account is switched off.

export class AdminAuthError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
  ) {
    super(message);
  }
}

export const ADMIN_SESSION_HOURS = 4;
const MAX_FAILED_PASSWORDS = 5;
const LOCK_MINUTES = 15;
export const MIN_ADMIN_PASSWORD_LENGTH = 14;

// Returns a list of what's wrong ([] = acceptable).
export function adminPasswordProblems(password: string, email = ''): string[] {
  const problems: string[] = [];
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) problems.push(`at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  if (!/[a-z]/.test(password)) problems.push('a lower-case letter');
  if (!/[A-Z]/.test(password)) problems.push('an upper-case letter');
  if (!/[0-9]/.test(password)) problems.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol');
  if (/(.)\1\1\1/.test(password)) problems.push('no character repeated 4+ times in a row');
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) problems.push('not containing your email name');
  if (/password|inveon|admin|qwerty|123456/i.test(password)) problems.push('no common words (password, admin, inveon, 123456…)');
  return problems;
}

export function generateStrongPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const chars = sets.map((set) => set[crypto.randomInt(set.length)]);
  while (chars.length < 20) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  // A different key from organizer/customer tokens, so no other token
  // type can ever be accepted here.
  return `${s}:platform-admin`;
}

export interface AdminSessionPayload {
  sub: string;
  purpose: 'platform_admin';
  pwd: number; // passwordChangedAt at sign-in, to end older sessions
}

export function signAdminSession(admin: PlatformAdmin): string {
  const payload: AdminSessionPayload = { sub: admin.id, purpose: 'platform_admin', pwd: admin.passwordChangedAt?.getTime() ?? 0 };
  return jwt.sign(payload, secret(), { expiresIn: `${ADMIN_SESSION_HOURS}h` });
}

export async function verifyAdminSession(token: string): Promise<PlatformAdmin> {
  let payload: AdminSessionPayload;
  try {
    payload = jwt.verify(token, secret()) as unknown as AdminSessionPayload;
  } catch {
    throw new AdminAuthError('Session expired — please sign in again');
  }
  if (payload.purpose !== 'platform_admin') throw new AdminAuthError('Session expired — please sign in again');
  const admin = await PlatformAdmin.findByPk(payload.sub);
  if (!admin || !admin.active) throw new AdminAuthError('Session expired — please sign in again');
  if ((admin.passwordChangedAt?.getTime() ?? 0) !== payload.pwd) throw new AdminAuthError('Password changed — please sign in again');
  return admin;
}

export async function audit(
  admin: Pick<PlatformAdmin, 'id' | 'email'> | null,
  action: string,
  target: string | null,
  details: Record<string, unknown> | null,
  ip: string | undefined,
): Promise<void> {
  await AdminAuditLog.create({
    adminId: admin?.id ?? null,
    adminEmail: admin?.email ?? null,
    action,
    target: target?.slice(0, 255) ?? null,
    details,
    ip: ip ?? null,
  }).catch((err) => logger.error({ err, action }, 'Could not write admin audit log'));
}

function adminOtpEmail(name: string, code: string, ip: string | undefined): string {
  return emailShell(
    `<p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
     <p style="margin:0 0 12px">Your Inveon super admin sign-in code is:</p>
     <p style="margin:0 0 16px;font-size:30px;font-weight:700;letter-spacing:6px">${code}</p>
     <p style="margin:0 0 8px;color:#475569;font-size:13px">It expires in ${OTP_EXPIRY_MINUTES} minutes and can be used once.</p>
     <p style="margin:0;color:#475569;font-size:13px">Sign-in attempt from IP ${escapeHtml(ip ?? 'unknown')}. If this wasn't you, change your password now and tell the team.</p>`,
    'Your super admin sign-in code',
  );
}

let dummyHash: string | undefined;

// Step 1: email + password. On success a code is emailed; the response
// is the same whether or not the email exists, apart from lockouts.
export async function startAdminLogin(emailRaw: string, password: string, ip: string | undefined): Promise<{ codeSent: true }> {
  const email = emailRaw.trim().toLowerCase();
  const admin = await PlatformAdmin.findOne({ where: { email } });
  const now = new Date();

  if (admin?.lockedUntil && admin.lockedUntil > now) {
    const minutes = Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 60000);
    throw new AdminAuthError(`Too many wrong attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 423);
  }

  // Compare even for an unknown email so timing doesn't reveal which
  // addresses are admins.
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  const ok = await comparePassword(password, admin?.passwordHash ?? dummyHash).catch(() => false);

  if (!admin || !admin.active || !ok) {
    if (admin) {
      const failed = admin.failedAttempts + 1;
      const lock = failed >= MAX_FAILED_PASSWORDS;
      await admin.update({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60000) : null });
      await audit(admin, lock ? 'login.locked' : 'login.wrong_password', admin.email, null, ip);
    } else {
      await audit(null, 'login.unknown_email', email, null, ip);
    }
    throw new AdminAuthError('Wrong email or password');
  }

  if (!isEmailConfigured()) {
    throw new AdminAuthError('Email is not configured on the server, so the sign-in code cannot be sent.', 503);
  }
  const code = await issueOtp('admin_login', email);
  await sendEmail({
    to: email,
    subject: `${code} is your Inveon admin sign-in code`,
    html: adminOtpEmail(admin.name, code, ip),
    kind: 'admin_login_code',
  });
  await audit(admin, 'login.code_sent', admin.email, null, ip);
  return { codeSent: true };
}

// Step 2: the emailed code → a session token.
export async function finishAdminLogin(
  emailRaw: string,
  code: string,
  ip: string | undefined,
): Promise<{ token: string; admin: { id: string; email: string; name: string }; expiresInHours: number }> {
  const email = emailRaw.trim().toLowerCase();
  const admin = await PlatformAdmin.findOne({ where: { email } });
  if (!admin || !admin.active) throw new AdminAuthError('Code expired — please sign in again');
  const result = await checkOtp('admin_login', email, String(code).trim());
  if (!result.ok) {
    await audit(admin, 'login.wrong_code', admin.email, { reason: result.reason }, ip);
    if (result.reason === 'wrong')
      throw new AdminAuthError(`Wrong code — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left`);
    throw new AdminAuthError('Code expired — please sign in again');
  }
  await admin.update({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip ?? null });
  await audit(admin, 'login.success', admin.email, null, ip);
  return {
    token: signAdminSession(admin),
    admin: { id: admin.id, email: admin.email, name: admin.name },
    expiresInHours: ADMIN_SESSION_HOURS,
  };
}

export async function changeAdminPassword(admin: PlatformAdmin, current: string, next: string): Promise<string> {
  if (!(await comparePassword(current, admin.passwordHash))) throw new AdminAuthError('Current password is wrong', 400);
  const problems = adminPasswordProblems(next, admin.email);
  if (problems.length) throw new AdminAuthError(`New password needs ${problems.join(', ')}`, 400);
  await admin.update({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() });
  return signAdminSession(admin);
}

export async function createPlatformAdmin(params: { email: string; name: string; password: string }): Promise<PlatformAdmin> {
  const email = params.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AdminAuthError('Enter a valid email', 400);
  if (!params.name.trim()) throw new AdminAuthError('Enter a name', 400);
  const problems = adminPasswordProblems(params.password, email);
  if (problems.length) throw new AdminAuthError(`Password needs ${problems.join(', ')}`, 400);
  if (await PlatformAdmin.findOne({ where: { email } })) throw new AdminAuthError('An admin with this email already exists', 409);
  return PlatformAdmin.create({
    email,
    name: params.name.trim(),
    passwordHash: await hashPassword(params.password),
    passwordChangedAt: new Date(),
  });
}

// ---- step-up: a fresh password + emailed code before dangerous actions ----
// (SQL console writes, commands inside containers, wiping data.) Gives a
// 10-minute token sent as the X-Admin-Step-Up header.

export const STEP_UP_MINUTES = 10;

interface StepUpPayload {
  sub: string;
  purpose: 'platform_admin_step_up';
  pwd: number;
}

export async function startStepUp(admin: PlatformAdmin, password: string, ip: string | undefined): Promise<{ codeSent: true }> {
  if (!(await comparePassword(password, admin.passwordHash).catch(() => false))) {
    await audit(admin, 'step_up.wrong_password', admin.email, null, ip);
    throw new AdminAuthError('Wrong password', 400);
  }
  if (!isEmailConfigured()) throw new AdminAuthError('Email is not configured on the server, so the code cannot be sent.', 503);
  const code = await issueOtp('admin_stepup', admin.email);
  await sendEmail({
    to: admin.email,
    subject: `${code} is your Inveon admin re-check code`,
    html: emailShell(
      `<p style="margin:0 0 12px">Hi ${escapeHtml(admin.name)},</p>
       <p style="margin:0 0 12px">Someone signed in as you asked to unlock <b>dangerous actions</b> (database console, container commands, data reset). Your code is:</p>
       <p style="margin:0 0 16px;font-size:30px;font-weight:700;letter-spacing:6px">${code}</p>
       <p style="margin:0;color:#475569;font-size:13px">From IP ${escapeHtml(ip ?? 'unknown')}. If this wasn't you, change your password now.</p>`,
      'Confirm a dangerous action',
    ),
    kind: 'admin_stepup_code',
  });
  await audit(admin, 'step_up.code_sent', admin.email, null, ip);
  return { codeSent: true };
}

export async function finishStepUp(
  admin: PlatformAdmin,
  code: string,
  ip: string | undefined,
): Promise<{ stepUpToken: string; expiresInMinutes: number }> {
  const result = await checkOtp('admin_stepup', admin.email, code.trim());
  if (!result.ok) {
    await audit(admin, 'step_up.wrong_code', admin.email, { reason: result.reason }, ip);
    if (result.reason === 'wrong')
      throw new AdminAuthError(`Wrong code — ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left`, 400);
    throw new AdminAuthError('Code expired — ask for a new one', 400);
  }
  await audit(admin, 'step_up.granted', admin.email, null, ip);
  const payload: StepUpPayload = { sub: admin.id, purpose: 'platform_admin_step_up', pwd: admin.passwordChangedAt?.getTime() ?? 0 };
  return { stepUpToken: jwt.sign(payload, secret(), { expiresIn: `${STEP_UP_MINUTES}m` }), expiresInMinutes: STEP_UP_MINUTES };
}

// Throws unless `token` is a live step-up token for this same admin.
export function verifyStepUp(admin: PlatformAdmin, token: string | undefined): void {
  if (!token) throw new AdminAuthError('Confirm with your password and an emailed code first', 403);
  let payload: StepUpPayload;
  try {
    payload = jwt.verify(token, secret()) as unknown as StepUpPayload;
  } catch {
    throw new AdminAuthError('Your confirmation has expired — confirm again', 403);
  }
  if (payload.purpose !== 'platform_admin_step_up' || payload.sub !== admin.id || payload.pwd !== (admin.passwordChangedAt?.getTime() ?? 0)) {
    throw new AdminAuthError('Confirm with your password and an emailed code first', 403);
  }
}
