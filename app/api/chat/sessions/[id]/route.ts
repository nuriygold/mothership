import { prisma } from '@/lib/prisma';

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

  const session = await prisma.chatSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId, title },
    update: { title },
  });

  return Response.json({ session });
}

// DELETE /api/chat/sessions/:id
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sessionId = params.id?.trim();
  if (!sessionId) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  await prisma.chatSession.delete({ where: { id: sessionId } }).catch(() => {
    return prisma.chatMessage.deleteMany({ where: { sessionId } });
  });

  return Response.json({ ok: true });
}
