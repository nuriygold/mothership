import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_BOTS = new Set(['adrian', 'ruby', 'emerald', 'adobe', 'anchor']);
const COOKIE = 'mothership-device-id';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bot = searchParams.get('bot')?.toLowerCase().trim() ?? '';

  if (!bot || !VALID_BOTS.has(bot)) {
    return NextResponse.json({ error: 'Invalid bot key' }, { status: 400 });
  }

  const jar = cookies();
  let deviceId = jar.get(COOKIE)?.value ?? '';

  const isNew = !deviceId;
  if (isNew) deviceId = randomUUID();

  const sessionTitle = `device:${deviceId}:bot:${bot}`;

  // Find or create a ChatSession for this device+bot pair
  let session = await prisma.chatSession.findFirst({
    where: { title: sessionTitle },
    select: { id: true },
  });

  if (!session) {
    session = await prisma.chatSession.create({
      data: { title: sessionTitle },
      select: { id: true },
    });
  }

  const res = NextResponse.json({ sessionId: session.id, deviceId });

  if (isNew) {
    res.cookies.set(COOKIE, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }

  return res;
}
