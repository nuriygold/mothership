import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { chatMessages } from '@/lib/db/schema';
import { ensureSession } from '@/lib/chat/session-util';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/chat/messages?sessionId=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId')?.trim();

  if (!sessionId) {
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'sessionId is required' } },
      { status: 400 }
    );
  }

  try {
    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(200);
    return Response.json({ messages });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'MESSAGES_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load messages',
        },
      },
      { status: 500 }
    );
  }
}

// POST /api/chat/messages  Body: { sessionId, role, content }
// Used by clients (e.g. Claude page) to persist messages whose chat API doesn't write to DB.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sessionId = body?.sessionId ? String(body.sessionId).trim() : '';
  const role = body?.role === 'assistant' ? 'assistant' : body?.role === 'user' ? 'user' : null;
  const content = typeof body?.content === 'string' ? body.content : '';

  if (!sessionId || !role || !content) {
    return Response.json({ error: 'sessionId, role, content are required' }, { status: 400 });
  }

  try {
    await ensureSession(sessionId, { firstMessageText: role === 'user' ? content : undefined });
    const [message] = await db
      .insert(chatMessages)
      .values({ id: randomUUID(), sessionId, role, content })
      .returning({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      });
    return Response.json({ message });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to save message' },
      { status: 500 }
    );
  }
}
