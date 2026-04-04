import { getDashboard } from '@/lib/services/dashboard';
import { listTasks } from '@/lib/services/tasks';
import { getEmailSummary } from '@/lib/services/email';
import { checkGateway } from '@/lib/services/openclaw';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [data, tasks, email, gateway] = await Promise.all([
    getDashboard(),
    listTasks(),
    getEmailSummary(),
    checkGateway(),
  ]);
  const { counts, activeWorkflows, pendingApprovals, recentRuns, activity } = data;
  const taskList = tasks as Array<any>;
  const taskSourceNote = 'Source: GitHub Issues (nuriygold/task-pool) — use Refresh on Tasks page for latest.';
  const googleCalendarId = process.env.GOOGLE_CALENDAR_ID ?? '';
  const calendarWebUrl = googleCalendarId
    ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(googleCalendarId)}`
    : 'https://calendar.google.com';
  const calendarIcalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL;
  const openclawApiUrl = process.env.OPENCLAW_API_URL;

  const stats = [
    { label: 'Workflows', value: counts.workflows },
    { label: 'Tasks', value: counts.tasks },
    { label: 'Pending approvals', value: counts.approvals },
    { label: 'Runs', value: counts.runs },
    { label: 'Commands', value: counts.commands },
  ];

  const now = new Date();
  const openTasks = taskList.filter((task) => task.status !== 'DONE');
  const overdue = openTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now.getTime());
  const dueSoon = openTasks
    .filter((task) => task.dueAt && new Date(task.dueAt).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 5);
  const needsAttention = openTasks.filter(
    (task) => task.status === 'BLOCKED' || task.priority === 'CRITICAL' || task.priority === 'HIGH'
  );
  const delegationQueue = openTasks.filter((task) => !task.ownerId && !task.ownerName);
  const inProgress = openTasks.filter((task) => task.status === 'IN_PROGRESS');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs uppercase text-slate-400">{item.label}</p>
            <p className="text-2xl font-semibold text-white">{item.value}</p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-400">Gateway</p>
          <p className={`text-sm font-semibold ${gateway.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {gateway.ok ? 'Reachable' : 'Unreachable'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">{gateway.message}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>To-do items</CardTitle>
          <CardSubtitle>Open execution list. {taskSourceNote}</CardSubtitle>
          <div className="mt-3 space-y-2 text-sm text-slate-200">
            <p>{openTasks.length} open tasks</p>
            <p>{inProgress.length} in progress</p>
            <p>{delegationQueue.length} unassigned</p>
            <Link href="/tasks" className="text-cyan-300 hover:text-cyan-200">
              Open tasks board
            </Link>
          </div>
        </Card>
        <Card>
          <CardTitle>Due / overdue</CardTitle>
          <CardSubtitle>What needs timing attention</CardSubtitle>
          <div className="mt-3 space-y-2 text-sm text-slate-200">
            <p className={overdue.length > 0 ? 'text-rose-300' : 'text-slate-300'}>
              {overdue.length} overdue
            </p>
            {dueSoon.slice(0, 3).map((task) => (
              <p key={task.id} className="text-xs text-slate-300">
                {task.title} · {new Date(task.dueAt).toLocaleDateString()}
              </p>
            ))}
            {dueSoon.length === 0 && <p className="text-xs text-slate-500">No dated tasks yet.</p>}
          </div>
        </Card>
        <Card>
          <CardTitle>Delegation queue</CardTitle>
          <CardSubtitle>Who needs assignment</CardSubtitle>
          <div className="mt-3 space-y-2">
            {delegationQueue.slice(0, 3).map((task) => (
              <p key={task.id} className="text-xs text-slate-300">
                {task.title}
              </p>
            ))}
            {delegationQueue.length === 0 && <p className="text-xs text-slate-500">No delegation gaps right now.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Email summary</CardTitle>
          <CardSubtitle>{email.provider.toUpperCase()} connector</CardSubtitle>
          <div className="mt-3 space-y-1 text-sm text-slate-300">
            <p className={email.connected ? 'text-emerald-300' : 'text-amber-300'}>
              {email.connected ? 'Connected' : 'Needs OAuth credentials'}
            </p>
            <p>{email.unreadCount} unread</p>
            <p>{email.needsReplyCount} need reply</p>
            <p>{email.urgentCount} urgent</p>
            {email.inboxes.length > 0 && (
              <p className="text-xs text-slate-400">Inboxes: {email.inboxes.join(', ')}</p>
            )}
            <p className="text-xs text-slate-500">{email.note}</p>
          </div>
          <div className="mt-3 flex gap-3 text-xs">
            <a href={calendarWebUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">
              Open Google Calendar
            </a>
            <a href="https://outlook.office.com/calendar/" target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">
              Open Outlook Calendar
            </a>
            {calendarIcalUrl && (
              <a href={calendarIcalUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">
                Open Calendar Feed
              </a>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>Needs attention</CardTitle>
          <CardSubtitle>Blocked and high-priority items</CardSubtitle>
          <div className="mt-3 space-y-2">
            {needsAttention.slice(0, 5).map((task) => (
              <p key={task.id} className="text-xs text-slate-300">
                {task.title} · {task.status} · {task.priority}
              </p>
            ))}
            {needsAttention.length === 0 && <p className="text-xs text-slate-500">No urgent blockers detected.</p>}
          </div>
          {openclawApiUrl && (
            <p className="mt-3 text-xs text-slate-500">
              Command route: {openclawApiUrl}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Active workflows</CardTitle>
          <CardSubtitle>Projected from task-pool repository domains</CardSubtitle>
          <div className="mt-4 divide-y divide-border/80">
            {activeWorkflows.map((wf) => (
              <div key={wf.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-white">{wf.name}</p>
                  <p className="text-xs text-slate-400">{wf.type.toLowerCase()} • {wf.submissions.length} submissions • {wf.runs.length} runs</p>
                </div>
                <Link className="text-sm text-accent" href={`/workflows/${wf.id}`}>
                  Open
                </Link>
              </div>
            ))}
            {activeWorkflows.length === 0 && (
              <p className="py-3 text-sm text-slate-500">No task-pool workflows detected yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Pending approvals</CardTitle>
          <CardSubtitle>Action these to keep flows moving</CardSubtitle>
          <div className="mt-4 space-y-3">
            {pendingApprovals.map((appr) => (
              <div key={appr.id} className="rounded-lg border border-border p-3">
                <p className="text-sm text-white">{appr.workflow?.name ?? 'Workflow'}</p>
                <p className="text-xs text-slate-400">{appr.reason ?? 'Approval requested'}</p>
              </div>
            ))}
            {pendingApprovals.length === 0 && <p className="text-sm text-slate-500">No approvals waiting.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Recent runs</CardTitle>
          <CardSubtitle>Execution feed will populate after Dispatch-Bot integration</CardSubtitle>
          <div className="mt-4 space-y-3">
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm text-white">{run.type}</p>
                  <p className="text-xs text-slate-400">{run.sourceSystem} • {run.status}</p>
                  <p className="text-xs text-slate-500">{(run as any).workflow?.name ?? 'Unlinked'}</p>
                </div>
                <Link className="text-sm text-accent" href={`/runs/${run.id}`}>
                  Details
                </Link>
              </div>
            ))}
            {recentRuns.length === 0 && (
              <p className="text-sm text-slate-500">No execution runs connected yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Recent activity</CardTitle>
          <CardSubtitle>Live task updates from task-pool repository</CardSubtitle>
          <div className="mt-4 space-y-3">
            {activity.map((evt) => (
              <div key={evt.id} className="rounded-lg border border-border p-3">
                <p className="text-sm text-white">{evt.eventType}</p>
                <p className="text-xs text-slate-400">{evt.entityType} • {new Date(evt.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {activity.length === 0 && <p className="text-sm text-slate-500">No activity available.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
