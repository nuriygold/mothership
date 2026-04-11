import { ensureV2Authorized } from '@/lib/v2/auth';
import { resolveFinanceEvent } from '@/lib/finance/events';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';

    if (!id) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'id is required' } },
        { status: 400 }
      );
    }

    const event = await resolveFinanceEvent(id);
    return Response.json({ event });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'EVENT_RESOLVE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to resolve event',
        },
      },
      { status: 500 }
    );
  }
}
