import { ensureV2Authorized } from '@/lib/v2/auth';
import { linkTaskToItem } from '@/lib/services/vision';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  const item = await prisma.visionItem.findUnique({ where: { id: params.id } });
  if (!item) return Response.json({ error: { message: 'Vision item not found' } }, { status: 404 });

  const body = await req.json();
  const title = String(body?.title ?? '').trim();
  if (!title) return Response.json({ error: { message: 'title required' } }, { status: 400 });

  const priority = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(body?.priority))
    ? body.priority
    : 'MEDIUM';

  try {
    const task = await prisma.task.create({
      data: { title, priority, visionItemId: params.id },
    });
    await linkTaskToItem(params.id, task.id);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return Response.json({ error: { message: String(error) } }, { status: 500 });
  }
}
