'use client';

import type { V2TaskItem } from '@/lib/v2/types';
import { TaskCard } from './task-card';

export type KanbanColumnKey = 'Active' | 'Waiting' | 'Blocked' | 'Backlog' | 'Done';

interface ColumnColors {
  bg: string;
  border: string;
  accent: string;
  headerBg: string;
  headerText: string;
}

export const KANBAN_COLUMN_COLORS: Record<KanbanColumnKey, ColumnColors> = {
  Active: {
    bg:         'rgba(0,217,255,0.04)',
    border:     'rgba(0,217,255,0.22)',
    accent:     '#00D9FF',
    headerBg:   'rgba(0,217,255,0.10)',
    headerText: '#00D9FF',
  },
  Waiting: {
    bg:         'rgba(123,104,238,0.04)',
    border:     'rgba(123,104,238,0.22)',
    accent:     '#7B68EE',
    headerBg:   'rgba(123,104,238,0.10)',
    headerText: '#7B68EE',
  },
  Blocked: {
    bg:         'rgba(229,62,62,0.04)',
    border:     'rgba(229,62,62,0.22)',
    accent:     '#E53E3E',
    headerBg:   'rgba(229,62,62,0.09)',
    headerText: '#E53E3E',
  },
  Backlog: {
    bg:         'var(--muted)',
    border:     'var(--border)',
    accent:     'var(--muted-foreground)',
    headerBg:   'var(--muted)',
    headerText: 'var(--muted-foreground)',
  },
  Done: {
    bg:         'rgba(15,196,138,0.04)',
    border:     'rgba(15,196,138,0.22)',
    accent:     '#0FC48A',
    headerBg:   'rgba(15,196,138,0.10)',
    headerText: '#0FC48A',
  },
};

const COLUMN_SUBTITLE: Record<KanbanColumnKey, string> = {
  Active:  'Running now',
  Waiting: 'Queued for today',
  Blocked: 'Need intervention',
  Backlog: 'Queued for later',
  Done:    'Completed',
};

const COLUMN_EMPTY_HINT: Record<KanbanColumnKey, string> = {
  Active:  'No active tasks',
  Waiting: 'Nothing queued for today',
  Blocked: 'No blockers — clear skies',
  Backlog: 'Backlog is empty',
  Done:    'No completed tasks',
};

interface KanbanColumnProps {
  title: KanbanColumnKey;
  tasks: V2TaskItem[];
  /** IDs optimistically marked as vision-board-linked before next server refresh */
  visionLinkedIds: Set<string>;
  onTakeAction: (task: V2TaskItem) => void;
}

export function KanbanColumn({ title, tasks, visionLinkedIds, onTakeAction }: KanbanColumnProps) {
  const colors = KANBAN_COLUMN_COLORS[title];

  return (
    <div
      data-column={title}
      className="flex flex-col rounded-3xl overflow-hidden w-full md:flex-shrink-0 md:w-[272px] md:min-w-[240px] md:max-w-[300px]"
      style={{
        border:     `1px solid ${colors.border}`,
        background: colors.bg,
      }}
    >
      {/* Sticky column header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 flex-shrink-0"
        style={{
          background:  colors.headerBg,
          borderBottom: `1px solid ${colors.border}`,
          position:    'sticky',
          top:         0,
          zIndex:      10,
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: colors.headerText }}
          >
            {title}
          </span>
          <span
            className="text-[10px]"
            style={{ color: colors.accent, opacity: 0.65 }}
          >
            {COLUMN_SUBTITLE[title]}
          </span>
        </div>
        <span
          className="rounded-full min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold tabular-nums flex-shrink-0 px-1.5"
          style={{
            background: colors.accent + '22',
            color:      colors.accent,
          }}
        >
          {tasks.length}
        </span>
      </div>

      {/* Card list — scrolls independently */}
      <div
        className="flex flex-col gap-2.5 p-3 overflow-y-auto flex-1"
        style={{ maxHeight: 'calc(100vh - 260px)' }}
      >
        {tasks.length === 0 ? (
          <div
            className="rounded-2xl border-2 border-dashed flex items-center justify-center py-10 text-center"
            style={{ borderColor: colors.border }}
          >
            <span className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.35 }}>
              {COLUMN_EMPTY_HINT[title]}
            </span>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              visionBoardLinked={visionLinkedIds.has(task.taskId)}
              onTakeAction={onTakeAction}
            />
          ))
        )}
      </div>
    </div>
  );
}
