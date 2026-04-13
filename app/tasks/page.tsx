'use client';

import { useState } from 'react';
import useSWR from 'swr';
import type { V2TaskItem, V2TasksFeed } from '@/lib/v2/types';
import type { KanbanColumnKey } from '@/components/tasks/kanban-column';
import { KanbanColumn } from '@/components/tasks/kanban-column';
import { TasksSummaryBar } from '@/components/tasks/tasks-summary-bar';
import { TasksFilters } from '@/components/tasks/tasks-filters';
import type { TaskFilter } from '@/components/tasks/tasks-filters';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMN_ORDER: KanbanColumnKey[] = ['Active', 'Waiting', 'Blocked', 'Backlog', 'Done'];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// ─── Data helpers ─────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

async function runTaskAction(taskId: string, action: 'start' | 'defer' | 'complete' | 'unblock') {
  const res = await fetch(`/api/v2/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error('Failed to update task');
}

const TODAY_FRAMES = new Set(['today', 'Today']);

/** Apply a filter to a flat task list — returns a new sorted/filtered array. */
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

/**
 * Group tasks into 5 Kanban columns.
 *
 * Source arrays from the API already represent the intended grouping:
 *   data.active  → status='Active'  → Active column
 *   data.today   → status='Queued', timeframe='today' → Waiting column
 *   data.backlog → status='Queued', future timeframe  → Backlog column
 *
 * Blocked and Done tasks may appear anywhere; we extract them from all arrays.
 */
function groupIntoColumns(
  data: V2TasksFeed,
  filter: TaskFilter
): Record<KanbanColumnKey, V2TaskItem[]> {
  // Flatten and filter first so filter affects every column uniformly
  const all = applyFilter(
    [...data.active, ...data.today, ...data.backlog],
    filter
  );

  const blocked = all.filter((t) => t.status === 'Blocked');
  const done    = all.filter((t) => t.status === 'Done');
  const blockedIds = new Set([...blocked, ...done].map((t) => t.taskId));

  return {
    Active:  applyFilter(data.active,  filter).filter((t) => !blockedIds.has(t.taskId)),
    Waiting: applyFilter(data.today,   filter).filter((t) => !blockedIds.has(t.taskId)),
    Blocked: blocked,
    Backlog: applyFilter(data.backlog, filter).filter((t) => !blockedIds.has(t.taskId)),
    Done:    done,
  };
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-6">
      {COLUMN_ORDER.map((col) => (
        <div
          key={col}
          className="flex-shrink-0 rounded-3xl animate-pulse"
          style={{ width: '272px', minWidth: '240px', height: '420px', background: 'var(--muted)' }}
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

  const counters = data?.counters;
  const queued   = counters ? counters.tracked - counters.active - counters.blocked : 0;

  const grouped = data ? groupIntoColumns(data, activeFilter) : null;

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
          className="flex gap-4 overflow-x-auto pb-6"
          style={{ minHeight: '400px' }}
        >
          {COLUMN_ORDER.map((col) => (
            <KanbanColumn
              key={col}
              title={col}
              tasks={grouped[col]}
              onRefresh={mutate}
              onAction={runTaskAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
