'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Clock, GitBranch, ChevronDown, AlertTriangle } from 'lucide-react';
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

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  Active:  { bg: 'var(--color-cyan)',    color: '#0A0E1A', label: 'Active'  },
  Queued:  { bg: 'var(--muted)',         color: 'var(--muted-foreground)', label: 'Queued'  },
  Blocked: { bg: '#FF5C5C22',           color: '#E53E3E', label: 'Blocked' },
  Done:    { bg: 'var(--color-mint)',    color: 'var(--color-mint-text)', label: 'Done'   },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: '#E53E3E',
  high:     '#E53E3E',
  medium:   'var(--color-purple)',
  low:      'var(--muted-foreground)',
};

const LEFT_BORDER: Record<string, string> = {
  Active:  'var(--color-purple)',
  Queued:  'var(--color-purple)',
  Blocked: '#E53E3E',
  Done:    'var(--color-cyan)',
};

const BOT_COLORS: Record<string, { bg: string; color: string }> = {
  Adrian:  { bg: 'var(--color-cyan)',    color: '#0A0E1A' },
  Ruby:    { bg: 'var(--color-lavender)', color: 'var(--color-lavender-text)' },
  Emerald: { bg: 'var(--color-mint)',    color: 'var(--color-mint-text)' },
  Adobe:   { bg: 'var(--color-lemon)',   color: 'var(--color-lemon-text)' },
};

const FILTERS = ['All', 'Today', 'This Week', 'By Bot', 'By Priority'];

function TaskCard({ task, onRefresh }: { task: V2TaskItem; onRefresh: () => Promise<any> }) {
  const badge = STATUS_BADGE[task.status] ?? STATUS_BADGE.Queued;
  const botStyle = BOT_COLORS[task.metadata.assignedBot] ?? { bg: 'var(--muted)', color: 'var(--muted-foreground)' };
  const leftBorder = LEFT_BORDER[task.status] ?? 'var(--border)';
  const dotColor = PRIORITY_DOT[task.metadata.priority] ?? 'var(--muted-foreground)';

  const shortId = task.taskId.length > 10
    ? task.taskId.slice(0, 7).toUpperCase()
    : task.taskId.toUpperCase();

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${leftBorder}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Top row: ID + status badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {shortId}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: badge.bg, color: badge.color }}
        >
          {task.status === 'Blocked' && <AlertTriangle className="inline w-2.5 h-2.5 mr-0.5 -mt-px" />}
          {badge.label}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{task.title}</p>

      {/* Metadata */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {task.metadata.timeframe === 'today' ? 'Today' : task.metadata.timeframe}
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          {task.metadata.department}
        </span>
        <span
          className="rounded-full px-2 py-0.5 font-semibold text-[10px]"
          style={{ background: botStyle.bg, color: botStyle.color }}
        >
          {task.metadata.assignedBot}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: dotColor }} />
          {task.metadata.priority.charAt(0).toUpperCase() + task.metadata.priority.slice(1)}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        {task.actions.map((action) => (
          <button
            key={action.label}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{
              background: action.label === 'Start' ? 'var(--color-cyan)' : 'var(--muted)',
              color: action.label === 'Start' ? '#0A0E1A' : 'var(--muted-foreground)',
              border: action.label === 'Start' ? 'none' : '1px solid var(--border)',
            }}
            onClick={async () => {
              const actionKey = action.label.toLowerCase() as 'start' | 'defer' | 'complete' | 'unblock';
              await runTaskAction(task.taskId, actionKey);
              await onRefresh();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, count, subtitle }: { title: string; count: number; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>{title}</h2>
      <span
        className="rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-semibold"
        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
      >
        {count}
      </span>
      <ChevronDown className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
      <span className="text-xs ml-1" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</span>
    </div>
  );
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function applyFilter(tasks: V2TaskItem[], filter: string): V2TaskItem[] {
  switch (filter) {
    case 'Today':
      return tasks.filter((t) => t.metadata.timeframe === 'today' || t.metadata.timeframe === 'Today');
    case 'This Week':
      return tasks.filter((t) => ['today', 'Today', 'this_week', 'week', 'This Week'].includes(t.metadata.timeframe));
    case 'By Priority':
      return [...tasks].sort((a, b) =>
        (PRIORITY_ORDER[a.metadata.priority] ?? 4) - (PRIORITY_ORDER[b.metadata.priority] ?? 4)
      );
    case 'By Bot':
      return [...tasks].sort((a, b) => a.metadata.assignedBot.localeCompare(b.metadata.assignedBot));
    default:
      return tasks;
  }
}

export default function TasksPage() {
  const { data, mutate, isLoading } = useSWR<V2TasksFeed>('/api/v2/tasks', fetcher, { refreshInterval: 30000 });
  const [activeFilter, setActiveFilter] = useState('All');

  const counters = data?.counters;
  const queued = counters ? counters.tracked - counters.active - counters.blocked : 0;

  const allTasks = data ? {
    active:  applyFilter(data.active,  activeFilter),
    today:   applyFilter(data.today,   activeFilter),
    backlog: applyFilter(data.backlog, activeFilter),
  } : null;

  // For "By Bot" — flatten + group by bot name
  const botGroups = activeFilter === 'By Bot' && allTasks
    ? Object.entries(
        [...allTasks.active, ...allTasks.today, ...allTasks.backlog].reduce<Record<string, V2TaskItem[]>>((acc, t) => {
          (acc[t.metadata.assignedBot] ??= []).push(t);
          return acc;
        }, {})
      )
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Tasks</h1>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Structured queue with priorities and status</p>
      </div>

      {/* Stats bar */}
      <div
        className="rounded-2xl px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <span style={{ color: 'var(--foreground)' }}>
          <strong>{counters?.tracked ?? 0}</strong> <span style={{ color: 'var(--muted-foreground)' }}>tracked</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-cyan)' }} />
          <strong style={{ color: 'var(--foreground)' }}>{counters?.active ?? 0}</strong>
          <span style={{ color: 'var(--muted-foreground)' }}>active</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: '#E53E3E' }} />
          <strong style={{ color: 'var(--foreground)' }}>{counters?.blocked ?? 0}</strong>
          <span style={{ color: 'var(--muted-foreground)' }}>blocked</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--muted-foreground)' }} />
          <strong style={{ color: 'var(--foreground)' }}>{queued}</strong>
          <span style={{ color: 'var(--muted-foreground)' }}>queued</span>
        </span>
      </div>

      {/* Filter chips */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="rounded-full px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                background: activeFilter === f ? 'var(--color-cyan)' : 'var(--card)',
                color: activeFilter === f ? '#0A0E1A' : 'var(--muted-foreground)',
                border: activeFilter === f ? 'none' : '1px solid var(--border)',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        {/* Legend for Start / Defer */}
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <span><strong style={{ color: 'var(--foreground)' }}>Start</strong> = begin now</span>
          <span><strong style={{ color: 'var(--foreground)' }}>Defer</strong> = push to backlog</span>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading tasks...</p>
      )}

      {!isLoading && allTasks && (
        <>
          {/* By Bot grouped view */}
          {botGroups ? (
            botGroups.map(([bot, tasks]) => (
              <div key={bot}>
                <SectionHeader title={bot} count={tasks.length} subtitle="Assigned tasks" />
                <div className="space-y-3">
                  {tasks.map((task) => <TaskCard key={task.taskId} task={task} onRefresh={mutate} />)}
                </div>
              </div>
            ))
          ) : (
            <>
              {allTasks.active.length > 0 && (
                <div>
                  <SectionHeader title="Active" count={allTasks.active.length} subtitle="Running right now" />
                  <div className="space-y-3">
                    {allTasks.active.map((task) => <TaskCard key={task.taskId} task={task} onRefresh={mutate} />)}
                  </div>
                </div>
              )}
              {allTasks.today.length > 0 && (
                <div>
                  <SectionHeader title="Today" count={allTasks.today.length} subtitle="Assigned for today, not yet started" />
                  <div className="space-y-3">
                    {allTasks.today.map((task) => <TaskCard key={task.taskId} task={task} onRefresh={mutate} />)}
                  </div>
                </div>
              )}
              {allTasks.backlog.length > 0 && (
                <div>
                  <SectionHeader title="Backlog" count={allTasks.backlog.length} subtitle="Queued for later" />
                  <div className="space-y-3">
                    {allTasks.backlog.map((task) => <TaskCard key={task.taskId} task={task} onRefresh={mutate} />)}
                  </div>
                </div>
              )}
              {allTasks.active.length === 0 && allTasks.today.length === 0 && allTasks.backlog.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  {activeFilter !== 'All' ? `No tasks match the "${activeFilter}" filter.` : 'No tasks found.'}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
