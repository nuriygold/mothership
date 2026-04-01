import { prisma } from '@/lib/prisma';
import { RunStatus } from '@prisma/client';

export async function listRuns() {
  return prisma.run.findMany({
    include: { workflow: true, task: true, submission: true },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getRun(id: string) {
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
  metadata?: Record<string, unknown>;
}) {
  return prisma.run.create({
    data: {
      workflowId: input.workflowId ?? null,
      taskId: input.taskId ?? null,
      submissionId: input.submissionId ?? null,
      type: input.type,
      sourceSystem: input.sourceSystem,
      status: input.status ?? RunStatus.QUEUED,
      metadata: input.metadata ?? {},
      startedAt: new Date(),
    },
  });
}
