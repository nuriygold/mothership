import https from 'node:https';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { eq, ne, inArray } from 'drizzle-orm';
import { encrypt, decrypt } from '@/lib/utils/encryption';

type TellerEnvironment = 'sandbox' | 'development' | 'production';

type TellerAccount = {
  id: string;
  name: string;
  subtype?: string | null;
  type?: string | null;
  currency?: string | null;
  balances?: {
    available?: number | null;
    ledger?: number | null;
  } | null;
  institution?: {
    name?: string | null;
  } | null;
};

type TellerTransaction = {
  id: string;
  account_id?: string;
  description?: string | null;
  details?: {
    category?: string | null;
    processing_status?: string | null;
  } | null;
  amount?: string | number | null;
  date?: string | null;
};

function getTellerBaseUrl(): string {
  const env = (process.env.TELLER_ENV ?? 'sandbox') as TellerEnvironment;
  return env === 'production' ? 'https://api.teller.io' : 'https://api.teller.io';
}

function getTellerMtlsAgent(): https.Agent | undefined {
  const env = (process.env.TELLER_ENV ?? 'sandbox') as TellerEnvironment;
  if (env === 'sandbox') return undefined;

  const cert = process.env.TELLER_CERT_PEM;
  const key = process.env.TELLER_KEY_PEM;
  if (!cert || !key) {
    throw new Error('TELLER_CERT_PEM and TELLER_KEY_PEM must be set when TELLER_ENV is development or production');
  }

  return new https.Agent({ cert, key });
}

function getTellerApplicationId(): string {
  const applicationId = process.env.TELLER_APPLICATION_ID;
  if (!applicationId) throw new Error('TELLER_APPLICATION_ID must be set');
  return applicationId;
}

function getAppUrl(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL must be set');
  return appUrl.replace(/\/$/, '');
}

function getEncryptionKey(): string {
  const key = process.env.TELLER_ENCRYPTION_KEY ?? process.env.TELLER_ENCRYPTION_KEY;
  if (!key) throw new Error('TELLER_ENCRYPTION_KEY must be set');
  return key;
}

function getAuthHeaders(token: string): Record<string, string> {
  const basic = Buffer.from(`${token}:`).toString('base64');
  return {
    Authorization: `Basic ${basic}`,
    Accept: 'application/json',
  };
}

async function tellerRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const baseUrl = new URL(`${getTellerBaseUrl()}${path}`);
  const agent = getTellerMtlsAgent();
  const headers: Record<string, string> = {
    ...getAuthHeaders(token),
  };
  if (init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)) {
    Object.assign(headers, init.headers as Record<string, string>);
  }

  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = https.request(
      {
        method: init?.method ?? 'GET',
        protocol: baseUrl.protocol,
        hostname: baseUrl.hostname,
        port: baseUrl.port || undefined,
        path: `${baseUrl.pathname}${baseUrl.search}`,
        headers,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 500,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    request.on('error', reject);

    if (init?.body) {
      if (typeof init.body === 'string' || Buffer.isBuffer(init.body)) {
        request.write(init.body);
      } else {
        reject(new Error('Unsupported Teller request body type'));
        return;
      }
    }

    request.end();
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Teller request failed (${response.statusCode}): ${response.body}`);
  }

  return JSON.parse(response.body) as T;
}

async function fetchAccounts(token: string): Promise<TellerAccount[]> {
  return tellerRequest<TellerAccount[]>('/accounts', token);
}

async function fetchAccountBalances(token: string, accountId: string): Promise<TellerAccount['balances']> {
  return tellerRequest<TellerAccount['balances']>(`/accounts/${accountId}/balances`, token);
}

async function fetchTransactions(token: string, accountId: string): Promise<TellerTransaction[]> {
  return tellerRequest<TellerTransaction[]>(`/accounts/${accountId}/transactions`, token);
}

function toNumberAmount(amount: string | number | null | undefined): number {
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string') {
    const parsed = Number(amount);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapTellerType(type?: string | null, subtype?: string | null): string {
  const normalizedType = (type ?? '').toLowerCase();
  const normalizedSubtype = (subtype ?? '').toLowerCase();
  if (normalizedType.includes('credit')) return 'credit';
  if (normalizedType.includes('loan')) return 'loan';
  if (normalizedType.includes('investment')) return 'investment';
  if (normalizedSubtype.includes('saving')) return 'checking';
  return 'checking';
}

export async function createLinkToken(updateAccessToken?: string): Promise<string> {
  const applicationId = getTellerApplicationId();
  const appUrl = getAppUrl();
  const state = updateAccessToken ?? crypto.randomUUID();
  const enrollPath = updateAccessToken ? 'connect' : 'connect';
  return `${appUrl}/api/teller/${enrollPath}?application_id=${encodeURIComponent(applicationId)}&state=${encodeURIComponent(state)}`;
}

export async function exchangePublicToken(
  publicToken: string,
  institutionName?: string,
): Promise<{ itemId: string }> {
  process.env.TELLER_ENCRYPTION_KEY = process.env.TELLER_ENCRYPTION_KEY ?? getEncryptionKey();

  const accessToken = publicToken;
  const accounts = await fetchAccounts(accessToken);
  if (accounts.length === 0) throw new Error('Teller returned no accounts');

  const primary = accounts[0];
  const itemId = primary.id;
  const encryptedToken = encrypt(accessToken);

  await db.insert(schema.tellerItems).values({
    id: crypto.randomUUID(),
    itemId,
    accessToken: encryptedToken,
    institutionName: institutionName ?? primary.institution?.name ?? 'Teller',
    status: 'good',
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.tellerItems.itemId,
    set: {
      accessToken: encryptedToken,
      institutionName: institutionName ?? primary.institution?.name ?? 'Teller',
      status: 'good',
      errorCode: null,
      updatedAt: new Date(),
    },
  });

  await syncAccountsForItem(accessToken);

  return { itemId };
}

export async function syncAccountsForItem(accessToken: string): Promise<void> {
  const accounts = await fetchAccounts(accessToken);

  for (const account of accounts) {
    const balances = await fetchAccountBalances(accessToken, account.id);
    const type = mapTellerType(account.type, account.subtype);
    const balance = balances?.ledger ?? balances?.available ?? account.balances?.ledger ?? account.balances?.available ?? 0;
    const name = account.name;

    await db.insert(schema.accounts).values({
      id: account.id,
      name,
      type,
      balance,
      liquid: type !== 'investment',
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: schema.accounts.id,
      set: {
        balance,
        name,
        type,
        updatedAt: new Date(),
      },
    });
  }
}

export async function syncTransactionsForItem(itemId: string): Promise<{ added: number; removed: number }> {
  const item = await db.query.tellerItems.findFirst({
    where: eq(schema.tellerItems.itemId, itemId),
  });
  if (!item) throw new Error(`Teller item ${itemId} not found`);

  process.env.TELLER_ENCRYPTION_KEY = process.env.TELLER_ENCRYPTION_KEY ?? getEncryptionKey();
  const accessToken = decrypt(item.accessToken);
  const accounts = await fetchAccounts(accessToken);
  const accountIds = accounts.map((account) => account.id);

  let added = 0;

  for (const account of accounts) {
    const transactions = await fetchTransactions(accessToken, account.id);

    for (const tx of transactions) {
      const amount = -toNumberAmount(tx.amount);
      const occurredAt = tx.date ? new Date(tx.date) : new Date();

      await db.insert(schema.transactions).values({
        id: tx.id,
        accountId: account.id,
        amount,
        description: tx.description ?? 'Teller transaction',
        category: tx.details?.category ?? null,
        occurredAt,
      }).onConflictDoUpdate({
        target: schema.transactions.id,
        set: {
          amount,
          description: tx.description ?? 'Teller transaction',
          category: tx.details?.category ?? null,
        },
      });
      added += 1;
    }
  }

  let removed = 0;
  if (accountIds.length > 0) {
    const existing = await db.query.transactions.findMany({
      where: inArray(schema.transactions.accountId, accountIds),
    });
    const liveIds = new Set<string>();
    for (const account of accounts) {
      const transactions = await fetchTransactions(accessToken, account.id);
      for (const tx of transactions) liveIds.add(tx.id);
    }
    const staleIds = existing.map((tx) => tx.id).filter((id) => !liveIds.has(id));
    if (staleIds.length > 0) {
      await db.delete(schema.transactions).where(inArray(schema.transactions.id, staleIds));
      removed = staleIds.length;
    }
  }

  await db.update(schema.tellerItems)
    .set({
      cursor: null,
      status: 'good',
      errorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tellerItems.itemId, itemId));

  await syncAccountsForItem(accessToken);

  return { added, removed };
}

export async function syncAllItems(): Promise<{ itemId: string; added: number; removed: number; error?: string }[]> {
  const items = await db.query.tellerItems.findMany({
    where: ne(schema.tellerItems.status, 'login_required'),
  });
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

export async function removeItem(itemId: string): Promise<void> {
  await db.delete(schema.tellerItems).where(eq(schema.tellerItems.itemId, itemId));
}

export async function clearItemError(itemId: string): Promise<void> {
  await db.update(schema.tellerItems)
    .set({
      status: 'good',
      errorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.tellerItems.itemId, itemId));
}

export async function markItemError(itemId: string, errorCode: string, loginRequired: boolean): Promise<void> {
  await db.update(schema.tellerItems)
    .set({
      status: loginRequired ? 'login_required' : 'error',
      errorCode,
      updatedAt: new Date(),
    })
    .where(eq(schema.tellerItems.itemId, itemId));
}

export async function getAccessTokenForItem(itemId: string): Promise<string> {
  process.env.TELLER_ENCRYPTION_KEY = process.env.TELLER_ENCRYPTION_KEY ?? getEncryptionKey();
  const item = await db.query.tellerItems.findFirst({
    where: eq(schema.tellerItems.itemId, itemId),
  });
  if (!item) throw new Error(`Teller item ${itemId} not found`);
  return decrypt(item.accessToken);
}
