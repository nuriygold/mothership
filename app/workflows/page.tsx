import Link from 'next/link';
import { listWorkflows } from '@/lib/services/workflows';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage() {
  const workflows = await listWorkflows();

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Workflows</CardTitle>
        <CardSubtitle>Boomerang is a native subtype</CardSubtitle>
        <div className="mt-4 divide-y divide-border/80">
          {workflows.map((wf) => (
            <div key={wf.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-white">{wf.name}</p>
                <p className="text-xs text-slate-400">{wf.type} • {wf.status} • {wf.submissions.length} submissions</p>
              </div>
              <Link className="text-sm text-accent" href={`/workflows/${wf.id}`}>
                Details
              </Link>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
