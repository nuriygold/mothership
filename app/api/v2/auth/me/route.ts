import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { OWNER_COOKIE } from '@/lib/services/owner';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ownerId = cookies().get(OWNER_COOKIE)?.value?.trim();
  if (!ownerId) return NextResponse.json({ authenticated: false });

  // If the DB is reachable, look up the real user. If it isn't (migration in
  // progress / DATABASE_URL unset), trust the cookie so the operator stays in.
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);
    if (user) {
      return NextResponse.json({ authenticated: true, userId: user.id, name: user.name, email: user.email });
    }
  } catch (err) {
    console.warn('[auth/me] DB unavailable, trusting cookie:', (err as Error).message);
  }

  return NextResponse.json({
    authenticated: true,
    userId: ownerId,
    name: 'Nuriy (bypass)',
    email: process.env.OWNER_EMAIL ?? 'hello@nuriy.com',
    bypass: true,
  });
}
