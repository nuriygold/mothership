import { listTasks } from '@/lib/services/tasks';
import { Card, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, string> = {
  TODO: 'text-slate-300',
  IN_PROGRESS: 'text-amber-300',
  DONE: 'text-emerald-300',
  BLOCKED: 'text-rose-300',
};

export default async function TasksPage() {
  const tasks = await listTasks();

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Tasks</CardTitle>
        <p className="mt-1 text-xs text-cyan-300">Source: nuriygold/task-pool repository</p>
        <div className="mt-4 divide-y divide-border/80">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-white">{task.title}</p>
                <p className="text-xs text-slate-400">{task.workflow?.name ?? 'Unlinked'} • {task.priority}</p>
                {'sourceUrl' in task && typeof task.sourceUrl === 'string' && (
                  <a className="text-xs text-cyan-300 hover:text-cyan-200" href={task.sourceUrl} target="_blank" rel="noreferrer">
                    Open in task-pool
                  </a>
                )}
              </div>
              <div className={`text-xs uppercase tracking-wide ${statusColors[task.status] ?? 'text-slate-300'}`}>
                {task.status}
              </div>
            </div>
          ))}
          {tasks.length === 0 && <p className="py-6 text-sm text-slate-500">No tasks found in the task-pool repository yet.</p>}
        </div>
      </Card>
    </div>
  );
}
