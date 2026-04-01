import { prisma } from '@/lib/prisma';

export async function listAuditEvents(limit = 50) {
  return prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
