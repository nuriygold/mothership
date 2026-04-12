import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      take: 50,
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
