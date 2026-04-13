import { ensureV2Authorized } from '@/lib/v2/auth';
import { reorderVisionItems } from '@/lib/services/vision';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { pillarId, orderedIds } = body as { pillarId: string; orderedIds: string[] };
    if (!pillarId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
      return Response.json(
        { error: { code: 'INVALID_PAYLOAD', message: 'pillarId and non-empty orderedIds are required' } },
        { status: 400 }
      );
    }
    await reorderVisionItems(pillarId, orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'ITEMS_REORDER_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
