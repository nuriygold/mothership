import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { commands, runs, submissions, tasks, workflows } from '@/lib/db/schema';
import { Prisma, RunStatus } from '@/lib/db/prisma-types';
import { isTaskPoolRepositorySource } from '@/lib/integrations/task-pool';

export async function listRuns() {
  if (isTaskPoolRepositorySource()) {
    return [];
  }

  return db
    .select({
      id: runs.id,
      workflowId: runs.workflowId,
      taskId: runs.taskId,
      submissionId: runs.submissionId,
      type: runs.type,
      sourceSystem: runs.sourceSystem,
      status: runs.status,
      startedAt: runs.startedAt,
      completedAt: runs.completedAt,
      metadata: runs.metadata,
      errorMessage: runs.errorMessage,
      workflow: {
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        status: workflows.status,
        type: workflows.type,
      },
      task: {
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
      },
      submission: {
        id: submissions.id,
        sourceChannel: submissions.sourceChannel,
        validationStatus: submissions.validationStatus,
      },
    })
    .from(runs)
    .leftJoin(workflows, eq(runs.workflowId, workflows.id))
    .leftJoin(tasks, eq(runs.taskId, tasks.id))
    .leftJoin(submissions, eq(runs.submissionId, submissions.id))
    .orderBy(desc(runs.startedAt));
}

export async function getRun(id: string) {
  if (isTaskPoolRepositorySource()) {
    return null;
  }

  const [run] = await db
    .select({
      id: runs.id,
      workflowId: runs.workflowId,
      taskId: runs.taskId,
      submissionId: runs.submissionId,
      type: runs.type,
      sourceSystem: runs.sourceSystem,
      status: runs.status,
      startedAt: runs.startedAt,
      completedAt: runs.completedAt,
      metadata: runs.metadata,
      errorMessage: runs.errorMessage,
      workflow: {
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        status: workflows.status,
        type: workflows.type,
      },
      task: {
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
      },
      submission: {
        id: submissions.id,
        sourceChannel: submissions.sourceChannel,
        validationStatus: submissions.validationStatus,
      },
    })
    .from(runs)
    .leftJoin(workflows, eq(runs.workflowId, workflows.id))
    .leftJoin(tasks, eq(runs.taskId, tasks.id))
    .leftJoin(submissions, eq(runs.submissionId, submissions.id))
    .where(eq(runs.id, id))
    .limit(1);

  if (!run) return null;

  const runCommands = await db.select().from(commands).where(eq(commands.runId, id)).orderBy(desc(commands.createdAt));
  return { ...run, commands: runCommands };
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
  const [created] = await db
    .insert(runs)
    .values({
      workflowId: input.workflowId ?? null,
      taskId: input.taskId ?? null,
      submissionId: input.submissionId ?? null,
      type: input.type,
      sourceSystem: input.sourceSystem,
      status: input.status ?? RunStatus.QUEUED,
      metadata: input.metadata ?? {},
      startedAt: new Date(),
    })
    .returning({ id: runs.id });

  return getRun(created.id);
}
