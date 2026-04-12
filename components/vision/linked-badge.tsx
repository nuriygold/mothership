'use client';

interface LinkedBadgeProps {
  type: 'campaign' | 'finance_plan';
  count: number;
  onClick?: () => void;
}

export function LinkedBadge({ type, count, onClick }: LinkedBadgeProps) {
  if (count === 0) return null;
  const label = type === 'campaign'
    ? `${count} campaign${count !== 1 ? 's' : ''}`
    : `${count} plan${count !== 1 ? 's' : ''}`;
  const icon = type === 'campaign' ? '▶' : '📈';

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80"
      style={{
        background: 'rgba(100,130,200,0.10)',
        color: 'var(--foreground)',
        opacity: 0.75,
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
