import { removeItem, clearItemError } from '@/lib/services/plaid';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { itemId: string } },
) {
  try {
    await removeItem(params.itemId);
    return Response.json({ removed: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to remove item' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  _req: Request,
  { params }: { params: { itemId: string } },
) {
  try {
    await clearItemError(params.itemId);
    return Response.json({ updated: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to update item' },
      { status: 500 },
    );
  }
}
