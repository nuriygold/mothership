import { prisma } from '@/lib/prisma';
import { isTaskPoolRepositorySource, listTaskPoolTasks } from '@/lib/integrations/task-pool';

export async function getDashboard() {
  if (isTaskPoolRepositorySource()) {
    const tasks = await listTaskPoolTasks();
    if (tasks) {
      const workflowMap = new Map<string, (typeof tasks)[number]['workflow'] & { submissions: never[]; runs: never[]; createdAt: Date; updatedAt: Date }>();
      const activity = tasks.slice(0, 10).map((task) => ({
        id: `${task.id}:${task.updatedAt.toISOString()}`,
        entityType: 'task',
        entityId: task.id,
        eventType:
          task.status === 'DONE'
            ? 'completed'
            : task.status === 'BLOCKED'
              ? 'blocked'
              : 'updated',
        actorId: null,
        metadata: {
          title: task.title,
          domain: task.domain,
          priority: task.priorityLabel,
          url: task.sourceUrl,
        },
        createdAt: task.updatedAt,
      }));

      for (const task of tasks) {
        if (!workflowMap.has(task.workflow.id)) {
          workflowMap.set(task.workflow.id, {
            ...task.workflow,
            submissions: [],
            runs: [],
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
          });
          continue;
        }
        const current = workflowMap.get(task.workflow.id);
        if (!current) continue;
        if (task.updatedAt > current.updatedAt) current.updatedAt = task.updatedAt;
      }
      const workflows = [...workflowMap.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return {
        counts: {
          workflows: workflows.length,
          tasks: tasks.length,
          approvals: 0,
          runs: 0,
          commands: 0,
        },
        activeWorkflows: workflows.slice(0, 5),
        pendingApprovals: [],
        recentRuns: [],
        activity,
      };
    }

    return {
      counts: {
        workflows: 0,
        tasks: 0,
        approvals: 0,
        runs: 0,
        commands: 0,
      },
      activeWorkflows: [],
      pendingApprovals: [],
      recentRuns: [],
      activity: [],
    };
  }

  const [workflows, tasks, approvals, runs, commands, activity] = await Promise.all([
    prisma.workflow.count(),
    prisma.task.count(),
    prisma.approval.count({ where: { status: 'REQUESTED' } }),
    prisma.run.count(),
    prisma.command.count(),
    prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  const activeWorkflows = await prisma.workflow.findMany({
    include: { submissions: true, runs: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const pendingApprovals = await prisma.approval.findMany({
    where: { status: 'REQUESTED' },
    include: { task: true, workflow: true },
    orderBy: { createdAt: 'desc' },
  });

  const recentRuns = await prisma.run.findMany({
    include: { workflow: true },
    orderBy: { startedAt: 'desc' },
    take: 5,
  });

  return {
    counts: { workflows, tasks, approvals, runs, commands },
    activeWorkflows,
    pendingApprovals,
    recentRuns,
    activity,
  };
}
