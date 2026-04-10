import { ensureV2Authorized } from '@/lib/v2/auth';
import { getV2TasksFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    return Response.json(await getV2TasksFeed());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TASKS_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load tasks',
        },
      },
      { status: 500 }
    );
  }
}

