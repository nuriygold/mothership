import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/v2/ruby/sessions?ids=id1,id2,...
// Returns metadata for the given session IDs (latest message preview + title)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids')?.trim();

  if (!idsParam) {
    return Response.json({ sessions: [] });
  }

  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50); // cap at 50

  const sessions = await prisma.chatSession.findMany({
    where: { id: { in: ids } },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
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

// POST /api/v2/ruby/sessions
// Body: { id?: string, title?: string }
// Creates a new session (or ensures one exists for the given id)
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
