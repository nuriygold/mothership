import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { OWNER_COOKIE } from '@/lib/services/owner';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Stable fallback owner ID used when the DB is unreachable / not migrated yet.
// Deterministic so the cookie keeps resolving to the "same user" across requests.
const BYPASS_OWNER_ID = '00000000-0000-0000-0000-000000000001';
const BYPASS_OWNER_NAME = 'Nuriy (bypass)';

export async function POST(req: Request) {
  // NOTE: Passphrase check temporarily bypassed during the Drizzle migration so
  // the operator can access the app without OWNER_PASSPHRASE configured.
  // Re-enable by restoring the OWNER_PASSPHRASE comparison below before shipping.
  await req.json().catch(() => ({}));

  const email = String(process.env.OWNER_EMAIL ?? 'hello@nuriy.com').trim();
  let userId = BYPASS_OWNER_ID;
  let userName: string | null = BYPASS_OWNER_NAME;

  // Try the real DB-backed upsert. If the DB is unreachable, the User table
  // hasn't been migrated yet, or DATABASE_URL is unset, fall through to the
  // bypass cookie so the operator is never locked out of the app.
  try {
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

    if (user) {
      userId = user.id;
      userName = user.name;
    }
  } catch (err) {
    console.warn('[auth/login] DB unavailable, using bypass cookie:', (err as Error).message);
  }

  const res = NextResponse.json({ ok: true, userId, name: userName, bypass: userId === BYPASS_OWNER_ID });
  res.cookies.set(OWNER_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
