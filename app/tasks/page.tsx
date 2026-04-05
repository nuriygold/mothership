'use client';

import useSWR from 'swr';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { V2TaskItem, V2TasksFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

async function runTaskAction(taskId: string, action: 'start' | 'defer' | 'complete' | 'unblock') {
  const res = await fetch(`/api/v2/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error('Failed to update task');
}

function TaskSection({ title, tasks, onRefresh }: { title: string; tasks: V2TaskItem[]; onRefresh: () => Promise<any> }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-900">{title}</p>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.taskId} className="rounded-xl border border-border bg-[var(--input-background)] p-3">
            <p className="text-sm font-semibold text-slate-900">{task.title}</p>
            <p className="mt-1 text-xs text-slate-500">
              {task.status} • {task.metadata.department} • {task.metadata.assignedBot} • {task.metadata.source}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await runTaskAction(task.taskId, 'start');
                  await onRefresh();
                }}
              >
                Start
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await runTaskAction(task.taskId, 'defer');
                  await onRefresh();
                }}
              >
                Defer
              </Button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks in this section.</p>}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { data, mutate, isLoading } = useSWR<V2TasksFeed>('/api/v2/tasks', fetcher, { refreshInterval: 30000 });

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tasks</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Tracked {data?.counters.tracked ?? 0} • Active {data?.counters.active ?? 0} • Blocked {data?.counters.blocked ?? 0}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => mutate()} className="bg-white/70">
            Refresh
          </Button>
        </div>

        {isLoading && <p className="mt-4 text-sm text-slate-500">Loading tasks...</p>}
        {!isLoading && data && (
          <div className="mt-4 space-y-5">
            <TaskSection title="Active (Running right now)" tasks={data.active} onRefresh={mutate} />
            <TaskSection title="Today (Queued / Blocked)" tasks={data.today} onRefresh={mutate} />
            <TaskSection title="Backlog (Everything else)" tasks={data.backlog} onRefresh={mutate} />
          </div>
        )}
      </Card>
    </div>
  );
}

