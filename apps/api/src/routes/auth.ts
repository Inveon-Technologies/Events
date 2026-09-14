import { Router } from 'express';
import { User } from '../models';
import { comparePassword } from '../auth/password';
import { signAccessToken } from '../auth/jwt';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
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

  const token = signAccessToken({
    sub: user.id,
    role: user.role,
    organizerId: user.organizerId,
  });

  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, role: user.role, organizerId: user.organizerId },
  });
});
