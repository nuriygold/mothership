import { prisma } from '@/lib/prisma';

export async function getDashboard() {
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
