import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents, commands, runs, users } from '@/lib/db/schema';
import { CommandStatus } from '@/lib/db/enums';

export async function listCommands(limit = 20) {
  return db
    .select({
      id: commands.id,
      input: commands.input,
      sourceChannel: commands.sourceChannel,
      requestedById: commands.requestedById,
      status: commands.status,
      runId: commands.runId,
      createdAt: commands.createdAt,
      completedAt: commands.completedAt,
      requestedBy: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
      run: {
        id: runs.id,
        workflowId: runs.workflowId,
        taskId: runs.taskId,
        type: runs.type,
        sourceSystem: runs.sourceSystem,
        status: runs.status,
        startedAt: runs.startedAt,
        completedAt: runs.completedAt,
        metadata: runs.metadata,
        errorMessage: runs.errorMessage,
        submissionId: runs.submissionId,
      },
    })
    .from(commands)
    .leftJoin(users, eq(commands.requestedById, users.id))
    .leftJoin(runs, eq(commands.runId, runs.id))
    .orderBy(desc(commands.createdAt))
    .limit(limit);
}

export async function createCommand(input: {
  input: string;
  sourceChannel: string;
  requestedById?: string | null;
}) {
  const [command] = await db
    .insert(commands)
    .values({
      id: randomUUID(),
      input: input.input,
      sourceChannel: input.sourceChannel,
      requestedById: input.requestedById ?? null,
      status: CommandStatus.RECEIVED,
    })
    .returning();

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'command',
    entityId: command.id,
    eventType: 'received',
    actorId: input.requestedById ?? null,
    metadata: { sourceChannel: input.sourceChannel },
  });

  return command;
}
