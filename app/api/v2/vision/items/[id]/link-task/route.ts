import { ensureV2Authorized } from '@/lib/v2/auth';
import { linkTaskToItem, unlinkTaskFromItem } from '@/lib/services/vision';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  const { taskId } = await req.json();
  if (!taskId) return Response.json({ error: { message: 'taskId required' } }, { status: 400 });
  try {
    await linkTaskToItem(params.id, String(taskId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: { message: String(error) } }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  const { taskId } = await req.json();
  if (!taskId) return Response.json({ error: { message: 'taskId required' } }, { status: 400 });
  try {
    await unlinkTaskFromItem(params.id, String(taskId));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: { message: String(error) } }, { status: 500 });
  }
}
