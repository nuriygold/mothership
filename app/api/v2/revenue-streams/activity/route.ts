import { prisma } from '@/lib/prisma';
import { streamByKey } from '@/lib/v2/revenue-streams';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('stream')?.trim() ?? '';

  if (!key) {
    return Response.json({ error: 'stream is required' }, { status: 400 });
  }
  if (!streamByKey(key)) {
    return Response.json({ error: 'Stream not found' }, { status: 404 });
  }

  const activity = await prisma.revenueStreamStatusLog.findMany({
    where: { stream: key },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return Response.json({ stream: key, activity });
}
