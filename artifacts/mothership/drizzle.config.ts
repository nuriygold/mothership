import type { Config } from 'drizzle-kit';

const url =
  process.env.DATABASE_MIGRATION_URL ??
  process.env.DATABASE_URL_POOLER_SESSION ??
  process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'No migration URL set (DATABASE_MIGRATION_URL / DATABASE_URL_POOLER_SESSION / DATABASE_URL).',
  );
}

export default {
  schema: './src/lib/db/dispatch-schema.ts',
  out: './drizzle/mc',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
