import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks, users, workflows } from '@/lib/db/schema';
import { TaskPriority, TaskStatus } from '@/lib/db/enums';
import { createTaskPoolIssue, isTaskPoolRepositorySource, listTaskPoolTasks, updateTaskPoolIssue } from '@/lib/integrations/task-pool';
import { randomUUID } from 'node:crypto';

async function resolveOwnerId(input: { ownerId?: string | null; ownerLogin?: string }) {
  if (input.ownerId !== undefined) return input.ownerId;
  if (input.ownerLogin === undefined) return undefined;

  const ownerLogin = input.ownerLogin.trim();
  if (!ownerLogin) throw new Error('ownerLogin cannot be empty');
  const canUseEmailPrefixLookup = !ownerLogin.includes('@') && /^[a-zA-Z0-9._-]+$/.test(ownerLogin);

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      or(
        ilike(users.name, ownerLogin),
        ilike(users.email, ownerLogin),
        ...(canUseEmailPrefixLookup ? [ilike(users.email, `${ownerLogin}@%`)] : [])
      )!
    )
    .limit(1);

  if (user) return user.id;

  throw new Error(`User not found for login "${ownerLogin}". Provide a valid username, email, or email prefix.`);
}

async function selectTaskRows(where?: ReturnType<typeof eq>) {
  return db
    .select({
      id: tasks.id,
      workflowId: tasks.workflowId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      ownerId: tasks.ownerId,
      assignee: tasks.assignee,
      dueAt: tasks.dueAt,
      visionItemId: tasks.visionItemId,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      owner: {
        id: users.id,
        email: users.email,
        name: users.name,
      },
      workflow: {
        id: workflows.id,
        name: workflows.name,
        description: workflows.description,
        status: workflows.status,
        type: workflows.type,
      },
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.ownerId, users.id))
    .leftJoin(workflows, eq(tasks.workflowId, workflows.id))
    .where(where)
    .orderBy(desc(tasks.createdAt));
}

export async function listTasks() {
  if (isTaskPoolRepositorySource()) {
    const repositoryTasks = await listTaskPoolTasks();
    if (repositoryTasks) return repositoryTasks;
    return [];
  }

  try {
    return await selectTaskRows();
  } catch (err) {
    console.warn('[listTasks] DB query failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function createTask(input: {
  title: string;
  description?: string;
  workflowId?: string | null;
  ownerId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: Date | null;
  visionItemId?: string | null;
}) {
  if (isTaskPoolRepositorySource()) {
    const repositoryTask = await createTaskPoolIssue(input);
    if (repositoryTask) return repositoryTask;
    throw new Error('Task-pool repository unavailable. Task creation is disabled in source-controlled mode.');
  }

  const [created] = await db
    .insert(tasks)
    .values({
      id: randomUUID(),
      title: input.title,
      description: input.description,
      workflowId: input.workflowId ?? null,
      ownerId: input.ownerId ?? null,
      status: input.status ?? TaskStatus.TODO,
      priority: input.priority ?? TaskPriority.MEDIUM,
      dueAt: input.dueAt ?? null,
      visionItemId: input.visionItemId ?? null,
      updatedAt: new Date(),
    })
    .returning({ id: tasks.id });

  const [task] = await selectTaskRows(eq(tasks.id, created.id));
  return task;
}

export async function updateTask(input: {
  id: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  ownerLogin?: string;
  ownerId?: string | null;
  dueAt?: Date | null;
}) {
  if (isTaskPoolRepositorySource()) {
    const repositoryTask = await updateTaskPoolIssue({
      id: input.id,
      status: input.status,
      priority: input.priority,
      ownerLogin: input.ownerLogin,
    });
    if (repositoryTask) return repositoryTask;
    throw new Error('Task-pool repository unavailable. Task updates are disabled in source-controlled mode.');
  }

  const resolvedOwnerId = await resolveOwnerId({ ownerId: input.ownerId, ownerLogin: input.ownerLogin });

  const updates: Partial<typeof tasks.$inferInsert> = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (resolvedOwnerId !== undefined) updates.ownerId = resolvedOwnerId;
  if (input.dueAt !== undefined) updates.dueAt = input.dueAt;
  updates.updatedAt = new Date();

  await db.update(tasks).set(updates).where(eq(tasks.id, input.id));

  const [task] = await selectTaskRows(eq(tasks.id, input.id));
  return task;
}
