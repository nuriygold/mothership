import { ensureV2Authorized } from '@/lib/v2/auth';
import { getV2Activity } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const page = Number(url.searchParams.get('page') || '1');
  const pageSize = Number(url.searchParams.get('pageSize') || '25');

  try {
    return Response.json(await getV2Activity(page, pageSize));
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'ACTIVITY_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load activity log',
        },
      },
      { status: 500 }
    );
  }
}

