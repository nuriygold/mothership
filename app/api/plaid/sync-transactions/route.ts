import { syncAllItems, syncTransactionsForItem } from '@/lib/services/plaid';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { itemId } = body as { itemId?: string };

    if (itemId) {
      const result = await syncTransactionsForItem(itemId);
      return Response.json(result);
    }

    const results = await syncAllItems();
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
