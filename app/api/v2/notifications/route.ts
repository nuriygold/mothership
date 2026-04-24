import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { notifications } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const rows = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  const [{ count: unread }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(eq(notifications.read, false));

  return Response.json({ notifications: rows, unread: Number(unread) });
}
