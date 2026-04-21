import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OWNER_COOKIE } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const passphrase = String(body?.passphrase ?? '').trim();

  const expected = String(process.env.OWNER_PASSPHRASE ?? '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'OWNER_PASSPHRASE env var not set' }, { status: 503 });
  }
  if (!passphrase || passphrase !== expected) {
    return NextResponse.json({ error: 'Incorrect passphrase' }, { status: 401 });
  }

  // Find or create the owner user by email
  const email = String(process.env.OWNER_EMAIL ?? 'hello@nuriy.com').trim();
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Nuriy' },
    update: {},
    select: { id: true, email: true, name: true },
  });

  const res = NextResponse.json({ ok: true, userId: user.id, name: user.name });
  res.cookies.set(OWNER_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
