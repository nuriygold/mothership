import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/chat/sessions?ids=id1,id2,...&agent=iceman
// Returns metadata for the given session IDs (title + last message preview).
// If no ids provided, returns the most recent sessions (optionally filtered by agent prefix).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids')?.trim();
  const agent = searchParams.get('agent')?.trim();

  if (!idsParam) {
    const where = agent ? { id: { startsWith: `agent:${agent}:` } } : {};
    const all = await prisma.chatSession.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return Response.json({
      sessions: all.map((s) => ({
        id: s.id,
        title: s.title,
        lastMessage: s.messages[0]?.content?.slice(0, 120) ?? null,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt,
      })),
    });
  }

  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);

  const sessions = await prisma.chatSession.findMany({
    where: { id: { in: ids } },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });

  return Response.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      lastMessage: s.messages[0]?.content?.slice(0, 120) ?? null,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    })),
  });
}

// POST /api/chat/sessions  Body: { id?: string, title?: string }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id: string = body?.id ? String(body.id).trim() : crypto.randomUUID();
  const title: string | null = body?.title ? String(body.title).trim() : null;

  const session = await prisma.chatSession.upsert({
    where: { id },
    create: { id, title },
    update: title ? { title } : {},
  });

  return Response.json({ session });
}
