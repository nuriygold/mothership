import { prisma } from '@/lib/prisma';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH: mark one (body: { id }) or all (body: {}) as read
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : null;

  if (id) {
    await prisma.notification.update({ where: { id }, data: { read: true } });
  } else {
    await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  }

  publishV2Event('notifications', 'read', { id: id ?? 'all' });

  return Response.json({ ok: true });
}
