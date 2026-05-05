import { desc, eq, inArray, like } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { chatMessages, chatSessions } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function attachLastMessages(
  sessions: Array<{ id: string; title: string | null; updatedAt: Date; createdAt: Date }>
) {
  if (!sessions.length) return [];

  const messages = await db
    .select({
      sessionId: chatMessages.sessionId,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(inArray(chatMessages.sessionId, sessions.map((session) => session.id)))
    .orderBy(desc(chatMessages.createdAt));

  const latestBySession = new Map<string, string | null>();
  for (const message of messages) {
    if (!latestBySession.has(message.sessionId)) {
      latestBySession.set(message.sessionId, message.content);
    }
  }

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    lastMessage: latestBySession.get(session.id)?.slice(0, 120) ?? null,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
  }));
}

// GET /api/chat/sessions?ids=id1,id2,...&agent=iceman
// Returns metadata for the given session IDs (title + last message preview).
// If no ids provided, returns the most recent sessions (optionally filtered by agent prefix).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids')?.trim();
  const agent = searchParams.get('agent')?.trim();

  if (!idsParam) {
    const all = agent
      ? await db
          .select({
            id: chatSessions.id,
            title: chatSessions.title,
            updatedAt: chatSessions.updatedAt,
            createdAt: chatSessions.createdAt,
          })
          .from(chatSessions)
          .where(like(chatSessions.id, `agent:${agent}:%`))
          .orderBy(desc(chatSessions.updatedAt))
          .limit(100)
      : await db
          .select({
            id: chatSessions.id,
            title: chatSessions.title,
            updatedAt: chatSessions.updatedAt,
            createdAt: chatSessions.createdAt,
          })
          .from(chatSessions)
          .orderBy(desc(chatSessions.updatedAt))
          .limit(100);

    return Response.json({ sessions: await attachLastMessages(all) });
  }

  const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 50);

  const sessions = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      updatedAt: chatSessions.updatedAt,
      createdAt: chatSessions.createdAt,
    })
    .from(chatSessions)
    .where(inArray(chatSessions.id, ids))
    .orderBy(desc(chatSessions.updatedAt));

  return Response.json({ sessions: await attachLastMessages(sessions) });
}

// POST /api/chat/sessions  Body: { id?: string, title?: string }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id: string = body?.id ? String(body.id).trim() : crypto.randomUUID();
  const title: string | null = body?.title ? String(body.title).trim() : null;

  const now = new Date();
  const [session] = await db
    .insert(chatSessions)
    .values({ id, title, updatedAt: now })
    .onConflictDoUpdate({
      target: chatSessions.id,
      set: title ? { title, updatedAt: now } : { updatedAt: now },
    })
    .returning();

  return Response.json({ session });
}
