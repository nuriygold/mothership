'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { V2VisionPillar, V2VisionItem } from '@/lib/v2/types';
import { PillarHeader } from './pillar-header';
import { SortableItemWrapper } from './sortable-item-wrapper';
import { PILLAR_COLORS } from './pillar-colors';

interface PillarColumnProps {
  pillar: V2VisionPillar;
  onItemClick: (item: V2VisionItem) => void;
  onAddItem: (pillarId: string) => void;
  visionMode?: boolean;
  dragHandleProps?: { listeners: SyntheticListenerMap | undefined; attributes: DraggableAttributes };
  onItemsReordered: (pillarId: string, orderedIds: string[]) => void;
}

export function PillarColumn({
  pillar,
  onItemClick,
  onAddItem,
  visionMode = false,
  dragHandleProps,
  onItemsReordered,
}: PillarColumnProps) {
  const colors = PILLAR_COLORS[pillar.color];
  const [localItems, setLocalItems] = useState<V2VisionItem[]>(pillar.items);
  const isDraggingItem = useRef(false);

  // Sync from SWR re-fetches, but not during an active drag
  useEffect(() => {
    if (!isDraggingItem.current) {
      setLocalItems(pillar.items);
    }
  }, [pillar.items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleItemDragEnd = useCallback(
    (event: DragEndEvent) => {
      isDraggingItem.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = localItems.findIndex((i) => i.id === active.id);
      const newIndex = localItems.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(localItems, oldIndex, newIndex);
      setLocalItems(reordered);
      onItemsReordered(pillar.id, reordered.map((i) => i.id));
    },
    [localItems, onItemsReordered, pillar.id]
  );

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
      <PillarHeader pillar={pillar} dragHandleProps={dragHandleProps} />

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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => { isDraggingItem.current = true; }}
          onDragEnd={handleItemDragEnd}
          onDragCancel={() => { isDraggingItem.current = false; }}
        >
          <SortableContext items={localItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {localItems.map((item) => (
              <SortableItemWrapper
                key={item.id}
                item={item}
                pillarColor={pillar.color}
                onClick={() => onItemClick(item)}
                visionMode={visionMode}
              />
            ))}
          </SortableContext>
        </DndContext>

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
