import { ensureV2Authorized } from '@/lib/v2/auth';
import { mutateTaskFromAction } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as { action?: 'start' | 'defer' | 'complete' | 'unblock' };
    if (!body.action) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'action is required' } },
        { status: 400 }
      );
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

