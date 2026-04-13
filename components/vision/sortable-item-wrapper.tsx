'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { V2VisionItem, VisionPillarColor } from '@/lib/v2/types';
import { VisionItemCard } from './vision-item-card';

interface SortableItemWrapperProps {
  item: V2VisionItem;
  pillarColor: VisionPillarColor;
  onClick: () => void;
  visionMode?: boolean;
}

export function SortableItemWrapper({ item, pillarColor, onClick, visionMode }: SortableItemWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      <VisionItemCard
        item={item}
        pillarColor={pillarColor}
        onClick={onClick}
        visionMode={visionMode}
        dragHandleProps={{ listeners, attributes }}
      />
    </div>
  );
}
