import type { Config } from 'drizzle-kit';

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL (or DATABASE_MIGRATION_URL) must be set for drizzle-kit push.');
}

export default {
  schema: './src/lib/db/dispatch-schema.ts',
  out: './drizzle/mc',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
