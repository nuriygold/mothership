import { ensureV2Authorized } from '@/lib/v2/auth';
import { getOrCreateVisionBoard, reorderVisionPillars } from '@/lib/services/vision';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { orderedIds } = body as { orderedIds: string[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return Response.json(
        { error: { code: 'INVALID_PAYLOAD', message: 'orderedIds must be a non-empty array' } },
        { status: 400 }
      );
    }
    const board = await getOrCreateVisionBoard();
    await reorderVisionPillars(board.id, orderedIds);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'PILLARS_REORDER_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
