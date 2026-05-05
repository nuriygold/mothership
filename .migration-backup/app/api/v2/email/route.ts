import { getV2EmailFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    return Response.json(await getV2EmailFeed());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'EMAIL_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load email feed',
        },
      },
      { status: 500 }
    );
  }
}

