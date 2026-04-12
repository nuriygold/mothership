'use client';

import type { V2VisionBoardFeed } from '@/lib/v2/types';

interface BoardSummaryBarProps {
  summary: V2VisionBoardFeed['summary'];
}

export function BoardSummaryBar({ summary }: BoardSummaryBarProps) {
  const stats = [
    { label: 'total', value: summary.totalItems },
    { label: 'active', value: summary.activeItems, color: '#00D9FF' },
    { label: 'achieved', value: summary.achievedItems, color: '#0FC48A' },
    { label: 'dreaming', value: summary.dreamingItems },
    { label: 'campaigns', value: summary.totalLinkedCampaigns },
    { label: 'plans', value: summary.totalLinkedPlans },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 mb-5 text-sm"
      style={{ color: 'var(--foreground)', opacity: 0.65 }}
    >
      {stats.map((s, i) => (
        <span key={s.label} className="flex items-center gap-1.5">
          {i > 0 && <span style={{ opacity: 0.3 }}>·</span>}
          <span
            className="font-semibold tabular-nums"
            style={{ color: s.color ?? 'var(--foreground)', opacity: s.color ? 1 : 0.8 }}
          >
            {s.value}
          </span>
          <span>{s.label}</span>
        </span>
      ))}
    </div>
  );
}
