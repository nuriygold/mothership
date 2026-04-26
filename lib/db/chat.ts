import { asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import { chatMessages, chatSessions } from '@/lib/db/schema';

type ChatSessionRow = typeof chatSessions.$inferSelect;
type ChatMessageRow = typeof chatMessages.$inferSelect;

function summarizeMessages(sessions: ChatSessionRow[], messages: ChatMessageRow[]) {
  const lastBySession = new Map<string, string | null>();
  for (const message of messages) {
    if (!lastBySession.has(message.sessionId)) {
      lastBySession.set(message.sessionId, message.content.slice(0, 120));
    }
  }

  return sessions.map((session) => ({
    id: session.id,
    title: session.title,
    lastMessage: lastBySession.get(session.id) ?? null,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
  }));
}

export async function listChatSessionSummaries(ids?: string[], limit = 100) {
  const sessions = ids?.length
    ? await db
        .select()
        .from(chatSessions)
        .where(inArray(chatSessions.id, ids))
        .orderBy(desc(chatSessions.updatedAt))
    : await db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt)).limit(limit);

  if (!sessions.length) return [];

  const messages = await db
    .select()
    .from(chatMessages)
    .where(inArray(chatMessages.sessionId, sessions.map((session) => session.id)))
    .orderBy(desc(chatMessages.createdAt));

  return summarizeMessages(sessions, messages);
}

export async function upsertChatSession(sessionId: string, title?: string | null) {
  const now = new Date();
  const values: Record<string, unknown> = {
    id: sessionId,
    updatedAt: now,
  };

  if (title !== undefined) values.title = title;

  const [session] = await db
    .insert(chatSessions)
    .values(values as typeof chatSessions.$inferInsert)
    .onConflictDoUpdate({
      target: chatSessions.id,
      set: values as Partial<typeof chatSessions.$inferInsert>,
    })
    .returning();

  return session;
}

export async function addChatMessage(sessionId: string, role: string, content: string) {
  const [message] = await db
    .insert(chatMessages)
    .values({
      id: randomUUID(),
      sessionId,
      role,
      content,
    })
    .returning();

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .catch(() => {});

  return message;
}

export async function listChatMessages(sessionId: string, limit = 50) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(limit);
}
