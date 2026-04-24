import { updateVisionPillar, deleteVisionPillar } from '@/lib/services/vision';
import { VisionPillarColor } from '@/lib/db/enums';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const pillar = await updateVisionPillar(params.id, {
      label: body.label,
      emoji: body.emoji,
      color: body.color as VisionPillarColor | undefined,
      sortOrder: body.sortOrder,
    });
    return Response.json({ pillar });
  } catch (error) {
    return Response.json(
      { error: { code: 'PILLAR_UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteVisionPillar(params.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'PILLAR_DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
