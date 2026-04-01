'use client';

import useSWR from 'swr';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const statusColors: Record<string, string> = {
  TODO: 'text-slate-300',
  IN_PROGRESS: 'text-amber-300',
  DONE: 'text-emerald-300',
  BLOCKED: 'text-rose-300',
};

const quickActions = [
  { label: 'Todo', status: 'TODO' },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Blocked', status: 'BLOCKED' },
  { label: 'Done', status: 'DONE' },
] as const;

async function setTaskStatus(taskId: string, status: string) {
  const res = await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.message ?? 'Failed to update task');
  }
}

export default function TasksPage() {
  const { data, mutate, isLoading } = useSWR('/api/tasks', fetcher);
  const tasks = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Tasks</CardTitle>
        <p className="mt-1 text-xs text-cyan-300">Source: nuriygold/task-pool repository</p>
        <div className="mt-4 divide-y divide-border/80">
          {isLoading && <p className="py-6 text-sm text-slate-500">Loading tasks...</p>}

          {tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{task.title}</p>
                <p className="text-xs text-slate-400">
                  {task.workflow?.name ?? 'Unlinked'} • {task.priority} • {task.ownerName ?? 'Unassigned'}
                </p>
                {task.dueAt && (
                  <p className="text-xs text-amber-300">Due {new Date(task.dueAt).toLocaleDateString()}</p>
                )}
                {'sourceUrl' in task && typeof task.sourceUrl === 'string' && (
                  <a className="text-xs text-cyan-300 hover:text-cyan-200" href={task.sourceUrl} target="_blank" rel="noreferrer">
                    Open in task-pool
                  </a>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className={`mr-2 text-xs uppercase tracking-wide ${statusColors[task.status] ?? 'text-slate-300'}`}>
                  {task.status}
                </div>
                {quickActions.map((action) => (
                  <Button
                    key={`${task.id}:${action.status}`}
                    variant={task.status === action.status ? 'default' : 'outline'}
                    size="sm"
                    onClick={async () => {
                      await setTaskStatus(task.id, action.status);
                      await mutate();
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          {!isLoading && tasks.length === 0 && <p className="py-6 text-sm text-slate-500">No tasks found in the task-pool repository yet.</p>}
        </div>
      </Card>
    </div>
  );
}
