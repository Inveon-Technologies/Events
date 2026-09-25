import { BlockedCustomer, Organizer, User } from '../models';

// Suspensions set in the super admin portal. Organizer sessions are
// checked on every request, so the answer is cached for a few seconds
// per user — a block takes effect within BLOCK_CACHE_MS everywhere.

export const BLOCK_CACHE_MS = 15_000;
const cache = new Map<string, { blocked: string | null; at: number }>();

export async function isCustomerBlocked(email: string): Promise<boolean> {
  if (!email) return false;
  return (await BlockedCustomer.count({ where: { email: email.trim().toLowerCase() } })) > 0;
}

// Returns why the organizer account is suspended, or null.
export async function organizerAccountBlock(userId: string, organizerId: string | null): Promise<string | null> {
  const key = `${userId}:${organizerId ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < BLOCK_CACHE_MS) return hit.blocked;
  const [user, organizer] = await Promise.all([
    User.findByPk(userId, { attributes: ['blockedAt'] }),
    organizerId ? Organizer.findByPk(organizerId, { attributes: ['blockedAt'] }) : null,
  ]);
  const blocked = user?.blockedAt ? 'user' : organizer?.blockedAt ? 'organizer' : null;
  cache.set(key, { blocked, at: Date.now() });
  if (cache.size > 5000) cache.clear();
  return blocked;
}

export function clearBlockCache(): void {
  cache.clear();
}
