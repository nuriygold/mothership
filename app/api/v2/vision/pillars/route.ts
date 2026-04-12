import { ensureV2Authorized } from '@/lib/v2/auth';
import { getOrCreateVisionBoard, createVisionPillar, listVisionPillars } from '@/lib/services/vision';
import { VisionPillarColor } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    const board = await getOrCreateVisionBoard();
    const pillars = await listVisionPillars(board.id);
    return Response.json({ pillars });
  } catch (error) {
    return Response.json(
      { error: { code: 'PILLARS_FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { label, emoji, color, sortOrder } = body as {
      label: string;
      emoji?: string;
      color?: VisionPillarColor;
      sortOrder?: number;
    };
    if (!label?.trim()) {
      return Response.json({ error: { code: 'MISSING_LABEL', message: 'label is required' } }, { status: 400 });
    }
    const board = await getOrCreateVisionBoard();
    const pillar = await createVisionPillar(board.id, { label, emoji, color, sortOrder });
    return Response.json({ pillar }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: { code: 'PILLAR_CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
