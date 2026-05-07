import type { Config } from 'drizzle-kit';

const url =
  process.env.SUPABASE_DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL_POOLER_SESSION ??
  process.env.DATABASE_URL_POOLER_TRANS ??
  process.env.DATABASE_POOLER_URL ??
  process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'No database URL set (SUPABASE_DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL / DATABASE_MIGRATION_URL / DATABASE_URL_POOLER_SESSION / DATABASE_URL_POOLER_TRANS / DATABASE_POOLER_URL / DATABASE_URL).',
  );
}

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle/mc',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
