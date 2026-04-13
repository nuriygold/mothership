'use client';

export const FILTERS = ['All', 'Today', 'This Week', 'By Bot', 'By Priority'] as const;
export type TaskFilter = (typeof FILTERS)[number];

interface TasksFiltersProps {
  activeFilter: TaskFilter;
  onFilter: (f: TaskFilter) => void;
}

export function TasksFilters({ activeFilter, onFilter }: TasksFiltersProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
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
      <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        <span><strong style={{ color: 'var(--foreground)' }}>Start</strong> = begin now</span>
        <span><strong style={{ color: 'var(--foreground)' }}>Defer</strong> = push to backlog</span>
      </div>
    </div>
  );
}
