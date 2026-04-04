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

export async function createAuditEvent(input: {
  entityType: string;
  entityId: string;
  eventType: string;
  actorId?: string | null;
  metadata?: Record<string, any>;
}) {
  return prisma.auditEvent.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      metadata: (input.metadata ?? {}) as any,
    },
  });
}
