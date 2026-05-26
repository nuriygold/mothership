import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/dispatch-schema';

const url =
  process.env.SUPABASE_DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL_POOLER_TRANS ??
  process.env.DATABASE_URL_POOLER_SESSION ??
  process.env.DATABASE_POOLER_URL ??
  process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    '[ops/engine] No Postgres URL set (SUPABASE_DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL / DATABASE_URL_POOLER_TRANS / DATABASE_URL_POOLER_SESSION / DATABASE_POOLER_URL / DATABASE_URL).',
  );
}

const isSupabasePooler = /pooler\.supabase\.com/.test(url) || /:6543\b/.test(url);

const client = postgres(url, {
  max: 8,
  idle_timeout: 30,
  prepare: !isSupabasePooler,
});

export const sql = client;
export const db = drizzle(client, { schema });
export { schema };
