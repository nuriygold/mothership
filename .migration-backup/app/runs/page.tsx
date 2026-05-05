import { listRuns } from '@/lib/services/runs';
import { Card, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function RunsPage() {
  const runs = await listRuns();

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Execution runs</CardTitle>
        <div className="mt-3 divide-y divide-border/80">
          {runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white">{run.type}</p>
                <p className="text-xs text-slate-400">{run.sourceSystem} • {run.status}</p>
                <p className="text-xs text-slate-500">{(run as any).workflow?.name ?? 'Unlinked'}</p>
              </div>
              <Link className="text-sm text-accent" href={`/runs/${run.id}`}>
                Detail
              </Link>
            </div>
          ))}
          {runs.length === 0 && (
            <p className="py-6 text-sm text-slate-500">
              No runs available yet. This surface will populate when Dispatch-Bot integration is connected.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
