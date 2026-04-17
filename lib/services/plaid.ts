import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import { prisma } from '@/lib/prisma';

function buildClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? 'sandbox';

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set');
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  return new PlaidApi(config);
}

export async function createLinkToken(): Promise<string> {
  const client = buildClient();
  const response = await client.linkTokenCreate({
    user: { client_user_id: 'mothership-user' },
    client_name: 'Mothership',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return response.data.link_token;
}

export async function exchangePublicToken(
  publicToken: string,
  institutionName?: string,
): Promise<{ itemId: string }> {
  const client = buildClient();
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token, item_id } = response.data;

  await prisma.plaidItem.upsert({
    where: { itemId: item_id },
    update: { accessToken: access_token, institutionName: institutionName ?? null },
    create: { itemId: item_id, accessToken: access_token, institutionName: institutionName ?? null },
  });

  await syncAccountsForItem(access_token);

  return { itemId: item_id };
}

export async function syncAccountsForItem(accessToken: string): Promise<void> {
  const client = buildClient();
  const response = await client.accountsGet({ access_token: accessToken });
  const accounts = response.data.accounts;

  for (const plaidAccount of accounts) {
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

function mapPlaidType(type: string, subtype?: string): string {
  if (type === 'credit') return 'credit';
  if (type === 'loan') return 'loan';
  if (type === 'investment') return 'investment';
  if (subtype === 'checking') return 'checking';
  if (subtype === 'savings') return 'checking';
  return 'checking';
}
