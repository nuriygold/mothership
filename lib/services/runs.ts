import { prisma } from '@/lib/prisma';
import type { InputJsonValue } from '@/lib/db/json';
import { RunStatus } from '@/lib/db/prisma-types';
import type { InputJsonValue } from '@/lib/db/json';
import { isTaskPoolRepositorySource } from '@/lib/integrations/task-pool';

export async function listRuns() {
  if (isTaskPoolRepositorySource()) {
    return [];
  }

  return prisma.run.findMany({
    include: { workflow: true, task: true, submission: true },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getRun(id: string) {
  if (isTaskPoolRepositorySource()) {
    return null;
  }

  return prisma.run.findUnique({
    where: { id },
    include: { workflow: true, task: true, submission: true, commands: true },
  });
}

export async function createRun(input: {
  workflowId?: string | null;
  taskId?: string | null;
  submissionId?: string | null;
  type: string;
  sourceSystem: string;
  status?: RunStatus;
  metadata?: InputJsonValue;
}) {
  return prisma.run.create({
    data: {
      workflowId: input.workflowId ?? null,
      taskId: input.taskId ?? null,
      submissionId: input.submissionId ?? null,
      type: input.type,
      sourceSystem: input.sourceSystem,
      status: input.status ?? RunStatus.QUEUED,
      metadata: (input.metadata ?? {}) as InputJsonValue,
      startedAt: new Date(),
    },
  });
}
