import { defineConfig } from 'drizzle-kit';

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}

const connectionString = firstNonEmpty(
  process.env.DATABASE_POOLER_URL,
  process.env.DATABASE_URL_POOLER_TRANS,
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL_NON_POOLING,
  process.env.POSTGRES_URL,
  process.env.PRISMA_DATABASE_URL,
  process.env.DATABASE_URL_POOLER_SESSION
);

if (!connectionString) {
  throw new Error('A Postgres connection string is required for Drizzle.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: connectionString,
  },
  strict: true,
  verbose: true,
});
