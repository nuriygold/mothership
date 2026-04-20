import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const url = process.env.DATABASE_POOLER_URL ?? process.env.DATABASE_URL;

export const prisma =
  global.prisma ||
  new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
