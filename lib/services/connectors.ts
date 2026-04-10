import { prisma } from '@/lib/prisma';

export async function listConnectors() {
  return prisma.connector.findMany({ orderBy: { createdAt: 'desc' } });
}
