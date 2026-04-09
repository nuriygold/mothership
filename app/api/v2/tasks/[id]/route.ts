import { ensureV2Authorized } from '@/lib/v2/auth';
import { mutateTaskFromAction } from '@/lib/v2/orchestrator';
import { updateTask } from '@/lib/services/tasks';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as { action?: 'start' | 'defer' | 'complete' | 'unblock' | 'assign'; ownerLogin?: string };
    if (!body.action) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action is required' } },
        { status: 400 }
      );
    }

    if (body.action === 'assign') {
      const ownerLogin = body.ownerLogin?.trim();
      if (!ownerLogin) {
        return Response.json(
          { error: { code: 'VALIDATION_ERROR', message: 'ownerLogin is required for assign' } },
          { status: 400 }
        );
      }
      const updatedTask = await updateTask({ id: params.id, ownerLogin });
      const assigned =
        (typeof (updatedTask as { ownerName?: unknown }).ownerName === 'string' && (updatedTask as { ownerName?: string }).ownerName) ||
        (typeof (updatedTask as { owner?: { name?: unknown } }).owner?.name === 'string' && (updatedTask as { owner?: { name?: string } }).owner?.name) ||
        (typeof (updatedTask as { owner?: { email?: unknown } }).owner?.email === 'string' && (updatedTask as { owner?: { email?: string } }).owner?.email) ||
        ownerLogin;
      const ownerId =
        (updatedTask as { ownerId?: string | null }).ownerId ??
        (updatedTask as { owner?: { id?: string | null } }).owner?.id ??
        null;
      return Response.json({ ok: true, assigned, ownerId });
    }

    await mutateTaskFromAction(params.id, body.action);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TASK_MUTATION_FAILED',
          message: error instanceof Error ? error.message : 'Task update failed',
        },
      },
      { status: 500 }
    );
  }
}
