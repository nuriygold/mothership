import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const connectionString = process.env.DATABASE_URL ?? process.env.PRISMA_DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL (or PRISMA_DATABASE_URL) is required for Drizzle.');
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
