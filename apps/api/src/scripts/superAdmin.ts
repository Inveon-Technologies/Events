/* eslint-disable no-console -- this is a CLI script; printing status is the point */
import crypto from 'crypto';
import { sequelize } from '../db/connection';
import { PlatformAdmin } from '../models';
import { hashPassword } from '../auth/password';
import { createPlatformAdmin, generateStrongPassword, adminPasswordProblems } from '../services/adminAuth';

// Manages super admin portal accounts from the server (the portal itself
// can add more admins once one exists):
//
//   docker compose exec events-api node dist/scripts/superAdmin.js create --email you@inveon… --name "Your Name"
//   docker compose exec events-api node dist/scripts/superAdmin.js reset-password --email you@inveon…
//   docker compose exec events-api node dist/scripts/superAdmin.js unlock --email you@inveon…
//   docker compose exec events-api node dist/scripts/superAdmin.js new-path
//   (development: npm run superadmin -- create --email …)
//
// A strong random password is generated and printed once (or pass
// SUPERADMIN_PASSWORD in the environment to choose your own; it must
// pass the same strength rules).

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function chosenPassword(email: string): string {
  const own = process.env.SUPERADMIN_PASSWORD;
  if (!own) return generateStrongPassword();
  const problems = adminPasswordProblems(own, email);
  if (problems.length) {
    console.error(`SUPERADMIN_PASSWORD needs ${problems.join(', ')}`);
    process.exit(1);
  }
  return own;
}

async function main() {
  const command = process.argv[2];
  if (command === 'new-path') {
    console.log(`SUPERADMIN_PATH=${crypto.randomBytes(18).toString('base64url')}`);
    console.log('Put this in apps/api/.env, restart events-api, then open https://<your events domain>/x/<that value>');
    return;
  }

  const email = arg('email')?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: superAdmin.js create|reset-password|unlock --email <email> [--name "Name"] | new-path');
    process.exit(1);
  }

  if (command === 'create') {
    const password = chosenPassword(email);
    const admin = await createPlatformAdmin({ email, name: arg('name') ?? email.split('@')[0], password });
    console.log(`Created super admin ${admin.email}`);
    if (!process.env.SUPERADMIN_PASSWORD) console.log(`Password (shown once — store it in your password manager): ${password}`);
    return;
  }

  const admin = await PlatformAdmin.findOne({ where: { email } });
  if (!admin) {
    console.error(`No super admin with email ${email}`);
    process.exit(1);
  }
  if (command === 'reset-password') {
    const password = chosenPassword(email);
    await admin.update({
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      failedAttempts: 0,
      lockedUntil: null,
      active: true,
    });
    console.log(`Password reset for ${email}; all of their sessions are signed out.`);
    if (!process.env.SUPERADMIN_PASSWORD) console.log(`New password (shown once): ${password}`);
    return;
  }
  if (command === 'unlock') {
    await admin.update({ failedAttempts: 0, lockedUntil: null, active: true });
    console.log(`Unlocked ${email}`);
    return;
  }
  console.error(`Unknown command "${command}"`);
  process.exit(1);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
