import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function ensureSslMode(connectionString: string): string {
  if (!connectionString.includes('supabase.co')) return connectionString;
  if (connectionString.includes('sslmode=')) return connectionString;

  const separator = connectionString.includes('?') ? '&' : '?';
  return `${connectionString}${separator}sslmode=require`;
}

function resolveDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;

  const poolerUrl = process.env.DATABASE_POOLER_URL ?? process.env.SUPABASE_POOLER_URL;
  const isDirectSupabaseHost = databaseUrl.includes('.supabase.co:5432');

  if (isDirectSupabaseHost && poolerUrl) {
    return ensureSslMode(poolerUrl);
  }

  return ensureSslMode(databaseUrl);
}

const resolvedDatabaseUrl = resolveDatabaseUrl();

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: resolvedDatabaseUrl
      ? {
          db: {
            url: resolvedDatabaseUrl,
          },
        }
      : undefined,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
