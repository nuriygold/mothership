'use client';

import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import type { V2TaskItem, V2TasksFeed, V2DashboardPriorityItem } from '@/lib/v2/types';
import type { KanbanColumnKey } from '@/components/tasks/kanban-column';
import { KanbanColumn } from '@/components/tasks/kanban-column';
import { TasksSummaryBar } from '@/components/tasks/tasks-summary-bar';
import { TasksFilters } from '@/components/tasks/tasks-filters';
import type { TaskTimeFilter, TaskSort } from '@/components/tasks/tasks-filters';
import { TakeActionModal } from '@/components/today/take-action-modal';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMN_ORDER: KanbanColumnKey[] = ['Active', 'Waiting', 'Blocked', 'Backlog', 'Done'];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const TODAY_FRAMES = new Set(['today', 'Today']);

// ─── Data helpers ─────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Convert a V2TaskItem into the shape TakeActionModal expects. */
function toActionItem(task: V2TaskItem): V2DashboardPriorityItem {
  return {
    id:           task.taskId,
    taskId:       task.taskId,
    title:        task.title,
    source:       task.metadata.department,
    actionWebhook: `/api/v2/tasks/${task.taskId}`,
    assignedBot:  task.metadata.assignedBot,
    dueAt:        task.metadata.dueAtISO,
    taskStatus:   task.status,
  };
}

function applyTimeFilter(tasks: V2TaskItem[], filter: TaskTimeFilter): V2TaskItem[] {
  if (filter === 'Today')
    return tasks.filter((t) => TODAY_FRAMES.has(t.metadata.timeframe));
  if (filter === 'This Week')
    return tasks.filter((t) =>
      TODAY_FRAMES.has(t.metadata.timeframe) ||
      ['this_week', 'week', 'This Week'].includes(t.metadata.timeframe)
    );
  return tasks;
}

function applySort(tasks: V2TaskItem[], sort: TaskSort): V2TaskItem[] {
  if (sort === 'By Priority')
    return [...tasks].sort(
      (a, b) =>
        (PRIORITY_ORDER[a.metadata.priority] ?? 4) -
        (PRIORITY_ORDER[b.metadata.priority] ?? 4)
    );
  if (sort === 'By Bot')
    return [...tasks].sort((a, b) =>
      a.metadata.assignedBot.localeCompare(b.metadata.assignedBot)
    );
  if (sort === 'By Due Date')
    return [...tasks].sort((a, b) => {
      if (!a.metadata.dueAtISO) return 1;
      if (!b.metadata.dueAtISO) return -1;
      return a.metadata.dueAtISO.localeCompare(b.metadata.dueAtISO);
    });
  return tasks;
}

function groupIntoColumns(
  data: V2TasksFeed,
  timeFilter: TaskTimeFilter,
  sort: TaskSort,
): Record<KanbanColumnKey, V2TaskItem[]> {
  const all = applySort(
    applyTimeFilter([...data.active, ...data.today, ...data.backlog], timeFilter),
    sort,
  );
  return {
    Active:  all.filter((t) => t.status === 'Active'),
    Waiting: all.filter((t) => t.status === 'Queued' && TODAY_FRAMES.has(t.metadata.timeframe)),
    Blocked: all.filter((t) => t.status === 'Blocked'),
    Backlog: all.filter((t) => t.status === 'Queued' && !TODAY_FRAMES.has(t.metadata.timeframe)),
    Done:    all.filter((t) => t.status === 'Done'),
  };
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-6 flex-1 min-h-0">
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

  const [timeFilter, setTimeFilter] = useState<TaskTimeFilter>('All');
  const [sort, setSort]             = useState<TaskSort>('Default');

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [actionModalTask, setActionModalTask] = useState<V2TaskItem | null>(null);
  const [detailModalTask, setDetailModalTask] = useState<V2TaskItem | null>(null);

  // ── Optimistic vision-board tracking ────────────────────────────────────────
  const [visionLinkedIds, setVisionLinkedIds] = useState<Set<string>>(new Set());

  // ── Board ref for summary-bar scroll navigation ──────────────────────────────
  const boardRef = useRef<HTMLDivElement>(null);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const counters = data?.counters;
  const done     = counters
    ? counters.tracked - counters.active - counters.blocked - (counters.queued ?? 0)
    : 0;
  const grouped  = data ? groupIntoColumns(data, timeFilter, sort) : null;

  // ── Summary-bar column scroll ────────────────────────────────────────────────
  const handleStatusClick = useCallback((col: KanbanColumnKey) => {
    const el = boardRef.current?.querySelector(`[data-column="${col}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, []);

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
    setVisionLinkedIds((prev) => new Set([...prev, taskId]));
    void mutate();
  }, [mutate]);

  return (
    <div className="flex flex-col gap-5 min-h-0" style={{ height: 'calc(100dvh - var(--app-chrome-h))' }}>
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
        queued={counters?.queued   ?? 0}
        done={done}
        onStatusClick={handleStatusClick}
      />

      {/* Filter + sort chips */}
      <TasksFilters
        activeFilter={timeFilter}
        activeSort={sort}
        onFilter={setTimeFilter}
        onSort={setSort}
      />

      {/* Board */}
      {isLoading || !grouped ? (
        <KanbanSkeleton />
      ) : (
        <div
          ref={boardRef}
          className="flex gap-4 overflow-x-auto pb-6 flex-1 min-h-0"
          data-dnd-board="true"
        >
          {COLUMN_ORDER.map((col) => (
            <KanbanColumn
              key={col}
              title={col}
              tasks={grouped[col]}
              visionLinkedIds={visionLinkedIds}
              onTakeAction={setActionModalTask}
              onCardClick={setDetailModalTask}
            />
          ))}
        </div>
      )}

      {/* Task Detail modal */}
      {detailModalTask && (
        <TaskDetailModal
          task={detailModalTask}
          visionBoardLinked={visionLinkedIds.has(detailModalTask.taskId)}
          onClose={() => setDetailModalTask(null)}
          onTakeAction={(task) => {
            setDetailModalTask(null);
            setActionModalTask(task);
          }}
        />
      )}

      {/* Take Action modal */}
      {actionModalTask && (
        <TakeActionModal
          item={toActionItem(actionModalTask)}
          taskStatus={actionModalTask.status}
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
