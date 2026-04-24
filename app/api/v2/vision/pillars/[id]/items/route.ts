import { createVisionItem } from '@/lib/services/vision';
import { VisionItemStatus } from '@/lib/db/prisma-types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { title, description, status, targetDate, imageEmoji, notes, sortOrder } = body as {
      title: string;
      description?: string;
      status?: VisionItemStatus;
      targetDate?: string;
      imageEmoji?: string;
      notes?: string;
      sortOrder?: number;
    };
    if (!title?.trim()) {
      return Response.json({ error: { code: 'MISSING_TITLE', message: 'title is required' } }, { status: 400 });
    }
    const item = await createVisionItem(params.id, {
      title, description, status, targetDate, imageEmoji, notes, sortOrder,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: { code: 'ITEM_CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
