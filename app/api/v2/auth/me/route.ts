import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { OWNER_COOKIE } from '@/lib/services/owner';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ownerId = cookies().get(OWNER_COOKIE)?.value?.trim();
  if (!ownerId) return NextResponse.json({ authenticated: false });

  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ authenticated: false });

  return NextResponse.json({ authenticated: true, userId: user.id, name: user.name, email: user.email });
}
