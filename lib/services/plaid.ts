import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  RemovedTransaction,
} from 'plaid';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/utils/encryption';

function buildClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? 'sandbox';

  if (!clientId || !secret) throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');

  const config = new Configuration({
    basePath:
      PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  return new PlaidApi(config);
}

// ─── Link tokens ─────────────────────────────────────────────────────────────

export async function createLinkToken(updateAccessToken?: string): Promise<string> {
  const client = buildClient();
  const response = await client.linkTokenCreate({
    user: { client_user_id: 'mothership-user' },
    client_name: 'Mothership',
    language: 'en',
    country_codes: [CountryCode.Us],
    ...(updateAccessToken
      ? { access_token: updateAccessToken }
      : { products: [Products.Transactions] }),
  });
  return response.data.link_token;
}

// ─── Token exchange + initial account sync ───────────────────────────────────

export async function exchangePublicToken(
  publicToken: string,
  institutionName?: string,
): Promise<{ itemId: string }> {
  const client = buildClient();
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = response.data;

  const encryptedToken = encrypt(access_token);

  await prisma.plaidItem.upsert({
    where: { itemId: item_id },
    update: {
      accessToken: encryptedToken,
      institutionName: institutionName ?? undefined,
      status: 'good',
      errorCode: null,
    },
    create: {
      itemId: item_id,
      accessToken: encryptedToken,
      institutionName: institutionName ?? null,
    },
  });

  await syncAccountsForItem(access_token);

  return { itemId: item_id };
}

// ─── Account sync ─────────────────────────────────────────────────────────────

export async function syncAccountsForItem(accessToken: string): Promise<void> {
  const client = buildClient();
  const response = await client.accountsGet({ access_token: accessToken });

  for (const plaidAccount of response.data.accounts) {
    const type = mapPlaidType(plaidAccount.type, plaidAccount.subtype ?? undefined);
    const balance = plaidAccount.balances.current ?? plaidAccount.balances.available ?? 0;
    const name = plaidAccount.official_name ?? plaidAccount.name;

    await prisma.account.upsert({
      where: { id: plaidAccount.account_id },
      update: { balance, name, type },
      create: {
        id: plaidAccount.account_id,
        name,
        type,
        balance,
        liquid: type !== 'investment',
      },
    });
  }
}

// ─── Transaction sync ─────────────────────────────────────────────────────────

export async function syncTransactionsForItem(itemId: string): Promise<{ added: number; removed: number }> {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { itemId } });
  const accessToken = decrypt(item.accessToken);
  const client = buildClient();

  let cursor = item.cursor ?? undefined;
  let added = 0;
  let removed = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
    });
    const { data } = response;

    for (const tx of data.added) {
      const account = await prisma.account.findUnique({ where: { id: tx.account_id } });
      if (!account) continue;

      const amount = -(tx.amount); // Plaid amounts: positive = debit, we store debits as negative
      await prisma.transaction.upsert({
        where: { id: tx.transaction_id },
        update: { amount, description: tx.name, category: tx.personal_finance_category?.primary ?? null },
        create: {
          id: tx.transaction_id,
          accountId: tx.account_id,
          amount,
          description: tx.name,
          category: tx.personal_finance_category?.primary ?? null,
          occurredAt: new Date(tx.date),
        },
      });
      added++;
    }

    for (const tx of data.modified) {
      const amount = -(tx.amount);
      await prisma.transaction.updateMany({
        where: { id: tx.transaction_id },
        data: { amount, description: tx.name, category: tx.personal_finance_category?.primary ?? null },
      });
    }

    if (data.removed.length > 0) {
      const ids = (data.removed as RemovedTransaction[]).map((r) => r.transaction_id).filter(Boolean) as string[];
      await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
      removed += ids.length;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }

  await prisma.plaidItem.update({
    where: { itemId },
    data: { cursor, status: 'good', errorCode: null },
  });

  // Refresh account balances after transaction sync
  await syncAccountsForItem(accessToken);

  return { added, removed };
}

export async function syncAllItems(): Promise<{ itemId: string; added: number; removed: number; error?: string }[]> {
  const items = await prisma.plaidItem.findMany({ where: { status: { not: 'login_required' } } });
  return Promise.all(
    items.map(async (item) => {
      try {
        const result = await syncTransactionsForItem(item.itemId);
        return { itemId: item.itemId, ...result };
      } catch (err) {
        return { itemId: item.itemId, added: 0, removed: 0, error: err instanceof Error ? err.message : 'sync failed' };
      }
    }),
  );
}

// ─── Item removal ─────────────────────────────────────────────────────────────

export async function removeItem(itemId: string): Promise<void> {
  const item = await prisma.plaidItem.findUnique({ where: { itemId } });
  if (!item) return;

  try {
    const client = buildClient();
    await client.itemRemove({ access_token: decrypt(item.accessToken) });
  } catch {
    // If Plaid call fails we still remove locally
  }

  await prisma.plaidItem.delete({ where: { itemId } });
}

// ─── Status update (called after successful re-link) ──────────────────────────

export async function clearItemError(itemId: string): Promise<void> {
  await prisma.plaidItem.update({
    where: { itemId },
    data: { status: 'good', errorCode: null },
  });
}

export async function markItemError(itemId: string, errorCode: string, loginRequired: boolean): Promise<void> {
  await prisma.plaidItem.update({
    where: { itemId },
    data: { status: loginRequired ? 'login_required' : 'error', errorCode },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapPlaidType(type: string, subtype?: string): string {
  if (type === 'credit') return 'credit';
  if (type === 'loan') return 'loan';
  if (type === 'investment') return 'investment';
  if (subtype === 'savings') return 'checking';
  return 'checking';
}

export async function getAccessTokenForItem(itemId: string): Promise<string> {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { itemId } });
  return decrypt(item.accessToken);
}
