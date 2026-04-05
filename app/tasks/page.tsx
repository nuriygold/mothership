'use client';

import useSWR from 'swr';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const quickActions = [
  { label: 'Todo', status: 'TODO' },
  { label: 'In Progress', status: 'IN_PROGRESS' },
  { label: 'Blocked', status: 'BLOCKED' },
  { label: 'Done', status: 'DONE' },
] as const;

const priorityColors: Record<string, string> = {
  CRITICAL: 'bg-[var(--color-sky)] text-[var(--foreground)]',
  HIGH: 'bg-[var(--color-peach)] text-[var(--foreground)]',
  MEDIUM: 'bg-[var(--color-lavender)] text-[var(--foreground)]',
  LOW: 'bg-[var(--color-mint)] text-[var(--foreground)]',
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
  const activeTasks = tasks.filter((task) => task.status === 'IN_PROGRESS');
  const todayTasks = tasks.filter((task) => task.status === 'TODO' || task.status === 'BLOCKED');
  const backlogTasks = tasks.filter((task) => task.status !== 'IN_PROGRESS' && task.status !== 'TODO' && task.status !== 'BLOCKED');

  const renderTaskList = (items: any[], emptyLabel: string) => {
    if (items.length === 0) {
      return <p className="py-6 text-sm text-slate-500">{emptyLabel}</p>;
    }

    return items.map((task) => (
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
    ));
  };

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
        {isLoading && <p className="mt-4 py-6 text-sm text-slate-500">Loading tasks...</p>}

        {!isLoading && (
          <div className="mt-4 space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Active (Running right now)</p>
              <div className="space-y-3">{renderTaskList(activeTasks, 'No active tasks right now.')}</div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Today (Queued / Blocked)</p>
              <div className="space-y-3">{renderTaskList(todayTasks, 'No queued or blocked tasks for today.')}</div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Backlog (Everything else)</p>
              <div className="space-y-3">{renderTaskList(backlogTasks, 'No backlog tasks found.')}</div>
            </div>
          </div>
        )}

        {!isLoading && tasks.length === 0 && (
          <p className="mt-4 py-6 text-sm text-slate-500">No tasks found in the task-pool repository yet.</p>
        )}
      </Card>
    </div>
  );
}
