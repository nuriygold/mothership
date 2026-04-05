import Link from 'next/link';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { getDashboard } from '@/lib/services/dashboard';
import { listTasks } from '@/lib/services/tasks';
import { getEmailSummary } from '@/lib/services/email';
import { checkGateway } from '@/lib/services/openclaw';
import { KissinBooth } from '@/components/today/kissin-booth';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const [dashboard, tasks, email, gateway] = await Promise.all([
    getDashboard(),
    listTasks(),
    getEmailSummary(),
    checkGateway(),
  ]);

  const taskList = (tasks ?? []) as Array<any>;
  const openTasks = taskList.filter((task) => task.status !== 'DONE');
  const inProgress = openTasks.filter((task) => task.status === 'IN_PROGRESS');
  const blocked = openTasks.filter((task) => task.status === 'BLOCKED');
  const topPriorities = openTasks
    .filter((task) => task.status === 'BLOCKED' || task.priority === 'CRITICAL' || task.priority === 'HIGH')
    .slice(0, 5);
  const timeline = (dashboard.activity ?? []).slice(0, 8);

  const systemHealth = [
    { label: 'Gateway', value: gateway.ok ? 100 : 38 },
    { label: 'Email Processing', value: email.connected ? 100 : 45 },
    { label: 'Task Throughput', value: openTasks.length === 0 ? 100 : Math.max(35, Math.min(96, Math.round((inProgress.length / openTasks.length) * 100))) },
    { label: 'Approval Queue', value: dashboard.pendingApprovals.length === 0 ? 100 : Math.max(30, 100 - dashboard.pendingApprovals.length * 10) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Today</h1>
        <p className="text-sm text-slate-500">Run the day from one command surface.</p>
      </div>

      <Card>
        <CardTitle>Quick Actions</CardTitle>
        <CardSubtitle>New Task, Approve Queue, Draft Reply, Trophy Collection</CardSubtitle>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/tasks" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">
            New Task
          </Link>
          <Link href="/activity" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">
            Approve Queue
          </Link>
          <Link href="/email" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">
            Draft Reply
          </Link>
          <Link href="/finance" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">
            Trophy Collection
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardTitle>Today&apos;s Timeline</CardTitle>
            <CardSubtitle>Recent operational motion</CardSubtitle>
            <div className="mt-3 space-y-2">
              {timeline.map((event: any) => (
                <div key={event.id} className="rounded-lg border border-border bg-[var(--input-background)] p-2">
                  <p className="text-sm font-medium text-slate-800">{event.eventType}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(event.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} • {event.entityType}
                  </p>
                </div>
              ))}
              {timeline.length === 0 && <p className="text-sm text-slate-500">No timeline entries yet.</p>}
            </div>
          </Card>

          <Card>
            <CardTitle>Top Priorities</CardTitle>
            <CardSubtitle>Approvals and action items</CardSubtitle>
            <div className="mt-3 space-y-2">
              {topPriorities.map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-lg border border-border bg-[var(--input-background)] p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500">{task.workflow?.name ?? 'General'} • {task.priority ?? 'MEDIUM'}</p>
                  </div>
                  <Link href="/tasks" className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600">
                    Take Action
                  </Link>
                </div>
              ))}
              {topPriorities.length === 0 && <p className="text-sm text-slate-500">No critical items right now.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <KissinBooth />

          <Card>
            <CardTitle>System Health Metrics</CardTitle>
            <CardSubtitle>Live status pulse</CardSubtitle>
            <div className="mt-3 space-y-3">
              {systemHealth.map((metric) => (
                <div key={metric.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{metric.label}</span>
                    <span>{metric.value}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200/70">
                    <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500" style={{ width: `${metric.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Pending Approvals Summary</CardTitle>
            <CardSubtitle>Queue to unblock</CardSubtitle>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>{dashboard.pendingApprovals.length} waiting approval</p>
              <p>{blocked.length} blocked tasks</p>
              {dashboard.pendingApprovals.slice(0, 3).map((approval: any) => (
                <p key={approval.id} className="truncate text-xs text-slate-500">
                  {approval.workflow?.name ?? 'Workflow'} • {approval.reason ?? 'Approval requested'}
                </p>
              ))}
              {dashboard.pendingApprovals.length === 0 && <p className="text-xs text-slate-500">No approvals waiting.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
