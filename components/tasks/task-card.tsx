'use client';

import { Clock, GitBranch, AlertTriangle, Layers, Zap, GripVertical, CheckSquare, Square } from 'lucide-react';
import type { V2TaskItem } from '@/lib/v2/types';

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  Active:  { bg: 'var(--color-cyan)',   color: '#0A0E1A',                 label: 'Active'  },
  Queued:  { bg: 'var(--muted)',        color: 'var(--muted-foreground)', label: 'Queued'  },
  Blocked: { bg: '#FF5C5C22',          color: '#E53E3E',                  label: 'Blocked' },
  Done:    { bg: 'var(--color-mint)',   color: 'var(--color-mint-text)',   label: 'Done'    },
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
  Anchor:  { bg: 'var(--color-purple)',   color: '#FFFFFF' },
};

const LEFT_BORDER: Record<string, string> = {
  Active:  'var(--color-cyan)',
  Queued:  'var(--color-purple)',
  Blocked: '#E53E3E',
  Done:    'var(--color-mint)',
};

interface TaskCardProps {
  task: V2TaskItem;
  /** Pass true if optimistically vision-board-linked (before next server refresh) */
  visionBoardLinked?: boolean;
  onTakeAction: (task: V2TaskItem) => void;
  /** Opens the detail modal when the card body is clicked */
  onCardClick?: (task: V2TaskItem) => void;
  /** When true, a checkbox appears and card clicks toggle selection */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (taskId: string) => void;
}

export function TaskCard({ task, visionBoardLinked, onTakeAction, onCardClick, selectMode, selected, onToggleSelect }: TaskCardProps) {
  const badge      = STATUS_BADGE[task.status] ?? STATUS_BADGE.Queued;
  const botStyle   = BOT_COLORS[task.metadata.assignedBot] ?? { bg: 'var(--muted)', color: 'var(--muted-foreground)' };
  const leftBorder = LEFT_BORDER[task.status] ?? 'var(--border)';
  const dotColor   = PRIORITY_DOT[task.metadata.priority] ?? 'var(--muted-foreground)';
  const isVisionLinked = visionBoardLinked || task.visionBoardLinked;

  const shortId = task.taskId.length > 10
    ? task.taskId.slice(0, 7).toUpperCase()
    : task.taskId.toUpperCase();

  const handleCardClick = () => {
    if (selectMode) {
      onToggleSelect?.(task.taskId);
    } else {
      onCardClick?.(task);
    }
  };

  return (
    <div
      data-task-id={task.taskId}
      data-draggable="true"
      className="group rounded-2xl p-3.5 flex flex-col gap-2.5 transition-shadow hover:shadow-md"
      style={{
        background:  selected ? 'rgba(0,217,255,0.08)' : 'var(--card)',
        border:      selected ? '1px solid rgba(0,217,255,0.5)' : '1px solid var(--border)',
        borderLeft:  `3px solid ${leftBorder}`,
        boxShadow:   selected ? '0 0 0 2px rgba(0,217,255,0.15)' : '0 1px 4px rgba(0,0,0,0.04)',
        cursor:      'pointer',
      }}
      onClick={handleCardClick}
    >
      {/* Row 1: ID + status + vision board badge */}
      <div className="flex items-center gap-2 flex-wrap">
        {selectMode && (
          <span
            className="flex-shrink-0"
            style={{ color: selected ? 'var(--color-cyan)' : 'var(--muted-foreground)' }}
            onClick={(e) => { e.stopPropagation(); onToggleSelect?.(task.taskId); }}
          >
            {selected
              ? <CheckSquare className="w-4 h-4" />
              : <Square className="w-4 h-4" />
            }
          </span>
        )}
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

        {/* Vision Board marker — shows when label is applied */}
        {isVisionLinked && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 flex-shrink-0"
            style={{ background: '#69f49d33', color: '#0A5C3E', border: '1px solid #69f49d66' }}
            title="Tagged: domain: vision board"
          >
            <Layers className="w-2.5 h-2.5" />
            Vision Board
          </span>
        )}

        {task.visionItemId && (
          <a
            href="/vision"
            className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 hover:opacity-80 transition-opacity"
            style={{ background: '#E4E0FF', color: '#4A3DAA' }}
            onClick={(e) => e.stopPropagation()}
          >
            Vision ↗
          </a>
        )}

        {/* Drag handle — visible on hover, prepared for DnD wiring */}
        <GripVertical
          data-drag-handle="true"
          className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-30 transition-opacity"
          style={{ color: 'var(--muted-foreground)', cursor: 'grab' }}
        />
      </div>

      {/* Row 2: Title */}
      <p className="text-sm font-medium leading-snug" style={{ color: 'var(--foreground)' }}>
        {task.title}
      </p>

      {/* Row 3: Compact metadata chips */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: botStyle.bg, color: botStyle.color }}
        >
          {task.metadata.assignedBot}
        </span>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: dotColor }} />
          {task.metadata.priority.charAt(0).toUpperCase() + task.metadata.priority.slice(1)}
        </span>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <Clock className="w-3 h-3 flex-shrink-0" />
          {task.metadata.timeframe === 'today' ? 'Today' : task.metadata.timeframe}
        </span>
        <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          <GitBranch className="w-3 h-3 flex-shrink-0" />
          {task.metadata.department}
        </span>
      </div>

      {/* Row 4: Take Action button — hidden in select mode */}
      {!selectMode && (
        <div className="pt-0.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onTakeAction(task); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: 'var(--color-cyan)',
              color: '#0A0E1A',
            }}
          >
            <Zap className="w-3 h-3" />
            Take Action
          </button>
        </div>
      )}
    </div>
  );
}
