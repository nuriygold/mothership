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
    bg:         'rgba(0,194,168,0.05)',
    border:     'rgba(0,194,168,0.25)',
    accent:     '#00C2A8',
    headerBg:   'rgba(0,194,168,0.12)',
    headerText: '#00C2A8',
  },
  Waiting: {
    bg:         'rgba(244,163,71,0.05)',
    border:     'rgba(244,163,71,0.25)',
    accent:     '#F4A347',
    headerBg:   'rgba(244,163,71,0.12)',
    headerText: '#F4A347',
  },
  Blocked: {
    bg:         'rgba(255,107,107,0.05)',
    border:     'rgba(255,107,107,0.22)',
    accent:     '#FF6B6B',
    headerBg:   'rgba(255,107,107,0.10)',
    headerText: '#FF6B6B',
  },
  Backlog: {
    bg:         'var(--muted)',
    border:     'var(--border)',
    accent:     'var(--muted-foreground)',
    headerBg:   'var(--muted)',
    headerText: 'var(--muted-foreground)',
  },
  Done: {
    bg:         'rgba(61,190,140,0.05)',
    border:     'rgba(61,190,140,0.22)',
    accent:     '#3DBE8C',
    headerBg:   'rgba(61,190,140,0.11)',
    headerText: '#3DBE8C',
  },
};

const COLUMN_SUBTITLE: Record<KanbanColumnKey, string> = {
  Active:  'In the water',
  Waiting: 'On deck',
  Blocked: 'Hit a reef',
  Backlog: 'Back at the villa',
  Done:    'Made it to shore',
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
  /** Opens the detail modal when a card body is clicked */
  onCardClick: (task: V2TaskItem) => void;
  /** When true, cards show checkboxes for multi-select */
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
}

export function KanbanColumn({ title, tasks, visionLinkedIds, onTakeAction, onCardClick, selectMode, selectedIds, onToggleSelect }: KanbanColumnProps) {
  const colors = KANBAN_COLUMN_COLORS[title];

  return (
    <div
      data-column={title}
      className="flex flex-col flex-shrink-0 rounded-3xl overflow-hidden"
      style={{
        width:     '272px',
        minWidth:  '240px',
        maxWidth:  '300px',
        border:    `1px solid ${colors.border}`,
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

      {/* Card list — scrolls independently within the bounded column height */}
      <div
        className="flex flex-col gap-2.5 p-3 overflow-y-auto flex-1 min-h-0"
        data-droppable="true"
        data-column-key={title}
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
              onCardClick={onCardClick}
              selectMode={selectMode}
              selected={selectedIds?.has(task.taskId)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
        {/* Placeholder slot for future DnD drop indicator */}
        <div data-drop-placeholder="true" className="hidden" />
      </div>
    </div>
  );
}
