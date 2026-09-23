import { User } from '../models';
import { hashPassword, comparePassword } from '../auth/password';

export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class IncorrectPasswordError extends Error {}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('User not found');

  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }

  const matches = await comparePassword(currentPassword, user.passwordHash);
  if (!matches) {
    throw new IncorrectPasswordError('Current password is incorrect');
  }

  const newHash = await hashPassword(newPassword);
  await user.update({ passwordHash: newHash });
}
