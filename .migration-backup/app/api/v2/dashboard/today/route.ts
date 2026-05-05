import { getV2TodayFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    return Response.json(await getV2TodayFeed());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TODAY_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load today feed',
        },
      },
      { status: 500 }
    );
  }
}

