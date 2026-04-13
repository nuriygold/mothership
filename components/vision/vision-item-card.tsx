'use client';

import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { DraggableAttributes } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { V2VisionItem, VisionPillarColor, VisionItemStatus } from '@/lib/v2/types';
import { ProgressRing } from './progress-ring';
import { LinkedBadge } from './linked-badge';
import { PILLAR_COLORS } from './pillar-colors';

const STATUS_LABELS: Record<VisionItemStatus, { label: string; dotColor: string }> = {
  DREAMING: { label: 'Dreaming', dotColor: 'rgba(100,130,200,0.5)' },
  ACTIVE:   { label: 'Active',   dotColor: '#00D9FF' },
  ACHIEVED: { label: 'Achieved', dotColor: '#0FC48A' },
  ON_HOLD:  { label: 'On Hold',  dotColor: '#F6C90E' },
};

interface VisionItemCardProps {
  item: V2VisionItem;
  pillarColor: VisionPillarColor;
  onClick: () => void;
  visionMode?: boolean;
  dragHandleProps?: { listeners: SyntheticListenerMap | undefined; attributes: DraggableAttributes };
}

export function VisionItemCard({ item, pillarColor, onClick, visionMode = false, dragHandleProps }: VisionItemCardProps) {
  const colors = PILLAR_COLORS[pillarColor];
  const statusMeta = STATUS_LABELS[item.status];
  const hasImage = Boolean(item.imageUrl);

  // ── Vision mode: image-first, details on hover ────────────────────────────
  if (visionMode) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-xl group relative"
        style={{ aspectRatio: '4/3', minHeight: '160px' }}
      >
        {/* Background: image or pillar color */}
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl!}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: colors.bg }}
          >
            {item.imageEmoji && <span className="text-4xl">{item.imageEmoji}</span>}
          </div>
        )}

        {/* Always-visible: title strip at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 px-3 py-2.5"
          style={{
            background: hasImage
              ? 'linear-gradient(transparent, rgba(0,0,0,0.72))'
              : `linear-gradient(transparent, ${colors.bg}ee)`,
          }}
        >
          <p
            className="text-sm font-semibold leading-snug line-clamp-1"
            style={{ color: hasImage ? '#fff' : colors.text }}
          >
            {item.title}
          </p>
        </div>

        {/* Hover overlay: slides in with full details */}
        <div
          className="absolute inset-0 flex flex-col justify-end px-3 py-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            background: hasImage
              ? 'linear-gradient(transparent 10%, rgba(0,0,0,0.82))'
              : `linear-gradient(transparent 10%, ${colors.accent}cc)`,
          }}
        >
          <p
            className="text-sm font-semibold leading-snug mb-1"
            style={{ color: '#fff' }}
          >
            {item.title}
          </p>

          {item.description && (
            <p className="text-xs leading-relaxed line-clamp-2 mb-2" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {item.description}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status */}
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: statusMeta.dotColor }} />
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {statusMeta.label}
              </span>
            </span>

            {/* Progress */}
            {item.overallProgressPercent > 0 && (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {item.overallProgressPercent}%
              </span>
            )}

            {/* Linked counts */}
            {item.linkedCampaigns.length > 0 && (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                ▶ {item.linkedCampaigns.length}
              </span>
            )}
            {item.linkedFinancePlans.length > 0 && (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                📈 {item.linkedFinancePlans.length}
              </span>
            )}
            {item.linkedTasks.length > 0 && (
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                ✓ {item.linkedTasks.length}
              </span>
            )}
          </div>

          {item.targetDate && (
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {new Date(item.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Progress ring — top right, always visible */}
        {item.overallProgressPercent > 0 && (
          <div className="absolute top-2 right-2">
            <ProgressRing percent={item.overallProgressPercent} size={32} strokeWidth={2.5} color="#fff" />
          </div>
        )}

        {/* Drag handle — top left, visible on hover */}
        {dragHandleProps && (
          <div
            className="absolute top-2 left-2 opacity-0 group-hover:opacity-70 transition-opacity cursor-grab active:cursor-grabbing z-10 rounded p-0.5"
            style={{ background: 'rgba(0,0,0,0.25)' }}
            {...dragHandleProps.listeners}
            {...dragHandleProps.attributes}
          >
            <GripVertical className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </button>
    );
  }

  // ── Ops mode: current detailed layout ────────────────────────────────────
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl transition-all duration-200 hover:shadow-md group overflow-hidden relative"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
        borderLeft: hasImage ? '1px solid var(--card-border)' : `4px solid ${colors.accent}`,
      }}
    >
      {/* Drag handle — top left, visible on hover */}
      {dragHandleProps && (
        <div
          className="absolute top-2 left-2 opacity-0 group-hover:opacity-50 transition-opacity cursor-grab active:cursor-grabbing z-10 rounded p-0.5"
          {...dragHandleProps.listeners}
          {...dragHandleProps.attributes}
        >
          <GripVertical className="w-3.5 h-3.5" style={{ color: 'var(--foreground)' }} />
        </div>
      )}
      {hasImage && (
        <div className="relative w-full" style={{ height: '140px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.imageUrl!} alt={item.title} className="w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(to bottom, transparent 40%, ${colors.accent}33 100%)` }}
          />
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: colors.accent }} />
          <div className="absolute top-2 right-2">
            <ProgressRing percent={item.overallProgressPercent} size={36} strokeWidth={3} color="#fff" />
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            {item.imageEmoji && <span className="text-lg leading-none mr-1">{item.imageEmoji}</span>}
            <span className="font-medium text-sm leading-snug" style={{ color: 'var(--foreground)' }}>
              {item.title}
            </span>
          </div>
          {!hasImage && (
            <ProgressRing percent={item.overallProgressPercent} size={40} strokeWidth={3.5} color={colors.accent} />
          )}
        </div>

        {item.description && (
          <p className="text-xs leading-relaxed mb-2 line-clamp-2" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
            {item.description}
          </p>
        )}

        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ background: statusMeta.dotColor }} />
          <span className="text-[11px]" style={{ color: 'var(--foreground)', opacity: 0.55 }}>
            {statusMeta.label}
            {item.overallProgressPercent > 0 && ` · ${item.overallProgressPercent}%`}
          </span>
        </div>

        {(item.linkedCampaigns.length > 0 || item.linkedFinancePlans.length > 0 || item.linkedTasks.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
            <LinkedBadge type="campaign" count={item.linkedCampaigns.length} />
            <LinkedBadge type="finance_plan" count={item.linkedFinancePlans.length} />
            <LinkedBadge type="task" count={item.linkedTasks.length} />
          </div>
        )}

        {item.targetDate && (
          <p className="text-[11px] mt-2" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
            Target:{' '}
            {new Date(item.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </button>
  );
}
