'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { VisionItemStatus } from '@/lib/v2/types';

interface AddItemModalProps {
  pillarId: string;
  pillarLabel: string;
  onClose: () => void;
  onCreated: () => void;
}

const STATUS_OPTIONS: VisionItemStatus[] = ['DREAMING', 'ACTIVE', 'ACHIEVED', 'ON_HOLD'];
const STATUS_LABELS: Record<VisionItemStatus, string> = {
  DREAMING: 'Dreaming',
  ACTIVE: 'Active',
  ACHIEVED: 'Achieved',
  ON_HOLD: 'On Hold',
};

const COMMON_EMOJIS = ['🎯', '🚀', '💡', '🌟', '🏆', '💪', '🌈', '🔥', '✨', '🎨', '💰', '🏠', '❤️', '🌱'];

export function AddItemModal({ pillarId, pillarLabel, onClose, onCreated }: AddItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<VisionItemStatus>('DREAMING');
  const [imageEmoji, setImageEmoji] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/vision/pillars/${pillarId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          imageEmoji: imageEmoji || undefined,
          targetDate: targetDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.message ?? 'Failed to create item');
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
        style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>
            Add goal to {pillarLabel}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: 'var(--muted)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Emoji picker row */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Icon (optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setImageEmoji(imageEmoji === e ? '' : e)}
                  className="w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={{
                    background: imageEmoji === e ? 'var(--color-cyan)' : 'var(--muted)',
                    transform: imageEmoji === e ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Goal *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to achieve?"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--muted)',
                border: '1px solid var(--card-border)',
                color: 'var(--foreground)',
              }}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why does this matter to you?"
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{
                background: 'var(--muted)',
                border: '1px solid var(--card-border)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          {/* Status + Target Date row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VisionItemStatus)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
                Target date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
            >
              {saving ? 'Saving…' : 'Add goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
