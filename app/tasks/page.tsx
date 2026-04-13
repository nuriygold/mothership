'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import type { V2TaskItem, V2TasksFeed, V2DashboardPriorityItem } from '@/lib/v2/types';
import type { KanbanColumnKey } from '@/components/tasks/kanban-column';
import { KanbanColumn } from '@/components/tasks/kanban-column';
import { TasksSummaryBar } from '@/components/tasks/tasks-summary-bar';
import { TasksFilters } from '@/components/tasks/tasks-filters';
import type { TaskFilter } from '@/components/tasks/tasks-filters';
import { TakeActionModal } from '@/components/today/take-action-modal';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMN_ORDER: KanbanColumnKey[] = ['Active', 'Waiting', 'Blocked', 'Backlog', 'Done'];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ─── Data helpers ─────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Convert a V2TaskItem into the shape TakeActionModal expects. */
function toActionItem(task: V2TaskItem): V2DashboardPriorityItem {
  return {
    id: task.taskId,
    taskId: task.taskId,
    title: task.title,
    source: task.metadata.department,
    // Not used in Kanban context (showRouteApproval=false), but required by the type
    actionWebhook: `/api/v2/tasks/${task.taskId}`,
    assignedBot: task.metadata.assignedBot,
    dueAt: task.metadata.dueAtISO,
  };
}

const TODAY_FRAMES = new Set(['today', 'Today']);

function applyFilter(tasks: V2TaskItem[], filter: TaskFilter): V2TaskItem[] {
  switch (filter) {
    case 'Today':
      return tasks.filter((t) => TODAY_FRAMES.has(t.metadata.timeframe));
    case 'This Week':
      return tasks.filter((t) =>
        TODAY_FRAMES.has(t.metadata.timeframe) ||
        ['this_week', 'week', 'This Week'].includes(t.metadata.timeframe)
      );
    case 'By Priority':
      return [...tasks].sort(
        (a, b) =>
          (PRIORITY_ORDER[a.metadata.priority] ?? 4) -
          (PRIORITY_ORDER[b.metadata.priority] ?? 4)
      );
    case 'By Bot':
      return [...tasks].sort((a, b) =>
        a.metadata.assignedBot.localeCompare(b.metadata.assignedBot)
      );
    default:
      return tasks;
  }
}

function groupIntoColumns(
  data: V2TasksFeed,
  filter: TaskFilter
): Record<KanbanColumnKey, V2TaskItem[]> {
  const all = applyFilter(
    [...data.active, ...data.today, ...data.backlog],
    filter
  );
  const blocked = all.filter((t) => t.status === 'Blocked');
  const done    = all.filter((t) => t.status === 'Done');
  const excludeIds = new Set([...blocked, ...done].map((t) => t.taskId));

  return {
    Active:  applyFilter(data.active,  filter).filter((t) => !excludeIds.has(t.taskId)),
    Waiting: applyFilter(data.today,   filter).filter((t) => !excludeIds.has(t.taskId)),
    Blocked: blocked,
    Backlog: applyFilter(data.backlog, filter).filter((t) => !excludeIds.has(t.taskId)),
    Done:    done,
  };
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="flex flex-col gap-4 pb-6 md:flex-row md:overflow-x-auto">
      {COLUMN_ORDER.map((col) => (
        <div
          key={col}
          className="rounded-3xl animate-pulse w-full md:flex-shrink-0 md:w-[272px] md:min-w-[240px]"
          style={{ height: '420px', background: 'var(--muted)' }}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { data, mutate, isLoading } = useSWR<V2TasksFeed>('/api/v2/tasks', fetcher, {
    refreshInterval: 30_000,
  });
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('All');

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [actionModalTask, setActionModalTask] = useState<V2TaskItem | null>(null);

  // ── Optimistic vision-board tracking ──────────────────────────────────────
  const [visionLinkedIds, setVisionLinkedIds] = useState<Set<string>>(new Set());

  // ── Derived data ─────────────────────────────────────────────────────────────
  const counters = data?.counters;
  const queued   = counters ? counters.tracked - counters.active - counters.blocked : 0;
  const grouped  = data ? groupIntoColumns(data, activeFilter) : null;

  // ── Modal callbacks ──────────────────────────────────────────────────────────

  const handleComplete = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    });
    if (!res.ok) throw new Error(`Task complete failed (${res.status})`);
    await mutate();
  }, [mutate]);

  const handleGateway = useCallback((title: string) => {
    const params = new URLSearchParams({ q: title });
    window.location.href = `/ruby?${params.toString()}`;
  }, []);

  const handleStartWorking = useCallback(async (item: V2DashboardPriorityItem) => {
    if (!item.taskId) return;
    const res = await fetch(`/api/v2/tasks/${item.taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    await mutate();
  }, [mutate]);

  const handleDispatch = useCallback((item: V2DashboardPriorityItem) => {
    const params = new URLSearchParams({ task: item.title, source: item.source });
    window.location.href = `/dispatch?${params.toString()}`;
  }, []);

  const handleAddToVisionBoard = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vision_board' }),
    });
    if (!res.ok) throw new Error(`Vision board label failed (${res.status})`);
    // Optimistic update so the badge appears immediately
    setVisionLinkedIds((prev) => new Set([...prev, taskId]));
    // Background re-fetch (GitHub API caches 60s so the badge from server-side
    // visionBoardLinked may take one more cycle, but the optimistic set covers it)
    void mutate();
  }, [mutate]);

  return (
    <div className="flex flex-col gap-5">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
          Tasks
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
          Kanban board · priorities and workflow stages at a glance
        </p>
      </div>

      {/* Status summary bar */}
      <TasksSummaryBar
        tracked={counters?.tracked ?? 0}
        active={counters?.active   ?? 0}
        blocked={counters?.blocked ?? 0}
        queued={queued}
      />

      {/* Filter chips */}
      <TasksFilters activeFilter={activeFilter} onFilter={setActiveFilter} />

      {/* Board */}
      {isLoading || !grouped ? (
        <KanbanSkeleton />
      ) : (
        <div
          className="flex flex-col gap-4 pb-6 md:flex-row md:overflow-x-auto"
          style={{ minHeight: '400px' }}
        >
          {COLUMN_ORDER.map((col) => (
            <KanbanColumn
              key={col}
              title={col}
              tasks={grouped[col]}
              visionLinkedIds={visionLinkedIds}
              onTakeAction={setActionModalTask}
            />
          ))}
        </div>
      )}

      {/* Take Action modal */}
      {actionModalTask && (
        <TakeActionModal
          item={toActionItem(actionModalTask)}
          onClose={() => setActionModalTask(null)}
          onDone={() => { setActionModalTask(null); void mutate(); }}
          onComplete={handleComplete}
          onGateway={handleGateway}
          onStartWorking={handleStartWorking}
          onDispatch={handleDispatch}
          onAddToVisionBoard={handleAddToVisionBoard}
          showRouteApproval={false}
        />
      )}
    </div>
  );
}
