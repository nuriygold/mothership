'use client';

interface LinkedBadgeProps {
  type: 'campaign' | 'finance_plan' | 'task';
  count: number;
  onClick?: () => void;
}

const CONFIG = {
  campaign:     { icon: '▶', singular: 'campaign',   plural: 'campaigns'    },
  finance_plan: { icon: '📈', singular: 'plan',       plural: 'plans'        },
  task:         { icon: '✓',  singular: 'task',       plural: 'tasks'        },
};

export function LinkedBadge({ type, count, onClick }: LinkedBadgeProps) {
  if (count === 0) return null;
  const { icon, singular, plural } = CONFIG[type];
  const label = `${count} ${count !== 1 ? plural : singular}`;

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
