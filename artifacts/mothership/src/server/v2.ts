import { getV2TasksFeed } from './v2.tasks-feed.js';

export { getV2TasksFeed };

export type CreateTaskInput = {
  title: string;
  description?: string;
};

export type PatchTaskInput = {
  action?: 'start' | 'defer' | 'complete' | 'unblock' | 'vision_board' | 'block' | 'assign';
  ownerLogin?: string;
};

export async function createV2Task(input: CreateTaskInput) {
  const { createTask } = await import('../lib/services/tasks.js');
  return createTask({
    title: input.title,
    description: input.description,
  });
}

export async function patchV2Task(taskId: string, input: PatchTaskInput) {
  switch (input.action) {
    case 'start':
    case 'defer':
    case 'complete':
    case 'unblock':
    case 'vision_board': {
      const { mutateTaskFromAction } = await import('../lib/v2/orchestrator.js');
      await mutateTaskFromAction(taskId, input.action);
      return;
    }
    case 'block': {
      const [{ updateTask }, { TaskStatus }] = await Promise.all([
        import('../lib/services/tasks.js'),
        import('../lib/db/enums.js'),
      ]);
      await updateTask({ id: taskId, status: TaskStatus.BLOCKED });
      return;
    }
    case 'assign': {
      if (!input.ownerLogin?.trim()) {
        throw new Error('ownerLogin is required when action is "assign".');
      }
      const { updateTask } = await import('../lib/services/tasks.js');
      await updateTask({ id: taskId, ownerLogin: input.ownerLogin.trim() });
      return;
    }
    case undefined:
      throw new Error('action is required.');
    default:
      throw new Error(`Unsupported action: ${String(input.action)}`);
  }
}
