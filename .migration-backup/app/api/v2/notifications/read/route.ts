import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { notifications } from '@/lib/db/schema';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH: mark one (body: { id }) or all (body: {}) as read
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : null;

  if (id) {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  } else {
    await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  }

  publishV2Event('notifications', 'read', { id: id ?? 'all' });

  return Response.json({ ok: true });
}
