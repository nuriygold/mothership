'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { V2VisionPillar, V2VisionItem } from '@/lib/v2/types';
import { PillarColumn } from './pillar-column';

interface SortablePillarWrapperProps {
  pillar: V2VisionPillar;
  onItemClick: (item: V2VisionItem) => void;
  onAddItem: (pillarId: string) => void;
  visionMode?: boolean;
  onItemsReordered: (pillarId: string, orderedIds: string[]) => void;
}

export function SortablePillarWrapper({
  pillar,
  onItemClick,
  onAddItem,
  visionMode,
  onItemsReordered,
}: SortablePillarWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pillar.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <PillarColumn
        pillar={pillar}
        onItemClick={onItemClick}
        onAddItem={onAddItem}
        visionMode={visionMode}
        dragHandleProps={{ listeners, attributes }}
        onItemsReordered={onItemsReordered}
      />
    </div>
  );
}
