import { prisma } from '@/lib/prisma';
import { TaskPriority, TaskStatus } from '@prisma/client';

export async function listTasks() {
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
