import { prisma } from '@/lib/prisma';
import { ensureSession } from '@/lib/chat/session-util';

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
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { id: true, role: true, content: true, createdAt: true },
    });
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
    const message = await prisma.chatMessage.create({
      data: { sessionId, role, content },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return Response.json({ message });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to save message' },
      { status: 500 }
    );
  }
}
