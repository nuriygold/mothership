'use client';

export type TaskTimeFilter = 'All' | 'Today' | 'This Week';
export type TaskSort       = 'Default' | 'By Priority' | 'By Bot' | 'By Due Date';

export const TIME_FILTERS: TaskTimeFilter[] = ['All', 'Today', 'This Week'];
export const SORT_OPTIONS: TaskSort[]       = ['Default', 'By Priority', 'By Bot', 'By Due Date'];

interface TasksFiltersProps {
  activeFilter: TaskTimeFilter;
  activeSort:   TaskSort;
  onFilter: (f: TaskTimeFilter) => void;
  onSort:   (s: TaskSort) => void;
}

export function TasksFilters({ activeFilter, activeSort, onFilter, onSort }: TasksFiltersProps) {
  return (
    <div className="flex items-center flex-wrap gap-2">
      {/* ── Timeframe filter chips ── */}
      <div className="flex gap-2 flex-wrap">
        {TIME_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: activeFilter === f ? 'var(--color-cyan)' : 'var(--card)',
              color:      activeFilter === f ? '#0A0E1A' : 'var(--muted-foreground)',
              border:     activeFilter === f ? 'none' : '1px solid var(--border)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="w-px h-5 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* ── Sort chips ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>
          Sort
        </span>
        {SORT_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSort(s)}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-all"
            style={{
              background: activeSort === s ? 'var(--color-purple)' : 'var(--card)',
              color:      activeSort === s ? '#FFFFFF' : 'var(--muted-foreground)',
              border:     activeSort === s ? 'none' : '1px solid var(--border)',
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
