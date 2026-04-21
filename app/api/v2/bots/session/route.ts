import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';
import { OWNER_COOKIE, DEVICE_COOKIE } from '@/lib/services/owner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_BOTS = new Set(['adrian', 'ruby', 'emerald', 'adobe', 'anchor']);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const bot = searchParams.get('bot')?.toLowerCase().trim() ?? '';

  if (!bot || !VALID_BOTS.has(bot)) {
    return NextResponse.json({ error: 'Invalid bot key' }, { status: 400 });
  }

  const jar = cookies();

  // Owner session (cross-browser) takes priority over device session
  const ownerId = jar.get(OWNER_COOKIE)?.value?.trim();
  const identityPrefix = ownerId ? `owner:${ownerId}` : null;

  let deviceId = jar.get(DEVICE_COOKIE)?.value ?? '';
  const isNewDevice = !deviceId && !ownerId;
  if (!deviceId) deviceId = randomUUID();

  const sessionTitle = identityPrefix
    ? `${identityPrefix}:bot:${bot}`
    : `device:${deviceId}:bot:${bot}`;

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

  const res = NextResponse.json({
    sessionId: session.id,
    identity: ownerId ? 'owner' : 'device',
  });

  if (isNewDevice) {
    res.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
  }

  return res;
}
