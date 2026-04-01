import { prisma } from '@/lib/prisma';
import { isTaskPoolRepositorySource, listTaskPoolActivityEvents } from '@/lib/integrations/task-pool';

export async function listAuditEvents(limit = 50) {
  if (isTaskPoolRepositorySource()) {
    const repositoryActivity = await listTaskPoolActivityEvents(limit);
    if (repositoryActivity) return repositoryActivity;
  }

  return prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
