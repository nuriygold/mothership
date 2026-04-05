import { ensureV2Authorized } from '@/lib/v2/auth';
import { approvePredictiveAction } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  const result = approvePredictiveAction(params.id);
  return Response.json(result, { status: result.status });
}

