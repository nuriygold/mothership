import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

export const OWNER_COOKIE = 'mothership-owner-id';
export const DEVICE_COOKIE = 'mothership-device-id';

/** Returns the authenticated owner's User.id, or null if not logged in. */
export async function getOwnerId(): Promise<string | null> {
  const jar = cookies();
  const ownerId = jar.get(OWNER_COOKIE)?.value?.trim();
  if (!ownerId) return null;
  // Quick existence check — don't trust stale cookies for deleted users
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).limit(1);
  return exists?.id ?? null;
}

/** Returns a stable identity key: owner user ID if authenticated, device cookie otherwise. */
export async function getStableIdentity(): Promise<{ type: 'owner' | 'device'; id: string }> {
  const ownerId = await getOwnerId();
  if (ownerId) return { type: 'owner', id: ownerId };

  const jar = cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value?.trim() ?? '';
  return { type: 'device', id: deviceId };
}
