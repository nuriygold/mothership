import { prisma } from '@/lib/prisma';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { createTaskPoolIssue, isTaskPoolRepositorySource, listTaskPoolTasks, updateTaskPoolIssue } from '@/lib/integrations/task-pool';

export async function listTasks() {
  if (isTaskPoolRepositorySource()) {
    const repositoryTasks = await listTaskPoolTasks();
    if (repositoryTasks) return repositoryTasks;
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
  ownerId?: string | null;
  dueAt?: Date | null;
}) {
  if (isTaskPoolRepositorySource()) {
    const repositoryTask = await updateTaskPoolIssue({
      id: input.id,
      status: input.status,
      priority: input.priority,
    });
    if (repositoryTask) return repositoryTask;
  }

  return prisma.task.update({
    where: { id: input.id },
    data: {
      status: input.status,
      priority: input.priority,
      ownerId: input.ownerId,
      dueAt: input.dueAt,
    },
    include: { workflow: true, owner: true },
  });
}
