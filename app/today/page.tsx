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
  const topPriorities = openTasks
    .filter((task) => task.status === 'BLOCKED' || task.priority === 'CRITICAL' || task.priority === 'HIGH')
    .slice(0, 5);

  const timeline = (dashboard.activity ?? []).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Today</h1>
        <p className="text-sm text-slate-500">Run the day from a single command view.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardTitle>System Health Metrics</CardTitle>
          <CardSubtitle>Live status pulse</CardSubtitle>
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            <p className={gateway.ok ? 'text-emerald-600' : 'text-rose-600'}>
              Gateway: {gateway.ok ? 'Reachable' : 'Unavailable'}
            </p>
            <p className={email.connected ? 'text-emerald-600' : 'text-amber-600'}>
              Email: {email.connected ? 'Connected' : 'Needs attention'}
            </p>
            <p>Open tasks: {openTasks.length}</p>
          </div>
        </Card>

        <Card>
          <CardTitle>Pending Approvals Summary</CardTitle>
          <CardSubtitle>Queue to unblock</CardSubtitle>
          <div className="mt-2 text-sm text-slate-700">
            <p>{dashboard.pendingApprovals.length} waiting approval</p>
            {dashboard.pendingApprovals.slice(0, 2).map((approval: any) => (
              <p key={approval.id} className="truncate text-xs text-slate-500">
                {approval.workflow?.name ?? 'Workflow'}
              </p>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Top Priorities</CardTitle>
          <CardSubtitle>Approvals / action items</CardSubtitle>
          <div className="mt-2 space-y-1 text-xs text-slate-700">
            {topPriorities.slice(0, 3).map((task) => (
              <p key={task.id} className="truncate">
                {task.title}
              </p>
            ))}
            {topPriorities.length === 0 && <p className="text-slate-500">No critical items right now.</p>}
          </div>
        </Card>

        <Card>
          <CardTitle>Quick Actions</CardTitle>
          <CardSubtitle>One-tap commands</CardSubtitle>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <Link href="/tasks" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-center text-slate-700">
              New Task
            </Link>
            <Link href="/activity" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-center text-slate-700">
              Approve Queue
            </Link>
            <Link href="/email" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-center text-slate-700">
              Draft Reply
            </Link>
            <Link href="/finance" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-center text-slate-700">
              Trophy Collection
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Today&apos;s Timeline</CardTitle>
          <CardSubtitle>Recent events and motion</CardSubtitle>
          <div className="mt-3 space-y-2">
            {timeline.map((event: any) => (
              <div key={event.id} className="rounded-lg border border-border bg-[var(--input-background)] p-2">
                <p className="text-sm text-slate-800">{event.eventType}</p>
                <p className="text-xs text-slate-500">
                  {event.entityType} • {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
            {timeline.length === 0 && <p className="text-sm text-slate-500">No timeline entries yet.</p>}
          </div>
        </Card>

        <KissinBooth />
      </div>
    </div>
  );
}
