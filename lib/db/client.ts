import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';

function resolveDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.PRISMA_DATABASE_URL ?? process.env.DATABASE_POOLER_URL;
}

const connectionString = resolveDatabaseUrl();

if (!connectionString) {
  throw new Error('DATABASE_URL (or PRISMA_DATABASE_URL / DATABASE_POOLER_URL) must be set.');
}

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

export const sql = globalForDb.sql ?? postgres(connectionString, { prepare: false });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sql = sql;
}

export const db = drizzle(sql, { schema });
