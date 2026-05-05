'use client';

import { useEffect, useRef } from 'react';
import {
  X,
  Zap,
  Clock,
  GitBranch,
  AlertTriangle,
  Layers,
  CalendarDays,
  ExternalLink,
} from 'lucide-react';
import type { V2TaskItem } from '@/lib/v2/types';

// ─── Style maps (mirrors task-card.tsx) ───────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  Active:  { bg: 'var(--color-cyan)',   color: '#0A0E1A',                 label: 'Active'  },
  Queued:  { bg: 'var(--muted)',        color: 'var(--muted-foreground)', label: 'Queued'  },
  Blocked: { bg: '#FF5C5C22',          color: '#E53E3E',                  label: 'Blocked' },
  Done:    { bg: 'var(--color-mint)',   color: 'var(--color-mint-text)',   label: 'Done'    },
};

const LEFT_BORDER: Record<string, string> = {
  Active:  'var(--color-cyan)',
  Queued:  'var(--color-purple)',
  Blocked: '#E53E3E',
  Done:    'var(--color-mint)',
};

const BOT_COLORS: Record<string, { bg: string; color: string }> = {
  Adrian:  { bg: 'var(--color-cyan)',     color: '#0A0E1A' },
  Ruby:    { bg: 'var(--color-lavender)', color: 'var(--color-lavender-text)' },
  Emerald: { bg: 'var(--color-mint)',     color: 'var(--color-mint-text)' },
  Adobe:   { bg: 'var(--color-lemon)',    color: 'var(--color-lemon-text)' },
  Anchor:  { bg: 'var(--color-purple)',   color: '#FFFFFF' },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: '#E53E3E',
  high:     '#E53E3E',
  medium:   'var(--color-purple)',
  low:      'var(--muted-foreground)',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface TaskDetailModalProps {
  task: V2TaskItem;
  /** Pass true if optimistically vision-board-linked before next server refresh */
  visionBoardLinked?: boolean;
  onClose: () => void;
  /** Called when the user clicks "Take Action" — caller should close this modal first */
  onTakeAction: (task: V2TaskItem) => void;
}

export function TaskDetailModal({ task, visionBoardLinked, onClose, onTakeAction }: TaskDetailModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Focus the close button on mount; restore previous focus on unmount
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    return () => {
      (previousFocusRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const badge       = STATUS_BADGE[task.status] ?? STATUS_BADGE.Queued;
  const leftBorder  = LEFT_BORDER[task.status]  ?? 'var(--border)';
  const botStyle    = BOT_COLORS[task.metadata.assignedBot] ?? { bg: 'var(--muted)', color: 'var(--muted-foreground)' };
  const dotColor    = PRIORITY_DOT[task.metadata.priority]  ?? 'var(--muted-foreground)';
  const isVisionLinked = visionBoardLinked || task.visionBoardLinked;
  const shortId = task.taskId.length > 10 ? task.taskId.slice(0, 7).toUpperCase() : task.taskId.toUpperCase();

  const formattedDue = task.metadata.dueAtISO
    ? new Date(task.metadata.dueAtISO).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', paddingTop: '10vh' }}
      onClick={onClose}
    >
      {/* Panel — stop backdrop-click from closing when clicking inside */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Task detail: ${task.title}`}
        className="relative w-full max-w-md mx-4 rounded-3xl overflow-hidden flex flex-col"
        style={{
          background:   'var(--card)',
          border:       '1px solid var(--border)',
          borderLeft:   `4px solid ${leftBorder}`,
          boxShadow:    '0 24px 64px rgba(0,0,0,0.25)',
          maxHeight:    '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-2 px-5 py-4 flex-shrink-0 flex-wrap"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {/* ID badge */}
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium flex-shrink-0"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            {shortId}
          </span>

          {/* Status badge */}
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-0.5 flex-shrink-0"
            style={{ background: badge.bg, color: badge.color }}
          >
            {task.status === 'Blocked' && <AlertTriangle className="w-2.5 h-2.5" />}
            {badge.label}
          </span>

          {/* Vision Board badge */}
          {isVisionLinked && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1 flex-shrink-0"
              style={{ background: '#69f49d33', color: '#0A5C3E', border: '1px solid #69f49d66' }}
            >
              <Layers className="w-2.5 h-2.5" />
              Vision Board
            </span>
          )}

          {/* Close button */}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="ml-auto rounded-full w-7 h-7 flex items-center justify-center transition-opacity hover:opacity-70 flex-shrink-0"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
            aria-label="Close task detail"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex flex-col gap-4 px-5 py-4 overflow-y-auto flex-1 min-h-0">
          {/* Title */}
          <h2 className="text-xl font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
            {task.title}
          </h2>

          {/* 2-column metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
            {/* Bot */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Bot
              </span>
              <span
                className="rounded-full px-2.5 py-1 font-semibold self-start"
                style={{ background: botStyle.bg, color: botStyle.color }}
              >
                {task.metadata.assignedBot}
              </span>
            </div>

            {/* Priority */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Priority
              </span>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                {task.metadata.priority.charAt(0).toUpperCase() + task.metadata.priority.slice(1)}
              </span>
            </div>

            {/* Timeframe */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Timeframe
              </span>
              <span className="flex items-center gap-1" style={{ color: 'var(--foreground)' }}>
                <Clock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                {task.metadata.timeframe === 'today' ? 'Today' : task.metadata.timeframe}
              </span>
            </div>

            {/* Department */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                Department
              </span>
              <span className="flex items-center gap-1" style={{ color: 'var(--foreground)' }}>
                <GitBranch className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
                {task.metadata.department}
              </span>
            </div>
          </div>

          {/* Due date (only if present) */}
          {formattedDue && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--foreground)' }}>
              <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--muted-foreground)' }} />
              <span>
                <span style={{ color: 'var(--muted-foreground)' }}>Due </span>
                {formattedDue}
              </span>
            </div>
          )}

          {/* Source */}
          {task.metadata.source && (
            <div className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
              <span className="text-[10px] uppercase tracking-wide block mb-0.5">Source</span>
              <span style={{ color: 'var(--foreground)' }}>{task.metadata.source}</span>
            </div>
          )}

          {/* Vision Board link (if task is linked to a vision item) */}
          {task.visionItemId && (
            <a
              href="/vision"
              className="flex items-center gap-1.5 text-[12px] font-medium hover:opacity-80 transition-opacity self-start"
              style={{ color: '#4A3DAA' }}
            >
              <ExternalLink className="w-3 h-3" />
              View on Vision Board
            </a>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => onTakeAction(task)}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            <Zap className="w-4 h-4" />
            Take Action
          </button>
        </div>
      </div>
    </div>
  );
}
