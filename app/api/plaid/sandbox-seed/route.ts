import { Configuration, PlaidApi, PlaidEnvironments, Products } from 'plaid';
import { exchangePublicToken, syncTransactionsForItem } from '@/lib/services/plaid';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;

  if (!clientId || !secret) {
    return Response.json(
      { error: 'PLAID_CLIENT_ID and PLAID_SECRET must be set in environment variables' },
      { status: 500 },
    );
  }

  if (!process.env.PLAID_ENCRYPTION_KEY) {
    return Response.json(
      { error: 'PLAID_ENCRYPTION_KEY must be set (64 hex chars)' },
      { status: 500 },
    );
  }

  // If an item already exists, sync it instead of creating a duplicate
  const existing = await prisma.plaidItem.findFirst();
  if (existing) {
    const result = await syncTransactionsForItem(existing.itemId);
    return Response.json({ seeded: false, synced: true, itemId: existing.itemId, ...result });
  }

  const config = new Configuration({
    basePath: PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });
  const client = new PlaidApi(config);

  // Programmatically create a sandbox item — no Plaid Link UI required
  const ptRes = await client.sandboxPublicTokenCreate({
    institution_id: 'ins_109508', // First Platypus Bank (standard sandbox)
    initial_products: [Products.Transactions],
  });

  const { itemId } = await exchangePublicToken(ptRes.data.public_token, 'First Platypus Bank');

  // Fire the TRANSACTIONS_SYNC_UPDATES_AVAILABLE webhook so Plaid prepares data
  try {
    await client.sandboxItemFireWebhook({
      access_token: await getAccessToken(itemId),
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
    });
  } catch {
    // Non-fatal — transactions/sync will still return data on next call
  }

  const result = await syncTransactionsForItem(itemId);

  return Response.json({ seeded: true, itemId, ...result });
}

async function getAccessToken(itemId: string): Promise<string> {
  const { decrypt } = await import('@/lib/utils/encryption');
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { itemId } });
  return decrypt(item.accessToken);
}
