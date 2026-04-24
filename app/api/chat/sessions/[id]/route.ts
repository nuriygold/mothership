import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { chatMessages, chatSessions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// PATCH /api/chat/sessions/:id  Body: { title: string }
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sessionId = params.id?.trim();
  if (!sessionId) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const title = body?.title ? String(body.title).trim() : null;

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const [session] = await db
    .insert(chatSessions)
    .values({ id: sessionId, title, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: chatSessions.id,
      set: { title, updatedAt: new Date() },
    })
    .returning();

  return Response.json({ session });
}

// DELETE /api/chat/sessions/:id
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sessionId = params.id?.trim();
  if (!sessionId) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));

  return Response.json({ ok: true });
}
