import { TaskPriority, TaskStatus } from '../lib/db/enums.js';
import { db } from '../lib/db/client.js';
import * as schema from '../lib/db/schema.js';
import { getAppTimezone } from '@/lib/config/runtime';
import { listTasks } from '../lib/services/tasks.js';
import type { V2TaskItem, V2TasksFeed } from '../lib/v2/types.js';

function mapTaskStatus(status: TaskStatus): V2TaskItem['status'] {
  switch (status) {
    case TaskStatus.IN_PROGRESS:
      return 'Active';
    case TaskStatus.BLOCKED:
      return 'Blocked';
    case TaskStatus.DONE:
      return 'Done';
    case TaskStatus.TODO:
    default:
      return 'Queued';
  }
}

function mapTaskPriority(priority: TaskPriority): V2TaskItem['metadata']['priority'] {
  switch (priority) {
    case TaskPriority.LOW:
      return 'low';
    case TaskPriority.HIGH:
      return 'high';
    case TaskPriority.CRITICAL:
      return 'critical';
    case TaskPriority.MEDIUM:
    default:
      return 'medium';
  }
}

function routeForTask(task: any): string {
  const assignee = String(task.assignee ?? '').toLowerCase().trim();
  const title = String(task.title ?? '').toLowerCase();
  const description = String(task.description ?? '').toLowerCase();
  const workflow = String(task.workflow?.name ?? '').toLowerCase();
  const haystack = `${title} ${description} ${workflow}`;

  if (assignee.includes('ruby') || /email|message|text|follow up|follow-up|reach out/.test(haystack)) return 'ruby';
  if (assignee.includes('emerald') || /finance|budget|cash|revenue|invoice|expense/.test(haystack)) return 'emerald';
  if (assignee.includes('adobe') || /document|pdf|contract|extract|parse/.test(haystack)) return 'adobe';
  if (assignee.includes('anchor') || /owner|assign|coordinate|follow-through|follow through/.test(haystack)) return 'anchor';
  return 'adrian';
}

function botNameForRoute(route: string): string {
  switch (route) {
    case 'ruby':
      return 'Drizzy';
    case 'emerald':
      return 'Champagne Papi';
    case 'adobe':
      return 'Aubrey Graham';
    case 'anchor':
      return '6 God';
    case 'adrian':
    default:
      return 'Drake';
  }
}

export async function getV2TasksFeed(): Promise<V2TasksFeed> {
  const tasks = (await listTasks()) as any[];

  let visionLinks: Array<{ taskId: string; visionItemId: string }> = [];
  try {
    const rawLinks = await db.select().from(schema.visionTaskLinks);
    visionLinks = rawLinks.map((link) => ({ taskId: String(link.taskId), visionItemId: String(link.visionItemId) }));
  } catch (err) {
    console.warn('[getV2TasksFeed] visionTaskLink query failed, skipping vision badges:', err instanceof Error ? err.message : String(err));
  }
  const taskVisionMap = new Map(visionLinks.map((link) => [link.taskId, link.visionItemId]));

  const mapped: V2TaskItem[] = tasks.map((task) => {
    const route = routeForTask(task);
    const source = typeof task.sourceChannel === 'string' && task.sourceChannel.includes('task_pool') ? 'GitHub' : 'Internal';
    const tz = getAppTimezone();
    const dueAtISO = task.dueAt ? new Date(task.dueAt).toISOString() : null;
    const timeframe = dueAtISO
      ? new Date(dueAtISO).toLocaleDateString('en-US', { timeZone: tz, month: 'numeric', day: 'numeric', year: 'numeric' })
      : 'Today';

    return {
      taskId: String(task.id),
      status: mapTaskStatus(task.status as TaskStatus),
      title: task.title,
      visionItemId: taskVisionMap.get(String(task.id)) ?? null,
      visionBoardLinked: (task as any).domain === 'vision board',
      metadata: {
        timeframe,
        dueAtISO,
        department: task.workflow?.name || 'Operations',
        assignedBot: botNameForRoute(route),
        priority: mapTaskPriority((task.priority as TaskPriority) || TaskPriority.MEDIUM),
        source,
      },
      actions: [
        { label: 'Start', endpoint: `/api/v2/tasks/${task.id}`, method: 'PATCH' },
        { label: 'Defer', endpoint: `/api/v2/tasks/${task.id}`, method: 'PATCH' },
      ],
    };
  });

  return {
    counters: {
      tracked: mapped.length,
      active: mapped.filter((task) => task.status === 'Active').length,
      blocked: mapped.filter((task) => task.status === 'Blocked').length,
      queued: mapped.filter((task) => task.status === 'Queued').length,
    },
    active: mapped.filter((task) => task.status === 'Active'),
    today: mapped.filter((task) => task.status === 'Queued' || task.status === 'Blocked'),
    backlog: mapped.filter((task) => task.status === 'Done'),
  };
}
