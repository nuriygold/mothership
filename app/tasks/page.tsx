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

const priorityColors: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700',
  HIGH: 'bg-amber-100 text-amber-700',
  MEDIUM: 'bg-indigo-100 text-indigo-700',
  LOW: 'bg-emerald-100 text-emerald-700',
};

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
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tasks</CardTitle>
            <p className="mt-1 text-xs text-cyan-300">Source: nuriygold/task-pool repository</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => mutate()} className="bg-white/70">
            Refresh tasks
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {isLoading && <p className="py-6 text-sm text-slate-500">Loading tasks...</p>}

          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-white/70 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 h-10 w-1 rounded-full" style={{ background: 'var(--accent)' }} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className={`rounded-full px-2 py-1 ${priorityColors[task.priority] ?? 'bg-slate-100 text-slate-700'}`}>
                      {task.priority ?? 'Unset'}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{task.status}</span>
                    {task.workflow?.name && (
                      <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">
                        {task.workflow.name}
                      </span>
                    )}
                    {task.ownerName && <span className="text-slate-500">• {task.ownerName}</span>}
                    {task.dueAt && (
                      <span className="text-amber-600">
                        Due {new Date(task.dueAt).toLocaleDateString()}
                      </span>
                    )}
                    {'sourceUrl' in task && typeof task.sourceUrl === 'string' && (
                      <a className="text-cyan-600 hover:text-cyan-800" href={task.sourceUrl} target="_blank" rel="noreferrer">
                        Open Issue
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
