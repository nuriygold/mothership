import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function resolveDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.PRISMA_DATABASE_URL ?? process.env.DATABASE_POOLER_URL;
}

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getSql() {
  if (globalForDb.sql) return globalForDb.sql;

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error('DATABASE_URL (or PRISMA_DATABASE_URL / DATABASE_POOLER_URL) must be set.');
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
