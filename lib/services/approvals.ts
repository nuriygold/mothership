import { desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import { approvals, tasks, users, workflows } from '@/lib/db/schema';
import { ApprovalDecision } from '@/lib/db/prisma-types';

type ApprovalRow = typeof approvals.$inferSelect;

function keyById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

async function hydrateApprovals(rows: ApprovalRow[]) {
  const workflowIds = rows.map((row) => row.workflowId).filter((id): id is string => Boolean(id));
  const taskIds = rows.map((row) => row.taskId).filter((id): id is string => Boolean(id));
  const userIds = rows
    .flatMap((row) => [row.requestedById, row.decidedById])
    .filter((id): id is string => Boolean(id));

  const [workflowRows, taskRows, userRows] = await Promise.all([
    workflowIds.length ? db.select().from(workflows).where(inArray(workflows.id, workflowIds)) : Promise.resolve([]),
    taskIds.length ? db.select().from(tasks).where(inArray(tasks.id, taskIds)) : Promise.resolve([]),
    userIds.length ? db.select().from(users).where(inArray(users.id, userIds)) : Promise.resolve([]),
  ]);

  const workflowById = keyById(workflowRows);
  const taskById = keyById(taskRows);
  const userById = keyById(userRows);

  return rows.map((row) => ({
    ...row,
    workflow: row.workflowId ? (workflowById.get(row.workflowId) ?? null) : null,
    task: row.taskId ? (taskById.get(row.taskId) ?? null) : null,
    requestedBy: row.requestedById ? (userById.get(row.requestedById) ?? null) : null,
    decidedBy: row.decidedById ? (userById.get(row.decidedById) ?? null) : null,
  }));
}

export async function listApprovals() {
  const rows = await db.select().from(approvals).orderBy(desc(approvals.createdAt));
  return hydrateApprovals(rows);
}

export async function requestApproval(input: {
  workflowId?: string | null;
  taskId?: string | null;
  requestedById?: string | null;
  reason?: string | null;
}) {
  const [created] = await db
    .insert(approvals)
    .values({
      id: randomUUID(),
      workflowId: input.workflowId ?? null,
      taskId: input.taskId ?? null,
      requestedById: input.requestedById ?? null,
      reason: input.reason ?? null,
    })
    .returning();

  const [approval] = await hydrateApprovals([created]);
  return approval;
}

export async function decideApproval(id: string, decision: ApprovalDecision, decidedById?: string | null) {
  const [updated] = await db
    .update(approvals)
    .set({
      status: decision,
      decidedById: decidedById ?? null,
      decidedAt: new Date(),
    })
    .where(eq(approvals.id, id))
    .returning();

  const [approval] = await hydrateApprovals([updated]);
  return approval;
}
