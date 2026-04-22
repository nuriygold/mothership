'use client';

import { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import { Search, X, MousePointerClick, CheckCheck, ShieldX, UserRound, XCircle, ChevronDown } from 'lucide-react';
import type { V2TaskItem, V2TasksFeed, V2DashboardPriorityItem } from '@/lib/v2/types';
import type { KanbanColumnKey } from '@/components/tasks/kanban-column';
import { KanbanColumn, KANBAN_COLUMN_COLORS } from '@/components/tasks/kanban-column';
import { TasksSummaryBar } from '@/components/tasks/tasks-summary-bar';
import { TasksFilters } from '@/components/tasks/tasks-filters';
import type { TaskTimeFilter, TaskSort } from '@/components/tasks/tasks-filters';
import { TakeActionModal } from '@/components/today/take-action-modal';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { SlashCommandSheet } from '@/components/ui/slash-command-sheet';
import { TaskCard } from '@/components/tasks/task-card';

const TASK_COMMANDS = [
  { cmd: '/open',     desc: 'List open tasks' },
  { cmd: '/create',  args: '<title>',             desc: 'Create a new task' },
  { cmd: '/add',     args: '<title>',             desc: 'Add item to task pool' },
  { cmd: '/done',    args: '<taskId>',            desc: 'Mark task complete' },
  { cmd: '/block',   args: '<taskId>',            desc: 'Mark task blocked' },
  { cmd: '/progress',args: '<taskId>',            desc: 'Mark task in progress' },
  { cmd: '/priority',args: '<taskId> <level>',    desc: 'Set priority (LOW–CRITICAL)' },
  { cmd: '/assign',  args: '<taskId> <login>',    desc: 'Assign task to someone' },
  { cmd: '/reassign',args: '<taskId> <login>',    desc: 'Reassign task' },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMN_ORDER: KanbanColumnKey[] = ['Active', 'Waiting', 'Blocked', 'Backlog', 'Done'];

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const TODAY_FRAMES = new Set(['today', 'Today']);

const BOT_OPTIONS: { label: string; login: string }[] = [
  { label: 'Drake',          login: 'adrian'  },
  { label: 'Drizzy',         login: 'ruby'    },
  { label: 'Champagne Papi', login: 'emerald' },
  { label: 'Aubrey Graham',  login: 'adobe'   },
  { label: '6 God',          login: 'anchor'  },
];

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

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // ── Multi-select state ────────────────────────────────────────────────────────
  const [selectMode, setSelectMode]           = useState(false);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);

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

  // Flat list of all visible tasks for search
  const allTasks = grouped
    ? COLUMN_ORDER.flatMap((col) => grouped[col])
    : [];

  const trimmedQuery  = searchQuery.trim().toLowerCase();
  const searchActive  = trimmedQuery.length > 0;
  const searchResults = searchActive
    ? allTasks.filter((t) => t.title.toLowerCase().includes(trimmedQuery))
    : [];

  // Group search results by column for section headers
  const searchResultsByColumn: Partial<Record<KanbanColumnKey, V2TaskItem[]>> = {};
  if (searchActive && grouped) {
    for (const col of COLUMN_ORDER) {
      const hits = grouped[col].filter((t) => t.title.toLowerCase().includes(trimmedQuery));
      if (hits.length > 0) searchResultsByColumn[col] = hits;
    }
  }

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

  // ── Multi-select helpers ──────────────────────────────────────────────────────

  const handleToggleSelect = useCallback((taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const handleToggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
        setAssignDropdownOpen(false);
      }
      return !prev;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkPatch = useCallback(async (body: object) => {
    await Promise.all(
      [...selectedIds].map((id) =>
        fetch(`/api/v2/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    );
    setSelectedIds(new Set());
    void mutate();
  }, [selectedIds, mutate]);

  const handleBulkComplete = useCallback(() => handleBulkPatch({ action: 'complete' }), [handleBulkPatch]);
  const handleBulkBlock    = useCallback(() => handleBulkPatch({ action: 'block' }),    [handleBulkPatch]);
  const handleBulkAssign   = useCallback((ownerLogin: string) => {
    setAssignDropdownOpen(false);
    void handleBulkPatch({ action: 'assign', ownerLogin });
  }, [handleBulkPatch]);

  return (
    <div className="flex flex-col gap-5 min-h-0" style={{ height: 'calc(100dvh - var(--app-chrome-h))' }}>
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
            Tasks
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            Kanban board · priorities and workflow stages at a glance
          </p>
        </div>
        <SlashCommandSheet commands={TASK_COMMANDS} label="tasks" />
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

      {/* Filter + sort chips + Select toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <TasksFilters
          activeFilter={timeFilter}
          activeSort={sort}
          onFilter={setTimeFilter}
          onSort={setSort}
        />

        {/* Divider */}
        <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />

        {/* Select mode toggle */}
        <button
          onClick={handleToggleSelectMode}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
          style={{
            background: selectMode ? 'var(--color-purple)' : 'var(--card)',
            color:      selectMode ? '#FFFFFF' : 'var(--muted-foreground)',
            border:     selectMode ? 'none' : '1px solid var(--border)',
          }}
        >
          <MousePointerClick className="w-3 h-3" />
          {selectMode ? 'Exit Select' : 'Select'}
        </button>
      </div>

      {/* Search bar */}
      <div className="relative flex-shrink-0">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: 'var(--muted-foreground)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tasks by title…"
          className="w-full rounded-2xl pl-9 pr-9 py-2.5 text-sm outline-none transition-all"
          style={{
            background:   'var(--card)',
            border:       searchActive ? '1px solid var(--color-cyan)' : '1px solid var(--border)',
            color:        'var(--foreground)',
            boxShadow:    searchActive ? '0 0 0 2px rgba(0,217,255,0.12)' : 'none',
          }}
        />
        {searchActive && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Board — either search results or full kanban */}
      {isLoading || !grouped ? (
        <KanbanSkeleton />
      ) : searchActive ? (
        /* ── Search results: flat list grouped by status ── */
        <div className="flex-1 min-h-0 overflow-y-auto">
          {searchResults.length === 0 ? (
            <div
              className="flex items-center justify-center py-20 rounded-3xl"
              style={{ border: '1px dashed var(--border)' }}
            >
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                No tasks match &ldquo;{searchQuery}&rdquo;
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-6 pb-6">
              {(Object.entries(searchResultsByColumn) as [KanbanColumnKey, V2TaskItem[]][]).map(([col, tasks]) => {
                const colors = KANBAN_COLUMN_COLORS[col];
                return (
                  <div key={col}>
                    {/* Section header */}
                    <div
                      className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl"
                      style={{ background: colors.headerBg }}
                    >
                      <span className="text-xs font-semibold" style={{ color: colors.headerText }}>
                        {col}
                      </span>
                      <span
                        className="rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold px-1"
                        style={{ background: colors.accent + '22', color: colors.accent }}
                      >
                        {tasks.length}
                      </span>
                    </div>
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                      {tasks.map((task) => (
                        <TaskCard
                          key={task.taskId}
                          task={task}
                          visionBoardLinked={visionLinkedIds.has(task.taskId)}
                          onTakeAction={setActionModalTask}
                          onCardClick={setDetailModalTask}
                          selectMode={selectMode}
                          selected={selectedIds.has(task.taskId)}
                          onToggleSelect={handleToggleSelect}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Normal kanban board ── */
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
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          ))}
        </div>
      )}

      {/* ── Floating bulk action bar ── */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl"
          style={{
            background:  'var(--card)',
            border:      '1px solid var(--border)',
            boxShadow:   '0 8px 40px rgba(0,0,0,0.25)',
            minWidth:    '340px',
          }}
        >
          {/* Count badge */}
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-bold flex-shrink-0"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            {selectedIds.size} selected
          </span>

          {/* Divider */}
          <div className="w-px h-5 flex-shrink-0 mx-1" style={{ background: 'var(--border)' }} />

          {/* Complete all */}
          <button
            onClick={handleBulkComplete}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: 'rgba(15,196,138,0.15)', color: '#0FC48A' }}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Complete all
          </button>

          {/* Mark blocked */}
          <button
            onClick={handleBulkBlock}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-80"
            style={{ background: 'rgba(229,62,62,0.12)', color: '#E53E3E' }}
          >
            <ShieldX className="w-3.5 h-3.5" />
            Mark blocked
          </button>

          {/* Assign to dropdown */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setAssignDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-80"
              style={{ background: 'rgba(123,104,238,0.15)', color: '#7B68EE' }}
            >
              <UserRound className="w-3.5 h-3.5" />
              Assign to…
              <ChevronDown className="w-3 h-3" />
            </button>
            {assignDropdownOpen && (
              <div
                className="absolute bottom-full mb-2 left-0 rounded-xl overflow-hidden shadow-xl z-10"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  minWidth: '160px',
                }}
              >
                {BOT_OPTIONS.map((bot) => (
                  <button
                    key={bot.login}
                    onClick={() => handleBulkAssign(bot.login)}
                    className="w-full text-left px-3 py-2 text-xs hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {bot.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Clear selection */}
          <button
            onClick={handleClearSelection}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs transition-all hover:opacity-70 ml-auto"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <XCircle className="w-3.5 h-3.5" />
            Clear
          </button>
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
