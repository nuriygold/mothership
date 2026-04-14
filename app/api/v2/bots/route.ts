import { getV2BotsFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    return Response.json(await getV2BotsFeed());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'BOTS_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load bots',
        },
      },
      { status: 500 }
    );
  }
}

