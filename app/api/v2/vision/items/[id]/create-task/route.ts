import { linkTaskToItem } from '@/lib/services/vision';
import { prisma } from '@/lib/prisma';
import { createTaskPoolIssue, isTaskPoolRepositorySource } from '@/lib/integrations/task-pool';
import { TaskPriority } from '@prisma/client';

export const dynamic = 'force-dynamic';

const VISION_LABEL = 'domain: vision board';

export async function POST(req: Request, { params }: { params: { id: string } }) {

  const item = await prisma.visionItem.findUnique({ where: { id: params.id } });
  if (!item) return Response.json({ error: { message: 'Vision item not found' } }, { status: 404 });

  const body = await req.json();
  const title = String(body?.title ?? '').trim();
  if (!title) return Response.json({ error: { message: 'title required' } }, { status: 400 });

  const priority: TaskPriority = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(body?.priority))
    ? (body.priority as TaskPriority)
    : TaskPriority.MEDIUM;

  try {
    if (isTaskPoolRepositorySource()) {
      // Create the GitHub issue in the task pool with the vision board label
      const poolTask = await createTaskPoolIssue({
        title,
        priority,
        extraLabels: [VISION_LABEL],
      });
      if (!poolTask) {
        return Response.json({ error: { message: 'Task pool unavailable' } }, { status: 503 });
      }
      // Mirror into Prisma so the vision link can be stored
      const task = await prisma.task.create({
        data: { title, priority, visionItemId: params.id },
      });
      await linkTaskToItem(params.id, task.id);
      return Response.json({ task: poolTask }, { status: 201 });
    }

    // Database-only mode
    const task = await prisma.task.create({
      data: { title, priority, visionItemId: params.id },
    });
    await linkTaskToItem(params.id, task.id);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return Response.json({ error: { message: String(error) } }, { status: 500 });
  }
}
