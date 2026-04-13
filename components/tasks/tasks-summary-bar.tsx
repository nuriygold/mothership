'use client';

interface TasksSummaryBarProps {
  tracked: number;
  active: number;
  blocked: number;
  queued: number;
}

export function TasksSummaryBar({ tracked, active, blocked, queued }: TasksSummaryBarProps) {
  return (
    <div
      className="rounded-2xl px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <span style={{ color: 'var(--foreground)' }}>
        <strong>{tracked}</strong>{' '}
        <span style={{ color: 'var(--muted-foreground)' }}>tracked</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--color-cyan)' }} />
        <strong style={{ color: 'var(--foreground)' }}>{active}</strong>
        <span style={{ color: 'var(--muted-foreground)' }}>active</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: '#E53E3E' }} />
        <strong style={{ color: 'var(--foreground)' }}>{blocked}</strong>
        <span style={{ color: 'var(--muted-foreground)' }}>blocked</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: 'var(--muted-foreground)' }} />
        <strong style={{ color: 'var(--foreground)' }}>{queued}</strong>
        <span style={{ color: 'var(--muted-foreground)' }}>queued</span>
      </span>
    </div>
  );
}
