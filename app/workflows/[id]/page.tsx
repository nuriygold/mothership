import { getWorkflow } from '@/lib/services/workflows';
import { Card, CardTitle, CardSubtitle } from '@/components/ui/card';

interface Params { params: { id: string } }

export const dynamic = 'force-dynamic';

export default async function WorkflowDetail({ params }: Params) {
  const workflow = await getWorkflow(params.id);
  if (!workflow) return <div className="text-sm text-slate-400">Not found</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{workflow.name}</CardTitle>
        <CardSubtitle>{workflow.description ?? 'No description'}</CardSubtitle>
        <div className="mt-3 text-xs text-slate-400">Type: {workflow.type} • Status: {workflow.status}</div>
        {workflow.id.startsWith('tpw_') && (
          <div className="mt-2 text-xs text-cyan-300">Source: task-pool repository (live projection)</div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Tasks</CardTitle>
          <div className="mt-3 space-y-3">
            {workflow.tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-border p-3">
                <p className="text-sm text-white">{task.title}</p>
                <p className="text-xs text-slate-400">{task.status} • {task.priority}</p>
                {'sourceUrl' in task && typeof task.sourceUrl === 'string' && (
                  <a
                    className="mt-1 inline-block text-xs text-cyan-300 hover:text-cyan-200"
                    href={task.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in task-pool
                  </a>
                )}
              </div>
            ))}
            {workflow.tasks.length === 0 && <p className="text-sm text-slate-500">No tasks in this workflow yet.</p>}
          </div>
        </Card>

        <Card>
          <CardTitle>Submissions</CardTitle>
          <div className="mt-3 space-y-3">
            {workflow.submissions.map((sub) => (
              <div key={sub.id} className="rounded-lg border border-border p-3">
                <p className="text-sm text-white">{sub.sourceChannel}</p>
                <p className="text-xs text-slate-400">Validation: {sub.validationStatus}</p>
              </div>
            ))}
            {workflow.submissions.length === 0 && <p className="text-sm text-slate-500">No submissions yet.</p>}
          </div>
        </Card>

        <Card>
          <CardTitle>Runs</CardTitle>
          <div className="mt-3 space-y-3">
            {workflow.runs.map((run) => (
              <div key={run.id} className="rounded-lg border border-border p-3">
                <p className="text-sm text-white">{run.type}</p>
                <p className="text-xs text-slate-400">{run.sourceSystem} • {run.status}</p>
              </div>
            ))}
            {workflow.runs.length === 0 && <p className="text-sm text-slate-500">No runs logged.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
