import { Router } from 'express';
import { User } from '../models';
import { comparePassword } from '../auth/password';
import { signAccessToken } from '../auth/jwt';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  initiateSignup,
  verifySignup,
  resendSignupOtp,
  EmailInUseError,
  UserNotFoundError,
  InvalidOtpError,
} from '../services/organizerSignup';
import {
  initiateForgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
  InvalidOtpError as InvalidResetOtpError,
  InvalidResetTokenError,
} from '../services/passwordReset';

export const authRouter = Router();

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = await User.findOne({ where: { email } });

  // Same response whether the email doesn't exist or the password is
  // wrong — don't let this endpoint be used to enumerate registered emails.
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.emailVerified) {
    res.status(403).json({ error: 'Please verify your email before logging in', unverified: true });
    return;
  }

  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    organizerId: user.organizerId,
  });

  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, role: user.role, organizerId: user.organizerId },
  });
}));

authRouter.post('/signup', asyncHandler(async (req, res) => {
  const { fullName, email, phone, orgName, password } = req.body as Record<string, unknown>;

  if (
    typeof fullName !== 'string' || !fullName.trim() ||
    typeof email !== 'string' || !email.trim() ||
    typeof phone !== 'string' || !phone.trim() ||
    typeof orgName !== 'string' || !orgName.trim() ||
    typeof password !== 'string' || password.length < 8
  ) {
    res.status(400).json({ error: 'fullName, email, phone, orgName are required, and password must be at least 8 characters' });
    return;
  }

  try {
    await initiateSignup({ fullName, email, phone, orgName, password });
    res.status(201).json({ message: 'Verification code sent', email });
  } catch (err) {
    if (err instanceof EmailInUseError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

authRouter.post('/verify-otp', asyncHandler(async (req, res) => {
  const { email, code } = req.body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof code !== 'string') {
    res.status(400).json({ error: 'email and code are required' });
    return;
  }

  try {
    const result = await verifySignup(email, code);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({ error: 'No pending signup found for this email' });
      return;
    }
    if (err instanceof InvalidOtpError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

authRouter.post('/resend-otp', asyncHandler(async (req, res) => {
  const { email } = req.body as Record<string, unknown>;

  if (typeof email !== 'string') {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  try {
    await resendSignupOtp(email);
    res.status(200).json({ message: 'Verification code resent' });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      // Same enumeration-avoidance reasoning as login — don't reveal
      // whether an email is registered or already verified.
      res.status(200).json({ message: 'Verification code resent' });
      return;
    }
    throw err;
  }
}));

authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body as Record<string, unknown>;

  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'email is required' });
    return;
  }

  // Always the same response, registered or not — see
  // initiateForgotPassword's own comment for why.
  await initiateForgotPassword(email);
  res.status(200).json({ message: 'If that email is registered, a verification code has been sent' });
}));

authRouter.post('/verify-reset-otp', asyncHandler(async (req, res) => {
  const { email, code } = req.body as Record<string, unknown>;

  if (typeof email !== 'string' || typeof code !== 'string') {
    res.status(400).json({ error: 'email and code are required' });
    return;
  }

  try {
    const resetToken = await verifyForgotPasswordOtp(email, code);
    res.status(200).json({ resetToken });
  } catch (err) {
    if (err instanceof InvalidResetOtpError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const { resetToken, newPassword } = req.body as Record<string, unknown>;

  if (typeof resetToken !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'resetToken is required and newPassword must be at least 8 characters' });
    return;
  }

  try {
    await resetPassword(resetToken, newPassword);
    res.status(200).json({ message: 'Password updated' });
  } catch (err) {
    if (err instanceof InvalidResetTokenError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));
