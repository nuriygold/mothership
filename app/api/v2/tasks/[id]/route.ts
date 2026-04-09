import { ensureV2Authorized } from '@/lib/v2/auth';
import { mutateTaskFromAction } from '@/lib/v2/orchestrator';
import { updateTask } from '@/lib/services/tasks';

export const dynamic = 'force-dynamic';

type AssignableTask = {
  ownerName?: string | null;
  ownerId?: string | null;
  owner?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
};

function extractOwnerDisplayName(task: AssignableTask, fallback: string): string {
  return task.ownerName || task.owner?.name || task.owner?.email || fallback;
}

function extractOwnerId(task: AssignableTask): string | null {
  return task.ownerId ?? task.owner?.id ?? null;
}

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
      const updatedTask = await updateTask({ id: params.id, ownerLogin }) as AssignableTask;
      const assigned = extractOwnerDisplayName(updatedTask, ownerLogin);
      const ownerId = extractOwnerId(updatedTask);
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
