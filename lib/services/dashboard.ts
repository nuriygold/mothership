import { prisma } from '@/lib/prisma';
import { isTaskPoolRepositorySource, listTaskPoolActivityEvents, listTaskPoolTasks, listTaskPoolWorkflows } from '@/lib/integrations/task-pool';

export async function getDashboard() {
  if (isTaskPoolRepositorySource()) {
    const [tasks, workflows, activity] = await Promise.all([
      listTaskPoolTasks(),
      listTaskPoolWorkflows(),
      listTaskPoolActivityEvents(10),
    ]);

    if (tasks && workflows && activity) {
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
