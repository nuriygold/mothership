'use client';

import type { KanbanColumnKey } from './kanban-column';

interface TasksSummaryBarProps {
  tracked:  number;
  active:   number;
  blocked:  number;
  queued:   number;
  done:     number;
  onStatusClick?: (col: KanbanColumnKey) => void;
}

export function TasksSummaryBar({ tracked, active, blocked, queued, done, onStatusClick }: TasksSummaryBarProps) {
  return (
    <div
      className="rounded-2xl px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {/* Tracked — no column target, plain span */}
      <span style={{ color: 'var(--foreground)' }}>
        <strong>{tracked}</strong>{' '}
        <span style={{ color: 'var(--muted-foreground)' }}>tracked</span>
      </span>

      {/* Active — scrolls to Active column */}
      <StatChip
        count={active}
        label="active"
        dotColor="var(--color-cyan)"
        onClick={onStatusClick ? () => onStatusClick('Active') : undefined}
      />

      {/* Blocked — scrolls to Blocked column */}
      <StatChip
        count={blocked}
        label="blocked"
        dotColor="#E53E3E"
        onClick={onStatusClick ? () => onStatusClick('Blocked') : undefined}
      />

      {/* Queued — scrolls to Waiting column */}
      <StatChip
        count={queued}
        label="queued"
        dotColor="var(--muted-foreground)"
        onClick={onStatusClick ? () => onStatusClick('Waiting') : undefined}
      />

      {/* Done — scrolls to Done column */}
      <StatChip
        count={done}
        label="done"
        dotColor="var(--color-mint-text)"
        onClick={onStatusClick ? () => onStatusClick('Done') : undefined}
      />
    </div>
  );
}

// ─── Internal chip ─────────────────────────────────────────────────────────────

interface StatChipProps {
  count:     number;
  label:     string;
  dotColor:  string;
  onClick?:  () => void;
}

function StatChip({ count, label, dotColor, onClick }: StatChipProps) {
  const inner = (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <strong style={{ color: 'var(--foreground)' }}>{count}</strong>
      <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
    </span>
  );

  if (!onClick) return inner;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-1 -mx-1 transition-opacity hover:opacity-70"
      title={`Scroll to ${label} column`}
      style={{ background: 'transparent' }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <strong style={{ color: 'var(--foreground)' }}>{count}</strong>
      <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
    </button>
  );
}
