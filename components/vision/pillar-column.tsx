'use client';

import { Plus } from 'lucide-react';
import type { V2VisionPillar, V2VisionItem } from '@/lib/v2/types';
import { PillarHeader } from './pillar-header';
import { VisionItemCard } from './vision-item-card';
import { PILLAR_COLORS } from './pillar-colors';

interface PillarColumnProps {
  pillar: V2VisionPillar;
  onItemClick: (item: V2VisionItem) => void;
  onAddItem: (pillarId: string) => void;
  visionMode?: boolean;
}

export function PillarColumn({ pillar, onItemClick, onAddItem, visionMode = false }: PillarColumnProps) {
  const colors = PILLAR_COLORS[pillar.color];

  return (
    <div
      className="flex flex-col rounded-3xl flex-shrink-0"
      style={{
        minWidth: '240px',
        maxWidth: '280px',
        width: '260px',
        border: `1px solid ${colors.border}`,
      }}
    >
      <PillarHeader pillar={pillar} />

      {/* Items */}
      <div
        className="flex flex-col gap-2 p-3 flex-1"
        style={{ background: 'var(--background)', borderRadius: '0 0 1.5rem 1.5rem' }}
      >
        {pillar.items.length === 0 && (
          <div
            className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-8 px-3 text-center"
            style={{ borderColor: colors.border }}
          >
            <span className="text-2xl mb-2">{pillar.emoji ?? '✨'}</span>
            <span className="text-xs" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
              Add your first goal
            </span>
          </div>
        )}

        {pillar.items.map((item) => (
          <VisionItemCard
            key={item.id}
            item={item}
            pillarColor={pillar.color}
            onClick={() => onItemClick(item)}
            visionMode={visionMode}
          />
        ))}

        {/* Add item button */}
        <button
          onClick={() => onAddItem(pillar.id)}
          className="flex items-center justify-center gap-1.5 w-full rounded-2xl py-2.5 text-xs font-medium transition-all duration-200 mt-1"
          style={{
            color: colors.text,
            background: colors.bg,
            border: `1px dashed ${colors.border}`,
            opacity: 0.75,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.75')}
        >
          <Plus className="w-3.5 h-3.5" />
          Add goal
        </button>
      </div>
    </div>
  );
}
