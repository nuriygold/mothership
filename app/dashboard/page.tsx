import { getDashboard } from '@/lib/services/dashboard';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const data = await getDashboard();
  const { counts, activeWorkflows, pendingApprovals, recentRuns, activity } = data;

  const stats = [
    { label: 'Workflows', value: counts.workflows },
    { label: 'Tasks', value: counts.tasks },
    { label: 'Pending approvals', value: counts.approvals },
    { label: 'Runs', value: counts.runs },
    { label: 'Commands', value: counts.commands },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((item) => (
          <Card key={item.label} className="p-4">
            <p className="text-xs uppercase text-slate-400">{item.label}</p>
            <p className="text-2xl font-semibold text-white">{item.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Active workflows</CardTitle>
          <CardSubtitle>Top flows across Boomerang and OpenClaw</CardSubtitle>
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
          <CardSubtitle>Includes Paperclip/Festival handoff placeholders</CardSubtitle>
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
          </div>
        </Card>

        <Card>
          <CardTitle>Recent activity</CardTitle>
          <CardSubtitle>Audit log excerpts</CardSubtitle>
          <div className="mt-4 space-y-3">
            {activity.map((evt) => (
              <div key={evt.id} className="rounded-lg border border-border p-3">
                <p className="text-sm text-white">{evt.eventType}</p>
                <p className="text-xs text-slate-400">{evt.entityType} • {new Date(evt.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
