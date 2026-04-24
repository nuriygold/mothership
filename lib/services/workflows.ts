import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { submissions, tasks, users, workflowSchemaVersions, workflows, runs } from '@/lib/db/schema';
import { Prisma, WorkflowStatus, WorkflowType } from '@/lib/db/prisma-types';
import { getTaskPoolWorkflow, isTaskPoolRepositorySource, listTaskPoolWorkflows } from '@/lib/integrations/task-pool';

function keyById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listWorkflows() {
  if (isTaskPoolRepositorySource()) {
    const repositoryWorkflows = await listTaskPoolWorkflows();
    if (repositoryWorkflows) return repositoryWorkflows;
    return [];
  }

  const rows = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      description: workflows.description,
      type: workflows.type,
      status: workflows.status,
      ownerId: workflows.ownerId,
      currentSchemaVersionId: workflows.currentSchemaVersionId,
      createdAt: workflows.createdAt,
      updatedAt: workflows.updatedAt,
      owner: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
    })
    .from(workflows)
    .leftJoin(users, eq(workflows.ownerId, users.id))
    .orderBy(desc(workflows.createdAt));

  const workflowIds = rows.map((row) => row.id);
  const schemaIds = rows
    .map((row) => row.currentSchemaVersionId)
    .filter((id): id is string => Boolean(id));

  const [schemaRows, submissionRows, taskRows, runRows] = await Promise.all([
    schemaIds.length
      ? db.select().from(workflowSchemaVersions).where(inArray(workflowSchemaVersions.id, schemaIds))
      : Promise.resolve([]),
    workflowIds.length
      ? db.select().from(submissions).where(inArray(submissions.workflowId, workflowIds)).orderBy(desc(submissions.submittedAt))
      : Promise.resolve([]),
    workflowIds.length
      ? db.select().from(tasks).where(inArray(tasks.workflowId, workflowIds)).orderBy(desc(tasks.createdAt))
      : Promise.resolve([]),
    workflowIds.length
      ? db.select().from(runs).where(inArray(runs.workflowId, workflowIds)).orderBy(desc(runs.startedAt))
      : Promise.resolve([]),
  ]);

  const schemaById = keyById(schemaRows);

  return rows.map((row) => ({
    ...row,
    currentSchemaVersion: row.currentSchemaVersionId ? (schemaById.get(row.currentSchemaVersionId) ?? null) : null,
    submissions: submissionRows.filter((submission) => submission.workflowId === row.id),
    tasks: taskRows.filter((task) => task.workflowId === row.id),
    runs: runRows.filter((run) => run.workflowId === row.id),
  }));
}

export async function getWorkflow(id: string) {
  if (isTaskPoolRepositorySource()) {
    if (!id.startsWith('tpw_')) return null;
    const repositoryWorkflow = await getTaskPoolWorkflow(id);
    if (repositoryWorkflow) return repositoryWorkflow;
    return null;
  }

  const [row] = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      description: workflows.description,
      type: workflows.type,
      status: workflows.status,
      ownerId: workflows.ownerId,
      currentSchemaVersionId: workflows.currentSchemaVersionId,
      createdAt: workflows.createdAt,
      updatedAt: workflows.updatedAt,
      owner: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
    })
    .from(workflows)
    .leftJoin(users, eq(workflows.ownerId, users.id))
    .where(eq(workflows.id, id))
    .limit(1);

  if (!row) return null;

  const [currentSchemaVersion, workflowSubmissions, workflowTasks, workflowRuns] = await Promise.all([
    row.currentSchemaVersionId
      ? db
          .select()
          .from(workflowSchemaVersions)
          .where(eq(workflowSchemaVersions.id, row.currentSchemaVersionId))
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db.select().from(submissions).where(eq(submissions.workflowId, id)).orderBy(desc(submissions.submittedAt)),
    db.select().from(tasks).where(eq(tasks.workflowId, id)).orderBy(desc(tasks.createdAt)),
    db.select().from(runs).where(eq(runs.workflowId, id)).orderBy(desc(runs.startedAt)),
  ]);

  return {
    ...row,
    currentSchemaVersion,
    submissions: workflowSubmissions,
    tasks: workflowTasks,
    runs: workflowRuns,
  };
}

export async function createWorkflow(input: {
  name: string;
  description?: string;
  type?: WorkflowType;
  ownerId: string;
  status?: WorkflowStatus;
  schemaJson?: Prisma.InputJsonValue;
}) {
  const [workflow] = await db
    .insert(workflows)
    .values({
      name: input.name,
      description: input.description,
      type: input.type ?? WorkflowType.STANDARD,
      status: input.status ?? WorkflowStatus.ACTIVE,
      ownerId: input.ownerId,
    })
    .returning();

  if (input.schemaJson) {
    const [schemaVersion] = await db
      .insert(workflowSchemaVersions)
      .values({
        workflowId: workflow.id,
        version: 1,
        schemaJson: input.schemaJson,
      })
      .returning();

    await db
      .update(workflows)
      .set({ currentSchemaVersionId: schemaVersion.id, updatedAt: new Date() })
      .where(eq(workflows.id, workflow.id));
  }

  return getWorkflow(workflow.id);
}
