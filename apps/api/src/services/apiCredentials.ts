import crypto from 'crypto';
import { Op } from 'sequelize';
import { ApiCredential } from '../models';

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

export const MAX_ACTIVE_CREDENTIALS = 10;

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
function randomToken(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return out;
}

// Secrets are 40 random characters (~200 bits) — far too long to guess,
// so a fast hash is the right choice (unlike passwords, which need a
// slow one because people pick guessable ones).
function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export interface ApiCredentialSummary {
  id: string;
  name: string;
  appKey: string;
  secretLast4: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function toSummary(c: ApiCredential): ApiCredentialSummary {
  return {
    id: c.id,
    name: c.name,
    appKey: c.appKey,
    secretLast4: c.secretLast4,
    createdAt: c.createdAt.toISOString(),
    lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listApiCredentials(organizerId: string): Promise<ApiCredentialSummary[]> {
  const creds = await ApiCredential.findAll({
    where: { organizerId, revokedAt: null },
    order: [['createdAt', 'DESC']],
  });
  return creds.map(toSummary);
}

// Returns the secret in plain text exactly once — it's never stored or
// retrievable again, only its hash.
export async function createApiCredential(params: {
  organizerId: string;
  userId: string;
  name: string;
}): Promise<ApiCredentialSummary & { appSecret: string }> {
  const name = params.name.trim();
  if (!name) throw new ValidationError('Give this key a name, e.g. "My website"');
  if (name.length > 100) throw new ValidationError('Keep the name under 100 characters');

  const active = await ApiCredential.count({ where: { organizerId: params.organizerId, revokedAt: null } });
  if (active >= MAX_ACTIVE_CREDENTIALS) {
    throw new ValidationError(`You can have at most ${MAX_ACTIVE_CREDENTIALS} active keys — revoke one you no longer use first`);
  }

  const appSecret = `isk_${randomToken(40)}`;
  const credential = await ApiCredential.create({
    organizerId: params.organizerId,
    name,
    appKey: `ievt_${randomToken(24)}`,
    secretHash: hashSecret(appSecret),
    secretLast4: appSecret.slice(-4),
    createdByUserId: params.userId,
  });
  return { ...toSummary(credential), appSecret };
}

export async function revokeApiCredential(organizerId: string, credentialId: string): Promise<void> {
  const [count] = await ApiCredential.update(
    { revokedAt: new Date() },
    { where: { id: credentialId, organizerId, revokedAt: null } },
  );
  if (count === 0) throw new NotFoundError('Key not found');
}

// The organizer a valid, unrevoked key + secret pair belongs to, or
// null. Always hashes and compares (timing-safe) even for an unknown
// key, so response time doesn't reveal whether a key exists.
export async function authenticateApiCredential(appKey: string, appSecret: string): Promise<{ organizerId: string; credentialId: string } | null> {
  const credential = await ApiCredential.findOne({ where: { appKey, revokedAt: { [Op.is]: null } } });
  const expected = Buffer.from(credential?.secretHash ?? '0'.repeat(64), 'hex');
  const actual = Buffer.from(hashSecret(appSecret), 'hex');
  const matches = crypto.timingSafeEqual(expected, actual);
  if (!credential || !matches) return null;

  // Best-effort "last used" for the settings page; at most once a minute
  // per key so a busy integration doesn't write on every request.
  if (!credential.lastUsedAt || Date.now() - credential.lastUsedAt.getTime() > 60_000) {
    credential.update({ lastUsedAt: new Date() }).catch(() => undefined);
  }
  return { organizerId: credential.organizerId, credentialId: credential.id };
}
