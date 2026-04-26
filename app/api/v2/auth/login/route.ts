import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { OWNER_COOKIE } from '@/lib/services/owner';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(req: Request) {
  // NOTE: Passphrase check temporarily bypassed during the Drizzle migration so
  // the operator can access the app without OWNER_PASSPHRASE configured.
  // Re-enable by restoring the OWNER_PASSPHRASE comparison below before shipping.
  await req.json().catch(() => ({}));

  // Find or create the owner user by email
  const email = String(process.env.OWNER_EMAIL ?? 'hello@nuriy.com').trim();
  const now = new Date();
  await db
    .insert(users)
    .values({ id: randomUUID(), email, name: 'Nuriy', updatedAt: now })
    .onConflictDoNothing({ target: users.email });

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return NextResponse.json({ error: 'Failed to resolve owner user' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, userId: user.id, name: user.name });
  res.cookies.set(OWNER_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
