import { getV2TasksFeed } from '@/lib/v2/orchestrator';
import { createTask } from '@/lib/services/tasks';
import { TaskPriority, TaskStatus } from '@/lib/db/enums';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    return Response.json(await getV2TasksFeed());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'TASKS_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load tasks',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, description, priority, status } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return Response.json(
        { error: { code: 'INVALID_INPUT', message: 'Title is required' } },
        { status: 400 }
      );
    }

    const task = await createTask({
      title: title.trim(),
      description: description?.trim() || undefined,
      priority: priority as TaskPriority || TaskPriority.MEDIUM,
      status: status as TaskStatus || TaskStatus.TODO,
    });

    return Response.json({ ok: true, task });
  } catch (error) {
    console.error('[tasks:create]', error);
    return Response.json(
      {
        error: {
          code: 'TASK_CREATE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to create task',
        },
      },
      { status: 500 }
    );
  }
}
