import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function describeDatabase(url?: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      db: parsed.pathname.replace(/^\//, ''),
      port: parsed.port || (parsed.protocol === 'postgresql:' ? '5432' : ''),
    };
  } catch {
    return null;
  }
}

function resolveDatabaseUrl() {
  const explicit = process.env.PRISMA_DATABASE_URL;
  const direct = process.env.DATABASE_URL;
  const pooler = process.env.DATABASE_POOLER_URL;
  const resolved = explicit ?? direct ?? pooler;

  const directInfo = describeDatabase(direct);
  const poolerInfo = describeDatabase(pooler);
  if (
    process.env.NODE_ENV !== 'production' &&
    directInfo &&
    poolerInfo &&
    (directInfo.host !== poolerInfo.host || directInfo.db !== poolerInfo.db)
  ) {
    console.warn(
      `[prisma] DATABASE_URL (${directInfo.host}/${directInfo.db}) and DATABASE_POOLER_URL (${poolerInfo.host}/${poolerInfo.db}) differ. ` +
      `Using ${explicit ? 'PRISMA_DATABASE_URL' : direct ? 'DATABASE_URL' : 'DATABASE_POOLER_URL'} to avoid cross-database drift.`
    );
  }

  return resolved;
}

const url = resolveDatabaseUrl();

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
