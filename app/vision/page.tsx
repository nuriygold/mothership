'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Plus, RefreshCw, Sparkles, LayoutList } from 'lucide-react';
import { SlashCommandSheet } from '@/components/ui/slash-command-sheet';

const VISION_COMMANDS = [
  { cmd: '/vision', args: '<item>',  desc: 'Add item to vision board' },
  { cmd: '/add',    args: '<title>', desc: 'Add task to task pool' },
  { cmd: '/buy',    args: '<item>',  desc: 'Add item to shopping list' },
];
import type { V2VisionBoardFeed, V2VisionItem, V2VisionPillar } from '@/lib/v2/types';
import { PillarColumn } from '@/components/vision/pillar-column';
import { BoardSummaryBar } from '@/components/vision/board-summary-bar';
import { ItemDetailDrawer } from '@/components/vision/item-detail-drawer';
import { AddItemModal } from '@/components/vision/add-item-modal';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to load vision board');
  return json;
};

export default function VisionPage() {
  const { data, isLoading, error, mutate } = useSWR<V2VisionBoardFeed>(
    '/api/v2/vision/overview',
    fetcher,
    { refreshInterval: 30_000 }
  );

  const [selectedItem, setSelectedItem] = useState<V2VisionItem | null>(null);
  const [selectedItemPillar, setSelectedItemPillar] = useState<V2VisionPillar | null>(null);
  const [addingToPillarId, setAddingToPillarId] = useState<string | null>(null);
  const [addingToPillarLabel, setAddingToPillarLabel] = useState('');
  const [visionMode, setVisionMode] = useState(false);

  // Persist mode preference
  useEffect(() => {
    const saved = localStorage.getItem('vision-board-mode');
    if (saved === 'vision') setVisionMode(true);
  }, []);

  function toggleMode() {
    const next = !visionMode;
    setVisionMode(next);
    localStorage.setItem('vision-board-mode', next ? 'vision' : 'ops');
  }

  function handleItemClick(item: V2VisionItem, pillar: V2VisionPillar) {
    setSelectedItem(item);
    setSelectedItemPillar(pillar);
  }

  function handleCloseDrawer() {
    setSelectedItem(null);
    setSelectedItemPillar(null);
  }

  function handleAddItem(pillarId: string) {
    const pillar = data?.pillars.find((p) => p.id === pillarId);
    setAddingToPillarId(pillarId);
    setAddingToPillarLabel(pillar?.label ?? 'this pillar');
  }

  function handleCloseModal() {
    setAddingToPillarId(null);
    setAddingToPillarLabel('');
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <VisionPageHeader onRefresh={() => mutate()} />
        <div
          className="rounded-3xl p-6 text-sm"
          style={{ background: 'var(--muted)', border: '1px solid var(--card-border, rgba(100,130,200,0.18))' }}
        >
          <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>
            Vision Board unavailable
          </p>
          <p style={{ color: 'var(--foreground)', opacity: 0.55 }}>
            {error?.message ?? 'Could not load the vision board.'} The database migration may need to be applied:{' '}
            <code className="rounded px-1" style={{ background: 'rgba(0,0,0,0.08)', fontSize: '11px' }}>
              npx prisma migrate deploy
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <VisionPageHeader onRefresh={() => mutate()} />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-3xl flex-shrink-0 animate-pulse"
              style={{
                minWidth: '240px',
                width: '260px',
                height: '360px',
                background: 'var(--muted)',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <VisionPageHeader title={data.title} onRefresh={() => mutate()} visionMode={visionMode} onToggleMode={toggleMode} />

      <BoardSummaryBar summary={data.summary} />

      {/* Board — horizontal scroll */}
      <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: '400px' }}>
        {data.pillars.map((pillar) => (
          <PillarColumn
            key={pillar.id}
            pillar={pillar}
            onItemClick={(item) => handleItemClick(item, pillar)}
            onAddItem={handleAddItem}
            visionMode={visionMode}
          />
        ))}

        {/* + Add Pillar */}
        <AddPillarButton onCreated={() => mutate()} />
      </div>

      {/* Item detail drawer */}
      {selectedItem && selectedItemPillar && (
        <ItemDetailDrawer
          item={selectedItem}
          pillar={selectedItemPillar}
          onClose={handleCloseDrawer}
          onUpdated={() => {
            mutate();
            // Re-find the updated item after refresh so the drawer reflects new data
            handleCloseDrawer();
          }}
        />
      )}

      {/* Add item modal */}
      {addingToPillarId && (
        <AddItemModal
          pillarId={addingToPillarId}
          pillarLabel={addingToPillarLabel}
          onClose={handleCloseModal}
          onCreated={() => {
            mutate();
            handleCloseModal();
          }}
        />
      )}
    </div>
  );
}

function VisionPageHeader({
  title = 'My Vision',
  onRefresh,
  visionMode = false,
  onToggleMode = () => {},
}: {
  title?: string;
  onRefresh: () => void;
  visionMode?: boolean;
  onToggleMode?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-1">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>
          {title}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--foreground)', opacity: 0.45 }}>
          Your north star — everything else serves this.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Vision / Ops toggle */}
        <div
          className="flex items-center rounded-full p-1 gap-0.5"
          style={{ background: 'var(--muted)', border: '1px solid var(--card-border)' }}
        >
          <button
            onClick={() => visionMode && onToggleMode()}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150"
            style={{
              background: !visionMode ? 'var(--card)' : 'transparent',
              color: 'var(--foreground)',
              opacity: !visionMode ? 1 : 0.5,
              boxShadow: !visionMode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <LayoutList className="w-3.5 h-3.5" />
            Ops
          </button>
          <button
            onClick={() => !visionMode && onToggleMode()}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-150"
            style={{
              background: visionMode ? 'var(--card)' : 'transparent',
              color: 'var(--foreground)',
              opacity: visionMode ? 1 : 0.5,
              boxShadow: visionMode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Vision
          </button>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ background: 'var(--muted)', color: 'var(--foreground)', opacity: 0.7 }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
        <SlashCommandSheet commands={VISION_COMMANDS} label="vision" />
      </div>
    </div>
  );
}

function AddPillarButton({ onCreated }: { onCreated: () => void }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v2/vision/pillars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (res.ok) {
        setLabel('');
        setAdding(false);
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  }

  if (adding) {
    return (
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl flex-shrink-0 flex flex-col p-4 gap-3"
        style={{
          minWidth: '200px',
          width: '220px',
          border: '2px dashed var(--card-border)',
        }}
      >
        <input
          autoFocus
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Pillar name…"
          className="rounded-xl px-3 py-2 text-sm outline-none"
          style={{
            background: 'var(--muted)',
            border: '1px solid var(--card-border)',
            color: 'var(--foreground)',
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="flex-1 rounded-full py-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !label.trim()}
            className="flex-1 rounded-full py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            {saving ? '…' : 'Add'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      onClick={() => setAdding(true)}
      className="rounded-3xl flex-shrink-0 flex flex-col items-center justify-center gap-2 transition-opacity hover:opacity-60"
      style={{
        minWidth: '120px',
        width: '140px',
        minHeight: '200px',
        border: '2px dashed var(--card-border)',
        color: 'var(--foreground)',
        opacity: 0.35,
      }}
    >
      <Plus className="w-5 h-5" />
      <span className="text-xs font-medium">Add pillar</span>
    </button>
  );
}
