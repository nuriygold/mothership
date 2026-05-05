import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/dispatch-schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    '[ops/engine] DATABASE_URL is not set — the engine cannot connect to Postgres.',
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
