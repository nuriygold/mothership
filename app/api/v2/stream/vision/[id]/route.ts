import { ensureV2Authorized } from '@/lib/v2/auth';
import { sseResponse } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  return sseResponse(`vision-suggestions:${params.id}`);
}
