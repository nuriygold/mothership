import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { approvals, auditEvents, commands, runs, submissions, tasks, workflows } from '@/lib/db/schema';
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

  const [
    [{ count: workflowsCount }],
    [{ count: tasksCount }],
    [{ count: pendingApprovalsCount }],
    [{ count: runsCount }],
    [{ count: commandsCount }],
    activity,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(workflows),
    db.select({ count: sql<number>`count(*)` }).from(tasks),
    db.select({ count: sql<number>`count(*)` }).from(approvals).where(eq(approvals.status, 'REQUESTED')),
    db.select({ count: sql<number>`count(*)` }).from(runs),
    db.select({ count: sql<number>`count(*)` }).from(commands),
    db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(10),
  ]);

  const activeWorkflowsBase = await db.select().from(workflows).orderBy(desc(workflows.createdAt)).limit(5);
  const activeWorkflowIds = activeWorkflowsBase.map((w) => w.id);
  const [activeSubmissions, activeRuns] = await Promise.all([
    activeWorkflowIds.length
      ? db.select().from(submissions).where(inArray(submissions.workflowId, activeWorkflowIds))
      : Promise.resolve([]),
    activeWorkflowIds.length
      ? db.select().from(runs).where(inArray(runs.workflowId, activeWorkflowIds))
      : Promise.resolve([]),
  ]);

  const activeWorkflows = activeWorkflowsBase.map((workflow) => ({
    ...workflow,
    submissions: activeSubmissions.filter((s) => s.workflowId === workflow.id),
    runs: activeRuns.filter((r) => r.workflowId === workflow.id),
  }));

  const pendingApprovalsRows = await db
    .select({
      approval: approvals,
      task: tasks,
      workflow: workflows,
    })
    .from(approvals)
    .leftJoin(tasks, eq(approvals.taskId, tasks.id))
    .leftJoin(workflows, eq(approvals.workflowId, workflows.id))
    .where(eq(approvals.status, 'REQUESTED'))
    .orderBy(desc(approvals.createdAt));

  const pendingApprovals = pendingApprovalsRows.map((row) => ({
    ...row.approval,
    task: row.task ?? null,
    workflow: row.workflow ?? null,
  }));

  const recentRunsRows = await db
    .select({
      run: runs,
      workflow: workflows,
    })
    .from(runs)
    .leftJoin(workflows, eq(runs.workflowId, workflows.id))
    .orderBy(desc(runs.startedAt))
    .limit(5);

  const recentRuns = recentRunsRows.map((row) => ({
    ...row.run,
    workflow: row.workflow ?? null,
  }));

  return {
    counts: {
      workflows: Number(workflowsCount),
      tasks: Number(tasksCount),
      approvals: Number(pendingApprovalsCount),
      runs: Number(runsCount),
      commands: Number(commandsCount),
    },
    activeWorkflows,
    pendingApprovals,
    recentRuns,
    activity,
  };
}
