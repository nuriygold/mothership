import { ensureV2Authorized } from '@/lib/v2/auth';
import { getV2VisionBoardFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    return Response.json(await getV2VisionBoardFeed());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'VISION_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load vision board',
        },
      },
      { status: 500 }
    );
  }
}
