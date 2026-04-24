import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';
import { isTaskPoolRepositorySource, listTaskPoolActivityEvents } from '@/lib/integrations/task-pool';

export async function listAuditEvents(limit = 50) {
  if (isTaskPoolRepositorySource()) {
    const repositoryActivity = await listTaskPoolActivityEvents(limit);
    if (repositoryActivity) return repositoryActivity;
    return [];
  }

  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
}

export async function createAuditEvent(input: {
  entityType: string;
  entityId: string;
  eventType: string;
  actorId?: string | null;
  metadata?: Record<string, any>;
}) {
  const [created] = await db
    .insert(auditEvents)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  return created;
}
