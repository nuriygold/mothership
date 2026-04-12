'use client';

import type { V2VisionItem, VisionPillarColor, VisionItemStatus } from '@/lib/v2/types';
import { ProgressRing } from './progress-ring';
import { LinkedBadge } from './linked-badge';
import { PILLAR_COLORS } from './pillar-colors';

const STATUS_LABELS: Record<VisionItemStatus, { label: string; dotColor: string }> = {
  DREAMING: { label: 'Dreaming', dotColor: 'rgba(100,130,200,0.5)' },
  ACTIVE: { label: 'Active', dotColor: '#00D9FF' },
  ACHIEVED: { label: 'Achieved', dotColor: '#0FC48A' },
  ON_HOLD: { label: 'On Hold', dotColor: '#F6C90E' },
};

interface VisionItemCardProps {
  item: V2VisionItem;
  pillarColor: VisionPillarColor;
  onClick: () => void;
}

export function VisionItemCard({ item, pillarColor, onClick }: VisionItemCardProps) {
  const colors = PILLAR_COLORS[pillarColor];
  const statusMeta = STATUS_LABELS[item.status];

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-all duration-200 hover:shadow-md group"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
        borderLeft: `4px solid ${colors.accent}`,
      }}
    >
      {/* Top row: title + progress ring */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          {item.imageEmoji && (
            <span className="text-lg leading-none mr-1">{item.imageEmoji}</span>
          )}
          <span
            className="font-medium text-sm leading-snug"
            style={{ color: 'var(--foreground)' }}
          >
            {item.title}
          </span>
        </div>
        <ProgressRing
          percent={item.overallProgressPercent}
          size={40}
          strokeWidth={3.5}
          color={colors.accent}
        />
      </div>

      {/* Description */}
      {item.description && (
        <p
          className="text-xs leading-relaxed mb-2 line-clamp-2"
          style={{ color: 'var(--foreground)', opacity: 0.6 }}
        >
          {item.description}
        </p>
      )}

      {/* Status pill */}
      <div className="flex items-center gap-1 mb-2">
        <span
          className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
          style={{ background: statusMeta.dotColor }}
        />
        <span className="text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.55 }}>
          {statusMeta.label}
          {item.overallProgressPercent > 0 && ` · ${item.overallProgressPercent}%`}
        </span>
      </div>

      {/* Linked badges */}
      {(item.linkedCampaigns.length > 0 || item.linkedFinancePlans.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-1">
          <LinkedBadge type="campaign" count={item.linkedCampaigns.length} />
          <LinkedBadge type="finance_plan" count={item.linkedFinancePlans.length} />
        </div>
      )}

      {/* Target date */}
      {item.targetDate && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
          Target: {new Date(item.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </p>
      )}
    </button>
  );
}
