import { getRun } from '@/lib/services/runs';
import { Card, CardTitle } from '@/components/ui/card';

interface Params { params: { id: string } }

export const dynamic = 'force-dynamic';

export default async function RunDetail({ params }: Params) {
  const run = await getRun(params.id);
  if (!run) return <div className="text-sm text-slate-400">Not found</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{run.type}</CardTitle>
        <div className="mt-2 text-sm text-slate-300">Source: {run.sourceSystem}</div>
        <div className="text-xs text-slate-500">Status: {run.status}</div>
        {run.errorMessage && <div className="text-xs text-rose-400">{run.errorMessage}</div>}
      </Card>

      <Card>
        <CardTitle>Metadata</CardTitle>
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-panel p-3 text-xs text-slate-300">{JSON.stringify(run.metadata ?? {}, null, 2)}</pre>
      </Card>
    </div>
  );
}
