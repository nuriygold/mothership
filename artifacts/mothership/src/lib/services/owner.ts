import { cookies } from 'next/headers';
import { OWNER_COOKIE, OWNER_COOKIE_SUBJECT, verifyOwnerCookieValue } from '@/lib/auth/owner-cookie';

export const DEVICE_COOKIE = 'mothership-device-id';

/** Returns the authenticated owner identity, or null if not logged in. */
export async function getOwnerId(): Promise<string | null> {
  const jar = cookies();
  const verification = verifyOwnerCookieValue(jar.get(OWNER_COOKIE)?.value);
  return verification.ok ? OWNER_COOKIE_SUBJECT : null;
}

/** Returns a stable identity key: authenticated owner identity or device cookie. */
export async function getStableIdentity(): Promise<{ type: 'owner' | 'device'; id: string }> {
  const ownerId = await getOwnerId();
  if (ownerId) return { type: 'owner', id: ownerId };

  const jar = cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value?.trim() ?? '';
  return { type: 'device', id: deviceId };
}
