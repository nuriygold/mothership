import { getV2TasksFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
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

