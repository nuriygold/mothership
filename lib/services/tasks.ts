import { prisma } from '@/lib/prisma';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { createTaskPoolIssue, isTaskPoolRepositorySource, listTaskPoolTasks, updateTaskPoolIssue } from '@/lib/integrations/task-pool';

async function resolveOwnerId(input: { ownerId?: string | null; ownerLogin?: string }) {
  if (input.ownerId !== undefined) return input.ownerId;
  if (input.ownerLogin === undefined) return undefined;

  const ownerLogin = input.ownerLogin.trim();
  if (!ownerLogin) throw new Error('ownerLogin cannot be empty');

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { equals: ownerLogin, mode: 'insensitive' } },
        { email: { equals: ownerLogin, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });

  if (user) return user.id;

  if (!ownerLogin.includes('@')) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true },
    });
    const byEmailPrefix = users.find((candidate) => {
      const prefix = candidate.email.split('@')[0];
      return prefix?.toLowerCase() === ownerLogin.toLowerCase();
    });
    if (byEmailPrefix) return byEmailPrefix.id;
  }

  throw new Error(`User not found for login "${ownerLogin}". Provide a valid username, email, or email prefix.`);
}

export async function listTasks() {
  if (isTaskPoolRepositorySource()) {
    const repositoryTasks = await listTaskPoolTasks();
    if (repositoryTasks) return repositoryTasks;
    return [];
  }

  return prisma.task.findMany({
    include: { workflow: true, owner: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTask(input: {
  title: string;
  description?: string;
  workflowId?: string | null;
  ownerId?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: Date | null;
}) {
  if (isTaskPoolRepositorySource()) {
    const repositoryTask = await createTaskPoolIssue(input);
    if (repositoryTask) return repositoryTask;
    throw new Error('Task-pool repository unavailable. Task creation is disabled in source-controlled mode.');
  }

  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      workflowId: input.workflowId ?? null,
      ownerId: input.ownerId ?? null,
      status: input.status ?? TaskStatus.TODO,
      priority: input.priority ?? TaskPriority.MEDIUM,
      dueAt: input.dueAt ?? null,
    },
  });
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

  return prisma.task.update({
    where: { id: input.id },
    data: {
      status: input.status,
      priority: input.priority,
      ownerId: resolvedOwnerId,
      dueAt: input.dueAt,
    },
    include: { workflow: true, owner: true },
  });
}
