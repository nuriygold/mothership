import Link from 'next/link';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { getDashboard } from '@/lib/services/dashboard';
import { listTasks } from '@/lib/services/tasks';

const FINANCE_KEYWORDS = ['finance', 'budget', 'invoice', 'billing', 'cost', 'spend', 'payment'];

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const [dashboard, tasks] = await Promise.all([getDashboard(), listTasks()]);
  const taskList = (tasks ?? []) as Array<any>;

  const financeTasks = taskList
    .filter((task) => {
      const haystack = [task.title, task.description, task.workflow?.name].filter(Boolean).join(' ').toLowerCase();
      return FINANCE_KEYWORDS.some((keyword) => haystack.includes(keyword));
    })
    .slice(0, 12);

  const openFinanceTasks = financeTasks.filter((task) => task.status !== 'DONE');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Finance</h1>
        <p className="text-sm text-slate-500">Live finance lane using current tasks and approval queue.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Finance Tasks</CardTitle>
          <CardSubtitle>Detected from task stream</CardSubtitle>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{financeTasks.length}</p>
        </Card>
        <Card>
          <CardTitle>Open Finance Items</CardTitle>
          <CardSubtitle>Requires action</CardSubtitle>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{openFinanceTasks.length}</p>
        </Card>
        <Card>
          <CardTitle>Pending Approvals</CardTitle>
          <CardSubtitle>Global queue</CardSubtitle>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboard.pendingApprovals.length}</p>
        </Card>
      </div>

      <Card>
        <CardTitle>Finance Queue</CardTitle>
        <CardSubtitle>Tasks with finance-related signals</CardSubtitle>
        <div className="mt-3 space-y-2">
          {financeTasks.map((task) => (
            <div key={task.id} className="rounded-lg border border-border bg-[var(--input-background)] p-3">
              <p className="text-sm font-semibold text-slate-900">{task.title}</p>
              <p className="text-xs text-slate-500">{task.status} • {task.priority ?? 'MEDIUM'}</p>
              {'sourceUrl' in task && typeof task.sourceUrl === 'string' && (
                <a className="mt-1 inline-flex text-xs text-cyan-600 hover:text-cyan-800" href={task.sourceUrl} target="_blank" rel="noreferrer">
                  Open issue
                </a>
              )}
            </div>
          ))}
          {financeTasks.length === 0 && (
            <p className="text-sm text-slate-500">
              No finance-tagged tasks detected yet. Add labels or naming signals in the task-pool to populate this view.
            </p>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/tasks" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-slate-700">
          Open Tasks
        </Link>
        <Link href="/activity" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-slate-700">
          Open Activity Log
        </Link>
        <Link href="/email" className="rounded-md border border-border bg-[var(--input-background)] px-2 py-1 text-slate-700">
          Open Email
        </Link>
      </div>
    </div>
  );
}
