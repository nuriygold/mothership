import { NextResponse } from 'next/server';
import { OWNER_COOKIE } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OWNER_COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
