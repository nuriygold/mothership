import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function resolveDatabaseUrl() {
  return firstNonEmpty(
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.PRISMA_DATABASE_URL,
    process.env.DATABASE_POOLER_URL,
    process.env.DATABASE_URL_POOLER_TRANS,
    process.env.DATABASE_URL_POOLER_SESSION
  );
}

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getSql() {
  if (globalForDb.sql) return globalForDb.sql;

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error('A Postgres connection string must be set.');
  }

  const client = postgres(connectionString, { prepare: false });
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.sql = client;
  }
  return client;
}

export function getDb() {
  if (globalForDb.db) return globalForDb.db;
  const client = drizzle(getSql(), { schema });
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.db = client;
  }
  return client;
}

export const sql = new Proxy({} as ReturnType<typeof postgres>, {
  get(_target, prop) {
    const resolved = getSql() as unknown as Record<PropertyKey, unknown>;
    const value = resolved[prop];
    return typeof value === 'function' ? value.bind(getSql()) : value;
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const resolved = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = resolved[prop];
    return typeof value === 'function' ? value.bind(getDb()) : value;
  },
});
