'use client';

import { Clock, GitBranch, AlertTriangle } from 'lucide-react';
import type { V2TaskItem } from '@/lib/v2/types';

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  Active:  { bg: 'var(--color-cyan)',   color: '#0A0E1A',                      label: 'Active'  },
  Queued:  { bg: 'var(--muted)',        color: 'var(--muted-foreground)',       label: 'Queued'  },
  Blocked: { bg: '#FF5C5C22',          color: '#E53E3E',                       label: 'Blocked' },
  Done:    { bg: 'var(--color-mint)',   color: 'var(--color-mint-text)',        label: 'Done'    },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: '#E53E3E',
  high:     '#E53E3E',
  medium:   'var(--color-purple)',
  low:      'var(--muted-foreground)',
};

const BOT_COLORS: Record<string, { bg: string; color: string }> = {
  Adrian:  { bg: 'var(--color-cyan)',     color: '#0A0E1A' },
  Ruby:    { bg: 'var(--color-lavender)', color: 'var(--color-lavender-text)' },
  Emerald: { bg: 'var(--color-mint)',     color: 'var(--color-mint-text)' },
  Adobe:   { bg: 'var(--color-lemon)',    color: 'var(--color-lemon-text)' },
};

const LEFT_BORDER: Record<string, string> = {
  Active:  'var(--color-cyan)',
  Queued:  'var(--color-purple)',
  Blocked: '#E53E3E',
  Done:    'var(--color-mint)',
};

interface TaskCardProps {
  task: V2TaskItem;
  onRefresh: () => Promise<unknown>;
  onAction: (taskId: string, action: 'start' | 'defer' | 'complete' | 'unblock') => Promise<void>;
}

export function TaskCard({ task, onRefresh, onAction }: TaskCardProps) {
  const badge      = STATUS_BADGE[task.status] ?? STATUS_BADGE.Queued;
  const botStyle   = BOT_COLORS[task.metadata.assignedBot] ?? { bg: 'var(--muted)', color: 'var(--muted-foreground)' };
  const leftBorder = LEFT_BORDER[task.status] ?? 'var(--border)';
  const dotColor   = PRIORITY_DOT[task.metadata.priority] ?? 'var(--muted-foreground)';

  const shortId = task.taskId.length > 10
    ? task.taskId.slice(0, 7).toUpperCase()
    : task.taskId.toUpperCase();

  return (
    <div
      data-task-id={task.taskId}
      className="rounded-2xl p-3.5 flex flex-col gap-2.5 transition-shadow hover:shadow-md"
      style={{
        background:   'var(--card)',
        border:       '1px solid var(--border)',
        borderLeft:   `3px solid ${leftBorder}`,
        boxShadow:    '0 1px 4px rgba(0,0,0,0.04)',
        cursor:       'default',
      }}
    >
      {/* Row 1: ID + status badge */}
      <div className="flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium flex-shrink-0"
          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {shortId}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-0.5 flex-shrink-0"
          style={{ background: badge.bg, color: badge.color }}
        >
          {task.status === 'Blocked' && <AlertTriangle className="w-2.5 h-2.5" />}
          {badge.label}
        </span>
        {task.visionItemId && (
          <a
            href="/vision"
            className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 hover:opacity-80 transition-opacity"
            style={{ background: '#E4E0FF', color: '#4A3DAA' }}
          >
            Vision ↗
          </a>
        )}
      </div>

      {/* Row 2: Title */}
      <p className="text-sm font-medium leading-snug" style={{ color: 'var(--foreground)' }}>
        {task.title}
      </p>

      {/* Row 3: Compact metadata chips */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {/* Bot */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: botStyle.bg, color: botStyle.color }}
        >
          {task.metadata.assignedBot}
        </span>

        {/* Priority */}
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: dotColor }} />
          {task.metadata.priority.charAt(0).toUpperCase() + task.metadata.priority.slice(1)}
        </span>

        {/* Timeframe */}
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <Clock className="w-3 h-3 flex-shrink-0" />
          {task.metadata.timeframe === 'today' ? 'Today' : task.metadata.timeframe}
        </span>

        {/* Department */}
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <GitBranch className="w-3 h-3 flex-shrink-0" />
          {task.metadata.department}
        </span>
      </div>

      {/* Row 4: Actions */}
      {task.actions.length > 0 && (
        <div className="flex gap-2 pt-0.5 border-t" style={{ borderColor: 'var(--border)' }}>
          {task.actions.map((action) => (
            <button
              key={action.label}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{
                background: action.label === 'Start' ? 'var(--color-cyan)' : 'var(--muted)',
                color:      action.label === 'Start' ? '#0A0E1A' : 'var(--muted-foreground)',
                border:     action.label === 'Start' ? 'none' : '1px solid var(--border)',
              }}
              onClick={async () => {
                const key = action.label.toLowerCase() as 'start' | 'defer' | 'complete' | 'unblock';
                await onAction(task.taskId, key);
                await onRefresh();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
