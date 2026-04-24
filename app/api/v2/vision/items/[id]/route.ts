import { getVisionItemWithLinks, updateVisionItem, deleteVisionItem } from '@/lib/services/vision';
import { VisionItemStatus } from '@/lib/db/prisma-types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const item = await getVisionItemWithLinks(params.id);
    if (!item) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Vision item not found' } }, { status: 404 });
    }
    return Response.json({ item });
  } catch (error) {
    return Response.json(
      { error: { code: 'ITEM_FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const item = await updateVisionItem(params.id, {
      title: body.title,
      description: body.description,
      status: body.status as VisionItemStatus | undefined,
      targetDate: body.targetDate,
      imageEmoji: body.imageEmoji,
      notes: body.notes,
      sortOrder: body.sortOrder,
    });
    return Response.json({ item });
  } catch (error) {
    return Response.json(
      { error: { code: 'ITEM_UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteVisionItem(params.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'ITEM_DELETE_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
