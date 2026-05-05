'use client';

import type { V2VisionPillar } from '@/lib/v2/types';
import { PILLAR_COLORS } from './pillar-colors';

interface PillarHeaderProps {
  pillar: V2VisionPillar;
}

export function PillarHeader({ pillar }: PillarHeaderProps) {
  const colors = PILLAR_COLORS[pillar.color];

  return (
    <div
      className="rounded-t-3xl px-4 pt-4 pb-3"
      style={{ background: colors.bg }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {pillar.emoji && (
            <span className="text-2xl leading-none">{pillar.emoji}</span>
          )}
          <span className="font-semibold text-sm leading-tight" style={{ color: colors.text }}>
            {pillar.label}
          </span>
        </div>
        <span
          className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0"
          style={{ background: colors.border, color: colors.text }}
        >
          {pillar.itemCount}
        </span>
      </div>
      {(pillar.activeCount > 0 || pillar.achievedCount > 0) && (
        <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: colors.text, opacity: 0.8 }}>
          {pillar.activeCount > 0 && (
            <span className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: colors.accent }}
              />
              {pillar.activeCount} active
            </span>
          )}
          {pillar.achievedCount > 0 && (
            <span className="flex items-center gap-1">
              <span>✓</span>
              {pillar.achievedCount} achieved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
