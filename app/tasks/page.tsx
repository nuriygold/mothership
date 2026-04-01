import { listTasks } from '@/lib/services/tasks';
import { Card, CardTitle } from '@/components/ui/card';

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
        <div className="mt-4 divide-y divide-border/80">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-white">{task.title}</p>
                <p className="text-xs text-slate-400">{task.workflow?.name ?? 'Unlinked'} • {task.priority}</p>
              </div>
              <div className="text-xs uppercase tracking-wide" style={{ color: statusColors[task.status] }}>
                {task.status}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
